package com.salesphere.sync.source.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;

/**
 * SOURCE: invoice line items / inventory movement (100+ columns; subset mapped).
 * READ-ONLY, never written by SalesSphere.
 *
 * CAUTION (handover step 06): Im_Remaining_Qty is mapped for inspection but has NOT
 * been proven to be the authoritative current stock balance. Do not build inventory
 * analytics on it until verified with the shop owner / a physical count.
 */
@Entity
@Table(name = "Imtrans_Detail")
@Immutable
@IdClass(ImtransDetailId.class)
public class ImtransDetail {

    @Id
    @Column(name = "Branch_Code", length = 2)
    private String branchCode;

    @Id
    @Column(name = "Doc_Type")
    private Short docType;

    @Id
    @Column(name = "Doc_No")
    private Integer docNo;

    @Id
    @Column(name = "ItemNo")
    private Integer itemNo;

    @Column(name = "Item_Code", length = 10)
    private String itemCode;

    @Column(name = "Item_Short_Name", length = 50)
    private String itemShortName;

    @Column(name = "Bar_Code", length = 50)
    private String barCode;

    @Column(name = "Size", length = 10)
    private String size;

    @Column(name = "UOM", length = 5)
    private String uom;

    @Column(name = "HSN_Code", length = 10)
    private String hsnCode;

    @Column(name = "Product", length = 50)
    private String product;

    @Column(name = "Im_Qty")
    private BigDecimal imQty;

    @Column(name = "Im_Purchase_Qty")
    private BigDecimal imPurchaseQty;

    @Column(name = "Im_Remaining_Qty")
    private BigDecimal imRemainingQty;

    @Column(name = "Purchase_Price")
    private BigDecimal purchasePrice;

    @Column(name = "Sales_Price")
    private BigDecimal salesPrice;

    @Column(name = "MRP")
    private BigDecimal mrp;

    @Column(name = "Supplier_Name", length = 100)
    private String supplierName;

    @Column(name = "Batch_No", length = 50)
    private String batchNo;

    @Column(name = "Sp_ID", length = 50)
    private String spId;

    public String getBranchCode() { return branchCode; }

    public Short getDocType() { return docType; }

    public Integer getDocNo() { return docNo; }

    public Integer getItemNo() { return itemNo; }

    public String getItemCode() { return itemCode; }

    public String getItemShortName() { return itemShortName; }

    public String getBarCode() { return barCode; }

    public String getSize() { return size; }

    public String getUom() { return uom; }

    public String getHsnCode() { return hsnCode; }

    public String getProduct() { return product; }

    public BigDecimal getImQty() { return imQty; }

    public BigDecimal getImPurchaseQty() { return imPurchaseQty; }

    public BigDecimal getImRemainingQty() { return imRemainingQty; }

    public BigDecimal getPurchasePrice() { return purchasePrice; }

    public BigDecimal getSalesPrice() { return salesPrice; }

    public BigDecimal getMrp() { return mrp; }

    public String getSupplierName() { return supplierName; }

    public String getBatchNo() { return batchNo; }

    public String getSpId() { return spId; }
}
