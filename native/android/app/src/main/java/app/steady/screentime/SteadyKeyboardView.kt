package app.steady.screentime

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/** A plain QWERTY keyboard with a numbers and symbols page. It only reports key presses. */
@SuppressLint("ViewConstructor")
class SteadyKeyboardView(context: Context, private val listener: Listener) : LinearLayout(context) {

    interface Listener {
        fun onText(text: String)
        fun onBackspace()
        fun onEnter()
        fun onSwitchKeyboard()
        fun onShowKeyboardPicker()

        /** The small 988 key above the letters. */
        fun onHelp()
    }

    enum class Shift { OFF, ONCE, LOCKED }

    private val letterKeys = mutableListOf<TextView>()
    private lateinit var shiftButton: TextView
    private val enterKeys = mutableListOf<TextView>()
    private val lettersPage: LinearLayout
    private val symbolsPage: LinearLayout
    private val helpKey: TextView
    private var lastShiftTap = 0L
    private val repeatDelete = object : Runnable {
        override fun run() {
            listener.onBackspace()
            postDelayed(this, REPEAT_MS)
        }
    }

    var shift: Shift = Shift.OFF
        set(value) {
            field = value
            refreshLetters()
        }

    init {
        orientation = VERTICAL
        setBackgroundColor(BACKGROUND)
        setPadding(dp(3), dp(6), dp(3), dp(6))

        // A small 988 key, always there. If Android blocks the help screen from opening on its
        // own, this key turns red so the teen can open it with one tap.
        helpKey = key(context.getString(R.string.key_help), 0f, special = true, textSp = 14f) { listener.onHelp() }.apply {
            contentDescription = context.getString(R.string.key_help_description)
            setTextColor(ALERT)
            layoutParams = LayoutParams(dp(72), LayoutParams.MATCH_PARENT).apply { setMargins(dp(3), dp(2), dp(3), dp(2)) }
        }
        addView(
            LinearLayout(context).apply {
                orientation = HORIZONTAL
                layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(HELP_ROW_DP))
                addView(spacer(1f))
                addView(helpKey)
            },
        )

        lettersPage = page(
            row(LETTERS_1.map { letter(it) }),
            row(listOf(spacer(0.5f)) + LETTERS_2.map { letter(it) } + spacer(0.5f)),
            row(listOf(shiftKey()) + LETTERS_3.map { letter(it) } + backspaceKey()),
            bottomRow(context.getString(R.string.key_symbols)) { showSymbols(true) },
        )
        symbolsPage = page(
            row(SYMBOLS_1.map { symbol(it) }),
            row(SYMBOLS_2.map { symbol(it) }),
            row(SYMBOLS_3.map { symbol(it) } + backspaceKey()),
            bottomRow(context.getString(R.string.key_letters)) { showSymbols(false) },
        )
        addView(lettersPage)
        addView(symbolsPage)
        showSymbols(false)

