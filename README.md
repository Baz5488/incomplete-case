# 未完製品入荷

Standalone web app (PWA) to control the 未完製品入荷 flow: each incomplete harness is tracked from arrival to work completion, with the department stamps and reports. Cases are stored in **its own Google Sheet** through a small Apps Script web app (nothing to do with the PROTO CONTROL Tracker).

Static files only, published with GitHub Pages: `https://baz5488.github.io/incomplete-case/`

## Flow

| Step | Who | Output |
|---|---|---|
| ハーネス品番情報 (数量・未完箇所・部品番号) | 生産管理、営業、技術部門、製造、調達、品証、物流 | 確認印 |
| 理由 | 調達、技術部門、営業 | レポート |
| ハーネスの状態確認 | 生産管理 | レポート |
| 作業内容確認 (国内作業可否) | 技術部門 | 可 / 否 |
| ↳ 可: 作業部署の決定 (作業部署 + 作業担当者) | 営業、技術部門、調達、品証 | 確認印 |
| ↳ 可: BEIへ未完連絡 | 生産管理 | 連絡済 |
| ↳ 否: 納期調整 | 営業 | 新納期 |
| ↳ 否: BEIへ部品発送日 | 調達 | 発送日 (+ 部品・AWB) |
| 国内部品確認 (在庫有無) | 調達 | 有 / 無 |
| 入荷情報 (インボイス番号・数量・ETA) | 生産管理 | 入荷情報 |
| ↳ 内容確認 | all 7 departments | 確認印 |
| 部品払出日 (可 and 在庫 有) | 調達 | 払出日 (+ 部品・数量) |
| 作業着手 → 作業完了 | 作業担当 (the person named in 作業部署の決定 — usually 製造, sometimes 技術部門, 品証 or 営業) | 日付 |

- 作業着手 opens only after 作業部署の決定, 内容確認, 国内部品確認 and — when 在庫 is 有 — 部品払出日 are done (barcode scans too).
- 部品払出日 and BEIへ部品発送日 were added in v1.4: for cases registered before, they can be filled in but are not required (対象外 (旧案件)).
- 否: the case is complete after 納期調整 and the remaining checks; the 可-only steps show as 対象外.
- 製造 stamps ハーネス品番情報 and 内容確認 since v1.2; a case whose six other stamps were all done before then keeps that step done.
- Changing 品番情報, 入荷情報 or the 作業部署 / 作業担当者 resets the stamps that confirmed them.

## Members: who may stamp and fill in what
- The spreadsheet has a tab **MEMBERS**: `部署 | 氏名 | PIN | メモ | 社員番号`, one row per person and department (someone in two departments has two rows, same name). **PIN**: leave it empty and the person's PIN is the **last 4 digits of the 社員番号** (other characters ignored, e.g. `TB-0012345` → `2345`); a PIN typed in (4–6 digits) is used instead. Only the spreadsheet owner should be able to open the spreadsheet, since it holds the PINs.
- Once MEMBERS lists anyone, people **log in** at the top right: pick their name, enter their PIN (once per phone / PC). Not logged in = see everything, change nothing.
- Each step can only be filled in by members of the departments under 誰が (e.g. 理由: 調達・技術部門・営業). Other steps are locked (🔒 …のメンバーのみ), and only your own departments' stamps can be pressed. 作業着手 / 作業完了 (and their scans): members of the 作業部署 chosen in 作業部署の決定; the 作業担当者 is picked from that department's members.
- The spreadsheet's script checks the same rules on every save (name, PIN, department), so they cannot be bypassed in the browser. A refused change is undone and the reason shown. 5 wrong PINs for a name → 10 minutes wait.
- New members, a changed PIN or department: edit MEMBERS; the app picks it up within a minute. A person removed from MEMBERS is logged out.
- Only **生産管理** can delete a case (the 削除 button is hidden for everyone else, and the script refuses it).
- While MEMBERS is empty, everyone with the 編集リンク can do everything (pick a department and type a name), as before.

## 完品作業依頼書 and barcodes (作業着手 / 作業完了)
- On the 作業着手 step, **🖨 完品作業依頼書** prints one A4 sheet for the 作業者 (available once 作業部署の決定 is done): 品番, 顧客, 数量, 未完箇所, 部品番号, 理由, 作業内容, 作業部署 / 担当, 国内部品, 入荷, 納期, sign boxes, and a **着手** and a **完了** code. The case shows 印刷済 with date and who printed it.
- Each code is printed twice:
  - **Barcode (Code 128)** `IC-<case>-S` / `IC-<case>-F` — for a handheld USB scanner on a PC with the app open (list or case page). No need to click a field; the keyboard input must be half-width (IME off). **▦ スキャン** also has an input box.
  - **QR code** — the app's address with `#scan=…`: a phone camera opens the app and records it (the phone's browser must be connected with the 編集リンク once).
- The PC / phone records the scan with its 自分の部署 and 担当者名, marked (スキャン) in the history. A beep and a green / red message show the result.
- A scan is refused (red) when it cannot apply: 着手 before 作業部署の決定, 内容確認 and 国内部品確認 are done, 完了 before 着手, a step already recorded, a 否 case, or a view-only link.

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

6. Fill in the **MEMBERS** tab (made by `createIncompleteLinks`): 部署 (from the list), 氏名, 社員番号 (PIN = its last 4 digits), or a PIN of their own.

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
- `vendor/JsBarcode.code128.min.js` — JsBarcode 3.12.3, Code 128 (MIT, `vendor/JsBarcode-LICENSE.txt`)
- `vendor/qrcode.js` — QR Code Generator for JavaScript 2.0.4 by Kazuhiko Arase (MIT, licence in the file header)
