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

APK 输出位置: `apps/readest-app/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`

AAB 输出位置: `apps/readest-app/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`

> Docker 构建已内置自动签名，输出为签名后的 APK，可直接安装。

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

### 自动签名（Docker 构建默认）

Dockerfile 已在 `tauri android init` 之后自动生成 `keystore.properties`，构建时 Gradle 自动读取并签名，输出为已签名 APK。

### 签名文件

- Keystore: `apps/readest-app/src-tauri/readest.keystore`
- 签名密码: `123456`
- 签名别名: `readest`

### 手动签名（本地无 Docker 构建时）

```bash
cd apps/readest-app &&
echo 'keyAlias=readest
password=123456
storeFile=../../../readest.keystore' > src-tauri/gen/android/keystore.properties &&
pnpm tauri android build -t aarch64
```

### 如何生成新的 Keystore

```bash
# 方式 1: keytool (需要 JDK)
keytool -genkey -v -keystore readest.keystore -alias readest -keyalg RSA \
  -keysize 2048 -validity 36500 -storepass 123456 -keypass 123456 \
  -dname "CN=Readest, OU=Personal, O=Readest, C=US"

# 方式 2: openssl (无需 JDK)
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem \
  -days 36500 -nodes -subj "/CN=Readest/O=Personal/C=US"
openssl pkcs12 -export -out readest.keystore -inkey key.pem -in cert.pem \
  -passout pass:123456 -name readest
rm key.pem cert.pem
```

### 签名配置文件格式

在 `src-tauri/gen/android/keystore.properties` 中配置：

```properties
keyAlias=readest
password=123456
storeFile=../../../readest.keystore
```

> `storeFile` 是相对于 `gen/android/app/`（`build.gradle.kts` 所在 project 目录）的相对路径。

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
Layer 1: pnpm install            ← 仅依赖文件变更时重建
Layer 2: COPY . .                ← 任何源码变更会触发此层及之后
Layer 3: tauri android init      ← 生成 Android Gradle 项目
Layer 4: keystore.properties     ← 注入签名配置（密码内嵌于 Dockerfile）
Layer 5: setup-vendors           ← 复制 vendor 静态资源
CMD:     tauri android build     ← 编译 Rust + Next.js + 打包签名 APK
```

### 清理缓存

```bash
# 清理所有构建缓存（下次构建将重新下载/编译）
docker compose -f docker-compose.android.yml down -v

# 仅清理 Docker 构建层缓存（保留 volume 缓存）
docker compose -f docker-compose.android.yml build --no-cache
```
