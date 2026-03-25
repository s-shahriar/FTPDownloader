package com.ftpdownloader.app.modules

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.ftpdownloader.app.R

class CustomNotificationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        var reactContext: ReactApplicationContext? = null
    }

    init {
        CustomNotificationModule.reactContext = reactContext
    }

    override fun getName(): String {
        return "CustomNotificationModule"
    }

    private fun getNotificationManager(): NotificationManager {
        return reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    @ReactMethod
    fun showNotification(id: String, options: ReadableMap) {
        val title = options.getString("title") ?: ""
        val subtitle = options.getString("subtitle") ?: ""
        val progress = if (options.hasKey("progress")) options.getInt("progress") else 0
        val isPaused = if (options.hasKey("isPaused")) options.getBoolean("isPaused") else false
        val statusText = if (options.hasKey("statusText")) options.getString("statusText") else ""
        val percentText = if (options.hasKey("percentText")) options.getString("percentText") else "$progress%"

        val channelId = "custom_downloads_channel"
        val notificationManager = getNotificationManager()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Downloads",
                NotificationManager.IMPORTANCE_LOW
            )
            // No sound/vibration for updates
            channel.setSound(null, null)
            channel.enableVibration(false)
            notificationManager.createNotificationChannel(channel)
        }

        val remoteViews = RemoteViews(reactApplicationContext.packageName, R.layout.custom_download_notification)
        remoteViews.setTextViewText(R.id.notification_title, title)
        remoteViews.setTextViewText(R.id.notification_subtitle, subtitle)
        remoteViews.setTextViewText(R.id.notification_percent_text, percentText)
        remoteViews.setTextViewText(R.id.notification_status_text, statusText)
        remoteViews.setProgressBar(R.id.notification_progress_bar, 100, progress, false)

        // Setup Intents
        val cancelIntent = Intent(reactApplicationContext, CustomNotificationReceiver::class.java).apply {
            action = "ACTION_CANCEL_DOWNLOAD"
            putExtra("downloadId", id)
        }
        val cancelPendingIntent = PendingIntent.getBroadcast(
            reactApplicationContext, 
            id.hashCode() + 1, 
            cancelIntent, 
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        remoteViews.setOnClickPendingIntent(R.id.btn_cancel, cancelPendingIntent)

        if (isPaused) {
            remoteViews.setImageViewResource(R.id.btn_action, android.R.drawable.ic_media_play)
            
            val resumeIntent = Intent(reactApplicationContext, CustomNotificationReceiver::class.java).apply {
                action = "ACTION_RESUME_DOWNLOAD"
                putExtra("downloadId", id)
            }
            val resumePendingIntent = PendingIntent.getBroadcast(
                reactApplicationContext, 
                id.hashCode() + 2, 
                resumeIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            remoteViews.setOnClickPendingIntent(R.id.btn_action, resumePendingIntent)

        } else {
            remoteViews.setImageViewResource(R.id.btn_action, android.R.drawable.ic_media_pause)
            
            val pauseIntent = Intent(reactApplicationContext, CustomNotificationReceiver::class.java).apply {
                action = "ACTION_PAUSE_DOWNLOAD"
                putExtra("downloadId", id)
            }
            val pausePendingIntent = PendingIntent.getBroadcast(
                reactApplicationContext, 
                id.hashCode() + 3, 
                pauseIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            remoteViews.setOnClickPendingIntent(R.id.btn_action, pausePendingIntent)
        }
        
        val builder = NotificationCompat.Builder(reactApplicationContext, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setCustomContentView(remoteViews)
            .setCustomBigContentView(remoteViews)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setGroup("com.ftpdownloader.DOWNLOADS")
            .setGroupSummary(false)

        val numericId = id.hashCode()
        notificationManager.notify(numericId, builder.build())
    }

    @ReactMethod
    fun cancelNotification(id: String) {
        val notificationManager = getNotificationManager()
        notificationManager.cancel(id.hashCode())
    }
}
