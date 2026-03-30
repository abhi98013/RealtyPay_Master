from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Query, Header, Depends
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, io, json, bcrypt, jwt, requests
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
from typing import Optional, List
from bson import ObjectId

# ─── CONFIG ───
JWT_ALGORITHM = "HS256"
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "realtypay"
storage_key = None

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── CORS ───
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── HELPERS ───
def get_jwt_secret():
    return os.environ["JWT_SECRET"]

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role, "exp": datetime.now(timezone.utc) + timedelta(hours=24), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_role(*roles):
    async def checker(request: Request):
        user = await get_current_user(request)
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker

# ─── OBJECT STORAGE ───
def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        logger.warning("No EMERGENT_LLM_KEY, storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": emergent_key}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("Object storage initialized")
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ─── PYDANTIC MODELS ───
class RegisterInput(BaseModel):
    email: str
    password: str
    name: str
    role: str = "viewer"

class LoginInput(BaseModel):
    email: str
    password: str

class CustomerInput(BaseModel):
    name: str
    phone: str
    email: str = ""
    property_name: str
    unit_no: str
    total_property_value: float
    emi_amount: float
    agreement_start_date: str
    due_date_day: int = 5

class PaymentInput(BaseModel):
    customer_id: str
    month: int
    year: int
    amount_paid: float
    payment_mode: str = "cash"
    reference_number: str = ""
    status: str = "paid"

class BrandInput(BaseModel):
    brand_name: str = ""
    tagline: str = ""
    primary_color: str = "#0052CC"
    accent_color: str = "#10B981"
    footer_text: str = ""
    penalty_rate: float = 1.0
    phone: str = ""

class MessageInput(BaseModel):
    customer_id: str
    message_type: str
    custom_text: str = ""

class BulkMessageInput(BaseModel):
    customer_ids: List[str]
    message_type: str

# ─── STARTUP ───
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.customers.create_index("id", unique=True)
    await db.payments.create_index([("customer_id", 1), ("month", 1), ("year", 1)])
    await db.messages.create_index("customer_id")
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@realtypay.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin", "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
    # Seed brand defaults
    brand = await db.brand_settings.find_one({"id": "default"})
    if not brand:
        await db.brand_settings.insert_one({
            "id": "default", "brand_name": "RealtyPay", "tagline": "Smart Property Payment Management",
            "primary_color": "#0052CC", "accent_color": "#10B981",
            "footer_text": "RealtyPay - Building Dreams Together",
            "penalty_rate": 1.0, "phone": "", "logo_path": "",
            "updated_at": datetime.now(timezone.utc).isoformat()
        })
    # Init storage
    try:
        init_storage()
    except Exception as e:
        logger.warning(f"Storage init skipped: {e}")
    # Write test credentials
    try:
        os.makedirs("/app/memory", exist_ok=True)
        with open("/app/memory/test_credentials.md", "w") as f:
            f.write(f"# Test Credentials\n\n## Admin\n- Email: {admin_email}\n- Password: {admin_password}\n- Role: admin\n\n## Auth Endpoints\n- POST /api/auth/login\n- POST /api/auth/register\n- GET /api/auth/me\n- POST /api/auth/logout\n")
    except Exception:
        pass

@app.on_event("shutdown")
async def shutdown():
    client.close()

# ═══════════════════════════════════════════
#  AUTH ROUTES
# ═══════════════════════════════════════════
@api_router.post("/auth/register")
async def register(inp: RegisterInput, response: Response):
    email = inp.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id, "email": email, "name": inp.name,
        "password_hash": hash_password(inp.password),
        "role": inp.role if inp.role in ["admin", "agent", "viewer"] else "viewer",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    access_token = create_access_token(user_id, email, user_doc["role"])
    refresh_token = create_refresh_token(user_id)
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"id": user_id, "email": email, "name": inp.name, "role": user_doc["role"], "token": access_token}

@api_router.post("/auth/login")
async def login(inp: LoginInput, response: Response):
    email = inp.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    access_token = create_access_token(user["id"], email, user["role"])
    refresh_token = create_refresh_token(user["id"])
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    return {"id": user["id"], "email": email, "name": user["name"], "role": user["role"], "token": access_token}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}

