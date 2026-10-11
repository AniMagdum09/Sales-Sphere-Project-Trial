-- V4: Convenience views for dashboard / BI queries.
-- The FastAPI analytics layer queries base tables directly; these views exist for
-- reporting tools and quick manual inspection.

CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
    DATE(invoice_date)                      AS sales_date,
    source_branch_code                      AS branch_code,
    COUNT(*)                                AS invoices,
    COALESCE(SUM(total_amount), 0)          AS revenue,
    COALESCE(SUM(total_qty), 0)             AS items_sold
FROM invoices
GROUP BY DATE(invoice_date), source_branch_code;

CREATE OR REPLACE VIEW v_product_sales AS
SELECT
    ii.item_code,
    MAX(COALESCE(ii.item_name, ''))               AS item_name,
    SUM(ii.quantity)                              AS qty_sold,
    SUM(ii.quantity * ii.sales_price)             AS revenue,
    COUNT(DISTINCT ii.invoice_id)                 AS orders,
    MAX(DATE(i.invoice_date))                     AS last_sold
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
GROUP BY ii.item_code;

CREATE OR REPLACE VIEW v_customer_sales AS
SELECT
    c.id                                   AS customer_id,
    c.party_name                           AS customer_name,
    COUNT(i.id)                            AS orders,
    COALESCE(SUM(i.total_amount), 0)       AS revenue,
    MAX(DATE(i.invoice_date))              AS last_purchase
FROM customers c
LEFT JOIN invoices i ON i.customer_id = c.id
GROUP BY c.id, c.party_name;
