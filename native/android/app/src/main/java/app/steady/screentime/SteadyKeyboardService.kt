package app.steady.screentime

import android.inputmethodservice.InputMethodService
import android.os.Build
import android.os.SystemClock
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The Stability keyboard.
 *
 * What it keeps: daily sums (counted messages, typing speed, pauses, corrections, how many
 * messages read as low mood) and, for a self-harm match, a random id, the time, the level and
 * the answer to "Are you safe right now?". What it never keeps: the words. The message being
 * typed lives in [buffer], in memory, until the message ends. Then it is checked once and
 * dropped. The app has no internet permission.
 *
 * A message ends on enter or send, when the field loses focus, when the app restarts input
 * and the message is gone from the field, or when the app empties the field itself, as chat
 * apps do after their own send button. Deleting everything is a discard: it is checked for
 * self-harm words but not counted.
 *
 * https://developer.android.com/develop/ui/views/touch-and-input/creating-input-method
 */
class SteadyKeyboardService : InputMethodService(), SteadyKeyboardView.Listener {

    private var keyboard: SteadyKeyboardView? = null
    private val worker: ExecutorService = Executors.newSingleThreadExecutor()

    /** The tone model is large, so it loads on [worker] and is only read there. */
    @Volatile
    private var tone: ToneModel? = null

    /** The phrase list is small and is checked on the main thread, before anything is saved. */
    private var selfHarm: SelfHarmCheck? = null

    private val buffer = MessageBuffer()
    private val cursor = FieldCursor()
    private val rhythm = MessageRecorder()

    /** False in password, incognito and other skipped fields. */
    private var watching = false
    private var inputType = 0
    private var lastKeyWasDelete = false
    private var lastActiveDay: LocalDate? = null

    /** A match whose help screen Android may have blocked. The keyboard's 988 key opens it. */
    private var pendingHelp: Pair<HelpMode, String>? = null

    override fun onCreate() {
        super.onCreate()
        selfHarm = runCatching { SelfHarmCheck.fromJson(asset("selfharm_phrases.json")) }.getOrNull()
        worker.execute { tone = runCatching { ToneModel.fromJson(asset("tone.json")) }.getOrNull() }
        KeyboardNotice.show(this)
    }

    override fun onDestroy() {
        finish(EndReason.FOCUS_LOST)
        worker.shutdown()
        KeyboardNotice.hide(this)
        super.onDestroy()
    }

    override fun onCreateInputView(): View = SteadyKeyboardView(this, this).also {
        keyboard = it
        it.setHelpAlert(pendingHelp != null)
    }

    // Always draw the keys under the app, never the full-screen text box Android uses when the phone is sideways.
    override fun onEvaluateFullscreenMode(): Boolean = false

    override fun onStartInput(attribute: EditorInfo, restarting: Boolean) {
        super.onStartInput(attribute, restarting)
        val nowWatching = FieldRules.isWatched(attribute.inputType, attribute.imeOptions)
        // Some apps restart input in the middle of typing. The message carries on if it is still
        // in the field just before the cursor, and ends only when it is gone.
        if (restarting && nowWatching && !buffer.isEmpty) {
            val before = runCatching { currentInputConnection?.getTextBeforeCursor(buffer.length, 0) }.getOrNull()
            if (buffer.survivesRestart(before)) {
                cursor.reset(attribute.initialSelStart, attribute.initialSelEnd)
                if (attribute.initialSelStart >= 0) buffer.rebase(attribute.initialSelStart)
                inputType = attribute.inputType
                watching = true
                return
            }
        }
        finish(if (restarting) EndReason.RESTARTED else EndReason.FOCUS_LOST)
        watching = nowWatching
        inputType = attribute.inputType
        cursor.reset(attribute.initialSelStart, attribute.initialSelEnd)
    }

    override fun onStartInputView(info: EditorInfo, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        keyboard?.apply {
            showSymbols(isNumberField(info))
            setEnterLabel(enterLabel(info))
        }
        updateAutoShift()
        val today = LocalDate.now()
        if (lastActiveDay != today) {
            lastActiveDay = today
            KeyboardStore.markActive(this, today)
        }
        KeyboardNotice.show(this)
    }

    override fun onFinishInput() {
        finish(EndReason.FOCUS_LOST)
        super.onFinishInput()
    }

    override fun onUpdateSelection(
        oldSelStart: Int,
        oldSelEnd: Int,
        newSelStart: Int,
        newSelEnd: Int,
        candidatesStart: Int,
        candidatesEnd: Int,
    ) {
        super.onUpdateSelection(oldSelStart, oldSelEnd, newSelStart, newSelEnd, candidatesStart, candidatesEnd)
        val selectionWasRange = cursor.hasSelection
        val external = cursor.onUpdate(newSelStart, newSelEnd)
        if (!watching || !buffer.hasContent || newSelStart != 0 || newSelEnd != 0) return
        if (!external && !lastKeyWasDelete) return
        val ic = currentInputConnection ?: return
        val empty = ic.getTextBeforeCursor(1, 0).isNullOrEmpty() && ic.getTextAfterCursor(1, 0).isNullOrEmpty()
        if (empty) finish(ClearRules.onFieldEmptied(lastKeyWasDelete, selectionWasRange))
    }

    // Keys

