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

// Game minutes: which apps count, the night rule, and that no package name reaches a file.
class GameTimeTest {
    private val zone: ZoneId = ZoneOffset.UTC
    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(zone).toInstant().toEpochMilli()
    private fun day(text: String): LocalDate = LocalDate.parse(text)

    private val game = "com.example.puzzlegame"
    private val otherGame = "com.example.racegame"
    private val chat = "com.example.chat"
    private val unlabeled = "com.example.unlabeled"

    /** ApplicationInfo.CATEGORY_SOCIAL, for an app that sets a category other than game. */
    private val social = 4

    private val categories = mapOf(game to AppCategory.GAME, otherGame to AppCategory.GAME, chat to social, unlabeled to AppCategory.UNDEFINED)

    private fun allDay(date: String) = listOf(Session(at("${date}T00:00:00"), at("${date}T23:59:59")))

    @Test
    fun onlyTheGameCategoryCounts() {
        assertTrue(GameMath.isGame(AppCategory.GAME))
        assertFalse(GameMath.isGame(AppCategory.UNDEFINED))
        assertFalse(GameMath.isGame(social))
        assertFalse(GameMath.isGame(null))

        val apps = listOf(
            AppInterval(game, at("2026-11-10T16:00:00"), at("2026-11-10T16:30:00")),
            AppInterval(chat, at("2026-11-10T17:00:00"), at("2026-11-10T18:00:00")),
            AppInterval(unlabeled, at("2026-11-10T18:00:00"), at("2026-11-10T19:00:00")),
            // Android would not show this app's category, so it is missing from the map.
            AppInterval("com.example.hidden", at("2026-11-10T19:00:00"), at("2026-11-10T20:00:00")),
        )
        val result = GameMath.summarize(apps, categories, allDay("2026-11-10"), listOf(day("2026-11-10")), zone).single()
        assertEquals(30, result.gameMinutes)
        assertEquals(0, result.nightGameMinutes)
    }

    @Test
    fun gamesAcrossMidnightFollowTheNightRule() {
        val apps = listOf(
            AppInterval(game, at("2026-11-09T23:30:00"), at("2026-11-10T00:45:00")),
            AppInterval(game, at("2026-11-10T04:30:00"), at("2026-11-10T05:30:00")),
        )
        val screen = listOf(Session(at("2026-11-09T20:00:00"), at("2026-11-10T06:00:00")))
        val (nov9, nov10) = GameMath.summarize(apps, categories, screen, listOf(day("2026-11-09"), day("2026-11-10")), zone)
        assertEquals(30, nov9.gameMinutes)
        assertEquals(0, nov9.nightGameMinutes)   // 23:30 to midnight belongs to the evening
        assertEquals(105, nov10.gameMinutes)     // 45 + 60
        assertEquals(75, nov10.nightGameMinutes) // 45 + 30, up to 05:00
    }

    @Test
    fun twoGamesAtOnceCountOnceAndScreenOffIsCut() {
        val apps = listOf(
            AppInterval(game, at("2026-11-10T20:00:00"), at("2026-11-10T21:00:00")),
            AppInterval(otherGame, at("2026-11-10T20:30:00"), at("2026-11-10T21:30:00")),   // split screen
        )
        // The screen was off from 21:10 to 21:20.
        val screen = listOf(
            Session(at("2026-11-10T19:00:00"), at("2026-11-10T21:10:00")),
            Session(at("2026-11-10T21:20:00"), at("2026-11-10T22:00:00")),
        )
        val result = GameMath.summarize(apps, categories, screen, listOf(day("2026-11-10")), zone).single()
        assertEquals(80, result.gameMinutes)   // 20:00 to 21:30 is 90, minus the 10 with the screen off
    }

    @Test
    fun anOlderGameWithOnlyTheIsGameFlagCounts() {
        assertEquals(AppCategory.GAME, GameMath.categoryOf(AppCategory.UNDEFINED, isGameFlag = true))
        assertEquals(AppCategory.UNDEFINED, GameMath.categoryOf(AppCategory.UNDEFINED, isGameFlag = false))
        // A category the app set itself wins over the old flag.
        assertEquals(social, GameMath.categoryOf(social, isGameFlag = true))
        assertEquals(AppCategory.GAME, GameMath.categoryOf(AppCategory.GAME, isGameFlag = false))
    }

