package com.salesphere.sync.sync;

import com.salesphere.sync.source.entity.DayEnd;
import com.salesphere.sync.source.entity.ImtransDetail;
import com.salesphere.sync.source.entity.PartyMst;
import com.salesphere.sync.source.entity.TrinvsMaster;
import com.salesphere.sync.source.repo.DayEndRepository;
import com.salesphere.sync.source.repo.ImtransDetailRepository;
import com.salesphere.sync.source.repo.PartyMstRepository;
import com.salesphere.sync.source.repo.TrinvsMasterRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * All reads from the SOURCE billing DB funnel through this service.
 * Every method is readOnly + @Immutable entities => nothing here can write to the source.
 */
@Service
public class SourceReadService {

    private final PartyMstRepository parties;
    private final TrinvsMasterRepository invoices;
    private final ImtransDetailRepository lineItems;
    private final DayEndRepository dayEnds;

    public SourceReadService(PartyMstRepository parties, TrinvsMasterRepository invoices,
                             ImtransDetailRepository lineItems, DayEndRepository dayEnds) {
        this.parties = parties;
        this.invoices = invoices;
        this.lineItems = lineItems;
        this.dayEnds = dayEnds;
    }

    @Transactional(readOnly = true, transactionManager = "sourceTransactionManager")
    public Page<PartyMst> readCustomers(Pageable pageable) {
        return parties.findAll(pageable);
    }

    @Transactional(readOnly = true, transactionManager = "sourceTransactionManager")
    public Page<TrinvsMaster> readInvoices(Pageable pageable) {
        return invoices.findAll(pageable);
    }

    @Transactional(readOnly = true, transactionManager = "sourceTransactionManager")
    public Page<ImtransDetail> readLineItems(Pageable pageable) {
        return lineItems.findAll(pageable);
    }

    @Transactional(readOnly = true, transactionManager = "sourceTransactionManager")
    public Page<DayEnd> readDayEnds(Pageable pageable) {
        return dayEnds.findAll(pageable);
    }

    @Transactional(readOnly = true, transactionManager = "sourceTransactionManager")
    public List<Object[]> aggregateProducts() {
        return lineItems.aggregateProducts();
    }
}
