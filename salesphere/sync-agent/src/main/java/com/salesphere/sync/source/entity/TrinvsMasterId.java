package com.salesphere.sync.source.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * Composite invoice identity in the source DB: Branch_Code + Doc_Type + Doc_No.
 * Doc_No alone is NOT unique — this triple is the basis of all dedup logic.
 */
public class TrinvsMasterId implements Serializable {

    private String branchCode;
    private Short docType;
    private Integer docNo;

    public TrinvsMasterId() {
    }

    public TrinvsMasterId(String branchCode, Short docType, Integer docNo) {
        this.branchCode = branchCode;
        this.docType = docType;
        this.docNo = docNo;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof TrinvsMasterId that)) return false;
        return Objects.equals(branchCode, that.branchCode)
                && Objects.equals(docType, that.docType)
                && Objects.equals(docNo, that.docNo);
    }

    @Override
    public int hashCode() {
        return Objects.hash(branchCode, docType, docNo);
    }

    public String key() {
        return branchCode + "|" + docType + "|" + docNo;
    }
}
