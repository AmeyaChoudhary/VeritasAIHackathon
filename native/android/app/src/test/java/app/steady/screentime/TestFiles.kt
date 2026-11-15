package app.steady.screentime

import org.json.JSONObject
import java.io.File

/** Files the parity tests share. The repo root comes from app/build.gradle.kts. */
object TestFiles {
    val repoRoot: File by lazy {
        val path = System.getProperty("steady.repoRoot") ?: error("steady.repoRoot is not set; run the tests through Gradle")
        File(path)
    }

    val toneModel: ToneModel by lazy { ToneModel.fromJson(repoRoot.resolve("app/public/models/tone.json").readText()) }

    val selfHarm: SelfHarmCheck by lazy {
        SelfHarmCheck.fromJson(repoRoot.resolve("app/src/engine/selfharm_phrases.json").readText())
    }

    /** Expected results from tone.ts and selfharm.ts, written by tools/make_parity_fixtures.mjs. */
    data class Expected(val id: String, val text: String, val score: Double, val low: Boolean, val level: String, val rule: String?)

    val expected: List<Expected> by lazy {
        val stream = TestFiles::class.java.getResourceAsStream("/parity_expected.jsonl") ?: error("parity_expected.jsonl is missing")
        stream.bufferedReader(Charsets.UTF_8).readLines().filter { it.isNotBlank() }.map { line ->
            val o = JSONObject(line)
            Expected(
                id = o.getString("id"),
                text = o.getString("text"),
                score = o.getDouble("score"),
                low = o.getBoolean("low"),
                level = o.getString("level"),
                rule = if (o.isNull("rule")) null else o.getString("rule"),
            )
        }
    }

    /** experiments/exp2_words/test_messages.csv as id to text. Handles quotes and doubled quotes. */
    val testMessages: Map<String, String> by lazy {
        val rows = parseCsv(repoRoot.resolve("experiments/exp2_words/test_messages.csv").readText())
        val head = rows.first()
        val id = head.indexOf("id")
        val text = head.indexOf("text")
        rows.drop(1).associate { it[id] to it[text] }
    }

    private fun parseCsv(text: String): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        val cell = StringBuilder()
        var quoted = false
        var i = 0
        while (i < text.length) {
            val c = text[i]
            when {
                quoted && c == '"' && i + 1 < text.length && text[i + 1] == '"' -> { cell.append('"'); i++ }
                quoted && c == '"' -> quoted = false
                quoted -> cell.append(c)
                c == '"' -> quoted = true
                c == ',' -> { row.add(cell.toString()); cell.setLength(0) }
                c == '\n' || c == '\r' -> {
                    if (c == '\r' && i + 1 < text.length && text[i + 1] == '\n') i++
                    row.add(cell.toString()); cell.setLength(0)
                    rows.add(row); row = mutableListOf()
                }
                else -> cell.append(c)
            }
            i++
        }
        if (cell.isNotEmpty() || row.isNotEmpty()) { row.add(cell.toString()); rows.add(row) }
        return rows.filter { it.size > 1 || it.firstOrNull().orEmpty().isNotEmpty() }
    }
}
