package com.lecturerecorder.app

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.documentfile.provider.DocumentFile
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.io.File
import java.io.FileInputStream

class BatchShareModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "BatchShare"

    @ReactMethod
    fun shareMultiple(fileUris: ReadableArray, mimeType: String, dialogTitle: String, promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "Current activity is null")
            return
        }

        try {
            val uriList = ArrayList<Uri>()
            val authority = "${reactContext.packageName}.FileSystemFileProvider"

            for (i in 0 until fileUris.size()) {
                val rawUri = fileUris.getString(i) ?: continue
                val cleanPath = Uri.parse(rawUri).path ?: rawUri.removePrefix("file://")
                val file = File(cleanPath)
                if (file.exists()) {
                    val contentUri = FileProvider.getUriForFile(activity, authority, file)
                    uriList.add(contentUri)
                }
            }

            if (uriList.isEmpty()) {
                promise.reject("E_NO_FILES", "No valid files found to share")
                return
            }

            val intent = if (uriList.size == 1) {
                Intent(Intent.ACTION_SEND).apply {
                    type = mimeType
                    putExtra(Intent.EXTRA_STREAM, uriList[0])
                }
            } else {
                Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                    type = mimeType
                    putParcelableArrayListExtra(Intent.EXTRA_STREAM, uriList)
                }
            }

            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            val chooser = Intent.createChooser(intent, dialogTitle).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(chooser)
            promise.resolve(uriList.size)
        } catch (e: Exception) {
            promise.reject("E_SHARE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun exportToDirectory(fileUris: ReadableArray, targetDirectorySafUri: String, promise: Promise) {
        Thread {
            try {
                val dirUri = Uri.parse(targetDirectorySafUri)
                val targetDir = DocumentFile.fromTreeUri(reactContext, dirUri)
                if (targetDir == null || !targetDir.canWrite()) {
                    promise.reject("E_CANNOT_WRITE", "Selected folder is not writable")
                    return@Thread
                }

                var exportedCount = 0
                val resolver = reactContext.contentResolver

                for (i in 0 until fileUris.size()) {
                    val rawUri = fileUris.getString(i) ?: continue
                    val cleanPath = Uri.parse(rawUri).path ?: rawUri.removePrefix("file://")
                    val file = File(cleanPath)
                    if (!file.exists()) continue

                    val mime = if (file.name.endsWith(".wav", ignoreCase = true)) "audio/wav" else "audio/mpeg"
                    val newDoc = targetDir.createFile(mime, file.name) ?: continue

                    resolver.openOutputStream(newDoc.uri)?.use { outStream ->
                        FileInputStream(file).use { inStream ->
                            inStream.copyTo(outStream)
                        }
                    }
                    exportedCount++
                }

                promise.resolve(exportedCount)
            } catch (e: Exception) {
                promise.reject("E_EXPORT_FAILED", e.message, e)
            }
        }.start()
    }
}
