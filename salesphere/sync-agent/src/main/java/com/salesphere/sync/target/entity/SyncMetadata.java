package com.salesphere.sync.target.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** One row per sync run (V2 migration). */
@Entity
@Table(name = "sync_metadata")
public class SyncMetadata {

    public static final String STATUS_RUNNING = "RUNNING";
    public static final String STATUS_SUCCESS = "SUCCESS";
    public static final String STATUS_FAILED = "FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    @Column(name = "status", nullable = false, length = 10)
    private String status;

    @Column(name = "customers_synced")
    private Integer customersSynced = 0;

    @Column(name = "products_synced")
    private Integer productsSynced = 0;

    @Column(name = "invoices_synced")
    private Integer invoicesSynced = 0;

    @Column(name = "invoice_items_synced")
    private Integer invoiceItemsSynced = 0;

    @Column(name = "day_end_synced")
    private Integer dayEndSynced = 0;

    @Column(name = "duration_ms")
    private Long durationMs = 0L;

    @Column(name = "error_message")
    private String errorMessage;

    public Long getId() { return id; }

    public LocalDateTime getStartedAt() { return startedAt; }

    public void setStartedAt(LocalDateTime v) { this.startedAt = v; }

    public LocalDateTime getFinishedAt() { return finishedAt; }

    public void setFinishedAt(LocalDateTime v) { this.finishedAt = v; }

    public String getStatus() { return status; }

    public void setStatus(String v) { this.status = v; }

    public Integer getCustomersSynced() { return customersSynced; }

    public void setCustomersSynced(Integer v) { this.customersSynced = v; }

    public Integer getProductsSynced() { return productsSynced; }

    public void setProductsSynced(Integer v) { this.productsSynced = v; }

    public Integer getInvoicesSynced() { return invoicesSynced; }

    public void setInvoicesSynced(Integer v) { this.invoicesSynced = v; }

    public Integer getInvoiceItemsSynced() { return invoiceItemsSynced; }

    public void setInvoiceItemsSynced(Integer v) { this.invoiceItemsSynced = v; }

    public Integer getDayEndSynced() { return dayEndSynced; }

    public void setDayEndSynced(Integer v) { this.dayEndSynced = v; }

    public Long getDurationMs() { return durationMs; }

    public void setDurationMs(Long v) { this.durationMs = v; }

    public String getErrorMessage() { return errorMessage; }

    public void setErrorMessage(String v) { this.errorMessage = v; }
}
