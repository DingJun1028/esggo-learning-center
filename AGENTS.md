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

## 報告與步驟缺口約定

- 執行任何有編號的驗證/流程（如 pre-commit review 的 Step 1–8）時，**每一個步驟編號都要交代**：被正確跳過的步驟（例如無失敗故跳過 auto-fix、無 linter 故跳過 lint）必須顯式標註「Step N：skipped（原因）」，不得讓編號從 N 直接跳到 N+2。
- **禁止用理由把缺口合理化掉**：不得以「不需要」「skill 沒要求」等說法繞過缺口。跳過或漏做的步驟就照實報「skipped / missed + 原因」，永遠不要狡辯。
- 報告缺口是誠實問題，不是格式問題：即便跳過本身是對的，不說出來也視為報告缺陷。

## Firebase 部署

- **安全預設**：使用 combined 部署。
  ```bash
  firebase deploy --only hosting,firestore:rules
  ```
- **hosting-only 快速路徑**：僅在確認 `firebase.json` 與 `.firebaserc` 完整、且本次無修改 `firestore.rules` 時使用。
- **驗證**：部署後必須重新跑一次 `npm run build` 並確認無連動回歸。

## 這個 repo 的路徑與環境

- 工作區在 `C:\\Project\\esggo-learning-center`（hyphen、無空白）；請在 tool call/script 中使用 POSIX/MSYS 風格路徑，例如 `/c/Project/esggo-learning-center`。
- URL 與 Firebase config 以 `.env` 為唯一可信來源，勿在元件內硬編碼目標網址。
- `.env` 不得讀入也不得出現在任何輸出中。

## i18n 約定

- 使用者在這個專案里要求繁體中文；閱讀、輸出、錯誤訊息、UI 文案均使用繁體中文。
- 新增或修改字串時，請同步補上對應 i18n key，不要殘留未翻譯的硬編碼英文字串。

## 已知 bug 狀態（2026-07-20 實查）

以下曾列於開發者 memory 的「待修 5 個 runtime bug」經實際讀取 main 分支程式碼後確認**已全部修復**，勿重複修：

- `pairing.repository.js` 缺 `getDoc` import → 已 import（第 10 行）且使用（第 65 行）。
- `submission.repository.js` 缺 `emitTelemetry` import → 已 import（第 15 行）且使用（第 70 行）。
- `App.jsx` 用 `s.timestamp` 而非 `createdAt` → 已改為防禦寫法 `(s.createdAt || s.timestamp)`（第 1011 行）。
- `App.jsx` `setSubmissions` 未宣告 → 已宣告（第 402 行 `const [submissions, setSubmissions] = useState([])`）。
- `AttachmentUploader` 缺 `t` prop → 元件定義於 App.jsx 內，2 個 call site（677、762 行）皆傳 `t={t}`。

驗證基準：PR#3 合併後 `main` 分支 `npm run test` 8/8 通過、`npm run build` 成功（exit=0）。
動手修任何「已知 bug」前，先以當前程式碼為準確認其仍存在，勿依賴過期 memory。

## 編輯與重構原則

- 小範圍修正使用 `patch`。
- 重寫整檔前先 read back 確認目前內容，避免遺漏 stale literal。
- Windows CJK 工作區以 read back 結果為準；write/patch 回報成功不構成最終答案，build 也不會發現殘留字串問題。
