# AGENTS.md

## 專案脈絡

- **目標平台**：Firebase Hosting（`firebase.json` 為單一可信來源）。
- **技術棧**：Vite + React + Tailwind + Vitest。
- **目前分支**：`i18n-full-translation`，目標為完整繁體中文在地化，不接受英文 fallback。
- **使用者偏好**：繁體中文。

## 驗證順序

 modernity first，在宣傳任何變更前一律執行：

```
npm run test
npm run build
```

改動 i18n 字串、元件行為、路由或 Firebase 對應時，尤其不可跳過。

## Firebase 部署

- **安全預設**：使用 combined 部署。
  ```bash
  firebase deploy --only hosting,firestore:rules
  ```
- **hosting-only 快速路徑**：僅在確認 `firebase.json` 與 `.firebaserc` 完整、且本次無修改 `firestore.rules` 時使用。
- **驗證**：部署後必須重新跑一次 `npm run build` 並確認無連動回歸。

## 這個 repo 的路徑與環境

- 工作區在 `C:\Project\esggo-learning center`，含中文與空白；請在 tool call/script 中使用 POSIX/MSYS 風格路徑，例如 `/c/Project/esggo-learning center`。
- URL 與 Firebase config 以 `.env` 為唯一可信來源，勿在元件內硬編碼目標網址。
- `.env` 不得讀入也不得出現在任何輸出中。

## i18n 約定

- 使用者在這個專案里要求繁體中文；閱讀、輸出、錯誤訊息、UI 文案均使用繁體中文。
- 新增或修改字串時，請同步補上對應 i18n key，不要殘留未翻譯的硬編碼英文字串。

## 編輯與重構原則

- 小範圍修正使用 `patch`。
- 重寫整檔前先 read back 確認目前內容，避免遺漏 stale literal。
- Windows CJK 工作區以 read back 結果為準；write/patch 回報成功不構成最終答案，build 也不會發現殘留字串問題。
