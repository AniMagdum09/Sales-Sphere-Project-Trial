package com.salesphere.sync.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.io.PrintWriter;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;

/**
 * Reloadable DataSource for the SOURCE (SQL Server) side.
 *
 * The same instance is handed to the source EntityManagerFactory at boot; when the
 * source configuration is updated at runtime (PUT /api/config/source) only the inner
 * connection pool is swapped, so the EntityManagerFactory does not need to be rebuilt
 * and the application does not restart.
 */
public class DynamicSourceDataSource implements DataSource {

    private static final Logger log = LoggerFactory.getLogger(DynamicSourceDataSource.class);

    public record SourceSettings(String jdbcUrl, String username, String password, String driverClassName) {
    }

    private volatile HikariDataSource delegate;

    public synchronized void apply(SourceSettings settings) {
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(settings.jdbcUrl());
        cfg.setUsername(settings.username());
        cfg.setPassword(settings.password());
        if (settings.driverClassName() != null && !settings.driverClassName().isBlank()) {
            cfg.setDriverClassName(settings.driverClassName());
        }
        cfg.setPoolName("salesphere-source");
        cfg.setMaximumPoolSize(3);
        cfg.setMinimumIdle(0);
        cfg.setConnectionTimeout(15_000);
        cfg.setValidationTimeout(10_000);
        // Do NOT fail application startup when the source is unreachable (validation
        // step 01 expects a graceful /api/config/source/test failure instead of a crash).
        cfg.setInitializationFailTimeout(-1);

        HikariDataSource old = this.delegate;
        this.delegate = new HikariDataSource(cfg);
        if (old != null) {
            // let in-flight reads finish before the old pool shuts down
            Thread closer = new Thread(() -> {
                try {
                    Thread.sleep(5_000);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                old.close();
            }, "old-source-pool-closer");
            closer.setDaemon(true);
            closer.start();
        }
        log.info("Source DataSource reconfigured -> {}", describeUrl(settings));
    }

    private static String describeUrl(SourceSettings settings) {
        String url = settings.jdbcUrl();
        return url == null ? "<null>" : url.replaceAll("password=[^;]*", "password=***");
    }

    public SourceSettings currentSettings() {
        HikariDataSource ds = delegate;
        return ds == null ? null : new SourceSettings(ds.getJdbcUrl(), ds.getUsername(), null, ds.getDriverClassName());
    }

    public boolean isConfigured() {
        return delegate != null;
    }

    /** Opens a raw connection to verify the source is reachable; returns the server version. */
    public String probeServerVersion() throws SQLException {
        try (Connection c = delegate.getConnection()) {
            DatabaseMetaData md = c.getMetaData();
            return md.getDatabaseProductName() + " " + md.getDatabaseProductVersion();
        }
    }

    @Override
    public Connection getConnection() throws SQLException {
        HikariDataSource ds = delegate;
        if (ds == null) {
            throw new SQLException("Source database is not configured yet");
        }
        return ds.getConnection();
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return getConnection();
    }

    @Override
    public PrintWriter getLogWriter() throws SQLException {
        HikariDataSource ds = delegate;
        return ds == null ? null : ds.getLogWriter();
    }

    @Override
    public void setLogWriter(PrintWriter out) throws SQLException {
        HikariDataSource ds = delegate;
        if (ds != null) {
            ds.setLogWriter(out);
        }
    }

    @Override
    public void setLoginTimeout(int seconds) throws SQLException {
        HikariDataSource ds = delegate;
        if (ds != null) {
            ds.setLoginTimeout(seconds);
        }
    }

    @Override
    public int getLoginTimeout() throws SQLException {
        HikariDataSource ds = delegate;
        return ds == null ? 0 : ds.getLoginTimeout();
    }

    @Override
    public java.util.logging.Logger getParentLogger() throws SQLFeatureNotSupportedException {
        throw new SQLFeatureNotSupportedException();
    }

    @Override
    public <T> T unwrap(Class<T> iface) throws SQLException {
        if (iface.isInstance(this)) {
            return iface.cast(this);
        }
        HikariDataSource ds = delegate;
        if (ds != null && iface.isInstance(ds)) {
            return iface.cast(ds);
        }
        throw new SQLException("Not a wrapper for " + iface.getName());
    }

    @Override
    public boolean isWrapperFor(Class<?> iface) {
        return iface.isInstance(this) || (delegate != null && iface.isInstance(delegate));
    }
}
