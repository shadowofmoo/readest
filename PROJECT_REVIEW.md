# Readest 项目全面审查报告

> 审查日期：2026-06-23

## 项目概述

Readest 是一个**开源跨平台电子书阅读器**，基于 **Next.js 16 + Tauri v2** 构建，支持 EPUB、MOBI、KF8、FB2、CBZ、TXT、PDF 等格式。目标平台：macOS、Windows、Linux、Android、iOS、Web。

---

## 1. 架构评估

### Monorepo 结构（pnpm workspace）

| 目录 | 用途 |
|---|---|
| `apps/readest-app/` | 主应用（Next.js + Tauri） |
| `apps/readest.koplugin/` | KOReader 插件（Lua） |
| `packages/foliate-js/` | 核心 JS 阅读引擎 |
| `packages/tauri/` | Tauri 自定义 fork |
| `packages/simplecc-wasm/` | 简繁中文转换 WASM |
| `packages/js-mdict/` | MDict 词典解析器 |

### 前端分层

- `app/` — Next.js App Router 路由（library、reader、auth、opds）
- `components/` — 共享 UI 组件（含 primitives 层）
- `services/` — **最厚的业务层**（41 个服务模块，含完整的 AI agent 系统 "Reedy"）
- `store/` — Zustand 全局状态（21 个 store）
- `hooks/` — 跨切面 hooks（39 个）
- `utils/` — 纯工具函数（93 个文件，最大的扁平目录）
- `libs/` — 底层库（CRDT、加密、存储、同步）

### Rust 后端

- 原生 EPUB/MOBI 解析快速通道（partialMD5、封面提取、OPF 预取）
- 4 个自定义 Tauri 插件（native-bridge、native-tts、turso、webview-upgrade）
- 平台特定代码（macOS traffic light、Apple Sign-In、e-ink 检测等）

---

## 2. 代码质量

### 优点

- Biome 严格配置（`noExplicitAny: error`、`noUnusedImports: error`）
- 使用 **tsgo**（TypeScript Go 原生编译器）做类型检查
- ESLint 和 Prettier 已被 Biome 统一替代
- 服务层有良好的抽象模式（providers/adapters 模式广泛使用）

### 潜在问题

- `utils/` 目录有 **93 个扁平文件**，部分职责模糊（如 `tauriEpubBridge.ts` 应在 services 层）
- `services/` 层过厚（41 个顶层条目），`reedy/` 本身就是一个完整的 agent 框架
- 仍有 Pages Router 和 App Router **混合路由**（`pages/` 目录残留）
- 某些目录为空占位符（`packages/qcms/`、`packages/tauri-plugins/`、`windows/mod.rs`）

---

## 3. 测试覆盖

### 测试金字塔（347+ 测试文件）

| 层级 | 数量 | 环境 |
|---|---|---|
| 单元测试（jsdom） | 328 | vitest + jsdom |
| 浏览器测试 | 14 | vitest + Playwright Chromium |
| Tauri 集成 | 4 | vitest + WebDriverIO |
| Web E2E | 4 spec | Playwright |
| Android E2E | 1 | CDP + 模拟器 |
| 扩展测试 | 6 | vitest |
| Rust 单元 | src-tauri/ | cargo test |
| Lua 测试 | 9 spec | busted |

### CI 流水线

PR 触发 6 个并行 job（Rust lint、Web 构建、Web 测试分 2 shard、扩展测试、Tauri 构建），还有 Nightly 构建、CodeQL、OSSF Scorecard。

### 注意

`integration/` 测试目录为空，端到端集成测试覆盖偏少。

---

## 4. 安全性

- 所有 GitHub Actions **固定到 commit SHA**
- CodeQL 扫描覆盖 JS/TS、Rust、Actions
- OSSF Scorecard 供应链安全分析
- Tauri 签名 + Apple 公证 + Android keystore 签名
- 依赖覆盖策略积极修补安全漏洞（`pnpm-workspace.yaml` 中 20+ overrides）
- Turso 插件有路径遍历防护

**CSP 配置**较复杂，包含多个外部域（Sentry、PostHog、Stripe、DeepL、Wikipedia 等），需定期审查。

---

## 5. 部署目标

| 平台 | 机制 |
|---|---|
| Web (Cloudflare Workers) | opennextjs-cloudflare |
| Web (Vercel) | 自动部署（push to main） |
| Docker | GHCR + Docker Hub，多架构 |
| Desktop (macOS/Win/Linux) | Tauri 构建 + NSIS/DMG/AppImage |
| Android | Tauri APK + Fastlane → Google Play |
| iOS | Tauri + App Store |
| Self-hosted | Docker Compose（Supabase + MinIO） |
| Nightly | Cloudflare R2，每日 06:00 GMT+8 |

---

## 6. 关键发现与建议

### 架构层面

1. `utils/` 过于扁平，建议按职责分组（如 `utils/tauri/`、`utils/format/`）
2. `services/reedy/` 是一个完整的 AI agent 系统（runtime、memory、RAG、skills、tools），考虑是否应独立为包
3. `pages/` 和 `app/` 混合路由遗留，建议迁移 `pages/api/kosync.ts` 到 App Router
4. 空目录应清理或添加 `.gitkeep` 说明

### 代码层面

5. 93 个 utils 文件中有平台桥接代码（`tauriEpubBridge.ts`），这些应属于 services 层
6. `zustand` 版本固定在 `5.0.10`，缺少 lockfile 中的版本范围保护
7. 依赖数量庞大（100+ runtime deps），部分可按需懒加载

### 测试层面

8. 集成测试目录为空，建议补充关键流程的端到端集成测试
9. Playwright E2E 只有 4 个 spec 文件，覆盖率偏低
10. Rust 测试仅限 `--lib`，建议扩展到集成测试

### 运维层面

11. Docker compose 中 Supabase 版本较旧（postgres 15.8.1、gotrue v2.185.0），建议定期更新
12. `build-macos-universial` 拼写错误（应为 `universal`）

---

## 总结

Readest 是一个**高质量、工程化程度很高**的跨平台项目。CI/CD 流水线完善，安全措施到位，代码分层清晰。主要改进空间在于：`utils/` 目录重组、集成测试补充、以及 `reedy/` 模块的独立性评估。整体而言，这是一个**生产就绪**的开源项目。
