package com.salesphere.sync.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.JpaVendorAdapter;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.Database;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import java.util.HashMap;
import java.util.Map;

/**
 * SOURCE (shop's SQL Server billing DB) persistence.
 *
 * READ-ONLY BY DESIGN:
 *  - the EntityManagerFactory points at the reloadable DynamicSourceDataSource
 *  - every source read runs inside @Transactional(readOnly = true, "sourceTransactionManager")
 *  - source entities are Hibernate @Immutable
 * No repository, service, or endpoint in this application ever writes to the source.
 */
@Configuration
@EnableJpaRepositories(
        basePackages = "com.salesphere.sync.source.repo",
        entityManagerFactoryRef = "sourceEntityManagerFactory",
        transactionManagerRef = "sourceTransactionManager")
public class SourceJpaConfig {

    /**
     * Reloadable connection pool for the source. Starts empty; StartupInitializer seeds
     * source_config from application.yml and applies the settings at boot.
     */
    @Bean
    public DynamicSourceDataSource sourceDataSource() {
        return new DynamicSourceDataSource();
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean sourceEntityManagerFactory(DynamicSourceDataSource sourceDataSource) {
        LocalContainerEntityManagerFactoryBean emf = new LocalContainerEntityManagerFactoryBean();
        emf.setDataSource(sourceDataSource);
        emf.setPackagesToScan("com.salesphere.sync.source.entity");
        emf.setJpaVendorAdapter(sourceVendorAdapter());
        Map<String, Object> props = new HashMap<>();
        // Legacy source may be an old SQL Server (ERD says 2005); pin the dialect so
        // Hibernate never needs to guess (jTDS metadata confuses auto-detection).
        props.put("hibernate.dialect", "org.hibernate.dialect.SQLServerDialect");
        props.put("hibernate.physical_naming_strategy",
                "org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl");
        emf.setJpaPropertyMap(props);
        return emf;
    }

    private JpaVendorAdapter sourceVendorAdapter() {
        HibernateJpaVendorAdapter adapter = new HibernateJpaVendorAdapter();
        adapter.setDatabase(Database.SQL_SERVER);
        // never let Hibernate generate DDL against the billing DB
        adapter.setGenerateDdl(false);
        return adapter;
    }

    @Bean
    public JpaTransactionManager sourceTransactionManager(
            LocalContainerEntityManagerFactoryBean sourceEntityManagerFactory) {
        return new JpaTransactionManager(sourceEntityManagerFactory.getObject());
    }
}
