package com.vrclub.poc;

/**
 * Temporary boundary for the Meta Platform SDK entitlement adapter.
 *
 * Debug builds are intentionally testable before the SDK is connected. Release
 * builds stay locked rather than accidentally shipping an unprotected paid app.
 */
final class EntitlementGate {
    private EntitlementGate() {}

    static boolean isAllowed() {
        return BuildConfig.POC_BYPASS_ENTITLEMENT;
    }
}
