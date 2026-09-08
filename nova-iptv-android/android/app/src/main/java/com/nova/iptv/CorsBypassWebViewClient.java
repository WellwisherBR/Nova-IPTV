package com.nova.iptv;

import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Intercepta requisições externas feitas pelo WebView (XHR/fetch do hls.js e
 * tags de mídia) e as executa na camada nativa, devolvendo a resposta com
 * headers CORS liberados. Contorna a política de CORS do WebView, já que
 * servidores IPTV não enviam Access-Control-Allow-Origin.
 */
public class CorsBypassWebViewClient extends BridgeWebViewClient {

    private static final String TAG = "CorsBypass";

    public CorsBypassWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (shouldProxy(request)) {
            WebResourceResponse proxied = fetchWithCors(request);
            if (proxied != null) return proxied;
        }
        return super.shouldInterceptRequest(view, request);
    }

    private boolean shouldProxy(WebResourceRequest request) {
        String scheme = request.getUrl().getScheme();
        if (scheme == null || (!scheme.equals("http") && !scheme.equals("https"))) return false;
        String host = request.getUrl().getHost();
        if (host == null || host.isEmpty()
                || host.equals("localhost") || host.startsWith("127.")
                || host.equals("[::1]")) return false;

        // Interceptar TODAS as requisições externas para garantir CORS
        // (hls.js usa XHR/fetch que precisa de Access-Control-Allow-Origin)
        return true;
    }

    private WebResourceResponse fetchWithCors(WebResourceRequest request) {
        String url = request.getUrl().toString();
        Log.d(TAG, "Proxy: " + url);
        try {
            if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
                Map<String, String> headers = new HashMap<>();
                headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
                headers.put("Access-Control-Allow-Headers", "*");
                headers.put("Access-Control-Max-Age", "86400");
                return new WebResourceResponse("text/plain", "UTF-8", 204, "No Content", headers, new ByteArrayInputStream(new byte[0]));
            }

            HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(300000);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) NovaIPTV/1.0");
            conn.setRequestProperty("Connection", "close");

            // Repassar headers relevantes do request original
            Map<String, String> reqHeaders = request.getRequestHeaders();
            if (reqHeaders != null) {
                for (Map.Entry<String, String> e : reqHeaders.entrySet()) {
                    String k = e.getKey();
                    if (k == null) continue;
                    if (k.equalsIgnoreCase("Host") || k.equalsIgnoreCase("Connection")
                            || k.equalsIgnoreCase("Content-Length") || k.equalsIgnoreCase("Origin")
                            || k.equalsIgnoreCase("Referer") || k.equalsIgnoreCase("Accept-Encoding")
                            || k.equalsIgnoreCase("Upgrade")) continue;
                    conn.setRequestProperty(k, e.getValue());
                }
            }

            int status = conn.getResponseCode();
            if (status < 200 || status >= 400) {
                Log.d(TAG, "HTTP " + status + " para " + url);
                conn.disconnect();
                return null;
            }

            String mime = conn.getContentType();
            if (mime == null || mime.isEmpty()) mime = guessMime(url);
            int semi = mime.indexOf(';');
            if (semi >= 0) mime = mime.substring(0, semi).trim();

            // Headers de resposta: CORS liberado + headers originais relevantes
            Map<String, String> respHeaders = new HashMap<>();
            respHeaders.put("Access-Control-Allow-Origin", "*");
            respHeaders.put("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
            respHeaders.put("Access-Control-Allow-Headers", "*");

            // Preservar Content-Type, Content-Length, Accept-Ranges do servidor
            String contentLength = conn.getHeaderField("Content-Length");
            if (contentLength != null) respHeaders.put("Content-Length", contentLength);
            String acceptRanges = conn.getHeaderField("Accept-Ranges");
            if (acceptRanges != null) respHeaders.put("Accept-Ranges", acceptRanges);
            String contentRange = conn.getHeaderField("Content-Range");
            if (contentRange != null) respHeaders.put("Content-Range", contentRange);

            // Usar InputStream direto (streaming) em vez de baixar tudo em memória
            final InputStream rawIs = conn.getInputStream();
            InputStream stream = new FilterInputStream(rawIs) {
                @Override
                public void close() throws IOException {
                    super.close();
                    conn.disconnect();
                }
            };

            String reason = conn.getResponseMessage();
            if (reason == null || reason.isEmpty()) reason = "OK";

            Log.d(TAG, "OK " + status + " " + mime + " para " + url);
            return new WebResourceResponse(mime, null, status, reason, respHeaders, stream);
        } catch (Exception e) {
            Log.e(TAG, "Erro no proxy: " + e.getMessage());
            return null;
        }
    }

    private String guessMime(String url) {
        String lower = url.toLowerCase();
        if (lower.contains(".m3u8")) return "application/vnd.apple.mpegurl";
        if (lower.contains(".ts")) return "video/mp2t";
        if (lower.contains(".mp4")) return "video/mp4";
        if (lower.contains(".mkv")) return "video/x-matroska";
        if (lower.contains(".webm")) return "video/webm";
        if (lower.contains(".m4s")) return "video/iso.segment";
        if (lower.contains(".mpd")) return "application/dash+xml";
        return "application/octet-stream";
    }
}
