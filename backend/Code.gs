/**
 * Calibration coding site for the scoping review of communication research on generative AI
 * in higher-education teaching and learning. Author: Chengyu Fang.
 *
 * Anyone with the link can open the coding page. A coder enters the code from the Coders tab, and
 * each decision is saved to a separate data spreadsheet within a second or two, so coders can stop
 * and pick up again on any computer. Coders need no account.
 *
 * Setup (the Read me tab of the spreadsheet has the full steps):
 *   1. Paste this whole file into Code.gs in Extensions > Apps Script, and save.
 *   2. Choose the function "setup" in the toolbar and click Run. Allow the permissions it asks for.
 *   3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Deploy.
 *   4. Put the deployment URL in docs/ai-and-education/config.js. Send coders the project page and their code.
 */

var TABS = {records: 'Records', coders: 'Coders', settings: 'Settings', progress: 'Progress', codebook: 'Codebook'};
var DATA_TITLE = 'Calibration coding data (sealed until coding ends)';
var DEC_HEAD = ['coder_code', 'coder', 'record_no', 'set', 'topic', 'setting', 'communication', 'publication',
  'decision', 'exclusion_code', 'theory_named', 'notes', 'set_by_hand', 'seconds_on_record', 'highlights_on',
  'codebook_version', 'decided_at_utc', 'client_ms', 'saved_at_utc'];
var COL = {};
DEC_HEAD.forEach(function (h, i) { COL[h] = i; });
var PROGRESS_HEAD = ['Code', 'Coder', 'Development coded', 'Development total', 'Test coded', 'Test total', 'Last saved (UTC)'];
var ANSWER_OUT = {y: 'yes', n: 'no', u: 'cannot tell'};
var ANSWER_IN = {'yes': 'y', 'no': 'n', 'cannot tell': 'u'};
var DATA_ROWS = 3000;                                         // rows kept as plain text in the data sheet

function doGet(e) {
  var channel = String(e && e.parameter.channel || '');
  if (!/^[a-zA-Z0-9-]{20,100}$/.test(channel)) return HtmlService.createHtmlOutput('Open this project from its Qualitative Coding website.');
  return HtmlService.createHtmlOutput(BRIDGE_HTML.replace('__CHANNEL__', channel))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Run once from the editor. Links the script to this spreadsheet and creates the data spreadsheet. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Open the script from the coding spreadsheet (Extensions > Apps Script), then run setup again.');
  ['records', 'coders', 'settings'].forEach(function (k) {
    if (!book.getSheetByName(TABS[k])) throw new Error('The spreadsheet has no "' + TABS[k] + '" tab. Upload the setup workbook again and save it as a Google Sheet.');
  });
  props.setProperty('BOOK_ID', book.getId());
  if (!book.getSheetByName(TABS.progress)) book.insertSheet(TABS.progress).appendRow(PROGRESS_HEAD);
  var data = null, dataId = props.getProperty('DATA_ID');
  if (dataId) { try { data = SpreadsheetApp.openById(dataId); } catch (e) { data = null; } }
  if (!data) {
    data = SpreadsheetApp.create(DATA_TITLE);
    var sh = data.getSheets()[0];
    sh.setName('Decisions');
    if (sh.getMaxRows() < DATA_ROWS) sh.insertRowsAfter(sh.getMaxRows(), DATA_ROWS - sh.getMaxRows());
    sh.getRange(1, 1, DATA_ROWS, DEC_HEAD.length).setNumberFormat('@');   // keep every value as typed text
    sh.getRange(1, 1, 1, DEC_HEAD.length).setValues([DEC_HEAD]);
    sh.setFrozenRows(1);
    props.setProperty('DATA_ID', data.getId());
  }
  setSetting_(book, 'data_file', data.getUrl(), 'Where the decisions are kept. Don\'t open it until everyone, you included, has finished coding.');
  var n = records_(book).length, coders = table_(book.getSheetByName(TABS.coders)).filter(function (r) { return String(r.code || '').trim(); }).length;
  Logger.log('Setup done: ' + n + ' records, ' + coders + ' coder codes. Decisions will be kept in ' + data.getUrl());
  return data.getUrl();
}

