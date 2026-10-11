package com.salesphere.sync.source.repo;

import com.salesphere.sync.source.entity.TrinvsMaster;
import com.salesphere.sync.source.entity.TrinvsMasterId;
import org.springframework.data.jpa.repository.JpaRepository;

/** READ-ONLY source repository (sales invoice headers). */
public interface TrinvsMasterRepository extends JpaRepository<TrinvsMaster, TrinvsMasterId> {
}
