package com.salesphere.sync.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Owns the runtime source-connection configuration.
 * The single source_config row (id=1) is authoritative; it is seeded from
 * application.yml on first boot and editable via the REST API without a restart.
 */
@Service
@EnableConfigurationProperties(SourceProperties.class)
public class SourceConfigService {

    private static final Logger log = LoggerFactory.getLogger(SourceConfigService.class);
    public static final String MASK = "********";

    private final JdbcTemplate target;
    private final DynamicSourceDataSource sourceDataSource;
    private final SourceProperties defaults;

    public SourceConfigService(org.springframework.beans.factory.ObjectProvider<javax.sql.DataSource> targetDataSource,
                               DynamicSourceDataSource sourceDataSource,
                               SourceProperties defaults) {
        this.target = new JdbcTemplate(targetDataSource.getObject());
        this.sourceDataSource = sourceDataSource;
        this.defaults = defaults;
    }

    public record SourceSettings(String host, int port, String databaseName, String username,
                                 String password, String jdbcExtra, String jdbcUrlOverride) {

        public String buildJdbcUrl() {
            if (jdbcUrlOverride != null && !jdbcUrlOverride.isBlank()) {
                return jdbcUrlOverride.trim();
            }
            StringBuilder sb = new StringBuilder("jdbc:sqlserver://").append(host).append(':').append(port)
                    .append(";databaseName=").append(databaseName);
            if (jdbcExtra != null && !jdbcExtra.isBlank()) {
                for (String part : jdbcExtra.split(";")) {
                    if (!part.isBlank()) {
                        sb.append(';').append(part.trim());
                    }
                }
            }
            return sb.toString();
        }
    }

    public record SourceConfigView(String host, int port, String databaseName, String username,
                                   String passwordMasked, String jdbcExtra, String jdbcUrlOverride,
                                   String jdbcUrl, boolean configured) {
    }

    /** Seeds the config row from application.yml when missing and wires the live pool. */
    public void initialize() {
        Integer count = target.queryForObject("SELECT COUNT(*) FROM source_config", Integer.class);
        if (count == null || count == 0) {
            target.update("""
                    INSERT INTO source_config (id, host, port, database_name, username, password, jdbc_extra, jdbc_url_override)
                    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    defaults.host(), defaults.port() == null ? 1433 : defaults.port(),
                    defaults.databaseName(), defaults.username(), defaults.password() == null ? "" : defaults.password(),
                    defaults.jdbcExtra(), defaults.jdbcUrlOverride());
            log.info("Seeded source_config from application.yml defaults");
        }
        reloadDataSource();
    }

    public synchronized void reloadDataSource() {
        SourceSettings s = loadSettings();
        DynamicSourceDataSource.SourceSettings ds = new DynamicSourceDataSource.SourceSettings(
                s.buildJdbcUrl(), s.username(), s.password(), null);
        sourceDataSource.apply(ds);
    }

    public SourceSettings loadSettings() {
        List<Map<String, Object>> rows = target.queryForList(
                "SELECT host, port, database_name, username, password, jdbc_extra, jdbc_url_override FROM source_config WHERE id = 1");
        if (rows.isEmpty()) {
            throw new IllegalStateException("source_config row missing");
        }
        Map<String, Object> r = rows.get(0);
        return new SourceSettings(
                String.valueOf(r.get("host")),
                ((Number) r.get("port")).intValue(),
                String.valueOf(r.get("database_name")),
                String.valueOf(r.get("username")),
                r.get("password") == null ? "" : String.valueOf(r.get("password")),
                r.get("jdbc_extra") == null ? "" : String.valueOf(r.get("jdbc_extra")),
                r.get("jdbc_url_override") == null ? "" : String.valueOf(r.get("jdbc_url_override")));
    }

    public SourceConfigView view() {
        SourceSettings s = loadSettings();
        return new SourceConfigView(s.host(), s.port(), s.databaseName(), s.username(),
                MASK, s.jdbcExtra(), s.jdbcUrlOverride(), maskUrl(s.buildJdbcUrl()), sourceDataSource.isConfigured());
    }

    private static String maskUrl(String url) {
        return url == null ? null : url.replaceAll("password=[^;]*", "password=***");
    }

    public record UpdateRequest(String host, Integer port, String databaseName, String username,
                                String password, String jdbcExtra, String jdbcUrlOverride) {
    }

    /** Applies a partial update; null/blank password keeps the existing one. */
    public synchronized SourceConfigView update(UpdateRequest req) {
        SourceSettings cur = loadSettings();
        String newHost = firstNonBlank(req.host(), cur.host());
        int newPort = req.port() != null ? req.port() : cur.port();
        String newDb = firstNonBlank(req.databaseName(), cur.databaseName());
        String newUser = firstNonBlank(req.username(), cur.username());
        String newPass = req.password() != null ? req.password() : cur.password();
        String newExtra = req.jdbcExtra() != null ? req.jdbcExtra() : cur.jdbcExtra();
        String newOverride = req.jdbcUrlOverride() != null ? req.jdbcUrlOverride() : cur.jdbcUrlOverride();

        target.update("""
                UPDATE source_config SET host=?, port=?, database_name=?, username=?, password=?, jdbc_extra=?, jdbc_url_override=?
                WHERE id=1
                """, newHost, newPort, newDb, newUser, newPass, newExtra, newOverride);

        reloadDataSource();
        return view();
    }

    public record TestResult(boolean ok, String serverVersion, String error) {
    }

    /** Opens a fresh raw connection to prove the source is reachable (validation step 01). */
    public TestResult testConnection() {
        SourceSettings s = loadSettings();
        String url = s.buildJdbcUrl();
        try (Connection c = DriverManager.getConnection(url, s.username(), s.password())) {
            return new TestResult(true, c.getMetaData().getDatabaseProductName() + " "
                    + c.getMetaData().getDatabaseProductVersion(), null);
        } catch (Exception e) {
            log.warn("Source connection test failed: {}", e.getMessage());
            return new TestResult(false, null, e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    public Optional<String> probeServerVersionQuietly() {
        try {
            return Optional.ofNullable(sourceDataSource.probeServerVersion());
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private static String firstNonBlank(String a, String fallback) {
        return (a != null && !a.isBlank()) ? a : fallback;
    }
}
