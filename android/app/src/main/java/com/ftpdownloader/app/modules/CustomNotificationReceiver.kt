package com.ftpdownloader.app.modules

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule

class CustomNotificationReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        val downloadId = intent.getStringExtra("downloadId")

        // In order to send events to JS, we need the React context.
        // The CustomNotificationModule itself should hold a static reference or we can find it.
        // An easier way is to create a companion object inside the module to hold the context.
        CustomNotificationModule.reactContext?.let { reactContext ->
            if (reactContext.hasActiveCatalystInstance()) {
                val eventName = when (action) {
                    "ACTION_PAUSE_DOWNLOAD" -> "onNotificationPause"
                    "ACTION_RESUME_DOWNLOAD" -> "onNotificationResume"
                    "ACTION_CANCEL_DOWNLOAD" -> "onNotificationCancel"
                    else -> null
                }

                if (eventName != null && downloadId != null) {
                    reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(eventName, downloadId)
                }
            }
        }
    }
}
