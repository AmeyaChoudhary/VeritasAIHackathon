package app.steady.screentime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// The Kotlin port must give the same scores as app/src/engine/tone.ts, run under Node.
class ToneModelTest {

    @Test
    fun scoresMatchTheWebModel() {
        val cases = TestFiles.expected
        assertTrue("need at least 50 sentences, have ${cases.size}", cases.size >= 50)
        var largest = 0.0
        for (case in cases) {
            val score = TestFiles.toneModel.score(case.text)
            assertEquals("score for ${case.id}", case.score, score, 1e-6)
            assertEquals("low mood for ${case.id}", case.low, TestFiles.toneModel.isLowMood(case.text))
            largest = maxOf(largest, kotlin.math.abs(score - case.score))
        }
        println("tone parity: ${cases.size} sentences, largest difference $largest")
    }

    @Test
    fun theTestSetHasBothLowAndOtherMessages() {
        val low = TestFiles.expected.count { it.low }
        assertTrue(low in 5..(TestFiles.expected.size - 5))
    }

    @Test
    fun tokenizerFollowsTheWebSteps() {
        assertEquals(
            listOf("im", "soo", "sad", "im soo", "soo sad"),
            ToneModel.analyze("I\u2019M SOOOO sad!!!"),
        )
        assertEquals(listOf("caf", "later", "caf later"), ToneModel.analyze("Café later"))
        assertEquals(emptyList<String>(), ToneModel.analyze(""))
    }

    @Test
    fun emptyTextScoresTheInterceptOnly() {
        val score = TestFiles.toneModel.score("")
        val empty = TestFiles.expected.first { it.text.isEmpty() }
        assertEquals(empty.score, score, 1e-12)
    }
}
