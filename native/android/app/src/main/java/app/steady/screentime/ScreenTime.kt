package app.steady.screentime

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

// The counting rules live here. This file has no Android imports, so it can be unit tested on
// a laptop (see ScreenTimeMathTest).

/**
 * Event type numbers from UsageEvents.Event, copied so this file needs no Android classes.
 * Values and API levels checked on
 * https://developer.android.com/reference/android/app/usage/UsageEvents.Event
 */
object EventType {
    /** ACTIVITY_RESUMED (API 29). Same number as MOVE_TO_FOREGROUND on older versions. */
    const val ACTIVITY_RESUMED = 1

    /** ACTIVITY_PAUSED (API 29). Same number as MOVE_TO_BACKGROUND on older versions. */
    const val ACTIVITY_PAUSED = 2

    /** SCREEN_INTERACTIVE (API 28): the screen turned on for full use. Ambient display does not count. */
    const val SCREEN_INTERACTIVE = 15

    /** SCREEN_NON_INTERACTIVE (API 28): the screen turned off, or dropped to ambient display. */
    const val SCREEN_NON_INTERACTIVE = 16

    /** ACTIVITY_STOPPED (API 29). */
    const val ACTIVITY_STOPPED = 23

    /** DEVICE_SHUTDOWN (API 29). Its time is the last save before shutdown, so it is a lower bound. */
    const val DEVICE_SHUTDOWN = 26

    /** DEVICE_STARTUP (API 29). Anything left open before it has no known end and is dropped. */
    const val DEVICE_STARTUP = 27
}

/** One stretch of phone use, in epoch milliseconds. */
data class Session(val start: Long, val end: Long) {
    val length: Long get() = end - start
}

/** One calendar day in the phone's time zone. This is exactly what goes into the export. */
data class DaySummary(
    val date: LocalDate,
    /** Minutes the screen was on that day. */
    val screenMinutes: Int,
    /** Minutes the screen was on between 00:00 and 05:00 of that date, the night that ends that morning. */
    val nightMinutes: Int,
    /** First time the screen came on that day, to the minute. Null on a day with no real use. */
    val firstUse: LocalTime?,
    /** Last time the screen went off that day, to the minute. 23:59 if use ran past midnight. */
    val lastUse: LocalTime?,
    /**
     * Minutes in apps whose own manifest says they are a game, cut to screen-on time. Null when
     * the day was saved before the app counted games.
     */
    val gameMinutes: Int? = null,
    /** The same, from 00:00 to 05:00 of that date. */
    val nightGameMinutes: Int? = null,
)

/**
 * Turns the event stream into sessions of use.
 *
 * From Android 9 (API 28) the phone logs SCREEN_INTERACTIVE and SCREEN_NON_INTERACTIVE, and a
 * session is the time between them. Android 8 has no screen events, so there a session is the
 * time some app is on screen, from ACTIVITY_RESUMED to the matching ACTIVITY_PAUSED. App names
 * are compared in memory to match those pairs and are never stored.
 */
class SessionBuilder {
    var earliestEvent: Long? = null
        private set

    var sawScreenEvents = false
        private set

    private val screenSessions = mutableListOf<Session>()
    private var screenOnSince: Long? = null

    private val appSessions = mutableListOf<Session>()
    private var currentApp: String? = null
    private var appSince: Long? = null

    /** [appKey] is only called for app events, so other events never build a string. */
    fun onEvent(type: Int, time: Long, appKey: () -> String) {
        val earliest = earliestEvent
        if (earliest == null || time < earliest) earliestEvent = time

        when (type) {
            EventType.SCREEN_INTERACTIVE -> {
                sawScreenEvents = true
                if (screenOnSince == null) screenOnSince = time
            }
            EventType.SCREEN_NON_INTERACTIVE -> {
                sawScreenEvents = true
                closeScreen(time)
            }
            EventType.ACTIVITY_RESUMED -> {
                // Switching apps keeps the session going.
                if (appSince == null) appSince = time
                currentApp = appKey()
            }
            EventType.ACTIVITY_PAUSED, EventType.ACTIVITY_STOPPED -> {
                // A pause from an app that is no longer in front is ignored.
                if (currentApp != null && appKey() == currentApp) closeApp(time)
            }
            EventType.DEVICE_SHUTDOWN -> {
                closeScreen(time)
                closeApp(time)
            }
            EventType.DEVICE_STARTUP -> {
                // The docs say open events from before a restart have no known end. Drop them.
                screenOnSince = null
                currentApp = null
                appSince = null
            }
        }
    }

