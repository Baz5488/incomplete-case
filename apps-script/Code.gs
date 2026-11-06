/**
 * 未完製品入荷 — Apps Script for its own Google Sheet (standalone; nothing to do with the Tracker).
 *
 * Setup (see README.md):
 *   1. New Google Sheet → Extensions → Apps Script → replace Code.gs with this file.
 *   2. Deploy → New deployment → Web app — Execute as: Me, Who has access: Anyone → copy the /exec URL.
 *   3. Paste it into INC_EXEC_URL below, run createIncompleteLinks() and share the two links from the log.
 *
 * Cases are kept in the sheet tab INCOMPLETE_CASES: one row per case, readable columns for people who open
 * the sheet, and the full case as JSON in the last column (hidden).
 *
 * Access is by key:
 *   edit key — every department (and the 作業担当) that stamps / reports / registers cases
 *   view key — read only (e.g. the factory side that only needs to see the status)
 * and, once the MEMBERS tab lists people, by name + PIN: each step only for its departments' members.
 */

var INC_SHEET = 'INCOMPLETE_CASES';
// The published app; used only to build the links logged by createIncompleteLinks().
var INC_PAGE_URL = 'https://baz5488.github.io/incomplete-case/';
// This script's web app URL ending in /exec (Deploy → Manage deployments → Web app URL).
// Needed because a run from the editor only knows the /dev test URL.
var INC_EXEC_URL = '';
// Only for a script made at script.google.com (not from the sheet's Extensions → Apps Script): the spreadsheet ID,
// the long part of its link between /d/ and /edit. Leave empty and createIncompleteLinks() makes a new spreadsheet.
var INC_SPREADSHEET_ID = '';
var INC_HEAD = ['id', 'ハーネス品番', '顧客', '数量', '未完箇所', '顧客納期', '調整後納期', '国内作業', '作業部署', '作業担当者',
  'インボイス番号', 'ETA', '状態', '現在のステップ', '対応待ち部署', '登録日時', '更新日時', '更新者', 'rev', 'json'];
var INC_JSON_COL = INC_HEAD.length;      // 1-based column of the JSON
var INC_REV_COL = INC_HEAD.indexOf('rev') + 1;
var INC_MAX_JSON = 48000;                // a sheet cell holds 50,000 characters

/** Run once in the editor: creates the keys (if missing) and logs the links to share. */
function createIncompleteLinks() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('INC_EDIT_KEY')) p.setProperty('INC_EDIT_KEY', incNewKey_());
  if (!p.getProperty('INC_VIEW_KEY')) p.setProperty('INC_VIEW_KEY', incNewKey_());
  var exec = (INC_EXEC_URL || ScriptApp.getService().getUrl() || '').split('?')[0];
  if (!/\/exec$/.test(exec)) {
    Logger.log('⚠ Paste the web app URL of this script ending in /exec into INC_EXEC_URL at the top of this file, then run createIncompleteLinks again.\n' +
      '(Deploy → Manage deployments → Web app URL. The URL known to the editor is ' + exec + ', a test URL other people cannot open.)');
    return;
  }
  incSheet_(true);
  incMembersSheet_();
  Logger.log('スプレッドシート: ' + incSpreadsheet_().getUrl());
  var link = function (key) { return INC_PAGE_URL + '?sheet=' + encodeURIComponent(exec) + '&key=' + key; };
  Logger.log('編集リンク (各部署・作業担当):\n' + link(p.getProperty('INC_EDIT_KEY')));
  Logger.log('閲覧リンク (見るだけ):\n' + link(p.getProperty('INC_VIEW_KEY')));
}

/** Run to stop old links working (e.g. someone left). Then run createIncompleteLinks() and share the new links. */
function resetIncompleteKeys() {
  var p = PropertiesService.getScriptProperties();
  p.deleteProperty('INC_EDIT_KEY');
  p.deleteProperty('INC_VIEW_KEY');
  createIncompleteLinks();
}

function doGet(e) {
  return incompleteGet_(e) || HtmlService.createHtmlOutput('未完製品入荷: <a href="' + INC_PAGE_URL + '">' + INC_PAGE_URL + '</a>');
}

function doPost(e) {
  return incompletePost_(e) || incOut_({ ok: false, error: 'Unknown request' });
}

/** ?api=incomplete&key=…[&callback=…] → all cases. Returns null for other requests. */
function incompleteGet_(e) {
  var q = (e && e.parameter) || {};
  if (q.api !== 'incomplete') return null;
  var role = incRole_(q.key);
  if (!role) return incOut_({ ok: false, error: 'キーが違います。管理者に新しいリンクをもらってください。' }, q.callback);
  return incOut_({ ok: true, role: role, cases: incReadAll_().map(function (r) { return r.c; }), members: incMemberList_(),
    serverTime: new Date().toISOString() }, q.callback);
}

