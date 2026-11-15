package app.steady.screentime

import org.json.JSONObject
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sqrt

/**
 * The web app's tone model, ported line for line from app/src/engine/tone.ts.
 *
 * TF-IDF over word unigrams and bigrams, then logistic regression. The weights are the web
 * app's own file, app/public/models/tone.json, copied into the APK's assets at build time.
 * ToneModelTest checks the scores against tone.ts run under Node.
 *
 * The score ranks messages well but is not a calibrated chance. Use [isLowMood], which applies
 * the threshold stored in the model file.
 */
class ToneModel private constructor(
    val threshold: Double,
    private val intercept: Double,
    private val sublinearTf: Boolean,
    private val index: HashMap<String, Int>,
    private val idf: DoubleArray,
    private val coef: DoubleArray,
) {
    fun score(text: String): Double {
        // Insertion order matches the Map in tone.ts, so the sums run in the same order.
        val counts = LinkedHashMap<Int, Int>()
        for (feature in analyze(text)) {
            val j = index[feature] ?: continue
            counts[j] = (counts[j] ?: 0) + 1
        }
        var sq = 0.0
        var dot = 0.0
        for ((j, c) in counts) {
            val tf = if (sublinearTf) 1 + ln(c.toDouble()) else c.toDouble()
            val v = tf * idf[j]
            sq += v * v
            dot += v * coef[j]
        }
        val z = intercept + if (sq > 0) dot / sqrt(sq) else 0.0
        return 1 / (1 + exp(-z))
    }

    fun isLowMood(text: String): Boolean = score(text) >= threshold

    companion object {
        private val UPPER = Regex("[A-Z]")
        private val APOSTROPHES = Regex("['\u2018\u2019`\u02BC]")
        private val REPEATS = Regex("([a-z])\\1{2,}")
        private val TOKEN = Regex("[a-z0-9]+")

        /**
         * Same steps as analyze() in tone.ts: 1) lowercase A-Z only, 2) delete apostrophes,
         * 3) squash any letter repeated 3+ times to 2, 4) tokens are runs of a-z and 0-9,
         * 5) features are the tokens plus each adjacent pair joined by one space.
         */
        fun analyze(text: String): List<String> {
            val lower = UPPER.replace(text) { it.value.lowercase() }
            val s = REPEATS.replace(APOSTROPHES.replace(lower, ""), "$1$1")
            val tokens = TOKEN.findAll(s).map { it.value }.toList()
            val features = ArrayList<String>(tokens.size * 2)
            features.addAll(tokens)
            for (i in 0 until tokens.size - 1) features.add(tokens[i] + " " + tokens[i + 1])
            return features
        }

        /** Reads tone.json. Throws if the file is malformed, as loadToneModel() does. */
        fun fromJson(json: String): ToneModel {
            val root = JSONObject(json)
            val vocab = root.getJSONArray("vocab")
            val idfJson = root.getJSONArray("idf")
            val coefJson = root.getJSONArray("coef")
            val n = vocab.length()
            require(idfJson.length() == n && coefJson.length() == n) { "Tone model file is malformed" }
            val index = HashMap<String, Int>(n * 2)
            val idf = DoubleArray(n)
            val coef = DoubleArray(n)
            for (i in 0 until n) {
                index[vocab.getString(i)] = i
                idf[i] = idfJson.getDouble(i)
                coef[i] = coefJson.getDouble(i)
            }
            return ToneModel(
                threshold = root.getDouble("threshold"),
                intercept = root.getDouble("intercept"),
                sublinearTf = root.getString("tf") == "sublinear",
                index = index,
                idf = idf,
                coef = coef,
            )
        }
    }
}
