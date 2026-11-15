// Versions picked to work together. Health Connect's connect-client 1.1.0 needs compileSdk 36
// and AGP 8.9.1 or newer; AGP 8.9 needs Gradle 8.11.1 or newer.
// https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
plugins {
    id("com.android.application") version "8.9.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
