package com.salesphere.sync.web;

import com.salesphere.sync.sync.SyncInProgressException;
import com.salesphere.sync.sync.SyncService;
import com.salesphere.sync.target.entity.SyncMetadata;
import com.salesphere.sync.target.repo.SyncMetadataRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private final SyncService syncService;
    private final SyncMetadataRepository metadataRepo;

    public SyncController(SyncService syncService, SyncMetadataRepository metadataRepo) {
        this.syncService = syncService;
        this.metadataRepo = metadataRepo;
    }

    /** Triggers a full synchronization (async). Returns immediately with the run status. */
    @PostMapping("/run")
    public ResponseEntity<Map<String, Object>> run() {
        SyncMetadata current = metadataRepo.findFirstByOrderByIdDesc().orElse(null);
        if (syncService.isRunning()) {
            throw new SyncInProgressException();
        }
        syncService.runFullSyncAsync();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("triggered", true);
        body.put("message", "Synchronization started; poll /api/sync/status for progress");
        body.put("previous_run", current == null ? null : SyncController.viewOf(current));
        return ResponseEntity.accepted().body(body);
    }

    /** Last sync run + live target row counts (handover step 03/04 evidence). */
    @GetMapping("/status")
    public Map<String, Object> status() {
        SyncMetadata last = metadataRepo.findFirstByOrderByIdDesc().orElse(null);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("running", syncService.isRunning());
        body.put("last_run", last == null ? null : viewOf(last));
        body.put("target_row_counts", syncService.tableCounts());
        return body;
    }

    static Map<String, Object> viewOf(SyncMetadata m) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("id", m.getId());
        v.put("started_at", m.getStartedAt());
        v.put("finished_at", m.getFinishedAt());
        v.put("status", m.getStatus());
        v.put("customers_synced", m.getCustomersSynced());
        v.put("products_synced", m.getProductsSynced());
        v.put("invoices_synced", m.getInvoicesSynced());
        v.put("invoice_items_synced", m.getInvoiceItemsSynced());
        v.put("day_end_synced", m.getDayEndSynced());
        v.put("duration_ms", m.getDurationMs());
        v.put("error_message", m.getErrorMessage());
        return v;
    }
}
