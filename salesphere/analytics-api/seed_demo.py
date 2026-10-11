"""Seed a demo MySQL database with realistic synthetic SalesSphere data.

Creates the schema by executing the sync agent's real Flyway migrations (V1-V4), then
generates ~15 months of billing data for 3 branches (sports + 2 garments) with
festival/monsoon seasonality, so the whole analytics stack can be demonstrated
without the sponsor's live SQL Server.

Usage:
    .venv/Scripts/python seed_demo.py                # creates/refreshes salessphere_demo
    .venv/Scripts/python seed_demo.py --db mydb      # custom database name
"""
import argparse
import datetime as dt
import random
import re
import sys
from pathlib import Path

from sqlalchemy import create_engine, text

DEFAULT_DB = "salessphere_demo"
ROOT = Path(__file__).resolve().parent
MIGRATIONS = sorted((ROOT / ".." / "sync-agent" / "src" / "main" / "resources" / "db" / "migration").glob("V*.sql"))
BASE_URL = "mysql+pymysql://root:root@127.0.0.1:3306/?charset=utf8mb4"

rng = random.Random(42)

BRANCHES = [("01", "Indo Sports - Main"), ("02", "Garments - Branch 1"), ("03", "Garments - Branch 2")]

SPORTS = [
    ("Cricket Bat KW", "Bats", 1299, 2499), ("Cricket Bat POP", "Bats", 799, 1599),
    ("Cricket Ball Leather", "Balls", 349, 599), ("Tennis Ball", "Balls", 79, 129),
    ("Stumps Set", "Bats", 599, 999), ("Batting Gloves", "Gloves", 449, 899),
    ("Wicket Keeping Gloves", "Gloves", 649, 1299), ("Batting Pads", "Pads", 899, 1799),
    ("Cricket Helmet", "Protection", 999, 1999), ("Abdominal Guard", "Protection", 99, 199),
    ("Football Size 5", "Football", 699, 1299), ("Football Size 3", "Football", 449, 899),
    ("Goal Keeper Gloves", "Football", 549, 1099), ("Football Studs", "Footwear", 1299, 2599),
    ("Badminton Racket", "Rackets", 899, 2199), ("Badminton Racket Pro", "Rackets", 1799, 3499),
    ("Shuttlecock Plastic", "Rackets", 149, 299), ("Shuttlecock Feather", "Rackets", 449, 899),
    ("Badminton Grip", "Rackets", 49, 99), ("Tennis Racket", "Rackets", 1499, 2999),
    ("Tennis Balls Can", "Rackets", 349, 699), ("Table Tennis Racket", "Rackets", 399, 899),
    ("TT Balls Pack", "Rackets", 99, 199), ("Kabaddi Shoes", "Footwear", 999, 1799),
    ("Volleyball", "Balls", 549, 999), ("Basketball", "Balls", 649, 1299),
    ("Hockey Stick", "Hockey", 899, 1899), ("Hockey Ball", "Hockey", 149, 299),
    ("Skating Shoes", "Footwear", 1499, 2999), ("Swimming Goggles", "Swim", 299, 599),
    ("Swimming Cap", "Swim", 149, 299), ("Swim Trunks", "Swim", 399, 799),
    ("Carrom Board L", "Indoor", 1499, 2999), ("Carrom Coins", "Indoor", 199, 399),
    ("Chess Board", "Indoor", 299, 699), ("Ludo Set", "Indoor", 199, 399),
    ("Skipping Rope", "Fitness", 99, 249), ("Dumbbell 5kg", "Fitness", 449, 899),
    ("Dumbbell 10kg", "Fitness", 899, 1699), ("Yoga Mat 6mm", "Fitness", 449, 899),
    ("Resistance Band", "Fitness", 199, 449), ("Boxing Gloves", "Fitness", 649, 1299),
    ("Punching Bag", "Fitness", 999, 1999), ("Hand Gripper", "Fitness", 149, 299),
    ("Sports Water Bottle", "Accessories", 199, 449), ("Gym Sipper", "Accessories", 249, 499),
    ("Duffle Bag", "Bags", 899, 1799), ("Kit Bag Pro", "Bags", 1499, 2999),
    ("Sports Shoes Mesh", "Footwear", 1199, 2499), ("Running Shoes", "Footwear", 1499, 3299),
    ("Cricket Shoes Spikes", "Footwear", 1699, 3299), ("Socks Pack of 3", "Accessories", 199, 399),
    ("Wrist Band Pair", "Accessories", 99, 199), ("Elbow Support", "Support", 249, 499),
    ("Knee Support", "Support", 299, 599), ("Ankle Support", "Support", 249, 499),
    ("Rain Poncho", "Monsoon", 249, 499), ("Raincoat Adult", "Monsoon", 599, 1199),
    ("Umbrella 2-Fold", "Monsoon", 299, 599), ("Umbrella Golf", "Monsoon", 549, 999),
    ("Air Pump", "Accessories", 349, 699), ("Bicycle Bell", "Cycling", 99, 199),
    ("Cycling Helmet", "Cycling", 899, 1699), ("Bicycle Lights Pair", "Cycling", 349, 699),
    ("Whistle Metal", "Referee", 49, 99), ("Stopwatch Digital", "Referee", 349, 699),
    ("Measuring Tape 15m", "Referee", 199, 399), ("Marking Chalk", "Referee", 99, 199),
    ("Jump Rope Speed", "Fitness", 249, 499), ("Foam Roller", "Fitness", 599, 1199),
    ("Shuttle Racket Cover", "Rackets", 149, 299), ("Net Badminton", "Rackets", 599, 1199),
    ("Volleyball Net", "Balls", 899, 1599), ("Cricket Net Practice", "Bats", 2499, 4999),
]

