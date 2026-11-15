package app.steady.screentime

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.TypedValue
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.math.roundToInt

/** Near-black text for the app's own screens. */
internal val TEXT_COLOR: Int = android.graphics.Color.rgb(0x20, 0x21, 0x24)

/**
 * One screen, built in code: what the app reads, a section for each source (screen time,
 * Health Connect, the Stability keyboard), the weeks, and Save as file.
 */
class MainActivity : ComponentActivity() {

    private class Collected(
        val days: List<DayExport>,
        val flags: List<Flag>,
        val screen: Reading?,
        val healthFailed: Boolean,
    )

    private lateinit var accessTitle: TextView
    private lateinit var accessBody: TextView
    private lateinit var grantButton: Button
    private lateinit var healthText: TextView
    private lateinit var healthConnectButton: Button
    private lateinit var healthInstallButton: Button
    private lateinit var healthManageButton: Button
    private lateinit var healthDisconnectButton: Button
    private lateinit var keyboardText: TextView
    private lateinit var keyboardOnButton: Button
    private lateinit var keyboardChooseButton: Button
    private lateinit var noticeText: TextView
    private lateinit var noticeButton: Button
    private lateinit var statusText: TextView
    private lateinit var weeksBox: LinearLayout
    private lateinit var saveButton: Button

    private var collected: Collected? = null
    private var readJob: Job? = null
    private var healthNote: Int? = null

