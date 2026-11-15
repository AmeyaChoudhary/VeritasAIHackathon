package app.steady.screentime

import java.time.Instant
import java.time.temporal.ChronoUnit

// The keyboard's in-memory view of the message being typed. Nothing here is ever written to
// disk. No Android imports, so KeyboardTextTest runs on the JVM.

/**
 * Where the cursor is in the field, as offsets into the field's text.
 *
 * The keyboard learns the cursor from onUpdateSelection, which arrives after each edit and can
 * lag behind fast typing, or merge several edits into one update. So each edit this keyboard
 * makes records where it expects the cursor to land. An update that matches one of those is
 * this keyboard's own edit catching up. Any other update is a change from outside: the teen
 * tapped somewhere else, or the app changed the text.
 */
class FieldCursor {
    var start = 0
        private set
    var end = 0
        private set
    private val pending = ArrayDeque<Pair<Int, Int>>()

    val hasSelection: Boolean get() = start != end

    fun reset(start: Int, end: Int) {
        this.start = start.coerceAtLeast(0)
        this.end = end.coerceAtLeast(this.start)
        pending.clear()
    }

    /** This keyboard just made an edit that should leave the cursor at [start] to [end]. */
    fun expect(start: Int, end: Int) {
        pending.addLast(start to end)
        this.start = start
        this.end = end
    }

    /** Returns true when the update came from outside this keyboard. */
    fun onUpdate(newStart: Int, newEnd: Int): Boolean {
        val i = pending.indexOf(newStart to newEnd)
        if (i >= 0) {
            repeat(i + 1) { pending.removeFirst() }
            return false
        }
        pending.clear()
        start = newStart.coerceAtLeast(0)
        end = newEnd.coerceAtLeast(start)
        return true
    }
}

/**
 * The words of the message being typed, as this keyboard typed them. Pasted text is not here.
 * [origin] is the field offset of the first character, so edits land at the cursor.
 */
class MessageBuffer {
    private val text = StringBuilder()
    private var origin = 0

    /** The longest the message has been since it began, so words typed and then deleted are still checked. */
    var peak: String = ""
        private set

    val current: String get() = text.toString()
    val length: Int get() = text.length
    val isEmpty: Boolean get() = text.isEmpty()
    val hasContent: Boolean get() = text.isNotEmpty() || peak.isNotEmpty()

    /** [typed] replaced the field's selection [selStart, selEnd). */
    fun typed(typed: String, selStart: Int, selEnd: Int) {
        if (text.isEmpty()) {
            origin = selStart
            text.append(typed)
        } else {
            val a = (selStart - origin).coerceIn(0, text.length)
            val b = (selEnd - origin).coerceIn(a, text.length)
            text.replace(a, b, typed)
            if (selStart < origin) origin = selStart
        }
        if (text.length >= peak.length) peak = text.toString()
    }

    /**
     * Delete at a collapsed cursor [pos] removes one character before it. Returns how many UTF-16
     * units went, so the caller knows where the cursor lands.
     */
    fun deletedBefore(pos: Int): Int {
        val i = pos - origin
        return when {
            pos <= 0 -> 0
            i <= 0 -> {
                // A character before the message went, so the message moves left.
                origin -= 1
                1
            }
            i > text.length -> 1
            else -> {
                val n = Character.charCount(text.codePointBefore(i))
                text.delete(i - n, i)
                n
            }
        }
    }

    /** The field's selection [selStart, selEnd) was deleted. */
    fun deletedRange(selStart: Int, selEnd: Int) {
        val beforeOrigin = (minOf(selEnd, origin) - selStart).coerceAtLeast(0)
        val a = (selStart - origin).coerceIn(0, text.length)
        val b = (selEnd - origin).coerceIn(a, text.length)
        text.delete(a, b)
        origin -= beforeOrigin
    }

    /** After the app restarts input, the message carries on only if the text before the cursor still ends with it. */
    fun survivesRestart(textBeforeCursor: CharSequence?): Boolean =
        text.isNotEmpty() && textBeforeCursor != null && textBeforeCursor.toString().endsWith(text.toString())

    /** The message now ends at field offset [cursor]. */
    fun rebase(cursor: Int) {
        origin = cursor - text.length
    }

    fun clear() {
        text.setLength(0)
        peak = ""
        origin = 0
    }
}

/** What to do when the field becomes empty while a message is in memory. */
object ClearRules {
    /**
     * The teen deleted it all (select all, then delete or cut): a discard. It is still checked
     * for self-harm words, and not counted. Anything else that empties the field is the app
     * clearing it after its own send button.
     */
    fun onFieldEmptied(lastKeyWasDelete: Boolean, selectionWasRange: Boolean): EndReason =
        if (lastKeyWasDelete || selectionWasRange) EndReason.DISCARD else EndReason.FIELD_CLEARED
}

/**
 * The order of things when a message ends. The self-harm check runs first, on the calling
 * thread, and the help screen opens before anything is written, so a slow or failing disk
 * cannot delay or stop it. A failure in any step is caught and never reaches the keyboard.
 */
class MessageEndFlow(
    private val check: (String) -> SelfHarmResult?,
    private val openHelp: (SelfHarmLevel, String) -> Unit,
    private val recordFlag: (Flag) -> Unit,
    private val scoreLater: (text: String, counted: Boolean) -> Unit,
    private val newId: () -> String = Flag::newId,
    private val now: () -> Instant = Instant::now,
) {
    /** Returns the level found, so the keyboard can light its own 988 key. */
    fun end(text: String, peak: String, reason: EndReason, counted: Boolean): SelfHarmLevel {
        var level = levelOf(text)
        if (peak.isNotEmpty() && peak != text) level = stronger(level, levelOf(peak))
        if (level != SelfHarmLevel.NONE) {
            val flag = Flag(newId(), now().truncatedTo(ChronoUnit.SECONDS), level)
            safely { openHelp(level, flag.id) }
            safely { recordFlag(flag) }
        }
        if (reason != EndReason.DISCARD && text.isNotBlank()) safely { scoreLater(text, counted) }
        return level
    }

    private fun levelOf(text: String): SelfHarmLevel =
        if (text.isBlank()) SelfHarmLevel.NONE else (runCatching { check(text) }.getOrNull()?.level ?: SelfHarmLevel.NONE)

    private fun stronger(a: SelfHarmLevel, b: SelfHarmLevel) = if (a.ordinal >= b.ordinal) a else b

    private inline fun safely(block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            // Never let a failure here take the keyboard down while someone is typing.
        }
    }
}
