package com.salesphere.sync.target.repo;

import com.salesphere.sync.target.entity.SyncMetadata;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SyncMetadataRepository extends JpaRepository<SyncMetadata, Long> {

    Optional<SyncMetadata> findFirstByOrderByIdDesc();
}
