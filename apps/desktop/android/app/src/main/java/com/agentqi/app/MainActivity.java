package com.agentqi.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Enable edge-to-edge
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        
        // Make Status Bar and Navigation Bar transparent
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        // Ensure status bar content is visible (dark icons for light theme)
        View decorView = getWindow().getDecorView();
        WindowCompat.getInsetsController(getWindow(), decorView).setAppearanceLightStatusBars(true);
        WindowCompat.getInsetsController(getWindow(), decorView).setAppearanceLightNavigationBars(true);

        // Allow HTTPS WebView to access local HTTP sync host on LAN.
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            syncSafeAreaInsetsToWebView(this.bridge.getWebView());
        }
    }

    private void syncSafeAreaInsetsToWebView(WebView webView) {
        View decorView = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (view, windowInsets) -> {
            Insets safeAreaInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            float density = getResources().getDisplayMetrics().density;
            int top = Math.round(safeAreaInsets.top / density);
            int right = Math.round(safeAreaInsets.right / density);
            int bottom = Math.round(safeAreaInsets.bottom / density);
            int left = Math.round(safeAreaInsets.left / density);

            applySafeAreaInsetsToWebView(webView, top, right, bottom, left);
            webView.postDelayed(() -> applySafeAreaInsetsToWebView(webView, top, right, bottom, left), 250);

            return windowInsets;
        });
        ViewCompat.requestApplyInsets(decorView);
    }

    private void applySafeAreaInsetsToWebView(WebView webView, int top, int right, int bottom, int left) {
        String script = "(function(){"
            + "var root=document.documentElement;if(!root)return;"
            + "root.style.setProperty('--native-safe-area-top','" + top + "px');"
            + "root.style.setProperty('--native-safe-area-right','" + right + "px');"
            + "root.style.setProperty('--native-safe-area-bottom','" + bottom + "px');"
            + "root.style.setProperty('--native-safe-area-left','" + left + "px');"
            + "})();";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
