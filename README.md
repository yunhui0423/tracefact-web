# TraceFact Web

[正式工作臺](https://yunhui0423.github.io/tracefact-web/) · GitHub Pages · 免登入 · 紀錄依瀏覽器隔離

貼上訊息、拆解主張、尋找來源、核對引文，最後由人記錄覆核。AI 負責語意檢索，不自動判定真假。

## 使用方式與功能

1. 貼上訊息；句子不完整時，在「查核對象」補充人物、事件或設備，原句仍保留。
2. 預設為保守關鍵詞模式。不同措辭或跨語言查詢，可勾選 **AI 語意比對**；首次模型及執行元件下載約170 MB，建議 Wi-Fi。模型在本機 Web Worker 執行，可停止，失敗不會冒充成功。
3. 核對原文、日期、對象與條件。找到相似報告不等於主張獲得支持或反駁。
4. 引文必須逐字存在於收錄內文，不能只引用報告標題。只有標題時可先開原文、手動補入必要段落；手動資料會標示平台未自動核實，修改後重設覆核結論。
5. 填寫證據關係、理由與覆核人，下載 JSON／Markdown 報告。另有五大查核提示、來源關聯、時間排序及修改歷程。

沒有付費推論 API、使用者密鑰或 ChatGPT 登入。紀錄保存在瀏覽器 IndexedDB，語意查詢留在本機 Worker；外部下載請求用於取得模型，沒有把訊息送進推論 API。關鍵詞線上查詢會將抽出的關鍵詞送至台灣事實查核中心。清除網站資料、無痕視窗結束或空間回收可能失去紀錄；不同裝置不自動同步。

## 自動來源

| 管道 | 角色與使用依據 |
| --- | --- |
| [台灣事實查核中心](https://tfc-taiwan.org.tw/) | 獨立查核報告，最近300則標題與原站摘要；依[著作權聲明](https://tfc-taiwan.org.tw/copyright-notice/)作非營利研究並保留出處 |
| [衛福部即時澄清 RSS](https://www.mohw.gov.tw/www/rss-17-1.html) | 官方說明，保留標題、RSS必要段落與日期；依[政府網站資料開放宣告](https://www.mohw.gov.tw/cp-81-155-1.html)使用 |
| [行政院彙整部會澄清 RSS](https://www.ey.gov.tw/RSS_Content.aspx?ModuleType=7) | 原發布機關的官方說明，可能僅有標題；依[政府網站資料開放宣告](https://www.ey.gov.tw/Page/2EADDBFEDDB6357E)使用 |

本次建置420則，實際數量隨來源更新變動。三個管道不是三個獨立查核機構：官方立場不等於獨立證明，政府來源保守歸為同群，彙整頁與原文不重複計數。排程預定每六小時更新資料與向量，可能延後；網站顯示更新時間。來源或建置失敗時保留前一版網站。

資料並非全網，沒有追蹤封閉群組、刪除內容或真正網路首發者；引用與相似圖不等於真實傳播路徑。

## 模型

- 執行器：`@huggingface/transformers` 4.3.2，依賴以 package-lock.json 固定。
- [Xenova/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2)，revision `2c4055b12046f11709e9df2c122e59ffbdc2f900`。
- q8、384維、mean pooling、正規化、128 token。
- 推薦門檻：餘弦相似度至少0.65，與最佳候選相差不超過0.08，最多6則。不是校準過的真假機率。
- 公開來源向量於發布時預算，瀏覽器只算查詢向量；內容雜湊或模型版本不符的資料不套用舊向量。
- 開源執行元件授權文字隨網站發布；模型從 Hugging Face 固定 revision 下載，權重不提交原始碼。

## 評估與限制

「測試與能力」頁公開模型、抽樣ID、資料雜湊、指標、失敗例與完整JSON報告。

- 程式測試涵蓋片段錯配、同主題不同問題、引文、截止日期、官方角色與語意索引範圍。
- 六項小型案例只作回歸檢查，不當成整體準確率。
- 外部資料採 [CFEVER](https://ikmlab.github.io/CFEVER/)／[作者資料集](https://huggingface.co/datasets/IKMLab-team/cfever)的原始人工標註，固定hash排序抽樣1000個公開dev主張，排除無標註證據的NEI案例。
- 頁名代理評估：1000主張、474候選頁名。
- 證據句檢索：1000主張、1116候選句，包含樣本標註句與每個相關頁面的前兩個非空句。本次 AI Hit@5 為91.5%，BM25為98.6%；以每次發布報告為準。

**不是真假分類、全網搜尋、找齊多句證據集合或新聘獨立評審對產品的認證。** 公開dev不是盲測；模型可能遇過維基文本，同頁可能有多個改寫主張。AI不必然優於字詞基準，所以預設保留關鍵詞模式；語意模式用於跨語言與不同措辭探索。

## 開發與發布

Node.js 24，執行 `npm ci --ignore-scripts` 安裝固定依賴，依序執行：

```text
node scripts/build-retrieval.mjs
node scripts/update-feed.mjs
node scripts/build-semantic.mjs
node --test
node scripts/evaluate.mjs
node scripts/benchmark.mjs
node scripts/sentence-benchmark.mjs
```

將 `site/` 發布至 GitHub Pages。既有 Actions 已串接安裝、快取、更新、測試、外部評估與部署，也可手動執行。

模型、vendor、資料向量及第三方評估原始快取不提交原始碼，均由腳本建置。不要把個人查核紀錄或憑證放進儲存庫。
