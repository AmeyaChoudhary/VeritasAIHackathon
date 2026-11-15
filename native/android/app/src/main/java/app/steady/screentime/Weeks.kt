package app.steady.screentime

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.TemporalAdjusters

/** One week for the screen, Monday to Sunday, the same weeks the Stability web app uses. */
data class WeekSummary(
    val monday: LocalDate,
    /** Days with anything from any source. Stability leaves out weeks with fewer than 4. */
    val days: Int,
    val screenDays: Int,
    val screenMinutesPerDay: Int?,
    val nightMinutesPerDay: Int?,
    val usualFirstUse: LocalTime?,
    val usualLastUse: LocalTime?,
    /** Over the days that have game numbers. Days saved before games were counted are left out. */
    val gameMinutesPerDay: Int?,
    val nightGameMinutesPerDay: Int?,
    val sleepMinutesPerNight: Int?,
    val usualBedtime: LocalTime?,
    val stepsPerDay: Long?,
    val keyboardMessages: Int?,
    val charsPerMinute: Double?,
    val lowMoodShare: Double?,
)

object Weeks {
    fun summarize(days: List<DayExport>): List<WeekSummary> =
        days.groupBy { it.date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)) }
            .toSortedMap()
            .map { (monday, week) ->
                val screen = week.mapNotNull { it.screen }
                val health = week.mapNotNull { it.health }
                val sleep = health.mapNotNull { it.sleepMinutes }
                val steps = health.mapNotNull { it.steps }
                val keyboard = week.mapNotNull { it.keyboard }
                    .fold(null as KeyboardDay?) { sum, day -> sum?.addAll(day) ?: day }
                WeekSummary(
                    monday = monday,
                    days = week.size,
                    screenDays = screen.size,
                    screenMinutesPerDay = roundedMean(screen.map { it.screenMinutes.toLong() })?.toInt(),
                    nightMinutesPerDay = roundedMean(screen.map { it.nightMinutes.toLong() })?.toInt(),
                    usualFirstUse = median(screen.mapNotNull { it.firstUse }),
                    usualLastUse = median(screen.mapNotNull { it.lastUse }),
                    gameMinutesPerDay = roundedMean(screen.mapNotNull { it.gameMinutes?.toLong() })?.toInt(),
                    nightGameMinutesPerDay = roundedMean(screen.mapNotNull { it.nightGameMinutes?.toLong() })?.toInt(),
                    sleepMinutesPerNight = roundedMean(sleep.map { it.toLong() })?.toInt(),
                    usualBedtime = SleepMath.medianBedtime(health.mapNotNull { it.bedtime }),
                    stepsPerDay = roundedMean(steps),
                    keyboardMessages = keyboard?.messages,
                    charsPerMinute = keyboard?.charsPerMinute,
                    lowMoodShare = keyboard?.lowMoodShare,
                )
            }

    private fun KeyboardDay.addAll(other: KeyboardDay) = copy(
        messages = messages + other.messages,
        chars = chars + other.chars,
        corrections = corrections + other.corrections,
        gaps = gaps + other.gaps,
        pauses = pauses + other.pauses,
        speedChars = speedChars + other.speedChars,
        speedMs = speedMs + other.speedMs,
        toneScored = toneScored + other.toneScored,
        lowMood = lowMood + other.lowMood,
    )

    private fun roundedMean(values: List<Long>): Long? =
        if (values.isEmpty()) null else (values.sum() + values.size / 2) / values.size

    private fun median(times: List<LocalTime>): LocalTime? =
        if (times.isEmpty()) null else times.sorted()[(times.size - 1) / 2]
}
