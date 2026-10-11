package com.salesphere.sync.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Primary;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.JpaVendorAdapter;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.util.HashMap;
import java.util.Map;

/**
 * TARGET (SalesSphere-owned MySQL) persistence: primary DataSource, Flyway migrations,
 * EntityManagerFactory and transaction manager.
 */
@Configuration
@EnableTransactionManagement
@EnableJpaRepositories(
        basePackages = "com.salesphere.sync.target.repo",
        entityManagerFactoryRef = "targetEntityManagerFactory",
        transactionManagerRef = "targetTransactionManager")
public class TargetJpaConfig {

    @Bean
    @Primary
    @ConfigurationProperties(prefix = "salesphere.target.hikari")
    public HikariConfig targetHikariConfig() {
        HikariConfig cfg = new HikariConfig();
        cfg.setPoolName("salesphere-target");
        cfg.setMaximumPoolSize(5);
        return cfg;
    }

    @Bean
    @Primary
    public DataSource targetDataSource(HikariConfig targetHikariConfig) {
        return new HikariDataSource(targetHikariConfig);
    }

    @Bean(initMethod = "migrate")
    @Primary
    public Flyway targetFlyway(DataSource targetDataSource) {
        return Flyway.configure()
                .dataSource(targetDataSource)
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load();
    }

    @Bean
    @Primary
    @DependsOn("targetFlyway")
    public LocalContainerEntityManagerFactoryBean targetEntityManagerFactory(DataSource targetDataSource) {
        LocalContainerEntityManagerFactoryBean emf = new LocalContainerEntityManagerFactoryBean();
        emf.setDataSource(targetDataSource);
        emf.setPackagesToScan("com.salesphere.sync.target.entity");
        emf.setJpaVendorAdapter(targetVendorAdapter());
        Map<String, Object> props = new HashMap<>();
        props.put("hibernate.hbm2ddl.auto", "validate");
        props.put("hibernate.physical_naming_strategy",
                "org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl");
        emf.setJpaPropertyMap(props);
        return emf;
    }

    private JpaVendorAdapter targetVendorAdapter() {
        HibernateJpaVendorAdapter adapter = new HibernateJpaVendorAdapter();
        adapter.setDatabase(org.springframework.orm.jpa.vendor.Database.MYSQL);
        return adapter;
    }

    @Bean
    @Primary
    public JpaTransactionManager targetTransactionManager(
            @Qualifier("targetEntityManagerFactory") LocalContainerEntityManagerFactoryBean emf) {
        return new JpaTransactionManager(emf.getObject());
    }
}
