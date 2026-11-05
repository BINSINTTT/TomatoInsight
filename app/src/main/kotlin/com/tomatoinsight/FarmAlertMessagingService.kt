package com.tomatoinsight

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

const val FARM_ALERT_CHANNEL_ID = "farm_alerts"

class FarmAlertMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: "Information!"
        val body = message.notification?.body ?: message.data["body"] ?: return
        showFarmAlert(this, title, body)
    }

    override fun onNewToken(token: String) {
        Log.d("TomatoInsight", "FCM token: $token")
    }
}

fun ensureFarmAlertChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
        FARM_ALERT_CHANNEL_ID,
        "Farm alerts",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "Scan and care messages from Tomato Insight"
    }
    manager.createNotificationChannel(channel)
}

/** Soft pink “Information!” card. Tap opens TomatoInsight. */
fun showFarmAlert(
    context: Context,
    title: String,
    body: String,
    summary: String = "",
    dueDateLabel: String = ""
): Boolean {
    ensureFarmAlertChannel(context)
    val openApp = PendingIntent.getActivity(
        context,
        0,
        Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_NEW_TASK
            putExtra("open_from_notification", true)
            if (dueDateLabel.isNotBlank()) {
                putExtra("notification_due_label", dueDateLabel)
            }
        },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val cardTitle = title.ifBlank { "Information!" }.let { raw ->
        if (raw.contains("scan", ignoreCase = true) || raw.contains("👋")) {
            "Information!"
        } else {
            raw
        }
    }
    val cardBody = body.trim().ifBlank { return false }
    val cardSummary = summary.trim().ifBlank {
        cardBody.lineSequence().firstOrNull { it.isNotBlank() }.orEmpty().ifBlank { cardBody }
    }
    val multiLine = cardBody.contains('\n')

    fun bind(views: RemoteViews, text: String, maxLines: Int) {
        views.setTextViewText(R.id.notification_title, cardTitle)
        views.setTextViewText(R.id.notification_body, text)
        views.setInt(R.id.notification_body, "setMaxLines", maxLines)
    }

    val collapsed = RemoteViews(context.packageName, R.layout.notification_scan_reminder).also {
        bind(it, cardSummary, if (multiLine) 3 else 4)
    }
    val expanded = RemoteViews(context.packageName, R.layout.notification_scan_reminder).also {
        bind(it, cardBody, 16)
    }

    val notification = NotificationCompat.Builder(context, FARM_ALERT_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_notification)
        .setColor(context.getColor(R.color.notification_icon_square))
        .setContentTitle(cardTitle)
        .setContentText(cardSummary)
        .setStyle(
            NotificationCompat.BigTextStyle()
                .setBigContentTitle(cardTitle)
                .bigText(cardBody)
        )
        .setCustomContentView(collapsed)
        .setCustomBigContentView(expanded)
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        .setContentIntent(openApp)
        .setOnlyAlertOnce(true)
        .build()

    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
        != PackageManager.PERMISSION_GRANTED
    ) {
        return false
    }
    return runCatching {
        manager.notify((cardTitle + cardBody).hashCode(), notification)
        true
    }.getOrDefault(false)
}
