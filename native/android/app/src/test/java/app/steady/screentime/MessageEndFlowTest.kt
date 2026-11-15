package app.steady.screentime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.time.Instant
import java.time.LocalDate

// Item E: the help screen opens before anything is written, and no failure reaches the keyboard.
class MessageEndFlowTest {
    private val calls = mutableListOf<String>()

    private fun flow(recordFlag: (Flag) -> Unit = { calls += "flag" }) = MessageEndFlow(
        check = { TestFiles.selfHarm.check(it) },
        openHelp = { level, _ -> calls += "help:${level.wire}" },
        recordFlag = recordFlag,
        scoreLater = { _, counted -> calls += "score:$counted" },
        newId = { "0123456789abcdef" },
        now = { Instant.parse("2026-11-10T07:00:00Z") },
    )

    @Test
    fun helpOpensBeforeTheFlagIsSaved() {
        val level = flow().end("i want to die", "i want to die", EndReason.SEND, counted = true)
        assertEquals(SelfHarmLevel.CONCERN, level)
        assertEquals(listOf("help:concern", "flag", "score:true"), calls)
    }

    @Test
    fun aDiscardIsCheckedButNotScored() {
        flow().end("", "i just took all my pills", EndReason.DISCARD, counted = false)
        assertEquals(listOf("help:plan", "flag"), calls)
    }

    @Test
    fun wordsTypedAndDeletedBeforeSendingAreStillChecked() {
        flow().end("nvm", "i want to die nvm", EndReason.SEND, counted = true)
        assertEquals("help:concern", calls.first())
    }

    @Test
    fun aFailedSaveNeverThrows() {
        flow(recordFlag = { throw IllegalStateException("disk full") })
            .end("i want to die", "i want to die", EndReason.SEND, counted = true)
        assertEquals(listOf("help:concern", "score:true"), calls)
    }

    @Test
    fun anOrdinaryMessageOnlyGetsScored() {
        flow().end("see you at 5", "see you at 5", EndReason.FOCUS_LOST, counted = false)
        assertEquals(listOf("score:false"), calls)
    }

    @Test
    fun theStoreReportsFailureInsteadOfThrowing() {
        val notADirectory = Files.createTempFile("steady", ".txt").toFile()
        val store = KeyboardFileStore(File(notADirectory, "inside"))
        assertFalse(store.update { it.withActiveDay(LocalDate.now()) })
        assertEquals(KeyboardLog(), store.read())
        notADirectory.delete()
    }

    @Test
    fun theStoreSavesAndReadsBack() {
        val dir = Files.createTempDirectory("steady").toFile()
        val store = KeyboardFileStore(dir)
        val today = LocalDate.now()
        assertTrue(store.update { it.withActiveDay(today) })
        assertEquals(listOf(today), store.read().days.map { it.date })
        dir.deleteRecursively()
    }
}
