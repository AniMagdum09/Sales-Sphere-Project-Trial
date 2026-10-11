-- V2: Sync run tracking + runtime-editable source configuration.

CREATE TABLE sync_metadata (
    id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
    started_at            DATETIME NOT NULL,
    finished_at           DATETIME NULL,
    status                VARCHAR(10) NOT NULL, -- RUNNING | SUCCESS | FAILED
    customers_synced      INT NOT NULL DEFAULT 0,
    products_synced       INT NOT NULL DEFAULT 0,
    invoices_synced       INT NOT NULL DEFAULT 0,
    invoice_items_synced  INT NOT NULL DEFAULT 0,
    day_end_synced        INT NOT NULL DEFAULT 0,
    duration_ms           BIGINT NOT NULL DEFAULT 0,
    error_message         TEXT NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE source_config (
    id                INT PRIMARY KEY, -- single row, id = 1
    host              VARCHAR(100) NOT NULL,
    port              INT          NOT NULL DEFAULT 1433,
    database_name     VARCHAR(100) NOT NULL,
    username          VARCHAR(100) NOT NULL,
    password          VARCHAR(200) NOT NULL,
    jdbc_extra        VARCHAR(300) NULL,
    jdbc_url_override VARCHAR(400) NULL,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
