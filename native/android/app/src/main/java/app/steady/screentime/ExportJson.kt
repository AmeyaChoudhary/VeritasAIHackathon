package app.steady.screentime

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlin.math.roundToLong

/** Everything Stability has for one day, from all three sources. Any part can be missing. */
data class DayExport(
    val date: LocalDate,
    val screen: DaySummary? = null,
    val health: HealthDay? = null,
    val keyboard: KeyboardDay? = null,
)

object DayMerge {
    /**
     * The last [windowDays] complete days, oldest first. Today is left out because it is not
     * over. A day appears if any source has something for it.
     */
    fun merge(
        today: LocalDate,
        screen: List<DaySummary>,
        health: Map<LocalDate, HealthDay>,
        keyboard: List<KeyboardDay>,
        windowDays: Long = 28,
    ): List<DayExport> {
        val from = today.minusDays(windowDays)
        val screenByDate = screen.associateBy { it.date }
        val keyboardByDate = keyboard.associateBy { it.date }
        return (screenByDate.keys + health.keys + keyboardByDate.keys)
            .filter { it >= from && it < today }
            .sorted()
            .map { DayExport(it, screenByDate[it], health[it], keyboardByDate[it]) }
    }

    /** Flags from the start of the window up to now. A flag is a moment, so today's count. */
    fun flagsInWindow(flags: List<Flag>, today: LocalDate, zone: ZoneId, windowDays: Long = 28): List<Flag> {
        val from = today.minusDays(windowDays).atStartOfDay(zone).toInstant()
        return flags.filter { !it.time.isBefore(from) }.sortedBy { it.time }
    }
}

/**
 * The file the Stability web app imports, version 2. The schema is written out in
 * native/README.md. Text, app names and rule ids never appear in it.
 */
object ExportJson {
    const val SOURCE = "android_usage_stats"
    const val VERSION = 2

    fun build(days: List<DayExport>, flags: List<Flag>, generated: Instant): String {
        val dayList = JSONArray()
        for (day in days) {
            val o = JSONObject()
            o.put("date", day.date.toString())
            val screen = day.screen
            o.put("screen_minutes", screen?.screenMinutes.orNull())
            o.put("night_minutes", screen?.nightMinutes.orNull())
            o.put("first_use", screen?.firstUse?.let { ClockText.format(it) }.orNull())
            o.put("last_use", screen?.lastUse?.let { ClockText.format(it) }.orNull())
            // Minutes only. Which apps were games is never written.
            o.put("game_minutes", screen?.gameMinutes.orNull())
            o.put("night_game_minutes", screen?.nightGameMinutes.orNull())
            val health = day.health
            o.put("sleep_minutes", health?.sleepMinutes.orNull())
            o.put("bedtime", health?.bedtime?.let { ClockText.format(it) }.orNull())
            o.put("steps", health?.steps.orNull())
            val kb = day.keyboard
            // 0 means the keyboard was open that day but no counted message ended. Null means not used.
            o.put("kb_messages", kb?.messages.orNull())
            o.put("kb_chars_per_min", kb?.charsPerMinute?.let { round(it, 1) }.orNull())
            o.put("kb_pause_share", kb?.pauseShare?.let { round(it, 3) }.orNull())
            // A share from 0 to 1: deletes / (characters typed + deletes).
            o.put("kb_correction_rate", kb?.correctionShare?.let { round(it, 3) }.orNull())
            o.put("kb_low_mood_share", kb?.lowMoodShare?.let { round(it, 3) }.orNull())
            dayList.put(o)
        }
        val flagList = JSONArray()
        for (flag in flags) {
            val o = JSONObject()
            o.put("id", flag.id)
            o.put("time", flag.time.truncatedTo(ChronoUnit.SECONDS).toString())
            o.put("level", flag.level.wire)
            // "yes" or "no" to "Are you safe right now?", or null when not answered or not asked.
            o.put("answer", flag.answer?.wire.orNull())
            flagList.put(o)
        }
        val root = JSONObject()
        root.put("source", SOURCE)
        root.put("version", VERSION)
        root.put("generated", generated.truncatedTo(ChronoUnit.SECONDS).toString())
        root.put("days", dayList)
        root.put("flags", flagList)
        return root.toString(2)
    }

    fun round(value: Double, digits: Int): Double {
        var scale = 1.0
        repeat(digits) { scale *= 10 }
        return (value * scale).roundToLong() / scale
    }

    // put(name, null) would drop the key, so write JSONObject.NULL to get a real null.
    private fun Any?.orNull(): Any = this ?: JSONObject.NULL
}

/**
 * The app's own copy of past screen days, in days.json, because Android keeps raw events for a
 * few days only. Same shape as the version 1 export plus the two game fields, so older copies
 * still load. A day saved before games were counted loads with null game minutes.
 */
object ScreenCache {
    fun build(days: List<DaySummary>, generated: Instant): String {
        val list = JSONArray()
        for (day in days) {
            val item = JSONObject()
            item.put("date", day.date.toString())
            item.put("screen_minutes", day.screenMinutes)
            item.put("night_minutes", day.nightMinutes)
            item.put("first_use", day.firstUse?.let { ClockText.format(it) } ?: JSONObject.NULL)
            item.put("last_use", day.lastUse?.let { ClockText.format(it) } ?: JSONObject.NULL)
            item.put("game_minutes", day.gameMinutes ?: JSONObject.NULL)
            item.put("night_game_minutes", day.nightGameMinutes ?: JSONObject.NULL)
            list.put(item)
        }
        val root = JSONObject()
        root.put("source", ExportJson.SOURCE)
        root.put("version", 1)
        root.put("generated", generated.truncatedTo(ChronoUnit.SECONDS).toString())
        root.put("days", list)
        return root.toString()
    }

    fun parse(text: String): List<DaySummary> {
        val list = JSONObject(text).getJSONArray("days")
        return (0 until list.length()).map { i ->
            val item = list.getJSONObject(i)
            DaySummary(
                date = LocalDate.parse(item.getString("date")),
                screenMinutes = item.getInt("screen_minutes"),
                nightMinutes = item.getInt("night_minutes"),
                firstUse = clock(item, "first_use"),
                lastUse = clock(item, "last_use"),
                gameMinutes = optionalInt(item, "game_minutes"),
                nightGameMinutes = optionalInt(item, "night_game_minutes"),
            )
        }
    }

    private fun optionalInt(item: JSONObject, key: String): Int? =
        if (!item.has(key) || item.isNull(key)) null else item.getInt(key)

    private fun clock(item: JSONObject, key: String): LocalTime? =
        if (item.isNull(key)) null else ClockText.parse(item.getString(key))
}
