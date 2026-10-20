"""
Integration & End-to-End Tests for Invoice Tracker REST API.
Zero external dependencies, using Python standard unittest and urllib.
"""

import unittest
import urllib.request
import urllib.parse
import json
import threading
import tempfile
import shutil
import os
import socket

from app import db, server


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class TestInvoiceAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_dir = tempfile.mkdtemp()
        db.DB_DIR = cls.test_dir
        db.DB_PATH = os.path.join(cls.test_dir, "api_test.db")
        db.init_db(seed_sample=True)

        cls.port = find_free_port()
        cls.httpd = server.run_server(port=cls.port)
        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        shutil.rmtree(cls.test_dir, ignore_errors=True)

    def request(self, path, method="GET", body=None):
        url = f"{self.base_url}{path}"
        data = None
        headers = {}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content)

    def test_get_stats_and_charts(self):
        status, data = self.request("/api/stats")
        self.assertEqual(status, 200)
        self.assertTrue(data["success"])
        self.assertIn("summary", data)
        self.assertGreater(data["summary"]["total_revenue"], 0)
        self.assertGreater(data["summary"]["total_profit"], 0)
        self.assertIn("histogram", data)
        self.assertIn("pie_charts", data)
        self.assertIn("profit_cost", data["pie_charts"])

    def test_create_customer_and_search(self):
        # Create unique customer
        unique_phone = "+966599988776"
        status, res = self.request("/api/customers", method="POST", body={
            "name": "Mahmoud Al-Zahrani",
            "phone": unique_phone,
            "email": "mahmoud@test.com",
            "address": "Dammam"
        })
        self.assertEqual(status, 200)
        cust_id = res["customer_id"]

        # Fast search by phone
        status, search_res = self.request(f"/api/search?q={unique_phone}")
        self.assertEqual(status, 200)
        matched_custs = search_res["customers"]
        self.assertTrue(any(c["id"] == cust_id for c in matched_custs))

        # Fast search by name
        status, search_res = self.request("/api/search?q=Mahmoud")
        self.assertEqual(status, 200)
        self.assertTrue(any(c["id"] == cust_id for c in search_res["customers"]))

    def test_create_and_edit_future_order(self):
        # Get customer ID
        _, cust_data = self.request("/api/customers")
        cust_id = cust_data["customers"][0]["id"]

        # Create future order with issue_date and due_date in 2027
        order_payload = {
            "customer_id": cust_id,
            "invoice_number": "INV-FUTURE-001",
            "issue_date": "2027-01-15",
            "due_date": "2027-01-30",
            "status": "pending",
            "discount_amount": 0,
            "tax_rate": 15,
            "shipping_fee": 25,
            "paid_amount": 0,
            "notes": "Future scheduled delivery",
            "items": [
                {
                    "description": "Custom Enterprise Server",
                    "quantity": 2,
                    "unit_price": 5000.0,
                    "cost_price": 3500.0,
                    "discount": 0
                }
            ]
        }
        status, res = self.request("/api/invoices", method="POST", body=order_payload)
        self.assertEqual(status, 200)
        inv_id = res["invoice_id"]

        # Verify created values
        status, detail = self.request(f"/api/invoices/{inv_id}")
        self.assertEqual(status, 200)
        inv = detail["invoice"]
        self.assertEqual(inv["subtotal"], 10000.0)
        self.assertEqual(inv["cost_total"], 7000.0)
        self.assertEqual(inv["net_profit"], 3000.0)
        self.assertEqual(inv["tax_amount"], 1500.0)
        self.assertEqual(inv["total_amount"], 11525.0)

        # Edit future order: update quantity and due date
        edit_payload = {
            "due_date": "2027-02-10",
            "notes": "Rescheduled delivery date",
            "items": [
                {
                    "description": "Custom Enterprise Server",
                    "quantity": 3,
                    "unit_price": 5000.0,
                    "cost_price": 3500.0,
                    "discount": 500.0
                }
            ]
        }
        status, edit_res = self.request(f"/api/invoices/{inv_id}", method="PUT", body=edit_payload)
        self.assertEqual(status, 200)

        # Verify edited values
        _, updated_detail = self.request(f"/api/invoices/{inv_id}")
        updated_inv = updated_detail["invoice"]
        self.assertEqual(updated_inv["due_date"], "2027-02-10")
        self.assertEqual(updated_inv["subtotal"], 14500.0)  # (3 * 5000) - 500
        self.assertEqual(updated_inv["cost_total"], 10500.0) # 3 * 3500
        self.assertEqual(updated_inv["net_profit"], 4000.0) # 14500 - 10500

        # Verify future_only query returns this scheduled order
        status, future_list = self.request("/api/invoices?future_only=true")
        self.assertEqual(status, 200)
        self.assertTrue(any(i["id"] == inv_id for i in future_list["invoices"]))

    def test_record_partial_and_full_payment(self):
        # Create an invoice
        _, cust_data = self.request("/api/customers")
        cust_id = cust_data["customers"][0]["id"]

        status, res = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_id,
            "invoice_number": "INV-PAY-01",
            "issue_date": "2026-10-20",
            "due_date": "2026-10-25",
            "status": "pending",
            "items": [{"description": "Service Contract", "quantity": 1, "unit_price": 1000, "cost_price": 200, "discount": 0}]
        })
        inv_id = res["invoice_id"]

        # Pay partial amount (400)
        status, pay_res = self.request(f"/api/invoices/{inv_id}/pay", method="POST", body={"amount": 400.0})
        self.assertEqual(status, 200)
        self.assertEqual(pay_res["status"], "partial")
        self.assertEqual(pay_res["paid_amount"], 400.0)

        # Pay remaining amount (600)
        status, pay_res2 = self.request(f"/api/invoices/{inv_id}/pay", method="POST", body={"amount": 600.0})
        self.assertEqual(status, 200)
        self.assertEqual(pay_res2["status"], "paid")
        self.assertEqual(pay_res2["paid_amount"], 1000.0)

    def test_inventory_mode_stock_validation_and_deduction(self):
        # Enable inventory mode
        self.request("/api/settings", method="POST", body={"inventory_mode": "true"})

        # Create a product with stock = 5
        status, p_res = self.request("/api/products", method="POST", body={
            "name": "Inventory Test Widget",
            "sku": "WIDGET-001",
            "unit_price": 100.0,
            "cost_price": 60.0,
            "stock_quantity": 5,
            "min_stock_alert": 2
        })
        self.assertEqual(status, 200)
        prod_id = p_res["product_id"]

        _, cust_data = self.request("/api/customers")
        cust_id = cust_data["customers"][0]["id"]

        # Try to order quantity 10 (exceeds 5) -> should be rejected with 400
        try:
            self.request("/api/invoices", method="POST", body={
                "customer_id": cust_id,
                "items": [{
                    "product_id": prod_id,
                    "description": "Inventory Test Widget",
                    "quantity": 10,
                    "unit_price": 100.0,
                    "cost_price": 60.0
                }]
            })
            self.fail("Expected order to fail due to insufficient inventory")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)

        # Order quantity 3 (valid)
        status, inv_res = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_id,
            "items": [{
                "product_id": prod_id,
                "description": "Inventory Test Widget",
                "quantity": 3,
                "unit_price": 100.0,
                "cost_price": 60.0
            }]
        })
        self.assertEqual(status, 200)

        # Verify stock decreased from 5 to 2
        _, prods_res = self.request(f"/api/products?search=WIDGET-001")
        widget = next(p for p in prods_res["products"] if p["id"] == prod_id)
        self.assertEqual(widget["stock_quantity"], 2)
        self.assertEqual(widget["is_low_stock"], 1)  # 2 <= min_stock_alert (2)

        # Restock 10 items
        status, restock_res = self.request(f"/api/products/{prod_id}/restock", method="POST", body={"quantity": 10})
        self.assertEqual(status, 200)
        self.assertEqual(restock_res["new_stock_quantity"], 12)

    def test_loss_calculation_when_costs_exceed_revenue(self):
        """Verify loss (negative profit) is correctly calculated when selling below cost."""
        _, cust_data = self.request("/api/customers")
        cust_id = cust_data["customers"][0]["id"]

        status, res = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_id,
            "invoice_number": "INV-LOSS-TEST",
            "items": [
                {
                    "description": "Clearance Item (Sold at loss)",
                    "quantity": 1,
                    "unit_price": 50.0,
                    "cost_price": 120.0,
                    "discount": 0
                }
            ]
        })
        self.assertEqual(status, 200)
        inv_id = res["invoice_id"]

        _, detail = self.request(f"/api/invoices/{inv_id}")
        inv = detail["invoice"]
        self.assertEqual(inv["subtotal"], 50.0)
        self.assertEqual(inv["cost_total"], 120.0)
        self.assertEqual(inv["net_profit"], -70.0)  # Exact loss of 70

    def test_empty_search_and_no_match(self):
        status, empty_res = self.request("/api/search?q=")
        self.assertEqual(status, 200)
        self.assertEqual(len(empty_res["customers"]), 0)
        self.assertEqual(len(empty_res["invoices"]), 0)

        status, no_match = self.request("/api/search?q=NonExistent999999999")
        self.assertEqual(status, 200)
        self.assertEqual(len(no_match["customers"]), 0)
        self.assertEqual(len(no_match["invoices"]), 0)

    def test_customer_detail_with_zero_orders(self):
        # Create a new customer with no orders
        status, c_res = self.request("/api/customers", method="POST", body={
            "name": "Brand New Customer Zero Orders",
            "phone": "+966512399999"
        })
        self.assertEqual(status, 200)
        cid = c_res["customer_id"]

        status, detail = self.request(f"/api/customers/{cid}")
        self.assertEqual(status, 200)
        cust = detail["customer"]
        self.assertEqual(cust["stats"]["total_orders"], 0)
        self.assertEqual(cust["stats"]["total_revenue"], 0.0)
        self.assertEqual(cust["stats"]["total_profit"], 0.0)
        self.assertEqual(len(cust["orders"]), 0)

    def test_multi_item_same_product_stock_validation(self):
        """Ensure multiple line items of the same product aggregate and reject when exceeding stock."""
        self.request("/api/settings", method="POST", body={"inventory_mode": "true"})

        # Create product with stock = 5
        _, p_res = self.request("/api/products", method="POST", body={
            "name": "Multi Line Stock Item",
            "sku": "MULTI-001",
            "unit_price": 50.0,
            "cost_price": 25.0,
            "stock_quantity": 5
        })
        prod_id = p_res["product_id"]

        _, cust_data = self.request("/api/customers")
        cust_id = cust_data["customers"][0]["id"]

        # Try to order 2 lines of 3 units each = 6 units (exceeds stock of 5)
        try:
            self.request("/api/invoices", method="POST", body={
                "customer_id": cust_id,
                "status": "pending",
                "items": [
                    {"product_id": prod_id, "description": "Multi Line 1", "quantity": 3, "unit_price": 50, "cost_price": 25},
                    {"product_id": prod_id, "description": "Multi Line 2", "quantity": 3, "unit_price": 50, "cost_price": 25}
                ]
            })
            self.fail("Expected order to fail when multiple items of same product exceed available stock")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)

        # Stock must remain intact at 5
        _, prods_res = self.request("/api/products?search=MULTI-001")
        prod = next(p for p in prods_res["products"] if p["id"] == prod_id)
        self.assertEqual(prod["stock_quantity"], 5)

    def test_update_invoice_stock_validation_and_status_changes(self):
        """Test stock validation during invoice updates and restoration on cancellation."""
        self.request("/api/settings", method="POST", body={"inventory_mode": "true"})

        # Product with stock = 10
        _, p_res = self.request("/api/products", method="POST", body={
            "name": "Update Stock Item",
            "sku": "UP-001",
            "unit_price": 100.0,
            "cost_price": 40.0,
            "stock_quantity": 10
        })
        prod_id = p_res["product_id"]

        _, cust_data = self.request("/api/customers")
        cust_id = cust_data["customers"][0]["id"]

        # Create invoice with 4 units (stock becomes 6)
        _, inv_res = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_id,
            "status": "pending",
            "items": [{"product_id": prod_id, "description": "Up Item", "quantity": 4, "unit_price": 100, "cost_price": 40}]
        })
        inv_id = inv_res["invoice_id"]

        _, prods = self.request("/api/products?search=UP-001")
        p = next(x for x in prods["products"] if x["id"] == prod_id)
        self.assertEqual(p["stock_quantity"], 6)

        # Try updating to quantity 12 (needs 8 more, but only 6 available) -> rejected with 400
        try:
            self.request(f"/api/invoices/{inv_id}", method="PUT", body={
                "items": [{"product_id": prod_id, "description": "Up Item", "quantity": 12, "unit_price": 100, "cost_price": 40}]
            })
            self.fail("Expected update to fail due to insufficient inventory")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)

        # Stock must remain 6
        _, prods = self.request("/api/products?search=UP-001")
        p = next(x for x in prods["products"] if x["id"] == prod_id)
        self.assertEqual(p["stock_quantity"], 6)

        # Cancel invoice -> stock restored to 10
        status, _ = self.request(f"/api/invoices/{inv_id}", method="PUT", body={"status": "cancelled"})
        self.assertEqual(status, 200)

        _, prods = self.request("/api/products?search=UP-001")
        p = next(x for x in prods["products"] if x["id"] == prod_id)
        self.assertEqual(p["stock_quantity"], 10)

        # Un-cancel invoice (set to pending) -> stock deducted again to 6
        status, _ = self.request(f"/api/invoices/{inv_id}", method="PUT", body={"status": "pending"})
        self.assertEqual(status, 200)

        _, prods = self.request("/api/products?search=UP-001")
        p = next(x for x in prods["products"] if x["id"] == prod_id)
        self.assertEqual(p["stock_quantity"], 6)

    def test_customer_deletion_restores_inventory(self):
        """Deleting a customer cascades and properly restores deducted stock."""
        self.request("/api/settings", method="POST", body={"inventory_mode": "true"})

        # Product with stock = 20
        _, p_res = self.request("/api/products", method="POST", body={
            "name": "Cascade Restock Product",
            "sku": "CASC-001",
            "unit_price": 80.0,
            "cost_price": 30.0,
            "stock_quantity": 20
        })
        prod_id = p_res["product_id"]

        # Create isolated customer
        _, c_res = self.request("/api/customers", method="POST", body={
            "name": "Customer To Be Deleted",
            "phone": "+966588887777"
        })
        cust_id = c_res["customer_id"]

        # Customer creates invoice with 8 units (stock becomes 12)
        status, _ = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_id,
            "status": "pending",
            "items": [{"product_id": prod_id, "description": "Casc Item", "quantity": 8, "unit_price": 80, "cost_price": 30}]
        })
        self.assertEqual(status, 200)

        _, prods = self.request("/api/products?search=CASC-001")
        p = next(x for x in prods["products"] if x["id"] == prod_id)
        self.assertEqual(p["stock_quantity"], 12)

        # Delete customer
        status, del_res = self.request(f"/api/customers/{cust_id}", method="DELETE")
        self.assertEqual(status, 200)
        self.assertTrue(del_res["success"])

        # Stock must be restored to 20!
        _, prods = self.request("/api/products?search=CASC-001")
        p = next(x for x in prods["products"] if x["id"] == prod_id)
        self.assertEqual(p["stock_quantity"], 20)

    def test_invoice_analytics_and_dashboard_payload(self):
        """Verify get_invoice_detail returns complete financial analytics breakdown and charts data."""
        _, cust_data = self.request("/api/customers")
        cust_id = cust_data["customers"][0]["id"]

        status, inv_res = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_id,
            "invoice_number": "INV-ANALYTICS-01",
            "issue_date": "2026-10-20",
            "due_date": "2026-10-30",
            "status": "pending",
            "tax_rate": 15,
            "shipping_fee": 30,
            "items": [
                {"description": "Profitable Widget", "quantity": 2, "unit_price": 100, "cost_price": 40},
                {"description": "Loss Widget", "quantity": 1, "unit_price": 20, "cost_price": 50}
            ]
        })
        self.assertEqual(status, 200)
        inv_id = inv_res["invoice_id"]

        status, detail = self.request(f"/api/invoices/{inv_id}")
        self.assertEqual(status, 200)
        inv = detail["invoice"]

        # Check invoice totals:
        # Subtotal = 2*100 + 1*20 = 220
        # Cost = 2*40 + 1*50 = 130
        # Net profit = 220 - 130 = 90
        self.assertEqual(inv["subtotal"], 220.0)
        self.assertEqual(inv["cost_total"], 130.0)
        self.assertEqual(inv["net_profit"], 90.0)

        # Check analytics payload
        self.assertIn("analytics", inv)
        analytics = inv["analytics"]
        self.assertFalse(analytics["is_loss"])
        self.assertGreater(analytics["margin_pct"], 0)
        self.assertIn("pie_chart", analytics)
        self.assertGreaterEqual(len(analytics["pie_chart"]), 2) # profit + cost (+ tax/shipping)

        # Check item breakdown
        breakdown = analytics["item_breakdown"]
        self.assertEqual(len(breakdown), 2)
        profitable_item = next(it for it in breakdown if it["name"] == "Profitable Widget")
        self.assertFalse(profitable_item["is_loss"])
        self.assertEqual(profitable_item["profit"], 120.0) # 200 - 80

        loss_item = next(it for it in breakdown if it["name"] == "Loss Widget")
        self.assertTrue(loss_item["is_loss"])
        self.assertEqual(loss_item["profit"], -30.0) # 20 - 50

    def test_search_by_customer_phone_and_email_returns_invoices(self):
        """Unified search should match customer invoices when searching by customer phone or email."""
        unique_phone = "+966577712345"
        unique_email = "tracker_search@testcorp.com"
        _, c_res = self.request("/api/customers", method="POST", body={
            "name": "Phone Search Customer",
            "phone": unique_phone,
            "email": unique_email
        })
        cust_id = c_res["customer_id"]

        _, inv_res = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_id,
            "invoice_number": "INV-PHONE-SEARCH",
            "items": [{"description": "Searchable Order", "quantity": 1, "unit_price": 500, "cost_price": 200}]
        })
        inv_id = inv_res["invoice_id"]

        # Search by phone
        _, search_by_phone = self.request(f"/api/search?q={unique_phone}")
        matched_inv_ids = [i["id"] for i in search_by_phone["invoices"]]
        self.assertIn(inv_id, matched_inv_ids)

        # Search by email
        _, search_by_email = self.request(f"/api/search?q={unique_email}")
        matched_inv_ids_email = [i["id"] for i in search_by_email["invoices"]]
        self.assertIn(inv_id, matched_inv_ids_email)

    def test_heartbeat_api_get_and_post(self):
        status, data = self.request("/api/heartbeat")
        self.assertEqual(status, 200)
        self.assertTrue(data["success"])
        self.assertEqual(data["status"], "alive")

        status, post_data = self.request("/api/heartbeat", method="POST", body={"ping": True})
        self.assertEqual(status, 200)
        self.assertTrue(post_data["success"])

    def test_heartbeat_closing_signal(self):
        status, data = self.request("/api/heartbeat?closing=1", method="POST", body={})
        self.assertEqual(status, 200)
        self.assertTrue(data["success"])
        self.assertTrue(server.server_state.client_closed)

    def test_heartbeat_multi_tab_and_refresh_resilience(self):
        """Simulate multi-tab browsing and F5 page refresh to verify server does not shut down prematurely."""
        state = server.server_state
        state.heartbeat_received = True

        # Tab 1 connects
        self.request("/api/heartbeat?tab_id=tab_alpha", method="POST", body={})
        self.assertTrue(state.should_keep_running(heartbeat_timeout=5.0, close_grace=0.5))

        # Tab 2 connects
        self.request("/api/heartbeat?tab_id=tab_beta", method="POST", body={})
        self.assertTrue(state.should_keep_running(heartbeat_timeout=5.0, close_grace=0.5))

        # Tab 1 closes -> Tab 2 is still alive, so should_keep_running MUST be True
        self.request("/api/heartbeat?closing=1&tab_id=tab_alpha", method="POST", body={})
        self.assertTrue(state.should_keep_running(heartbeat_timeout=5.0, close_grace=0.5))

        # Tab 2 refreshes: beforeunload sends closing for tab_beta
        self.request("/api/heartbeat?closing=1&tab_id=tab_beta", method="POST", body={})
        # Immediately within grace period, should_keep_running must still be True!
        self.assertTrue(state.should_keep_running(heartbeat_timeout=5.0, close_grace=1.0))

        # Refreshed tab connects with tab_gamma
        self.request("/api/heartbeat?tab_id=tab_gamma", method="POST", body={})
        self.assertTrue(state.should_keep_running(heartbeat_timeout=5.0, close_grace=1.0))

        # Finally tab_gamma closes
        self.request("/api/heartbeat?closing=1&tab_id=tab_gamma", method="POST", body={})
        # After grace period expires (simulated with close_grace=0.0)
        self.assertFalse(state.should_keep_running(heartbeat_timeout=5.0, close_grace=0.0))

    def test_launcher_helpers(self):
        from app import launcher
        port = launcher.find_free_port(55000)
        self.assertIsInstance(port, int)
        self.assertGreater(port, 1024)

        base_dir = launcher.get_base_dir()
        self.assertTrue(os.path.isdir(base_dir))

        app_data = launcher.get_app_data_dir()
        self.assertTrue("app_profile" in app_data)

    def test_multicurrency_invoices_and_customer_preferences(self):
        """Verify multi-currency support: default EGP, customer preference inheritance, and custom invoice currency."""
        # 1. Check default settings currency is EGP
        status, set_res = self.request("/api/settings")
        self.assertEqual(status, 200)
        self.assertEqual(set_res["settings"]["currency"], "EGP")
        self.assertEqual(set_res["settings"]["currency_symbol"], "ج.م")

        # 2. Create customer with preferred_currency = 'SAR'
        status, cust_sar_res = self.request("/api/customers", method="POST", body={
            "name": "Riyadh Trading Est",
            "phone": "+966512345678",
            "preferred_currency": "SAR"
        })
        self.assertEqual(status, 200)
        cust_sar_id = cust_sar_res["customer_id"]

        status, get_cust = self.request(f"/api/customers/{cust_sar_id}")
        self.assertEqual(status, 200)
        self.assertEqual(get_cust["customer"]["preferred_currency"], "SAR")

        # 3. Create customer without preferred_currency (defaults to EGP)
        status, cust_egp_res = self.request("/api/customers", method="POST", body={
            "name": "Cairo Supplies Co",
            "phone": "+201000000001"
        })
        self.assertEqual(status, 200)
        cust_egp_id = cust_egp_res["customer_id"]

        status, get_cust_egp = self.request(f"/api/customers/{cust_egp_id}")
        self.assertEqual(status, 200)
        self.assertEqual(get_cust_egp["customer"]["preferred_currency"], "EGP")

        # 4. Create invoice for SAR customer WITHOUT specifying currency -> inherits SAR
        status, inv1_res = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_sar_id,
            "invoice_number": "INV-AUTO-SAR",
            "issue_date": "2026-10-20",
            "due_date": "2026-10-25",
            "status": "pending",
            "items": [{"description": "Service in SAR", "quantity": 1, "unit_price": 500, "cost_price": 200}]
        })
        self.assertEqual(status, 200)
        self.assertEqual(inv1_res["currency"], "SAR")
        self.assertEqual(inv1_res["currency_symbol"], "ر.س")

        status, get_inv1 = self.request(f"/api/invoices/{inv1_res['invoice_id']}")
        self.assertEqual(status, 200)
        self.assertEqual(get_inv1["invoice"]["currency"], "SAR")
        self.assertEqual(get_inv1["invoice"]["currency_symbol"], "ر.س")

        # 5. Create invoice with explicit currency override (USD)
        status, inv2_res = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_egp_id,
            "invoice_number": "INV-MANUAL-USD",
            "issue_date": "2026-10-20",
            "due_date": "2026-10-25",
            "status": "pending",
            "currency": "USD",
            "currency_symbol": "$",
            "items": [{"description": "Cloud Subscription", "quantity": 2, "unit_price": 50, "cost_price": 20}]
        })
        self.assertEqual(status, 200)
        self.assertEqual(inv2_res["currency"], "USD")
        self.assertEqual(inv2_res["currency_symbol"], "$")

        status, get_inv2 = self.request(f"/api/invoices/{inv2_res['invoice_id']}")
        self.assertEqual(status, 200)
        self.assertEqual(get_inv2["invoice"]["currency"], "USD")
        self.assertEqual(get_inv2["invoice"]["currency_symbol"], "$")

        # 6. Update invoice currency via PUT
        status, update_res = self.request(f"/api/invoices/{inv2_res['invoice_id']}", method="PUT", body={
            "currency": "EUR",
            "currency_symbol": "€"
        })
        self.assertEqual(status, 200)
        status, get_inv2_updated = self.request(f"/api/invoices/{inv2_res['invoice_id']}")
        self.assertEqual(status, 200)
        self.assertEqual(get_inv2_updated["invoice"]["currency"], "EUR")
        self.assertEqual(get_inv2_updated["invoice"]["currency_symbol"], "€")

        # 7. Fast search returns currency info
        status, search_res = self.request("/api/search?q=MANUAL-USD")
        self.assertEqual(status, 200)
        self.assertTrue(len(search_res["invoices"]) >= 1)
        found_inv = next(i for i in search_res["invoices"] if i["id"] == inv2_res["invoice_id"])
        self.assertEqual(found_inv["currency"], "EUR")
        self.assertEqual(found_inv["currency_symbol"], "€")

    def test_currency_sanitization_against_undefined_and_null(self):
        """Verify API protects against javascript 'undefined' / 'null' strings in currency fields."""
        _, cust_data = self.request("/api/customers")
        cust_id = cust_data["customers"][0]["id"]

        # 1. POST with "undefined" strings
        status, res1 = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_id,
            "invoice_number": "INV-SANITIZED-01",
            "currency": "undefined",
            "currency_symbol": "undefined",
            "items": [{"description": "Item", "quantity": 1, "unit_price": 100, "cost_price": 50}]
        })
        self.assertEqual(status, 200)
        self.assertNotIn(res1["currency"], ("undefined", "null", ""))
        self.assertNotIn(res1["currency_symbol"], ("undefined", "null", ""))
        self.assertIn(res1["currency"], ("EGP", "SAR", "USD"))
        self.assertIn(res1["currency_symbol"], ("ج.م", "ر.س", "$"))

        status, detail1 = self.request(f"/api/invoices/{res1['invoice_id']}")
        self.assertEqual(status, 200)
        inv1 = detail1["invoice"]
        self.assertNotEqual(inv1["currency"], "undefined")
        self.assertNotEqual(inv1["currency_symbol"], "undefined")

        # 2. POST with literal None / null
        status, res2 = self.request("/api/invoices", method="POST", body={
            "customer_id": cust_id,
            "invoice_number": "INV-SANITIZED-02",
            "currency": None,
            "currency_symbol": None,
            "items": [{"description": "Item", "quantity": 1, "unit_price": 200, "cost_price": 80}]
        })
        self.assertEqual(status, 200)
        self.assertIsNotNone(res2["currency"])
        self.assertIsNotNone(res2["currency_symbol"])

        # 3. PUT with "undefined" string preserves existing valid currency
        status, res3 = self.request(f"/api/invoices/{res1['invoice_id']}", method="PUT", body={
            "currency": "undefined",
            "currency_symbol": "undefined"
        })
        self.assertEqual(status, 200)
        status, detail3 = self.request(f"/api/invoices/{res1['invoice_id']}")
        self.assertEqual(status, 200)
        inv3 = detail3["invoice"]
        self.assertEqual(inv3["currency"], inv1["currency"])
        self.assertEqual(inv3["currency_symbol"], inv1["currency_symbol"])


if __name__ == "__main__":
    unittest.main()

