-- V3: Daily stock balance snapshot table.
-- NOTE on stock authority: Im_Remaining_Qty in the source DB has NOT been verified as the
-- authoritative stock balance (handover step 06). Daily stock is therefore DERIVED from
-- synced movements: closing_qty = cumulative purchase qty - cumulative sales qty within the
-- synced data window. Reconcile against DAY_END / physical counts before trusting it.

CREATE TABLE daily_stock (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    branch_code   VARCHAR(2)   NOT NULL DEFAULT '',
    snap_date     DATE         NOT NULL,
    item_code     VARCHAR(50)  NOT NULL,
    sold_qty      DECIMAL(15,3) NOT NULL DEFAULT 0,
    purchased_qty DECIMAL(15,3) NOT NULL DEFAULT 0,
    closing_qty   DECIMAL(15,3) NOT NULL DEFAULT 0,
    source        VARCHAR(20)  NOT NULL DEFAULT 'derived',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_daily_stock (branch_code, snap_date, item_code),
    KEY idx_daily_stock_item (item_code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
