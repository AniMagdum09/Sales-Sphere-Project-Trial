-- V7: real-world import support for the sponsor's report exports.
-- purchases          <- "PR  DD-MM-YYYY TO DD-MM-YYYY.xlsx" (purchase bills)
-- item_monthly_sales <- "Stock Report_*.xlsx" monthly per-item sales columns
-- products.*         <- item master enrichment (brand/department/colour/design/stock)

CREATE TABLE purchases (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_branch_code VARCHAR(2) NOT NULL DEFAULT '01',
    doc_no            INT NULL,
    bill_no           VARCHAR(50) NOT NULL,
    bill_date         DATE NOT NULL,
    supplier_name     VARCHAR(150) NULL,
    bill_amount       DECIMAL(15,2) NULL,
    taxable_amount    DECIMAL(15,2) NULL,
    tax_amount        DECIMAL(15,2) NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_purchases (source_branch_code, bill_no),
    KEY idx_purchases_date (bill_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE item_monthly_sales (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    item_code  VARCHAR(50) NOT NULL,
    ym         DATE NOT NULL,             -- first day of the month
    qty        DECIMAL(15,3) NOT NULL DEFAULT 0,
    value      DECIMAL(15,2) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_item_month (item_code, ym),
    KEY idx_ims_ym (ym)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

ALTER TABLE products
    ADD COLUMN brand       VARCHAR(80)  NULL AFTER category,
    ADD COLUMN department  VARCHAR(80)  NULL AFTER brand,
    ADD COLUMN colour      VARCHAR(50)  NULL AFTER department,
    ADD COLUMN design_no   VARCHAR(50)  NULL AFTER colour,
    ADD COLUMN stock_qty   DECIMAL(15,3) NULL AFTER purchase_price,
    ADD COLUMN stock_as_on DATE NULL AFTER stock_qty;

-- Sales reports key customers by phone number (10-12 digits), not the legacy
-- 7-char party_no of the SQL Server billing DB.
ALTER TABLE customers
    MODIFY COLUMN source_party_no VARCHAR(20) NOT NULL;
