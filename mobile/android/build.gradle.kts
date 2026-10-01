allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
// Some plugins (agora_rtc_engine) still compile against Android 31, while current
// AndroidX libraries need 33 or later. Compile every plugin against the same SDK as
// the app; this changes nothing about which phones can install it (minSdk does that).
subprojects {
    afterEvaluate {
        extensions.findByName("android")?.let { android ->
            android.javaClass.getMethod("compileSdkVersion", Int::class.javaPrimitiveType).invoke(android, 36)
        }
    }
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
