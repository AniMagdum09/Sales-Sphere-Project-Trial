package com.salesphere.sync.source.repo;

import com.salesphere.sync.source.entity.ImtransDetail;
import com.salesphere.sync.source.entity.ImtransDetailId;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

/** READ-ONLY source repository (invoice line items). */
public interface ImtransDetailRepository extends JpaRepository<ImtransDetail, ImtransDetailId> {

    /**
     * Distinct product master derived from line items: one row per Item_Code.
     * The source DB has no dedicated product master among the 4 synced tables.
     */
    @Query(value = """
            SELECT Item_Code,
                   MAX(Item_Short_Name), MAX(Bar_Code), MAX(Size), MAX(UOM),
                   MAX(HSN_Code), MAX(Product),
                   MAX(Sales_Price), MAX(MRP)
            FROM Imtrans_Detail
            WHERE Item_Code IS NOT NULL AND Item_Code <> ''
            GROUP BY Item_Code
            """, nativeQuery = true)
    List<Object[]> aggregateProducts();
}
