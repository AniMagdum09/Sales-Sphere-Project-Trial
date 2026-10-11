"""Read-only SQLAlchemy Core table definitions matching Flyway V1/V3 target schema."""
from sqlalchemy import (
    Column, Date, DateTime, Integer, MetaData, Numeric, SmallInteger, String, Table, Time,
)

metadata = MetaData()

customers = Table(
    "customers", metadata,
    Column("id", Integer, primary_key=True),
    Column("source_party_no", String(7)),
    Column("party_name", String(100)),
    Column("phone", String(50)),
    Column("email", String(100)),
    Column("address", String(255)),
    Column("city", String(50)),
    Column("state", String(50)),
    Column("credit_limit", Numeric(15, 2)),
    Column("opening_balance", Numeric(15, 2)),
    Column("membership_id", String(50)),
    Column("source_branch_code", String(2)),
)

products = Table(
    "products", metadata,
    Column("id", Integer, primary_key=True),
    Column("item_code", String(50)),
    Column("item_name", String(100)),
    Column("short_name", String(50)),
    Column("bar_code", String(50)),
    Column("size", String(30)),
    Column("uom", String(30)),
    Column("hsn_code", String(30)),
    Column("category", String(50)),
    Column("sales_price", Numeric(15, 2)),
    Column("purchase_price", Numeric(15, 2)),
    Column("mrp", Numeric(15, 2)),
    Column("brand", String(80)),
    Column("department", String(80)),
    Column("colour", String(50)),
    Column("design_no", String(50)),
    Column("stock_qty", Numeric(15, 3)),
    Column("stock_as_on", Date),
)

invoices = Table(
    "invoices", metadata,
    Column("id", Integer, primary_key=True),
    Column("source_branch_code", String(2)),
    Column("source_doc_type", SmallInteger),
    Column("source_doc_no", Integer),
    Column("invoice_date", DateTime),
    Column("invoice_time", Time),
    Column("customer_id", Integer),
    Column("customer_name", String(100)),
    Column("bill_no", String(50)),
    Column("doc_value", Numeric(15, 2)),
    Column("doc_discount", Numeric(15, 2)),
    Column("total_amount", Numeric(15, 2)),
    Column("total_qty", Numeric(15, 3)),
)

invoice_items = Table(
    "invoice_items", metadata,
    Column("id", Integer, primary_key=True),
    Column("invoice_id", Integer),
    Column("source_branch_code", String(2)),
    Column("source_doc_type", SmallInteger),
    Column("source_doc_no", Integer),
    Column("source_item_no", Integer),
    Column("item_code", String(50)),
    Column("item_name", String(100)),
    Column("bar_code", String(50)),
    Column("size", String(30)),
    Column("uom", String(30)),
    Column("hsn_code", String(30)),
    Column("category", String(50)),
    Column("quantity", Numeric(15, 3)),
    Column("purchase_qty", Numeric(15, 3)),
    Column("purchase_price", Numeric(15, 2)),
    Column("sales_price", Numeric(15, 2)),
    Column("mrp", Numeric(15, 2)),
)

day_end = Table(
    "day_end", metadata,
    Column("id", Integer, primary_key=True),
    Column("source_branch_code", String(2)),
    Column("day_end_date", Date),
    Column("total_sales", Numeric(15, 2)),
    Column("total_purchase", Numeric(15, 2)),
    Column("total_collection", Numeric(15, 2)),
    Column("total_payment", Numeric(15, 2)),
    Column("closing_balance", Numeric(15, 2)),
    Column("remarks", String(255)),
)

daily_stock = Table(
    "daily_stock", metadata,
    Column("id", Integer, primary_key=True),
    Column("branch_code", String(2)),
    Column("snap_date", Date),
    Column("item_code", String(50)),
    Column("sold_qty", Numeric(15, 3)),
    Column("purchased_qty", Numeric(15, 3)),
    Column("closing_qty", Numeric(15, 3)),
    Column("source", String(20)),
)

sync_metadata = Table(
    "sync_metadata", metadata,
    Column("id", Integer, primary_key=True),
    Column("started_at", DateTime),
    Column("finished_at", DateTime),
    Column("status", String(10)),
    Column("customers_synced", Integer),
    Column("products_synced", Integer),
    Column("invoices_synced", Integer),
    Column("invoice_items_synced", Integer),
    Column("day_end_synced", Integer),
    Column("duration_ms", Integer),
    Column("error_message", String),
)

purchases = Table(
    "purchases", metadata,
    Column("id", Integer, primary_key=True),
    Column("source_branch_code", String(2)),
    Column("doc_no", Integer),
    Column("bill_no", String(50)),
    Column("bill_date", Date),
    Column("supplier_name", String(150)),
    Column("bill_amount", Numeric(15, 2)),
    Column("taxable_amount", Numeric(15, 2)),
    Column("tax_amount", Numeric(15, 2)),
)

item_monthly_sales = Table(
    "item_monthly_sales", metadata,
    Column("id", Integer, primary_key=True),
    Column("item_code", String(50)),
    Column("ym", Date),
    Column("qty", Numeric(15, 3)),
    Column("value", Numeric(15, 2)),
)
