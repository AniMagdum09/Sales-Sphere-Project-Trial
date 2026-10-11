package com.salesphere.sync.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Target-side idempotent writes.
 *
 * Every write is an upsert keyed on the source identity, so running the sync twice
 * produces exactly the same rows — no duplicates, no data corruption:
 *   customers      <- source_party_no                          (from PartyMst.party_no)
 *   invoices       <- (branch_code, doc_type, doc_no)          (composite invoice identity)
 *   invoice_items  <- (invoice_id, source_item_no)
 *   day_end        <- (branch_code, day_end_date)
 *   products       <- item_code
 * Uses INSERT ... AS new ON DUPLICATE KEY UPDATE (MySQL 8.0.19+ alias syntax).
 */
@Service
public class TargetUpsertService {

    private static final Logger log = LoggerFactory.getLogger(TargetUpsertService.class);
    private static final int BATCH_SIZE = 500;

    private final JdbcTemplate jdbc;

    public TargetUpsertService(@Qualifier("targetDataSource") DataSource targetDataSource) {
        this.jdbc = new JdbcTemplate(targetDataSource);
    }

    @Transactional("targetTransactionManager")
    public int upsertCustomers(List<Object[]> rows) {
        String sql = """
                INSERT INTO customers
                    (source_party_no, party_name, phone, email, address, city, state,
                     credit_limit, opening_balance, membership_id, source_branch_code, source_doc_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) AS new
                ON DUPLICATE KEY UPDATE
                    party_name = new.party_name, phone = new.phone, email = new.email,
                    address = new.address, city = new.city, state = new.state,
                    credit_limit = new.credit_limit, opening_balance = new.opening_balance,
                    membership_id = new.membership_id, source_branch_code = new.source_branch_code,
                    source_doc_date = new.source_doc_date
                """;
        return executeBatched(sql, rows, "customers");
    }

    @Transactional("targetTransactionManager")
    public int upsertProducts(List<Object[]> rows) {
        String sql = """
                INSERT INTO products
                    (item_code, item_name, short_name, bar_code, size, uom, hsn_code, category,
                     sales_price, mrp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) AS new
                ON DUPLICATE KEY UPDATE
                    item_name = new.item_name, short_name = new.short_name, bar_code = new.bar_code,
                    size = new.size, uom = new.uom, hsn_code = new.hsn_code, category = new.category,
                    sales_price = new.sales_price, mrp = new.mrp
                """;
        return executeBatched(sql, rows, "products");
    }

    @Transactional("targetTransactionManager")
    public int upsertInvoices(List<Object[]> rows) {
        String sql = """
                INSERT INTO invoices
                    (source_branch_code, source_doc_type, source_doc_no, invoice_date, invoice_time,
                     customer_id, customer_name, bill_no, process_date, delivery_date,
                     doc_value, doc_discount, total_amount, total_qty)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) AS new
                ON DUPLICATE KEY UPDATE
                    invoice_date = new.invoice_date, invoice_time = new.invoice_time,
                    customer_id = new.customer_id, customer_name = new.customer_name,
                    bill_no = new.bill_no, process_date = new.process_date,
                    delivery_date = new.delivery_date, doc_value = new.doc_value,
                    doc_discount = new.doc_discount, total_amount = new.total_amount,
                    total_qty = new.total_qty
                """;
        return executeBatched(sql, rows, "invoices");
    }

    @Transactional("targetTransactionManager")
    public int upsertInvoiceItems(List<Object[]> rows) {
        String sql = """
                INSERT INTO invoice_items
                    (invoice_id, source_branch_code, source_doc_type, source_doc_no, source_item_no,
                     item_code, item_name, bar_code, size, uom, hsn_code, category,
                     quantity, purchase_qty, purchase_price, sales_price, mrp,
                     supplier_name, batch_no, sp_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) AS new
                ON DUPLICATE KEY UPDATE
                    item_code = new.item_code, item_name = new.item_name, bar_code = new.bar_code,
                    size = new.size, uom = new.uom, hsn_code = new.hsn_code, category = new.category,
                    quantity = new.quantity, purchase_qty = new.purchase_qty,
                    purchase_price = new.purchase_price, sales_price = new.sales_price, mrp = new.mrp,
                    supplier_name = new.supplier_name, batch_no = new.batch_no, sp_id = new.sp_id
                """;
        return executeBatched(sql, rows, "invoice_items");
    }