/** Called by the page when a coder enters their code. */
function start(code) {
  var book = book_();
  var who = coder_(book, code);
  if (!who) return {ok: false, error: 'unknown_code'};
  var s = settings_(book);
  var testOpen = truthy_(s.test_open);
  var all = records_(book);
  var mine = saved_(who.code);
  var devDone = all.filter(function(r){return r.set === 'dev';}).every(function(r){return complete_(mine[r.n]);});
  testOpen = testOpen && devDone;
  var totals = {dev: 0, test: 0};
  all.forEach(function (r) { if (totals[r.set] !== undefined) totals[r.set]++; });
  return {
    ok: true, coder: who.name, code: who.code,
    settings: {testOpen: testOpen, codebook: text_(s.codebook_version), message: text_(s.message),
      questions: {topic: text_(s.q_topic), setting: text_(s.q_setting), comm: text_(s.q_comm), pub: text_(s.q_pub)}},
    totals: totals,
    records: all.filter(function (r) { return r.set === 'dev' || (testOpen && r.set === 'test'); }),
    codebook: codebook_(book),
    saved: Object.keys(mine).reduce(function(out, n){ if(all.some(function(r){return String(r.n) === n && (r.set === 'dev' || testOpen);})) out[n] = mine[n]; return out; }, {})
  };
}

