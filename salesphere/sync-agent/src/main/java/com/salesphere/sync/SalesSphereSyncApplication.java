package com.salesphere.sync;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;

/**
 * SalesSphere Sync Agent.
 *
 * Both persistence layers are configured manually (see config/):
 *  - target: SalesSphere-owned MySQL, writable, Flyway-managed
 *  - source: the shop's SQL Server billing DB, STRICTLY READ-ONLY
 * Boot's datasource/JPA/Flyway auto-configuration is excluded so that nothing can
 * accidentally wire writes into the source side.
 */
@SpringBootApplication(exclude = {
        DataSourceAutoConfiguration.class,
        HibernateJpaAutoConfiguration.class,
        FlywayAutoConfiguration.class
})
public class SalesSphereSyncApplication {

    public static void main(String[] args) {
        SpringApplication.run(SalesSphereSyncApplication.class, args);
    }
}