/** Body {api:"incomplete.save" | "incomplete.delete" | "incomplete.import", key, …}. Returns null for other requests. */
function incompletePost_(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return null; }
  if (!body || typeof body.api !== 'string' || body.api.indexOf('incomplete.') !== 0) return null;
  var role = incRole_(body.key);
  if (!role) return incOut_({ ok: false, error: 'キーが違います。管理者に新しいリンクをもらってください。' });
  if (role !== 'edit') return incOut_({ ok: false, error: '閲覧専用のリンクです。変更はできません。' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return incOut_({ ok: false, error: 'スプレッドシートが混み合っています。もう一度お試しください。' });
  if (body.api === 'incomplete.login') return incOut_(incLogin_(body));
  // With people in MEMBERS, every change needs a registered name + PIN.
  var member = incAuth_(body);
  if (member.error) return incOut_({ ok: false, auth: true, error: member.error });
  try {
    if (body.api === 'incomplete.save') return incOut_(incSave_(body, member));
    if (body.api === 'incomplete.delete') return incOut_(incDelete_(body, member));
    if (body.api === 'incomplete.import') return incOut_(incImport_(body));
    return incOut_({ ok: false, error: 'Unknown api ' + body.api });
  } finally {
    lock.releaseLock();
  }
}

// Save one case. baseRev must match the stored rev, otherwise someone else saved first: send theirs back.
function incSave_(body, member) {
  var c = body['case'];
  if (!c || !c.id) return { ok: false, error: 'case がありません。' };
  var sh = incSheet_(), found = incFind_(sh, c.id), baseRev = Number(body.baseRev) || 0;
  if (found) {
    if (found.c.rev !== baseRev) return { ok: false, conflict: true, 'case': found.c };
  } else if (baseRev) {
    return { ok: false, deleted: true };
  }
  var problem = member.name ? incCheckChange_(found ? found.c : null, c, member) : '';
  if (problem) return { ok: false, forbidden: true, error: problem, 'case': found ? found.c : null };
  c.rev = baseRev + 1;
  incWrite_(sh, found ? found.row : sh.getLastRow() + 1, c, body.summary || {});
  return { ok: true, rev: c.rev };
}

// Only 生産管理 deletes cases (checked when MEMBERS lists people).
function incDelete_(body, member) {
  if (member.name && member.depts.indexOf('生産管理') === -1) return { ok: false, forbidden: true, error: '案件を削除できるのは 生産管理 のメンバーだけです。' };
  var sh = incSheet_(), found = incFind_(sh, String(body.id || ''));
  if (found) sh.deleteRow(found.row);
  return { ok: true };
}

// Upload cases from a browser (local mode / JSON file). Cases already in the sheet are left as they are.
function incImport_(body) {
  var sh = incSheet_(), have = {}, added = 0;
  incReadAll_().forEach(function (r) { have[r.c.id] = true; });
  (body.cases || []).forEach(function (x) {
    if (!x || !x.c || !x.c.id || have[x.c.id]) return;
    x.c.rev = 1;
    incWrite_(sh, sh.getLastRow() + 1, x.c, x.summary || {});
    have[x.c.id] = true;
    added++;
  });
  return { ok: true, added: added };
}

/* =========================================================
 * MEMBERS: who may stamp / report for which department
 * Tab MEMBERS: 部署 | 氏名 | PIN (4-6 digits) | メモ. One row per person and department (a person in two
 * departments has two rows with the same name and PIN). While the tab has nobody, anyone with the edit link
 * can do everything (as before).
 * ========================================================= */
var INC_MEMBERS_SHEET = 'MEMBERS';
var INC_MEMBERS_HEAD = ['部署', '氏名', 'PIN', 'メモ'];
var INC_DEPTS = ['生産管理', '営業', '技術部門', '製造', '調達', '品証', '物流'];
// Who fills each step (same as the app). 'assigned' = the 作業部署 chosen in 作業部署の決定.
var INC_OWNERS = {
  info: INC_DEPTS, reason: ['調達', '技術部門', '営業'], condition: ['生産管理'], work: ['技術部門'],
  workDept: ['営業', '技術部門', '調達', '品証'], bei: ['生産管理'], schedule: ['営業'], parts: ['調達'],
  arrival: ['生産管理'], arrivalCheck: INC_DEPTS, issue: ['調達'], ship: ['調達'], start: 'assigned', finish: 'assigned'
};
var INC_STEP_NAMES = {
  info: 'ハーネス品番情報', reason: '理由', condition: 'ハーネスの状態確認', work: '作業内容確認', workDept: '作業部署の決定',
  bei: 'BEIへ未完連絡', schedule: '納期調整', parts: '国内部品確認', arrival: '入荷情報', arrivalCheck: '内容確認',
  issue: '部品払出日', ship: 'BEIへ部品発送日', start: '作業着手', finish: '作業完了'
};
var INC_PIN_TRIES = 5;   // wrong PINs per name before a 10-minute wait

function incMembersSheet_() {
  var ss = incSpreadsheet_(), sh = ss.getSheetByName(INC_MEMBERS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INC_MEMBERS_SHEET);
    sh.getRange(1, 1, 1, INC_MEMBERS_HEAD.length).setValues([INC_MEMBERS_HEAD]).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('B:C').setNumberFormat('@');  // PIN as text, so 0123 keeps its 0
    sh.getRange(2, 1, 200, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(INC_DEPTS, true).build());
  }
  return sh;
}