/** Called by the page to save changed records. Each item: {n, topic, setting, comm, pub, decision, code, theory, notes, manual, secs, hl, ts}. */
function save(code, items) {
  var book = book_();
  var who = coder_(book, code);
  if (!who) return {ok: false, error: 'unknown_code'};
  if (!Array.isArray(items) || items.length > 500) return {ok:false, error:'invalid_batch'};
  if (!items.length) return {ok: true, saved: 0};
  var latest = {};                                          // one item per record, the newest
  items.forEach(function (it) {
    var n = Number(it && it.n);
    if (!n) return;
    if (!latest[n] || (Number(it.ts) || 0) >= (Number(latest[n].ts) || 0)) latest[n] = it;
  });
  var sets = sets_(book);
  var version = text_(settings_(book).codebook_version);
  var W = DEC_HEAD.length;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var hasTest = Object.keys(latest).some(function(n){return sets[n] === 'test';});
    if (hasTest) {
      var mine = saved_(who.code);
      var devDone = Object.keys(sets).filter(function(n){return sets[n] === 'dev';}).every(function(n){return complete_(mine[n]);});
      if (!truthy_(settings_(book).test_open) || !devDone) return {ok:false,error:'test_locked'};
    }
    if (Object.keys(latest).some(function(n){var it=latest[n];return !sets[n] || !Number.isFinite(Number(it.ts)) || Number(it.ts)<=0 || Number(it.ts)>Date.now()+300000;})) return {ok:false,error:'invalid_record'};
    var sh = decisions_();
    var last = Math.max(1, sh.getLastRow());
    var vals = sh.getRange(1, 1, last, W).getValues();
    var where = {};
    for (var i = 1; i < vals.length; i++) where[norm_(vals[i][COL.coder_code]) + '|' + String(vals[i][COL.record_no])] = i;
    var now = new Date().toISOString(), saved = 0, lo = -1, hi = -1;
    var mark = function (i) { if (lo < 0 || i < lo) lo = i; if (i > hi) hi = i; };
    Object.keys(latest).forEach(function (k) {
      var it = latest[k], n = Number(k);
      if (!sets[n]) return;                                  // not a record of this sample
      var row = toRow_(who, n, sets[n], it, version, now), at = where[norm_(who.code) + '|' + n];
      if (at) {
        var stored = Number(vals[at][COL.client_ms]) || 0;
        if ((Number(it.ts) || 0) < stored) return;           // an older copy never overwrites a newer one
        vals[at] = row;
        mark(at);
      } else {
        vals.push(row);
        where[norm_(who.code) + '|' + n] = vals.length - 1;
        mark(vals.length - 1);
      }
      saved++;
    });
    if (lo >= 0) {
      var block = sh.getRange(lo + 1, 1, hi - lo + 1, W);
      block.setNumberFormat('@');
      block.setValues(vals.slice(lo, hi + 1));
    }
    var counts = progress_(book, who, vals, sets, now);
    return {ok: true, saved: saved, at: now, counts: counts};
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- helpers ---------------- */

function book_() {
  var id = PropertiesService.getScriptProperties().getProperty('BOOK_ID');
  if (!id) throw new Error('The coding site is not set up yet. Chengyu needs to run setup in the script editor.');
  return SpreadsheetApp.openById(id);
}
function decisions_() {
  var id = PropertiesService.getScriptProperties().getProperty('DATA_ID');
  if (!id) throw new Error('The coding site is not set up yet. Chengyu needs to run setup in the script editor.');
  return SpreadsheetApp.openById(id).getSheetByName('Decisions');
}
function norm_(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function table_(sheet) {
  var v = sheet.getDataRange().getValues();
  if (!v.length) return [];
  var head = v.shift().map(function (h) { return String(h).trim().toLowerCase(); });
  return v.map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o; });
}
function truthy_(v) { var s = String(v).trim().toLowerCase(); return v === true || s === 'true' || s === 'yes'; }
function text_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'd MMMM yyyy');
  return String(v).trim();
}
function settings_(book) {
  var o = {};
  book.getSheetByName(TABS.settings).getDataRange().getValues().slice(1).forEach(function (r) {
    var k = String(r[0] || '').trim(); if (k) o[k] = r[1];
  });
  return o;
}
function setSetting_(book, key, value, note) {
  var sh = book.getSheetByName(TABS.settings), v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value, note || '']);
}
function coder_(book, code) {
  var want = norm_(code);
  if (!want) return null;
  var hit = table_(book.getSheetByName(TABS.coders)).filter(function (r) {
    return norm_(r.code) === want && (r.active === '' || r.active === undefined || r.active === null || truthy_(r.active));
  })[0];
  return hit ? {code: String(hit.code).trim().toUpperCase(), name: String(hit.name || '').trim() || 'Coder'} : null;
}
function records_(book) {
  return table_(book.getSheetByName(TABS.records)).filter(function (r) { return r.n !== '' && r.n !== undefined && r.n !== null; }).map(function (r) {
    return {n: Number(r.n), set: String(r.set).trim(), title: String(r.title || ''), authors: String(r.authors || ''),
      venue: String(r.venue || ''), year: (r.year === '' || r.year === null || r.year === undefined) ? '' : String(r.year), type: String(r.label || ''), abstract: String(r.abstract || '')};
  });
}
function sets_(book) {
  var sh = book.getSheetByName(TABS.records), last = sh.getLastRow(), cols = sh.getLastColumn(), out = {};
  if (last < 2) return out;
  var head = sh.getRange(1, 1, 1, cols).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var cn = head.indexOf('n'), cs = head.indexOf('set');
  if (cn < 0 || cs < 0) throw new Error('The Records tab needs columns named n and set.');
  var ns = sh.getRange(2, cn + 1, last - 1, 1).getValues(), ss = sh.getRange(2, cs + 1, last - 1, 1).getValues();
  for (var i = 0; i < ns.length; i++) { var n = Number(ns[i][0]); if (n) out[n] = String(ss[i][0]).trim(); }
  return out;
}
function codebook_(book) {
  var sh = book.getSheetByName(TABS.codebook);
  if (!sh) return [];
  return table_(sh).filter(function (r) { return String(r.kind || '').trim(); }).map(function (r) {
    return {kind: String(r.kind).trim(), key: text_(r.key), text: text_(r.text)};
  });
}
function saved_(code) {
  var sh = decisions_(), last = sh.getLastRow(), out = {}, want = norm_(code);
  if (last < 2) return out;
  var vals = sh.getRange(1, 1, last, DEC_HEAD.length).getValues();
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (norm_(r[COL.coder_code]) !== want) continue;
    out[String(r[COL.record_no])] = {
      topic: ANSWER_IN[String(r[COL.topic])] || null, setting: ANSWER_IN[String(r[COL.setting])] || null,
      comm: ANSWER_IN[String(r[COL.communication])] || null, pub: ANSWER_IN[String(r[COL.publication])] || null,
      decision: String(r[COL.decision]) || null, code: String(r[COL.exclusion_code] || ''), theory: String(r[COL.theory_named] || ''),
      notes: String(r[COL.notes] || ''), manual: String(r[COL.set_by_hand]) === 'yes', secs: Number(r[COL.seconds_on_record]) || 0,
      hl: String(r[COL.highlights_on]) !== 'no', ts: Number(r[COL.client_ms]) || 0
    };
  }
  return out;
}
function toRow_(who, n, set, it, version, now) {
  var ans = function (v) { return ANSWER_OUT[v] || ''; };
  var ts = Number(it.ts) || 0;
  var dec = ['include', 'unsure', 'background', 'exclude'].indexOf(String(it.decision || '')) >= 0 ? String(it.decision) : '';
  var row = [];
  row[COL.coder_code] = who.code; row[COL.coder] = who.name; row[COL.record_no] = String(n); row[COL.set] = set;
  row[COL.topic] = ans(it.topic); row[COL.setting] = ans(it.setting); row[COL.communication] = ans(it.comm); row[COL.publication] = ans(it.pub);
  row[COL.decision] = dec; row[COL.exclusion_code] = dec === 'exclude' ? String(it.code || '').slice(0, 10) : '';
  row[COL.theory_named] = String(it.theory || '').slice(0, 2000); row[COL.notes] = String(it.notes || '').slice(0, 5000);
  row[COL.set_by_hand] = it.manual ? 'yes' : ''; row[COL.seconds_on_record] = String(Math.round((Number(it.secs) || 0) * 10) / 10);
  row[COL.highlights_on] = it.hl === false ? 'no' : 'yes'; row[COL.codebook_version] = version;
  row[COL.decided_at_utc] = ts ? new Date(ts).toISOString() : ''; row[COL.client_ms] = String(ts); row[COL.saved_at_utc] = now;
  return row;
}
function progress_(book, who, vals, sets, now) {
  var total = {dev: 0, test: 0}, done = {dev: 0, test: 0}, want = norm_(who.code);
  Object.keys(sets).forEach(function (n) { if (total[sets[n]] !== undefined) total[sets[n]]++; });
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (norm_(r[COL.coder_code]) !== want) continue;
    var dec = String(r[COL.decision] || ''), set = sets[Number(r[COL.record_no])];
    if (dec && (dec !== 'exclude' || String(r[COL.exclusion_code] || '')) && done[set] !== undefined) done[set]++;
  }
  var sh = book.getSheetByName(TABS.progress) || book.insertSheet(TABS.progress);
  var v = sh.getDataRange().getValues();
  if (!v.length || String(v[0][0]) !== PROGRESS_HEAD[0]) {
    sh.getRange(1, 1, 1, PROGRESS_HEAD.length).setValues([PROGRESS_HEAD]);
    v = [PROGRESS_HEAD];
  }
  var row = [who.code, who.name, done.dev, total.dev, done.test, total.test, now.slice(0, 16).replace('T', ' ')];
  var at = v.length;
  for (var j = 1; j < v.length; j++) { if (norm_(v[j][0]) === want) { at = j; break; } }
  var cell = sh.getRange(at + 1, 1, 1, row.length);
  cell.setNumberFormat('@');
  cell.setValues([row.map(String)]);
  return {dev: done.dev, test: done.test};
}

