/**
 * TYMN Fall Kickoff — Step 5: build leaderboard-data.json and commit it
 * ---------------------------------------------------------------------------
 * New file in the same Apps Script project as SheetScaffold.gs / OnSubmit.gs.
 *
 * Aggregates `Valid? = Yes` rows by canonical school, computes RP from the
 * `Config` tab, and writes `leaderboard-data.json` to the website repo via the
 * GitHub API — in the exact shape leaderboard.js reads. A daily time-trigger
 * republishes; once a week it snapshots rp → rpLastWeek (the ▲▼ arrows).
 *
 * SETUP
 *   1. Paste this file. Save. Run  ensureLeaderboardSetup .
 *   2. Create a GitHub fine-grained token: repo = texasyouthmusicnetwork/tymn,
 *      Permissions → Contents = Read and write. (The token's account needs
 *      write access to the repo.)
 *   3. Apps Script editor → Project Settings (gear) → Script Properties →
 *      add   GITHUB_TOKEN = <the token>.
 *   4. TYMN Review → "Preview leaderboard JSON", eyeball the preview tab.
 *   5. TYMN Review → "Publish leaderboard now". Check the repo + the live site.
 *   6. TYMN Review → "Install daily publish trigger".
 *
 * Defaults chosen for the open decisions (all changeable in Config):
 *   • Ensemble  = one Valid row = one submission (reviewers mark duplicate
 *                 ensemble videos "No" per the rubric).
 *   • Non-consenting standouts still earn RP; the consent flag only gates
 *     featuring them (a Step 8 concern), not scoring.
 *   • Submission cap = none ("Max submissions counted for RP" blank).
 *   • Consistency weeks = 7-day buckets from "Consistency week 1 starts",
 *     max 4; anything before that date counts as week 1.
 *   • status = "verified" iff the Schools tab Status is "verified", else "pending".
 *   • Snapshot day = Tuesday, matching the Sept 1 week boundaries, and skipped
 *     inside the last few days before close.
 */

const LEADERBOARD_CONFIG_DEFAULTS = [
  ['Max submissions counted for RP (blank = no cap)', ''],
  ['Consistency week 1 starts (YYYY-MM-DD)', '2026-09-01'],
  ['rpLastWeek snapshot weekday', 'Tuesday'],
  ['Skip snapshot within N days of close', 3],
  ['GitHub repo (owner/name)', 'texasyouthmusicnetwork/tymn'],
  ['GitHub branch', 'main'],
  ['GitHub file path', 'leaderboard-data.json'],
];

/**
 * Branches offered by the "Switch publish branch" menu item and the Config
 * dropdown. `main` is what GitHub Pages serves; publish to `dev` to stage a
 * standings change without touching the live site. Add branches here as needed —
 * the Config cell also accepts a typed-in name.
 */
const PUBLISH_BRANCHES = ['main', 'dev'];
const BRANCH_LABEL = 'GitHub branch';

const LB_PREVIEW_SHEET = 'Leaderboard (preview)';

/* ─────────────────────────── setup ─────────────────────────── */

function ensureLeaderboardSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureLeaderboardConfig_(ss);
  const has = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  ss.toast(
    'Leaderboard config seeded. Publishing to "' + publishBranch_() + '". ' +
    (has ? 'GITHUB_TOKEN is set.' : 'NEXT: add GITHUB_TOKEN in Project Settings → Script Properties.'),
    'TYMN Leaderboard', 10);
}

function ensureLeaderboardConfig_(ss) {
  const sh = ss.getSheetByName(CONFIG_SHEET) || ss.insertSheet(CONFIG_SHEET);
  const lastRow = Math.max(sh.getLastRow(), 1);
  const labels = lastRow >= 2
    ? sh.getRange(2, 3, lastRow - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); })
    : [];
  let writeRow = 2;
  for (let i = 0; i < labels.length; i++) if (labels[i] !== '') writeRow = i + 3;
  LEADERBOARD_CONFIG_DEFAULTS.forEach(function (pair) {
    if (labels.indexOf(pair[0]) === -1) {
      sh.getRange(writeRow, 3).setValue(pair[0]);
      sh.getRange(writeRow, 4).setValue(pair[1]);
      writeRow++;
    }
  });

  // Branch cell gets a dropdown so it can be switched without typing.
  const row = configRow_(sh, BRANCH_LABEL);
  if (row) {
    sh.getRange(row, 4).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(PUBLISH_BRANCHES, true)
        .setAllowInvalid(true)     // still allows a hand-typed branch name
        .setHelpText('Branch that "Publish leaderboard now" and the daily job commit to. ' +
          'main = the live site; dev = staging.')
        .build());
  }
}