/** [{ dept, name, pin }] from MEMBERS (rows with a known department and a name). */
function incMembers_() {
  var sh = incMembersSheet_();  // made on first use, so the tab is there to fill in
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getDisplayValues().map(function (r) {
    return { dept: String(r[0]).trim(), name: String(r[1]).trim(), pin: String(r[2]).trim() };
  }).filter(function (m) { return m.name && INC_DEPTS.indexOf(m.dept) !== -1; });
}

/** For the app: [{ name, depts }] — no PINs. */
function incMemberList_() {
  var by = {}, order = [];
  incMembers_().forEach(function (m) {
    if (!by[m.name]) { by[m.name] = []; order.push(m.name); }
    if (by[m.name].indexOf(m.dept) === -1) by[m.name].push(m.dept);
  });
  return order.map(function (n) {
    return { name: n, depts: INC_DEPTS.filter(function (d) { return by[n].indexOf(d) !== -1; }) };
  });
}

/** { name, depts } for a correct name + PIN, { error } otherwise; {} when MEMBERS is empty (no check). */
function incAuth_(body) {
  var all = incMembers_();
  if (!all.length) return {};
  var name = String(body.member || '').trim(), pin = String(body.pin || '').trim();
  if (!name || !pin) return { error: 'ログインしてください (氏名と PIN)。' };
  var cache = CacheService.getScriptCache(), k = 'incpin:' + name, fails = Number(cache.get(k) || 0);
  if (fails >= INC_PIN_TRIES) return { error: 'PIN を続けて間違えたため、10 分後にもう一度お試しください。' };
  var mine = all.filter(function (m) { return m.name === name; });
  if (!mine.length || !mine.some(function (m) { return m.pin && m.pin === pin; })) {
    cache.put(k, String(fails + 1), 600);
    return { error: '氏名または PIN が違います。' };
  }
  return { name: name, depts: INC_DEPTS.filter(function (d) { return mine.some(function (m) { return m.dept === d; }); }) };
}

function incLogin_(body) {
  var m = incAuth_(body);
  if (m.error) return { ok: false, error: m.error };
  if (!m.name) return { ok: false, error: 'MEMBERS タブにまだ誰も登録されていません。' };
  return { ok: true, member: m };
}

/**
 * '' when this member may make the change from old case o to new case n, else the reason.
 * Each step that changed must belong to one of the member's departments; a stamp may only be added or
 * removed for the member's own department (removing others is allowed when what they confirmed changed,
 * which resets the stamps); a report / decision must carry the member's name.
 */
