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
        db.init_db()

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


if __name__ == "__main__":
    unittest.main()
