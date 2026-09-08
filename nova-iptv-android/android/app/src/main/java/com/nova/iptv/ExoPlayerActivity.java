package com.nova.iptv;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.ui.PlayerView;

public class ExoPlayerActivity extends Activity {

    private static final String TAG = "ExoPlayer";
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_SUBTITLE = "subtitle";

    private ExoPlayer player;
    private PlayerView playerView;
    private String url;
    private String title;
    private String subtitle;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Log.d(TAG, "onCreate");
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        url = getIntent().getStringExtra(EXTRA_URL);
        title = getIntent().getStringExtra(EXTRA_TITLE);
        subtitle = getIntent().getStringExtra(EXTRA_SUBTITLE);

        Log.d(TAG, "URL: " + url);

        if (url == null || url.isEmpty()) {
            Toast.makeText(this, "URL do stream não fornecida", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        } catch (Exception e) {
            Log.w(TAG, "Não foi possível forçar landscape: " + e.getMessage());
        }

        try {
            setContentView(R.layout.activity_exo_player);
        } catch (Exception e) {
            Log.e(TAG, "Erro ao carregar layout: " + e.getMessage(), e);
            Toast.makeText(this, "Erro ao inicializar player", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        playerView = findViewById(R.id.player_view);
        TextView titleView = findViewById(R.id.player_title);
        TextView subtitleView = findViewById(R.id.player_subtitle);
        ImageButton backBtn = findViewById(R.id.btn_back);

        if (titleView != null && title != null && !title.isEmpty()) {
            titleView.setText(title);
        }
        if (subtitleView != null && subtitle != null && !subtitle.isEmpty()) {
            subtitleView.setText(subtitle);
            subtitleView.setVisibility(View.VISIBLE);
        }

        if (backBtn != null) {
            backBtn.setOnClickListener(v -> finish());
        }

        initPlayer();
    }

    private void initPlayer() {
        try {
            player = new ExoPlayer.Builder(this).build();
            playerView.setPlayer(player);
            playerView.setControllerAutoShow(true);
            playerView.setControllerShowTimeoutMs(3000);

            player.addListener(new Player.Listener() {
                @Override
                public void onPlayerError(PlaybackException error) {
                    Log.e(TAG, "Player error: " + error.getErrorCodeName() + " - " + error.getMessage());
                    Toast.makeText(ExoPlayerActivity.this,
                            "Erro: " + error.getErrorCodeName(),
                            Toast.LENGTH_LONG).show();
                }
            });

            MediaSource mediaSource = buildMediaSource(url);
            player.setMediaSource(mediaSource);
            player.setPlayWhenReady(true);
            player.prepare();
            Log.d(TAG, "Player iniciado");
        } catch (Exception e) {
            Log.e(TAG, "Erro ao iniciar player: " + e.getMessage(), e);
            Toast.makeText(this, "Erro ao iniciar: " + e.getMessage(), Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private MediaSource buildMediaSource(String url) {
        DefaultHttpDataSource.Factory dataSourceFactory = new DefaultHttpDataSource.Factory()
                .setUserAgent("Mozilla/5.0 (Linux; Android) NovaIPTV/1.0")
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(300000)
                .setAllowCrossProtocolRedirects(true);

        Uri uri = Uri.parse(url);
        String lower = url.toLowerCase();

        if (lower.contains(".m3u8") || lower.contains("/live/")) {
            Log.d(TAG, "Usando HlsMediaSource");
            return new HlsMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(MediaItem.fromUri(uri));
        } else {
            Log.d(TAG, "Usando ProgressiveMediaSource");
            return new ProgressiveMediaSource.Factory(dataSourceFactory)
                    .createMediaSource(MediaItem.fromUri(uri));
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (player != null) {
            player.pause();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) {
            player.release();
            player = null;
        }
    }

    public static void launch(Activity activity, String url, String title, String subtitle) {
        Intent intent = new Intent(activity, ExoPlayerActivity.class);
        intent.putExtra(EXTRA_URL, url);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_SUBTITLE, subtitle);
        activity.startActivity(intent);
    }
}
