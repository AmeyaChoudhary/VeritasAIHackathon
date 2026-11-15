package app.steady.screentime

import android.text.InputType
import android.view.inputmethod.EditorInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FieldRulesTest {
    private val text = InputType.TYPE_CLASS_TEXT

    @Test
    fun messageFieldsAreWatched() {
        assertTrue(FieldRules.isWatched(text, 0))
        assertTrue(FieldRules.isWatched(text or InputType.TYPE_TEXT_VARIATION_SHORT_MESSAGE or InputType.TYPE_TEXT_FLAG_MULTI_LINE, 0))
        assertTrue(FieldRules.isWatched(text or InputType.TYPE_TEXT_VARIATION_LONG_MESSAGE, EditorInfo.IME_ACTION_SEND))
    }

    @Test
    fun passwordsAndOtherSensitiveFieldsAreSkipped() {
        for (variation in listOf(
            InputType.TYPE_TEXT_VARIATION_PASSWORD,
            InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
            InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
            InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,
            InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS,
            InputType.TYPE_TEXT_VARIATION_URI,
            InputType.TYPE_TEXT_VARIATION_PERSON_NAME,
            InputType.TYPE_TEXT_VARIATION_POSTAL_ADDRESS,
            InputType.TYPE_TEXT_VARIATION_FILTER,
            InputType.TYPE_TEXT_VARIATION_PHONETIC,
        )) {
            assertFalse("variation $variation", FieldRules.isWatched(text or variation, 0))
        }
        assertFalse(FieldRules.isWatched(InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD, 0))
        assertFalse(FieldRules.isWatched(InputType.TYPE_CLASS_NUMBER, 0))
        assertFalse(FieldRules.isWatched(InputType.TYPE_CLASS_PHONE, 0))
        assertFalse(FieldRules.isWatched(InputType.TYPE_CLASS_DATETIME, 0))
        assertFalse(FieldRules.isWatched(InputType.TYPE_NULL, 0))
    }

    @Test
    fun incognitoFieldsAreSkipped() {
        assertFalse(FieldRules.isWatched(text, EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING))
        assertFalse(
            FieldRules.isWatched(
                text or InputType.TYPE_TEXT_VARIATION_SHORT_MESSAGE,
                EditorInfo.IME_ACTION_SEND or EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING,
            ),
        )
    }

    @Test
    fun enterEndsAMessageUnlessItIsANewline() {
        val multi = text or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        assertEquals(EditorInfo.IME_ACTION_SEND, FieldRules.enterAction(EditorInfo.IME_ACTION_SEND))
        assertTrue(FieldRules.enterEndsMessage(multi, EditorInfo.IME_ACTION_SEND))
        assertTrue(FieldRules.enterEndsMessage(text, EditorInfo.IME_ACTION_UNSPECIFIED))
        assertNull(FieldRules.enterAction(EditorInfo.IME_ACTION_SEND or EditorInfo.IME_FLAG_NO_ENTER_ACTION))
        assertFalse(FieldRules.enterEndsMessage(multi, EditorInfo.IME_ACTION_SEND or EditorInfo.IME_FLAG_NO_ENTER_ACTION))
        assertFalse(FieldRules.enterEndsMessage(multi, EditorInfo.IME_ACTION_NONE))
    }
}
