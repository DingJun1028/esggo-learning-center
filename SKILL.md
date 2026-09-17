---
name: esggo-learning-center
title: ESGGO Learning Center
description: >
  2026 Berkeley ESG Strategy & Innovation Program 學習中心
  查詢技能書請使用 skill://esggo-full-stack
triggers:
  - 開發 ESGGO Learning Center
  - 部署 Firebase
  - UI 清理
  - i18n 管理
pinned: false
---

# ESGGO Learning Center

本專案的技術文件已整合至 Hermes Agent 全局技能書中。

## 快速參考

- **完整技能書**：[ESGG0 全域全端技能書](skill://esggo-full-stack)
- **UI 清理指南**：[UI Cleanup 技能書](skill://esggo-learning-center-ui-cleanup)
- **快速參考**：[QUICKREF.md](skill://esggo-full-stack/QUICKREF.md)

## 相關技能書

| 技能書名稱 | 功能 |
|-------------|------|
| ESGGO 全域全端 | VPS 部署、Firebase、CI/CD、Docker 整合 |
| UI Cleanup | 介面清理、i18n 管理、部署驗證 |

## 常用指令

```bash
# 開發
pnpm run dev

# 測試
pnpm run test

# 建置
pnpm run build

# 部署 Firebase
firebase deploy --only hosting,firestore:rules

# 部署 Vercel
vercel --prod --yes
```

## 相關資源

- GitHub: https://github.com/DingJun1028/esggo-learning-center
- Firebase 專案: esggo-learning-center
- VPS: 161.118.252.147 (Ubuntu)
- 域名: https://esggo.co