/** 1-based row of a Config label in column C, or 0. */
function configRow_(sh, label) {
  if (!sh || sh.getLastRow() < 2) return 0;
  const vals = sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues();
  label = String(label).toLowerCase();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === label) return i + 2;
  }
  return 0;
}

/** The branch every commit in this file targets. */
function publishBranch_() {
  return String(cfgLike_('github branch', 'main')).trim() || 'main';
}

/**
 * Menu: switch the publish branch without hunting through the Config tab.
 * Cycles through PUBLISH_BRANCHES, or lets you type any branch name.
 */
function switchPublishBranch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const sh = ss.getSheetByName(CONFIG_SHEET);
  const row = configRow_(sh, BRANCH_LABEL);
  if (!row) {
    ui.alert('No "' + BRANCH_LABEL + '" row in Config — run "Set up leaderboard" first.');
    return;
  }
  const current = publishBranch_();
  const resp = ui.prompt(
    'Switch publish branch',
    'Currently publishing to: ' + current +
    '\n\nType a branch name (suggested: ' + PUBLISH_BRANCHES.join(', ') + ').' +
    '\n\nmain = the live site. dev = stage the JSON without changing the live leaderboard.',
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const next = resp.getResponseText().trim();
  if (!next) { ui.alert('No branch given — left on "' + current + '".'); return; }
  sh.getRange(row, 4).setValue(next);
  ss.toast('Leaderboard now publishes to "' + next + '".', 'TYMN Leaderboard', 6);
}

/* ─────────────────── config readers ────────────────────────── */

function cfgLike_(substr, dflt) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET);
  if (!sh || sh.getLastRow() < 2) return dflt;
  const rows = sh.getRange(2, 3, sh.getLastRow() - 1, 2).getValues();
  substr = String(substr).toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase().indexOf(substr) !== -1 && String(rows[i][0]).trim() !== '') {
      return rows[i][1];
    }
  }
  return dflt;
}
function cfgNum_(substr, dflt) {
  const v = parseFloat(cfgLike_(substr, dflt));
  return isNaN(v) ? dflt : v;
}

function loadScoringConfig_() {
  const capRaw = String(cfgLike_('max submissions counted for rp', '')).trim();
  const cap = parseInt(capRaw, 10);
  return {
    rpPerSub: cfgNum_('rp per valid submission', 100),
    rpPerCat: cfgNum_('unique category', 50),
    rpPerOutstanding: cfgNum_('outstanding performer', 400),
    rpConsistency: cfgNum_('consistency bonus rp', 100),
    milestones: [
      { at: 5, rp: cfgNum_('5 submissions milestone', 0) },
      { at: 10, rp: cfgNum_('10 submissions milestone', 0) },
      { at: 20, rp: cfgNum_('20 submissions milestone', 0) },
      { at: 40, rp: cfgNum_('40 submissions milestone', 0) },
    ],
    maxSubForRp: (!capRaw || isNaN(cap) || cap <= 0) ? Infinity : cap,
    week1Start: parseYmd_(cfgLike_('consistency week 1 starts', '2026-09-01')),
  };
}

/* ─────────────────── build the data ────────────────────────── */

