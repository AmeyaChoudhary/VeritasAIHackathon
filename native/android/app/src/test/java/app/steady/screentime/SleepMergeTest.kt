package app.steady.screentime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

// Item F: split nights merge, naps never become the night. Times are Los Angeles local.
class SleepMergeTest {
    private val zone: ZoneId = ZoneId.of("America/Los_Angeles")
    private fun at(text: String): Instant = LocalDateTime.parse(text).atZone(zone).toInstant()

    @Test
    fun aNightSplitByABreakIsOneNight() {
        // 22:30 to 02:00 and 02:20 to 07:00 from the same watch (the review's case).
        val nights = SleepMath.byWakeDate(
            listOf(
                SleepPeriod(at("2026-11-09T22:30:00"), at("2026-11-10T02:00:00"), source = "watch"),
                SleepPeriod(at("2026-11-10T02:20:00"), at("2026-11-10T07:00:00"), source = "watch"),
            ),
            zone,
        )
        val night = nights.getValue(LocalDate.parse("2026-11-10"))
        assertEquals(8 * 60 + 30 - 20, night.sleepMinutes)   // the 20-minute break counts as awake
        assertEquals(LocalTime.of(22, 30), night.bedtime)
    }

    @Test
    fun aDayWithOnlyANapHasNoSleep() {
        // The watch was off overnight; a 90-minute nap 15:00 to 16:30 (the review's case).
        val nights = SleepMath.byWakeDate(listOf(SleepPeriod(at("2026-11-09T15:00:00"), at("2026-11-09T16:30:00"))), zone)
        assertFalse(nights.containsKey(LocalDate.parse("2026-11-09")))
        val merged = DayMerge.merge(
            LocalDate.parse("2026-11-14"),
            emptyList(),
            mapOf(LocalDate.parse("2026-11-09") to (nights[LocalDate.parse("2026-11-09")] ?: HealthDay(LocalDate.parse("2026-11-09"), steps = 4000))),
            emptyList(),
        )
        assertNull(merged.single().health?.sleepMinutes)
        assertNull(merged.single().health?.bedtime)
    }

    @Test
    fun sessionsFromDifferentSourcesAreNotMerged() {
        val merged = SleepMath.merge(
            listOf(
                SleepPeriod(at("2026-11-09T23:00:00"), at("2026-11-10T03:00:00"), source = "phone"),
                SleepPeriod(at("2026-11-10T03:30:00"), at("2026-11-10T07:00:00"), source = "watch"),
            ),
        )
        assertEquals(2, merged.size)
    }

    @Test
    fun breaksOf90MinutesOrMoreStayApart() {
        val merged = SleepMath.merge(
            listOf(
                SleepPeriod(at("2026-11-09T21:00:00"), at("2026-11-09T23:00:00"), source = "watch"),
                SleepPeriod(at("2026-11-10T00:30:00"), at("2026-11-10T07:00:00"), source = "watch"),
            ),
        )
        assertEquals(2, merged.size)
    }

    @Test
    fun aLongEveningSleepCountsEvenOutsideTheNightWindow() {
        // A night shift sleeper: 18:00 to 22:00, more than 3 hours.
        val nights = SleepMath.byWakeDate(listOf(SleepPeriod(at("2026-11-10T18:00:00"), at("2026-11-10T22:00:00"))), zone)
        assertEquals(240, nights.getValue(LocalDate.parse("2026-11-10")).sleepMinutes)
    }

    @Test
    fun aShortSleepInsideTheNightWindowCounts() {
        val nights = SleepMath.byWakeDate(listOf(SleepPeriod(at("2026-11-10T03:00:00"), at("2026-11-10T05:00:00"))), zone)
        assertEquals(120, nights.getValue(LocalDate.parse("2026-11-10")).sleepMinutes)
    }
}
