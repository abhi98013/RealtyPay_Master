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
    allow_origins=[
        "https://krushnakunjassociation.com",
        "https://www.krushnakunjassociation.com",
        "https://krishnakunjassociation.com",
        "https://www.krishnakunjassociation.com",
        "https://property-receivables.preview.emergentagent.com",
        "https://property-receivables.emergent.host",
        "http://localhost:3000",
    ],
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
    role: str = "admin"

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
    tenure_months: int = 12

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
    primary_color: str = "#00AFD1"
    accent_color: str = "#10B981"
    footer_text: str = ""
    penalty_rate: float = 1.0
    phone: str = ""
    dlt_sender_id: str = ""
    dlt_entity_id: str = ""
    dlt_template_id: str = ""

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
    await db.layouts.create_index("id", unique=True)
    await db.plots.create_index("id", unique=True)
    await db.plots.create_index([("layout_id", 1), ("plot_number", 1)], unique=True)
    await db.plot_payments.create_index("plot_id")
    await db.layout_maps.create_index("layout_id")
    await db.audit_log.create_index("created_at")
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
            "id": "default", "brand_name": "KrushnaKunj Association", "tagline": "The key to our success...",
            "primary_color": "#00AFD1", "accent_color": "#2D2D2D",
            "footer_text": "KrushnaKunj Association - The key to our success...",
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
        "role": "admin",
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
#  USER MANAGEMENT (Admin only)
# ═══════════════════════════════════════════
class RoleUpdateInput(BaseModel):
    role: str

@api_router.get("/users")
async def list_users(request: Request):
    user = await get_current_user(request)
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(200)
    return users

