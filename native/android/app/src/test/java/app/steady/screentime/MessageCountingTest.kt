package app.steady.screentime

import android.text.InputType
import android.view.inputmethod.EditorInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

// Item I: only messages count. A search box or a note left by tapping away is checked for
// self-harm words but does not count, and its tone stays out of the shares.
class MessageCountingTest {
    private val text = InputType.TYPE_CLASS_TEXT
    private val short = text or InputType.TYPE_TEXT_VARIATION_SHORT_MESSAGE
    private val long = text or InputType.TYPE_TEXT_VARIATION_LONG_MESSAGE
    private val plain = text or InputType.TYPE_TEXT_VARIATION_NORMAL

    @Test
    fun messageFieldsAlwaysCount() {
        for (reason in listOf(EndReason.FOCUS_LOST, EndReason.ENTER, EndReason.OTHER_ACTION, EndReason.RESTARTED)) {
            assertTrue(FieldRules.isCounted(short, reason))
            assertTrue(FieldRules.isCounted(long, reason))
        }
    }

    @Test
    fun otherFieldsCountOnlyWhenSent() {
        assertTrue(FieldRules.isCounted(plain, EndReason.SEND))
        assertTrue(FieldRules.isCounted(plain, EndReason.FIELD_CLEARED))
        assertFalse(FieldRules.isCounted(plain, EndReason.FOCUS_LOST))
        assertFalse(FieldRules.isCounted(plain, EndReason.OTHER_ACTION))
        assertFalse(FieldRules.isCounted(text or InputType.TYPE_TEXT_VARIATION_WEB_EDIT_TEXT, EndReason.ENTER))
    }

    @Test
    fun aDiscardNeverCounts() {
        assertFalse(FieldRules.isCounted(short, EndReason.DISCARD))
    }

    @Test
    fun theSendKeyIsSend() {
        assertEquals(EndReason.SEND, FieldRules.enterReason(EditorInfo.IME_ACTION_SEND))
        assertEquals(EndReason.OTHER_ACTION, FieldRules.enterReason(EditorInfo.IME_ACTION_SEARCH))
        assertEquals(EndReason.ENTER, FieldRules.enterReason(EditorInfo.IME_ACTION_SEND or EditorInfo.IME_FLAG_NO_ENTER_ACTION))
    }

    @Test
    fun anUncountedMessageOnlyMarksTheDayActive() {
        val date = LocalDate.parse("2026-11-10")
        val stats = MessageStats(10, 1, 9, 0, 9, 2_000)
        val log = KeyboardLog().withMessage(date, stats, lowMood = true, counted = false)
        val day = log.days.single()
        assertEquals(0, day.messages)
        assertEquals(0, day.toneScored)
        assertEquals(null, day.lowMoodShare)
        val counted = log.withMessage(date, stats, lowMood = false, counted = true).days.single()
        assertEquals(1, counted.messages)
        assertEquals(0.0, counted.lowMoodShare!!, 0.0)
    }
}
