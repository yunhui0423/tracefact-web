# 口袋帳本 Pocket Ledger

由 TraceFact 改為帳單辨識、語音記帳與收支分析網站。正式網址沿用：https://yunhui0423.github.io/tracefact-web/

## 功能

- 手動收入／支出、帳單圖片 OCR、裝置端 Whisper tiny 多語言語音轉文字。
- 辨識先產生可修改草稿，確認後才入帳；不會任意挑最大數字當帳單總額。
- 新台幣收入、支出、結餘、分類比例、六個月趨勢與月度預算。
- 修改、回收區還原、月份／收支／名稱篩選、JSON 備份還原與 CSV 匯出。
- 免登入，帳目存瀏覽器 IndexedDB，不跨裝置同步。沒有銀行連線或網路對帳。

## 執行

Node.js 24：

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test ledger-tests/*.test.mjs
node scripts/build-ledger.mjs
node scripts/preview-ledger.mjs
```

預覽 http://127.0.0.1:8813/ 。GitHub Actions 建置 `dist/` 並發布 Pages。首次 OCR／語音需連網下載模型，照片與音訊在裝置處理，不傳辨識伺服器。OCR 使用 Tesseract.js 6.0.1（中英語言），語音使用 Transformers.js 4.3.2 與 Xenova/whisper-tiny 固定版本 5332fcc35e32a33b86612b9a57a89be7906102b1，q8、WASM。辨識可能有錯字與金額錯誤，必須核對草稿。

## 資料邊界

帳目只保存在當前瀏覽器；清除網站資料、無痕模式結束或瀏覽器回收空間可能遺失。JSON 備份包含回收區；匯入僅新增不存在的識別碼，不覆蓋已有資料。預算設定留在裝置，未包含在帳目備份內。原始照片／音訊不寫入帳本。金額以整數分運算，所有統計以 TWD 為單位。

舊查核資料未刪除，仍在獨立 IndexedDB；不會轉成帳目。舊版 `site/`、`lib/` 與相關腳本保留作歷史參考，不再由正式發布流程部署；舊版首頁可從 GitHub 提交 c759cba5a6e6d9c877ccdf105e48069ddcde6718 取得。

## 驗證

`ledger-tests/` 涵蓋整數金額、日期、帳單實付／找零區別、中文語音文字草稿、統計排除回收資料、備份格式與 CSV 公式防護。這些測試不代表真實照片 OCR 或使用者語音準確率。實際辨識效果依影像、裝置、語音、背景噪音與模型下載可用性而異。

開源元件授權隨建置輸出為 THIRD-PARTY-LICENSES.txt。模型下載來源：https://huggingface.co/Xenova/whisper-tiny 。本網站沒有連接銀行、沒有代執行支付，也不提供財務建議。
