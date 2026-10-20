"""
High-performance REST API & Static File Server for Invoice Tracker.
Built entirely with Python standard library (zero external dependencies).
"""

import http.server
import json
import mimetypes
import os
import sqlite3
import sys
import urllib.parse
from datetime import datetime
from app.db import get_db_connection, init_db

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")


def dict_from_row(row):
    return {k: row[k] for k in row.keys()} if row else None


class InvoiceAPIHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress routine GET logging for silent, fast performance
        pass

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message, status=400):
        self.send_json({"error": message, "success": False}, status=status)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def read_json_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        raw = self.wfile if False else self.rfile.read(content_length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    # ========================== ROUTING ==========================

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # API Routes
        if path.startswith("/api/"):
            try:
                self.handle_api_get(path, query)
            except Exception as e:
                self.send_error_json(str(e), 500)
            return

        # Static file serving
        self.serve_static(path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()
        try:
            self.handle_api_post(path, body)
        except Exception as e:
            self.send_error_json(str(e), 500)

    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()
        try:
            self.handle_api_put(path, body)
        except Exception as e:
            self.send_error_json(str(e), 500)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        try:
            self.handle_api_delete(path)
        except Exception as e:
            self.send_error_json(str(e), 500)

    # ========================== STATIC FILES ==========================

    def serve_static(self, path):
        if path == "/" or path == "":
            path = "/index.html"

        # Sanitize path to prevent directory traversal
        rel_path = os.path.normpath(path.lstrip("/\\"))
        file_path = os.path.join(STATIC_DIR, rel_path)

        if not os.path.isfile(file_path):
            file_path = os.path.join(STATIC_DIR, "index.html")

        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = "text/plain; charset=utf-8"
        elif content_type.startswith("text/") or content_type == "application/javascript":
            content_type += "; charset=utf-8"

        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-cache, must-revalidate")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(404, f"File not found: {e}")

    # ========================== API GET ==========================

    def handle_api_get(self, path, query):
        conn = get_db_connection()
        try:
            if path == "/api/stats":
                self.get_stats(conn, query)
            elif path == "/api/invoices":
                self.get_invoices(conn, query)
            elif path.startswith("/api/invoices/"):
                inv_id = path.split("/")[-1]
                self.get_invoice_detail(conn, inv_id)
            elif path == "/api/customers":
                self.get_customers(conn, query)
            elif path.startswith("/api/customers/"):
                cust_id = path.split("/")[-1]
                self.get_customer_detail(conn, cust_id)
            elif path == "/api/products":
                self.get_products(conn, query)
            elif path == "/api/settings":
                self.get_settings(conn)
            elif path == "/api/search":
                self.fast_search(conn, query)
            else:
                self.send_error_json("Endpoint not found", 404)
        finally:
            conn.close()

    # ========================== STATS & FINANCIAL REPORTS ==========================

    def get_stats(self, conn, query):
        customer_id = query.get("customer_id", [None])[0]
        period = query.get("period", ["all"])[0]  # all, 30days, 90days, year

        where_clauses = ["status != 'cancelled'"]
        params = []

        if customer_id:
            where_clauses.append("customer_id = ?")
            params.append(customer_id)

        if period == "30days":
            where_clauses.append("issue_date >= date('now', '-30 days')")
        elif period == "90days":
            where_clauses.append("issue_date >= date('now', '-90 days')")
        elif period == "year":
            where_clauses.append("issue_date >= date('now', '-365 days')")

        where_sql = " AND ".join(where_clauses)

        # Overall summary
        summary = conn.execute(f"""
            SELECT
                COUNT(id) as total_invoices,
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(SUM(cost_total), 0) as total_cost,
                COALESCE(SUM(net_profit), 0) as total_profit,
                COALESCE(SUM(paid_amount), 0) as total_paid,
                COALESCE(SUM(total_amount - paid_amount), 0) as total_unpaid
            FROM invoices
            WHERE {where_sql}
        """, params).fetchone()

        total_rev = summary["total_revenue"]
        total_cost = summary["total_cost"]
        total_profit = summary["total_profit"]
        margin_pct = round((total_profit / total_rev * 100), 1) if total_rev > 0 else 0.0

        # Status counts
        status_where = ["1=1"]
        status_params = []
        if customer_id:
            status_where.append("customer_id = ?")
            status_params.append(customer_id)

        status_rows = conn.execute(f"""
            SELECT status, COUNT(id) as count, COALESCE(SUM(total_amount), 0) as total
            FROM invoices
            WHERE {" AND ".join(status_where)}
            GROUP BY status
        """, status_params).fetchall()

        status_map = {r["status"]: {"count": r["count"], "total": r["total"]} for r in status_rows}

        # Histogram data: Monthly aggregates (last 6 months or all)
        hist_sql = f"""
            SELECT
                strftime('%Y-%m', issue_date) as month_label,
                COUNT(id) as order_count,
                COALESCE(SUM(total_amount), 0) as revenue,
                COALESCE(SUM(cost_total), 0) as cost,
                COALESCE(SUM(net_profit), 0) as profit
            FROM invoices
            WHERE {where_sql}
            GROUP BY month_label
            ORDER BY month_label ASC
        """
        hist_rows = conn.execute(hist_sql, params).fetchall()
        histogram = [dict_from_row(r) for r in hist_rows]

        # Pie Chart: Profit vs Cost
        pie_profit_cost = [
            {"label": "Net Profit", "label_ar": "صافي الربح", "value": max(0.0, total_profit), "color": "#10B981"},
            {"label": "Cost of Goods", "label_ar": "تكلفة البضاعة", "value": max(0.0, total_cost), "color": "#3B82F6"}
        ]

        # Top Customers share
        top_cust_rows = conn.execute("""
            SELECT c.name, COALESCE(SUM(i.total_amount), 0) as total_revenue
            FROM customers c
            JOIN invoices i ON c.id = i.customer_id
            WHERE i.status != 'cancelled'
            GROUP BY c.id
            ORDER BY total_revenue DESC
            LIMIT 5
        """).fetchall()
        customer_share = [{"label": r["name"], "value": r["total_revenue"]} for r in top_cust_rows]

        # Customer count
        cust_count = conn.execute("SELECT COUNT(id) FROM customers").fetchone()[0]

        # Products count & low stock
        prod_stats = conn.execute("""
            SELECT
                COUNT(id) as total_products,
                COALESCE(SUM(CASE WHEN stock_quantity <= min_stock_alert THEN 1 ELSE 0 END), 0) as low_stock_count
            FROM products
        """).fetchone()

        self.send_json({
            "success": True,
            "summary": {
                "total_invoices": summary["total_invoices"],
                "total_revenue": total_rev,
                "total_cost": total_cost,
                "total_profit": total_profit,
                "margin_pct": margin_pct,
                "total_paid": summary["total_paid"],
                "total_unpaid": summary["total_unpaid"],
                "customer_count": cust_count,
                "product_count": prod_stats["total_products"],
                "low_stock_count": prod_stats["low_stock_count"]
            },
            "status_breakdown": status_map,
            "histogram": histogram,
            "pie_charts": {
                "profit_cost": pie_profit_cost,
                "customer_share": customer_share
            }
        })

    # ========================== INVOICES ==========================

    def get_invoices(self, conn, query):
        where = ["1=1"]
        params = []

        if "status" in query and query["status"][0]:
            where.append("i.status = ?")
            params.append(query["status"][0])

        if "customer_id" in query and query["customer_id"][0]:
            where.append("i.customer_id = ?")
            params.append(query["customer_id"][0])

        if "future_only" in query and query["future_only"][0] == "true":
            where.append("i.issue_date > date('now')")

        sql = f"""
            SELECT
                i.*,
                c.name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone,
                (i.total_amount - i.paid_amount) as balance_due
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            WHERE {" AND ".join(where)}
            ORDER BY i.issue_date DESC, i.id DESC
        """
        rows = conn.execute(sql, params).fetchall()

        invoices = []
        for r in rows:
            d = dict_from_row(r)
            # count items
            items_count = conn.execute(
                "SELECT COUNT(id) FROM invoice_items WHERE invoice_id = ?",
                (d["id"],)
            ).fetchone()[0]
            d["items_count"] = items_count
            invoices.append(d)

        self.send_json({"success": True, "invoices": invoices})

    def get_invoice_detail(self, conn, inv_id):
        inv = conn.execute("""
            SELECT
                i.*,
                c.name as customer_name,
                c.email as customer_email,
                c.phone as customer_phone,
                c.address as customer_address,
                (i.total_amount - i.paid_amount) as balance_due
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            WHERE i.id = ?
        """, (inv_id,)).fetchone()

        if not inv:
            self.send_error_json("Invoice not found", 404)
            return

        inv_dict = dict_from_row(inv)

        items = conn.execute("""
            SELECT
                ii.*,
                p.sku as product_sku,
                p.stock_quantity as current_stock
            FROM invoice_items ii
            LEFT JOIN products p ON ii.product_id = p.id
            WHERE ii.invoice_id = ?
            ORDER BY ii.id ASC
        """, (inv_id,)).fetchall()

        inv_dict["items"] = [dict_from_row(it) for it in items]
        self.send_json({"success": True, "invoice": inv_dict})

    # ========================== CUSTOMERS ==========================

    def get_customers(self, conn, query):
        search = query.get("search", [""])[0].strip()
        where = ""
        params = []
        if search:
            where = "WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?"
            term = f"%{search}%"
            params = [term, term, term]

        sql = f"""
            SELECT
                c.*,
                COUNT(i.id) as total_orders,
                COALESCE(SUM(CASE WHEN i.status != 'cancelled' THEN i.total_amount ELSE 0 END), 0) as total_spent,
                COALESCE(SUM(CASE WHEN i.status != 'cancelled' THEN i.net_profit ELSE 0 END), 0) as total_profit,
                COALESCE(SUM(CASE WHEN i.status != 'cancelled' THEN (i.total_amount - i.paid_amount) ELSE 0 END), 0) as total_unpaid,
                MAX(i.issue_date) as last_order_date
            FROM customers c
            LEFT JOIN invoices i ON c.id = i.customer_id
            {where}
            GROUP BY c.id
            ORDER BY total_spent DESC, c.id DESC
        """
        rows = conn.execute(sql, params).fetchall()
        self.send_json({"success": True, "customers": [dict_from_row(r) for r in rows]})

    def get_customer_detail(self, conn, cust_id):
        cust = conn.execute("SELECT * FROM customers WHERE id = ?", (cust_id,)).fetchone()
        if not cust:
            self.send_error_json("Customer not found", 404)
            return

        cust_dict = dict_from_row(cust)

        # Stats
        stats = conn.execute("""
            SELECT
                COUNT(id) as total_orders,
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN cost_total ELSE 0 END), 0) as total_cost,
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN net_profit ELSE 0 END), 0) as total_profit,
                COALESCE(SUM(CASE WHEN status != 'cancelled' THEN (total_amount - paid_amount) ELSE 0 END), 0) as unpaid_balance
            FROM invoices
            WHERE customer_id = ?
        """, (cust_id,)).fetchone()

        cust_dict["stats"] = dict_from_row(stats)

        # Orders list
        invoices = conn.execute("""
            SELECT
                id, invoice_number, issue_date, due_date, status,
                total_amount, paid_amount, net_profit, (total_amount - paid_amount) as balance_due
            FROM invoices
            WHERE customer_id = ?
            ORDER BY issue_date DESC, id DESC
        """, (cust_id,)).fetchall()

        cust_dict["orders"] = [dict_from_row(i) for i in invoices]

        # Monthly histogram for this specific customer
        hist_rows = conn.execute("""
            SELECT
                strftime('%Y-%m', issue_date) as month_label,
                COUNT(id) as order_count,
                COALESCE(SUM(total_amount), 0) as revenue,
                COALESCE(SUM(cost_total), 0) as cost,
                COALESCE(SUM(net_profit), 0) as profit
            FROM invoices
            WHERE customer_id = ? AND status != 'cancelled'
            GROUP BY month_label
            ORDER BY month_label ASC
        """, (cust_id,)).fetchall()
        cust_dict["histogram"] = [dict_from_row(r) for r in hist_rows]

        self.send_json({"success": True, "customer": cust_dict})

    # ========================== PRODUCTS & INVENTORY ==========================

    def get_products(self, conn, query):
        search = query.get("search", [""])[0].strip()
        where = ""
        params = []
        if search:
            where = "WHERE name LIKE ? OR sku LIKE ?"
            term = f"%{search}%"
            params = [term, term]

        rows = conn.execute(f"""
            SELECT
                *,
                (unit_price - cost_price) as margin_per_unit,
                (stock_quantity * cost_price) as total_stock_value,
                CASE WHEN stock_quantity <= min_stock_alert THEN 1 ELSE 0 END as is_low_stock
            FROM products
            {where}
            ORDER BY is_low_stock DESC, name ASC
        """, params).fetchall()

        self.send_json({"success": True, "products": [dict_from_row(r) for r in rows]})

    # ========================== SETTINGS ==========================

    def get_settings(self, conn):
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        settings = {r["key"]: r["value"] for r in rows}
        self.send_json({"success": True, "settings": settings})

    # ========================== FAST SEARCH ==========================

    def fast_search(self, conn, query):
        term = query.get("q", [""])[0].strip()
        if not term:
            self.send_json({"success": True, "customers": [], "invoices": [], "products": []})
            return

        like_term = f"%{term}%"

        # Search customers (name, email, phone)
        custs = conn.execute("""
            SELECT id, name, email, phone, address
            FROM customers
            WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?
            LIMIT 10
        """, (like_term, like_term, like_term)).fetchall()

        # Search invoices (number, customer name, date)
        invs = conn.execute("""
            SELECT i.id, i.invoice_number, i.issue_date, i.total_amount, i.status, c.name as customer_name
            FROM invoices i
            JOIN customers c ON i.customer_id = c.id
            WHERE i.invoice_number LIKE ? OR c.name LIKE ? OR i.issue_date LIKE ?
            LIMIT 10
        """, (like_term, like_term, like_term)).fetchall()

        # Search products
        prods = conn.execute("""
            SELECT id, name, sku, unit_price, cost_price, stock_quantity
            FROM products
            WHERE name LIKE ? OR sku LIKE ?
            LIMIT 10
        """, (like_term, like_term)).fetchall()

        self.send_json({
            "success": True,
            "customers": [dict_from_row(c) for c in custs],
            "invoices": [dict_from_row(i) for i in invs],
            "products": [dict_from_row(p) for p in prods]
        })

    # ========================== API POST ==========================

    def handle_api_post(self, path, body):
        conn = get_db_connection()
        try:
            if path == "/api/invoices":
                self.create_invoice(conn, body)
            elif path.startswith("/api/invoices/") and path.endswith("/pay"):
                inv_id = path.split("/")[3]
                self.record_payment(conn, inv_id, body)
            elif path == "/api/customers":
                self.create_customer(conn, body)
            elif path == "/api/products":
                self.create_product(conn, body)
            elif path.startswith("/api/products/") and path.endswith("/restock"):
                prod_id = path.split("/")[3]
                self.restock_product(conn, prod_id, body)
            elif path == "/api/settings":
                self.update_settings(conn, body)
            else:
                self.send_error_json("Endpoint not found", 404)
        finally:
            conn.close()

    def create_invoice(self, conn, data):
        cust_id = data.get("customer_id")
        if not cust_id:
            self.send_error_json("Customer ID is required", 400)
            return

        # Check inventory setting
        inv_mode_row = conn.execute("SELECT value FROM settings WHERE key = 'inventory_mode'").fetchone()
        inventory_mode = inv_mode_row["value"] == "true" if inv_mode_row else False

        items = data.get("items", [])
        if not items:
            self.send_error_json("At least one line item is required", 400)
            return

        # Check stock if inventory mode is enabled
        if inventory_mode:
            for item in items:
                prod_id = item.get("product_id")
                qty = float(item.get("quantity", 1))
                if prod_id:
                    prod = conn.execute("SELECT name, stock_quantity FROM products WHERE id = ?", (prod_id,)).fetchone()
                    if prod and prod["stock_quantity"] < qty:
                        self.send_error_json(
                            f"Insufficient stock for '{prod['name']}'. Available: {prod['stock_quantity']}, Requested: {qty}",
                            400
                        )
                        return

        # Generate invoice number if not provided
        inv_number = data.get("invoice_number")
        if not inv_number:
            now_year = datetime.now().year
            last_inv = conn.execute("SELECT id FROM invoices ORDER BY id DESC LIMIT 1").fetchone()
            next_seq = (last_inv["id"] + 1) if last_inv else 1
            inv_number = f"INV-{now_year}-{next_seq:04d}"

        issue_date = data.get("issue_date", datetime.now().strftime("%Y-%m-%d"))
        due_date = data.get("due_date", issue_date)
        status = data.get("status", "pending")
        discount = float(data.get("discount_amount", 0.0))
        tax_rate = float(data.get("tax_rate", 0.0))
        shipping = float(data.get("shipping_fee", 0.0))
        paid_amount = float(data.get("paid_amount", 0.0))
        notes = data.get("notes", "")

        # Compute totals
        subtotal = 0.0
        cost_total = 0.0
        calculated_items = []

        for itm in items:
            prod_id = itm.get("product_id")
            desc = itm.get("description", "").strip() or "Item"
            qty = float(itm.get("quantity", 1))
            unit_price = float(itm.get("unit_price", 0.0))
            cost_price = float(itm.get("cost_price", 0.0))
            itm_disc = float(itm.get("discount", 0.0))

            line_tot = round((qty * unit_price) - itm_disc, 2)
            line_cost = round(qty * cost_price, 2)
            line_profit = round(line_tot - line_cost, 2)

            subtotal += line_tot
            cost_total += line_cost
            calculated_items.append((prod_id, desc, qty, unit_price, cost_price, itm_disc, line_tot, line_profit))

        tax_amt = round((subtotal - discount) * (tax_rate / 100.0), 2) if (subtotal - discount) > 0 else 0.0
        total_amt = round(subtotal - discount + tax_amt + shipping, 2)
        net_prof = round((subtotal - discount) - cost_total, 2)

        # Status auto-update based on payment
        if status not in ["draft", "cancelled"]:
            if paid_amount >= total_amt and total_amt > 0:
                status = "paid"
            elif paid_amount > 0:
                status = "partial"
            else:
                status = "pending"

        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO invoices (
                invoice_number, customer_id, issue_date, due_date, status,
                subtotal, cost_total, discount_amount, tax_rate, tax_amount,
                shipping_fee, total_amount, paid_amount, net_profit, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            inv_number, cust_id, issue_date, due_date, status,
            subtotal, cost_total, discount, tax_rate, tax_amt,
            shipping, total_amt, paid_amount, net_prof, notes
        ))
        inv_id = cursor.lastrowid

        for ci in calculated_items:
            cursor.execute("""
                INSERT INTO invoice_items (
                    invoice_id, product_id, description, quantity,
                    unit_price, cost_price, discount, total, profit
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (inv_id, ci[0], ci[1], ci[2], ci[3], ci[4], ci[5], ci[6], ci[7]))

            # Decrement inventory stock if enabled and not cancelled/draft
            if inventory_mode and ci[0] and status != "cancelled":
                cursor.execute(
                    "UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?",
                    (ci[2], ci[0])
                )

        conn.commit()
        self.send_json({"success": True, "invoice_id": inv_id, "invoice_number": inv_number})

    def record_payment(self, conn, inv_id, data):
        amount = float(data.get("amount", 0.0))
        if amount <= 0:
            self.send_error_json("Payment amount must be greater than zero", 400)
            return

        inv = conn.execute("SELECT total_amount, paid_amount FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not inv:
            self.send_error_json("Invoice not found", 404)
            return

        new_paid = round(inv["paid_amount"] + amount, 2)
        total = inv["total_amount"]
        new_status = "paid" if new_paid >= total else "partial"

        conn.execute(
            "UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?",
            (new_paid, new_status, inv_id)
        )
        conn.commit()
        self.send_json({"success": True, "paid_amount": new_paid, "status": new_status})

    def create_customer(self, conn, data):
        name = data.get("name", "").strip()
        if not name:
            self.send_error_json("Customer name is required", 400)
            return

        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO customers (name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?)",
            (name, data.get("email", ""), data.get("phone", ""), data.get("address", ""), data.get("notes", ""))
        )
        conn.commit()
        self.send_json({"success": True, "customer_id": cursor.lastrowid})

    def create_product(self, conn, data):
        name = data.get("name", "").strip()
        if not name:
            self.send_error_json("Product name is required", 400)
            return

        sku = data.get("sku", "").strip() or None
        unit_price = float(data.get("unit_price", 0.0))
        cost_price = float(data.get("cost_price", 0.0))
        stock_qty = int(data.get("stock_quantity", 0))
        min_alert = int(data.get("min_stock_alert", 5))
        desc = data.get("description", "")

        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO products (name, sku, description, unit_price, cost_price, stock_quantity, min_stock_alert)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (name, sku, desc, unit_price, cost_price, stock_qty, min_alert))
            conn.commit()
            self.send_json({"success": True, "product_id": cursor.lastrowid})
        except sqlite3.IntegrityError as e:
            self.send_error_json("Product with this SKU already exists", 400)

    def restock_product(self, conn, prod_id, data):
        qty = int(data.get("quantity", 0))
        if qty <= 0:
            self.send_error_json("Quantity must be positive", 400)
            return

        conn.execute(
            "UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?",
            (qty, prod_id)
        )
        conn.commit()
        updated = conn.execute("SELECT stock_quantity FROM products WHERE id = ?", (prod_id,)).fetchone()
        self.send_json({"success": True, "new_stock_quantity": updated["stock_quantity"]})

    def update_settings(self, conn, data):
        cursor = conn.cursor()
        for k, v in data.items():
            cursor.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(k), str(v))
            )
        conn.commit()
        self.send_json({"success": True})

    # ========================== API PUT ==========================

    def handle_api_put(self, path, body):
        conn = get_db_connection()
        try:
            if path.startswith("/api/invoices/"):
                inv_id = path.split("/")[-1]
                self.update_invoice(conn, inv_id, body)
            elif path.startswith("/api/customers/"):
                cust_id = path.split("/")[-1]
                self.update_customer(conn, cust_id, body)
            elif path.startswith("/api/products/"):
                prod_id = path.split("/")[-1]
                self.update_product(conn, prod_id, body)
            else:
                self.send_error_json("Endpoint not found", 404)
        finally:
            conn.close()

    def update_invoice(self, conn, inv_id, data):
        existing = conn.execute("SELECT * FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if not existing:
            self.send_error_json("Invoice not found", 404)
            return

        inv_mode_row = conn.execute("SELECT value FROM settings WHERE key = 'inventory_mode'").fetchone()
        inventory_mode = inv_mode_row["value"] == "true" if inv_mode_row else False

        # If inventory tracking is enabled, restore the old items' stock first before deducting new ones
        cursor = conn.cursor()
        if inventory_mode and existing["status"] != "cancelled":
            old_items = cursor.execute(
                "SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?",
                (inv_id,)
            ).fetchall()
            for oi in old_items:
                if oi["product_id"]:
                    cursor.execute(
                        "UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?",
                        (oi["quantity"], oi["product_id"])
                    )

        # Parse new values
        cust_id = data.get("customer_id", existing["customer_id"])
        inv_number = data.get("invoice_number", existing["invoice_number"])
        issue_date = data.get("issue_date", existing["issue_date"])
        due_date = data.get("due_date", existing["due_date"])
        status = data.get("status", existing["status"])
        discount = float(data.get("discount_amount", existing["discount_amount"]))
        tax_rate = float(data.get("tax_rate", existing["tax_rate"]))
        shipping = float(data.get("shipping_fee", existing["shipping_fee"]))
        paid_amount = float(data.get("paid_amount", existing["paid_amount"]))
        notes = data.get("notes", existing["notes"])

        items = data.get("items", [])
        if not items:
            # Keep existing items if not provided
            old_db_items = cursor.execute("SELECT * FROM invoice_items WHERE invoice_id = ?", (inv_id,)).fetchall()
            items = [dict_from_row(it) for it in old_db_items]

        # Calculate new items
        subtotal = 0.0
        cost_total = 0.0
        calculated_items = []

        for itm in items:
            prod_id = itm.get("product_id")
            desc = itm.get("description", "").strip() or "Item"
            qty = float(itm.get("quantity", 1))
            unit_price = float(itm.get("unit_price", 0.0))
            cost_price = float(itm.get("cost_price", 0.0))
            itm_disc = float(itm.get("discount", 0.0))

            line_tot = round((qty * unit_price) - itm_disc, 2)
            line_cost = round(qty * cost_price, 2)
            line_profit = round(line_tot - line_cost, 2)

            subtotal += line_tot
            cost_total += line_cost
            calculated_items.append((prod_id, desc, qty, unit_price, cost_price, itm_disc, line_tot, line_profit))

        tax_amt = round((subtotal - discount) * (tax_rate / 100.0), 2) if (subtotal - discount) > 0 else 0.0
        total_amt = round(subtotal - discount + tax_amt + shipping, 2)
        net_prof = round((subtotal - discount) - cost_total, 2)

        # Status update
        if status not in ["draft", "cancelled"]:
            if paid_amount >= total_amt and total_amt > 0:
                status = "paid"
            elif paid_amount > 0:
                status = "partial"
            else:
                status = "pending"

        cursor.execute("""
            UPDATE invoices SET
                invoice_number = ?, customer_id = ?, issue_date = ?, due_date = ?, status = ?,
                subtotal = ?, cost_total = ?, discount_amount = ?, tax_rate = ?, tax_amount = ?,
                shipping_fee = ?, total_amount = ?, paid_amount = ?, net_profit = ?, notes = ?
            WHERE id = ?
        """, (
            inv_number, cust_id, issue_date, due_date, status,
            subtotal, cost_total, discount, tax_rate, tax_amt,
            shipping, total_amt, paid_amount, net_prof, notes, inv_id
        ))

        # Replace invoice items
        cursor.execute("DELETE FROM invoice_items WHERE invoice_id = ?", (inv_id,))
        for ci in calculated_items:
            cursor.execute("""
                INSERT INTO invoice_items (
                    invoice_id, product_id, description, quantity,
                    unit_price, cost_price, discount, total, profit
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (inv_id, ci[0], ci[1], ci[2], ci[3], ci[4], ci[5], ci[6], ci[7]))

            # Re-deduct inventory if active
            if inventory_mode and ci[0] and status != "cancelled":
                cursor.execute(
                    "UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?",
                    (ci[2], ci[0])
                )

        conn.commit()
        self.send_json({"success": True, "invoice_id": inv_id})

    def update_customer(self, conn, cust_id, data):
        conn.execute("""
            UPDATE customers SET
                name = COALESCE(?, name),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                address = COALESCE(?, address),
                notes = COALESCE(?, notes)
            WHERE id = ?
        """, (
            data.get("name"),
            data.get("email"),
            data.get("phone"),
            data.get("address"),
            data.get("notes"),
            cust_id
        ))
        conn.commit()
        self.send_json({"success": True})

    def update_product(self, conn, prod_id, data):
        conn.execute("""
            UPDATE products SET
                name = COALESCE(?, name),
                sku = COALESCE(?, sku),
                description = COALESCE(?, description),
                unit_price = COALESCE(?, unit_price),
                cost_price = COALESCE(?, cost_price),
                stock_quantity = COALESCE(?, stock_quantity),
                min_stock_alert = COALESCE(?, min_stock_alert)
            WHERE id = ?
        """, (
            data.get("name"),
            data.get("sku"),
            data.get("description"),
            data.get("unit_price"),
            data.get("cost_price"),
            data.get("stock_quantity"),
            data.get("min_stock_alert"),
            prod_id
        ))
        conn.commit()
        self.send_json({"success": True})

    # ========================== API DELETE ==========================

    def handle_api_delete(self, path):
        conn = get_db_connection()
        try:
            if path.startswith("/api/invoices/"):
                inv_id = path.split("/")[-1]
                self.delete_invoice(conn, inv_id)
            elif path.startswith("/api/customers/"):
                cust_id = path.split("/")[-1]
                conn.execute("DELETE FROM customers WHERE id = ?", (cust_id,))
                conn.commit()
                self.send_json({"success": True})
            elif path.startswith("/api/products/"):
                prod_id = path.split("/")[-1]
                conn.execute("DELETE FROM products WHERE id = ?", (prod_id,))
                conn.commit()
                self.send_json({"success": True})
            else:
                self.send_error_json("Endpoint not found", 404)
        finally:
            conn.close()

    def delete_invoice(self, conn, inv_id):
        inv_mode_row = conn.execute("SELECT value FROM settings WHERE key = 'inventory_mode'").fetchone()
        inventory_mode = inv_mode_row["value"] == "true" if inv_mode_row else False

        inv = conn.execute("SELECT status FROM invoices WHERE id = ?", (inv_id,)).fetchone()
        if inv and inventory_mode and inv["status"] != "cancelled":
            # Restore stock
            old_items = conn.execute(
                "SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?",
                (inv_id,)
            ).fetchall()
            for oi in old_items:
                if oi["product_id"]:
                    conn.execute(
                        "UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?",
                        (oi["quantity"], oi["product_id"])
                    )

        conn.execute("DELETE FROM invoices WHERE id = ?", (inv_id,))
        conn.commit()
        self.send_json({"success": True})


def run_server(port=52400, host="127.0.0.1"):
    init_db()
    server_address = (host, port)
    httpd = http.server.HTTPServer(server_address, InvoiceAPIHandler)
    return httpd
