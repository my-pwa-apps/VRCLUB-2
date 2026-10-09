package com.vrclub.poc;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

/**
 * Native packaging proof of concept.
 *
 * The production web payload is loaded from APK assets, not from the public TWA URL.
 * This deliberately uses framework WebView APIs so the POC has no third-party runtime
 * dependency. WebXR availability is reported in the native banner; a real Quest test
 * decides whether this route can replace the browser-based TWA.
 */
public final class MainActivity extends Activity {
    private static final String TAG = "VRClubPOC";
    private WebView webView;
    private TextView diagnostics;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Log.i(TAG, "onCreate");

        diagnostics = new TextView(this);
        diagnostics.setTextColor(Color.WHITE);
        diagnostics.setTextSize(12);
        diagnostics.setBackgroundColor(0xCC10131A);
        diagnostics.setPadding(18, 10, 18, 10);
        diagnostics.setText("NOCTURNE native POC | local APK payload | entitlement: debug bypass");

        if (!EntitlementGate.isAllowed()) {
            TextView locked = new TextView(this);
            locked.setTextColor(Color.WHITE);
            locked.setTextSize(20);
            locked.setGravity(android.view.Gravity.CENTER);
            locked.setText("NOCTURNE is not entitled on this device.\nInstall it from the Meta Horizon Store.");
            locked.setBackgroundColor(Color.BLACK);
            setContentView(locked);
            return;
        }

        webView = new WebView(this);
        configureWebView(webView);
        webView.loadUrl("file:///android_asset/web/index.html");

        setContentView(webView);
        addContentView(diagnostics, new android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private void configureWebView(WebView view) {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        view.addJavascriptInterface(new ProbeBridge(), "NativePOC");
        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new LocalPayloadClient());
        Log.i(TAG, "WebView package: " + WebView.getCurrentWebViewPackage());
    }

    private final class LocalPayloadClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            // Keep the app shell local. User-selected HTTPS audio and the official
            // SoundCloud iframe remain allowed as subresources by WebView.
            return request.isForMainFrame() && !url.startsWith("file:///android_asset/web/");
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            Log.i(TAG, "Local page finished: " + url);
            String probe = "(async()=>{" +
                    "const result={title:document.title,href:location.href,xr:!!navigator.xr,immersive:false};" +
                    "if(navigator.xr){try{result.immersive=await navigator.xr.isSessionSupported('immersive-vr');}" +
                    "catch(e){result.xrError=String(e);}}NativePOC.report(JSON.stringify(result))})()";
            view.evaluateJavascript(probe, null);
        }
    }

    private final class ProbeBridge {
        @JavascriptInterface
        public void report(String value) {
            String bounded = value == null ? "null" : value.substring(0, Math.min(value.length(), 1000));
            Log.i(TAG, "XR probe: " + bounded);
            runOnUiThread(() -> diagnostics.setText("NOCTURNE native POC | " + bounded));
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        Log.i(TAG, "onResume");
    }

    @Override
    protected void onPause() {
        Log.i(TAG, "onPause");
        super.onPause();
    }

    @Override
    protected void onStop() {
        Log.i(TAG, "onStop");
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        Log.i(TAG, "onDestroy");
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
