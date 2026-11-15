plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The repo root, two levels up from native/android. The tone model and the self-harm phrase
// list live in the web app; the keyboard uses the same two files.
val repoRoot: File = rootProject.projectDir.resolve("../..").canonicalFile

android {
    namespace = "app.steady.screentime"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.steady.screentime"
        // java.time is built in from API 26, so no desugaring is needed.
        minSdk = 26
        // Android 16. It forces edge to edge with no opt-out; every screen pads for the bars
        // (see EdgeToEdge.kt). A Play Store build must target the level Google Play requires.
        targetSdk = 36
        versionCode = 3
        versionName = "0.3"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    testOptions {
        unitTests.all { test ->
            // The parity tests read the web app's model files and test messages from here.
            test.systemProperty("steady.repoRoot", repoRoot.path)
        }
    }
}

/** Copies the web app's tone model and phrase list into the APK's assets at build time. */
abstract class CopyEngineFiles : DefaultTask() {
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.NAME_ONLY)
    abstract val sources: ConfigurableFileCollection

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val out = outputDir.get().asFile
        out.deleteRecursively()
        out.mkdirs()
        for (file in sources.files) {
            check(file.isFile) { "Missing ${file.path}. The keyboard needs the web app's model files." }
            file.copyTo(File(out, file.name), overwrite = true)
        }
    }
}

val copyEngineFiles = tasks.register<CopyEngineFiles>("copyEngineFiles") {
    sources.from(
        repoRoot.resolve("app/public/models/tone.json"),
        repoRoot.resolve("app/src/engine/selfharm_phrases.json"),
    )
    outputDir.set(layout.buildDirectory.dir("generated/engineAssets"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyEngineFiles, CopyEngineFiles::outputDir)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.health.connect:connect-client:1.1.0")

    testImplementation("junit:junit:4.13.2")
    // Android's own org.json is a stub in JVM tests, so the tests use the Maven build of it.
    testImplementation("org.json:json:20250107")
}
