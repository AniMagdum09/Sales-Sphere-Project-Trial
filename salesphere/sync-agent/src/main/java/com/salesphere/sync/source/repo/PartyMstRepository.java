package com.salesphere.sync.source.repo;

import com.salesphere.sync.source.entity.PartyMst;
import org.springframework.data.jpa.repository.JpaRepository;

/** READ-ONLY source repository (customer / party master). */
public interface PartyMstRepository extends JpaRepository<PartyMst, String> {
}