/* ---------------- the coding page ----------------
 * Everything below is the page coders see. Edit the wording of the codebook and the questions
 * in the spreadsheet instead (Codebook and Settings tabs): no redeploying needed.
 */

function complete_(r) { return !!r && ['include','unsure','background','exclude'].indexOf(r.decision)>=0 && (r.decision !== 'exclude' || /^E[1-9]$/.test(r.code)); }

var BRIDGE_HTML = String.raw`<!doctype html><html><head><meta charset="utf-8"></head><body><script>
(function(){
  'use strict';
  var channel='__CHANNEL__';
  // Match the actual origin serving your GitHub project site, with no path.
  var allowed=['https://chengyu-ucsb.github.io','https://chengyufang.org'];
  window.addEventListener('message',function(event){
    var d=event.data;
    if(event.source!==window.top || allowed.indexOf(event.origin)<0 || !d || d.type!=='qc-call' || d.channel!==channel || !Array.isArray(d.args)) return;
    if(d.fn!=='start' && d.fn!=='save') return;
    function reply(result,error){event.source.postMessage({channel:channel,id:d.id,result:result,error:error},event.origin);}
    var run=google.script.run.withSuccessHandler(function(result){reply(result,null);}).withFailureHandler(function(){reply(null,'The study server could not complete this request. Please retry.');});
    if(d.fn==='start') run.start(d.args[0]);
    if(d.fn==='save') run.save(d.args[0],d.args[1]);
  });
  allowed.forEach(function(origin){window.top.postMessage({type:'qc-ready',channel:channel},origin);});
})();
</script></body></html>
`;