GARMENTS = [
    ("Cotton Shirt Slim", "Shirts", 599, 1299), ("Formal Shirt", "Shirts", 799, 1599),
    ("Checked Shirt", "Shirts", 699, 1399), ("Denim Shirt", "Shirts", 899, 1799),
    ("Linen Shirt", "Shirts", 999, 1999), ("Polo T-Shirt", "T-Shirts", 399, 899),
    ("Round Neck Tee", "T-Shirts", 249, 599), ("Graphic Tee", "T-Shirts", 349, 699),
    ("V-Neck Tee", "T-Shirts", 299, 649), ("Oversized Tee", "T-Shirts", 449, 899),
    ("Slim Jeans", "Jeans", 999, 2199), ("Regular Jeans", "Jeans", 899, 1899),
    ("Torn Jeans", "Jeans", 1099, 2299), ("Chino Pants", "Trousers", 799, 1699),
    ("Formal Trousers", "Trousers", 899, 1899), ("Cargo Pants", "Trousers", 849, 1799),
    ("Track Pants", "Lower", 499, 1099), ("Joggers", "Lower", 599, 1299),
    ("Shorts Cotton", "Lower", 349, 799), ("Capri", "Lower", 399, 849),
    ("Cotton Kurta Men", "Ethnic", 599, 1299), ("Nehru Jacket", "Ethnic", 1299, 2699),
    ("Dhoti Pant", "Ethnic", 499, 999), ("Sherwani", "Ethnic", 3499, 6999),
    ("Kurti Cotton", "Ethnic-W", 449, 999), ("Kurti Embroidered", "Ethnic-W", 799, 1699),
    ("Palazzo Set", "Ethnic-W", 899, 1899), ("Leggings Pack", "Ethnic-W", 299, 649),
    ("Saree Cotton", "Sarees", 999, 2499), ("Saree Silk", "Sarees", 2499, 5999),
    ("Saree Georgette", "Sarees", 1499, 3499), ("Designer Blouse", "Sarees", 599, 1299),
    ("Salwar Suit", "Ethnic-W", 899, 1999), ("Anarkali Suit", "Ethnic-W", 1699, 3999),
    ("Dupatta Chiffon", "Ethnic-W", 199, 499), ("Lehenga Party", "Ethnic-W", 2999, 6999),
    ("Frock Kids", "Kids", 449, 999), ("Kids T-Shirt", "Kids", 199, 499),
    ("Kids Shorts", "Kids", 249, 549), ("Kids Jeans", "Kids", 499, 1099),
    ("Kids Dungaree", "Kids", 699, 1499), ("School Uniform Set", "Kids", 599, 1299),
    ("Winter Sweatshirt", "Winter", 599, 1299), ("Hoodie Fleece", "Winter", 799, 1699),
    ("Jacket Denim", "Winter", 1299, 2699), ("Jacket Puffer", "Winter", 1699, 3499),
    ("Cardigan Wool", "Winter", 899, 1899), ("Muffler Wool", "Winter", 199, 449),
    ("Thermal Set", "Winter", 649, 1299), ("Blazer Men", "Formal", 1999, 4499),
    ("Suit 2-Piece", "Formal", 3999, 8999), ("Tie Silk", "Formal", 299, 699),
    ("Belt Leather", "Accessories", 349, 899), ("Cap Baseball", "Accessories", 199, 499),
    ("Socks Ankle 3pk", "Accessories", 149, 349), ("Handkerchief Pack", "Accessories", 99, 249),
    ("Scarf Printed", "Accessories", 249, 599), ("Leggings Winter", "Winter", 399, 799),
    ("Ethnic Gown", "Ethnic-W", 1299, 2999), ("Night Suit Cotton", "Innerwear", 599, 1299),
    ("Pyjama Set", "Innerwear", 449, 999), ("Bralette Pack", "Innerwear", 349, 799),
    ("Vest Pack of 3", "Innerwear", 249, 549), ("Brief Pack of 3", "Innerwear", 249, 549),
    ("Rain Jacket", "Monsoon", 899, 1899), ("Poncho Printed", "Monsoon", 399, 799),
    ("Waterproof Sandal", "Monsoon", 349, 799), ("Crocs Style Clog", "Monsoon", 599, 1299),
    ("Diwali Kurta Set", "Ethnic", 999, 2299), ("Festive Dhoti", "Ethnic", 699, 1499),
]