@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, inp: RoleUpdateInput, request: Request):
    user = await get_current_user(request)
    if inp.role not in ["admin", "agent", "viewer"]:
        raise HTTPException(status_code=400, detail="Role must be admin, agent, or viewer")
    result = await db.users.update_one({"id": user_id}, {"$set": {"role": inp.role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": f"Role updated to {inp.role}"}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, request: Request):
    user = await get_current_user(request)
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}

# ═══════════════════════════════════════════
#  BRAND SETTINGS
# ═══════════════════════════════════════════
@api_router.get("/brand")
async def get_brand():
    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0})
    return brand or {"id": "default", "brand_name": "KrushnaKunj Association", "primary_color": "#00AFD1", "accent_color": "#2D2D2D"}

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
        "tenure_months": inp.tenure_months,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    await db.customers.insert_one(doc)
    # Auto-generate payment slots for full tenure (up to 60 months)
    try:
        start = datetime.fromisoformat(inp.agreement_start_date)
    except Exception:
        start = datetime.now(timezone.utc)
    tenure = min(max(inp.tenure_months, 1), 60)
    for i in range(tenure):
        m = start.month + i
        y = start.year + (m - 1) // 12
        m = ((m - 1) % 12) + 1
        payment_doc = {
            "id": str(uuid.uuid4()), "customer_id": cust_uuid,
            "month": m, "year": y,
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
    user = await get_current_user(request)
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
    cust_ids = list(set(p["customer_id"] for p in pending))
    custs = await db.customers.find({"id": {"$in": cust_ids}}, {"_id": 0}).to_list(len(cust_ids)) if cust_ids else []
    cust_map = {c["id"]: c for c in custs}
    for p in pending:
        customer = cust_map.get(p["customer_id"])
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
    # Send SMS via Fast2SMS on payment recording
    ref_no = inp.reference_number or f"TXN{uuid.uuid4().hex[:8].upper()}"
    pay_date = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    sms_text = f"Dear {customer['name']}, payment of Rs.{inp.amount_paid:,.0f} received. Ref No: {ref_no}. Date: {pay_date}. Thank you. - {brand.get('brand_name', 'KrushnaKunj Association') if brand else 'KrushnaKunj Association'}"
    phone = customer.get("phone", "")
    if phone:
        dlt_sender = brand.get("dlt_sender_id", "") if brand else ""
        dlt_entity = brand.get("dlt_entity_id", "") if brand else ""
        dlt_template = brand.get("dlt_template_id", "") if brand else ""
        sms_result = _send_fast2sms(phone, sms_text[:160], sender_id=dlt_sender, entity_id=dlt_entity, template_id=dlt_template)
        payment["sms_sent"] = sms_result.get("success", False)
        payment["sms_message"] = sms_text[:160]
        # Log SMS
        await db.messages.insert_one({
            "id": str(uuid.uuid4()), "customer_id": customer["id"],
            "customer_name": customer["name"], "phone": phone,
            "message_type": "sms_payment_received", "channel": "sms",
            "message_text": sms_text[:160],
            "status": "delivered" if sms_result.get("success") else "failed",
            "error": sms_result.get("error", "") or sms_result.get("message", ""),
            "sent_at": datetime.now(timezone.utc).isoformat()
        })
    return payment

@api_router.put("/payments/{payment_id}/waive")
async def waive_payment(payment_id: str, request: Request):
    user = await get_current_user(request)
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
    top5_ids = list(set(p["customer_id"] for p in overdue_payments[:5]))
    top5_custs = await db.customers.find({"id": {"$in": top5_ids}}, {"_id": 0}).to_list(len(top5_ids)) if top5_ids else []
    top5_map = {c["id"]: c for c in top5_custs}
    for p in overdue_payments[:5]:
        cust = top5_map.get(p["customer_id"])
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
    brand_name = brand.get("brand_name", "KrushnaKunj Association")
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
#  SMS VIA FAST2SMS
# ═══════════════════════════════════════════
import re

FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2"

def validate_indian_phone(phone: str) -> str:
    """Extract valid 10-digit Indian mobile number."""
    digits = re.sub(r'\D', '', phone)
    if digits.startswith('91') and len(digits) == 12:
        digits = digits[2:]
    if digits.startswith('0') and len(digits) == 11:
        digits = digits[1:]
    if len(digits) != 10:
        return ""
    if digits[0] not in '6789':
        return ""
    return digits

def _send_fast2sms(phone: str, message: str, sender_id: str = "", entity_id: str = "", template_id: str = "") -> dict:
    """Send SMS via Fast2SMS API. Tries DLT route if sender_id is set, otherwise tries quick route."""
    api_key = os.environ.get("FAST2SMS_API_KEY", "")
    if not api_key:
        return {"success": False, "error": "Fast2SMS API key not configured"}
    clean_phone = validate_indian_phone(phone)
    if not clean_phone:
        return {"success": False, "error": f"Invalid mobile number: {phone}"}
    if not message or not message.strip():
        return {"success": False, "error": "Message cannot be empty"}
    if len(message) > 160:
        message = message[:160]
    try:
        headers = {
            "authorization": api_key,
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "no-cache"
        }
        # Use DLT route if sender_id is configured
        if sender_id:
            payload = {
                "route": "dlt_manual",
                "sender_id": sender_id,
                "message": message,
                "numbers": clean_phone,
            }
            if entity_id:
                payload["entity_id"] = entity_id
            if template_id:
                payload["template_id"] = template_id
        else:
            # Fallback to quick route
            payload = {
                "route": "q",
                "message": message,
                "language": "english",
                "flash": "0",
                "numbers": clean_phone,
            }
        resp = requests.post(FAST2SMS_URL, data=payload, headers=headers, timeout=30)
        result = resp.json()
        logger.info(f"Fast2SMS response for {clean_phone}: {result}")
        return {"success": result.get("return", False), "message": result.get("message", ""), "request_id": result.get("request_id", ""), "raw": result}
    except Exception as e:
        logger.error(f"Fast2SMS error: {e}")
        return {"success": False, "error": str(e)}

class SMSInput(BaseModel):
    customer_id: str = ""
    phone: str = ""
    message: str
    message_type: str = "custom"

class BulkSMSInput(BaseModel):
    customer_ids: List[str]
    message_type: str = "payment_reminder"
    custom_message: str = ""

SMS_TEMPLATES = {
    "payment_reminder": "Dear {name}, your payment for {property} is due. Please pay at the earliest. - {brand}",
    "payment_received": "Dear {name}, we received your payment of Rs.{amount} for {property}. Thank you! - {brand}",
    "booking_confirmation": "Dear {name}, your booking for Plot {plot} at {property} is confirmed. Total: Rs.{total}. - {brand}",
    "custom": "{message}",
}

def build_sms_text(template_key: str, customer: dict = None, brand: dict = None, extra: dict = None):
    brand = brand or {}
    extra = extra or {}
    tpl = SMS_TEMPLATES.get(template_key, SMS_TEMPLATES["custom"])
    name = customer.get("name", "Customer") if customer else "Customer"
    prop = customer.get("property_name", "") if customer else extra.get("property", "")
    brand_name = brand.get("brand_name", "KrushnaKunj Association")
    return tpl.format(
        name=name, property=prop, brand=brand_name,
        amount=extra.get("amount", "0"), plot=extra.get("plot", ""),
        total=extra.get("total", "0"), message=extra.get("message", "")
    )[:160]

@api_router.post("/sms/send")
async def send_sms(inp: SMSInput, request: Request):
    user = await get_current_user(request)
    if not inp.message or not inp.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(inp.message) > 160:
        raise HTTPException(status_code=400, detail="SMS message must be 160 characters or less")

    phone = inp.phone
    customer_name = "Unknown"
    if inp.customer_id:
        customer = await db.customers.find_one({"id": inp.customer_id}, {"_id": 0})
        if customer:
            phone = phone or customer.get("phone", "")
            customer_name = customer.get("name", "Unknown")

    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    clean = validate_indian_phone(phone)
    if not clean:
        raise HTTPException(status_code=400, detail=f"Invalid mobile number. Must be a valid 10-digit Indian mobile number.")

    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0}) or {}
    dlt_sender = brand.get("dlt_sender_id", "")
    dlt_entity = brand.get("dlt_entity_id", "")
    dlt_template = brand.get("dlt_template_id", "")
    result = _send_fast2sms(phone, inp.message, sender_id=dlt_sender, entity_id=dlt_entity, template_id=dlt_template)

    msg_doc = {
        "id": str(uuid.uuid4()), "customer_id": inp.customer_id or "",
        "customer_name": customer_name, "phone": clean,
        "message_type": f"sms_{inp.message_type}", "message_text": inp.message,
        "channel": "sms",
        "status": "delivered" if result.get("success") else "failed",
        "error": result.get("error", "") or result.get("message", ""),
        "request_id": result.get("request_id", ""),
        "sent_at": datetime.now(timezone.utc).isoformat()
    }
    await db.messages.insert_one(msg_doc)
    msg_doc.pop("_id", None)
    return {"success": result.get("success", False), "message": result.get("message", "SMS processed"), "data": msg_doc}

