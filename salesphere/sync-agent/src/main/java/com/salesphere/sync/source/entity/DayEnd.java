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
 * SOURCE: daily sales / inventory summary per branch. READ-ONLY, never written.
 */
@Entity
@Table(name = "DAY_END")
@Immutable
@IdClass(DayEndId.class)
public class DayEnd {

    @Id
    @Column(name = "Branch_Code", length = 2)
    private String branchCode;

    @Id
    @Column(name = "Day_End_Date")
    private LocalDateTime dayEndDate;

    @Column(name = "Total_Sales")
    private BigDecimal totalSales;

    @Column(name = "Total_Purchase")
    private BigDecimal totalPurchase;

    @Column(name = "Total_Collection")
    private BigDecimal totalCollection;

    @Column(name = "Total_Payment")
    private BigDecimal totalPayment;

    @Column(name = "Closing_Balance")
    private BigDecimal closingBalance;

    @Column(name = "Remarks")
    private String remarks;

    public String getBranchCode() { return branchCode; }

    public LocalDateTime getDayEndDate() { return dayEndDate; }

    public BigDecimal getTotalSales() { return totalSales; }

    public BigDecimal getTotalPurchase() { return totalPurchase; }

    public BigDecimal getTotalCollection() { return totalCollection; }

    public BigDecimal getTotalPayment() { return totalPayment; }

    public BigDecimal getClosingBalance() { return closingBalance; }

    public String getRemarks() { return remarks; }
}