# ═══════════════════════════════════════════
#  BRAND SETTINGS
# ═══════════════════════════════════════════
@api_router.get("/brand")
async def get_brand():
    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0})
    return brand or {"id": "default", "brand_name": "RealtyPay", "primary_color": "#0052CC", "accent_color": "#10B981"}

@api_router.put("/brand")
async def update_brand(inp: BrandInput, request: Request):
    await get_current_user(request)
    update = {k: v for k, v in inp.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.brand_settings.update_one({"id": "default"}, {"$set": update}, upsert=True)
    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0})
    return brand

@api_router.post("/brand/logo")
async def upload_logo(request: Request, file: UploadFile = File(...)):
    await get_current_user(request)
    ext = file.filename.split(".")[-1] if "." in file.filename else "png"
    path = f"{APP_NAME}/logos/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "image/png")
    await db.brand_settings.update_one({"id": "default"}, {"$set": {"logo_path": result["path"], "updated_at": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"path": result["path"]}

@api_router.get("/brand/logo")
async def get_logo():
    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0})
    if not brand or not brand.get("logo_path"):
        raise HTTPException(status_code=404, detail="No logo uploaded")
    data, ct = get_object(brand["logo_path"])
    return Response(content=data, media_type=ct)

# ═══════════════════════════════════════════
#  CUSTOMER MANAGEMENT
# ═══════════════════════════════════════════
@api_router.get("/customers")
async def list_customers(request: Request, search: str = "", property_name: str = ""):
    await get_current_user(request)
    query = {}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"customer_id": {"$regex": search, "$options": "i"}}
        ]
    if property_name:
        query["property_name"] = {"$regex": property_name, "$options": "i"}
    customers = await db.customers.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return customers

