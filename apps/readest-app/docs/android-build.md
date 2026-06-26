# Android APK 构建指南

## 前置条件

- Docker
- 项目根目录有 `Dockerfile.android` 和 `docker-compose.android.yml`

## 构建 APK

### 一键构建（签名 Release APK）

```bash
docker compose -f docker-compose.android.yml run --rm android-builder bash -c '
apt-get install -y -qq build-essential && cd apps/readest-app &&
pnpm tauri android init &&
echo "keyAlias=readest
password=readest123
storeFile=../../../readest.keystore" > src-tauri/gen/android/keystore.properties &&
pnpm tauri android build -t aarch64 --apk'
```

APK 输出位置: `apps/readest-app/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`

### 构建 Debug APK（测试用）

去掉签名配置即可：

```bash
docker compose -f docker-compose.android.yml run --rm android-builder bash -c '
apt-get install -y -qq build-essential && cd apps/readest-app &&
pnpm tauri android init &&
pnpm tauri android build -t aarch64 --debug --apk'
```

## 签名配置

### 签名文件

- Keystore: `apps/readest-app/src-tauri/readest.keystore`
- 签名密码: `readest123`
- 签名别名: `readest`

### 如何生成新的 Keystore

```bash
keytool -genkey -v -keystore readest.keystore -alias readest -keyalg RSA \
  -keysize 2048 -validity 10000 -storepass <密码> -keypass <密码> \
  -dname "CN=Readest, OU=Dev, O=Readest, L=Beijing, ST=Beijing, C=CN"
```

### 签名配置文件格式

在 `src-tauri/gen/android/keystore.properties` 中配置：

```properties
keyAlias=<别名>
password=<密码>
storeFile=../../../readest.keystore
```

> `storeFile` 是相对于 `gen/android/` 目录的相对路径。

### 环境变量方式（可选）

也可以在构建时通过环境变量传递签名信息：

```bash
export ANDROID_SIGNING_KEYSTORE_PATH=src-tauri/readest.keystore
export ANDROID_SIGNING_KEYSTORE_PASSWORD=readest123
export ANDROID_SIGNING_KEY_ALIAS=readest
export ANDROID_SIGNING_KEY_PASSWORD=readest123
```

## Docker 环境说明

打包了以下工具链：

- Ubuntu 22.04
- OpenJDK 17
- Node.js 22 + pnpm 11
- Rust 1.96 + Android NDK targets
- Android SDK 34 + NDK 28

构建缓存通过 Docker volumes 保留：

- `cargo-cache`: Rust 依赖缓存
- `pnpm-cache`: pnpm 包缓存