@api_router.post("/sms/bulk-send")
async def bulk_send_sms(inp: BulkSMSInput, request: Request):
    user = await get_current_user(request)
    if not inp.customer_ids:
        raise HTTPException(status_code=400, detail="No customers selected")
    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0}) or {}
    results = {"sent": 0, "failed": 0, "errors": []}
    for cid in inp.customer_ids:
        customer = await db.customers.find_one({"id": cid}, {"_id": 0})
        if not customer:
            results["failed"] += 1
            results["errors"].append(f"Customer {cid} not found")
            continue
        phone = customer.get("phone", "")
        clean = validate_indian_phone(phone)
        if not clean:
            results["failed"] += 1
            results["errors"].append(f"{customer.get('name','?')}: Invalid mobile number")
            # Still log attempt
            await db.messages.insert_one({
                "id": str(uuid.uuid4()), "customer_id": cid,
                "customer_name": customer.get("name", ""), "phone": phone,
                "message_type": f"sms_{inp.message_type}", "channel": "sms",
                "message_text": inp.custom_message or build_sms_text(inp.message_type, customer, brand),
                "status": "failed", "error": "Invalid mobile number",
                "sent_at": datetime.now(timezone.utc).isoformat()
            })
            continue
        text = inp.custom_message if inp.custom_message else build_sms_text(inp.message_type, customer, brand)
        if not text.strip():
            results["failed"] += 1
            continue
        sms_result = _send_fast2sms(phone, text[:160], sender_id=brand.get("dlt_sender_id", ""), entity_id=brand.get("dlt_entity_id", ""), template_id=brand.get("dlt_template_id", ""))
        status = "delivered" if sms_result.get("success") else "failed"
        await db.messages.insert_one({
            "id": str(uuid.uuid4()), "customer_id": cid,
            "customer_name": customer.get("name", ""), "phone": clean,
            "message_type": f"sms_{inp.message_type}", "channel": "sms",
            "message_text": text[:160], "status": status,
            "error": sms_result.get("error", ""),
            "request_id": sms_result.get("request_id", ""),
            "sent_at": datetime.now(timezone.utc).isoformat()
        })
        if sms_result.get("success"):
            results["sent"] += 1
        else:
            results["failed"] += 1
            results["errors"].append(f"{customer.get('name','?')}: {sms_result.get('error', 'Send failed')}")
    return {"message": f"SMS sent: {results['sent']}, Failed: {results['failed']}", "results": results}

@api_router.get("/sms/history")
async def sms_history(request: Request, customer_id: str = ""):
    await get_current_user(request)
    query = {"channel": "sms"}
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
    brand_name = brand.get("brand_name", "KrushnaKunj Association")
    footer_text = brand.get("footer_text", "")

    payments = await db.payments.find({"month": month, "year": year}, {"_id": 0}).to_list(5000)
    pay_cust_ids = list(set(p["customer_id"] for p in payments))
    pay_custs = await db.customers.find({"id": {"$in": pay_cust_ids}}, {"_id": 0}).to_list(len(pay_cust_ids)) if pay_cust_ids else []
    customers_map = {c["id"]: c for c in pay_custs}

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
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#00AFD1")),
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
    brand_name = brand.get("brand_name", "KrushnaKunj Association")

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
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#00AFD1")),
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

# ═══════════════════════════════════════════
#  MODULE 1: LAYOUTS & PLOTS
# ═══════════════════════════════════════════

