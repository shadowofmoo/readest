# Keep javax.annotation classes used by Google crypto-tink
-dontwarn javax.annotation.Nullable
-dontwarn javax.annotation.concurrent.GuardedBy
-keep class javax.annotation.Nullable { *; }
-keep class javax.annotation.concurrent.GuardedBy { *; }
