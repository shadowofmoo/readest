## Merge Workflow

合并上游（`origin/main` → 本地分支）是高风险操作。上游可能删除模块、重命名接口、重构依赖，而本地分支可能在这些模块上有额外改动。以下规则可以防止合并引入不可检测的错误，避免等到 Docker/CI 构建才暴露。

---

### 1. 合并前检查

```bash
# 确认本地状态干净（0 类型错误）
pnpm lint

# 可选：跑完整 Tauri 构建（与 Docker 内行为一致）
pnpm build
```

---

### 2. 合并命令

```bash
# 拉取上游最新
git fetch origin main

# --no-commit：合并完不自动提交，先跑检查再决定
git merge origin/main --no-commit
```

解决冲突后**不要立刻 `git merge --continue`**，先跑：

```bash
pnpm lint
```

通过再继续：

```bash
git merge --continue
```

---

### 3. 破坏性合并（上游删除模块）的特殊处理

如果上游 merge 删除了大量文件（如 `342dcc6f` 移除 payment/IAP/supabase 模块），需要额外步骤：

1. **先看上游改了什么**：
   ```bash
   git diff origin/main...HEAD --stat | head -30
   ```

2. **检查脚本**（放在 `scripts/merge-check.sh`）：
   ```bash
   #!/usr/bin/env bash
   # 合并后立刻跑，列出所有 TypeScript 类型错误
   cd "$(dirname "$0")/.." || exit 1
   pnpm --filter @readest/readest-app exec tsgo --noEmit 2>&1 | grep 'error TS'
   ```

3. **stub 先行**：如果上游删了某依赖（如 Supabase、Stripe），在合之前就准备好 stub，合完之后再补类型很难一次性补全。

---

### 4. Supabase Stub 约定

`src/utils/supabase.ts` 是本地模式（Tauri 构建）的 stub。它需要满足以下要求：

- **任何 `supabase.xxx()` 调用都能通过 TypeScript 类型检查**（即使运行时返回 null）
- 修改 stub 后必须跑 `pnpm lint`，确保所有引用 supabase 的文件都类型安全
- 新增 supabase API 用法时，同步检查 stub 是否需要更新

当前 stub 的设计原则：
- `from()` / `rpc()` 返回一个完整的链式构建器，支持 `.select().eq().order().single<T>()` 等所有方法
- `auth.*` 返回 user stub（Proxy 对象），避免 TypeScript 推断 `never` 类型
- 顶层的 supabase 对象包含足够属性，满足 `SupabaseClient` 类型所需的字段

---

### 5. CI 门禁

所有 PR 必须通过 TypeScript 类型检查才能合并。在 CI 中加入：

```yaml
# .github/workflows/typecheck.yml
name: Type Check
on: [pull_request]
jobs:
  tsgo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @readest/readest-app lint
```

---

### 6. 故障恢复

如果合并后 `pnpm lint` 报错且不知原因，检查：

1. **文件是否被损坏**：`git diff --check` 检查冲突标记残留
2. **stub 是否过时**：`src/utils/supabase.ts` 是否少了方法
3. **依赖是否缺失**：`pnpm install` 是否跑过
4. **tsgo 缓存**：`rm -rf node_modules/.tsgo` 后重试
