package com.salesphere.sync.source.repo;

import com.salesphere.sync.source.entity.DayEnd;
import com.salesphere.sync.source.entity.DayEndId;
import org.springframework.data.jpa.repository.JpaRepository;

/** READ-ONLY source repository (daily branch summaries). */
public interface DayEndRepository extends JpaRepository<DayEnd, DayEndId> {
}