        // Keep the keys above the navigation bar on phones that draw the keyboard behind it.
        ViewCompat.setOnApplyWindowInsetsListener(this) { view, insets ->
            val bottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            view.setPadding(dp(3), dp(6), dp(3), dp(6) + bottom)
            insets
        }
    }

    fun showSymbols(symbols: Boolean) {
        lettersPage.visibility = if (symbols) GONE else VISIBLE
        symbolsPage.visibility = if (symbols) VISIBLE else GONE
    }

    /** Red while a self-harm match is waiting for the teen to open the help screen. */
    fun setHelpAlert(on: Boolean) {
        helpKey.background = if (on) solid(ALERT) else keyBackground(special = true)
        helpKey.setTextColor(if (on) Color.WHITE else ALERT)
    }

    fun setEnterLabel(label: String) {
        for (key in enterKeys) key.text = label
    }

    /** Sentence starts turn shift on for one letter, unless caps lock is on. */
    fun setAutoShift(on: Boolean) {
        if (shift != Shift.LOCKED) shift = if (on) Shift.ONCE else Shift.OFF
    }

    private fun refreshLetters() {
        val upper = shift != Shift.OFF
        for (key in letterKeys) {
            val base = key.tag as String
            key.text = if (upper) base.uppercase() else base
        }
        if (::shiftButton.isInitialized) {
            shiftButton.text = if (shift == Shift.LOCKED) "⇪" else "⇧"
            shiftButton.isSelected = shift != Shift.OFF
        }
    }

    private fun page(vararg rows: LinearLayout) = LinearLayout(context).apply {
        orientation = VERTICAL
        rows.forEach { addView(it) }
    }

    private fun row(keys: List<View>) = LinearLayout(context).apply {
        orientation = HORIZONTAL
        layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, dp(KEY_HEIGHT_DP))
        keys.forEach { addView(it) }
    }

    private fun bottomRow(pageLabel: String, onPage: () -> Unit): LinearLayout {
        val enter = key(context.getString(R.string.key_enter), 1.6f, special = true) { listener.onEnter() }
        enter.contentDescription = context.getString(R.string.key_enter_description)
        enterKeys += enter
        val switchKey = key("🌐", 1f, special = true) { listener.onSwitchKeyboard() }.apply {
            contentDescription = context.getString(R.string.key_switch_description)
            setOnLongClickListener {
                listener.onShowKeyboardPicker()
                true
            }
        }
        return row(
            listOf(
                key(pageLabel, 1.4f, special = true, textSp = 15f) { onPage() },
                switchKey,
                key(",", 1f) { listener.onText(",") },
                key(context.getString(R.string.key_space), 4f, textSp = 14f) { listener.onText(" ") }.apply {
                    contentDescription = context.getString(R.string.key_space_description)
                },
                key(".", 1f) { listener.onText(".") },
                enter,
            ),
        )
    }

    private fun letter(base: String): TextView =
        key(base, 1f) {
            val text = if (shift != Shift.OFF) base.uppercase() else base
            if (shift == Shift.ONCE) shift = Shift.OFF
            listener.onText(text)
        }.also {
            it.tag = base
            letterKeys += it
        }

    private fun symbol(text: String): TextView = key(text, 1f) { listener.onText(text) }

    private fun shiftKey(): TextView =
        key("⇧", 1.5f, special = true) {
            val now = SystemClock.uptimeMillis()
            shift = when {
                shift == Shift.LOCKED -> Shift.OFF
                shift == Shift.ONCE && now - lastShiftTap < DOUBLE_TAP_MS -> Shift.LOCKED
                shift == Shift.ONCE -> Shift.OFF
                else -> Shift.ONCE
            }
            lastShiftTap = now
        }.also {
            it.contentDescription = context.getString(R.string.key_shift_description)
            shiftButton = it
        }

    /** Deletes once on touch, then repeats while held. */
    @SuppressLint("ClickableViewAccessibility")
    private fun backspaceKey(): TextView =
        key("⌫", 1.5f, special = true) { }.apply {
            contentDescription = context.getString(R.string.key_delete_description)
            setOnClickListener(null)
            setOnTouchListener { view, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        view.isPressed = true
                        view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
                        listener.onBackspace()
                        postDelayed(repeatDelete, FIRST_REPEAT_MS)
                    }
                    MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                        view.isPressed = false
                        removeCallbacks(repeatDelete)
                    }
                }
                true
            }
        }

    private fun spacer(weight: Float) = View(context).apply {
        layoutParams = LayoutParams(0, LayoutParams.MATCH_PARENT, weight)
    }

    private fun key(
        label: String,
        weight: Float,
        special: Boolean = false,
        textSp: Float = 20f,
        onClick: () -> Unit,
    ): TextView = TextView(context).apply {
        text = label
        gravity = Gravity.CENTER
        setTextColor(Color.BLACK)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, textSp)
        background = keyBackground(special)
        isClickable = true
        isFocusable = false
        layoutParams = LayoutParams(0, LayoutParams.MATCH_PARENT, weight).apply {
            setMargins(dp(3), dp(4), dp(3), dp(4))
        }
        setOnClickListener {
            it.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
            onClick()
        }
    }

    private fun solid(color: Int) = GradientDrawable().apply {
        cornerRadius = dp(6).toFloat()
        setColor(color)
    }

    private fun keyBackground(special: Boolean): StateListDrawable =
        StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_pressed), solid(KEY_PRESSED))
            addState(intArrayOf(android.R.attr.state_selected), solid(KEY_PRESSED))
            addState(intArrayOf(), solid(if (special) KEY_SPECIAL else KEY))
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val KEY_HEIGHT_DP = 54
        const val HELP_ROW_DP = 32
        const val FIRST_REPEAT_MS = 400L
        const val REPEAT_MS = 60L
        const val DOUBLE_TAP_MS = 400L
        val BACKGROUND = Color.rgb(0xE4, 0xE7, 0xEB)
        val KEY = Color.WHITE
        val KEY_SPECIAL = Color.rgb(0xC9, 0xCE, 0xD6)
        val KEY_PRESSED = Color.rgb(0xA9, 0xB0, 0xBB)
        val ALERT = Color.rgb(0x9B, 0x1C, 0x1C)

        val LETTERS_1 = "qwertyuiop".map { it.toString() }
        val LETTERS_2 = "asdfghjkl".map { it.toString() }
        val LETTERS_3 = "zxcvbnm".map { it.toString() }
        val SYMBOLS_1 = "1234567890".map { it.toString() }
        val SYMBOLS_2 = listOf("@", "#", "$", "%", "&", "-", "+", "(", ")", "/")
        val SYMBOLS_3 = listOf("*", "\"", "'", ":", ";", "!", "?", "_")
    }
}
