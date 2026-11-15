package app.steady.screentime

// What the full-screen help screen shows. No Android imports, so HelpScreenTest runs on the JVM.

/** Why the help screen is open. Later values are stronger. */
enum class HelpMode(val wire: String) {
    /** The teen tapped the keyboard's own 988 key. */
    HELP("help"),

    /** Self-harm words other than a plan: ask "Are you safe right now?" first. */
    CONCERN("concern"),

    /** Words that state a plan, or say it has already happened: 988 and 911 at once. */
    PLAN("plan"),
    ;

    companion object {
        fun fromWire(value: String?): HelpMode = entries.firstOrNull { it.wire == value } ?: HELP

        fun of(level: SelfHarmLevel): HelpMode = if (level == SelfHarmLevel.PLAN) PLAN else CONCERN
    }
}

data class HelpContent(
    /** Show "Are you safe right now?" with Yes and No above the 988 buttons. */
    val askSafe: Boolean,
    /** Show the 911 line and button above 988. */
    val show911: Boolean,
    /** Show a short thank-you after "Yes". */
    val thanks: Boolean,
)

object HelpScreen {
    /** 988 is always on the screen. The question only comes for "concern", and only until it is answered. */
    fun content(mode: HelpMode, answer: SafeAnswer?): HelpContent =
        when (mode) {
            HelpMode.PLAN, HelpMode.HELP -> HelpContent(askSafe = false, show911 = true, thanks = false)
            HelpMode.CONCERN -> when (answer) {
                null -> HelpContent(askSafe = true, show911 = false, thanks = false)
                SafeAnswer.NO -> HelpContent(askSafe = false, show911 = true, thanks = false)
                SafeAnswer.YES -> HelpContent(askSafe = false, show911 = false, thanks = true)
            }
        }

    /** A screen already showing 911 never drops it when a weaker match arrives. */
    fun stronger(current: HelpMode, incoming: HelpMode): HelpMode =
        if (incoming.ordinal >= current.ordinal) incoming else current
}