FIRST = ["Anmol", "Yash", "Aniruddha", "Rushikesh", "Rahul", "Priya", "Sneha", "Amit", "Pooja",
         "Vikram", "Sagar", "Neha", "Rohit", "Aishwarya", "Kiran", "Manish", "Deepa", "Sanjay",
         "Meera", "Akash", "Shreya", "Nitin", "Kavita", "Prasad", "Jyoti", "Ganesh", "Swati",
         "Omkar", "Pallavi", "Tushar", "Rutuja", "Siddharth", "Anjali", "Mayur", "Snehal",
         "Harshad", "Aditi", "Vaibhav", "Sonal", "Nikhil"]
LAST = ["Magdum", "Kagwade", "Koik", "Patil", "Sharma", "Deshmukh", "Jadhav", "Kulkarni",
        "Shinde", "Pawar", "Gaikwad", "Sawant", "Joshi", "Kadam", "Bhosale", "Salunkhe",
        "More", "Shaikh", "Jagtap", "Thorat", "Sutar", "Chavan", "Pandit", "Naik", "Rane"]

# (month -> demand multiplier): Feb wedding, Jun-Jul monsoon, Oct-Nov Diwali spike
SEASON = {1: 0.9, 2: 1.0, 3: 1.0, 4: 1.05, 5: 1.1, 6: 1.25, 7: 1.3, 8: 1.05,
          9: 1.0, 10: 1.7, 11: 1.5, 12: 1.15}


def build_catalog():
    items = []
    n = 1
    for name, cat, sp, mrp in SPORTS:
        # ~8% of items are retired mid-window (become slow/non-moving), ~2% never sell
        sunset = None
        roll = rng.random()
        if roll < 0.02:
            never_sold = True
        else:
            never_sold = False
            if roll < 0.10:
                # Jan-Jun sunsets become non-moving (>90d), Jul-Aug become slow-moving
                sunset = dt.date(2026, rng.randint(1, 8), rng.randint(1, 28))
        items.append(dict(code=f"SP-{n:03d}", name=name, category=cat, branch="01",
                          sales_price=float(sp), mrp=float(mrp),
                          purchase_price=round(sp * rng.uniform(0.58, 0.72), 2),
                          sunset=sunset, never_sold=never_sold))
        n += 1
    n = 1
    for name, cat, sp, mrp in GARMENTS:
        sunset = None
        roll = rng.random()
        if roll < 0.02:
            never_sold = True
        else:
            never_sold = False
            if roll < 0.10:
                sunset = dt.date(2026, rng.randint(1, 8), rng.randint(1, 28))
        for branch in ("02", "03"):
            items.append(dict(code=f"GM-{branch}-{n:03d}", name=name, category=cat, branch=branch,
                              sales_price=float(sp), mrp=float(mrp),
                              purchase_price=round(sp * rng.uniform(0.55, 0.7), 2),
                              sunset=sunset, never_sold=never_sold))
        n += 1
    return items


