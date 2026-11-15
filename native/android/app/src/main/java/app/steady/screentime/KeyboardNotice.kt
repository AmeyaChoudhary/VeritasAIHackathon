package app.steady.screentime

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

/**
 * The ongoing notification shown while the Steady keyboard is on. Google Play requires a
 * monitoring app to "present users with a persistent notification at all times when the app
 * is running", and the keyboard runs whenever it is the chosen keyboard.
 * https://support.google.com/googleplay/android-developer/answer/9888380
 *
 * From Android 13 a notification needs the POST_NOTIFICATIONS permission, which the app asks
 * for with a plain explanation. Without it Android drops the notification.
 */
object KeyboardNotice {
    private const val CHANNEL = "keyboard"
    private const val ID = 1

    /** From Android 13 (API 33) the teen has to allow notifications first. */
    fun needsPermission(sdkInt: Int, granted: Boolean): Boolean = sdkInt >= 33 && !granted

    fun canPost(context: Context): Boolean =
        !needsPermission(
            Build.VERSION.SDK_INT,
            Build.VERSION.SDK_INT < 33 ||
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED,
        )

    fun show(context: Context) {
        try {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            val channel = NotificationChannel(
                CHANNEL,
                context.getString(R.string.notice_channel),
                NotificationManager.IMPORTANCE_LOW,
            ).apply { description = context.getString(R.string.notice_channel_description) }
            manager.createNotificationChannel(channel)
            if (!canPost(context)) return
            val open = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE,
            )
            val notice = Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_steady)
                .setContentTitle(context.getString(R.string.notice_title))
                .setContentText(context.getString(R.string.notice_text))
                .setStyle(Notification.BigTextStyle().bigText(context.getString(R.string.notice_text)))
                .setContentIntent(open)
                .setOngoing(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_STATUS)
                .build()
            manager.notify(ID, notice)
        } catch (e: Exception) {
            // A notification problem must never stop the keyboard from typing.
        }
    }

    fun hide(context: Context) {
        try {
            context.getSystemService(NotificationManager::class.java)?.cancel(ID)
        } catch (e: Exception) {
            // Nothing to do.
        }
    }
}