@api_router.post("/customers")
async def create_customer(inp: CustomerInput, request: Request):
    user = await get_current_user(request)
    count = await db.customers.count_documents({})
    customer_id = f"CUST-{str(count + 1).zfill(4)}"
    cust_uuid = str(uuid.uuid4())
    doc = {
        "id": cust_uuid, "customer_id": customer_id,
        "name": inp.name, "phone": inp.phone, "email": inp.email,
        "property_name": inp.property_name, "unit_no": inp.unit_no,
        "total_property_value": inp.total_property_value,
        "emi_amount": inp.emi_amount,
        "agreement_start_date": inp.agreement_start_date,
        "due_date_day": inp.due_date_day,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    await db.customers.insert_one(doc)
    # Auto-generate payment slots
    try:
        start = datetime.fromisoformat(inp.agreement_start_date)
    except Exception:
        start = datetime.now(timezone.utc)
    current_year = datetime.now(timezone.utc).year
    for m in range(start.month, 13):
        payment_doc = {
            "id": str(uuid.uuid4()), "customer_id": cust_uuid,
            "month": m, "year": current_year,
            "status": "pending", "emi_amount": inp.emi_amount,
            "amount_paid": 0, "remaining": inp.emi_amount,
            "payment_mode": "", "reference_number": "",
            "penalty_amount": 0, "penalty_days": 0,
            "payment_date": "", "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.payments.insert_one(payment_doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, request: Request):
    await get_current_user(request)
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    payments = await db.payments.find({"customer_id": customer_id}, {"_id": 0}).sort([("year", -1), ("month", -1)]).to_list(100)
    messages = await db.messages.find({"customer_id": customer_id}, {"_id": 0}).sort("sent_at", -1).to_list(100)
    total_paid = sum(p.get("amount_paid", 0) for p in payments)
    total_remaining = sum(p.get("remaining", 0) for p in payments if p["status"] != "paid")
    return {**customer, "payments": payments, "messages": messages, "total_paid": total_paid, "total_remaining": total_remaining}

@api_router.put("/customers/{customer_id}")
async def update_customer(customer_id: str, inp: CustomerInput, request: Request):
    await get_current_user(request)
    update = inp.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.customers.update_one({"id": customer_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    return customer

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, request: Request):
    user = await require_role("admin")(request)
    result = await db.customers.delete_one({"id": customer_id})
    await db.payments.delete_many({"customer_id": customer_id})
    await db.messages.delete_many({"customer_id": customer_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"message": "Customer deleted"}

# ═══════════════════════════════════════════
#  PAYMENT MANAGEMENT
# ═══════════════════════════════════════════
async def check_overdue_payments():
    """Check and mark overdue payments"""
    now = datetime.now(timezone.utc)
    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0})
    penalty_rate = brand.get("penalty_rate", 1.0) if brand else 1.0

    pending = await db.payments.find({"status": "pending"}, {"_id": 0}).to_list(5000)
    for p in pending:
        customer = await db.customers.find_one({"id": p["customer_id"]}, {"_id": 0})
        if not customer:
            continue
        due_day = customer.get("due_date_day", 5)
        try:
            due_date = datetime(p["year"], p["month"], min(due_day, 28), tzinfo=timezone.utc)
        except Exception:
            continue
        if now > due_date:
            days_overdue = (now - due_date).days
            penalty = round(p["emi_amount"] * (penalty_rate / 100) * days_overdue, 2)
            await db.payments.update_one({"id": p["id"]}, {"$set": {
                "status": "overdue", "penalty_amount": penalty, "penalty_days": days_overdue,
                "remaining": p["emi_amount"] - p.get("amount_paid", 0) + penalty,
                "updated_at": now.isoformat()
            }})

@api_router.get("/payments")
async def list_payments(request: Request, month: int = 0, year: int = 0, customer_id: str = "", status: str = ""):
    await get_current_user(request)
    await check_overdue_payments()
    query = {}
    if month:
        query["month"] = month
    if year:
        query["year"] = year
    if customer_id:
        query["customer_id"] = customer_id
    if status:
        query["status"] = status
    payments = await db.payments.find(query, {"_id": 0}).sort([("year", -1), ("month", -1)]).to_list(5000)
    return payments

@api_router.get("/payments/matrix")
async def payment_matrix(request: Request, year: int = 0):
    await get_current_user(request)
    await check_overdue_payments()
    if not year:
        year = datetime.now(timezone.utc).year
    customers = await db.customers.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    payments = await db.payments.find({"year": year}, {"_id": 0}).to_list(10000)
    matrix = {}
    for p in payments:
        cid = p["customer_id"]
        if cid not in matrix:
            matrix[cid] = {}
        matrix[cid][p["month"]] = p
    return {"customers": customers, "year": year, "months": list(range(1, 13)), "matrix": matrix}

@api_router.post("/payments/record")
async def record_payment(inp: PaymentInput, request: Request):
    user = await get_current_user(request)
    existing = await db.payments.find_one({"customer_id": inp.customer_id, "month": inp.month, "year": inp.year}, {"_id": 0})
    customer = await db.customers.find_one({"id": inp.customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    emi = customer.get("emi_amount", 0)
    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0})
    penalty_rate = brand.get("penalty_rate", 1.0) if brand else 1.0

    if existing:
        prev_paid = existing.get("amount_paid", 0)
        new_total_paid = prev_paid + inp.amount_paid
        penalty = existing.get("penalty_amount", 0)
        remaining = max(0, emi + penalty - new_total_paid)
        new_status = inp.status
        if new_status == "paid" or new_total_paid >= emi + penalty:
            new_status = "paid"
            remaining = 0
        elif new_total_paid > 0 and new_total_paid < emi + penalty:
            new_status = "partial"
        await db.payments.update_one({"id": existing["id"]}, {"$set": {
            "amount_paid": new_total_paid, "remaining": remaining,
            "status": new_status, "payment_mode": inp.payment_mode,
            "reference_number": inp.reference_number,
            "payment_date": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }})
        payment = await db.payments.find_one({"id": existing["id"]}, {"_id": 0})
    else:
        remaining = max(0, emi - inp.amount_paid)
        status = inp.status
        if inp.amount_paid >= emi:
            status = "paid"
            remaining = 0
        elif inp.amount_paid > 0:
            status = "partial"
        payment_id = str(uuid.uuid4())
        doc = {
            "id": payment_id, "customer_id": inp.customer_id,
            "month": inp.month, "year": inp.year, "status": status,
            "emi_amount": emi, "amount_paid": inp.amount_paid,
            "remaining": remaining, "payment_mode": inp.payment_mode,
            "reference_number": inp.reference_number,
            "penalty_amount": 0, "penalty_days": 0,
            "payment_date": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.payments.insert_one(doc)
        payment = {k: v for k, v in doc.items() if k != "_id"}
    # Auto-send WhatsApp based on status
    msg_type = "payment_received" if payment["status"] == "paid" else "partial_payment"
    await _send_mock_message(customer, payment, msg_type, brand)
    return payment

@api_router.put("/payments/{payment_id}/waive")
async def waive_payment(payment_id: str, request: Request):
    user = await require_role("admin")(request)
    result = await db.payments.update_one({"id": payment_id}, {"$set": {
        "status": "waived", "remaining": 0, "penalty_amount": 0,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Payment not found")
    return {"message": "Payment waived"}

# ═══════════════════════════════════════════
#  DASHBOARD STATS
# ═══════════════════════════════════════════
@api_router.get("/dashboard/stats")
async def dashboard_stats(request: Request):
    await get_current_user(request)
    await check_overdue_payments()
    now = datetime.now(timezone.utc)
    current_month, current_year = now.month, now.year

    total_customers = await db.customers.count_documents({})
    this_month_payments = await db.payments.find({"month": current_month, "year": current_year}, {"_id": 0}).to_list(5000)

    paid_count = sum(1 for p in this_month_payments if p["status"] == "paid")
    pending_count = sum(1 for p in this_month_payments if p["status"] == "pending")
    overdue_count = sum(1 for p in this_month_payments if p["status"] == "overdue")
    partial_count = sum(1 for p in this_month_payments if p["status"] == "partial")

    total_collected = sum(p.get("amount_paid", 0) for p in this_month_payments)
    total_target = sum(p.get("emi_amount", 0) for p in this_month_payments)
    total_outstanding = sum(p.get("remaining", 0) for p in this_month_payments if p["status"] != "paid")
    total_penalty = sum(p.get("penalty_amount", 0) for p in this_month_payments)

    # Top 5 overdue
    overdue_payments = [p for p in this_month_payments if p["status"] == "overdue"]
    overdue_payments.sort(key=lambda x: x.get("remaining", 0), reverse=True)
    top_overdue = []
    for p in overdue_payments[:5]:
        cust = await db.customers.find_one({"id": p["customer_id"]}, {"_id": 0})
        top_overdue.append({
            "customer_name": cust["name"] if cust else "Unknown",
            "customer_id": p["customer_id"],
            "property_name": cust.get("property_name", "") if cust else "",
            "amount": p.get("remaining", 0),
            "days_overdue": p.get("penalty_days", 0)
        })

    # Monthly trend (last 12 months)
    trend = []
    for i in range(11, -1, -1):
        m_date = now - timedelta(days=30 * i)
        m, y = m_date.month, m_date.year
        month_payments = await db.payments.find({"month": m, "year": y}, {"_id": 0}).to_list(5000)
        collected = sum(p.get("amount_paid", 0) for p in month_payments)
        target = sum(p.get("emi_amount", 0) for p in month_payments)
        trend.append({"month": m, "year": y, "collected": collected, "target": target, "label": f"{datetime(y, m, 1).strftime('%b %Y')}"})

    return {
        "total_customers": total_customers,
        "current_month": current_month, "current_year": current_year,
        "paid_count": paid_count, "pending_count": pending_count,
        "overdue_count": overdue_count, "partial_count": partial_count,
        "total_collected": total_collected, "total_target": total_target,
        "total_outstanding": total_outstanding, "total_penalty": total_penalty,
        "top_overdue": top_overdue, "trend": trend
    }

# ═══════════════════════════════════════════
#  WHATSAPP (MOCK)
# ═══════════════════════════════════════════
MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

def generate_message(template: str, customer: dict, payment: dict = None, brand: dict = None):
    brand = brand or {}
    brand_name = brand.get("brand_name", "RealtyPay")
    phone = brand.get("phone", "N/A")
    name = customer.get("name", "Customer")
    prop = customer.get("property_name", "Property")
    unit = customer.get("unit_no", "")
    emi = customer.get("emi_amount", 0)

    month_str = MONTH_NAMES[payment["month"]] if payment and payment.get("month") else ""
    year_str = str(payment.get("year", "")) if payment else ""
    amount_paid = payment.get("amount_paid", 0) if payment else 0
    remaining = payment.get("remaining", 0) if payment else 0
    penalty = payment.get("penalty_amount", 0) if payment else 0
    penalty_days = payment.get("penalty_days", 0) if payment else 0
    due_day = customer.get("due_date_day", 5)
    receipt = f"RCP-{uuid.uuid4().hex[:8].upper()}"

    templates = {
        "payment_received": f"Dear {name},\nWe have received your payment of Rs.{amount_paid:,.0f} for {prop} ({unit}) for {month_str} {year_str}.\nReceipt No: {receipt}\nRemaining Balance: Rs.{remaining:,.0f}\nThank you! - {brand_name}",
        "monthly_reminder": f"Dear {name},\nYour EMI of Rs.{emi:,.0f} for {prop} ({unit}) is due on {due_day}th of this month.\nPlease make the payment to avoid a late fee.\n- {brand_name}",
        "overdue_alert": f"Dear {name},\nYour payment of Rs.{emi:,.0f} for {month_str} {year_str} is OVERDUE by {penalty_days} days.\nA late penalty of Rs.{penalty:,.0f} has been applied.\nKindly pay Rs.{remaining:,.0f} at the earliest.\n- {brand_name}",
        "partial_payment": f"Dear {name},\nWe received Rs.{amount_paid:,.0f} against your EMI of Rs.{emi:,.0f}.\nRemaining due: Rs.{remaining:,.0f} for {month_str} {year_str}.\nPlease clear the balance by the {due_day}th.\n- {brand_name}",
        "balance_request": f"Dear {name},\nA balance of Rs.{remaining:,.0f} is pending for {prop} ({unit}) - {month_str} {year_str}.\nKindly arrange payment at the earliest.\nFor any queries, call us at {phone}.\n- {brand_name}",
        "annual_statement": f"Dear {name},\nPlease find your payment statement for {year_str} attached.\nTotal Paid: Rs.{amount_paid:,.0f} | Outstanding: Rs.{remaining:,.0f}\n- {brand_name}",
    }
    return templates.get(template, f"Dear {name}, this is a message from {brand_name}.")

async def _send_mock_message(customer, payment, msg_type, brand):
    text = generate_message(msg_type, customer, payment, brand)
    msg_doc = {
        "id": str(uuid.uuid4()), "customer_id": customer["id"],
        "customer_name": customer["name"], "phone": customer.get("phone", ""),
        "message_type": msg_type, "message_text": text,
        "status": "delivered", "sent_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(msg_doc)
    return msg_doc

@api_router.post("/whatsapp/send")
async def send_whatsapp(inp: MessageInput, request: Request):
    await get_current_user(request)
    customer = await db.customers.find_one({"id": inp.customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0})
    # Get latest payment for context
    payment = await db.payments.find_one({"customer_id": inp.customer_id}, {"_id": 0}, sort=[("year", -1), ("month", -1)])
    if not payment:
        payment = {"month": datetime.now(timezone.utc).month, "year": datetime.now(timezone.utc).year, "amount_paid": 0, "remaining": customer.get("emi_amount", 0), "penalty_amount": 0, "penalty_days": 0}
    msg_doc = await _send_mock_message(customer, payment, inp.message_type, brand)
    msg_doc.pop("_id", None)
    return {"message": "Message sent (MOCK)", "data": msg_doc}

@api_router.post("/whatsapp/bulk-send")
async def bulk_send(inp: BulkMessageInput, request: Request):
    await get_current_user(request)
    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0})
    results = []
    for cid in inp.customer_ids:
        customer = await db.customers.find_one({"id": cid}, {"_id": 0})
        if not customer:
            continue
        payment = await db.payments.find_one({"customer_id": cid}, {"_id": 0}, sort=[("year", -1), ("month", -1)])
        if not payment:
            payment = {"month": datetime.now(timezone.utc).month, "year": datetime.now(timezone.utc).year, "amount_paid": 0, "remaining": customer.get("emi_amount", 0), "penalty_amount": 0, "penalty_days": 0}
        msg = await _send_mock_message(customer, payment, inp.message_type, brand)
        msg.pop("_id", None)
        results.append(msg)
    return {"message": f"Sent {len(results)} messages (MOCK)", "data": results}

@api_router.get("/whatsapp/messages")
async def get_messages(request: Request, customer_id: str = ""):
    await get_current_user(request)
    query = {}
    if customer_id:
        query["customer_id"] = customer_id
    messages = await db.messages.find(query, {"_id": 0}).sort("sent_at", -1).to_list(500)
    return messages

# ═══════════════════════════════════════════
#  PDF REPORTS
# ═══════════════════════════════════════════
@api_router.get("/reports/monthly-pdf")
async def monthly_report_pdf(request: Request, month: int = 0, year: int = 0):
    await get_current_user(request)
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch

    if not month:
        month = datetime.now(timezone.utc).month
    if not year:
        year = datetime.now(timezone.utc).year

    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0}) or {}
    brand_name = brand.get("brand_name", "RealtyPay")
    footer_text = brand.get("footer_text", "")

    payments = await db.payments.find({"month": month, "year": year}, {"_id": 0}).to_list(5000)
    customers_map = {}
    for p in payments:
        if p["customer_id"] not in customers_map:
            c = await db.customers.find_one({"id": p["customer_id"]}, {"_id": 0})
            customers_map[p["customer_id"]] = c

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"<b>{brand_name}</b>", styles["Title"]))
    elements.append(Paragraph(f"Monthly Payment Report - {MONTH_NAMES[month]} {year}", styles["Heading2"]))
    elements.append(Spacer(1, 12))

    data = [["Customer", "Property", "EMI", "Paid", "Remaining", "Penalty", "Status"]]
    total_col = 0
    total_out = 0
    for p in payments:
        c = customers_map.get(p["customer_id"], {}) or {}
        data.append([
            c.get("name", "N/A"), c.get("property_name", ""), f"Rs.{p.get('emi_amount', 0):,.0f}",
            f"Rs.{p.get('amount_paid', 0):,.0f}", f"Rs.{p.get('remaining', 0):,.0f}",
            f"Rs.{p.get('penalty_amount', 0):,.0f}", p.get("status", "").upper()
        ])
        total_col += p.get("amount_paid", 0)
        total_out += p.get("remaining", 0)

    data.append(["TOTAL", "", "", f"Rs.{total_col:,.0f}", f"Rs.{total_out:,.0f}", "", ""])

    t = RLTable(data, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0052CC")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#F0F0F0")),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 20))
    if footer_text:
        elements.append(Paragraph(f"<i>{footer_text}</i>", styles["Normal"]))

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=report_{MONTH_NAMES[month]}_{year}.pdf"})

