package app.steady.screentime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

class TypingRhythmTest {

    @Test
    fun gapsPausesAndSpeed() {
        val r = MessageRecorder()
        r.onCharacter(0)        // first key: no gap
        r.onCharacter(200)      // 200 ms
        r.onCharacter(400)      // 200 ms
        r.onCorrection(3_400)   // 3 s: a pause
        r.onCharacter(3_600)    // 200 ms
        r.onCharacter(3_800)    // 200 ms
        val s = r.finish()

        assertEquals(5, s.chars)
        assertEquals(1, s.corrections)
        assertEquals(5, s.gaps)
        assertEquals(1, s.pauses)
        // Characters typed within 2 s of the key before, and the time those gaps took.
        assertEquals(4, s.speedChars)
        assertEquals(800L, s.speedMs)
    }

    @Test
    fun aGapOfExactlyTwoSecondsIsNotAPause() {
        val r = MessageRecorder()
        r.onCharacter(0)
        r.onCharacter(PAUSE_MS)
        val s = r.finish()
        assertEquals(0, s.pauses)
        assertEquals(1, s.speedChars)
    }

    @Test
    fun finishStartsANewMessage() {
        val r = MessageRecorder()
        r.onCharacter(0)
        r.onCharacter(100)
        r.finish()
        r.onCharacter(60_000)
        val s = r.finish()
        assertEquals(1, s.chars)
        assertEquals(0, s.gaps)
    }

    @Test
    fun dayTotalsAndShares() {
        val date = LocalDate.parse("2026-11-10")
        val a = MessageStats(chars = 40, corrections = 2, gaps = 39, pauses = 3, speedChars = 36, speedMs = 9_000)
        val b = MessageStats(chars = 10, corrections = 3, gaps = 9, pauses = 1, speedChars = 8, speedMs = 3_000)
        val day = KeyboardDay(date).plus(a, lowMoodResult = true).plus(b, lowMoodResult = false)

        assertEquals(2, day.messages)
        assertEquals(44 * 60_000.0 / 12_000, day.charsPerMinute!!, 1e-9)
        assertEquals(4.0 / 48, day.pauseShare!!, 1e-9)
        // Deletes as a share of all key presses: 5 / (50 + 5).
        assertEquals(5.0 / 55, day.correctionShare!!, 1e-9)
        assertEquals(0.5, day.lowMoodShare!!, 1e-9)
    }

    @Test
    fun noToneModelMeansNoLowMoodShare() {
        val stats = MessageStats(5, 0, 4, 0, 4, 800)
        val day = KeyboardDay(LocalDate.parse("2026-11-10")).plus(stats, lowMoodResult = null)
        assertEquals(1, day.messages)
        assertNull(day.lowMoodShare)
    }

    @Test
    fun aOneKeyMessageHasNoSpeed() {
        val day = KeyboardDay(LocalDate.parse("2026-11-10")).plus(MessageRecorder().apply { onCharacter(5) }.finish(), false)
        assertNull(day.charsPerMinute)
        assertNull(day.pauseShare)
        assertEquals(0.0, day.correctionShare!!, 0.0)
    }

    @Test
    fun logAddsUpByDayAndSurvivesJson() {
        val d1 = LocalDate.parse("2026-11-09")
        val d2 = LocalDate.parse("2026-11-10")
        val s = MessageStats(10, 1, 9, 1, 8, 2_000)
        val flag = Flag(Flag.newId(), Instant.parse("2026-11-10T01:30:00Z"), SelfHarmLevel.CONCERN)
        val log = KeyboardLog()
            .withMessage(d2, s, false)
            .withMessage(d1, s, true)
            .withMessage(d2, s, true)
            .withFlag(flag)

        assertEquals(listOf(d1, d2), log.days.map { it.date })
        assertEquals(2, log.days[1].messages)
        assertEquals(log, KeyboardLog.fromJson(log.toJson()))
    }

    @Test
    fun pruningDropsOldDaysAndFlags() {
        val s = MessageStats(1, 0, 0, 0, 0, 0)
        val old = Flag("a", Instant.parse("2026-09-01T00:00:00Z"), SelfHarmLevel.PLAN)
        val recent = Flag("b", Instant.parse("2026-11-01T00:00:00Z"), SelfHarmLevel.CONCERN)
        val log = KeyboardLog()
            .withMessage(LocalDate.parse("2026-09-01"), s, null)
            .withMessage(LocalDate.parse("2026-11-01"), s, null)
            .withFlag(old).withFlag(recent)
            .pruned(LocalDate.parse("2026-10-01"), Instant.parse("2026-10-01T00:00:00Z"))
        assertEquals(listOf(LocalDate.parse("2026-11-01")), log.days.map { it.date })
        assertEquals(listOf("b"), log.flags.map { it.id })
    }

    @Test
    fun flagIdsAreOpaqueHex() {
        val ids = (1..50).map { Flag.newId() }.toSet()
        assertEquals(50, ids.size)
        assertTrue(ids.all { it.matches(Regex("[0-9a-f]{16}")) })
    }
}