class LayoutInput(BaseModel):
    name: str
    description: str = ""

class PlotInput(BaseModel):
    layout_id: str
    plot_number: str
    area: float
    plot_type: str = "residential"
    price_per_sqft: float
    status: str = "available"

class PlotUpdateInput(BaseModel):
    plot_number: str = ""
    area: float = 0
    plot_type: str = ""
    price_per_sqft: float = 0
    status: str = ""
    customer_id: str = ""
    customer_name: str = ""
    booking_date: str = ""
    agreement_date: str = ""

class PlotPaymentInput(BaseModel):
    plot_id: str
    amount: float
    payment_date: str
    payment_mode: str
    cheque_number: str = ""
    reference_number: str = ""
    notes: str = ""

# --- Layouts CRUD ---
@api_router.get("/layouts")
async def list_layouts(request: Request):
    await get_current_user(request)
    layouts = await db.layouts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for layout in layouts:
        layout["plot_count"] = await db.plots.count_documents({"layout_id": layout["id"]})
        layout["sold_count"] = await db.plots.count_documents({"layout_id": layout["id"], "status": "sold"})
        layout["available_count"] = await db.plots.count_documents({"layout_id": layout["id"], "status": "available"})
        layout["reserved_count"] = await db.plots.count_documents({"layout_id": layout["id"], "status": "reserved"})
    return layouts

@api_router.post("/layouts")
async def create_layout(inp: LayoutInput, request: Request):
    user = await get_current_user(request)
    doc = {
        "id": str(uuid.uuid4()), "name": inp.name, "description": inp.description,
        "created_at": datetime.now(timezone.utc).isoformat(), "created_by": user["id"]
    }
    await db.layouts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/layouts/{layout_id}")
