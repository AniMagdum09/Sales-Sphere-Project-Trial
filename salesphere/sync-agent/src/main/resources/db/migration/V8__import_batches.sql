-- V8: per-import batch tracking, so any import run (or everything) can be deleted.

ALTER TABLE invoices
    ADD COLUMN batch_id BIGINT NULL, ADD INDEX idx_invoices_batch (batch_id);
ALTER TABLE invoice_items
    ADD COLUMN batch_id BIGINT NULL, ADD INDEX idx_items_batch (batch_id);
ALTER TABLE customers
    ADD COLUMN batch_id BIGINT NULL, ADD INDEX idx_customers_batch (batch_id);
ALTER TABLE products
    ADD COLUMN batch_id BIGINT NULL, ADD INDEX idx_products_batch (batch_id);
ALTER TABLE purchases
    ADD COLUMN batch_id BIGINT NULL, ADD INDEX idx_purchases_batch (batch_id);
ALTER TABLE item_monthly_sales
    ADD COLUMN batch_id BIGINT NULL, ADD INDEX idx_ims_batch (batch_id);
ALTER TABLE day_end
    ADD COLUMN batch_id BIGINT NULL, ADD INDEX idx_day_end_batch (batch_id);

ALTER TABLE import_runs
    ADD COLUMN tables_json TEXT NULL;

ALTER TABLE daily_stock
    ADD COLUMN batch_id BIGINT NULL, ADD INDEX idx_daily_stock_batch (batch_id);
