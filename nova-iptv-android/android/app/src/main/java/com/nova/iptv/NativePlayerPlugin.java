package com.nova.iptv;

import android.app.Activity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    @PluginMethod
    public void playLive(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "");
        String subtitle = call.getString("subtitle", "");

        if (url == null || url.isEmpty()) {
            call.reject("URL obrigatória");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity não disponível");
            return;
        }

        activity.runOnUiThread(() -> {
            ExoPlayerActivity.launch(activity, url, title, subtitle);
            call.resolve();
        });
    }
}