function incCheckChange_(o, n, m) {
  o = o || { steps: {} };
  var J = JSON.stringify, mine = function (list) { return list.some(function (d) { return m.depts.indexOf(d) !== -1; }); };
  var S = function (c, k) { return (c && c.steps && c.steps[k]) || {}; };
  // An empty stamp list is the same as none (a new case starts with empty lists).
  var N = function (x) { var y = {}; Object.keys(x).forEach(function (f) { if (f !== 'stamps' || Object.keys(x.stamps || {}).length) y[f] = x[f]; }); return y; };
  var infoChanged = ['qty', 'area', 'parts'].some(function (k) { return J(o[k]) !== J(n[k]); });
  var keys = Object.keys(INC_OWNERS);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i], a = N(S(o, k)), b = N(S(n, k));
    if (J(a) === J(b)) continue;
    var owners = INC_OWNERS[k] === 'assigned' ? [S(o, 'workDept').dept] : INC_OWNERS[k];
    if (!mine(owners)) return INC_STEP_NAMES[k] + ' は ' + owners.join('、') + ' のメンバーだけが記入できます。';
    if (a.stamps || b.stamps) {
      var sa = a.stamps || {}, sb = b.stamps || {};
      var reset = k === 'info' ? infoChanged : k === 'arrivalCheck' ? J(S(o, 'arrival')) !== J(S(n, 'arrival'))
        : (a.dept !== b.dept || a.worker !== b.worker);
      var depts = Object.keys(sa).concat(Object.keys(sb));
      for (var j = 0; j < depts.length; j++) {
        var d = depts[j];
        if (J(sa[d]) === J(sb[d])) continue;
        if (sb[d] && (m.depts.indexOf(d) === -1 || sb[d].by !== m.name)) return d + ' の確認印は ' + d + ' のメンバーが自分の名前で押してください。';
        if (!sb[d] && m.depts.indexOf(d) === -1 && !reset) return d + ' の確認印は ' + d + ' のメンバーだけが取り消せます。';
      }
    } else if (b.at && b.at !== a.at && b.by !== m.name) {
      return INC_STEP_NAMES[k] + ' はログインした本人の名前で記録してください。';
    }
  }
  return '';
}

function incWrite_(sh, row, c, sum) {
  c.log = (c.log || []).slice(0, 300);
  var json = JSON.stringify(c);
  while (json.length > INC_MAX_JSON && c.log.length > 20) { c.log = c.log.slice(0, Math.floor(c.log.length * 0.7)); json = JSON.stringify(c); }
  var s = c.steps || {}, g = function (k) { return s[k] || {}; }, last = (c.log || [])[0] || {};
  sh.getRange(row, 1, 1, INC_HEAD.length).setValues([[
    c.id, c.partNo || '', c.customer || '', c.qty || '', c.area || '', c.dueDate || '', g('schedule').newDue || '',
    g('work').value || '', g('workDept').dept || '', g('workDept').worker || '', g('arrival').invoice || '', g('arrival').eta || '',
    sum.status || '', sum.current || '', sum.waiting || '', (c.createdAt || '').slice(0, 16).replace('T', ' '),
    (last.at || '').slice(0, 16).replace('T', ' '), ((last.dept || '') + ' ' + (last.name || '')).trim(), c.rev, json
  ]]);
}

function incReadAll_() {
  var sh = incSheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, INC_JSON_COL, n, 1).getValues().map(function (v, i) {
    try { return { row: i + 2, c: JSON.parse(v[0]) }; } catch (err) { return null; }
  }).filter(function (r) { return r && r.c && r.c.id; });
}

function incFind_(sh, id) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return null;
  var ids = sh.getRange(2, 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      var json = sh.getRange(i + 2, INC_JSON_COL).getValue();
      try { return { row: i + 2, c: JSON.parse(json) }; } catch (err) { return { row: i + 2, c: { id: id, rev: Number(sh.getRange(i + 2, INC_REV_COL).getValue()) || 0 } }; }
    }
  }
  return null;
}

// The spreadsheet: the one this script belongs to, else INC_SPREADSHEET_ID, else the one createIncompleteLinks() made.
function incSpreadsheet_(create) {
  var ss = SpreadsheetApp.getActive();
  if (ss) return ss;
  var p = PropertiesService.getScriptProperties(), id = INC_SPREADSHEET_ID || p.getProperty('INC_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  if (!create) throw new Error('スプレッドシートがありません。管理者が Apps Script で createIncompleteLinks を実行してください。');
  ss = SpreadsheetApp.create('未完製品入荷');
  p.setProperty('INC_SPREADSHEET_ID', ss.getId());
  Logger.log('新しいスプレッドシートを作成しました。');
  return ss;
}

function incSheet_(create) {
  var ss = incSpreadsheet_(create);
  var sh = ss.getSheetByName(INC_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INC_SHEET);
    sh.getRange(1, 1, 1, INC_HEAD.length).setValues([INC_HEAD]).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.hideColumns(INC_JSON_COL);
  }
  return sh;
}

function incRole_(key) {
  key = String(key || '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(key)) return '';
  var p = PropertiesService.getScriptProperties();
  if (key === p.getProperty('INC_EDIT_KEY')) return 'edit';
  if (key === p.getProperty('INC_VIEW_KEY')) return 'view';
  return '';
}

function incNewKey_() { return Utilities.getUuid().replace(/-/g, '').toLowerCase(); }

function incOut_(obj, callback) {
  var text = JSON.stringify(obj);
  if (callback && /^[\w.]+$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + text + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
