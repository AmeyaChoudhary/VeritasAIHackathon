package app.steady.screentime

import android.Manifest
import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Process
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

object UsageAccess {
    /**
     * True once the teen has turned on usage access for this app in Settings.
     *
     * checkOpNoThrow(String, int, String) is the call the current docs point to:
     * unsafeCheckOpNoThrow is deprecated in API 36 in favor of it. SDKs 29 to 35 mark this
     * one deprecated instead, hence the suppression.
     * https://developer.android.com/reference/android/app/AppOpsManager
     */
    fun isGranted(context: Context): Boolean {
        val appOps = context.getSystemService(AppOpsManager::class.java) ?: return false
        @Suppress("DEPRECATION")
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName,
        )
        // MODE_DEFAULT means "fall back to the normal permission check".
        return if (mode == AppOpsManager.MODE_DEFAULT) {
            context.checkCallingOrSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            mode == AppOpsManager.MODE_ALLOWED
        }
    }
}

data class Reading(
    /** Up to 28 complete days, oldest first. Today is left out because it is not over. */
    val days: List<DaySummary>,
    /** False when the phone had no screen events and app time was used instead (Android 8). */
    val countedFromScreen: Boolean,
    /** True when Android returned nothing, which it does while the phone is still locked. */
    val locked: Boolean,
)

class ScreenTimeRepository(private val context: Context) {
    private val zone: ZoneId = ZoneId.systemDefault()
    private val cacheFile = File(context.filesDir, "days.json")

    /** Slow on a busy phone. Call it off the main thread. */
    fun read(): Reading {
        val today = LocalDate.now(zone)
        val fresh = readFromSystem(today)

        val byDate = loadCache().associateBy { it.date }.toMutableMap()
        fresh?.days?.forEach { byDate[it.date] = it }
        val kept = byDate.values
            .filter { it.date < today && it.date >= today.minusDays(KEEP_DAYS) }
            .sortedBy { it.date }
        saveCache(kept)

        return Reading(
            days = kept.filter { it.date >= today.minusDays(REPORT_DAYS) },
            countedFromScreen = fresh?.countedFromScreen ?: true,
            locked = fresh == null,
        )
    }

    private class SystemDays(val days: List<DaySummary>, val countedFromScreen: Boolean)

    private fun readFromSystem(today: LocalDate): SystemDays? {
        val manager = context.getSystemService(UsageStatsManager::class.java) ?: return null

        // One extra day at the start, so a session already running at the window edge does
        // not cut into a day we report.
        val begin = today.minusDays(REPORT_DAYS + 1).atStartOfDay(zone).toInstant().toEpochMilli()
        val now = System.currentTimeMillis()

        // "Events are only kept by the system for a few days." From Android 11 this returns
        // null while the phone is locked.
        // https://developer.android.com/reference/android/app/usage/UsageStatsManager#queryEvents(long,%20long)
        val events = manager.queryEvents(begin, now) ?: return null

        val builder = SessionBuilder()
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            builder.onEvent(event.eventType, event.timeStamp) { event.packageName + "/" + event.className }
        }
        val sessions = builder.finish(now)

        val earliest = builder.earliestEvent ?: return SystemDays(emptyList(), true)
        // The oldest day Android still has is usually cut off part way, so it is skipped.
        val firstFullDay = Instant.ofEpochMilli(earliest).atZone(zone).toLocalDate().plusDays(1)
        val dates = generateSequence(maxOf(firstFullDay, today.minusDays(REPORT_DAYS))) { it.plusDays(1) }
            .takeWhile { it < today }
            .toList()
        return SystemDays(ScreenTimeMath.summarize(sessions, dates, zone), builder.sawScreenEvents)
    }

    private fun loadCache(): List<DaySummary> =
        try {
            if (cacheFile.exists()) ScreenCache.parse(cacheFile.readText()) else emptyList()
        } catch (e: Exception) {
            // A damaged cache only costs the days Android no longer has.
            emptyList()
        }

    private fun saveCache(days: List<DaySummary>) {
        runCatching { cacheFile.writeText(ScreenCache.build(days, Instant.now())) }
    }

    private companion object {
        const val REPORT_DAYS = 28L
        const val KEEP_DAYS = 60L
    }
}
