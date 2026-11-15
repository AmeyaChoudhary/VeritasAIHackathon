package app.steady.screentime

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

// Health Connect numbers for one day, and the rule for picking the night's sleep. No Android
// imports, so SleepMathTest runs on the JVM.

data class HealthDay(
    val date: LocalDate,
    /** Minutes asleep in the main sleep of the night that ended this morning. */
    val sleepMinutes: Int? = null,
    /** When that sleep started, to the minute. */
    val bedtime: LocalTime? = null,
    val steps: Long? = null,
)

/**
 * One sleep session. [awakeMs] is time in stages marked awake or out of bed. [source] is the
 * app that wrote it, so a phone's copy and a watch's copy of the same night stay apart.
 */
data class SleepPeriod(val start: Instant, val end: Instant, val awakeMs: Long = 0, val source: String = "") {
    val lengthMs: Long get() = end.toEpochMilli() - start.toEpochMilli()
}

object SleepMath {
    /** Two sessions from the same source closer than this are one night with a break. */
    const val MERGE_GAP_MS = 90 * 60_000L

    /** A main sleep that does not reach into 00:00 to 06:00 must last at least this long. */
    const val MIN_EVENING_SLEEP_MS = 3 * 60 * 60_000L

    /**
     * A night belongs to the date it ends, the morning the teen wakes up. That matches
     * night_minutes, which also counts toward the morning's date.
     *
     * 1. Sessions from the same source less than 90 minutes apart are merged into one, and the
     *    time between them counts as awake. A night split in two by a trip to the bathroom is
     *    one night.
     * 2. A session can be the main sleep only if it overlaps 00:00 to 06:00 of the date it ends,
     *    or lasts at least 3 hours. An afternoon nap is neither.
     * 3. The main sleep is the longest of those. A second copy of the same night from another
     *    source is shorter or equal, so it is left out.
     *
     * A date with only naps gets no entry here, so its sleep_minutes and bedtime stay null.
     */
    fun byWakeDate(periods: List<SleepPeriod>, zone: ZoneId): Map<LocalDate, HealthDay> =
        merge(periods)
            .filter { qualifies(it, zone) }
            .groupBy { it.end.atZone(zone).toLocalDate() }
            .mapValues { (date, nights) ->
                val main = nights.maxBy { it.lengthMs }
                val asleepMs = (main.lengthMs - main.awakeMs).coerceAtLeast(0)
                HealthDay(
                    date = date,
                    sleepMinutes = ((asleepMs + 30_000L) / 60_000L).toInt(),
                    bedtime = main.start.atZone(zone).toLocalTime().truncatedTo(ChronoUnit.MINUTES),
                )
            }

    fun merge(periods: List<SleepPeriod>): List<SleepPeriod> =
        periods
            .filter { it.lengthMs > 0 }
            .groupBy { it.source }
            .values
            .flatMap { fromOneSource ->
                val merged = mutableListOf<SleepPeriod>()
                for (p in fromOneSource.sortedBy { it.start }) {
                    val last = merged.lastOrNull()
                    val gap = if (last == null) Long.MAX_VALUE else p.start.toEpochMilli() - last.end.toEpochMilli()
                    if (last != null && gap < MERGE_GAP_MS) {
                        val end = if (p.end.isAfter(last.end)) p.end else last.end
                        merged[merged.size - 1] = last.copy(end = end, awakeMs = last.awakeMs + p.awakeMs + gap.coerceAtLeast(0))
                    } else {
                        merged += p
                    }
                }
                merged
            }

    private fun qualifies(p: SleepPeriod, zone: ZoneId): Boolean {
        if (p.lengthMs >= MIN_EVENING_SLEEP_MS) return true
        val date = p.end.atZone(zone).toLocalDate()
        val nightStart = date.atStartOfDay(zone).toInstant()
        val nightEnd = date.atTime(6, 0).atZone(zone).toInstant()
        return p.start.isBefore(nightEnd) && p.end.isAfter(nightStart)
    }

    /** Usual bedtime. Times before noon count as after midnight, so 23:50 and 00:20 sit together. */
    fun medianBedtime(times: List<LocalTime>): LocalTime? {
        if (times.isEmpty()) return null
        val shifted = times.map { (it.toSecondOfDay() / 60 + 12 * 60) % (24 * 60) }.sorted()
        val middle = shifted[(shifted.size - 1) / 2]
        return LocalTime.of(0, 0).plusMinutes(((middle + 12 * 60) % (24 * 60)).toLong())
    }
}
