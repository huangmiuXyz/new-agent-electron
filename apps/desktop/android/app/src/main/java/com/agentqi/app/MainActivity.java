package com.agentqi.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
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
    }
}
