# 漫旅 — 旅遊行程規劃（含同伴共同編輯）

用日期把旅程排成每日風景，也能用分享碼和旅遊同伴一起改行程。

## 功能

- 建立／編輯旅程與每日活動（景點、美食、交通、住宿）
- 本機儲存
- **分享碼共同編輯**：產生分享碼 → 同伴「加入同伴」輸入後，雙方約每 3 秒同步
- Android APK（Capacitor）

## 網頁開發

```bash
npm install
npm run dev
```

開啟 http://127.0.0.1:3000

本機未設定 `DATABASE_URL` 時會使用記憶體資料庫（PGlite），適合開發共同編輯。

## 建置

```bash
npm run build
npm start
```

## Android APK

```bash
npm run apk:debug
```

產出：`android/app/build/outputs/apk/debug/app-debug.apk`

APK 若要走雲端共同編輯，到 App「設定」填入已發布的漫旅網址；或直接用手機瀏覽器開啟網頁版與同伴協作。
