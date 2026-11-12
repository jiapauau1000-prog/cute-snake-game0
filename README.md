# 漫旅 — 旅遊行程規劃（Android APK）

用日期把旅程排成每日風景：建立旅程、依天加入景點／美食／交通／住宿。資料保存在裝置本機。

## 網頁開發

```bash
npm install
npm run dev
```

## 建置 Android APK

需要本機已安裝 JDK 17+ 與 Android SDK。

```bash
npm install
npm run apk:debug
```

產出檔案：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

把 APK 傳到手機後允許「未知來源」即可安裝。

正式簽章版：

```bash
npm run apk:release
```

（需自行配置 keystore。）
