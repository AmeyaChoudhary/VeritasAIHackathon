package app.steady.screentime

import android.text.InputType
import android.view.inputmethod.EditorInfo

/**
 * Which fields the keyboard watches, and what enter does. Only int constants from the Android
 * SDK are used, and the compiler copies those in, so FieldRulesTest runs on the JVM.
 * https://developer.android.com/reference/android/text/InputType
 * https://developer.android.com/reference/android/view/inputmethod/EditorInfo
 */
object FieldRules {
    /**
     * Plain text fields only. Every password variation, email and web address fields, names,
     * postal addresses, search filters, and all number, phone and date fields are skipped.
     * The keyboard still types in them; it just does not count or score anything there.
     */
    private val WATCHED_VARIATIONS = setOf(
        InputType.TYPE_TEXT_VARIATION_NORMAL,
        InputType.TYPE_TEXT_VARIATION_SHORT_MESSAGE,
        InputType.TYPE_TEXT_VARIATION_LONG_MESSAGE,
        InputType.TYPE_TEXT_VARIATION_EMAIL_SUBJECT,
        InputType.TYPE_TEXT_VARIATION_WEB_EDIT_TEXT,
    )

    fun isWatched(inputType: Int, imeOptions: Int): Boolean {
        // The app asked for incognito typing, as private browser tabs do.
        if ((imeOptions and EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING) != 0) return false
        if ((inputType and InputType.TYPE_MASK_CLASS) != InputType.TYPE_CLASS_TEXT) return false
        return (inputType and InputType.TYPE_MASK_VARIATION) in WATCHED_VARIATIONS
    }

    /** The editor action enter should run, or null when enter types a newline or a plain enter key. */
    fun enterAction(imeOptions: Int): Int? {
        if ((imeOptions and EditorInfo.IME_FLAG_NO_ENTER_ACTION) != 0) return null
        return when (val action = imeOptions and EditorInfo.IME_MASK_ACTION) {
            EditorInfo.IME_ACTION_GO,
            EditorInfo.IME_ACTION_SEARCH,
            EditorInfo.IME_ACTION_SEND,
            EditorInfo.IME_ACTION_NEXT,
            EditorInfo.IME_ACTION_DONE,
            EditorInfo.IME_ACTION_PREVIOUS,
            -> action
            else -> null
        }
    }

    fun isMultiLine(inputType: Int): Boolean = (inputType and InputType.TYPE_TEXT_FLAG_MULTI_LINE) != 0

    /** Enter ends the message when it runs an action, or in a one-line field. In a multi-line field it is a newline. */
    fun enterEndsMessage(inputType: Int, imeOptions: Int): Boolean =
        enterAction(imeOptions) != null || !isMultiLine(inputType)

    /** Why a message ended, from the enter key. */
    fun enterReason(imeOptions: Int): EndReason =
        when (enterAction(imeOptions)) {
            EditorInfo.IME_ACTION_SEND -> EndReason.SEND
            null -> EndReason.ENTER
            else -> EndReason.OTHER_ACTION
        }

    /**
     * Whether a message counts toward kb_messages and the day's sums. Message fields always count.
     * Other watched fields count only when the message was sent: the Send key, or the app emptying
     * the field after its own send button. A search box or a note left by tapping away does not.
     * Every watched message still goes through the self-harm check.
     */
    fun isCounted(inputType: Int, reason: EndReason): Boolean {
        if (reason == EndReason.DISCARD) return false
        if (reason == EndReason.SEND || reason == EndReason.FIELD_CLEARED) return true
        if ((inputType and InputType.TYPE_MASK_CLASS) != InputType.TYPE_CLASS_TEXT) return false
        val variation = inputType and InputType.TYPE_MASK_VARIATION
        return variation == InputType.TYPE_TEXT_VARIATION_SHORT_MESSAGE ||
            variation == InputType.TYPE_TEXT_VARIATION_LONG_MESSAGE
    }
}

/** How a message ended. */
enum class EndReason {
    /** Enter ran IME_ACTION_SEND. */
    SEND,

    /** Enter ran another action, such as Done, Go or Search. */
    OTHER_ACTION,

    /** Enter in a one-line field with no action. */
    ENTER,

    /** The field lost focus. */
    FOCUS_LOST,

    /** The app restarted input and the message is no longer in the field. */
    RESTARTED,

    /** The app emptied the field, as chat apps do after their own send button. */
    FIELD_CLEARED,

    /** The teen deleted everything: checked for self-harm words, never counted. */
    DISCARD,
}
