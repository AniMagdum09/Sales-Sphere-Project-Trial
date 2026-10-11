package com.salesphere.sync.source.entity;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;

/** Daily summary identity: branch + day-end date. */
public class DayEndId implements Serializable {

    private String branchCode;
    private LocalDateTime dayEndDate;

    public DayEndId() {
    }

    public DayEndId(String branchCode, LocalDateTime dayEndDate) {
        this.branchCode = branchCode;
        this.dayEndDate = dayEndDate;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof DayEndId that)) return false;
        return Objects.equals(branchCode, that.branchCode)
                && Objects.equals(dayEndDate, that.dayEndDate);
    }

    @Override
    public int hashCode() {
        return Objects.hash(branchCode, dayEndDate);
    }
}