    @Test
    fun aLateStopOfTheOldCopyDoesNotEndTheNewCopy() {
        val b = AppIntervalBuilder()
        fun ev(type: Int, time: String, cls: String = "Play") = b.onEvent(type, at(time), { game }, { cls })
        ev(EventType.ACTIVITY_RESUMED, "2026-11-10T20:00:00")
        // The game opens a new copy of the same activity: old paused, new resumed, old stopped.
        ev(EventType.ACTIVITY_PAUSED, "2026-11-10T20:10:00")
        ev(EventType.ACTIVITY_RESUMED, "2026-11-10T20:10:01")
        ev(EventType.ACTIVITY_STOPPED, "2026-11-10T20:10:02")
        ev(EventType.ACTIVITY_PAUSED, "2026-11-10T20:30:00")
        ev(EventType.ACTIVITY_STOPPED, "2026-11-10T20:30:01")
        assertEquals(
            listOf(
                AppInterval(game, at("2026-11-10T20:00:00"), at("2026-11-10T20:10:00")),
                AppInterval(game, at("2026-11-10T20:10:01"), at("2026-11-10T20:30:00")),
            ),
            b.finish(at("2026-11-10T21:00:00")),
        )
    }

    @Test
    fun theBuilderFollowsEachAppAndClosesAtScreenOff() {
        val b = AppIntervalBuilder()
        fun ev(type: Int, time: String, pkg: String = "", cls: String = "") = b.onEvent(type, at(time), { pkg }, { cls })
        ev(EventType.SCREEN_INTERACTIVE, "2026-11-10T20:00:00")
        ev(EventType.ACTIVITY_RESUMED, "2026-11-10T20:00:05", game, "Menu")
        // Moving to another screen of the same game keeps one stretch going.
        ev(EventType.ACTIVITY_RESUMED, "2026-11-10T20:10:00", game, "Play")
        ev(EventType.ACTIVITY_PAUSED, "2026-11-10T20:10:01", game, "Menu")
        // A pause for an activity never seen resumed is ignored.
        ev(EventType.ACTIVITY_PAUSED, "2026-11-10T20:15:00", chat, "Main")
        // The screen goes off with the game still in front.
        ev(EventType.SCREEN_NON_INTERACTIVE, "2026-11-10T20:40:05")
        ev(EventType.ACTIVITY_PAUSED, "2026-11-10T20:40:06", game, "Play")
        // After a restart, anything left open has no known end.
        ev(EventType.ACTIVITY_RESUMED, "2026-11-10T21:00:00", otherGame, "Main")
        ev(EventType.DEVICE_STARTUP, "2026-11-10T21:30:00")
        ev(EventType.ACTIVITY_RESUMED, "2026-11-10T22:00:00", chat, "Main")
        val intervals = b.finish(at("2026-11-10T22:05:00"))

        assertEquals(
            listOf(
                AppInterval(game, at("2026-11-10T20:00:05"), at("2026-11-10T20:40:05")),
                AppInterval(chat, at("2026-11-10T22:00:00"), at("2026-11-10T22:05:00")),
            ),
            intervals,
        )
    }

    @Test
    fun fromEventsToTheFileWithNoPackageNames() {
        val sessions = SessionBuilder()
        val apps = AppIntervalBuilder()
        fun ev(type: Int, time: String, pkg: String = "", cls: String = "") {
            sessions.onEvent(type, at(time)) { "$pkg/$cls" }
            apps.onEvent(type, at(time), { pkg }, { cls })
        }
        ev(EventType.SCREEN_INTERACTIVE, "2026-11-10T01:00:00")
        ev(EventType.ACTIVITY_RESUMED, "2026-11-10T01:00:10", game, "Play")
        ev(EventType.ACTIVITY_PAUSED, "2026-11-10T01:40:10", game, "Play")
        ev(EventType.ACTIVITY_RESUMED, "2026-11-10T01:40:11", chat, "Main")
        ev(EventType.SCREEN_NON_INTERACTIVE, "2026-11-10T02:00:00")
        ev(EventType.SCREEN_INTERACTIVE, "2026-11-10T17:00:00")
        ev(EventType.ACTIVITY_RESUMED, "2026-11-10T17:00:05", unlabeled, "Main")
        ev(EventType.ACTIVITY_PAUSED, "2026-11-10T17:30:05", unlabeled, "Main")
        ev(EventType.SCREEN_NON_INTERACTIVE, "2026-11-10T18:00:00")
        val now = at("2026-11-11T09:00:00")
        val screen = sessions.finish(now)
        val dates = listOf(day("2026-11-10"))

        val screenDay = ScreenTimeMath.summarize(screen, dates, zone).single()
        val gameDay = GameMath.summarize(apps.finish(now), categories, screen, dates, zone).single()
        val merged = screenDay.copy(gameMinutes = gameDay.gameMinutes, nightGameMinutes = gameDay.nightGameMinutes)
        assertEquals(120, merged.screenMinutes)
        assertEquals(60, merged.nightMinutes)
        assertEquals(40, merged.gameMinutes)
        assertEquals(40, merged.nightGameMinutes)

        val text = ExportJson.build(listOf(DayExport(merged.date, screen = merged)), emptyList(), Instant.parse("2026-11-11T09:00:00Z"))
        val exported = JSONObject(text).getJSONArray("days").getJSONObject(0)
        assertEquals(40, exported.getInt("game_minutes"))
        assertEquals(40, exported.getInt("night_game_minutes"))
        for (name in listOf("com.example", "puzzlegame", "chat", "unlabeled", "Play", "Main")) {
            assertFalse("$name is in the export", text.contains(name))
        }
    }

