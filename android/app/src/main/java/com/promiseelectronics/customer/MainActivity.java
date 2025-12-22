package com.promiseelectronics.customer;

import com.getcapacitor.BridgeActivity;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        // This line stops the "Swipe up/down bounce" entirely
        WebView webview = getBridge().getWebView();
        webview.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
    }
}
