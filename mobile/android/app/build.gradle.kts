import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing with the Play upload key (docs/RUNBOOK.md 7b). The key and its
// passwords come from the environment (CI: decoded from GitHub secrets into the runner's
// temp dir) or from android/key.properties on a release machine — neither is committed
// (.gitignore: key.properties, *.jks, *.keystore). Environment values win.
//   ANDROID_KEYSTORE_PATH      storeFile      (absolute, or relative to mobile/android/)
//   ANDROID_KEYSTORE_PASSWORD  storePassword
//   ANDROID_KEY_ALIAS          keyAlias
//   ANDROID_KEY_PASSWORD       keyPassword
// Without them a release build stops with a clear message; it is never signed with the
// debug key. Debug builds need none of this.
val keyProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.isFile) file.inputStream().use { load(it) }
}
val signingValue = { env: String, property: String ->
    providers.environmentVariable(env).orNull?.takeIf { it.isNotBlank() }
        ?: keyProperties.getProperty(property)?.takeIf { it.isNotBlank() }
}
val releaseStorePath = signingValue("ANDROID_KEYSTORE_PATH", "storeFile")
val releaseStorePassword = signingValue("ANDROID_KEYSTORE_PASSWORD", "storePassword")
val releaseKeyAlias = signingValue("ANDROID_KEY_ALIAS", "keyAlias")
val releaseKeyPassword = signingValue("ANDROID_KEY_PASSWORD", "keyPassword")
val releaseSigningProblems = buildList {
    if (releaseStorePath == null) add("ANDROID_KEYSTORE_PATH (storeFile)")
    else if (!rootProject.file(releaseStorePath).isFile) add("keystore file not found: ${rootProject.file(releaseStorePath)}")
    if (releaseStorePassword == null) add("ANDROID_KEYSTORE_PASSWORD (storePassword)")
    if (releaseKeyAlias == null) add("ANDROID_KEY_ALIAS (keyAlias)")
    if (releaseKeyPassword == null) add("ANDROID_KEY_PASSWORD (keyPassword)")
}

android {
    namespace = "com.dawabag.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // flutter_local_notifications uses java.time on older Android versions
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.dawabag.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        // Android 7.0+: secure storage, Agora video and Firebase messaging need 23-24
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (releaseSigningProblems.isEmpty()) {
            create("release") {
                storeFile = rootProject.file(releaseStorePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            // The upload key, or none at all (the check below then stops the build)
            signingConfig = signingConfigs.findByName("release")
        }
    }
}

// Fail fast, before anything compiles, when a release APK/AAB is asked for without the
// upload key — instead of quietly producing an unsigned or debug-signed artefact.
gradle.taskGraph.whenReady {
    val releaseTask = Regex("^(assemble|bundle|package|sign)Release(Bundle)?$")
    if (releaseSigningProblems.isNotEmpty() &&
        allTasks.any { it.project.path == project.path && releaseTask.matches(it.name) }
    ) {
        throw GradleException(
            "Release builds must be signed with the Play upload key, and it is not configured. " +
                "Missing: ${releaseSigningProblems.joinToString("; ")}. Set these environment " +
                "variables or fill mobile/android/key.properties (never commit it) — see " +
                "docs/RUNBOOK.md section 7b. Debug builds (flutter build apk --debug) need no key."
        )
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
