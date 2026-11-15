package app.steady.screentime

import java.time.LocalDate
import java.time.ZoneId

// Minutes in games. Like ScreenTime.kt, this file has no Android imports, so the rules can be
// unit tested on a laptop (see GameTimeTest). UsageReader.kt feeds it the usage events and each
// app's category from PackageManager.

/**
 * Category numbers from ApplicationInfo, copied so this file needs no Android classes. An app
 * sets its own category in its manifest with android:appCategory (API 26).
 * https://developer.android.com/reference/android/content/pm/ApplicationInfo#category
 */
object AppCategory {
    /** ApplicationInfo.CATEGORY_UNDEFINED: the app did not set a category. */
    const val UNDEFINED = -1

    /** ApplicationInfo.CATEGORY_GAME. */
    const val GAME = 0
}

/**
 * One stretch with one app in front, in epoch milliseconds. The package name is used in memory
 * to look up the app's category and is never stored or exported.
 */
data class AppInterval(val packageName: String, val start: Long, val end: Long)

/** Game minutes for one day. Only these two numbers leave this file. */
data class GameDay(
    val date: LocalDate,
    val gameMinutes: Int,
    /** Game minutes from 00:00 to 05:00 of that date, the same night rule as night_minutes. */
    val nightGameMinutes: Int,
)

/**
 * Turns the event stream into per-app stretches in front. An app is in front from the first
 * ACTIVITY_RESUMED of any of its activities until the last of them is paused.
 * The screen turning off, or the phone shutting down, ends every stretch. After DEVICE_STARTUP
 * anything still open is dropped, as in SessionBuilder.
 *
 * ACTIVITY_STOPPED is not used. Android always pauses an activity before it stops it, and when
 * an app opens a new copy of the same activity the order is: old paused, new resumed, old
 * stopped. Closing on that late STOPPED would end the new copy's time.
 */
class AppIntervalBuilder {
    private val intervals = mutableListOf<AppInterval>()
    private val openActivities = mutableMapOf<String, MutableSet<String>>()
    private val since = mutableMapOf<String, Long>()

    /** [packageName] and [className] are only called for activity events. */
    fun onEvent(type: Int, time: Long, packageName: () -> String, className: () -> String) {
        when (type) {
            EventType.ACTIVITY_RESUMED -> {
                val pkg = packageName()
                val open = openActivities.getOrPut(pkg) { mutableSetOf() }
                if (open.isEmpty()) since[pkg] = time
                open += className()
            }
            EventType.ACTIVITY_PAUSED -> {
                val pkg = packageName()
                val open = openActivities[pkg] ?: return
                open -= className()
                if (open.isEmpty()) close(pkg, time)
            }
            EventType.SCREEN_NON_INTERACTIVE, EventType.DEVICE_SHUTDOWN -> closeAll(time)
            EventType.DEVICE_STARTUP -> {
                openActivities.clear()
                since.clear()
            }
        }
    }

    /** Closes anything still open at [now] and returns every stretch. */
    fun finish(now: Long): List<AppInterval> {
        closeAll(now)
        return intervals.toList()
    }

    private fun close(pkg: String, time: Long) {
        val start = since.remove(pkg)
        openActivities.remove(pkg)
        if (start != null && time > start) intervals += AppInterval(pkg, start, time)
    }

    private fun closeAll(time: Long) {
        for (pkg in since.keys.toList()) close(pkg, time)
        openActivities.clear()
    }
}

object GameMath {
    /** True only for apps whose own manifest says they are a game. A missing category is not. */
    fun isGame(category: Int?): Boolean = category == AppCategory.GAME

    /**
     * The category to use for an app. Before android:appCategory (API 26), a game said so with
     * android:isGame, which sets ApplicationInfo.FLAG_IS_GAME and leaves the category undefined.
     * Such an app counts as a game. A category the app set itself wins over the flag.
     */
    fun categoryOf(category: Int, isGameFlag: Boolean): Int =
        if (category == AppCategory.UNDEFINED && isGameFlag) AppCategory.GAME else category

    /**
     * Game minutes for each date in [days].
     *
     * [categories] maps a package to its ApplicationInfo.category. A package missing from it
     * (Android would not say, or the app is gone) is not counted. Two games on screen at once
     * count once. Game time is also cut to [screen], the screen-on sessions, so a day's game
     * minutes are never more than its screen minutes, and the night's never more than
     * night_minutes.
     */
    fun summarize(
        apps: List<AppInterval>,
        categories: Map<String, Int>,
        screen: List<Session>,
        days: List<LocalDate>,
        zone: ZoneId,
    ): List<GameDay> {
        val games = union(apps.filter { isGame(categories[it.packageName]) }.map { Session(it.start, it.end) })
        val inGames = intersect(games, union(screen))
        return days.map { date ->
            val (total, night) = ScreenTimeMath.dayAndNightMinutes(inGames, date, zone)
            GameDay(date, total, night)
        }
    }

    /** Sorted, with overlaps joined. */
    fun union(sessions: List<Session>): List<Session> {
        val out = mutableListOf<Session>()
        for (s in sessions.filter { it.end > it.start }.sortedBy { it.start }) {
            val last = out.lastOrNull()
            if (last != null && s.start <= last.end) {
                out[out.size - 1] = Session(last.start, maxOf(last.end, s.end))
            } else {
                out += s
            }
        }
        return out
    }

    /** The time inside both lists. Both must already be sorted with overlaps joined. */
    fun intersect(a: List<Session>, b: List<Session>): List<Session> {
        val out = mutableListOf<Session>()
        var i = 0
        var j = 0
        while (i < a.size && j < b.size) {
            val start = maxOf(a[i].start, b[j].start)
            val end = minOf(a[i].end, b[j].end)
            if (end > start) out += Session(start, end)
            if (a[i].end < b[j].end) i++ else j++
        }
        return out
    }
}
