package com.salesphere.sync.source.entity;

import java.io.Serializable;
import java.util.Objects;

/** Line-item identity: invoice identity + ItemNo within the invoice. */
public class ImtransDetailId implements Serializable {

    private String branchCode;
    private Short docType;
    private Integer docNo;
    private Integer itemNo;

    public ImtransDetailId() {
    }

    public ImtransDetailId(String branchCode, Short docType, Integer docNo, Integer itemNo) {
        this.branchCode = branchCode;
        this.docType = docType;
        this.docNo = docNo;
        this.itemNo = itemNo;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ImtransDetailId that)) return false;
        return Objects.equals(branchCode, that.branchCode)
                && Objects.equals(docType, that.docType)
                && Objects.equals(docNo, that.docNo)
                && Objects.equals(itemNo, that.itemNo);
    }

    @Override
    public int hashCode() {
        return Objects.hash(branchCode, docType, docNo, itemNo);
    }
}
