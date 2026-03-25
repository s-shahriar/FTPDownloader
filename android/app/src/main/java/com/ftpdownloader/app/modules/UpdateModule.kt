package com.ftpdownloader.app.modules

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import java.io.File

class UpdateModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "UpdateModule"
    }

    @ReactMethod
    fun installApk(fileUri: String, promise: Promise) {
        try {
            // fileUri is like file:///data/user/0/com.ftpdownloader.app/cache/update.apk
            val cleanUri = if (fileUri.startsWith("file://")) fileUri.substring(7) else fileUri
            val file = File(cleanUri)

            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "APK file not found at $cleanUri")
                return
            }

            val context = reactApplicationContext
            val packageUri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.provider",
                    file
                )
            } else {
                Uri.fromFile(file)
            }

            val intent = Intent(Intent.ACTION_VIEW)
            intent.setDataAndType(packageUri, "application/vnd.android.package-archive")
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            
            context.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INSTALL_ERROR", e.message)
        }
    }
}
