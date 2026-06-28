#!/usr/bin/env bash
# merge-upstream.sh — 合并上游 main 到当前分支，带预检和验证
# 用法: bash scripts/merge-upstream.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> 拉取上游最新..."
git fetch origin main

echo "==> 上游变更文件数:"
git diff origin/main...HEAD --stat 2>/dev/null | tail -1

echo "==> 合并前状态检查..."
cd "$APP_DIR"
pnpm --filter @readest/readest-app exec tsgo --noEmit 2>&1 | grep 'error TS' && {
  echo "❌ 合并前已有类型错误，请先修复"
  exit 1
} || true

echo "✅ 合并前状态干净"

echo "==> 开始合并 (--no-commit)..."
if git merge origin/main --no-commit; then
  echo "==> 合并成功，正在验证..."
  cd "$APP_DIR"
  if pnpm --filter @readest/readest-app exec tsgo --noEmit 2>&1 | grep 'error TS'; then
    echo "❌ 合并引入了类型错误，请修复后执行: git merge --continue"
    exit 1
  else
    echo "✅ 类型检查通过"
    echo "==> 提交合并..."
    git merge --continue
    echo "✅ 合并完成"
  fi
else
  echo "==> 有冲突需要手动解决"
  echo "    解决后运行: pnpm --filter @readest/readest-app exec tsgo --noEmit"
  echo "    通过后运行: git merge --continue"
fi
