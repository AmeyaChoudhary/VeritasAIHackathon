package app.steady.screentime

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity

/**
 * The full-screen help screen. The keyboard opens it on a self-harm match, and the keyboard's
 * own 988 key opens it too.
 *
 * - "plan" words: 911 and 988 at once, with no question.
 * - other self-harm words ("concern"): "Are you safe right now?" with Yes and No, and 988 on the
 *   same screen the whole time. "No" adds 911. The answer is saved on the flag as "yes" or "no".
 *
 * It never shows or receives the words that were typed. The buttons open the dialer and the
 * messages app with the number filled in. ACTION_DIAL and ACTION_SENDTO need no permission;
 * the teen still taps call or send.
 */
class CrisisActivity : ComponentActivity() {

    private var mode = HelpMode.HELP
    private var flagId: String? = null
    private var answer: SafeAnswer? = null
    private lateinit var scroll: ScrollView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        scroll = ScrollView(this).apply { setBackgroundColor(Color.WHITE) }
        EdgeToEdge.setUp(this, scroll)
        setContentView(scroll)
        if (savedInstanceState != null) {
            mode = HelpMode.fromWire(savedInstanceState.getString(STATE_MODE))
            flagId = savedInstanceState.getString(STATE_FLAG)
            answer = SafeAnswer.fromWire(savedInstanceState.getString(STATE_ANSWER))
            render()
        } else {
            arrive(intent)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(STATE_MODE, mode.wire)
        outState.putString(STATE_FLAG, flagId)
        outState.putString(STATE_ANSWER, answer?.wire)
    }

    // The activity is singleTask, so a second match while it is open arrives here.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        arrive(intent)
    }

    private fun arrive(intent: Intent) {
        val incoming = HelpMode.fromWire(intent.getStringExtra(EXTRA_MODE))
        val next = HelpScreen.stronger(mode, incoming)
        // A new concern match gets its own question; the answer belongs to that flag.
        if (incoming == HelpMode.CONCERN && next == HelpMode.CONCERN) {
            flagId = intent.getStringExtra(EXTRA_FLAG_ID)
            answer = null
        }
        mode = next
        render()
    }

    private fun answered(value: SafeAnswer) {
        answer = value
        flagId?.let { KeyboardStore.recordAnswer(this, it, value) }
        render()
    }

    private fun render() {
        val content = HelpScreen.content(mode, answer)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(32), dp(24), dp(32))
        }
        column.addView(text(R.string.crisis_title, 28f, bold = true))
        if (content.askSafe) {
            column.addView(text(R.string.crisis_safe_question, 22f, bold = true, top = 20))
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            row.addView(button(R.string.crisis_safe_yes, weight = 1f) { answered(SafeAnswer.YES) })
            row.addView(button(R.string.crisis_safe_no, weight = 1f) { answered(SafeAnswer.NO) })
            column.addView(row)
        }
        if (content.thanks) column.addView(text(R.string.crisis_thanks, 18f, top = 20))
        if (content.show911) {
            column.addView(text(R.string.crisis_911_body, 18f, top = 20))
            column.addView(button(R.string.crisis_call_911, urgent = true) { open(Intent.ACTION_DIAL, "tel:911") })
        }
        column.addView(text(R.string.crisis_988_body, 18f, top = 24))
        column.addView(button(R.string.crisis_call_988, urgent = !content.show911) { open(Intent.ACTION_DIAL, "tel:988") })
        column.addView(button(R.string.crisis_text_988) { open(Intent.ACTION_SENDTO, "smsto:988") })
        column.addView(text(R.string.crisis_after, 16f, top = 24))
        column.addView(button(R.string.crisis_close) { finish() })
        scroll.removeAllViews()
        scroll.addView(column)
    }

    private fun open(action: String, uri: String) {
        try {
            startActivity(Intent(action, Uri.parse(uri)))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.crisis_no_app, Toast.LENGTH_LONG).show()
        }
    }

    private fun text(res: Int, sizeSp: Float, bold: Boolean = false, top: Int = 0) = TextView(this).apply {
        setText(res)
        setTextColor(Color.BLACK)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setLineSpacing(0f, 1.15f)
        setPadding(0, dp(top), 0, 0)
    }

    private fun button(res: Int, urgent: Boolean = false, weight: Float = 0f, onClick: () -> Unit) = Button(this).apply {
        setText(res)
        setAllCaps(false)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
        if (urgent) {
            setBackgroundColor(Color.rgb(0x9B, 0x1C, 0x1C))
            setTextColor(Color.WHITE)
        }
        setOnClickListener { onClick() }
        val width = if (weight > 0f) 0 else ViewGroup.LayoutParams.MATCH_PARENT
        layoutParams = LinearLayout.LayoutParams(width, dp(64), weight).apply {
            topMargin = dp(12)
            if (weight > 0f) {
                marginStart = dp(4)
                marginEnd = dp(4)
            }
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        const val EXTRA_MODE = "mode"
        const val EXTRA_FLAG_ID = "flag"
        private const val STATE_MODE = "mode"
        private const val STATE_FLAG = "flag"
        private const val STATE_ANSWER = "answer"

        fun intent(context: Context, mode: HelpMode, flagId: String?): Intent =
            Intent(context, CrisisActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(EXTRA_MODE, mode.wire)
                .putExtra(EXTRA_FLAG_ID, flagId)
    }
}
