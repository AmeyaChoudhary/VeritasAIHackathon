package app.steady.screentime

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset

class DayAggregationTest {
    private val zone: ZoneId = ZoneOffset.UTC
    private fun at(text: String): Instant = LocalDateTime.parse(text).atZone(zone).toInstant()
    private fun day(text: String): LocalDate = LocalDate.parse(text)

    @Test
    fun aNightBelongsToTheMorningItEnds() {
        val nights = SleepMath.byWakeDate(
            listOf(SleepPeriod(at("2026-11-09T23:40:00"), at("2026-11-10T07:10:00"), awakeMs = 20 * 60_000L)),
            zone,
        )
        val night = nights.getValue(day("2026-11-10"))
        assertEquals(450 - 20, night.sleepMinutes)
        assertEquals(LocalTime.of(23, 40), night.bedtime)
        assertFalse(nights.containsKey(day("2026-11-09")))
    }

    @Test
    fun theLongestSessionIsTheMainSleep() {
        val nights = SleepMath.byWakeDate(
            listOf(
                SleepPeriod(at("2026-11-10T00:30:00"), at("2026-11-10T07:30:00"), source = "phone"),   // the night
                SleepPeriod(at("2026-11-10T15:00:00"), at("2026-11-10T15:40:00"), source = "phone"),   // a nap
                SleepPeriod(at("2026-11-10T00:35:00"), at("2026-11-10T07:00:00"), source = "watch"),   // a watch's copy
            ),
            zone,
        )
        assertEquals(420, nights.getValue(day("2026-11-10")).sleepMinutes)
        assertEquals(LocalTime.of(0, 30), nights.getValue(day("2026-11-10")).bedtime)
    }

    @Test
    fun usualBedtimeWorksAcrossMidnight() {
        val times = listOf(LocalTime.of(23, 50), LocalTime.of(0, 20), LocalTime.of(23, 10), LocalTime.of(1, 0), LocalTime.of(0, 5))
        assertEquals(LocalTime.of(0, 5), SleepMath.medianBedtime(times))
        assertNull(SleepMath.medianBedtime(emptyList()))
    }

    @Test
    fun mergeKeepsTheWindowAndDropsToday() {
        val today = day("2026-11-14")
        val screen = listOf(
            DaySummary(day("2026-10-16"), 100, 0, null, null),   // 29 days back: outside
            DaySummary(day("2026-10-17"), 200, 5, LocalTime.of(7, 0), LocalTime.of(23, 0)),
            DaySummary(day("2026-11-14"), 50, 0, null, null),    // today: left out
        )
        val health = mapOf(day("2026-11-12") to HealthDay(day("2026-11-12"), 420, LocalTime.of(23, 30), 8000))
        val keyboard = listOf(KeyboardDay(day("2026-11-13"), messages = 3, chars = 90))
        val merged = DayMerge.merge(today, screen, health, keyboard)
        assertEquals(listOf(day("2026-10-17"), day("2026-11-12"), day("2026-11-13")), merged.map { it.date })
        assertNull(merged[1].screen)
        assertEquals(3, merged[2].keyboard?.messages)
    }

