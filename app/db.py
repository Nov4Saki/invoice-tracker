"""
Database Layer for Invoice Tracker Desktop App.
Uses Python standard library sqlite3 (zero external dependencies).
Supports transactions, foreign keys, fast indexing, and automatic seed data.
"""

import sqlite3
import os
import sys
import json
from datetime import datetime, timedelta


def get_base_dir():
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        parent_dir = os.path.dirname(exe_dir)
        parent_data_db = os.path.join(parent_dir, "data", "invoices.db")
        local_data_db = os.path.join(exe_dir, "data", "invoices.db")
        if not os.path.exists(local_data_db) and os.path.exists(parent_data_db):
            return parent_dir
        return exe_dir
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


DB_DIR = os.path.join(get_base_dir(), "data")
DB_PATH = os.path.join(DB_DIR, "invoices.db")


def get_db_connection():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(seed_sample=False):
    """Initializes the database schema and default settings without dummy data."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    # Customers table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        notes TEXT,
        preferred_currency TEXT NOT NULL DEFAULT 'EGP',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """)

    # Migration for customers table
    try:
        cursor.execute("ALTER TABLE customers ADD COLUMN preferred_currency TEXT NOT NULL DEFAULT 'EGP';")
    except sqlite3.OperationalError:
        pass

    # Products / Inventory table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT UNIQUE,
        description TEXT,
        unit_price REAL NOT NULL DEFAULT 0.0,
        cost_price REAL NOT NULL DEFAULT 0.0,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        min_stock_alert INTEGER NOT NULL DEFAULT 5,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """)

    # Invoices / Orders table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL,
        customer_id INTEGER NOT NULL,
        issue_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- 'draft', 'pending', 'paid', 'partial', 'cancelled'
        currency TEXT NOT NULL DEFAULT 'EGP',
        currency_symbol TEXT NOT NULL DEFAULT 'ج.م',
        subtotal REAL NOT NULL DEFAULT 0.0,
        cost_total REAL NOT NULL DEFAULT 0.0,
        discount_amount REAL NOT NULL DEFAULT 0.0,
        tax_rate REAL NOT NULL DEFAULT 0.0,
        tax_amount REAL NOT NULL DEFAULT 0.0,
        shipping_fee REAL NOT NULL DEFAULT 0.0,
        total_amount REAL NOT NULL DEFAULT 0.0,
        paid_amount REAL NOT NULL DEFAULT 0.0,
        net_profit REAL NOT NULL DEFAULT 0.0,
        stock_deducted INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
    );
    """)

    # Migrations for existing databases
    try:
        cursor.execute("ALTER TABLE invoices ADD COLUMN stock_deducted INTEGER NOT NULL DEFAULT 0;")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'EGP';")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE invoices ADD COLUMN currency_symbol TEXT NOT NULL DEFAULT 'ج.م';")
    except sqlite3.OperationalError:
        pass

    # Invoice line items
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        product_id INTEGER,
        description TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0.0,
        cost_price REAL NOT NULL DEFAULT 0.0,
        discount REAL NOT NULL DEFAULT 0.0,
        total REAL NOT NULL DEFAULT 0.0,
        profit REAL NOT NULL DEFAULT 0.0,
        FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL
    );
    """)

    # Indexes for fast search
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);")

    # Set default settings if not exists
    default_settings = {
        "inventory_mode": "false",
        "business_name": "My Business | اسم المنشأة",
        "business_email": "",
        "business_phone": "",
        "business_address": "Cairo, Egypt",
        "business_tax_id": "",
        "currency": "EGP",
        "currency_symbol": "ج.م",
        "language": "ar",
        "theme": "dark"
    }

    for key, val in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))

    # Migrate legacy SAR defaults in settings to EGP if present
    cursor.execute("UPDATE settings SET value = 'EGP' WHERE key = 'currency' AND value = 'SAR';")
    cursor.execute("UPDATE settings SET value = 'ج.م' WHERE key = 'currency_symbol' AND value = 'ر.س';")

    # Check if sample data was explicitly requested (disabled by default for clean production)
    if seed_sample:
        cursor.execute("SELECT COUNT(*) as count FROM customers;")
        if cursor.fetchone()["count"] == 0:
            seed_sample_data(cursor)

    conn.commit()
    conn.close()


def seed_sample_data(cursor):
    """Seed realistic initial data for immediate demonstration."""
    sample_customers = [
        ("مؤسسة الأمل للمقاولات (Al-Amal Contracting)", "info@alamal.com", "+20 101 432 1098", "Cairo, Nasr City", "VIP Client - 30 days credit", "EGP"),
        ("شركة النور للتوزيع (Al-Noor Distribution)", "sales@alnoor.com", "+966 50 987 6543", "Jeddah, Al-Balad", "Regular wholesale buyer", "SAR"),
        ("مكتبة الشروق (Al-Shorouq Stationery)", "contact@alshorouq.com", "+20 102 112 2334", "Alexandria, Corniche", "Retail partner", "EGP"),
        ("سارة أحمد المنصور (Sarah Al-Mansoor)", "sarah.m@gmail.com", "+1 415 887 7665", "Cairo, Maadi", "Direct individual client", "USD"),
        ("عمر خالد الحربي (Omar Al-Harbi)", "omar.harbi@outlook.com", "+20 103 334 4556", "Giza, Dokki", "New customer", "EGP")
    ]

    customer_ids = []
    for c in sample_customers:
        cursor.execute(
            "INSERT INTO customers (name, email, phone, address, notes, preferred_currency) VALUES (?, ?, ?, ?, ?, ?)",
            c
        )
        customer_ids.append(cursor.lastrowid)

    # Sample inventory products
    sample_products = [
        ("حاسوب مكتبي ديل (Dell Desktop Core i7)", "SKU-DELL-01", "Desktop workstation with 16GB RAM, 512GB SSD", 3200.0, 2400.0, 15, 3),
        ("شاشة سامسونج 27 بوصة (Samsung 27 inch 4K)", "SKU-SAM-27", "4K UHD IPS professional monitor", 1400.0, 950.0, 28, 5),
        ("طابعة ليزر إتش بي (HP LaserJet Pro)", "SKU-HP-LJ", "High-speed wireless monochrome printer", 950.0, 680.0, 12, 4),
        ("راوتر سيسكو احترافي (Cisco Gigabit Router)", "SKU-CISCO-R", "Dual band VPN enterprise router", 650.0, 420.0, 8, 2),
        ("كابل شبكة كات 6 - 305 متر (Cat6 Cable Reel)", "SKU-CAB-305", "High-performance UTP pure copper", 220.0, 130.0, 45, 10),
        ("كرسي مكتب مريح (Ergonomic Office Chair)", "SKU-CHR-01", "Mesh back with lumbar support", 550.0, 320.0, 20, 5)
    ]

    product_ids = []
    for p in sample_products:
        cursor.execute(
            "INSERT INTO products (name, sku, description, unit_price, cost_price, stock_quantity, min_stock_alert) VALUES (?, ?, ?, ?, ?, ?, ?)",
            p
        )
        product_ids.append(cursor.lastrowid)

    # Generate dates across past 4 months and future
    now = datetime.now()
    dates = [
        (now - timedelta(days=90)).strftime("%Y-%m-%d"),
        (now - timedelta(days=65)).strftime("%Y-%m-%d"),
        (now - timedelta(days=40)).strftime("%Y-%m-%d"),
        (now - timedelta(days=22)).strftime("%Y-%m-%d"),
        (now - timedelta(days=10)).strftime("%Y-%m-%d"),
        (now - timedelta(days=3)).strftime("%Y-%m-%d"),
        now.strftime("%Y-%m-%d"),
        (now + timedelta(days=14)).strftime("%Y-%m-%d"),  # Future order
    ]

    sample_invoices = [
        (
            "INV-2026-0001", customer_ids[0], dates[0], (now - timedelta(days=60)).strftime("%Y-%m-%d"), "paid",
            [
                (product_ids[0], "حاسوب مكتبي ديل (Dell Desktop Core i7)", 2, 3200.0, 2400.0, 0),
                (product_ids[1], "شاشة سامسونج 27 بوصة (Samsung 27 inch 4K)", 2, 1400.0, 950.0, 0)
            ],
            100.0, 14.0, 50.0, 10500.0, "EGP", "ج.م"
        ),
        (
            "INV-2026-0002", customer_ids[1], dates[1], (now - timedelta(days=35)).strftime("%Y-%m-%d"), "paid",
            [
                (product_ids[2], "طابعة ليزر إتش بي (HP LaserJet Pro)", 3, 950.0, 680.0, 50.0),
                (product_ids[4], "كابل شبكة كات 6 - 305 متر (Cat6 Cable Reel)", 5, 220.0, 130.0, 0)
            ],
            0.0, 15.0, 0.0, 4485.0, "SAR", "ر.س"
        ),
        (
            "INV-2026-0003", customer_ids[2], dates[2], (now - timedelta(days=10)).strftime("%Y-%m-%d"), "partial",
            [
                (product_ids[5], "كرسي مكتب مريح (Ergonomic Office Chair)", 6, 550.0, 320.0, 100.0),
                (product_ids[3], "راوتر سيسكو احترافي (Cisco Gigabit Router)", 1, 650.0, 420.0, 0)
            ],
            50.0, 14.0, 80.0, 2500.0, "EGP", "ج.م"
        ),
        (
            "INV-2026-0004", customer_ids[3], dates[3], (now - timedelta(days=5)).strftime("%Y-%m-%d"), "paid",
            [
                (product_ids[0], "حاسوب مكتبي ديل (Dell Desktop Core i7)", 1, 3200.0, 2400.0, 0)
            ],
            0.0, 10.0, 0.0, 3520.0, "USD", "$"
        ),
        (
            "INV-2026-0005", customer_ids[0], dates[4], (now + timedelta(days=20)).strftime("%Y-%m-%d"), "pending",
            [
                (product_ids[3], "راوتر سيسكو احترافي (Cisco Gigabit Router)", 4, 650.0, 420.0, 0),
                (product_ids[4], "كابل شبكة كات 6 - 305 متر (Cat6 Cable Reel)", 10, 220.0, 130.0, 50.0)
            ],
            100.0, 14.0, 100.0, 0.0, "EGP", "ج.م"
        ),
        (
            "INV-2026-0006", customer_ids[4], dates[5], (now + timedelta(days=12)).strftime("%Y-%m-%d"), "paid",
            [
                (product_ids[1], "شاشة سامسونج 27 بوصة (Samsung 27 inch 4K)", 1, 1400.0, 950.0, 0),
                (product_ids[5], "كرسي مكتب مريح (Ergonomic Office Chair)", 2, 550.0, 320.0, 0)
            ],
            0.0, 14.0, 0.0, 2850.0, "EGP", "ج.م"
        ),
        (
            "INV-2026-0007", customer_ids[1], dates[6], (now + timedelta(days=30)).strftime("%Y-%m-%d"), "pending",
            [
                (product_ids[0], "حاسوب مكتبي ديل (Dell Desktop Core i7)", 3, 3200.0, 2400.0, 200.0),
                (product_ids[2], "طابعة ليزر إتش بي (HP LaserJet Pro)", 2, 950.0, 680.0, 0)
            ],
            150.0, 15.0, 100.0, 0.0, "SAR", "ر.س"
        ),
        (
            "INV-2026-0008", customer_ids[2], dates[7], (now + timedelta(days=45)).strftime("%Y-%m-%d"), "draft",
            [
                (product_ids[5], "كرسي مكتب مريح (Ergonomic Office Chair)", 4, 550.0, 320.0, 0)
            ],
            0.0, 14.0, 50.0, 0.0, "EGP", "ج.م"
        )
    ]

    for inv in sample_invoices:
        inv_num, cust_id, iss_date, due_date, status, items, discount, tax_rate, shipping, paid, currency, curr_sym = inv
        subtotal = 0.0
        cost_total = 0.0

        item_records = []
        for itm in items:
            prod_id, desc, qty, u_price, c_price, itm_disc = itm
            line_tot = (qty * u_price) - itm_disc
            line_cost = qty * c_price
            line_profit = line_tot - line_cost
            subtotal += line_tot
            cost_total += line_cost
            item_records.append((prod_id, desc, qty, u_price, c_price, itm_disc, line_tot, line_profit))

        tax_amt = round((subtotal - discount) * (tax_rate / 100.0), 2) if (subtotal - discount) > 0 else 0.0
        total_amt = round(subtotal - discount + tax_amt + shipping, 2)
        net_prof = round((subtotal - discount) - cost_total, 2)

        # Set paid amount accurately if full paid
        if status == "paid" and paid == 0.0:
            paid = total_amt

        cursor.execute("""
            INSERT INTO invoices (
                invoice_number, customer_id, issue_date, due_date, status,
                currency, currency_symbol,
                subtotal, cost_total, discount_amount, tax_rate, tax_amount,
                shipping_fee, total_amount, paid_amount, net_profit, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            inv_num, cust_id, iss_date, due_date, status,
            currency, curr_sym,
            subtotal, cost_total, discount, tax_rate, tax_amt,
            shipping, total_amt, paid, net_prof, "Thank you for your business / شكراً لتعاملكم معنا"
        ))
        inv_id = cursor.lastrowid

        for ir in item_records:
            cursor.execute("""
                INSERT INTO invoice_items (
                    invoice_id, product_id, description, quantity,
                    unit_price, cost_price, discount, total, profit
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (inv_id, ir[0], ir[1], ir[2], ir[3], ir[4], ir[5], ir[6], ir[7]))
