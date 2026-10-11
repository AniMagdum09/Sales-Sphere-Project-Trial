-- V5: CSV/Excel import run history (SalesSphere data-import feature).

CREATE TABLE import_runs (
    id           BIGINT AUTO_INCREMENT PRIMARY KEY,
    filename     VARCHAR(255) NOT NULL,
    kinds        VARCHAR(100) NOT NULL,          -- e.g. 'invoices+invoice_items'
    branch_code  VARCHAR(2)   NULL,              -- branch forced at upload, if any
    rows_read    INT NOT NULL DEFAULT 0,
    rows_ok      INT NOT NULL DEFAULT 0,
    rows_failed  INT NOT NULL DEFAULT 0,
    status       VARCHAR(10) NOT NULL,           -- SUCCESS | PARTIAL | FAILED
    errors_json  TEXT NULL,                      -- first 50 row-level errors
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
