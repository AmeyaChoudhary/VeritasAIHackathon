package app.steady.screentime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// The Kotlin port must give the same level and rule as app/src/engine/selfharm.ts on the
// experiment's test messages, using the same selfharm_phrases.json.
class SelfHarmCheckTest {

    @Test
    fun everyTestMessageMatchesTheWebRules() {
        val messages = TestFiles.testMessages
        assertEquals(60, messages.size)
        val expected = TestFiles.expected.associateBy { it.id }
        for ((id, text) in messages) {
            val want = expected[id] ?: error("no expected result for $id; rerun tools/make_parity_fixtures.mjs")
            assertEquals("fixture text for $id", text, want.text)
            val got = TestFiles.selfHarm.check(text)
            assertEquals("level for $id", want.level, got.level.wire)
            assertEquals("rule for $id", want.rule, got.ruleId)
        }
    }

    @Test
    fun extraCasesMatchTheWebRules() {
        val extra = TestFiles.expected.filter { it.id.startsWith("e") }
        assertTrue(extra.size >= 20)
        for (case in extra) {
            val got = TestFiles.selfHarm.check(case.text)
            assertEquals("level for ${case.id}", case.level, got.level.wire)
            assertEquals("rule for ${case.id}", case.rule, got.ruleId)
        }
    }

    @Test
    fun theTestMessagesCoverAllThreeLevels() {
        val levels = TestFiles.testMessages.values.map { TestFiles.selfHarm.check(it).level }.toSet()
        assertEquals(SelfHarmLevel.entries.toSet(), levels)
    }

    @Test
    fun normalizeFollowsTheWebSteps() {
        assertEquals("i dont want to be here", SelfHarmCheck.normalize("  I DON\u2019T   want to be here!!! "))
        assertEquals("", SelfHarmCheck.normalize("..."))
    }

    @Test
    fun negationsAreBlankedButTheRestIsStillChecked() {
        assertEquals(SelfHarmLevel.NONE, TestFiles.selfHarm.check("i would never kill myself").level)
        assertEquals(
            SelfHarmLevel.CONCERN,
            TestFiles.selfHarm.check("i would never kill myself but i want to die").level,
        )
    }
}
