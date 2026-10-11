package com.salesphere.sync.sync;

/** Thrown when a sync is triggered while another run is still in progress. */
public class SyncInProgressException extends RuntimeException {
    public SyncInProgressException() {
        super("A synchronization run is already in progress");
    }
}
