package com.salesphere.sync.source.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * SOURCE: sales invoice header (100+ columns in the billing DB; subset mapped).
 * READ-ONLY, never written by SalesSphere.
 */
@Entity
@Table(name = "Trinvs_Master")
@Immutable
@IdClass(TrinvsMasterId.class)
public class TrinvsMaster {

    @Id
    @Column(name = "Branch_Code", length = 2)
    private String branchCode;

    @Id
    @Column(name = "Doc_Type")
    private Short docType;

    @Id
    @Column(name = "Doc_No")
    private Integer docNo;

    @Column(name = "Doc_Date")
    private LocalDateTime docDate;

    @Column(name = "Doc_Time")
    private LocalDateTime docTime;

    @Column(name = "Party_No", length = 7)
    private String partyNo;

    @Column(name = "Customer_Name", length = 100)
    private String customerName;

    @Column(name = "BILL_NO", length = 50)
    private String billNo;

    @Column(name = "Process_Date")
    private LocalDateTime processDate;

    @Column(name = "Delivery_Date")
    private LocalDateTime deliveryDate;

    @Column(name = "Doc_Value")
    private BigDecimal docValue;

    @Column(name = "Discount")
    private BigDecimal discount;

    @Column(name = "Doc_Tax5")
    private BigDecimal docTax5;

    @Column(name = "New_Total")
    private BigDecimal newTotal;

    @Column(name = "Total_Qty")
    private BigDecimal totalQty;

    @Column(name = "Mod_Date")
    private LocalDateTime modDate;

    public String getBranchCode() { return branchCode; }

    public Short getDocType() { return docType; }

    public Integer getDocNo() { return docNo; }

    public LocalDateTime getDocDate() { return docDate; }

    public LocalDateTime getDocTime() { return docTime; }

    public String getPartyNo() { return partyNo; }

    public String getCustomerName() { return customerName; }

    public String getBillNo() { return billNo; }

    public LocalDateTime getProcessDate() { return processDate; }

    public LocalDateTime getDeliveryDate() { return deliveryDate; }

    public BigDecimal getDocValue() { return docValue; }

    public BigDecimal getDiscount() { return discount; }

    public BigDecimal getDocTax5() { return docTax5; }

    public BigDecimal getNewTotal() { return newTotal; }

    public BigDecimal getTotalQty() { return totalQty; }

    public LocalDateTime getModDate() { return modDate; }

    public TrinvsMasterId id() {
        return new TrinvsMasterId(branchCode, docType, docNo);
    }
}
