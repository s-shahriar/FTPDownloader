package com.ftpdownloader.app.modules

import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Native module for managing SAF (Storage Access Framework) persistent URI permissions
 * Exposes Android-only APIs that expo-file-system doesn't provide
 */
class SAFPermissionsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SAFPermissionsModule"
    }

    /**
     * Persist URI permission grant so it survives app restarts
     * This is the KEY method that 1DM uses for one-time folder selection
     */
    @ReactMethod
    fun takePersistableUriPermission(uriString: String, promise: Promise) {
        try {
            val uri = Uri.parse(uriString)
            val takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION

            reactApplicationContext.contentResolver.takePersistableUriPermission(uri, takeFlags)

            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_ERROR", "Failed to persist URI permission: ${e.message}", e)
        } catch (e: Exception) {
            promise.reject("UNKNOWN_ERROR", "Failed to persist URI permission: ${e.message}", e)
        }
    }

    /**
     * Check if we still have persistent permission for a given URI
     * Returns true if permission exists and is valid
     */
    @ReactMethod
    fun checkUriPermission(uriString: String, promise: Promise) {
        try {
            val uri = Uri.parse(uriString)
            val persistedUris = reactApplicationContext.contentResolver.persistedUriPermissions

            val hasPermission = persistedUris.any { uriPermission ->
                uriPermission.uri == uri &&
                        uriPermission.isReadPermission &&
                        uriPermission.isWritePermission
            }

            promise.resolve(hasPermission)
        } catch (e: Exception) {
            promise.reject("CHECK_ERROR", "Failed to check URI permission: ${e.message}", e)
        }
    }

    /**
     * Release persistent permission for a specific URI
     * Use when user changes download folder
     */
    @ReactMethod
    fun releasePersistableUriPermission(uriString: String, promise: Promise) {
        try {
            val uri = Uri.parse(uriString)
            val releaseFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION

            reactApplicationContext.contentResolver.releasePersistableUriPermission(uri, releaseFlags)

            promise.resolve(true)
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_ERROR", "Failed to release URI permission: ${e.message}", e)
        } catch (e: Exception) {
            promise.reject("UNKNOWN_ERROR", "Failed to release URI permission: ${e.message}", e)
        }
    }

    /**
     * Get all currently persisted URI permissions
     * Returns array of objects with uri, isRead, isWrite properties
     */
    @ReactMethod
    fun getPersistedUriPermissions(promise: Promise) {
        try {
            val persistedUris = reactApplicationContext.contentResolver.persistedUriPermissions
            val result: WritableArray = Arguments.createArray()

            for (uriPermission in persistedUris) {
                val permissionMap: WritableMap = Arguments.createMap()
                permissionMap.putString("uri", uriPermission.uri.toString())
                permissionMap.putBoolean("isReadPermission", uriPermission.isReadPermission)
                permissionMap.putBoolean("isWritePermission", uriPermission.isWritePermission)
                permissionMap.putDouble("persistedTime", uriPermission.persistedTime.toDouble())

                result.pushMap(permissionMap)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("LIST_ERROR", "Failed to get persisted URI permissions: ${e.message}", e)
        }
    }

    /**
     * Check if the device supports SAF (Android 5.0+)
     * Returns true for API 21+
     */
    @ReactMethod
    fun isSAFSupported(promise: Promise) {
        try {
            val isSupported = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP
            promise.resolve(isSupported)
        } catch (e: Exception) {
            promise.reject("VERSION_ERROR", "Failed to check SAF support: ${e.message}", e)
        }
    }

    /**
     * Get detailed information about permission limits
     * Useful for debugging and showing warnings to users
     */
    @ReactMethod
    fun getPermissionLimits(promise: Promise) {
        try {
            val persistedUris = reactApplicationContext.contentResolver.persistedUriPermissions
            val currentCount = persistedUris.size

            // Android 10 and below: 128 limit
            // Android 11+: 512 limit
            val maxPermissions = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                512
            } else {
                128
            }

            val result: WritableMap = Arguments.createMap()
            result.putInt("currentCount", currentCount)
            result.putInt("maxPermissions", maxPermissions)
            result.putInt("remaining", maxPermissions - currentCount)
            result.putBoolean("nearLimit", currentCount > maxPermissions * 0.8) // 80% threshold

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("LIMIT_ERROR", "Failed to get permission limits: ${e.message}", e)
        }
    }

    /**
     * Copy file from cache to SAF directory using efficient streaming
     * This avoids loading entire file into memory (prevents OOM for large files)
     */
    @ReactMethod
    fun copyFileToSAF(
        sourceUri: String,
        targetDirectoryUri: String,
        filename: String,
        mimeType: String,
        promise: Promise
    ) {
        try {
            val contentResolver = reactApplicationContext.contentResolver

            // Parse URIs
            val source = Uri.parse(sourceUri)
            val treeUri = Uri.parse(targetDirectoryUri)

            // Convert tree URI to document URI
            // Tree URI: content://.../tree/primary%3ADownload%2FFTPDownloader
            // Document URI: content://.../document/primary:Download/FTPDownloader
            val documentUri = DocumentsContract.buildDocumentUriUsingTree(
                treeUri,
                DocumentsContract.getTreeDocumentId(treeUri)
            )

            // Create new file in SAF directory using document URI
            val targetFileUri = DocumentsContract.createDocument(
                contentResolver,
                documentUri,
                mimeType,
                filename
            )

            if (targetFileUri == null) {
                promise.reject("CREATE_ERROR", "Failed to create target file in SAF directory")
                return
            }

            // Copy file using streams (efficient for large files)
            contentResolver.openInputStream(source)?.use { inputStream ->
                contentResolver.openOutputStream(targetFileUri)?.use { outputStream ->
                    val buffer = ByteArray(8192) // 8KB buffer
                    var bytesRead: Int
                    var totalBytes = 0L

                    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                        outputStream.write(buffer, 0, bytesRead)
                        totalBytes += bytesRead
                    }

                    outputStream.flush()

                    // Return result with URI and size
                    val result: WritableMap = Arguments.createMap()
                    result.putString("uri", targetFileUri.toString())
                    result.putDouble("size", totalBytes.toDouble())

                    promise.resolve(result)
                }
            } ?: run {
                promise.reject("STREAM_ERROR", "Failed to open input/output streams")
            }

        } catch (e: SecurityException) {
            promise.reject("PERMISSION_ERROR", "No permission to access files: ${e.message}", e)
        } catch (e: Exception) {
            promise.reject("COPY_ERROR", "Failed to copy file: ${e.message}", e)
        }
    }

    /**
     * Delete file from SAF directory
     * Used when user deletes download from app
     */
    @ReactMethod
    fun deleteFileFromSAF(fileUri: String, promise: Promise) {
        try {
            val uri = Uri.parse(fileUri)
            val deleted = DocumentsContract.deleteDocument(
                reactApplicationContext.contentResolver,
                uri
            )

            promise.resolve(deleted)
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_ERROR", "No permission to delete file: ${e.message}", e)
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", "Failed to delete file: ${e.message}", e)
        }
    }
}
