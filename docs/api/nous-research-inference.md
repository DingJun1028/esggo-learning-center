---
title: Nous Research Inference API 整合指南
date: 2026-08-04
tags: [api, inference, nous-research, oauth, esggo]
author: OA-Team 30 / Hermes Agent
status: draft
---

# Nous Research Inference API 整合指南

## 概述

Nous Research 提供兼容 OpenAI 格式的 Inference API，後端為 Hermes 模型系列。API 基礎路徑為 `https://inference-api.nousresearch.com/v1`，可用於 ESGGO-OA Dashboard 的 OAuth 流程中作為模型後端。

## 認證方式

### 方式一：API Key（推薦）

1. 在 https://portal.nousresearch.com 註冊帳戶
2. 充值 API 額度或啟用訂閱
3. 生成 API Key
4. 將 API Key 設為 Bearer Token 加入 Authorization Header

```bash
curl -H "Authorization: Bearer $NOUS_API_KEY" \
  https://inference-api.nousresearch.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### 方式二：x402 協定（Beta）

基於 Solana USDC 的链上支付，無需註冊帳戶。

1. 準備 Solana 錢包並存入 USDC
2. 發送推理請求（不带 Authorization Header）
3. 收到 402 回應後，構建支付簽名
4. 帶 `X-PAYMENT` Header 重新發送請求

> **注意**：x402 协议要求在請求前確定 `max_tokens`，無論實際使用量如何，均按 `max_tokens` 參數計費。

## Rate Limits

| 方案 | RPM | TPM |
|------|-----|-----|
| Ultra | 1,600 | 16,000,000 |
| Free | 50 | 500,000 |
| Super | 800 | 8,000,000 |
| Plus | 400 | 4,000,000 |
| Default Paid | 180 | 720,000 |

## 可用模型

| 模型 | Context Window |
|------|---------------|
| Hermes-4.3-36B | 128k |
| Hermes-4-70B | 128k |
| Hermes-4-405B | 128k |

## 端點參考

### Chat Completions

```
POST /chat/completions
```

**請求體例**：

```json
{
  "model": "Hermes-4.3-36B",
  "prompt": "Once upon a time",
  "max_tokens": 60,
  "temperature": 0.8,
  "stream": true
}
```

### Completions（兼容 OpenAI Completions API）

```
POST /completions
```

## 推理啟動指南（Hermes 4 / DeepHermes）

在系統提示中加入以下內容以啟用深度推理：

```
You are a deep thinking AI, you may use extremely long chains of thought to deeply consider the problem and deliberate with yourself via systematic reasoning processes to help come to a correct solution prior to answering. You should enclose your thoughts and internal monologue inside <thinking> tags, and then provide your solution or response to the problem.
```

### 推理輸出位置

- **Deep Hermes 3**：推理輸出始終位於 `<thinking>` 標籤之間
- **Hermes 4（帶 prefill）**：若 prefill 含 `<thinking>`，推理輸出同樣在標籤之間
- **Hermes 4（系統提示方式）**：若不 prefill，推理輸出出現在 `reasoning_content` 字段中

## ESGGO-OA Dashboard OAuth 整合

### OAuth Callback 鏈接

```
Dashboard Redirect URI: https://hermes.esggo.com/auth/callback
```

在 OAuth callback 處理流程中，可將 Nous API Key 注入推理請求：

1. 用戶通過 OAuth 登入 Dashboard
2. Callback 攜帶 token 至 `https://hermes.esggo.com/auth/callback`
3. 後端驗證 token 後，從 GitHub Secrets / Vault 載入 `NOUS_API_KEY`
4. 使用該 Key 調用 `https://inference-api.nousresearch.com/v1/chat/completions`
5. 將推理結果返回給用戶

### GitHub Secrets 配置

```bash
# 存入 esggo 倉庫
gh secret set NOUS_API_KEY --body "<NOUS_API_KEY>" --repo DingJun1028/esggo

# 存入 esggo-learning-center 倉庫
gh secret set NOUS_API_KEY --body "<NOUS_API_KEY>" --repo DingJun1028/esggo-learning-center
```

### 金鑰輪換流程

參見 `esggo-key-rotation` skill，將 `NOUS_API_KEY` 加入金鑰清單：

| 金鑰 | 平台 | 更新方式 |
|------|------|----------|
| NOUS_API_KEY | GitHub Secrets | `gh secret set` |

輪換後務必更新 GitHub Secrets 並重新驗證 API 連接。

## 安全性注意事項

- API Key 屬於敏感憑證，永遠不應硬編碼或提交至版本控制
- 使用 `.env` 文件管理本地開發環境
- GitHub Secrets 為只寫接口（值不可讀回）
- 建議在每次 key 透過聊天傳遞後進行輪換
- x402 支付的金額由 `max_tokens` 參數決定，建議明確設定以避免過度扣費
