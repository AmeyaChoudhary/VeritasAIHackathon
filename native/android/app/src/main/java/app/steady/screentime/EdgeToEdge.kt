package app.steady.screentime

import android.graphics.Color
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Every screen draws edge to edge on every Android version, the way Android 15 and 16 force for
 * apps targeting API 35 and 36. The root view is then padded by the system bars and any display
 * cutout, so no text sits under the status bar, the navigation bar or a camera hole.
 * https://developer.android.com/develop/ui/views/layout/edge-to-edge
 * The app's screens are light, so the bar icons are kept dark in dark mode too.
 */
object EdgeToEdge {
    fun setUp(activity: ComponentActivity, root: View) {
        val light = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        activity.enableEdgeToEdge(statusBarStyle = light, navigationBarStyle = light)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
    }
}
