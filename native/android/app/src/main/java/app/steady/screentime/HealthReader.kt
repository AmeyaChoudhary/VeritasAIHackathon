package app.steady.screentime

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId

/**
 * Sleep sessions and steps from Health Connect, read only while the app's screen is open.
 *
 * Setup, permissions and the privacy screen follow
 * https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
 * Health Connect lets an app read up to 30 days before access was first given, which covers
 * the 28 days Steady uses.
 */
object HealthAccess {
    val permissions: Set<String> = setOf(
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
    )

    /** The Health Connect app on Android 13 and lower. */
    private const val PROVIDER = "com.google.android.apps.healthdata"
    private const val PREFS = "health"
    private const val KEY_OFF = "disconnected"

    enum class State {
        /** Android 8, or a phone where Health Connect cannot run. */
        UNAVAILABLE,

        /** Android 13 or lower without the Health Connect app, or with an old one. */
        NEEDS_INSTALL,
        NOT_CONNECTED,
        CONNECTED,
    }

    suspend fun state(context: Context): State =
        when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> {
                val granted = runCatching {
                    HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
                }.getOrDefault(emptySet())
                if (granted.containsAll(permissions) && !isTurnedOff(context)) State.CONNECTED else State.NOT_CONNECTED
            }
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> State.NEEDS_INSTALL
            else -> State.UNAVAILABLE
        }

    /**
     * "Disconnect" asks Health Connect to drop Steady's access. From Android 14 that only takes
     * effect when the app's process ends, so Steady also stops reading right away on its own.
     */
    suspend fun disconnect(context: Context) {
        setTurnedOff(context, true)
        runCatching { HealthConnectClient.getOrCreate(context).permissionController.revokeAllPermissions() }
    }

    fun markConnected(context: Context) = setTurnedOff(context, false)

    /** Play Store page for the Health Connect app, as the get-started guide shows. */
    fun installIntent(context: Context): Intent =
        Intent(Intent.ACTION_VIEW).apply {
            setPackage("com.android.vending")
            data = Uri.parse(
                "market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding",
            )
            putExtra("overlay", true)
            putExtra("callerId", context.packageName)
        }

    fun manageIntent(context: Context): Intent = HealthConnectClient.getHealthConnectManageDataIntent(context)

    private fun isTurnedOff(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_OFF, false)

    private fun setTurnedOff(context: Context, off: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_OFF, off).apply()
    }
}

class HealthReader(private val context: Context) {
    private val zone: ZoneId = ZoneId.systemDefault()

    /** Days from [from] to the day before [today]. Call only when [HealthAccess.state] is CONNECTED. */
    suspend fun read(from: LocalDate, today: LocalDate): Map<LocalDate, HealthDay> {
        val client = HealthConnectClient.getOrCreate(context)
        val sleep = SleepMath.byWakeDate(readSleep(client, from), zone)
        val steps = readSteps(client, from, today)
        val dates = (sleep.keys + steps.keys).filter { it >= from && it < today }
        return dates.associateWith { date ->
            (sleep[date] ?: HealthDay(date)).copy(steps = steps[date])
        }
    }

    private suspend fun readSleep(client: HealthConnectClient, from: LocalDate): List<SleepPeriod> {
        // Start at noon the day before, so a night that ends on [from] is included.
        val start = from.minusDays(1).atTime(12, 0).atZone(zone).toInstant()
        val filter = TimeRangeFilter.between(start, Instant.now())
        val periods = mutableListOf<SleepPeriod>()
        var pageToken: String? = null
        do {
            val response = client.readRecords(
                ReadRecordsRequest(SleepSessionRecord::class, filter, pageToken = pageToken),
            )
            for (record in response.records) {
                val awakeMs = record.stages
                    .filter { it.stage in AWAKE_STAGES }
                    .sumOf { it.endTime.toEpochMilli() - it.startTime.toEpochMilli() }
                periods += SleepPeriod(record.startTime, record.endTime, awakeMs, record.metadata.dataOrigin.packageName)
            }
            pageToken = response.pageToken
        } while (!pageToken.isNullOrEmpty())
        return periods
    }

    /**
     * Steps a day, by local date. aggregateGroupByPeriod removes overlap between sources, such as
     * a phone and a watch counting the same walk.
     */
    private suspend fun readSteps(client: HealthConnectClient, from: LocalDate, today: LocalDate): Map<LocalDate, Long> {
        val groups = client.aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(from.atStartOfDay(), today.atStartOfDay()),
                timeRangeSlicer = Period.ofDays(1),
            ),
        )
        val out = mutableMapOf<LocalDate, Long>()
        for (group in groups) {
            val count = group.result[StepsRecord.COUNT_TOTAL] ?: continue
            out[group.startTime.toLocalDate()] = count
        }
        return out
    }

    private companion object {
        val AWAKE_STAGES = setOf(
            SleepSessionRecord.STAGE_TYPE_AWAKE,
            SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
            SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
        )
    }
}
