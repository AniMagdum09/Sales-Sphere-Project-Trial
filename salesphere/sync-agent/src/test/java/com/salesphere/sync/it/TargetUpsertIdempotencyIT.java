package com.salesphere.sync.it;

import com.salesphere.sync.sync.TargetUpsertService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Handover step 04 (target side): prove idempotency of the upsert logic against a REAL
 * MySQL database. Runs the same source-shaped data through the upsert path twice and
 * asserts row counts remain identical (no duplicates) and changed values update in place.
 *
 * Uses its own scratch database so it never touches salessphere_local demo data.
 * Enable with:  mvn test -Dtest=TargetUpsertIdempotencyIT -Dit.mysql=1
 */
@SpringBootTest
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@TestPropertySource(properties = {
        "salesphere.target.hikari.jdbc-url=jdbc:mysql://127.0.0.1:3306/salessphere_it_test?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Kolkata",
        "salesphere.target.hikari.username=root",
        "salesphere.target.hikari.password=root",
        "salesphere.sync.rebuild-daily-stock=false"
})
class TargetUpsertIdempotencyIT {

    private static final String DB = "salessphere_it_test";
    private static final LocalDateTime TS = LocalDateTime.of(2026, 3, 15, 10, 30);

    @Autowired
    private TargetUpsertService upserts;

    @BeforeAll
    static void createScratchDb() throws SQLException {
        try (Connection c = DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/?user=root&password=root");
             Statement st = c.createStatement()) {
            st.execute("DROP DATABASE IF EXISTS " + DB);
            st.execute("CREATE DATABASE " + DB);
        }
    }

    @AfterAll
    static void dropScratchDb() throws SQLException {
        try (Connection c = DriverManager.getConnection("jdbc:mysql://127.0.0.1:3306/?user=root&password=root");
             Statement st = c.createStatement()) {
            st.execute("DROP DATABASE IF EXISTS " + DB);
        }
    }

    private List<Object[]> customerRows() {
        return List.of(
                new Object[]{"1", "Walk In Regular", "9876543210", null, "MG Road", "Pune", "MH",
                        new BigDecimal("50000.00"), new BigDecimal("0.00"), "M-001", "01", TS},
                new Object[]{"2", "Anmol Sports Traders", "9123456780", null, "Station Rd", "Pune", "MH",
                        new BigDecimal("100000.00"), new BigDecimal("1200.50"), null, "01", TS});
    }

    private List<Object[]> invoiceRows() {
        return List.of(
                new Object[]{"01", (short) 1, 1001, TS, TS.toLocalTime(), 1L, "Walk In Regular", "B-1001",
                        TS, null, new BigDecimal("1500.00"), new BigDecimal("50.00"),
                        new BigDecimal("1450.00"), new BigDecimal("2.000")},
                new Object[]{"01", (short) 1, 1002, TS, TS.toLocalTime(), 2L, "Anmol Sports Traders", "B-1002",
                        TS, null, new BigDecimal("3000.00"), null,
                        new BigDecimal("3000.00"), new BigDecimal("3.000")});
    }

    private List<Object[]> itemRows(Map<String, Long> ids) {
        return List.of(
                new Object[]{ids.get("01|1|1001"), "01", (short) 1, 1001, 1, "SP-001", "Cricket Bat KW",
                        "8901234567890", "SH", "PCS", "9506", "Bats", new BigDecimal("1.000"), null,
                        new BigDecimal("900.00"), new BigDecimal("1200.00"), new BigDecimal("1499.00"),
                        "SS Supplier", "B26", "SP1"},
                new Object[]{ids.get("01|1|1001"), "01", (short) 1, 1001, 2, "SP-002", "Tennis Ball",
                        "8901234567891", null, "PCS", "9506", "Balls", new BigDecimal("1.000"), null,
                        new BigDecimal("200.00"), new BigDecimal("250.00"), new BigDecimal("299.00"),
                        "Cosco", null, null});
    }

    private List<Object[]> dayEndRows() {
        return List.<Object[]>of(
                new Object[]{"01", LocalDate.of(2026, 3, 15), new BigDecimal("4500.00"),
                        new BigDecimal("0.00"), new BigDecimal("4500.00"), new BigDecimal("0.00"),
                        new BigDecimal("4500.00"), "ok"});
    }

    private Map<String, Long> counts() {
        Map<String, Long> m = new HashMap<>();
        m.put("customers", upserts.countTable("customers"));
        m.put("invoices", upserts.countTable("invoices"));
        m.put("invoice_items", upserts.countTable("invoice_items"));
        m.put("day_end", upserts.countTable("day_end"));
        return m;
    }

    @Test
    @Order(1)
    void firstRunInsertsAllRows() {
        upserts.upsertCustomers(customerRows());
        upserts.upsertInvoices(invoiceRows());
        Map<String, Long> ids = upserts.loadInvoiceIdMap();
        assertEquals(2, ids.size(), "composite identity must yield 2 distinct invoices");
        upserts.upsertInvoiceItems(itemRows(ids));
        upserts.upsertDayEnd(dayEndRows());

        Map<String, Long> c = counts();
        assertEquals(2, c.get("customers"));
        assertEquals(2, c.get("invoices"));
        assertEquals(2, c.get("invoice_items"));
        assertEquals(1, c.get("day_end"));
    }

    @Test
    @Order(2)
    void secondRunIsIdempotent() {
        upserts.upsertCustomers(customerRows());
        upserts.upsertInvoices(invoiceRows());
        Map<String, Long> ids = upserts.loadInvoiceIdMap();
        upserts.upsertInvoiceItems(itemRows(ids));
        upserts.upsertDayEnd(dayEndRows());

        Map<String, Long> c = counts();
        assertEquals(2, c.get("customers"), "second run must not duplicate customers");
        assertEquals(2, c.get("invoices"), "second run must not duplicate invoices");
        assertEquals(2, c.get("invoice_items"), "second run must not duplicate line items");
        assertEquals(1, c.get("day_end"), "second run must not duplicate day_end rows");
    }

    @Test
    @Order(3)
    void changedDataUpdatesInPlace() {
        List<Object[]> changed = List.<Object[]>of(
                new Object[]{"01", (short) 1, 1001, TS, TS.toLocalTime(), 1L, "Walk In Regular", "B-1001",
                        TS, null, new BigDecimal("1500.00"), new BigDecimal("100.00"),
                        new BigDecimal("1400.00"), new BigDecimal("2.000")});
        upserts.upsertInvoices(changed);
        assertEquals(2, upserts.countTable("invoices"), "changed value must update, not insert");
        Long id = upserts.loadInvoiceIdMap().get("01|1|1001");
        assertNotNull(id);
        assertTrue(id > 0);
    }

    @Test
    @Order(4)
    void dailyStockRebuildIsIdempotent() {
        upserts.rebuildDailyStock();
        long afterFirst = upserts.countTable("daily_stock");
        upserts.rebuildDailyStock();
        long afterSecond = upserts.countTable("daily_stock");
        assertTrue(afterFirst > 0, "daily_stock should be populated from items");
        assertEquals(afterFirst, afterSecond, "rebuild must be deterministic");
    }
}
