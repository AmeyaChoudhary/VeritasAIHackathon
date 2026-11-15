package app.steady.screentime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset

// Plain JVM tests for the counting rules. Run with ./gradlew test once the project builds.
class ScreenTimeMathTest {
    private val zone: ZoneId = ZoneOffset.UTC

    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(zone).toInstant().toEpochMilli()

    private fun day(text: String): LocalDate = LocalDate.parse(text)

    @Test
    fun useAcrossMidnightIsSplitAndCountsAsNight() {
        val builder = SessionBuilder()
        builder.onEvent(EventType.SCREEN_INTERACTIVE, at("2026-11-09T23:30:00")) { "" }
        builder.onEvent(EventType.SCREEN_NON_INTERACTIVE, at("2026-11-10T00:45:00")) { "" }
        val sessions = builder.finish(at("2026-11-11T12:00:00"))

        val days = ScreenTimeMath.summarize(sessions, listOf(day("2026-11-09"), day("2026-11-10")), zone)

        assertEquals(30, days[0].screenMinutes)
        assertEquals(0, days[0].nightMinutes)
        assertEquals(LocalTime.of(23, 30), days[0].firstUse)
        assertEquals(LocalTime.of(23, 59), days[0].lastUse)
        assertEquals(45, days[1].screenMinutes)
        assertEquals(45, days[1].nightMinutes)
        assertEquals(LocalTime.of(0, 0), days[1].firstUse)
        assertEquals(LocalTime.of(0, 45), days[1].lastUse)
    }

    @Test
    fun aShortGlanceCountsAsMinutesButNotAsFirstUse() {
        val builder = SessionBuilder()
        builder.onEvent(EventType.SCREEN_INTERACTIVE, at("2026-11-10T03:00:00")) { "" }
        builder.onEvent(EventType.SCREEN_NON_INTERACTIVE, at("2026-11-10T03:00:40")) { "" }
        builder.onEvent(EventType.SCREEN_INTERACTIVE, at("2026-11-10T07:00:00")) { "" }
        builder.onEvent(EventType.SCREEN_NON_INTERACTIVE, at("2026-11-10T08:00:00")) { "" }

        val result = ScreenTimeMath.summarize(builder.finish(at("2026-11-11T00:00:00")), listOf(day("2026-11-10")), zone)[0]

        assertEquals(61, result.screenMinutes)
        assertEquals(1, result.nightMinutes)
        assertEquals(LocalTime.of(7, 0), result.firstUse)
        assertEquals(LocalTime.of(8, 0), result.lastUse)
    }

    @Test
    fun withoutScreenEventsAppTimeIsUsed() {
        val builder = SessionBuilder()
        builder.onEvent(EventType.ACTIVITY_RESUMED, at("2026-11-10T10:00:00")) { "a/Main" }
        builder.onEvent(EventType.ACTIVITY_PAUSED, at("2026-11-10T10:20:00")) { "a/Main" }
        builder.onEvent(EventType.ACTIVITY_RESUMED, at("2026-11-10T10:20:01")) { "b/Main" }
        builder.onEvent(EventType.ACTIVITY_PAUSED, at("2026-11-10T10:30:00")) { "b/Main" }

        val sessions = builder.finish(at("2026-11-11T00:00:00"))
        val result = ScreenTimeMath.summarize(sessions, listOf(day("2026-11-10")), zone)[0]

        assertFalse(builder.sawScreenEvents)
        assertEquals(30, result.screenMinutes)
    }

    @Test
    fun aDayWithNoUseHasZeroMinutesAndNoTimes() {
        val result = ScreenTimeMath.summarize(emptyList(), listOf(day("2026-11-10")), zone)[0]

        assertEquals(0, result.screenMinutes)
        assertNull(result.firstUse)
        assertNull(result.lastUse)
    }
}
