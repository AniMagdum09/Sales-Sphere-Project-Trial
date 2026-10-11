package com.salesphere.sync.sync;

import com.salesphere.sync.source.entity.DayEnd;
import com.salesphere.sync.source.entity.ImtransDetail;
import com.salesphere.sync.source.entity.PartyMst;
import com.salesphere.sync.source.entity.TrinvsMaster;
import com.salesphere.sync.target.entity.SyncMetadata;
import com.salesphere.sync.target.repo.SyncMetadataRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Orchestrates one full synchronization: SQL Server (read-only) -> MySQL (upsert).
 *
 * Full-scan + upsert by design: idempotent and simple to verify (running it twice
 * must leave row counts identical). Incremental syncs are a future optimization.
 */
@Service
public class SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncService.class);

    private final SourceReadService source;
    private final TargetUpsertService target;
    private final SyncMetadataRepository metadataRepo;
    private final int pageSize;
    private final boolean rebuildDailyStock;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public SyncService(SourceReadService source, TargetUpsertService target,
                       SyncMetadataRepository metadataRepo,
                       @Value("${salesphere.sync.page-size:2000}") int pageSize,
                       @Value("${salesphere.sync.rebuild-daily-stock:true}") boolean rebuildDailyStock) {
        this.source = source;
        this.target = target;
        this.metadataRepo = metadataRepo;
        this.pageSize = Math.max(200, pageSize);
        this.rebuildDailyStock = rebuildDailyStock;
    }

    public boolean isRunning() {
        return running.get();
    }

    @Async("syncExecutor")
    public void runFullSyncAsync() {
        try {
            runFullSync();
        } catch (SyncInProgressException e) {
            log.warn("Rejected overlapping sync trigger");
        }
    }

    public SyncMetadata runFullSync() {
        if (!running.compareAndSet(false, true)) {
            throw new SyncInProgressException();
        }
        long t0 = System.currentTimeMillis();
        SyncMetadata meta = new SyncMetadata();
        meta.setStartedAt(LocalDateTime.now());
        meta.setStatus(SyncMetadata.STATUS_RUNNING);
        metadataRepo.saveAndFlush(meta);
        log.info("Sync run #{} started", meta.getId());

        try {
            int customers = syncCustomers();
            int products = syncProducts();
            int invoices = syncInvoices();
            int items = syncInvoiceItems();
            int dayEnds = syncDayEnd();
            if (rebuildDailyStock) {
                target.rebuildDailyStock();
            }

            meta.setCustomersSynced(customers);
            meta.setProductsSynced(products);
            meta.setInvoicesSynced(invoices);
            meta.setInvoiceItemsSynced(items);
            meta.setDayEndSynced(dayEnds);
            meta.setStatus(SyncMetadata.STATUS_SUCCESS);
            log.info("Sync run #{} SUCCEEDED in {} ms (customers={}, products={}, invoices={}, items={}, day_end={})",
                    meta.getId(), System.currentTimeMillis() - t0, customers, products, invoices, items, dayEnds);
        } catch (Exception e) {
            meta.setStatus(SyncMetadata.STATUS_FAILED);
            meta.setErrorMessage(trim(String.valueOf(e.getMessage()), 2000));
            log.error("Sync run #{} FAILED", meta.getId(), e);
        } finally {
            meta.setFinishedAt(LocalDateTime.now());
            meta.setDurationMs(System.currentTimeMillis() - t0);
            metadataRepo.save(meta);
            running.set(false);
        }
        return meta;
    }

    public int syncCustomers() {
        List<Object[]> rows = new ArrayList<>();
        Pageable pageable = PageRequest.of(0, pageSize, Sort.by("partyNo"));
        Page<PartyMst> page;
        int pageNumber = 0;
        do {
            page = source.readCustomers(pageable);
            for (PartyMst p : page.getContent()) {
                if (p.getPartyNo() == null || p.getPartyNo().isBlank()) {
                    continue; // cannot dedupe without a key
                }
                rows.add(new Object[]{
                        trim(p.getPartyNo(), 7), trim(p.getPartyName(), 100), trim(p.getPhone(), 50), null,
                        trim(p.getAddress(), 255), trim(p.getCity(), 50), trim(p.getState(), 50),
                        p.getCreditLimit(), p.getOpeningBalance(), trim(p.getMembershipId(), 50),
                        trim(p.getBranchCode(), 2), p.getDocDate()
                });
            }
            pageable = PageRequest.of(++pageNumber, pageSize, Sort.by("partyNo"));
        } while (page.hasNext());
        return target.upsertCustomers(rows);
    }

    public int syncProducts() {
        List<Object[]> src = source.aggregateProducts();
        List<Object[]> rows = new ArrayList<>();
        for (Object[] r : src) {
            if (r[0] == null) continue;
            String itemCode = trim(String.valueOf(r[0]), 50);
            String name = r[1] == null ? null : trim(String.valueOf(r[1]), 50);
            rows.add(new Object[]{
                    itemCode, name, name, trim(asString(r[2]), 50), trim(asString(r[3]), 30),
                    trim(asString(r[4]), 30), trim(asString(r[5]), 30), trim(asString(r[6]), 50),
                    (BigDecimal) r[7], (BigDecimal) r[8]
            });
        }
        return target.upsertProducts(rows);
    }

    public int syncInvoices() {
        Map<String, Long> customerIds = target.loadCustomerIdMap();
        List<Object[]> rows = new ArrayList<>();
        Pageable pageable = PageRequest.of(0, pageSize,
                Sort.by("branchCode", "docType", "docNo"));
        Page<TrinvsMaster> page;
        int pageNumber = 0;
        do {
            page = source.readInvoices(pageable);
            for (TrinvsMaster t : page.getContent()) {
                String partyKey = t.getPartyNo() == null ? null : trim(t.getPartyNo(), 7);
                Long customerId = partyKey == null ? null : customerIds.get(partyKey);
                BigDecimal amount = t.getNewTotal() != null ? t.getNewTotal() : t.getDocValue();
                rows.add(new Object[]{
                        trim(t.getBranchCode(), 2), t.getDocType(), t.getDocNo(),
                        t.getDocDate(), t.getDocTime() == null ? null : t.getDocTime().toLocalTime(),
                        customerId, trim(t.getCustomerName(), 100), trim(t.getBillNo(), 50),
                        t.getProcessDate(), t.getDeliveryDate(),
                        t.getDocValue(), t.getDiscount(), amount, t.getTotalQty()
                });
            }
            pageable = PageRequest.of(++pageNumber, pageSize, Sort.by("branchCode", "docType", "docNo"));
        } while (page.hasNext());
        return target.upsertInvoices(rows);
    }

    public int syncInvoiceItems() {
        Map<String, Long> invoiceIds = target.loadInvoiceIdMap();
        List<Object[]> rows = new ArrayList<>();
        long skipped = 0;
        Pageable pageable = PageRequest.of(0, pageSize,
                Sort.by("branchCode", "docType", "docNo", "itemNo"));
        Page<ImtransDetail> page;
        int pageNumber = 0;
        do {
            page = source.readLineItems(pageable);
            for (ImtransDetail d : page.getContent()) {
                String key = trim(d.getBranchCode(), 2) + "|" + d.getDocType() + "|" + d.getDocNo();
                Long invoiceId = invoiceIds.get(key);
                if (invoiceId == null) {
                    skipped++;
                    continue; // header missing (or not synced yet) - line item cannot be linked
                }
                rows.add(new Object[]{
                        invoiceId, trim(d.getBranchCode(), 2), d.getDocType(), d.getDocNo(), d.getItemNo(),
                        trim(asString(d.getItemCode()), 50), trim(asString(d.getItemShortName()), 100),
                        trim(asString(d.getBarCode()), 50), trim(asString(d.getSize()), 30),
                        trim(asString(d.getUom()), 30), trim(asString(d.getHsnCode()), 30),
                        trim(asString(d.getProduct()), 50),
                        d.getImQty(), d.getImPurchaseQty(), d.getPurchasePrice(),
                        d.getSalesPrice(), d.getMrp(), trim(asString(d.getSupplierName()), 100),
                        trim(asString(d.getBatchNo()), 50), trim(asString(d.getSpId()), 50)
                });
            }
            pageable = PageRequest.of(++pageNumber, pageSize,
                    Sort.by("branchCode", "docType", "docNo", "itemNo"));
        } while (page.hasNext());
        if (skipped > 0) {
            log.warn("{} line item(s) skipped: no matching invoice header in target", skipped);
        }
        return target.upsertInvoiceItems(rows);
    }

    public int syncDayEnd() {
        List<Object[]> rows = new ArrayList<>();
        Pageable pageable = PageRequest.of(0, pageSize, Sort.by("branchCode", "dayEndDate"));
        Page<DayEnd> page;
        int pageNumber = 0;
        do {
            page = source.readDayEnds(pageable);
            for (DayEnd d : page.getContent()) {
                rows.add(new Object[]{
                        trim(d.getBranchCode(), 2),
                        d.getDayEndDate() == null ? null : d.getDayEndDate().toLocalDate(),
                        d.getTotalSales(), d.getTotalPurchase(), d.getTotalCollection(),
                        d.getTotalPayment(), d.getClosingBalance(), trim(d.getRemarks(), 255)
                });
            }
            pageable = PageRequest.of(++pageNumber, pageSize, Sort.by("branchCode", "dayEndDate"));
        } while (page.hasNext());
        return target.upsertDayEnd(rows);
    }

    public Map<String, Long> tableCounts() {
        Map<String, Long> counts = new HashMap<>();
        counts.put("customers", target.countTable("customers"));
        counts.put("products", target.countTable("products"));
        counts.put("invoices", target.countTable("invoices"));
        counts.put("invoice_items", target.countTable("invoice_items"));
        counts.put("day_end", target.countTable("day_end"));
        counts.put("daily_stock", target.countTable("daily_stock"));
        return counts;
    }

    private static String asString(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static String trim(String s, int max) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : (t.length() <= max ? t : t.substring(0, max));
    }
}
