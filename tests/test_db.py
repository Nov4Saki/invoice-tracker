"""
Unit Tests for Database Layer and Financial Calculations.
Zero external dependencies, using Python standard unittest.
"""

import unittest
import sqlite3
import os
import tempfile
import shutil

# Override DB path for test isolation
from app import db


class TestDatabaseLayer(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        db.DB_DIR = self.test_dir
        db.DB_PATH = os.path.join(self.test_dir, "test_invoices.db")
        db.init_db()

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_schema_initialization(self):
        conn = db.get_db_connection()
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
        table_names = [t["name"] for t in tables]
        self.assertIn("customers", table_names)
        self.assertIn("invoices", table_names)
        self.assertIn("invoice_items", table_names)
        self.assertIn("products", table_names)
        self.assertIn("settings", table_names)
        conn.close()

    def test_seed_data_created(self):
        conn = db.get_db_connection()
        customers = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
        invoices = conn.execute("SELECT COUNT(*) FROM invoices").fetchone()[0]
        products = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        self.assertGreaterEqual(customers, 5)
        self.assertGreaterEqual(invoices, 8)
        self.assertGreaterEqual(products, 6)
        conn.close()

    def test_customer_creation_and_stats(self):
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)",
            ("Test Customer", "test@domain.com", "+966500000000")
        )
        cust_id = cursor.lastrowid
        conn.commit()

        # Insert an invoice
        cursor.execute("""
            INSERT INTO invoices (
                invoice_number, customer_id, issue_date, due_date, status,
                subtotal, cost_total, discount_amount, tax_rate, tax_amount,
                shipping_fee, total_amount, paid_amount, net_profit
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "INV-TEST-01", cust_id, "2026-10-20", "2026-10-25", "paid",
            1000.0, 600.0, 50.0, 15.0, 142.5, 0.0, 1092.5, 1092.5, 350.0
        ))
        conn.commit()

        # Check customer spent and profit
        stats = conn.execute("""
            SELECT
                COUNT(id) as total_orders,
                SUM(total_amount) as total_spent,
                SUM(net_profit) as total_profit
            FROM invoices
            WHERE customer_id = ?
        """, (cust_id,)).fetchone()

        self.assertEqual(stats["total_orders"], 1)
        self.assertEqual(stats["total_spent"], 1092.5)
        self.assertEqual(stats["total_profit"], 350.0)
        conn.close()

    def test_cascade_delete_customer(self):
        conn = db.get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO customers (name) VALUES (?)",
            ("Deletable Customer",)
        )
        cust_id = cursor.lastrowid
        cursor.execute("""
            INSERT INTO invoices (
                invoice_number, customer_id, issue_date, due_date, status,
                subtotal, cost_total, total_amount, paid_amount, net_profit
            ) VALUES (?, ?, '2026-10-20', '2026-10-20', 'pending', 100, 50, 100, 0, 50)
        """, ("INV-CASCADE", cust_id))
        conn.commit()

        # Delete customer
        conn.execute("DELETE FROM customers WHERE id = ?", (cust_id,))
        conn.commit()

        # Invoices should be deleted via ON DELETE CASCADE
        inv = conn.execute("SELECT id FROM invoices WHERE customer_id = ?", (cust_id,)).fetchone()
        self.assertIsNone(inv)
        conn.close()


if __name__ == "__main__":
    unittest.main()