    private val dateFormat: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)

    // Storage Access Framework "Save as". The teen picks the folder and the name.
    // https://developer.android.com/reference/androidx/activity/result/contract/ActivityResultContracts.CreateDocument
    private val saveFile = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri -> if (uri != null) writeFile(uri) }

    // Health Connect's own permission screen. If the teen has said no twice, Android stops
    // showing it and this returns at once with nothing granted.
    // https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
    // From Android 13 the keyboard's notification needs this permission.
    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) KeyboardNotice.show(this)
        showKeyboard()
    }

    private val healthPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { granted ->
        if (granted.containsAll(HealthAccess.permissions)) {
            HealthAccess.markConnected(this)
            healthNote = null
        } else {
            healthNote = R.string.health_denied
        }
        refresh()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildScreen())
    }

    override fun onResume() {
        super.onResume()
        // The teen may be coming back from Settings or Health Connect.
        refresh()
    }

    private fun refresh() {
        readJob?.cancel()
        statusText.setText(R.string.status_reading)
        saveButton.isEnabled = false
        readJob = lifecycleScope.launch {
            val usageGranted = UsageAccess.isGranted(this@MainActivity)
            val health = HealthAccess.state(applicationContext)
            showUsageAccess(usageGranted)
            showHealth(health)
            showKeyboard()
            val result = withContext(Dispatchers.IO) { collect(usageGranted, health) }
            collected = result
            show(result)
        }
    }

    private suspend fun collect(usageGranted: Boolean, health: HealthAccess.State): Collected {
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val screen = if (usageGranted) ScreenTimeRepository(applicationContext).read() else null
        var healthFailed = false
        val healthDays = if (health == HealthAccess.State.CONNECTED) {
            try {
                HealthReader(applicationContext).read(today.minusDays(WINDOW_DAYS), today)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Access removed in Health Connect, a rate limit, or Health Connect busy.
                healthFailed = true
                emptyMap()
            }
        } else {
            emptyMap()
        }
        val log = KeyboardStore.read(applicationContext)
        return Collected(
            days = DayMerge.merge(today, screen?.days.orEmpty(), healthDays, log.days, WINDOW_DAYS),
            flags = DayMerge.flagsInWindow(log.flags, today, zone, WINDOW_DAYS),
            screen = screen,
            healthFailed = healthFailed,
        )
    }

    // Sections

    private fun showUsageAccess(granted: Boolean) {
        accessTitle.setText(if (granted) R.string.access_on else R.string.access_off)
        accessBody.visibility = if (granted) View.GONE else View.VISIBLE
        grantButton.visibility = if (granted) View.GONE else View.VISIBLE
    }

    private fun showHealth(state: HealthAccess.State) {
        val base = when (state) {
            HealthAccess.State.UNAVAILABLE -> R.string.health_unavailable
            HealthAccess.State.NEEDS_INSTALL -> R.string.health_install
            HealthAccess.State.NOT_CONNECTED -> R.string.health_off
            HealthAccess.State.CONNECTED -> R.string.health_on
        }
        val note = healthNote
        healthText.text = if (note != null && state != HealthAccess.State.CONNECTED) {
            getString(base) + "\n\n" + getString(note)
        } else {
            getString(base)
        }
        healthInstallButton.visibility = visibleIf(state == HealthAccess.State.NEEDS_INSTALL)
        healthConnectButton.visibility = visibleIf(state == HealthAccess.State.NOT_CONNECTED)
        healthManageButton.visibility =
            visibleIf(state == HealthAccess.State.CONNECTED || note == R.string.health_denied)
        healthDisconnectButton.visibility = visibleIf(state == HealthAccess.State.CONNECTED)
    }

    private fun showKeyboard() {
        val imm = getSystemService(InputMethodManager::class.java)
        val enabled = imm?.enabledInputMethodList?.any { it.packageName == packageName } == true
        val current = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            imm?.currentInputMethodInfo?.packageName == packageName
        } else {
            Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
                ?.startsWith("$packageName/") == true
        }
        keyboardText.setText(
            when {
                current -> R.string.kb_active
                enabled -> R.string.kb_enabled
                else -> R.string.kb_off
            },
        )
        keyboardOnButton.visibility = visibleIf(!enabled)
        keyboardChooseButton.visibility = visibleIf(enabled && !current)
        val askNotice = enabled && !KeyboardNotice.canPost(this)
        noticeText.visibility = visibleIf(askNotice)
        noticeButton.visibility = visibleIf(askNotice)
    }

    private fun show(result: Collected) {
        weeksBox.removeAllViews()
        saveButton.isEnabled = result.days.isNotEmpty() || result.flags.isNotEmpty()

        val status = StringBuilder()
        val screen = result.screen
        if (result.days.isEmpty()) {
            status.append(getString(if (screen?.locked == true) R.string.status_locked else R.string.status_none))
        } else {
            status.append(resources.getQuantityString(R.plurals.status_days, result.days.size, result.days.size))
            if (screen != null) status.append(' ').append(getString(R.string.status_history))
        }
        if (screen != null && !screen.countedFromScreen) {
            status.append("\n\n").append(getString(R.string.status_old_android))
        }
        if (result.healthFailed) status.append("\n\n").append(getString(R.string.health_error))
        if (result.flags.isNotEmpty()) {
            status.append("\n\n")
                .append(resources.getQuantityString(R.plurals.status_flags, result.flags.size, result.flags.size))
        }
        statusText.text = status

        val numbers = NumberFormat.getIntegerInstance()
        for (week in Weeks.summarize(result.days).asReversed()) {
            weeksBox.addView(label(null, 17f, bold = true, top = 20).apply {
                text = getString(R.string.week_title, week.monday.format(dateFormat))
            })
            val lines = mutableListOf(resources.getQuantityString(R.plurals.week_days, week.days, week.days))
            if (week.days < 4) lines += getString(R.string.week_short)
            week.screenMinutesPerDay?.let { lines += getString(R.string.week_screen, duration(it)) }
            week.nightMinutesPerDay?.let { lines += getString(R.string.week_night, duration(it)) }
            week.gameMinutesPerDay?.let { games ->
                val night = week.nightGameMinutesPerDay ?: 0
                lines += getString(R.string.week_games, duration(games), duration(night))
            }
            val first = week.usualFirstUse
            val last = week.usualLastUse
            if (first != null && last != null) {
                lines += getString(R.string.week_times, ClockText.format(first), ClockText.format(last))
            }
            val sleep = week.sleepMinutesPerNight
            val bedtime = week.usualBedtime
            if (sleep != null && bedtime != null) {
                lines += getString(R.string.week_sleep, duration(sleep), ClockText.format(bedtime))
            }
            week.stepsPerDay?.let { lines += getString(R.string.week_steps, numbers.format(it)) }
            week.keyboardMessages?.let { count ->
                val messages = resources.getQuantityString(R.plurals.week_messages, count, count)
                val speed = week.charsPerMinute
                lines += if (speed != null) {
                    getString(R.string.week_keyboard_speed, messages, speed.roundToInt())
                } else {
                    getString(R.string.week_keyboard, messages)
                }
            }
            week.lowMoodShare?.let { lines += getString(R.string.week_low_mood, (it * 100).roundToInt()) }
            weeksBox.addView(label(null, top = 4).apply { text = lines.joinToString("\n") })
        }
    }

    // Actions

    private fun openUsageAccessSettings() {
        // "In some cases, a matching Activity may not exist, so ensure you safeguard against this."
        // https://developer.android.com/reference/android/provider/Settings#ACTION_USAGE_ACCESS_SETTINGS
        startOrSay(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS), R.string.access_missing)
    }

    private fun connectHealth() {
        healthNote = null
        healthPermissions.launch(HealthAccess.permissions)
    }

    private fun disconnectHealth() {
        lifecycleScope.launch {
            HealthAccess.disconnect(applicationContext)
            refresh()
        }
    }

    private fun startOrSay(intent: Intent, missing: Int) {
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            statusText.setText(missing)
        }
    }

    private fun writeFile(uri: Uri) {
        val result = collected ?: return
        val json = ExportJson.build(result.days, result.flags, Instant.now())
        lifecycleScope.launch {
            val saved = withContext(Dispatchers.IO) {
                runCatching {
                    val out = contentResolver.openOutputStream(uri) ?: error("No output stream")
                    out.use { it.write(json.toByteArray(Charsets.UTF_8)) }
                }.isSuccess
            }
            Toast.makeText(
                this@MainActivity,
                if (saved) R.string.saved else R.string.save_failed,
                Toast.LENGTH_SHORT,
            ).show()
        }
    }

    // Layout

    private fun buildScreen(): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(32))
        }

        column.addView(label(R.string.app_name, 24f, bold = true))
        column.addView(label(R.string.intro_heading, 18f, bold = true, top = 16))
        for (res in listOf(
            R.string.intro_reads,
            R.string.intro_health,
            R.string.intro_keyboard,
            R.string.intro_keyboard_help,
            R.string.intro_offline,
            R.string.intro_parent,
        )) {
            column.addView(label(res, top = 8))
        }

        column.addView(label(R.string.section_screen, 18f, bold = true, top = 24))
        accessTitle = label(R.string.access_off, top = 4)
        accessBody = label(R.string.access_body, top = 4)
        grantButton = button(R.string.access_button) { openUsageAccessSettings() }

        val healthTitle = label(R.string.health_title, 18f, bold = true, top = 24)
        healthText = label(null, top = 4)
        healthConnectButton = button(R.string.health_connect) { connectHealth() }
        healthInstallButton = button(R.string.health_install_button) {
            startOrSay(HealthAccess.installIntent(this), R.string.health_no_store)
        }
        healthManageButton = button(R.string.health_manage) {
            startOrSay(HealthAccess.manageIntent(this), R.string.health_unavailable)
        }
        healthDisconnectButton = button(R.string.health_disconnect) { disconnectHealth() }

        val keyboardTitle = label(R.string.kb_title, 18f, bold = true, top = 24)
        keyboardText = label(null, top = 4)
        val keyboardSkips = label(R.string.kb_skips, top = 8)
        keyboardOnButton = button(R.string.kb_turn_on) {
            startOrSay(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS), R.string.kb_no_settings)
        }
        keyboardChooseButton = button(R.string.kb_choose) {
            getSystemService(InputMethodManager::class.java)?.showInputMethodPicker()
        }
        noticeText = label(R.string.kb_notice_body, top = 8)
        noticeButton = button(R.string.kb_notice_button) {
            if (Build.VERSION.SDK_INT >= 33) notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }

        val weeksTitle = label(R.string.section_weeks, 18f, bold = true, top = 24)
        statusText = label(null, top = 4)
        weeksBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val refreshButton = button(R.string.refresh) { refresh() }
        saveButton = button(R.string.save) { saveFile.launch(getString(R.string.file_name)) }

        for (view in listOf(
            accessTitle, accessBody, grantButton,
            healthTitle, healthText, healthConnectButton, healthInstallButton, healthManageButton,
            healthDisconnectButton,
            keyboardTitle, keyboardText, keyboardSkips, keyboardOnButton, keyboardChooseButton, noticeText, noticeButton,
            weeksTitle, statusText, weeksBox, refreshButton, saveButton,
        )) {
            column.addView(view)
        }

        val scroll = ScrollView(this)
        scroll.addView(column)
        EdgeToEdge.setUp(this, scroll)
        return scroll
    }

    private fun duration(minutes: Int): String =
        if (minutes >= 60) {
            getString(R.string.duration_hours, minutes / 60, minutes % 60)
        } else {
            getString(R.string.duration_minutes, minutes)
        }

    private fun visibleIf(show: Boolean) = if (show) View.VISIBLE else View.GONE

    private fun label(textRes: Int?, sizeSp: Float = 16f, bold: Boolean = false, top: Int = 0): TextView =
        TextView(this).apply {
            if (textRes != null) setText(textRes)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
            setTextColor(TEXT_COLOR)
            if (bold) setTypeface(typeface, Typeface.BOLD)
            setLineSpacing(0f, 1.15f)
            setPadding(0, dp(top), 0, 0)
        }

    private fun button(textRes: Int, onClick: () -> Unit): Button =
        Button(this).apply {
            setText(textRes)
            setAllCaps(false)
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(12) }
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val WINDOW_DAYS = 28L
    }
}
