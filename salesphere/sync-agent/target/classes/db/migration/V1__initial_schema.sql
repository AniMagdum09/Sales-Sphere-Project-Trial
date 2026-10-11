-- V1: Core normalized tables for the SalesSphere target schema.
-- Lineage to the source BILLING database is preserved via source_* columns;
-- the composite invoice identity (branch_code, doc_type, doc_no) drives idempotent upserts.

CREATE TABLE customers (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_party_no   VARCHAR(7)  NOT NULL,
    party_name        VARCHAR(100) NULL,
    phone             VARCHAR(50)  NULL,
    email             VARCHAR(100) NULL,
    address           VARCHAR(255) NULL,
    city              VARCHAR(50)  NULL,
    state             VARCHAR(50)  NULL,
    credit_limit      DECIMAL(15,2) NULL,
    opening_balance   DECIMAL(15,2) NULL,
    membership_id     VARCHAR(50)  NULL,
    source_branch_code VARCHAR(2)  NULL,
    source_doc_date   DATETIME     NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_customers_source_party (source_party_no)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE products (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    item_code   VARCHAR(50)  NOT NULL,
    item_name   VARCHAR(100) NULL,
    short_name  VARCHAR(50)  NULL,
    bar_code    VARCHAR(50)  NULL,
    size        VARCHAR(30)  NULL,
    uom         VARCHAR(30)  NULL,
    hsn_code    VARCHAR(30)  NULL,
    category    VARCHAR(50)  NULL,
    sales_price DECIMAL(15,2) NULL,
    mrp         DECIMAL(15,2) NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_products_item_code (item_code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE invoices (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_branch_code VARCHAR(2)  NOT NULL,
    source_doc_type   SMALLINT     NOT NULL,
    source_doc_no     INT          NOT NULL,
    invoice_date      DATETIME     NULL,
    invoice_time      TIME         NULL,
    customer_id       BIGINT       NULL,
    customer_name     VARCHAR(100) NULL,
    bill_no           VARCHAR(50)  NULL,
    process_date      DATETIME     NULL,
    delivery_date     DATETIME     NULL,
    doc_value         DECIMAL(15,2) NULL,
    doc_discount      DECIMAL(15,2) NULL,
    total_amount      DECIMAL(15,2) NULL,
    total_qty         DECIMAL(15,3) NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_invoices_identity (source_branch_code, source_doc_type, source_doc_no),
    KEY idx_invoices_date (invoice_date),
    KEY idx_invoices_customer (customer_id),
    CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE invoice_items (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    invoice_id        BIGINT       NOT NULL,
    source_branch_code VARCHAR(2)  NOT NULL,
    source_doc_type   SMALLINT     NOT NULL,
    source_doc_no     INT          NOT NULL,
    source_item_no    INT          NOT NULL,
    item_code         VARCHAR(50)  NULL,
    item_name         VARCHAR(100) NULL,
    bar_code          VARCHAR(50)  NULL,
    size              VARCHAR(30)  NULL,
    uom               VARCHAR(30)  NULL,
    hsn_code          VARCHAR(30)  NULL,
    category          VARCHAR(50)  NULL,
    quantity          DECIMAL(15,3) NULL,
    purchase_qty      DECIMAL(15,3) NULL,
    purchase_price    DECIMAL(15,2) NULL,
    sales_price       DECIMAL(15,2) NULL,
    mrp               DECIMAL(15,2) NULL,
    supplier_name     VARCHAR(100) NULL,
    batch_no          VARCHAR(50)  NULL,
    sp_id             VARCHAR(50)  NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_invoice_items (invoice_id, source_item_no),
    KEY idx_items_item_code (item_code),
    CONSTRAINT fk_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE day_end (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    source_branch_code VARCHAR(2) NOT NULL,
    day_end_date      DATE         NOT NULL,
    total_sales       DECIMAL(15,2) NULL,
    total_purchase    DECIMAL(15,2) NULL,
    total_collection  DECIMAL(15,2) NULL,
    total_payment     DECIMAL(15,2) NULL,
    closing_balance   DECIMAL(15,2) NULL,
    remarks           VARCHAR(255)  NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_day_end (source_branch_code, day_end_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