    @Test
    fun theCacheKeepsGameMinutesAndStillReadsOlderCopies() {
        val days = listOf(
            DaySummary(day("2026-11-10"), 120, 60, LocalTime.of(1, 0), LocalTime.of(18, 0), gameMinutes = 40, nightGameMinutes = 40),
            DaySummary(day("2026-11-11"), 90, 0, LocalTime.of(7, 0), LocalTime.of(22, 0)),
        )
        assertEquals(days, ScreenCache.parse(ScreenCache.build(days, Instant.parse("2026-11-12T08:00:00Z"))))

        // A days.json written before games were counted has no game keys.
        val old = """{"source":"android_usage_stats","version":1,"generated":"2026-11-01T08:00:00Z","days":[
            {"date":"2026-10-30","screen_minutes":200,"night_minutes":5,"first_use":"07:00","last_use":"23:00"}]}"""
        val loaded = ScreenCache.parse(old).single()
        assertEquals(200, loaded.screenMinutes)
        assertNull(loaded.gameMinutes)
        assertNull(loaded.nightGameMinutes)

        val exported = JSONObject(ExportJson.build(listOf(DayExport(loaded.date, screen = loaded)), emptyList(), Instant.EPOCH))
            .getJSONArray("days").getJSONObject(0)
        assertTrue(exported.has("game_minutes") && exported.isNull("game_minutes"))
        assertTrue(exported.has("night_game_minutes") && exported.isNull("night_game_minutes"))
    }

    @Test
    fun weeksAverageGameMinutesOverDaysThatHaveThem() {
        val days = listOf(
            DayExport(day("2026-11-09"), screen = DaySummary(day("2026-11-09"), 200, 0, null, null, gameMinutes = 30, nightGameMinutes = 0)),
            DayExport(day("2026-11-10"), screen = DaySummary(day("2026-11-10"), 200, 40, null, null, gameMinutes = 90, nightGameMinutes = 30)),
            DayExport(day("2026-11-11"), screen = DaySummary(day("2026-11-11"), 200, 0, null, null)),   // saved before games were counted
        )
        val week = Weeks.summarize(days).single()
        assertEquals(60, week.gameMinutesPerDay)
        assertEquals(15, week.nightGameMinutesPerDay)

        val none = Weeks.summarize(listOf(days[2])).single()
        assertNull(none.gameMinutesPerDay)
    }

    @Test
    fun theManifestAddsNoPermissionForGames() {
        val manifest = TestFiles.repoRoot.resolve("native/android/app/src/main/AndroidManifest.xml").readText()
        val permissions = Regex("""<uses-permission\s+android:name="([^"]+)"""").findAll(manifest).map { it.groupValues[1] }.toSet()
        assertEquals(
            setOf(
                "android.permission.PACKAGE_USAGE_STATS",
                "android.permission.health.READ_SLEEP",
                "android.permission.health.READ_STEPS",
                "android.permission.POST_NOTIFICATIONS",
            ),
            permissions,
        )
        assertFalse(manifest.contains("android.permission.QUERY_ALL_PACKAGES"))
        val queries = Regex("""<queries>(.*?)</queries>""", RegexOption.DOT_MATCHES_ALL).find(manifest)!!.groupValues[1]
        assertTrue(queries.contains("android.intent.action.MAIN"))
        assertTrue(queries.contains("android.intent.category.LAUNCHER"))
    }
}