function buildLeaderboardData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rs = getResponsesSheet_(ss);
  const rev = reviewColMap_(rs);
  if (!rev.valid || !rev.school) {
    throw new Error('Review columns not found — run "Set up / repair review sheet" first.');
  }
  const headers = headerMap_(rs);
  const catCol = findCol_(headers, 'category');

  const last = rs.getLastRow();
  const rows = last > 1 ? rs.getRange(2, 1, last - 1, rs.getLastColumn()).getValues() : [];
  const cfg = loadScoringConfig_();
  const schools = readSchoolsTab_(ss);
  const snapshot = readSnapshot_();

  const agg = {};
  let noSchoolValid = 0;

  rows.forEach(function (r) {
    if (String(r[rev.valid - 1]).trim() !== 'Yes') return;
    const school = String(r[rev.school - 1]).trim();
    if (!school) { noSchoolValid++; return; }
    const a = agg[school] || (agg[school] = { subs: 0, cats: {}, outstanding: 0, weeks: {} });
    a.subs++;
    const cat = catCol ? String(r[catCol - 1]).trim() : '';
    if (cat) a.cats[cat] = 1;
    if (rev.confirm && String(r[rev.confirm - 1]).trim() === 'Yes') a.outstanding++;
    const wk = weekIndex_(r[0], cfg.week1Start);
    if (wk >= 0) a.weeks[wk] = 1;
  });

  const data = Object.keys(agg).map(function (name) {
    const a = agg[name];
    const info = schools[name.toLowerCase()] || {};
    const uniqueCats = Object.keys(a.cats).length;
    const weeks = Math.min(Object.keys(a.weeks).length, 4);
    const cappedSubs = Math.min(a.subs, cfg.maxSubForRp);
    const milestoneRp = cfg.milestones.reduce(
      function (s, m) { return s + (a.subs >= m.at ? m.rp : 0); }, 0);
    const rp = Math.round(
      cappedSubs * cfg.rpPerSub +
      uniqueCats * cfg.rpPerCat +
      a.outstanding * cfg.rpPerOutstanding +
      weeks * cfg.rpConsistency +
      milestoneRp);
    const display = info.name || name;
    return {
      school: display,
      city: info.city || '',
      status: info.status === 'verified' ? 'verified' : 'pending',
      rp: rp,
      rpLastWeek: (display in snapshot) ? snapshot[display] : null,
      submissions: a.subs,
      uniqueInstruments: uniqueCats,
      outstandingPerformers: a.outstanding,
    };
  });

  data.sort(function (x, y) { return y.rp - x.rp || x.school.localeCompare(y.school); });
  return { data: data, noSchoolValid: noSchoolValid };
}

function weekIndex_(ts, week1Start) {
  const d = (ts instanceof Date) ? ts : new Date(ts);
  if (isNaN(d.getTime())) return -1;
  const days = Math.floor((d.getTime() - week1Start.getTime()) / 86400000);
  if (days < 0) return 0;
  const wk = Math.floor(days / 7);
  return wk > 3 ? 3 : wk;
}

function readSchoolsTab_(ss) {
  const sh = ss.getSheetByName(SCHOOLS_SHEET);
  const map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    const name = String(r[0]).trim();
    if (!name) return;
    map[name.toLowerCase()] = {
      name: name,
      city: String(r[1]).replace(/,.*$/, '').trim(),
      status: String(r[3]).trim().toLowerCase(),
    };
  });
  return map;
}

/* ─────────────────── snapshot (rpLastWeek) ─────────────────── */

function readSnapshot_() {
  const raw = PropertiesService.getScriptProperties().getProperty('rpSnapshot');
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}

function writeSnapshot_(data) {
  const map = {};
  data.forEach(function (s) { map[s.school] = s.rp; });
  const props = PropertiesService.getScriptProperties();
  props.setProperty('rpSnapshot', JSON.stringify(map));
  props.setProperty('rpSnapshotISO', new Date().toISOString());
}

/**
 * Snapshot rp → rpLastWeek at most once a week, on the configured weekday.
 * Skipped inside the closing window so the final standings show a full week of
 * movement instead of a stub — e.g. with weeks starting Tue Sept 1, the Sept 29
 * snapshot is suppressed and the closing arrows measure from Sept 22.
 */
function maybeWeeklySnapshot_(data) {
  const wanted = String(cfgLike_('snapshot weekday', 'Tuesday')).trim().toLowerCase();
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const now = new Date();
  if (names[now.getDay()] !== wanted) return false;

  const lastISO = PropertiesService.getScriptProperties().getProperty('rpSnapshotISO');
  const daysSince = lastISO ? (Date.now() - new Date(lastISO).getTime()) / 86400000 : 999;
  if (daysSince < 6) return false;

  const buffer = cfgNum_('skip snapshot within', 3);
  const close = parseYmd_(cfgLike_('challenge close date', '2026-09-30'));
  const daysToClose = (close.getTime() - now.getTime()) / 86400000;
  if (daysToClose >= 0 && daysToClose < buffer) return false;

  writeSnapshot_(data);
  return true;
}

function snapshotStandingsNow() {
  const res = buildLeaderboardData();
  writeSnapshot_(res.data);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Snapshotted rp for ' + res.data.length + ' schools as this week\'s baseline.',
    'TYMN Leaderboard', 6);
}

