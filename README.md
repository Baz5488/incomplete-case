# 未完製品入荷

Standalone web app (PWA) to control the 未完製品入荷 flow: each incomplete harness is tracked from arrival to work completion, with the department stamps and reports. Cases are stored in **its own Google Sheet** through a small Apps Script web app (nothing to do with the PROTO CONTROL Tracker).

Static files only, published with GitHub Pages: `https://baz5488.github.io/incomplete-case/`

## Flow

| Step | Who | Output |
|---|---|---|
| ハーネス品番情報 (数量・未完箇所・部品番号) | 生産管理、営業、技術部門、調達、品証、物流 | 確認印 |
| 理由 | 調達、技術部門、営業 | レポート |
| ハーネスの状態確認 | 生産管理 | レポート |
| 作業内容確認 (国内作業可否) | 技術部門 | 可 / 否 |
| ↳ 可: 作業部署の決定 (作業部署 + 作業担当者) | 営業、技術部門、調達、品証 | 確認印 |
| ↳ 可: BEIへ未完連絡 | 生産管理 | 連絡済 |
| ↳ 否: 納期調整 | 営業 | 新納期 |
| 国内部品確認 (在庫有無) | 調達 | 有 / 無 |
| 入荷情報 (インボイス番号・数量・ETA) | 生産管理 | 入荷情報 |
| ↳ 内容確認 | 6 departments | 確認印 |
| 作業着手 → 作業完了 | 作業担当 (the person named in 作業部署の決定 — usually 製造, sometimes 技術部門, 品証 or 営業) | 日付 |

- 作業着手 opens only after 作業部署の決定, 内容確認 and 国内部品確認 are done.
- 否: the case is complete after 納期調整 and the remaining checks; the 可-only steps show as 対象外.
- Changing 品番情報, 入荷情報 or the 作業部署 / 作業担当者 resets the stamps that confirmed them.

## Dashboard
- KPIs: open cases, waiting on my department, 納期超過 / ETA超過, completed this month.
- Per-department waiting counts (click to filter), progress bar, current step and waiting departments per case, search.
- Case page: the flow with stamps (hanko style), reports, comments and the full history.
- JSON export / import, CSV export (Excel).

## Data: Google Sheet
- The spreadsheet has a tab **INCOMPLETE_CASES**: one row per case with readable columns (品番, 状態, 現在のステップ, 対応待ち部署, ETA …) and the whole case as JSON in the hidden last column.
- Access is by two links (keys), made by `createIncompleteLinks()`:
  - **編集リンク** — departments and 作業担当: register cases, stamp, report.
  - **閲覧リンク** — read only (e.g. the factory side): the app hides 新規登録 / 削除 and disables every control.
- Opening a link connects that browser (the key is then removed from the address bar). Everyone picks 自分の部署 and enters their name the first time, so every stamp and report records who did it.
- Each save carries the revision it was based on: if someone else saved that case in between, the person is told and shown the latest version to redo their action, so nobody's stamp is overwritten.
- The app re-reads the sheet every minute and when the tab is opened again. Without a connection, changes are kept in the browser and sent when the sheet answers again.
- Don't edit the INCOMPLETE_CASES tab by hand (and never the hidden json column): use the app.
- Treat the links like passwords. To stop old links, run `resetIncompleteKeys()` and share the new links.

## Setup (once)

### 1. Spreadsheet and Apps Script
1. Create a new Google Sheet, e.g. `未完製品入荷`.
2. **Extensions → Apps Script**, replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs), save.
3. **Deploy → New deployment → ⚙ Web app**: *Execute as* **Me**, *Who has access* **Anyone** → Deploy (allow the permissions it asks for) → copy the **Web app URL** (ends in `/exec`).
4. Paste that URL into `INC_EXEC_URL` near the top of `Code.gs`, save.
5. Select `createIncompleteLinks` → **Run**. The log shows the 編集リンク and 閲覧リンク. Running it again keeps the same keys.

A script made at script.google.com (not from the sheet's Extensions menu) is not attached to a spreadsheet: `createIncompleteLinks` then creates one, **未完製品入荷**, in your Google Drive and logs its link. To use an existing spreadsheet instead, put its ID (the part of its link between `/d/` and `/edit`) into `INC_SPREADSHEET_ID` first.

When `Code.gs` changes later: paste the new version (keep your `INC_EXEC_URL`), then **Deploy → Manage deployments → Edit → Version: New version → Deploy** (the `/exec` URL stays the same).

### 2. Publish the app
GitHub → **Settings → Pages** → Deploy from a branch → `main` / `(root)` → Save. Open the 編集リンク and check the bar: `🔗 スプレッドシート連携中 · 編集`.

Without a link the app still works, but only in that browser (`💾 このブラウザのみに保存`).

## Moving the cases from the old Planner page
The old page (`manufacturing-lt/incomplete.html`) kept its cases in the Tracker's INCOMPLETE_CASES tab, which has the same layout:
1. In the Tracker spreadsheet, right-click the **INCOMPLETE_CASES** tab → **Copy to → Existing spreadsheet** → choose the new `未完製品入荷` spreadsheet.
2. In the new spreadsheet, delete its empty INCOMPLETE_CASES tab (made by `createIncompleteLinks`) and rename *Copy of INCOMPLETE_CASES* to **INCOMPLETE_CASES**. Hide the last column (json).

Or: in a browser that used the old page, open this app with the 編集リンク → **スプレッドシート連携 → スプレッドシートへアップロード** (cases already in the sheet are skipped).

## Files
- `index.html` — the app
- `apps-script/Code.gs` — the Apps Script for the spreadsheet
- `sw.js`, `manifest.json`, `icon.svg` — installable / offline app
