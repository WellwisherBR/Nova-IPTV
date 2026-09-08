package com.nova.iptv;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "HttpBridge")
public class HttpBridgePlugin extends Plugin {

    @PluginMethod
    public void httpGet(final PluginCall call) {
        final String url = call.getString("url");
        int t = call.getInt("timeout", 30000);
        final int timeout = t > 0 ? t : 30000;
        if (url == null || url.isEmpty()) {
            JSObject err = new JSObject();
            err.put("ok", false);
            err.put("status", 0);
            err.put("error", "URL obrigatória");
            call.resolve(err);
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL u = new URL(url);
                    conn = (HttpURLConnection) u.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(timeout);
                    conn.setReadTimeout(timeout);
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) NovaIPTV/1.0");
                    int status = conn.getResponseCode();
                    boolean ok = status >= 200 && status < 300;
                    InputStream is = ok ? conn.getInputStream() : conn.getErrorStream();
                    StringBuilder sb = new StringBuilder();
                    if (is != null) {
                        BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8), 16384);
                        char[] buf = new char[8192];
                        int n;
                        while ((n = br.read(buf)) != -1) sb.append(buf, 0, n);
                        br.close();
                    }
                    JSObject ret = new JSObject();
                    ret.put("ok", ok);
                    ret.put("status", status);
                    ret.put("data", sb.toString());
                    if (!ok) ret.put("error", "HTTP " + status);
                    call.resolve(ret);
                } catch (Exception e) {
                    JSObject ret = new JSObject();
                    ret.put("ok", false);
                    ret.put("status", 0);
                    ret.put("data", "");
                    ret.put("error", e.getMessage() != null ? e.getMessage() : "Falha de rede");
                    call.resolve(ret);
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }).start();
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL obrigatória");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Nenhum app pode abrir este link");
        }
    }
}
