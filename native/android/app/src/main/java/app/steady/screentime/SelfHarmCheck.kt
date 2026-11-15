package app.steady.screentime

import org.json.JSONArray
import org.json.JSONObject

/** "plan" sends an urgent note at once in the full product. "concern" asks first. */
enum class SelfHarmLevel(val wire: String) {
    NONE("none"),
    CONCERN("concern"),
    PLAN("plan"),
}

/** Never holds the matched words, only the level and the rule id. */
data class SelfHarmResult(val level: SelfHarmLevel, val ruleId: String?)

/**
 * The web app's self-harm phrase check, ported from app/src/engine/selfharm.ts, with the same
 * rules file (app/src/engine/selfharm_phrases.json) copied into the APK's assets at build time.
 *
 * This is a short phrase list written for the demo without clinical review. It is not
 * validated. SelfHarmCheckTest checks it against selfharm.ts on the experiment's test messages.
 */
class SelfHarmCheck private constructor(
    private val plan: List<Rule>,
    private val concern: List<Rule>,
    private val negations: List<Rule>,
) {
    private class Rule(val id: String, val regex: Regex)

    fun check(text: String): SelfHarmResult {
        if (text.isEmpty()) return SelfHarmResult(SelfHarmLevel.NONE, null)
        var s = normalize(text)
        // Negations ("i would never kill myself", "suicide prevention week") are blanked out
        // first, so the rest of the message is still checked.
        for (n in negations) s = n.regex.replace(s, " . ")
        for (r in plan) if (r.regex.containsMatchIn(s)) return SelfHarmResult(SelfHarmLevel.PLAN, r.id)
        for (r in concern) if (r.regex.containsMatchIn(s)) return SelfHarmResult(SelfHarmLevel.CONCERN, r.id)
        return SelfHarmResult(SelfHarmLevel.NONE, null)
    }

    companion object {
        private val UPPER = Regex("[A-Z]")
        private val APOSTROPHES = Regex("['\u2018\u2019`\u02BC]")
        private val NOT_WORD = Regex("[^a-z0-9]+")

        /**
         * Same steps as normalize() in selfharm.ts: 1) lowercase A-Z only, 2) delete apostrophes,
         * 3) every run outside a-z and 0-9 becomes one space, 4) trim. After this the text holds
         * only a-z, 0-9 and spaces, so \b means the same in Java's regex engine as in JavaScript's.
         */
        fun normalize(text: String): String {
            val lower = UPPER.replace(text) { it.value.lowercase() }
            return NOT_WORD.replace(APOSTROPHES.replace(lower, ""), " ").trim()
        }

        fun fromJson(json: String): SelfHarmCheck {
            val root = JSONObject(json)
            // The web app compiles plan and concern with "i", negations with "gi". The text is
            // already lowercase, but the flag is kept to match.
            fun rules(name: String): List<Rule> {
                val list: JSONArray = root.getJSONArray(name)
                return (0 until list.length()).map { i ->
                    val item = list.getJSONObject(i)
                    Rule(item.getString("id"), Regex(item.getString("pattern"), RegexOption.IGNORE_CASE))
                }
            }
            return SelfHarmCheck(rules("plan"), rules("concern"), rules("negations"))
        }
    }
}
