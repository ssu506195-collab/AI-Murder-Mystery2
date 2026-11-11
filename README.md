# 《紙妻》AI 劇本殺｜GitHub Pages 前端（v0.1.1-clean）

## 這個資料夾要做什麼？

**只把本資料夾裡面的所有檔案與 `assets/` 資料夾上傳到 GitHub Repository 根目錄。** 不要把外層 `01-GitHub-直接上傳` 資料夾名稱本身再包一層。

## 重要

- `index.html` 必須直接位於 GitHub Repository 根目錄。
- `app.js`、`styles.css`、`characters.json` 也必須與 `index.html` 同一層。
- `assets/` 必須與 `index.html` 同一層。
- 本資料夾不包含任何角色私有劇本。
- GitHub Pages 可先顯示角色選擇畫面；要真正開始遊戲，還必須部署 `02-後台部署專用` 裡的 Cloudflare Worker + D1，並在頁面貼上 Worker URL。

## GitHub Pages 設定

Repository → Settings → Pages：

1. Source 選 `Deploy from a branch`。
2. Branch 選 `main`。
3. Folder 選 `/(root)`。
4. 按 `Save`。

等待幾分鐘後，開啟 `https://你的帳號.github.io/你的Repository名稱/`。GitHub Pages 會以根目錄的 `index.html` 作為網站首頁。
