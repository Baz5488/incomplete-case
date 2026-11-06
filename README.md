# 未完製品入荷フロー

Standalone web app (PWA) to control the 未完製品入荷 flow: each incomplete harness is tracked from arrival to work completion, with the department stamps and reports. Cases are stored in an **Excel workbook on SharePoint**; people sign in with their company Microsoft account.

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

## Data: SharePoint Excel
- The workbook gets a sheet and table **Cases**: one row per case with readable columns (品番, 状態, 現在のステップ, 対応待ち部署, ETA …) and the whole case as JSON in the hidden last column. The app creates them the first time someone with edit rights opens it.
- **Who can see / edit** is the workbook's SharePoint sharing: *Can edit* → 編集, *Can view* → 閲覧のみ (the app hides 新規登録 / 削除 and disables every control).
- The 担当者名 is the signed-in Microsoft account name, so every stamp and report records who did it.
- Each save re-reads the table and is written only if nobody saved that case in between; otherwise the person is told and shown the latest version to redo their action, so nobody's stamp is overwritten.
- 削除 marks the row 削除 (rows are never removed, so a row does not move while someone saves).
- The app re-reads the workbook every minute and when the tab is opened again. Without a connection, changes are kept in the browser and sent when the workbook answers again.
- Don't edit the Cases sheet by hand (and never the hidden json column): use the app. Sorting or filtering the sheet in Excel is fine.

## Setup (once)

### 1. Excel workbook
1. In the SharePoint site the departments use, create a blank Excel workbook, e.g. `未完製品入荷.xlsx`.
2. **Share**: departments (and 製造) *Can edit*; the factory side *Can view*.
3. **Share → Copy link** (people in your organization) — this is `workbookUrl`.

### 2. Microsoft Entra app registration (IT admin may be needed)
1. Entra admin center → **App registrations → New registration**
   - Name: `未完製品入荷フロー`
   - Supported account types: *Accounts in this organizational directory only*
   - Redirect URI: platform **Single-page application (SPA)**, `https://baz5488.github.io/incomplete-case/`
2. **API permissions → Add a permission → Microsoft Graph → Delegated → `Files.ReadWrite.All`** (keep `User.Read`).
   If your tenant does not let users consent to apps themselves, an admin clicks **Grant admin consent**.
3. From **Overview** copy the *Application (client) ID* and *Directory (tenant) ID*.

The app only acts as the signed-in person: it can open the workbook only if SharePoint lets that person open it.

### 3. Configure and publish
1. Fill in [`config.js`](config.js): `clientId`, `tenantId`, `workbookUrl`, and commit.
2. GitHub → **Settings → Pages** → Deploy from a branch → `main` / `(root)` → Save.
3. Open `https://baz5488.github.io/incomplete-case/`, **サインイン**, and check the bar: `🔗 SharePoint Excel · 編集`.

Without `config.js` the app still works, but only in that browser (`💾 このブラウザのみに保存`).

## Moving the cases from the old Planner page
The old page (`manufacturing-lt/incomplete.html`, cases in the Tracker's INCOMPLETE_CASES tab) is on the same site, so its cases are still in the browsers that used it:
1. Open the old page once so it syncs with the Tracker.
2. Open this app, sign in → **データ → Excel へアップロード**. Cases already in the workbook are skipped.

Or export JSON from the old page and use **JSON 読込** here.

## Files
- `index.html` — the app
- `config.js` — Entra app and workbook settings
- `sw.js`, `manifest.json`, `icon.svg` — installable / offline app
- `vendor/msal-browser.min.js` — Microsoft Authentication Library for JavaScript 4.30.0 (MIT, `vendor/MSAL-LICENSE`)
