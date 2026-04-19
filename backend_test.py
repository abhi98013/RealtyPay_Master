#!/usr/bin/env python3
"""
Backend API Testing for Real Estate Payment Management App
Tests all major API endpoints with proper authentication
"""

import requests
import sys
import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional

class RealtyPayAPITester:
    def __init__(self, base_url: str = "https://property-receivables.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.cookies = {}
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        
    def log_test(self, name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        # Add auth headers
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)
            
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=test_headers, cookies=self.cookies)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=test_headers, cookies=self.cookies)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=test_headers, cookies=self.cookies)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=test_headers, cookies=self.cookies)
            else:
                return self.log_test(name, False, f"Unsupported method: {method}"), {}

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                details += f" (Expected: {expected_status})"
                try:
                    error_data = response.json()
                    details += f" - {error_data.get('detail', 'No error details')}"
                except:
                    details += f" - {response.text[:100]}"
            
            self.log_test(name, success, details)
            
            # Store cookies from login
            if success and endpoint == "auth/login":
                self.cookies.update(response.cookies)
                
            return success, response.json() if success else {}

        except Exception as e:
            return self.log_test(name, False, f"Exception: {str(e)}"), {}

    def test_health_check(self) -> bool:
        """Test API health check"""
        success, response = self.run_test("Health Check", "GET", "", 200)
        return success and response.get("status") == "ok"

    def test_login(self, email: str = "admin@realtypay.com", password: str = "Admin@123") -> bool:
        """Test login and store token"""
        success, response = self.run_test(
            "Admin Login",
            "POST", 
            "auth/login",
            200,
            data={"email": email, "password": password}
        )
        
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Token stored: {self.token[:20]}...")
            return True
        return False

    def test_get_me(self) -> bool:
        """Test get current user"""
        success, response = self.run_test("Get Current User", "GET", "auth/me", 200)
        return success and response.get("email") == "admin@realtypay.com"

    def test_brand_settings(self) -> bool:
        """Test brand settings CRUD"""
        # Get brand settings
        success1, brand = self.run_test("Get Brand Settings", "GET", "brand", 200)
        
        # Update brand settings
        update_data = {
            "brand_name": "Test RealtyPay",
            "tagline": "Testing Payment Management",
            "primary_color": "#FF5722",
            "accent_color": "#4CAF50",
            "footer_text": "Test Footer",
            "penalty_rate": 2.0,
            "phone": "+91-9876543210"
        }
        success2, updated = self.run_test("Update Brand Settings", "PUT", "brand", 200, data=update_data)
        
        return success1 and success2 and updated.get("brand_name") == "Test RealtyPay"

    def test_customer_management(self) -> Optional[str]:
        """Test customer CRUD operations"""
        # Create customer
        customer_data = {
            "name": "Test Customer",
            "phone": "+91-9876543210",
            "email": "test@example.com",
            "property_name": "Test Apartments",
            "unit_no": "A-101",
            "total_property_value": 5000000.0,
            "emi_amount": 50000.0,
            "agreement_start_date": "2024-01-01T00:00:00Z",
            "due_date_day": 5
        }
        
        success1, customer = self.run_test("Create Customer", "POST", "customers", 200, data=customer_data)
        if not success1:
            return None
            
        customer_id = customer.get("id")
        if not customer_id:
            print("❌ No customer ID returned")
            return None
            
        # List customers
        success2, customers = self.run_test("List Customers", "GET", "customers", 200)
        
        # Get customer details
        success3, customer_detail = self.run_test("Get Customer", "GET", f"customers/{customer_id}", 200)
        
        if success1 and success2 and success3:
            return customer_id
        return None

    def test_payment_operations(self, customer_id: str) -> bool:
        """Test payment recording and matrix"""
        if not customer_id:
            return False
            
        # Get payment matrix
        success1, matrix = self.run_test("Get Payment Matrix", "GET", "payments/matrix?year=2024", 200)
        
        # Record a payment
        payment_data = {
            "customer_id": customer_id,
            "month": 8,
            "year": 2024,
            "amount_paid": 50000.0,
            "payment_mode": "bank_transfer",
            "reference_number": "TXN123456",
            "status": "paid"
        }
        success2, payment = self.run_test("Record Payment", "POST", "payments/record", 200, data=payment_data)
        
        # Record partial payment
        partial_data = {
            "customer_id": customer_id,
            "month": 9,
            "year": 2024,
            "amount_paid": 25000.0,
            "payment_mode": "cash",
            "reference_number": "CASH001",
            "status": "partial"
        }
        success3, partial = self.run_test("Record Partial Payment", "POST", "payments/record", 200, data=partial_data)
        
        # List payments
        success4, payments = self.run_test("List Payments", "GET", f"payments?customer_id={customer_id}", 200)
        
        return success1 and success2 and success3 and success4

    def test_whatsapp_mock(self, customer_id: str) -> bool:
        """Test WhatsApp mock functionality"""
        if not customer_id:
            return False
            
        # Send single message
        message_data = {
            "customer_id": customer_id,
            "message_type": "monthly_reminder",
            "custom_text": ""
        }
        success1, msg_response = self.run_test("Send WhatsApp Message", "POST", "whatsapp/send", 200, data=message_data)
        
        # Bulk send
        bulk_data = {
            "customer_ids": [customer_id],
            "message_type": "overdue_alert"
        }
        success2, bulk_response = self.run_test("Bulk Send Messages", "POST", "whatsapp/bulk-send", 200, data=bulk_data)
        
        # Get messages
        success3, messages = self.run_test("Get Messages", "GET", f"whatsapp/messages?customer_id={customer_id}", 200)
        
        return success1 and success2 and success3

    def test_dashboard_stats(self) -> bool:
        """Test dashboard statistics"""
        success, stats = self.run_test("Dashboard Stats", "GET", "dashboard/stats", 200)
        
        if success:
            required_fields = ["total_customers", "paid_count", "pending_count", "overdue_count", 
                             "total_collected", "total_target", "top_overdue", "trend"]
            missing_fields = [field for field in required_fields if field not in stats]
            if missing_fields:
                print(f"   Missing fields: {missing_fields}")
                return False
        
        return success

    def test_reports(self) -> bool:
        """Test PDF report generation"""
        # Monthly report - expect binary response, not JSON
        try:
            url = f"{self.base_url}/api/reports/monthly-pdf?month=8&year=2024"
            headers = {'Authorization': f'Bearer {self.token}'}
            response = self.session.get(url, headers=headers, cookies=self.cookies)
            success1 = response.status_code == 200 and response.headers.get('content-type') == 'application/pdf'
            self.log_test("Monthly PDF Report", success1, f"Status: {response.status_code}, Content-Type: {response.headers.get('content-type', 'unknown')}")
        except Exception as e:
            success1 = self.log_test("Monthly PDF Report", False, f"Exception: {str(e)}")
        
        return success1
    def test_layout_management(self) -> Optional[str]:
        """Test layout CRUD operations"""
        # Create layout
        layout_data = {
            "name": "Test Layout - Sunrise Colony Phase 1",
            "description": "Test layout for automated testing"
        }
        
        success1, layout = self.run_test("Create Layout", "POST", "layouts", 200, data=layout_data)
        if not success1:
            return None
            
        layout_id = layout.get("id")
        if not layout_id:
            print("❌ No layout ID returned")
            return None
            
        # List layouts
        success2, layouts = self.run_test("List Layouts", "GET", "layouts", 200)
        
        # Get layout details
        success3, layout_detail = self.run_test("Get Layout", "GET", f"layouts/{layout_id}", 200)
        
        if success1 and success2 and success3:
            return layout_id
        return None

    def test_plot_management(self, layout_id: str) -> Optional[str]:
        """Test plot CRUD operations"""
        if not layout_id:
            return None
            
        # Create plot A-12
        plot_data = {
            "layout_id": layout_id,
            "plot_number": "A-12",
            "length": 30.0,
            "width": 40.0,
            "plot_type": "residential",
            "price_per_sqft": 500.0,
            "status": "available"
        }
        
        success1, plot = self.run_test("Create Plot A-12", "POST", "plots", 200, data=plot_data)
        if not success1:
            return None
            
        plot_id = plot.get("id")
        if not plot_id:
            print("❌ No plot ID returned")
            return None
            
        # Verify area calculation (30 * 40 = 1200)
        if plot.get("area") != 1200.0:
            print(f"❌ Area calculation incorrect: expected 1200, got {plot.get('area')}")
            return None
        
        # Create plot B-05
        plot_data2 = {
            "layout_id": layout_id,
            "plot_number": "B-05",
            "length": 25.0,
            "width": 30.0,
            "plot_type": "commercial",
            "price_per_sqft": 600.0,
            "status": "available"
        }
        
        success2, plot2 = self.run_test("Create Plot B-05", "POST", "plots", 200, data=plot_data2)
        
        # Try creating duplicate plot A-12 (should fail)
        success3, _ = self.run_test("Create Duplicate Plot A-12", "POST", "plots", 400, data=plot_data)
        success3 = not success3  # We expect this to fail
        
        # List plots
        success4, plots = self.run_test("List Plots", "GET", f"plots?layout_id={layout_id}", 200)
        
        # Get plot details
        success5, plot_detail = self.run_test("Get Plot Details", "GET", f"plots/{plot_id}", 200)
        
        if success1 and success2 and success3 and success4 and success5:
            return plot_id
        return None

    def test_plot_payments(self, plot_id: str) -> bool:
        """Test plot payment operations"""
        if not plot_id:
            return False
            
        # Record plot payment
        payment_data = {
            "plot_id": plot_id,
            "amount": 100000.0,
            "payment_date": "2024-08-15",
            "payment_mode": "upi",
            "reference_number": "UPI123456",
            "notes": "Test payment"
        }
        
        success1, payment = self.run_test("Record Plot Payment", "POST", "plot-payments", 200, data=payment_data)
        
        # List plot payments
        success2, payments = self.run_test("List Plot Payments", "GET", f"plot-payments?plot_id={plot_id}", 200)
        
        return success1 and success2

    def test_plot_statements(self, plot_id: str) -> bool:
        """Test plot statement generation"""
        if not plot_id:
            return False
            
        # Get plot statement
        success1, statement = self.run_test("Get Plot Statement", "GET", f"plot-statements/{plot_id}", 200)
        
        # Test PDF statement generation
        try:
            url = f"{self.base_url}/api/plot-statements/{plot_id}/pdf"
            headers = {'Authorization': f'Bearer {self.token}'}
            response = self.session.get(url, headers=headers, cookies=self.cookies)
            success2 = response.status_code == 200 and response.headers.get('content-type') == 'application/pdf'
            self.log_test("Plot Statement PDF", success2, f"Status: {response.status_code}, Content-Type: {response.headers.get('content-type', 'unknown')}")
        except Exception as e:
            success2 = self.log_test("Plot Statement PDF", False, f"Exception: {str(e)}")
        
        return success1 and success2

    def test_cashflow_stats(self) -> bool:
        """Test cash flow statistics"""
        success1, stats = self.run_test("Cash Flow Stats", "GET", "cashflow/stats", 200)
        
        if success1:
            required_fields = ["total_plots", "sold_plots", "available_plots", "reserved_plots", 
                             "total_value", "total_collected", "total_outstanding", "trend"]
            missing_fields = [field for field in required_fields if field not in stats]
            if missing_fields:
                print(f"   Missing fields: {missing_fields}")
                return False
        
        # Test cash flow statement
        success2, statement = self.run_test("Cash Flow Statement", "GET", "cashflow/statement?period=monthly", 200)
        
        return success1 and success2

    def test_map_upload(self, layout_id: str) -> bool:
        """Test map upload functionality (mock test)"""
        if not layout_id:
            return False
            
        # List maps for layout
        success1, maps = self.run_test("List Layout Maps", "GET", f"layouts/{layout_id}/maps", 200)
        
        # Note: We can't easily test file upload in this simple test framework
        # but we can verify the endpoint exists and returns proper response
        print("   Note: Map upload endpoint exists but file upload not tested in this framework")
        
        return success1

    def test_logout(self) -> bool:
        """Test logout"""
        success, response = self.run_test("Logout", "POST", "auth/logout", 200)
        if success:
            self.token = None
            self.cookies = {}
        return success

    def run_all_tests(self) -> Dict[str, Any]:
        """Run all tests and return results"""
        print("🚀 Starting RealtyPay API Tests")
        print("=" * 50)
        
        results = {
            "health_check": False,
            "login": False,
            "auth_me": False,
            "brand_settings": False,
            "customer_management": False,
            "payment_operations": False,
            "whatsapp_mock": False,
            "dashboard_stats": False,
            "reports": False,
            "layout_management": False,
            "plot_management": False,
            "plot_payments": False,
            "plot_statements": False,
            "cashflow_stats": False,
            "map_upload": False,
            "logout": False,
            "customer_id": None,
            "layout_id": None,
            "plot_id": None
        }
        
        # Test sequence
        results["health_check"] = self.test_health_check()
        
        if results["health_check"]:
            results["login"] = self.test_login()
            
            if results["login"]:
                results["auth_me"] = self.test_get_me()
                results["brand_settings"] = self.test_brand_settings()
                results["dashboard_stats"] = self.test_dashboard_stats()
                
                customer_id = self.test_customer_management()
                results["customer_id"] = customer_id
                results["customer_management"] = customer_id is not None
                
                if customer_id:
                    results["payment_operations"] = self.test_payment_operations(customer_id)
                    results["whatsapp_mock"] = self.test_whatsapp_mock(customer_id)
                
                # Test new modules
                layout_id = self.test_layout_management()
                results["layout_id"] = layout_id
                results["layout_management"] = layout_id is not None
                
                if layout_id:
                    plot_id = self.test_plot_management(layout_id)
                    results["plot_id"] = plot_id
                    results["plot_management"] = plot_id is not None
                    
                    if plot_id:
                        results["plot_payments"] = self.test_plot_payments(plot_id)
                        results["plot_statements"] = self.test_plot_statements(plot_id)
                    
                    results["map_upload"] = self.test_map_upload(layout_id)
                
                results["cashflow_stats"] = self.test_cashflow_stats()
                results["reports"] = self.test_reports()
                results["logout"] = self.test_logout()
        
        return results

def main():
    """Main test runner"""
    print("RealtyPay Backend API Testing")
    print("=" * 40)
    
    tester = RealtyPayAPITester()
    results = tester.run_all_tests()
    
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    
    passed_tests = []
    failed_tests = []
    
    for test_name, result in results.items():
        if test_name in ["customer_id", "layout_id", "plot_id"]:
            continue
        if result:
            passed_tests.append(test_name)
        else:
            failed_tests.append(test_name)
    
    print(f"✅ Passed: {len(passed_tests)}/{tester.tests_run}")
    print(f"❌ Failed: {len(failed_tests)}/{tester.tests_run}")
    print(f"📈 Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if failed_tests:
        print(f"\n❌ Failed Tests: {', '.join(failed_tests)}")
    
    if passed_tests:
        print(f"\n✅ Passed Tests: {', '.join(passed_tests)}")
    
    # Return appropriate exit code
    return 0 if len(failed_tests) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())