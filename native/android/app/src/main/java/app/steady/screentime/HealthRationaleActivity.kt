package app.steady.screentime

import android.graphics.Typeface
import android.os.Bundle
import android.util.TypedValue
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity

/**
 * What Health Connect opens when the teen taps the privacy policy link on its permission screen.
 * The manifest wires it to ACTION_SHOW_PERMISSIONS_RATIONALE (Android 13 and lower) and, through
 * an activity alias, to VIEW_PERMISSION_USAGE (Android 14 and higher), as the guide asks.
 * https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
 * A store build must show the same privacy policy as its Play Console listing.
 */
class HealthRationaleActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(32))
        }
        column.addView(text(R.string.health_policy_title, 22f, bold = true))
        for (res in listOf(
            R.string.health_policy_reads,
            R.string.health_policy_keeps,
            R.string.health_policy_leaves,
            R.string.health_policy_stop,
        )) {
            column.addView(text(res, 16f, top = 12))
        }
        val scroll = ScrollView(this).apply { addView(column) }
        EdgeToEdge.setUp(this, scroll)
        setContentView(scroll)
    }

    private fun text(res: Int, sizeSp: Float, bold: Boolean = false, top: Int = 0) = TextView(this).apply {
        setText(res)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        setTextColor(TEXT_COLOR)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setLineSpacing(0f, 1.15f)
        setPadding(0, dp(top), 0, 0)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