def run_sql_file(conn, path: Path):
    sql = path.read_text(encoding="utf-8")
    sql = re.sub(r"^--.*$", "", sql, flags=re.M)
    for stmt in sql.split(";"):
        s = stmt.strip()
        if s:
            conn.execute(text(s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB)
    args = ap.parse_args()

    root_engine = create_engine(BASE_URL, future=True)
    with root_engine.connect() as c:
        c.execute(text(f"DROP DATABASE IF EXISTS {args.db}"))
        c.execute(text(f"CREATE DATABASE {args.db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
        c.commit()
    engine = create_engine(BASE_URL.replace("/?", f"/{args.db}?"), future=True)

    print(f"[1/4] Executing {len(MIGRATIONS)} Flyway migrations into {args.db} ...")
    with engine.begin() as conn:
        for m in MIGRATIONS:
            run_sql_file(conn, m)
            print("      applied", m.name)

    items = build_catalog()
    customers = []
    for i in range(1, 131):
        nm = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        customers.append(dict(
            source_party_no=f"P{i:04d}", party_name=nm,
            phone=f"9{rng.randint(600000000, 999999999)}",
            address=f"{rng.randint(1, 200)}, {rng.choice(['MG Road', 'Station Road', 'Market Yard', 'Gandhi Nagar', 'Shaniwar Peth'])}",
            city=rng.choice(["Pune", "Moshi", "Chakan", "Alandi"]), state="Maharashtra",
            credit_limit=float(rng.choice([0, 10000, 25000, 50000, 100000])),
            opening_balance=0.0, membership_id=None if rng.random() < 0.35 else f"MEM{i:04d}",
            source_branch_code=rng.choice(["01", "02", "03"]),
        ))

    start = dt.date(2025, 7, 1)
    end = dt.date(2026, 10, 9)
    days = (end - start).days + 1
    branch_items = {b: [it for it in items if it["branch"] == b] for b, _ in BRANCHES}

    print("[2/4] Generating invoices ...")
    invoices, invoice_items, day_end_rows = [], [], []
    inv_no = {b: 1 for b, _ in BRANCHES}
    for day_i in range(days):
        d = start + dt.timedelta(days=day_i)
        dow = d.weekday()
        weekend = 1.35 if dow >= 5 else 1.0
        for bcode, _bname in BRANCHES:
            # sunset items stop selling after their sunset date; never-sold items never appear
            pool = [it for it in branch_items[bcode]
                    if not it["never_sold"] and (it["sunset"] is None or d <= it["sunset"])]
            base = rng.randint(3, 9)
            n_bills = max(0, int(base * SEASON[d.month] * weekend * rng.uniform(0.7, 1.3)))
            day_sales = day_purch = 0.0
            for _ in range(n_bills):
                walk_in = rng.random() < 0.42
                cust = None if walk_in else rng.choice(customers)
                bill_dt = dt.datetime(d.year, d.month, d.day,
                                      rng.randint(9, 20), rng.randint(0, 59))
                doc_value = discount = 0.0
                bill_id = len(invoices) + 1
                n_lines = rng.randint(1, 5)
                used = set()
                for line in range(1, n_lines + 1):
                    it = rng.choice(pool)
                    if it["code"] in used:
                        continue
                    used.add(it["code"])
                    qty = rng.choices([1, 2, 3, 4], weights=[55, 25, 13, 7])[0]
                    amount = qty * it["sales_price"]
                    doc_value += amount
                    day_sales += amount
                    invoice_items.append(dict(
                        invoice_id=bill_id, source_branch_code=bcode, source_doc_type=1,
                        source_doc_no=inv_no[bcode], source_item_no=line,
                        item_code=it["code"], item_name=it["name"],
                        bar_code=f"890{rng.randint(100000000000, 999999999999)}",
                        size=rng.choice(["S", "M", "L", "XL", "FREE"]) if it["branch"] != "01" else "FREE",
                        uom="PCS", hsn_code=rng.choice(["6109", "6203", "9506", "6204"]),
                        category=it["category"], quantity=float(qty),
                        purchase_qty=0.0,  # filled in by the purchase-distribution pass below
                        purchase_price=it["purchase_price"], sales_price=it["sales_price"],
                        mrp=it["mrp"], supplier_name=rng.choice(["Vardhman Traders", "Metro Distributors",
                                                                 "Prime Sports Wholesalers", "RK Garments Ltd"]),
                        batch_no=f"B{d.year % 100}{d.month:02d}", sp_id=None,
                    ))
                if doc_value > 1000 and rng.random() < 0.3:
                    discount = round(doc_value * rng.uniform(0.02, 0.08), 2)
                total = round(doc_value - discount, 2)
                invoices.append(dict(
                    id=bill_id, source_branch_code=bcode, source_doc_type=1, source_doc_no=inv_no[bcode],
                    invoice_date=bill_dt, invoice_time=bill_dt.time(),
                    customer_id=None if walk_in else customers.index(cust) + 1,
                    customer_name=None if walk_in else cust["party_name"],
                    bill_no=f"B{bcode}-{inv_no[bcode]}",
                    process_date=bill_dt, delivery_date=bill_dt, doc_value=round(doc_value, 2),
                    doc_discount=discount, total_amount=total, total_qty=float(sum(
                        ii["quantity"] for ii in invoice_items[-len(used):])),
                ))
                inv_no[bcode] += 1
            if day_sales > 0:
                day_end_rows.append(dict(
                    source_branch_code=bcode, day_end_date=d, total_sales=round(day_sales, 2),
                    total_purchase=round(day_purch, 2), total_collection=round(day_sales, 2),
                    total_payment=0.0, closing_balance=round(day_sales, 2), remarks=None,
                ))

    # Purchase-distribution pass: every sold item receives periodic restock batches
    # (10-15% more than sold) spread across its lines, so derived stock is positive
    # and movement charts show realistic purchase bursts.
    print("[2b] Distributing purchase batches ...")
    by_item = {}
    for idx, ii in enumerate(invoice_items):
        by_item.setdefault(ii["item_code"], []).append(idx)
    for code, idxs in by_item.items():
        total_sold = sum(invoice_items[i]["quantity"] for i in idxs)
        target = total_sold * rng.uniform(1.10, 1.25)
        n_events = min(len(idxs), rng.randint(6, 14))
        picks = sorted(rng.sample(idxs, n_events))
        per = target / n_events
        for p in picks:
            invoice_items[p]["purchase_qty"] = float(max(1, int(per * rng.uniform(0.7, 1.3))))
    purchase_total = sum(ii["purchase_qty"] for ii in invoice_items)

    print(f"      {len(invoices)} invoices, {len(invoice_items)} line items, "
          f"{purchase_total:.0f} units purchased, {len(day_end_rows)} day-end rows")
    print("[3/4] Inserting ...")
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO customers (source_party_no, party_name, phone, email, address, city, state,
                credit_limit, opening_balance, membership_id, source_branch_code, source_doc_date)
            VALUES (:source_party_no, :party_name, :phone, NULL, :address, :city, :state,
                :credit_limit, :opening_balance, :membership_id, :source_branch_code, NULL)"""), customers)

        conn.execute(text("""
            INSERT INTO products (item_code, item_name, short_name, bar_code, size, uom, hsn_code, category,
                sales_price, mrp)
            VALUES (:code, :name, :name, :barcode, 'FREE', 'PCS', '9506', :category,
                :sales_price, :mrp)"""),
            [dict(it, barcode=f"890{rng.randint(100000000000, 999999999999)}") for it in items])

        conn.execute(text("""
            INSERT INTO invoices (id, source_branch_code, source_doc_type, source_doc_no, invoice_date,
                invoice_time, customer_id, customer_name, bill_no, process_date, delivery_date,
                doc_value, doc_discount, total_amount, total_qty)
            VALUES (:id, :source_branch_code, :source_doc_type, :source_doc_no, :invoice_date,
                :invoice_time, :customer_id, :customer_name, :bill_no, :process_date, :delivery_date,
                :doc_value, :doc_discount, :total_amount, :total_qty)"""), invoices)

        conn.execute(text("""
            INSERT INTO invoice_items (invoice_id, source_branch_code, source_doc_type, source_doc_no,
                source_item_no, item_code, item_name, bar_code, size, uom, hsn_code, category,
                quantity, purchase_qty, purchase_price, sales_price, mrp, supplier_name, batch_no, sp_id)
            VALUES (:invoice_id, :source_branch_code, :source_doc_type, :source_doc_no, :source_item_no,
                :item_code, :item_name, :bar_code, :size, :uom, :hsn_code, :category,
                :quantity, :purchase_qty, :purchase_price, :sales_price, :mrp, :supplier_name, :batch_no, :sp_id)"""),
            invoice_items)

        conn.execute(text("""
            INSERT INTO day_end (source_branch_code, day_end_date, total_sales, total_purchase,
                total_collection, total_payment, closing_balance, remarks)
            VALUES (:source_branch_code, :day_end_date, :total_sales, :total_purchase,
                :total_collection, :total_payment, :closing_balance, :remarks)"""), day_end_rows)

        conn.execute(text("""
            INSERT INTO sync_metadata (started_at, finished_at, status, customers_synced,
                products_synced, invoices_synced, invoice_items_synced, day_end_synced, duration_ms, error_message)
            VALUES (NOW(), NOW(), 'SUCCESS', :c, :p, :i, :ii, :de, 0, 'demo seed (synthetic data)')"""),
            dict(c=len(customers), p=len(items), i=len(invoices),
                 ii=len(invoice_items), de=len(day_end_rows)))

    print(f"[4/4] Done. Database '{args.db}' is ready.")
    print("      Point the API at it:")
    print(f"      set SALESSPHERE_DB_URL=mysql+pymysql://root:root@127.0.0.1:3306/{args.db}")


if __name__ == "__main__":
    sys.exit(main())