    @Test
    fun exportVersion2HasEveryKeyAndRealNulls() {
        val days = listOf(
            DayExport(
                date = day("2026-11-12"),
                screen = DaySummary(day("2026-11-12"), 245, 31, LocalTime.of(0, 0), LocalTime.of(23, 59), gameMinutes = 64, nightGameMinutes = 22),
                health = HealthDay(day("2026-11-12"), 412, LocalTime.of(0, 40), 6120),
                keyboard = KeyboardDay(
                    day("2026-11-12"), messages = 3, chars = 120, corrections = 7, gaps = 117, pauses = 9,
                    speedChars = 100, speedMs = 31_000, toneScored = 3, lowMood = 1,
                ),
            ),
            DayExport(date = day("2026-11-13"), health = HealthDay(day("2026-11-13"), steps = 9000)),
        )
        val flags = listOf(Flag("0123456789abcdef", Instant.parse("2026-11-12T01:15:09.250Z"), SelfHarmLevel.PLAN))
        val root = JSONObject(ExportJson.build(days, flags, Instant.parse("2026-11-14T08:00:00.900Z")))

        assertEquals("android_usage_stats", root.getString("source"))
        assertEquals(2, root.getInt("version"))
        assertEquals("2026-11-14T08:00:00Z", root.getString("generated"))

        val keys = setOf(
            "date", "screen_minutes", "night_minutes", "first_use", "last_use", "game_minutes", "night_game_minutes",
            "sleep_minutes", "bedtime", "steps", "kb_messages", "kb_chars_per_min", "kb_pause_share", "kb_correction_rate",
            "kb_low_mood_share",
        )
        val list = root.getJSONArray("days")
        val full = list.getJSONObject(0)
        assertEquals(keys, full.keySet())
        assertEquals(245, full.getInt("screen_minutes"))
        assertEquals("00:00", full.getString("first_use"))
        assertEquals(64, full.getInt("game_minutes"))
        assertEquals(22, full.getInt("night_game_minutes"))
        assertEquals(412, full.getInt("sleep_minutes"))
        assertEquals("00:40", full.getString("bedtime"))
        assertEquals(6120, full.getInt("steps"))
        assertEquals(3, full.getInt("kb_messages"))
        assertEquals(193.5, full.getDouble("kb_chars_per_min"), 0.0)     // 100 / 31 s, one decimal
        assertEquals(0.077, full.getDouble("kb_pause_share"), 0.0)       // 9 / 117, three decimals
        assertEquals(0.055, full.getDouble("kb_correction_rate"), 0.0)   // 7 / (120 + 7), three decimals
        assertEquals(0.333, full.getDouble("kb_low_mood_share"), 0.0)

        val sparse = list.getJSONObject(1)
        assertEquals(keys, sparse.keySet())
        for (key in keys - setOf("date", "steps")) assertTrue("$key is null", sparse.isNull(key))
        assertEquals(9000, sparse.getInt("steps"))

        val flag = root.getJSONArray("flags").getJSONObject(0)
        assertEquals(setOf("id", "time", "level", "answer"), flag.keySet())
        assertTrue(flag.isNull("answer"))
        assertEquals("2026-11-12T01:15:09Z", flag.getString("time"))
        assertEquals("plan", flag.getString("level"))
    }

    @Test
    fun flagsOutsideTheWindowAreLeftOut() {
        val today = day("2026-11-14")
        val flags = listOf(
            Flag("old", at("2026-10-16T23:59:00"), SelfHarmLevel.CONCERN),
            Flag("in", at("2026-10-17T00:00:00"), SelfHarmLevel.CONCERN),
            Flag("now", at("2026-11-14T09:00:00"), SelfHarmLevel.PLAN),
        )
        assertEquals(listOf("in", "now"), DayMerge.flagsInWindow(flags, today, zone).map { it.id })
    }

    @Test
    fun weeksCombineAllSources() {
        val days = (9..15).map { d ->
            val date = day("2026-11-%02d".format(d))   // Monday Nov 9 to Sunday Nov 15
            DayExport(
                date = date,
                screen = DaySummary(date, 200 + d, 10, LocalTime.of(7, 0), LocalTime.of(23, 0)),
                health = HealthDay(date, 400, if (d % 2 == 0) LocalTime.of(23, 50) else LocalTime.of(0, 10), 7000),
                keyboard = KeyboardDay(date, messages = 2, speedChars = 10, speedMs = 3_000, toneScored = 2, lowMood = 1),
            )
        }
        val week = Weeks.summarize(days).single()
        assertEquals(day("2026-11-09"), week.monday)
        assertEquals(7, week.days)
        assertEquals(212, week.screenMinutesPerDay)
        assertEquals(400, week.sleepMinutesPerNight)
        assertEquals(LocalTime.of(0, 10), week.usualBedtime)
        assertEquals(7000L, week.stepsPerDay)
        assertEquals(14, week.keyboardMessages)
        assertEquals(200.0, week.charsPerMinute!!, 1e-9)
        assertEquals(0.5, week.lowMoodShare!!, 1e-9)
    }
}
