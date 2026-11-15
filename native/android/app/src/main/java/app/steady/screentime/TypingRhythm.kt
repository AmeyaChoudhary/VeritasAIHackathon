package app.steady.screentime

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.time.LocalDate

// Typing rhythm and the keyboard's daily log. Nothing here ever sees typed text: the keyboard
// reports only that a key was pressed and when.

/** A gap between two keys longer than this counts as a pause. */
const val PAUSE_MS = 2_000L

/** Timing for one message. */
data class MessageStats(
    /** Characters typed, spaces and symbols included. */
    val chars: Int,
    /** Backspace presses. */
    val corrections: Int,
    /** Gaps between one key and the next. */
    val gaps: Int,
    /** Gaps longer than [PAUSE_MS]. */
    val pauses: Int,
    /** Characters typed within [PAUSE_MS] of the key before, and the time those gaps took. */
    val speedChars: Int,
    val speedMs: Long,
)

/**
 * Counts keys for the message being typed. Only character keys and backspace count. Shift and
 * the page keys do not, so a gap that spans a shift press is one gap.
 */
class MessageRecorder {
    private var lastKeyAt: Long? = null
    private var chars = 0
    private var corrections = 0
    private var gaps = 0
    private var pauses = 0
    private var speedChars = 0
    private var speedMs = 0L

    fun onCharacter(timeMs: Long) {
        val gap = gapTo(timeMs)
        chars++
        if (gap != null && gap <= PAUSE_MS) {
            speedChars++
            speedMs += gap
        }
    }

    fun onCorrection(timeMs: Long) {
        gapTo(timeMs)
        corrections++
    }

    /** Returns the stats so far and starts a new message. */
    fun finish(): MessageStats {
        val stats = MessageStats(chars, corrections, gaps, pauses, speedChars, speedMs)
        lastKeyAt = null
        chars = 0
        corrections = 0
        gaps = 0
        pauses = 0
        speedChars = 0
        speedMs = 0L
        return stats
    }

    private fun gapTo(timeMs: Long): Long? {
        val last = lastKeyAt
        lastKeyAt = timeMs
        if (last == null || timeMs < last) return null
        val gap = timeMs - last
        gaps++
        if (gap > PAUSE_MS) pauses++
        return gap
    }
}

/**
 * One day of keyboard use. Sums only, so days add up without keeping any message.
 * A day with [messages] 0 means the keyboard was open that day but no counted message ended.
 */
data class KeyboardDay(
    val date: LocalDate,
    val messages: Int = 0,
    val chars: Int = 0,
    val corrections: Int = 0,
    val gaps: Int = 0,
    val pauses: Int = 0,
    val speedChars: Int = 0,
    val speedMs: Long = 0,
    /** Counted messages the tone model scored, and how many of them read as low mood. */
    val toneScored: Int = 0,
    val lowMood: Int = 0,
) {
    fun plus(stats: MessageStats, lowMoodResult: Boolean?): KeyboardDay = copy(
        messages = messages + 1,
        chars = chars + stats.chars,
        corrections = corrections + stats.corrections,
        gaps = gaps + stats.gaps,
        pauses = pauses + stats.pauses,
        speedChars = speedChars + stats.speedChars,
        speedMs = speedMs + stats.speedMs,
        toneScored = toneScored + if (lowMoodResult == null) 0 else 1,
        lowMood = lowMood + if (lowMoodResult == true) 1 else 0,
    )

    /** Characters a minute while typing steadily. Pauses are left out; they have their own share. */
    val charsPerMinute: Double? get() = if (speedMs > 0) speedChars * 60_000.0 / speedMs else null

    val pauseShare: Double? get() = if (gaps > 0) pauses.toDouble() / gaps else null

    /** Share of key presses that were delete: corrections / (characters typed + corrections), 0 to 1. */
    val correctionShare: Double? get() =
        if (chars + corrections > 0) corrections.toDouble() / (chars + corrections) else null

    val lowMoodShare: Double? get() = if (toneScored > 0) lowMood.toDouble() / toneScored else null
}

/** The answer to "Are you safe right now?". Null means it was not answered, or not asked. */
enum class SafeAnswer(val wire: String) {
    YES("yes"),
    NO("no"),
    ;

    companion object {
        fun fromWire(value: String?): SafeAnswer? = entries.firstOrNull { it.wire == value }
    }
}

