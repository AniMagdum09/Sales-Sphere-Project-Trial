package com.salesphere.sync.web;

import com.salesphere.sync.config.SourceConfigService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Dynamic source-connection configuration (no application restart needed). */
@RestController
@RequestMapping("/api/config/source")
public class ConfigController {

    private final SourceConfigService configService;

    public ConfigController(SourceConfigService configService) {
        this.configService = configService;
    }

    @GetMapping
    public SourceConfigService.SourceConfigView get() {
        return configService.view();
    }

    @PutMapping
    public SourceConfigService.SourceConfigView update(@RequestBody SourceConfigService.UpdateRequest req) {
        return configService.update(req);
    }

    /** Live connectivity check against the source SQL Server (validation step 01). */
    @PostMapping("/test")
    public SourceConfigService.TestResult test() {
        return configService.testConnection();
    }
}
