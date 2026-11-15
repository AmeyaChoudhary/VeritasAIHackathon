package app.steady.screentime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

// Item A: "concern" asks "Are you safe right now?" with 988 behind it; "plan" shows 988 and 911
// at once; the answer is kept on the flag, never any text.
class HelpScreenTest {

    @Test
    fun planShows911AtOnceWithNoQuestion() {
        val c = HelpScreen.content(HelpMode.PLAN, null)
        assertFalse(c.askSafe)
        assertTrue(c.show911)
    }

    @Test
    fun concernAsksFirstAnd988StaysOnScreen() {
        val c = HelpScreen.content(HelpMode.CONCERN, null)
        assertTrue(c.askSafe)
        assertFalse(c.show911)
        // 988 is drawn on every version of the screen; nothing hides it.
    }

    @Test
    fun noAdds911AndYesSaysThanks() {
        assertEquals(HelpContent(askSafe = false, show911 = true, thanks = false), HelpScreen.content(HelpMode.CONCERN, SafeAnswer.NO))
        assertEquals(HelpContent(askSafe = false, show911 = false, thanks = true), HelpScreen.content(HelpMode.CONCERN, SafeAnswer.YES))
    }

    @Test
    fun aWeakerMatchNeverHides911() {
        assertEquals(HelpMode.PLAN, HelpScreen.stronger(HelpMode.PLAN, HelpMode.CONCERN))
        assertEquals(HelpMode.CONCERN, HelpScreen.stronger(HelpMode.HELP, HelpMode.CONCERN))
        assertEquals(HelpMode.PLAN, HelpMode.of(SelfHarmLevel.PLAN))
        assertEquals(HelpMode.CONCERN, HelpMode.of(SelfHarmLevel.CONCERN))
    }

    @Test
    fun theAnswerIsKeptOnTheFlag() {
        val flag = Flag("0123456789abcdef", Instant.parse("2026-11-10T07:00:00Z"), SelfHarmLevel.CONCERN)
        val log = KeyboardLog().withFlag(flag).withAnswer(flag.id, SafeAnswer.NO)
        assertEquals(SafeAnswer.NO, log.flags.single().answer)
        assertEquals(log, KeyboardLog.fromJson(log.toJson()))
        assertTrue(log.toJson().contains("\"answer\":\"no\""))
    }

    @Test
    fun filesFromBeforeAnswersLoadAsUnanswered() {
        val old = """{"version":1,"days":[],"flags":[{"id":"aa","time":"2026-11-10T07:00:00Z","level":"concern"}]}"""
        assertNull(KeyboardLog.fromJson(old).flags.single().answer)
    }
}