/** A self-harm match. The id is random, so it says nothing about the words. */
data class Flag(val id: String, val time: Instant, val level: SelfHarmLevel, val answer: SafeAnswer? = null) {
    companion object {
        private val random = SecureRandom()

        /** SHA-256 of 16 random bytes, first 16 hex characters. Never derived from the text. */
        fun newId(): String {
            val bytes = ByteArray(16).also { random.nextBytes(it) }
            val hash = MessageDigest.getInstance("SHA-256").digest(bytes)
            return hash.take(8).joinToString("") { "%02x".format(it) }
        }
    }
}

/** Everything the keyboard keeps: daily sums and flags. Stored in the app's private files. */
data class KeyboardLog(val days: List<KeyboardDay> = emptyList(), val flags: List<Flag> = emptyList()) {

    /** Adds a message that ended. Only counted messages go into the sums; others only mark the day active. */
    fun withMessage(date: LocalDate, stats: MessageStats, lowMood: Boolean?, counted: Boolean = true): KeyboardLog {
        if (!counted) return withActiveDay(date)
        val day = (days.firstOrNull { it.date == date } ?: KeyboardDay(date)).plus(stats, lowMood)
        return copy(days = (days.filter { it.date != date } + day).sortedBy { it.date })
    }

    /** The keyboard was open on [date]. Gives the day kb_messages 0 if nothing else happens. */
    fun withActiveDay(date: LocalDate): KeyboardLog =
        if (days.any { it.date == date }) this else copy(days = (days + KeyboardDay(date)).sortedBy { it.date })

    fun withFlag(flag: Flag): KeyboardLog = copy(flags = (flags + flag).sortedBy { it.time })

    fun withAnswer(id: String, answer: SafeAnswer): KeyboardLog =
        copy(flags = flags.map { if (it.id == id) it.copy(answer = answer) else it })

    /** Drops anything older than [keepFrom]. */
    fun pruned(keepFrom: LocalDate, keepFlagsFrom: Instant): KeyboardLog =
        KeyboardLog(days.filter { it.date >= keepFrom }, flags.filter { !it.time.isBefore(keepFlagsFrom) })

    fun toJson(): String {
        val dayList = JSONArray()
        for (d in days) {
            val o = JSONObject()
            o.put("date", d.date.toString())
            o.put("messages", d.messages)
            o.put("chars", d.chars)
            o.put("corrections", d.corrections)
            o.put("gaps", d.gaps)
            o.put("pauses", d.pauses)
            o.put("speed_chars", d.speedChars)
            o.put("speed_ms", d.speedMs)
            o.put("tone_scored", d.toneScored)
            o.put("low_mood", d.lowMood)
            dayList.put(o)
        }
        val flagList = JSONArray()
        for (f in flags) {
            val o = JSONObject()
            o.put("id", f.id)
            o.put("time", f.time.toString())
            o.put("level", f.level.wire)
            o.put("answer", f.answer?.wire ?: JSONObject.NULL)
            flagList.put(o)
        }
        val root = JSONObject()
        root.put("version", 1)
        root.put("days", dayList)
        root.put("flags", flagList)
        return root.toString()
    }

    companion object {
        fun fromJson(json: String): KeyboardLog {
            val root = JSONObject(json)
            val dayList = root.getJSONArray("days")
            val days = (0 until dayList.length()).map { i ->
                val o = dayList.getJSONObject(i)
                KeyboardDay(
                    date = LocalDate.parse(o.getString("date")),
                    messages = o.getInt("messages"),
                    chars = o.getInt("chars"),
                    corrections = o.getInt("corrections"),
                    gaps = o.getInt("gaps"),
                    pauses = o.getInt("pauses"),
                    speedChars = o.getInt("speed_chars"),
                    speedMs = o.getLong("speed_ms"),
                    toneScored = o.getInt("tone_scored"),
                    lowMood = o.getInt("low_mood"),
                )
            }
            val flagList = root.getJSONArray("flags")
            val flags = (0 until flagList.length()).map { i ->
                val o = flagList.getJSONObject(i)
                val level = SelfHarmLevel.entries.first { it.wire == o.getString("level") }
                // Files written before answers existed have no "answer" key.
                val answer = if (o.has("answer") && !o.isNull("answer")) SafeAnswer.fromWire(o.getString("answer")) else null
                Flag(o.getString("id"), Instant.parse(o.getString("time")), level, answer)
            }
            return KeyboardLog(days, flags)
        }
    }
}