    override fun onText(text: String) {
        val ic = currentInputConnection ?: return
        val start = cursor.start
        val end = cursor.end
        ic.commitText(text, 1)
        cursor.expect(start + text.length, start + text.length)
        if (watching) {
            buffer.typed(text, start, end)
            rhythm.onCharacter(SystemClock.uptimeMillis())
        }
        lastKeyWasDelete = false
        if (!text[0].isLetter()) updateAutoShift()
    }

    override fun onBackspace() {
        currentInputConnection ?: return
        val start = cursor.start
        val end = cursor.end
        // A key event deletes a selection too, the same as a hardware keyboard.
        sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL)
        if (start != end) {
            if (watching) buffer.deletedRange(start, end)
            cursor.expect(start, start)
        } else if (start > 0) {
            val removed = if (watching) buffer.deletedBefore(start) else 1
            cursor.expect(start - removed, start - removed)
        }
        if (watching) rhythm.onCorrection(SystemClock.uptimeMillis())
        lastKeyWasDelete = true
        updateAutoShift()
    }

    override fun onEnter() {
        val ic = currentInputConnection ?: return
        val info = currentInputEditorInfo ?: return
        if (FieldRules.enterEndsMessage(info.inputType, info.imeOptions)) finish(FieldRules.enterReason(info.imeOptions))
        val action = FieldRules.enterAction(info.imeOptions)
        if (action != null) {
            ic.performEditorAction(action)
        } else {
            val start = cursor.start
            val end = cursor.end
            sendDownUpKeyEvents(KeyEvent.KEYCODE_ENTER)
            // In a multi-line field this types a newline, which stays part of the message.
            if (FieldRules.isMultiLine(info.inputType)) {
                cursor.expect(start + 1, start + 1)
                if (watching) {
                    buffer.typed("\n", start, end)
                    rhythm.onCharacter(SystemClock.uptimeMillis())
                }
            }
        }
        lastKeyWasDelete = false
        updateAutoShift()
    }

    override fun onSwitchKeyboard() {
        // Android asks every keyboard to offer a way to the next one.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (!switchToNextInputMethod(false)) onShowKeyboardPicker()
        } else {
            onShowKeyboardPicker()
        }
    }

    override fun onShowKeyboardPicker() {
        getSystemService(InputMethodManager::class.java)?.showInputMethodPicker()
    }

    /** The teen tapped 988. A tap is the teen's own action, so Android lets the screen open. */
    override fun onHelp() {
        val (mode, id) = pendingHelp ?: (HelpMode.HELP to null)
        pendingHelp = null
        keyboard?.setHelpAlert(false)
        runCatching { startActivity(CrisisActivity.intent(this, mode, id)) }
    }

    // Messages

    private fun finish(reason: EndReason) {
        val text = buffer.current
        val peak = buffer.peak
        buffer.clear()
        val stats = rhythm.finish()
        lastKeyWasDelete = false
        if (text.isBlank() && peak.isBlank()) return
        val counted = FieldRules.isCounted(inputType, reason)
        val endedAt = Instant.now()
        MessageEndFlow(
            check = { selfHarm?.check(it) },
            openHelp = { found, id -> openHelp(HelpMode.of(found), id) },
            recordFlag = { KeyboardStore.recordFlag(this, it) },
            scoreLater = { words, isCounted ->
                // Tone runs on every watched message; only counted ones enter the day's sums.
                worker.execute {
                    val low = runCatching { tone?.isLowMood(words) }.getOrNull()
                    KeyboardStore.recordMessage(this, endedAt, stats, low, isCounted)
                }
            },
        ).end(text, peak, reason, counted)
    }

    private fun openHelp(mode: HelpMode, flagId: String) {
        pendingHelp = mode to flagId
        keyboard?.setHelpAlert(true)
        // Android lets this open while the keyboard is on screen. If it is blocked, the red 988
        // key on the keyboard opens the same screen with one tap.
        runCatching { startActivity(CrisisActivity.intent(this, mode, flagId)) }
    }

    // Helpers

    private fun updateAutoShift() {
        val info = currentInputEditorInfo ?: return
        val ic = currentInputConnection ?: return
        keyboard?.setAutoShift(ic.getCursorCapsMode(info.inputType) != 0)
    }

    private fun isNumberField(info: EditorInfo): Boolean =
        when (info.inputType and android.text.InputType.TYPE_MASK_CLASS) {
            android.text.InputType.TYPE_CLASS_NUMBER,
            android.text.InputType.TYPE_CLASS_PHONE,
            android.text.InputType.TYPE_CLASS_DATETIME,
            -> true
            else -> false
        }

    private fun enterLabel(info: EditorInfo): String {
        info.actionLabel?.let { if (it.isNotEmpty()) return it.toString() }
        return when (FieldRules.enterAction(info.imeOptions)) {
            EditorInfo.IME_ACTION_GO -> getString(R.string.key_go)
            EditorInfo.IME_ACTION_SEARCH -> getString(R.string.key_search)
            EditorInfo.IME_ACTION_SEND -> getString(R.string.key_send)
            EditorInfo.IME_ACTION_NEXT -> getString(R.string.key_next)
            EditorInfo.IME_ACTION_DONE -> getString(R.string.key_done)
            EditorInfo.IME_ACTION_PREVIOUS -> getString(R.string.key_previous)
            else -> getString(R.string.key_enter)
        }
    }

    private fun asset(name: String): String = assets.open(name).bufferedReader().use { it.readText() }
}
