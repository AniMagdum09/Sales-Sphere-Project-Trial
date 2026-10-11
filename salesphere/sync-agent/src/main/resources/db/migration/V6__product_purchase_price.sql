-- V6: product master cost price. The CSV/Excel importer enriches the product
-- master with purchase cost; analytics use line-level purchase_price, this column
-- keeps the master record's cost for stock valuation and future features.

ALTER TABLE products
    ADD COLUMN purchase_price DECIMAL(15,2) NULL AFTER sales_price;
