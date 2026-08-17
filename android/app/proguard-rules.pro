# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ---------------------------------------------------------------------------
# Rules below back android.enableMinifyInReleaseBuilds in gradle.properties.
#
# R8 reasons about static call graphs. Everything the JS side reaches goes
# through reflection or JNI, so from R8's point of view most of this bridge is
# unreachable and gets deleted. It then fails at runtime, in release builds
# only — debug is never minified, so these never show up in development.
#
# React Native and the Expo modules both ship consumer rules inside their AARs,
# which R8 applies automatically. These are the gaps that leaves.
# ---------------------------------------------------------------------------

# Anything the C++ side resolves by name. Native method names must survive, and
# @DoNotStrip is how React Native marks members reached from JNI.
-keepclasseswithmembernames class * { native <methods>; }
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }

# The JS-callable surface: methods JS invokes by string name, and the module
# classes the registry looks up.
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }
-keep @com.facebook.react.module.annotations.ReactModule class * { *; }
-keepclassmembers class * extends com.facebook.react.bridge.ReactContextBaseJavaModule {
    <init>(...);
    public java.lang.String getName();
}

# Expo's modules API declares each module in a reflective definition() block, so
# the class and its members cannot be traced from any call site. This app pulls
# in notifications, media-library, file-system, sqlite, font and sharing.
-keep class expo.modules.** { *; }
-keep class * extends expo.modules.core.interfaces.Package { *; }
-keep class * extends expo.modules.kotlin.modules.Module { *; }

# Kotlin reflection metadata, which the Expo modules API reads.
-keep class kotlin.Metadata { *; }
-keepclassmembers class **$WhenMappings { <fields>; }

-dontwarn okhttp3.**
-dontwarn okio.**

# Add any project specific keep options here:
