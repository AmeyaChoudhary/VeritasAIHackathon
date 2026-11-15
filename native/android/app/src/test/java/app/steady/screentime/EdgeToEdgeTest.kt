package app.steady.screentime

import org.junit.Assert.assertTrue
import org.junit.Test

// Item G: the app targets Android 16 (API 36), which forces edge to edge, and every activity in
// the manifest pads for the system bars through EdgeToEdge.setUp.
class EdgeToEdgeTest {
    private val app = TestFiles.repoRoot.resolve("native/android/app")

    @Test
    fun targetsApi36() {
        val build = app.resolve("build.gradle.kts").readText()
        assertTrue(Regex("""targetSdk\s*=\s*36\b""").containsMatchIn(build))
    }

    @Test
    fun everyActivityPadsForTheSystemBars() {
        val manifest = app.resolve("src/main/AndroidManifest.xml").readText()
        val activities = Regex("""<activity\s[^>]*android:name="\.(\w+)"""").findAll(manifest).map { it.groupValues[1] }.toList()
        assertTrue(activities.size >= 3)
        for (name in activities) {
            val source = app.resolve("src/main/java/app/steady/screentime/$name.kt").readText()
            assertTrue("$name does not call EdgeToEdge.setUp", source.contains("EdgeToEdge.setUp("))
        }
    }
}
