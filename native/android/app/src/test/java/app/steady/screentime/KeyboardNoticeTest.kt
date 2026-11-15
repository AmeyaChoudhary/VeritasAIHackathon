package app.steady.screentime

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// Item H: an ongoing notification while the keyboard is on, with the Android 13 permission.
class KeyboardNoticeTest {
    private val app = TestFiles.repoRoot.resolve("native/android/app")

    @Test
    fun permissionIsNeededFromAndroid13Only() {
        assertTrue(KeyboardNotice.needsPermission(33, granted = false))
        assertTrue(KeyboardNotice.needsPermission(36, granted = false))
        assertFalse(KeyboardNotice.needsPermission(36, granted = true))
        assertFalse(KeyboardNotice.needsPermission(32, granted = false))
    }

    @Test
    fun theManifestAsksForNotificationsAndStillNotForTheInternet() {
        val manifest = app.resolve("src/main/AndroidManifest.xml").readText()
        assertTrue(manifest.contains("android.permission.POST_NOTIFICATIONS"))
        assertFalse(manifest.contains("android.permission.INTERNET\""))
    }

    @Test
    fun theKeyboardShowsTheNoticeAndRemovesItWhenItStops() {
        val service = app.resolve("src/main/java/app/steady/screentime/SteadyKeyboardService.kt").readText()
        assertTrue(service.contains("KeyboardNotice.show(this)"))
        assertTrue(service.contains("KeyboardNotice.hide(this)"))
        val notice = app.resolve("src/main/java/app/steady/screentime/KeyboardNotice.kt").readText()
        assertTrue(notice.contains(".setOngoing(true)"))
    }
}