    /** Closes anything still open at [now] and returns the sessions from the better source. */
    fun finish(now: Long): List<Session> {
        closeScreen(now)
        closeApp(now)
        return if (sawScreenEvents) screenSessions.toList() else appSessions.toList()
    }

    private fun closeScreen(time: Long) {
        val since = screenOnSince
        if (since != null && time > since) screenSessions += Session(since, time)
        screenOnSince = null
    }

    private fun closeApp(time: Long) {
        val since = appSince
        if (since != null && time > since) appSessions += Session(since, time)
        appSince = null
        currentApp = null
    }
}

object ScreenTimeMath {
    private val NIGHT_END: LocalTime = LocalTime.of(5, 0)

    /**
     * A screen that lights up for less than a minute, for a notification or to check the time,
     * still counts toward the minutes. It does not move first or last use.
     */
    private const val MIN_USE_MS = 60_000L

    fun summarize(sessions: List<Session>, days: List<LocalDate>, zone: ZoneId): List<DaySummary> =
        days.map { date ->
            val dayStart = date.atStartOfDay(zone).toInstant().toEpochMilli()
            val dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
            val nightEnd = date.atTime(NIGHT_END).atZone(zone).toInstant().toEpochMilli()

            var screenMs = 0L
            var nightMs = 0L
            var first: Long? = null
            var last: Long? = null

            for (session in sessions) {
                val start = maxOf(session.start, dayStart)
                val end = minOf(session.end, dayEnd)
                if (end <= start) continue

                screenMs += end - start
                nightMs += maxOf(0L, minOf(end, nightEnd) - start)

                if (session.length >= MIN_USE_MS) {
                    if (first == null || start < first) first = start
                    if (last == null || end > last) last = end
                }
            }

            DaySummary(
                date = date,
                screenMinutes = toMinutes(screenMs),
                nightMinutes = toMinutes(nightMs),
                firstUse = first?.let { clockTime(it, zone) },
                // A session cut at midnight ends at the next day's 00:00. Report it as 23:59.
                lastUse = last?.let { clockTime(minOf(it, dayEnd - 1), zone) },
            )
        }

    /**
     * Minutes of [sessions] inside [date], and inside 00:00 to 05:00 of it. The same day and
     * night rule as [summarize], for counts that need no first or last use, such as games.
     */
    fun dayAndNightMinutes(sessions: List<Session>, date: LocalDate, zone: ZoneId): Pair<Int, Int> {
        val dayStart = date.atStartOfDay(zone).toInstant().toEpochMilli()
        val dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val nightEnd = date.atTime(NIGHT_END).atZone(zone).toInstant().toEpochMilli()
        var totalMs = 0L
        var nightMs = 0L
        for (session in sessions) {
            val start = maxOf(session.start, dayStart)
            val end = minOf(session.end, dayEnd)
            if (end <= start) continue
            totalMs += end - start
            nightMs += maxOf(0L, minOf(end, nightEnd) - start)
        }
        return toMinutes(totalMs) to toMinutes(nightMs)
    }

    private fun toMinutes(ms: Long): Int = ((ms + 30_000L) / 60_000L).toInt()

    private fun clockTime(ms: Long, zone: ZoneId): LocalTime =
        Instant.ofEpochMilli(ms).atZone(zone).toLocalTime().truncatedTo(ChronoUnit.MINUTES)
}

/** "HH:mm" with plain digits, whatever the phone's language. */
object ClockText {
    private val FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT)

    fun format(time: LocalTime): String = time.format(FORMAT)

    fun parse(text: String): LocalTime = LocalTime.parse(text, FORMAT)
}