/* ─────────────────── publish / commit ──────────────────────── */

function publishLeaderboard() {
  const branch = publishBranch_();
  const res = buildLeaderboardData();
  writePreviewTab_(res);
  const json = JSON.stringify(res.data, null, '\t') + '\n';
  const committed = commitLeaderboardFile_(json);
  const snapped = maybeWeeklySnapshot_(res.data);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    (committed ? 'Committed leaderboard-data.json to "' + branch + '". '
               : 'No change — nothing committed to "' + branch + '". ') +
    res.data.length + ' schools' +
    (res.noSchoolValid ? ', ' + res.noSchoolValid + ' valid rows with no school (ignored)' : '') +
    (snapped ? '. Weekly snapshot taken.' : '') + '.',
    'TYMN Leaderboard', 10);
}

function previewLeaderboard() {
  const res = buildLeaderboardData();
  writePreviewTab_(res);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setActiveSheet(ss.getSheetByName(LB_PREVIEW_SHEET));
}

function commitLeaderboardFile_(newContent) {
  const repo = String(cfgLike_('github repo', 'texasyouthmusicnetwork/tymn')).trim();
  const branch = publishBranch_();
  const path = String(cfgLike_('github file path', 'leaderboard-data.json')).trim();
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Set GITHUB_TOKEN in Project Settings → Script Properties.');

  const url = 'https://api.github.com/repos/' + repo + '/contents/' +
    path.split('/').map(encodeURIComponent).join('/');
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let sha = null;
  let current = null;
  const get = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(branch),
    { headers: headers, muteHttpExceptions: true });
  if (get.getResponseCode() === 200) {
    const j = JSON.parse(get.getContentText());
    sha = j.sha;
    // GitHub returns base64 wrapped at 60 chars — strip whitespace before decode.
    current = Utilities.newBlob(
      Utilities.base64Decode(String(j.content || '').replace(/\s/g, ''))).getDataAsString();
  } else if (get.getResponseCode() !== 404) {
    throw new Error('GitHub GET ' + get.getResponseCode() + ': ' + get.getContentText().slice(0, 300));
  }
  if (current !== null && current === newContent) return false;

  const payload = {
    message: 'leaderboard: update standings (' + isoDay_() + ')',
    content: Utilities.base64Encode(newContent, Utilities.Charset.UTF_8),
    branch: branch,
  };
  if (sha) payload.sha = sha;

  const put = UrlFetchApp.fetch(url, {
    method: 'put', headers: headers, contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  if (put.getResponseCode() >= 300) {
    throw new Error('GitHub PUT ' + put.getResponseCode() + ': ' + put.getContentText().slice(0, 300));
  }
  return true;
}

/* ─────────────────── preview tab ───────────────────────────── */

function writePreviewTab_(res) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(LB_PREVIEW_SHEET);
  if (!sh) sh = ss.insertSheet(LB_PREVIEW_SHEET);
  sh.clear();
  const head = ['rank', 'school', 'city', 'status', 'rp', 'rpLastWeek',
    'submissions', 'uniqueInstruments', 'outstandingPerformers'];
  const body = res.data.map(function (s, i) {
    return [i + 1, s.school, s.city, s.status, s.rp,
      s.rpLastWeek === null ? '(new)' : s.rpLastWeek,
      s.submissions, s.uniqueInstruments, s.outstandingPerformers];
  });
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  if (body.length) sh.getRange(2, 1, body.length, head.length).setValues(body);
  sh.getRange(body.length + 3, 1).setValue(
    'Generated ' + new Date() + '  ·  publishes to branch "' + publishBranch_() + '"' +
    (res.noSchoolValid ? '  ·  ' + res.noSchoolValid + ' valid rows have no canonical school (ignored)' : ''));
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, head.length);
}

/* ─────────────────── trigger ───────────────────────────────── */

function installLeaderboardTrigger() {
  const have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('publishLeaderboard') === -1) {
    ScriptApp.newTrigger('publishLeaderboard').timeBased().everyDays(1).atHour(6).create();
  }
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Daily leaderboard publish installed (~6am). It only commits when standings changed.',
    'TYMN Leaderboard', 8);
}

/* ─────────────────── utils ─────────────────────────────────── */

function parseYmd_(s) {
  if (s instanceof Date) return s;
  const m = String(s).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date(2026, 8, 1) : d;
}
function isoDay_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
