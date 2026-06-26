# Android APK 构建指南

## 前置条件

- Docker

## 构建 APK

Docker 镜像已预装全部工具链，`tauri android init` 已在镜像层中缓存。

```bash
# 构建镜像 + 编译 APK（首次/源码变更后需 rebuild）
docker compose -f docker-compose.android.yml up --build

# 仅重新编译 APK（适合仅 Rust/Next.js 代码变更，镜像未变）
docker compose -f docker-compose.android.yml up
```

APK 输出位置: `apps/readest-app/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk`

AAB 输出位置: `apps/readest-app/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`

### 构建 Debug APK（测试用）

```bash
docker compose -f docker-compose.android.yml run --rm android-builder bash -c '
cd apps/readest-app && pnpm tauri android build -t aarch64 --debug'
```

### 构建不同架构

修改 `CMD` 中的 `-t` 参数，或直接覆盖：

```bash
docker compose -f docker-compose.android.yml run --rm android-builder bash -c '
cd apps/readest-app && pnpm tauri android build -t aarch64'
```

支持的目标：`aarch64`, `armv7`, `i686`, `x86_64`

## 签名配置

### 本地构建（未签名 APK）

默认构建输出 `-unsigned.apk`，可通过以下方式签名。

### 签名文件

- Keystore: `apps/readest-app/src-tauri/readest.keystore`
- 签名密码: `readest123`
- 签名别名: `readest`

### 构建签名 APK

```bash
docker compose -f docker-compose.android.yml run --rm android-builder bash -c '
cd apps/readest-app &&
echo "keyAlias=readest
password=readest123
storeFile=../../../readest.keystore" > src-tauri/gen/android/keystore.properties &&
pnpm tauri android build -t aarch64'
```

签名后 APK: `app-universal-release.apk`

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
- Node.js 24 + pnpm 11
- Rust 1.96 + Android NDK targets (aarch64, armv7, i686, x86_64)
- Android SDK 34 + NDK 28

### 缓存策略

| 缓存层 | 方式 | 加速内容 |
|--------|------|---------|
| `cargo-registry` | Docker volume | Cargo crate 下载（首次 ~5min，后续命中缓存） |
| `cargo-git` | Docker volume | Cargo git 依赖（避免重复 clone） |
| `cargo-target-startup` | Docker volume | Rust 编译产物（首次 ~10min，增量编译 ~2min） |
| `gradle-cache` | Docker volume | Gradle distribution + 依赖下载 + 增量编译 |
| pnpm deps | Docker layer | 仅 `package.json`/`patches`/`packages` 变更时重装 |
| `tauri android init` | Docker layer | Android 项目模板生成缓存，仅 Tauri 配置变更时重建 |
| `setup-vendors` | Docker layer | pdfjs/simplecc/jieba vendor 文件，仅首次或变更时重建 |

### Docker 镜像层结构

```
Layer 1: pnpm install          ← 仅依赖文件变更时重建
Layer 2: COPY . .              ← 任何源码变更会触发此层及之后
Layer 3: tauri android init    ← 生成 Android Gradle 项目
Layer 4: setup-vendors         ← 复制 vendor 静态资源
CMD:     tauri android build   ← 编译 Rust + Next.js + 打包 APK
```

### 清理缓存

```bash
# 清理所有构建缓存（下次构建将重新下载/编译）
docker compose -f docker-compose.android.yml down -v

# 仅清理 Docker 构建层缓存（保留 volume 缓存）
docker compose -f docker-compose.android.yml build --no-cache
```