@api_router.get("/reports/annual-pdf/{customer_id}")
async def annual_statement_pdf(customer_id: str, request: Request, year: int = 0):
    await get_current_user(request)
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch

    if not year:
        year = datetime.now(timezone.utc).year

    customer = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0}) or {}
    brand_name = brand.get("brand_name", "RealtyPay")

    payments = await db.payments.find({"customer_id": customer_id, "year": year}, {"_id": 0}).sort("month", 1).to_list(12)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"<b>{brand_name}</b>", styles["Title"]))
    elements.append(Paragraph(f"Annual Statement - {year}", styles["Heading2"]))
    elements.append(Paragraph(f"Customer: {customer['name']} | Property: {customer.get('property_name', '')} ({customer.get('unit_no', '')})", styles["Normal"]))
    elements.append(Spacer(1, 12))

    data = [["Month", "EMI", "Amount Paid", "Remaining", "Penalty", "Status"]]
    total_paid = 0
    total_remaining = 0
    for p in payments:
        data.append([
            MONTH_NAMES[p["month"]], f"Rs.{p.get('emi_amount', 0):,.0f}",
            f"Rs.{p.get('amount_paid', 0):,.0f}", f"Rs.{p.get('remaining', 0):,.0f}",
            f"Rs.{p.get('penalty_amount', 0):,.0f}", p.get("status", "").upper()
        ])
        total_paid += p.get("amount_paid", 0)
        total_remaining += p.get("remaining", 0)

    data.append(["TOTAL", "", f"Rs.{total_paid:,.0f}", f"Rs.{total_remaining:,.0f}", "", ""])

    t = RLTable(data, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0052CC")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#F0F0F0")),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(f"<i>{brand.get('footer_text', '')}</i>", styles["Normal"]))

    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=annual_{customer['name']}_{year}.pdf"})

# ─── HEALTH CHECK ───
@api_router.get("/")
async def root():
    return {"message": "RealtyPay API Running", "status": "ok"}

app.include_router(api_router)
