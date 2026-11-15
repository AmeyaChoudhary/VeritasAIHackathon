package app.steady.screentime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Items C and D: the message in memory follows the cursor, survives an input restart only
// while it is still in the field, and a delete-everything is a discard.
class KeyboardTextTest {

    /** Types [s] one character at a time from field offset [at], as the keyboard does. */
    private fun MessageBuffer.type(s: String, at: Int): Int {
        var pos = at
        for (c in s) {
            typed(c.toString(), pos, pos)
            pos++
        }
        return pos
    }

    @Test
    fun typingInTheMiddleLandsAtTheCursor() {
        val b = MessageBuffer()
        b.type("i am fine", at = 0)
        b.type("not ", at = 5)            // the teen taps between "am" and "fine"
        assertEquals("i am not fine", b.current)
    }

    @Test
    fun deleteRemovesTheCharacterBeforeTheCursor() {
        val b = MessageBuffer()
        b.type("hello", at = 0)
        assertEquals(1, b.deletedBefore(2))   // cursor after "he"
        assertEquals("hllo", b.current)
    }

    @Test
    fun deletingASelectionRemovesThatRange() {
        val b = MessageBuffer()
        b.type("i want to die", at = 0)
        b.deletedRange(2, 10)                 // "want to " selected and deleted
        assertEquals("i die", b.current)
        assertEquals("i want to die", b.peak)
    }

    @Test
    fun aMessageStartingMidFieldMapsOffsets() {
        val b = MessageBuffer()
        b.type("abc", at = 10)                // ten characters were already in the field
        b.deletedBefore(13)
        assertEquals("ab", b.current)
        b.deletedBefore(5)                    // a character before the message went
        b.type("Z", at = 11)                  // the message now starts at 9
        assertEquals("abZ", b.current)
    }

    @Test
    fun surrogatePairsAreDeletedWhole() {
        val b = MessageBuffer()
        b.type("a", at = 0)
        b.typed("😀", 1, 1)
        assertEquals(2, b.deletedBefore(3))
        assertEquals("a", b.current)
    }

    @Test
    fun aRestartKeepsTheMessageOnlyWhileItIsStillInTheField() {
        val b = MessageBuffer()
        b.type("see you at 5", at = 0)
        assertTrue(b.survivesRestart("Hi! see you at 5"))
        assertFalse(b.survivesRestart(""))
        assertFalse(b.survivesRestart("see you at"))
        assertFalse(b.survivesRestart(null))
        b.rebase(20)
        b.type("!", at = 20)
        assertEquals("see you at 5!", b.current)
    }

    @Test
    fun lateCursorUpdatesFromOwnEditsAreNotTreatedAsMoves() {
        val c = FieldCursor()
        c.reset(0, 0)
        c.expect(1, 1)
        c.expect(2, 2)
        c.expect(3, 3)
        assertFalse(c.onUpdate(1, 1))         // late update for the first key
        assertEquals(3, c.start)              // still where the last key left it
        assertFalse(c.onUpdate(3, 3))         // the app merged the rest into one update
        assertTrue(c.onUpdate(0, 0))          // the teen tapped the start of the field
        assertEquals(0, c.start)
    }

    @Test
    fun emptyingTheFieldAfterADeleteIsADiscard() {
        assertEquals(EndReason.DISCARD, ClearRules.onFieldEmptied(lastKeyWasDelete = true, selectionWasRange = false))
        assertEquals(EndReason.DISCARD, ClearRules.onFieldEmptied(lastKeyWasDelete = false, selectionWasRange = true))
        assertEquals(EndReason.FIELD_CLEARED, ClearRules.onFieldEmptied(lastKeyWasDelete = false, selectionWasRange = false))
    }
}