    @Transactional("targetTransactionManager")
    public int upsertDayEnd(List<Object[]> rows) {
        String sql = """
                INSERT INTO day_end
                    (source_branch_code, day_end_date, total_sales, total_purchase,
                     total_collection, total_payment, closing_balance, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) AS new
                ON DUPLICATE KEY UPDATE
                    total_sales = new.total_sales, total_purchase = new.total_purchase,
                    total_collection = new.total_collection, total_payment = new.total_payment,
                    closing_balance = new.closing_balance, remarks = new.remarks
                """;
        return executeBatched(sql, rows, "day_end");
    }

    /**
     * Recomputes the daily stock snapshot from synced movements (V3 table).
     * closing_qty = cumulative purchased - cumulative sold within the synced window.
     * Fully derived: DELETE + INSERT in one transaction keeps it idempotent.
     */
    @Transactional("targetTransactionManager")
    public int rebuildDailyStock() {
        jdbc.update("DELETE FROM daily_stock");
        int inserted = jdbc.update("""
                INSERT INTO daily_stock (branch_code, snap_date, item_code, sold_qty, purchased_qty, closing_qty, source)
                SELECT agg.branch_code, agg.d, agg.item_code, agg.sold, agg.purch,
                       SUM(agg.purch - agg.sold) OVER (PARTITION BY agg.branch_code, agg.item_code ORDER BY agg.d),
                       'derived'
                FROM (
                    SELECT i.source_branch_code AS branch_code,
                           DATE(i.invoice_date) AS d,
                           ii.item_code,
                           SUM(CASE WHEN ii.quantity > 0 THEN ii.quantity ELSE 0 END)    AS sold,
                           SUM(CASE WHEN ii.purchase_qty > 0 THEN ii.purchase_qty ELSE 0 END) AS purch
                    FROM invoice_items ii
                    JOIN invoices i ON i.id = ii.invoice_id
                    WHERE ii.item_code IS NOT NULL AND ii.item_code <> '' AND i.invoice_date IS NOT NULL
                    GROUP BY i.source_branch_code, DATE(i.invoice_date), ii.item_code
                ) agg
                """);
        log.info("daily_stock rebuilt: {} rows", inserted);
        return inserted;
    }

    /** Map of composite invoice identity -> target invoice id, for line-item linking. */
    @Transactional("targetTransactionManager")
    public Map<String, Long> loadInvoiceIdMap() {
        Map<String, Long> map = new HashMap<>();
        jdbc.query("SELECT id, source_branch_code, source_doc_type, source_doc_no FROM invoices", rs -> {
            String key = rs.getString(2) + "|" + rs.getInt(3) + "|" + rs.getInt(4);
            map.put(key, rs.getLong(1));
        });
        return map;
    }

    /** Map of source party_no -> target customer id. */
    @Transactional("targetTransactionManager")
    public Map<String, Long> loadCustomerIdMap() {
        Map<String, Long> map = new HashMap<>();
        jdbc.query("SELECT id, source_party_no FROM customers", rs -> {
            map.put(rs.getString(2), rs.getLong(1));
        });
        return map;
    }

    public long countTable(String table) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
        return n == null ? 0 : n;
    }

    private int executeBatched(String sql, List<Object[]> rows, String label) {
        int total = 0;
        for (int i = 0; i < rows.size(); i += BATCH_SIZE) {
            List<Object[]> chunk = rows.subList(i, Math.min(i + BATCH_SIZE, rows.size()));
            int[] results = jdbc.batchUpdate(sql, chunk);
            for (int r : results) {
                total += Math.max(r, 0);
            }
        }
        log.info("upsert {}: {} source rows batched (affected {})", label, rows.size(), total);
        return rows.size();
    }
}
