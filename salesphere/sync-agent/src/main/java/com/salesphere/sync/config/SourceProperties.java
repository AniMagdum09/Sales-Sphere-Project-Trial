package com.salesphere.sync.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Initial source-database connection settings (salesphere.source in application.yml).
 * These seed the source_config table on first boot; after that the DB row is
 * authoritative and editable at runtime via PUT /api/config/source.
 */
@ConfigurationProperties(prefix = "salesphere.source")
public record SourceProperties(
        String host,
        Integer port,
        String databaseName,
        String username,
        String password,
        String jdbcExtra,
        String jdbcUrlOverride
) {
}
