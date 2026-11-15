package app.steady.screentime

import android.content.Context
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * keyboard.json in [dir]: the keyboard's daily sums and flags, never any text. Every method
 * catches its own errors, so a full or broken disk can never crash the keyboard.
 * No Android imports, so KeyboardFileStoreTest runs on the JVM.
 */
class KeyboardFileStore(private val dir: File, private val zone: ZoneId = ZoneId.systemDefault()) {
    private val lock = Any()

    fun read(): KeyboardLog = synchronized(lock) { load() }

    /** Returns false if the change could not be saved. Never throws. */
    fun update(change: (KeyboardLog) -> KeyboardLog): Boolean {
        synchronized(lock) {
            return try {
                val today = LocalDate.now(zone)
                val next = change(load())
                    .pruned(today.minusDays(KEEP_DAYS), Instant.now().minus(KEEP_DAYS, ChronoUnit.DAYS))
                val file = File(dir, FILE)
                val temp = File(dir, "$FILE.tmp")
                temp.writeText(next.toJson())
                if (temp.renameTo(file)) {
                    true
                } else {
                    file.delete()
                    temp.renameTo(file)
                }
            } catch (e: Exception) {
                false
            }
        }
    }

    private fun load(): KeyboardLog {
        val file = File(dir, FILE)
        return try {
            if (file.exists()) KeyboardLog.fromJson(file.readText()) else KeyboardLog()
        } catch (e: Exception) {
            // A damaged file loses the keyboard's sums. It never held any text.
            KeyboardLog()
        }
    }

    private companion object {
        const val FILE = "keyboard.json"
        const val KEEP_DAYS = 60L
    }
}

/**
 * The app's one keyboard store. Writes run in order on one background thread, so a flag is
 * always saved before the answer to its "Are you safe right now?" question. The keyboard
 * service and the app's screens run in the same process and share it.
 */
object KeyboardStore {
    private val writer: ExecutorService = Executors.newSingleThreadExecutor()

    @Volatile
    private var store: KeyboardFileStore? = null

    private fun store(context: Context): KeyboardFileStore =
        store ?: synchronized(this) {
            store ?: KeyboardFileStore(context.applicationContext.filesDir).also { store = it }
        }

    fun recordMessage(context: Context, endedAt: Instant, stats: MessageStats, lowMood: Boolean?, counted: Boolean) {
        val date = endedAt.atZone(ZoneId.systemDefault()).toLocalDate()
        write(context) { it.withMessage(date, stats, lowMood, counted) }
    }

    fun recordFlag(context: Context, flag: Flag) = write(context) { it.withFlag(flag) }

    fun recordAnswer(context: Context, id: String, answer: SafeAnswer) = write(context) { it.withAnswer(id, answer) }

    fun markActive(context: Context, date: LocalDate) = write(context) { it.withActiveDay(date) }

    fun read(context: Context): KeyboardLog = store(context).read()

    private fun write(context: Context, change: (KeyboardLog) -> KeyboardLog) {
        val target = try {
            store(context)
        } catch (e: Exception) {
            return
        }
        try {
            writer.execute { target.update(change) }
        } catch (e: Exception) {
            // The writer was shut down or refused the task. Losing one sum is better than a crash.
        }
    }
}