async def get_layout(layout_id: str, request: Request):
    await get_current_user(request)
    layout = await db.layouts.find_one({"id": layout_id}, {"_id": 0})
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    plots = await db.plots.find({"layout_id": layout_id}, {"_id": 0}).sort("plot_number", 1).to_list(1000)
    maps = await db.layout_maps.find({"layout_id": layout_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {**layout, "plots": plots, "maps": maps}

@api_router.put("/layouts/{layout_id}")
async def update_layout(layout_id: str, inp: LayoutInput, request: Request):
    await get_current_user(request)
    await db.layouts.update_one({"id": layout_id}, {"$set": {"name": inp.name, "description": inp.description, "updated_at": datetime.now(timezone.utc).isoformat()}})
    layout = await db.layouts.find_one({"id": layout_id}, {"_id": 0})
    return layout

@api_router.delete("/layouts/{layout_id}")
async def delete_layout(layout_id: str, request: Request):
    user = await get_current_user(request)
    await db.layouts.delete_one({"id": layout_id})
    await db.plots.delete_many({"layout_id": layout_id})
    await db.layout_maps.delete_many({"layout_id": layout_id})
    await _audit_log(user, "delete_layout", "layout", layout_id, {"layout_id": layout_id})
    return {"message": "Layout deleted"}

# --- Plots CRUD ---
@api_router.post("/plots")
async def create_plot(inp: PlotInput, request: Request):
    user = await get_current_user(request)
    if inp.area <= 0:
        raise HTTPException(status_code=400, detail="Area must be a positive number")
    if inp.price_per_sqft <= 0:
        raise HTTPException(status_code=400, detail="Price per sq. ft must be greater than 0")
    existing = await db.plots.find_one({"layout_id": inp.layout_id, "plot_number": inp.plot_number}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Plot already exists with this number in this layout")
    area = round(inp.area, 2)
    total_price = round(area * inp.price_per_sqft, 2)
    doc = {
        "id": str(uuid.uuid4()), "layout_id": inp.layout_id,
        "plot_number": inp.plot_number, "area": area,
        "plot_type": inp.plot_type, "price_per_sqft": inp.price_per_sqft,
        "total_price": total_price, "status": inp.status,
        "customer_id": "", "customer_name": "", "booking_date": "", "agreement_date": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.plots.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/plots")
async def list_plots(request: Request, layout_id: str = ""):
    await get_current_user(request)
    query = {}
    if layout_id:
        query["layout_id"] = layout_id
    plots = await db.plots.find(query, {"_id": 0}).sort("plot_number", 1).to_list(2000)
    return plots

@api_router.get("/plots/{plot_id}")
async def get_plot(plot_id: str, request: Request):
    await get_current_user(request)
    plot = await db.plots.find_one({"id": plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    payments = await db.plot_payments.find({"plot_id": plot_id, "is_deleted": False}, {"_id": 0}).sort("payment_date", -1).to_list(500)
    total_paid = sum(p.get("amount", 0) for p in payments)
    remaining = max(0, plot.get("total_price", 0) - total_paid)
    return {**plot, "payments": payments, "total_paid": total_paid, "remaining_balance": remaining}

@api_router.put("/plots/{plot_id}")
async def update_plot(plot_id: str, inp: PlotUpdateInput, request: Request):
    user = await get_current_user(request)
    plot = await db.plots.find_one({"id": plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    update = {}
    if inp.plot_number:
        dup = await db.plots.find_one({"layout_id": plot["layout_id"], "plot_number": inp.plot_number, "id": {"$ne": plot_id}}, {"_id": 0})
        if dup:
            raise HTTPException(status_code=400, detail="Plot number already exists in this layout")
        update["plot_number"] = inp.plot_number
    if inp.area > 0:
        update["area"] = round(inp.area, 2)
        ppf = inp.price_per_sqft if inp.price_per_sqft > 0 else plot.get("price_per_sqft", 0)
        update["total_price"] = round(update["area"] * ppf, 2)
    if inp.price_per_sqft > 0:
        update["price_per_sqft"] = inp.price_per_sqft
        area = update.get("area", plot.get("area", 0))
        update["total_price"] = round(area * inp.price_per_sqft, 2)
    if inp.plot_type:
        update["plot_type"] = inp.plot_type
    if inp.status:
        update["status"] = inp.status
    if inp.customer_id:
        if inp.customer_id == plot.get("customer_id") and plot.get("customer_id"):
            pass
        update["customer_id"] = inp.customer_id
        update["customer_name"] = inp.customer_name
    if inp.customer_id == "":
        update["customer_id"] = ""
        update["customer_name"] = ""
    if inp.booking_date:
        update["booking_date"] = inp.booking_date
    if inp.agreement_date:
        update["agreement_date"] = inp.agreement_date
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.plots.update_one({"id": plot_id}, {"$set": update})
    await _audit_log(user, "update_plot", "plot", plot_id, {"changes": update})
    updated = await db.plots.find_one({"id": plot_id}, {"_id": 0})
    return updated

@api_router.delete("/plots/{plot_id}")
async def delete_plot(plot_id: str, request: Request):
    user = await get_current_user(request)
    plot = await db.plots.find_one({"id": plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    await db.plots.delete_one({"id": plot_id})
    await db.plot_payments.delete_many({"plot_id": plot_id})
    await _audit_log(user, "delete_plot", "plot", plot_id, {"plot_number": plot.get("plot_number", "")})
    return {"message": "Plot deleted"}

# ═══════════════════════════════════════════
#  MODULE 2: MAP UPLOAD
# ═══════════════════════════════════════════
ALLOWED_MAP_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/svg+xml", "application/pdf"}
MAX_MAP_SIZE = 10 * 1024 * 1024  # 10MB

@api_router.post("/layouts/{layout_id}/maps")
async def upload_map(layout_id: str, request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)
    layout = await db.layouts.find_one({"id": layout_id}, {"_id": 0})
    if not layout:
        raise HTTPException(status_code=404, detail="Layout not found")
    if file.content_type not in ALLOWED_MAP_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, JPG, PNG, SVG allowed.")
    data = await file.read()
    if len(data) > MAX_MAP_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
    # Enforce single map per layout - delete existing
    await db.layout_maps.delete_many({"layout_id": layout_id})
    ext = file.filename.split(".")[-1] if "." in file.filename else "png"
    storage_path = f"{APP_NAME}/maps/{layout_id}/{uuid.uuid4()}.{ext}"
    result = put_object(storage_path, data, file.content_type or "application/octet-stream")
    doc = {
        "id": str(uuid.uuid4()), "layout_id": layout_id,
        "file_name": file.filename, "storage_path": result["path"],
        "file_type": file.content_type, "file_size": len(data),
        "upload_date": datetime.now(timezone.utc).isoformat(),
        "uploader_name": user.get("name", "Admin"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.layout_maps.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/layouts/{layout_id}/maps")
async def list_maps(layout_id: str, request: Request):
    await get_current_user(request)
    maps = await db.layout_maps.find({"layout_id": layout_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return maps

@api_router.get("/layout-maps/{map_id}/download")
async def download_map(map_id: str, request: Request):
    await get_current_user(request)
    map_doc = await db.layout_maps.find_one({"id": map_id}, {"_id": 0})
    if not map_doc:
        raise HTTPException(status_code=404, detail="Map not found")
    data, ct = get_object(map_doc["storage_path"])
    return Response(content=data, media_type=ct, headers={
        "Content-Disposition": f"attachment; filename={map_doc['file_name']}"
    })

@api_router.delete("/layout-maps/{map_id}")
async def delete_map(map_id: str, request: Request):
    user = await get_current_user(request)
    await db.layout_maps.delete_one({"id": map_id})
    return {"message": "Map deleted"}

# ═══════════════════════════════════════════
#  MODULE 5: PLOT PAYMENTS & CASH FLOW
# ═══════════════════════════════════════════
@api_router.post("/plot-payments")
async def create_plot_payment(inp: PlotPaymentInput, request: Request):
    user = await get_current_user(request)
    if inp.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")
    try:
        pay_date = datetime.fromisoformat(inp.payment_date.replace("Z", "+00:00")) if "T" in inp.payment_date else datetime.strptime(inp.payment_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except Exception:
        pay_date = datetime.now(timezone.utc)
    if pay_date > datetime.now(timezone.utc) + timedelta(hours=24):
        raise HTTPException(status_code=400, detail="Payment date cannot be a future date")
    if inp.payment_mode == "cheque" and not inp.cheque_number:
        raise HTTPException(status_code=400, detail="Cheque number is required for cheque payments")
    plot = await db.plots.find_one({"id": inp.plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    existing_payments = await db.plot_payments.find({"plot_id": inp.plot_id, "is_deleted": False}, {"_id": 0}).to_list(1000)
    total_paid = sum(p.get("amount", 0) for p in existing_payments)
    remaining = plot.get("total_price", 0) - total_paid
    if inp.amount > remaining + 0.01:
        raise HTTPException(status_code=400, detail=f"Amount exceeds due balance. Remaining: Rs.{remaining:,.0f}")
    doc = {
        "id": str(uuid.uuid4()), "plot_id": inp.plot_id,
        "customer_id": plot.get("customer_id", ""),
        "amount": inp.amount, "payment_date": inp.payment_date,
        "payment_mode": inp.payment_mode, "cheque_number": inp.cheque_number,
        "reference_number": inp.reference_number, "notes": inp.notes,
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.plot_payments.insert_one(doc)
    new_total = total_paid + inp.amount
    if new_total >= plot.get("total_price", 0):
        await db.plots.update_one({"id": inp.plot_id}, {"$set": {"status": "sold"}})
    doc.pop("_id", None)
    return doc

@api_router.get("/plot-payments")
async def list_plot_payments(request: Request, plot_id: str = "", start_date: str = "", end_date: str = ""):
    await get_current_user(request)
    query = {"is_deleted": False}
    if plot_id:
        query["plot_id"] = plot_id
    if start_date:
        query["payment_date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("payment_date", {})
        if isinstance(query["payment_date"], dict):
            query["payment_date"]["$lte"] = end_date
        else:
            query["payment_date"] = {"$gte": query["payment_date"], "$lte": end_date}
    payments = await db.plot_payments.find(query, {"_id": 0}).sort("payment_date", -1).to_list(5000)
    return payments

@api_router.delete("/plot-payments/{payment_id}")
async def delete_plot_payment(payment_id: str, request: Request):
    user = await get_current_user(request)
    payment = await db.plot_payments.find_one({"id": payment_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    await db.plot_payments.update_one({"id": payment_id}, {"$set": {
        "is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat(),
        "deleted_by": user["id"]
    }})
    await _audit_log(user, "delete_plot_payment", "plot_payment", payment_id, payment)
    plot = await db.plots.find_one({"id": payment["plot_id"]}, {"_id": 0})
    if plot:
        remaining_payments = await db.plot_payments.find({"plot_id": payment["plot_id"], "is_deleted": False}, {"_id": 0}).to_list(1000)
        total = sum(p.get("amount", 0) for p in remaining_payments)
        if total < plot.get("total_price", 0) and plot.get("status") == "sold":
            await db.plots.update_one({"id": payment["plot_id"]}, {"$set": {"status": "reserved"}})
    return {"message": "Payment deleted and moved to audit log"}

# ═══════════════════════════════════════════
#  MODULE 3: PLOT-WISE STATEMENT
# ═══════════════════════════════════════════
@api_router.get("/plot-statements/{plot_id}")
async def get_plot_statement(plot_id: str, request: Request, start_date: str = "", end_date: str = ""):
    await get_current_user(request)
    plot = await db.plots.find_one({"id": plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    if not plot.get("customer_id"):
        raise HTTPException(status_code=400, detail="No customer assigned to this plot")
    query = {"plot_id": plot_id, "is_deleted": False}
    if start_date:
        query["payment_date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("payment_date", {})
        if isinstance(query["payment_date"], dict):
            query["payment_date"]["$lte"] = end_date
        else:
            query["payment_date"] = {"$gte": query["payment_date"], "$lte": end_date}
    payments = await db.plot_payments.find(query, {"_id": 0}).sort("payment_date", 1).to_list(1000)
    total_paid = sum(p.get("amount", 0) for p in payments)
    all_payments = await db.plot_payments.find({"plot_id": plot_id, "is_deleted": False}, {"_id": 0}).to_list(1000)
    grand_total_paid = sum(p.get("amount", 0) for p in all_payments)
    remaining = max(0, plot.get("total_price", 0) - grand_total_paid)
    mode_breakdown = {}
    for p in payments:
        m = p.get("payment_mode", "other")
        mode_breakdown[m] = mode_breakdown.get(m, 0) + p.get("amount", 0)
    customer = None
    if plot.get("customer_id"):
        customer = await db.customers.find_one({"id": plot["customer_id"]}, {"_id": 0})
    return {
        "plot": plot, "customer": customer, "payments": payments,
        "total_paid_in_period": total_paid, "grand_total_paid": grand_total_paid,
        "remaining_balance": remaining, "mode_breakdown": mode_breakdown
    }

@api_router.get("/plot-statements/{plot_id}/pdf")
async def plot_statement_pdf(plot_id: str, request: Request, start_date: str = "", end_date: str = ""):
    await get_current_user(request)
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch

    plot = await db.plots.find_one({"id": plot_id}, {"_id": 0})
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
    brand = await db.brand_settings.find_one({"id": "default"}, {"_id": 0}) or {}
    query = {"plot_id": plot_id, "is_deleted": False}
    if start_date:
        query["payment_date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("payment_date", {})
        if isinstance(query["payment_date"], dict):
            query["payment_date"]["$lte"] = end_date
        else:
            query["payment_date"] = {"$gte": query["payment_date"], "$lte": end_date}
    payments = await db.plot_payments.find(query, {"_id": 0}).sort("payment_date", 1).to_list(1000)
    all_payments = await db.plot_payments.find({"plot_id": plot_id, "is_deleted": False}, {"_id": 0}).to_list(1000)
    grand_total = sum(p.get("amount", 0) for p in all_payments)
    period_total = sum(p.get("amount", 0) for p in payments)
    remaining = max(0, plot.get("total_price", 0) - grand_total)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    styles = getSampleStyleSheet()
    elements = []
    elements.append(Paragraph(f"<b>{brand.get('brand_name', 'KrushnaKunj Association')}</b>", styles["Title"]))
    elements.append(Paragraph(f"Plot Statement - {plot['plot_number']}", styles["Heading2"]))
    elements.append(Spacer(1, 8))
    info = f"Plot: {plot['plot_number']} | Type: {plot.get('plot_type', '')} | Area: {plot.get('area', 0)} sq.ft | Total Price: Rs.{plot.get('total_price', 0):,.0f}"
    elements.append(Paragraph(info, styles["Normal"]))
    if plot.get("customer_name"):
        elements.append(Paragraph(f"Customer: {plot['customer_name']}", styles["Normal"]))
    dr = ""
    if start_date:
        dr += f"From: {start_date} "
    if end_date:
        dr += f"To: {end_date}"
    if dr:
        elements.append(Paragraph(f"Period: {dr}", styles["Normal"]))
    elements.append(Spacer(1, 12))
    data = [["Date", "Amount", "Mode", "Reference", "Notes"]]
    for p in payments:
        data.append([p.get("payment_date", ""), f"Rs.{p.get('amount', 0):,.0f}", p.get("payment_mode", ""), p.get("reference_number", "") or p.get("cheque_number", ""), p.get("notes", "")])
    data.append(["", f"Total: Rs.{period_total:,.0f}", "", "", ""])
    t = RLTable(data, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#00AFD1")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#F0F0F0")),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('ALIGN', (1, 1), (1, -1), 'RIGHT'),
    ]))
    elements.append(t)
    elements.append(Spacer(1, 16))
    elements.append(Paragraph(f"<b>Grand Total Paid: Rs.{grand_total:,.0f}</b>", styles["Normal"]))
    elements.append(Paragraph(f"<b>Remaining Balance: Rs.{remaining:,.0f}</b>", styles["Normal"]))
    elements.append(Spacer(1, 24))
    elements.append(Paragraph("_________________________", styles["Normal"]))
    elements.append(Paragraph("Authorized Signature", styles["Normal"]))
    elements.append(Spacer(1, 12))
    if brand.get("footer_text"):
        elements.append(Paragraph(f"<i>{brand['footer_text']}</i>", styles["Normal"]))
    doc.build(elements)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=statement_{plot['plot_number']}.pdf"
    })

# ═══════════════════════════════════════════
#  MODULE 5: CASH FLOW DASHBOARD
# ═══════════════════════════════════════════
@api_router.get("/cashflow/stats")
async def cashflow_stats(request: Request):
    await get_current_user(request)
    total_plots = await db.plots.count_documents({})
    sold_plots = await db.plots.count_documents({"status": "sold"})
    available_plots = await db.plots.count_documents({"status": "available"})
    reserved_plots = await db.plots.count_documents({"status": "reserved"})
    all_sold = await db.plots.find({"status": {"$in": ["sold", "reserved"]}}, {"_id": 0}).to_list(5000)
    total_value = sum(p.get("total_price", 0) for p in all_sold)
    all_payments = await db.plot_payments.find({"is_deleted": False}, {"_id": 0}).to_list(10000)
    total_collected = sum(p.get("amount", 0) for p in all_payments)
    total_outstanding = total_value - total_collected
    # Fully paid vs pending customers
    plot_paid = {}
    for p in all_payments:
        plot_paid[p["plot_id"]] = plot_paid.get(p["plot_id"], 0) + p.get("amount", 0)
    fully_paid = 0
    pending_balance = 0
    for s in all_sold:
        tp = plot_paid.get(s["id"], 0)
        if tp >= s.get("total_price", 0):
            fully_paid += 1
        else:
            pending_balance += 1
    # Payment mode breakdown
    mode_breakdown = {}
    for p in all_payments:
        m = p.get("payment_mode", "other")
        mode_breakdown[m] = mode_breakdown.get(m, 0) + p.get("amount", 0)
    # Monthly collection trend
    trend = []
    now = datetime.now(timezone.utc)
    for i in range(11, -1, -1):
        m_date = now - timedelta(days=30 * i)
        m, y = m_date.month, m_date.year
        start = f"{y}-{m:02d}-01"
        if m == 12:
            end = f"{y+1}-01-01"
        else:
            end = f"{y}-{m+1:02d}-01"
        month_payments = [p for p in all_payments if start <= p.get("payment_date", "") < end]
        collected = sum(p.get("amount", 0) for p in month_payments)
        trend.append({"month": m, "year": y, "collected": collected, "label": f"{datetime(y, m, 1).strftime('%b %Y')}"})
    return {
        "total_plots": total_plots, "sold_plots": sold_plots,
        "available_plots": available_plots, "reserved_plots": reserved_plots,
        "total_value": total_value, "total_collected": total_collected,
        "total_outstanding": max(0, total_outstanding),
        "fully_paid_customers": fully_paid, "pending_balance_customers": pending_balance,
        "mode_breakdown": mode_breakdown, "trend": trend
    }

@api_router.get("/cashflow/statement")
async def cashflow_statement(request: Request, period: str = "monthly", start_date: str = "", end_date: str = ""):
    await get_current_user(request)
    now = datetime.now(timezone.utc)
    if not start_date:
        if period == "monthly":
            start_date = f"{now.year}-{now.month:02d}-01"
        elif period == "half_yearly":
            sm = now.month - 5 if now.month > 5 else 1
            start_date = f"{now.year}-{sm:02d}-01"
        elif period == "yearly":
            start_date = f"{now.year}-01-01"
        else:
            start_date = f"{now.year}-{now.month:02d}-01"
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    query = {"is_deleted": False, "payment_date": {"$gte": start_date, "$lte": end_date}}
    payments = await db.plot_payments.find(query, {"_id": 0}).sort("payment_date", 1).to_list(10000)
    # Group by plot
    plot_ids = list(set(p["plot_id"] for p in payments))
    plots_data = await db.plots.find({"id": {"$in": plot_ids}}, {"_id": 0}).to_list(len(plot_ids)) if plot_ids else []
    plots_map = {p["id"]: p for p in plots_data}
    by_plot = {}
    for p in payments:
        pid = p["plot_id"]
        if pid not in by_plot:
            plot = plots_map.get(pid, {})
            by_plot[pid] = {
                "plot_number": plot.get("plot_number", "?"),
                "customer_name": plot.get("customer_name", ""),
                "total_price": plot.get("total_price", 0),
                "payments": [], "period_total": 0
            }
        by_plot[pid]["payments"].append(p)
        by_plot[pid]["period_total"] += p.get("amount", 0)
    return {"period": period, "start_date": start_date, "end_date": end_date, "plots": list(by_plot.values()), "total": sum(p.get("amount", 0) for p in payments)}

# ═══════════════════════════════════════════
#  AUDIT LOG
# ═══════════════════════════════════════════
async def _audit_log(user, action, entity_type, entity_id, details):
    doc = {
        "id": str(uuid.uuid4()), "action": action,
        "entity_type": entity_type, "entity_id": entity_id,
        "details": details, "user_id": user.get("id", ""),
        "user_name": user.get("name", ""), "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_log.insert_one(doc)

@api_router.get("/audit-log")
async def get_audit_log(request: Request, limit: int = 100):
    user = await get_current_user(request)
    logs = await db.audit_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs

# ─── HEALTH CHECK ───
@api_router.get("/")
async def root():
    return {"message": "KrushnaKunj Association API Running", "status": "ok"}

app.include_router(api_router)
