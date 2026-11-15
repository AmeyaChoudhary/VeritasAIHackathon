package app.steady.screentime

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

// Item B: the version 2 contract the web importer reads. Writes an export and checks it, then
// checks the sample file in native/sample against the same rules.
class ExportContractTest {
    private val dayKeys = setOf(
        "date", "screen_minutes", "night_minutes", "first_use", "last_use", "game_minutes", "night_game_minutes",
        "sleep_minutes", "bedtime", "steps", "kb_messages", "kb_chars_per_min", "kb_pause_share", "kb_correction_rate",
        "kb_low_mood_share",
    )
    private val kbShares = listOf("kb_pause_share", "kb_correction_rate", "kb_low_mood_share")

    private fun checkContract(root: JSONObject) {
        assertEquals(setOf("source", "version", "generated", "days", "flags"), root.keySet())
        assertEquals("android_usage_stats", root.getString("source"))
        assertEquals(2, root.getInt("version"))
        val days = root.getJSONArray("days")
        for (i in 0 until days.length()) {
            val d = days.getJSONObject(i)
            assertEquals(dayKeys, d.keySet())
            for (key in kbShares) {
                if (!d.isNull(key)) {
                    val v = d.getDouble(key)
                    assertTrue("$key is $v on ${d.getString("date")}", v in 0.0..1.0)
                }
            }
            // Game minutes are part of screen time: never without it, never more than it.
            if (!d.isNull("game_minutes")) {
                val date = d.getString("date")
                assertTrue("game_minutes without screen_minutes on $date", !d.isNull("screen_minutes"))
                assertTrue("game_minutes over screen_minutes on $date", d.getInt("game_minutes") <= d.getInt("screen_minutes"))
                val night = d.getInt("night_game_minutes")
                assertTrue("night_game_minutes over game_minutes on $date", night <= d.getInt("game_minutes"))
                assertTrue("night_game_minutes over night_minutes on $date", night <= d.getInt("night_minutes"))
            } else {
                assertTrue(d.isNull("night_game_minutes"))
            }
            // 0 messages means the keyboard was open but quiet: no rhythm or tone that day.
            if (!d.isNull("kb_messages") && d.getInt("kb_messages") == 0) {
                for (key in kbShares + "kb_chars_per_min") assertTrue("$key with 0 messages", d.isNull(key))
            }
        }
        val flags = root.getJSONArray("flags")
        for (i in 0 until flags.length()) {
            val f = flags.getJSONObject(i)
            assertEquals(setOf("id", "time", "level", "answer"), f.keySet())
            assertTrue(f.getString("id").matches(Regex("[0-9a-f]{16}")))
            assertTrue(f.getString("level") in setOf("concern", "plan"))
            assertTrue(f.isNull("answer") || f.getString("answer") in setOf("yes", "no"))
        }
    }

    @Test
    fun anExportFollowsTheContract() {
        val quiet = LocalDate.parse("2026-11-11")
        val busy = LocalDate.parse("2026-11-12")
        val stats = MessageStats(chars = 50, corrections = 5, gaps = 54, pauses = 4, speedChars = 45, speedMs = 15_000)
        val log = KeyboardLog()
            .withActiveDay(quiet)
            .withMessage(busy, stats, lowMood = true)
            .withFlag(Flag("0123456789abcdef", Instant.parse("2026-11-12T01:00:00Z"), SelfHarmLevel.CONCERN))
            .withFlag(Flag("fedcba9876543210", Instant.parse("2026-11-12T02:00:00Z"), SelfHarmLevel.CONCERN))
            .withFlag(Flag("00112233445566aa", Instant.parse("2026-11-12T03:00:00Z"), SelfHarmLevel.PLAN))
            .withAnswer("0123456789abcdef", SafeAnswer.YES)
            .withAnswer("fedcba9876543210", SafeAnswer.NO)
        val days = DayMerge.merge(LocalDate.parse("2026-11-14"), emptyList(), emptyMap(), log.days)
        val root = JSONObject(ExportJson.build(days, log.flags, Instant.parse("2026-11-14T08:00:00Z")))
        checkContract(root)

        val list = root.getJSONArray("days")
        val quietDay = list.getJSONObject(0)
        assertEquals(0, quietDay.getInt("kb_messages"))
        val busyDay = list.getJSONObject(1)
        assertEquals(1, busyDay.getInt("kb_messages"))
        assertEquals(0.091, busyDay.getDouble("kb_correction_rate"), 0.0)   // 5 / (50 + 5)

        val answers = (0 until 3).map { root.getJSONArray("flags").getJSONObject(it) }
            .map { if (it.isNull("answer")) null else it.getString("answer") }
        assertEquals(listOf("yes", "no", null), answers)
    }

    @Test
    fun theVersion2SampleFollowsTheContract() {
        val root = JSONObject(TestFiles.repoRoot.resolve("native/sample/steady_android_v2_sample.json").readText())
        checkContract(root)
        val days = root.getJSONArray("days")
        val messages = (0 until days.length()).map { days.getJSONObject(it) }
            .map { if (it.isNull("kb_messages")) null else it.getInt("kb_messages") }
        assertTrue("the sample shows a quiet day", 0 in messages)
        assertTrue("the sample shows a day without the keyboard", null in messages)
        val games = (0 until days.length()).map { days.getJSONObject(it) }
            .map { if (it.isNull("game_minutes")) null else it.getInt("game_minutes") }
        assertTrue("the sample shows game minutes", games.any { it != null && it > 0 })
        assertTrue("the sample shows days saved before games were counted", null in games)
    }
}
