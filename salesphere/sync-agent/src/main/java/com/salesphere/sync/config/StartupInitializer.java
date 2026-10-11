package com.salesphere.sync.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Seeds source_config from application.yml on first boot and opens the source pool. */
@Component
public class StartupInitializer implements ApplicationRunner {

    private final SourceConfigService sourceConfigService;

    public StartupInitializer(SourceConfigService sourceConfigService) {
        this.sourceConfigService = sourceConfigService;
    }

    @Override
    public void run(ApplicationArguments args) {
        sourceConfigService.initialize();
    }
}
