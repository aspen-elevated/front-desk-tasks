/**
 * Aspen Front Desk Tasks — backend
 * --------------------------------
 * Bound to the "Aspen Front Desk Tasks" Google Sheet owned by info@aspen-elevated.com.
 * Deployed as a Web App (Execute as: Me, Who has access: Anyone).
 * The GitHub Pages front end talks to this script; every call except
 * staffList/login must carry a session token issued after a PIN check.
 *
 * Tabs: Tasks, Staff, Comments, History, Recurring
 */

var SHEETS = {
  TASKS: 'Tasks',
  STAFF: 'Staff',
  COMMENTS: 'Comments',
  HISTORY: 'History',
  RECURRING: 'Recurring'
};

var HEADERS = {
  Tasks: ['ID', 'Title', 'Details', 'Assignee', 'DueDate', 'Status', 'CreatedBy', 'CreatedAt',
          'UpdatedAt', 'CompletedBy', 'CompletedAt', 'RecurringID'],
  Staff: ['Name', 'Email', 'Role', 'PinHash', 'Active'],
  Comments: ['ID', 'TaskID', 'Author', 'Timestamp', 'Text'],
  History: ['TaskID', 'Timestamp', 'Actor', 'Action', 'Detail'],
  Recurring: ['ID', 'Title', 'Details', 'Assignee', 'Frequency', 'Days', 'Active',
              'LastGenerated', 'CreatedBy']
};

// Columns stored as plain text so Sheets doesn't turn them into Date objects.
var TEXT_COLUMNS = {
  Tasks: ['ID', 'DueDate', 'CreatedAt', 'UpdatedAt', 'CompletedAt', 'RecurringID'],
  Comments: ['ID', 'TaskID', 'Timestamp'],
  History: ['TaskID', 'Timestamp'],
  Recurring: ['ID', 'Days', 'LastGenerated'],
  Staff: ['PinHash']
};

var STATUSES = ['Open', 'In progress', 'Waiting', 'Done'];
var FREQUENCIES = ['daily', 'weekdays', 'weekly', 'monthly'];
var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var SESSION_DAYS = 30;
var MAX_PIN_FAILS = 5;
var LOCKOUT_SECONDS = 15 * 60;
var DONE_VISIBLE_DAYS = 30;

/* =========================================================================
 * Web app entry points
 * ========================================================================= */

function doGet() {
  return json_({ ok: true, app: 'Aspen Front Desk Tasks', time: nowIso_() });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Bad request.' });
  }
  try {
    return json_({ ok: true, data: route_(req) });
  } catch (err) {
    var msg = (err && err.message) || String(err);
    if (msg.indexOf('AUTH:') === 0) return json_({ ok: false, auth: true, error: msg.slice(5) });
    return json_({ ok: false, error: msg });
  }
}

function route_(req) {
  var action = req.action;
  if (action === 'staffList') return listStaffNames_();
  if (action === 'login') return login_(req.name, req.pin);

  var user = requireUser_(req.token);
  switch (action) {
    case 'logout': return logout_(req.token);
    case 'bootstrap': return bootstrap_(user);
    case 'listTasks': return { tasks: listTasks_() };
    case 'getTask': return getTask_(req.id);
    case 'activity': return { activity: activity_(req.limit) };
    case 'createTask': return withLock_(function () { return createTask_(user, req.task || {}); });
    case 'updateTask': return withLock_(function () { return updateTask_(user, req.id, req.changes || {}); });
    case 'deleteTask': return withLock_(function () { return deleteTask_(user, req.id); });
    case 'addComment': return withLock_(function () { return addComment_(user, req.id, req.text); });
    case 'saveRecurring': return withLock_(function () { return saveRecurring_(user, req.rec || {}); });
    case 'deleteRecurring': return withLock_(function () { return deleteRecurring_(user, req.id); });
    case 'changePin': return withLock_(function () { return changePin_(user, req.oldPin, req.newPin); });
    default: throw new Error('Unknown action.');
  }
}

/* =========================================================================
 * Auth: personal PINs + session tokens
 * ========================================================================= */

function listStaffNames_() {
  return activeStaff_().map(function (s) { return s.Name; }).sort();
}

function login_(name, pin) {
  name = String(name || '').trim();
  pin = String(pin || '').trim();
  if (!name || !pin) throw new Error('AUTH:Choose your name and enter your PIN.');

  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + name.toLowerCase();
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_PIN_FAILS) {
    throw new Error('AUTH:Too many wrong PINs. Try again in 15 minutes or ask a manager.');
  }

  var staff = findStaff_(name);
  if (!staff || !staff.PinHash || staff.PinHash !== hashPin_(pin)) {
    cache.put(failKey, String(fails + 1), LOCKOUT_SECONDS);
    throw new Error('AUTH:Name or PIN not recognized.');
  }
  cache.remove(failKey);

  var token = Utilities.getUuid();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('sess_' + token, JSON.stringify({
    name: staff.Name,
    exp: Date.now() + SESSION_DAYS * 86400000
  }));
  pruneSessions_();
  return { token: token, user: publicUser_(staff) };
}

function logout_(token) {
  PropertiesService.getScriptProperties().deleteProperty('sess_' + token);
  return { loggedOut: true };
}

function requireUser_(token) {
  if (!token) throw new Error('AUTH:Please sign in.');
  var raw = PropertiesService.getScriptProperties().getProperty('sess_' + token);
  if (!raw) throw new Error('AUTH:Your session ended. Please sign in again.');
  var sess = JSON.parse(raw);
  if (sess.exp < Date.now()) {
    PropertiesService.getScriptProperties().deleteProperty('sess_' + token);
    throw new Error('AUTH:Your session ended. Please sign in again.');
  }
  var staff = findStaff_(sess.name);
  if (!staff) throw new Error('AUTH:Your account is no longer active.');
  return publicUser_(staff);
}

function changePin_(user, oldPin, newPin) {
  var staff = findStaff_(user.name);
  if (!staff || staff.PinHash !== hashPin_(String(oldPin || ''))) throw new Error('Current PIN is incorrect.');
  validatePin_(newPin);
  setStaffField_(user.name, 'PinHash', hashPin_(String(newPin)));
  return { changed: true };
}

function pruneSessions_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sess_') !== 0) return;
    try {
      if (JSON.parse(all[k]).exp < now) props.deleteProperty(k);
    } catch (e) { props.deleteProperty(k); }
  });
}

function hashPin_(pin) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('PIN_SALT');
  if (!salt) {
    salt = Utilities.getUuid();
    props.setProperty('PIN_SALT', salt);
  }
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function validatePin_(pin) {
  if (!/^\d{4,6}$/.test(String(pin || ''))) throw new Error('PIN must be 4 to 6 digits.');
}

function publicUser_(staff) {
  return { name: staff.Name, role: String(staff.Role || 'staff').toLowerCase(), email: staff.Email || '' };
}

function isManager_(user) { return user.role === 'manager'; }

/* =========================================================================
 * Bootstrap + tasks
 * ========================================================================= */

function bootstrap_(user) {
  maybeRunRecurring_();
  return {
    user: user,
    staff: activeStaff_().map(function (s) { return { name: s.Name, role: String(s.Role || 'staff').toLowerCase() }; }),
    tasks: listTasks_(),
    recurring: listRecurring_(),
    statuses: STATUSES,
    today: todayStr_()
  };
}

function listTasks_() {
  var cutoff = addDays_(todayStr_(), -DONE_VISIBLE_DAYS);
  var counts = commentCounts_();
  return readRows_(SHEETS.TASKS)
    .filter(function (t) {
      if (!t.ID) return false;
      if (t.Status !== 'Done') return true;
      return String(t.CompletedAt || '').slice(0, 10) >= cutoff;
    })
    .map(function (t) { return taskOut_(t, counts[t.ID] || 0); });
}

function getTask_(id) {
  var t = findById_(SHEETS.TASKS, id);
  if (!t) throw new Error('Task not found.');
  var comments = readRows_(SHEETS.COMMENTS)
    .filter(function (c) { return c.TaskID === id; })
    .map(function (c) { return { id: c.ID, author: c.Author, at: c.Timestamp, text: c.Text }; });
  var history = readRows_(SHEETS.HISTORY)
    .filter(function (h) { return h.TaskID === id; })
    .map(function (h) { return { at: h.Timestamp, actor: h.Actor, action: h.Action, detail: h.Detail }; });
  return { task: taskOut_(t.row, comments.length), comments: comments, history: history };
}

function activity_(limit) {
  var n = Math.min(Number(limit) || 150, 500);
  var titles = {};
  readRows_(SHEETS.TASKS).forEach(function (t) { titles[t.ID] = t.Title; });
  return readRows_(SHEETS.HISTORY).slice(-n).reverse().map(function (h) {
    return { taskId: h.TaskID, title: titles[h.TaskID] || '', at: h.Timestamp,
             actor: h.Actor, action: h.Action, detail: h.Detail };
  });
}

function createTask_(user, input) {
  var title = clean_(input.title, 200);
  if (!title) throw new Error('Give the task a title.');
  var assignee = clean_(input.assignee, 80);
  if (assignee && !findStaff_(assignee)) throw new Error('Unknown assignee.');
  var due = normalizeDate_(input.dueDate);
  var now = nowIso_();
  var row = {
    ID: newId_('T'),
    Title: title,
    Details: clean_(input.details, 5000),
    Assignee: assignee,
    DueDate: due,
    Status: 'Open',
    CreatedBy: user.name,
    CreatedAt: now,
    UpdatedAt: now,
    CompletedBy: '',
    CompletedAt: '',
    RecurringID: clean_(input.recurringId, 40)
  };
  appendRow_(SHEETS.TASKS, row);
  logHistory_(row.ID, user.name, 'Created',
    [assignee ? 'assigned to ' + assignee : 'unassigned', due ? 'due ' + due : 'no due date'].join(', '));
  return { task: taskOut_(row, 0) };
}

function updateTask_(user, id, changes) {
  var found = findById_(SHEETS.TASKS, id);
  if (!found) throw new Error('Task not found.');
  var t = found.row;
  var notes = [];

  if (changes.title !== undefined) {
    var title = clean_(changes.title, 200);
    if (!title) throw new Error('Title cannot be empty.');
    if (title !== t.Title) { notes.push(['Edited', 'title']); t.Title = title; }
  }
  if (changes.details !== undefined) {
    var details = clean_(changes.details, 5000);
    if (details !== t.Details) { notes.push(['Edited', 'details']); t.Details = details; }
  }
  if (changes.assignee !== undefined) {
    var a = clean_(changes.assignee, 80);
    if (a && !findStaff_(a)) throw new Error('Unknown assignee.');
    if (a !== t.Assignee) {
      notes.push(['Reassigned', (t.Assignee || 'Unassigned') + ' → ' + (a || 'Unassigned')]);
      t.Assignee = a;
    }
  }
  if (changes.dueDate !== undefined) {
    var d = normalizeDate_(changes.dueDate);
    if (d !== t.DueDate) {
      notes.push(['Due date', (t.DueDate || 'none') + ' → ' + (d || 'none')]);
      t.DueDate = d;
    }
  }
  if (changes.status !== undefined) {
    var s = String(changes.status);
    if (STATUSES.indexOf(s) < 0) throw new Error('Unknown status.');
    if (s !== t.Status) {
      notes.push(['Status', t.Status + ' → ' + s]);
      t.Status = s;
      if (s === 'Done') { t.CompletedBy = user.name; t.CompletedAt = nowIso_(); }
      else { t.CompletedBy = ''; t.CompletedAt = ''; }
    }
  }
  if (!notes.length) return { task: taskOut_(t, commentCounts_()[id] || 0) };

  t.UpdatedAt = nowIso_();
  writeRow_(SHEETS.TASKS, found.rowIndex, t);
  notes.forEach(function (n) { logHistory_(id, user.name, n[0], n[1]); });
  return { task: taskOut_(t, commentCounts_()[id] || 0) };
}

function deleteTask_(user, id) {
  var found = findById_(SHEETS.TASKS, id);
  if (!found) throw new Error('Task not found.');
  if (!isManager_(user) && found.row.CreatedBy !== user.name) {
    throw new Error('Only a manager or the person who created this task can delete it.');
  }
  sheet_(SHEETS.TASKS).deleteRow(found.rowIndex);
  logHistory_(id, user.name, 'Deleted', found.row.Title);
  return { deleted: id };
}

function addComment_(user, id, text) {
  text = clean_(text, 3000);
  if (!text) throw new Error('Comment is empty.');
  var found = findById_(SHEETS.TASKS, id);
  if (!found) throw new Error('Task not found.');
  var c = { ID: newId_('C'), TaskID: id, Author: user.name, Timestamp: nowIso_(), Text: text };
  appendRow_(SHEETS.COMMENTS, c);
  found.row.UpdatedAt = c.Timestamp;
  writeRow_(SHEETS.TASKS, found.rowIndex, found.row);
  return { comment: { id: c.ID, author: c.Author, at: c.Timestamp, text: c.Text } };
}

function taskOut_(t, commentCount) {
  return {
    id: t.ID, title: t.Title, details: t.Details, assignee: t.Assignee, dueDate: t.DueDate,
    status: t.Status, createdBy: t.CreatedBy, createdAt: t.CreatedAt, updatedAt: t.UpdatedAt,
    completedBy: t.CompletedBy, completedAt: t.CompletedAt, recurringId: t.RecurringID,
    commentCount: commentCount || 0
  };
}

function commentCounts_() {
  var counts = {};
  readRows_(SHEETS.COMMENTS).forEach(function (c) { counts[c.TaskID] = (counts[c.TaskID] || 0) + 1; });
  return counts;
}

function logHistory_(taskId, actor, action, detail) {
  appendRow_(SHEETS.HISTORY, { TaskID: taskId, Timestamp: nowIso_(), Actor: actor, Action: action, Detail: detail || '' });
}

/* =========================================================================
 * Recurring tasks
 * ========================================================================= */

function listRecurring_() {
  return readRows_(SHEETS.RECURRING).filter(function (r) { return r.ID; }).map(recOut_);
}

function recOut_(r) {
  return {
    id: r.ID, title: r.Title, details: r.Details, assignee: r.Assignee, frequency: r.Frequency,
    days: r.Days, active: isTrue_(r.Active), lastGenerated: r.LastGenerated, createdBy: r.CreatedBy
  };
}

function saveRecurring_(user, rec) {
  if (!isManager_(user)) throw new Error('Only managers can set up recurring tasks.');
  var title = clean_(rec.title, 200);
  if (!title) throw new Error('Give the recurring task a title.');
  var freq = String(rec.frequency || '').toLowerCase();
  if (FREQUENCIES.indexOf(freq) < 0) throw new Error('Choose how often it repeats.');
  var days = normalizeDays_(freq, rec.days);
  var assignee = clean_(rec.assignee, 80);
  if (assignee && !findStaff_(assignee)) throw new Error('Unknown assignee.');

  var row = {
    Title: title, Details: clean_(rec.details, 5000), Assignee: assignee, Frequency: freq,
    Days: days, Active: rec.active === false ? 'FALSE' : 'TRUE'
  };
  if (rec.id) {
    var found = findById_(SHEETS.RECURRING, rec.id);
    if (!found) throw new Error('Recurring task not found.');
    Object.keys(row).forEach(function (k) { found.row[k] = row[k]; });
    writeRow_(SHEETS.RECURRING, found.rowIndex, found.row);
    return { recurring: recOut_(found.row) };
  }
  row.ID = newId_('R');
  row.LastGenerated = '';
  row.CreatedBy = user.name;
  appendRow_(SHEETS.RECURRING, row);
  // If it is due today, create today's task right away.
  generateRecurringFor_(todayStr_());
  return { recurring: recOut_(findById_(SHEETS.RECURRING, row.ID).row) };
}

function deleteRecurring_(user, id) {
  if (!isManager_(user)) throw new Error('Only managers can remove recurring tasks.');
  var found = findById_(SHEETS.RECURRING, id);
  if (!found) throw new Error('Recurring task not found.');
  sheet_(SHEETS.RECURRING).deleteRow(found.rowIndex);
  return { deleted: id };
}

/** Daily trigger target (installed by setup). Safe to run more than once a day. */
function generateRecurringTasks() {
  withLock_(function () { return generateRecurringFor_(todayStr_()); });
}

function maybeRunRecurring_() {
  var props = PropertiesService.getScriptProperties();
  var today = todayStr_();
  if (props.getProperty('LAST_RECUR_RUN') === today) return;
  withLock_(function () { generateRecurringFor_(today); });
}

function generateRecurringFor_(dateStr) {
  var created = 0;
  readRows_(SHEETS.RECURRING).forEach(function (r, i) {
    if (!r.ID || !isTrue_(r.Active)) return;
    if (r.LastGenerated && r.LastGenerated >= dateStr) return;
    if (!recursOn_(r.Frequency, r.Days, dateStr)) return;
    // If the assignee has left (inactive), still create the task, unassigned.
    var assignee = r.Assignee && findStaff_(r.Assignee) ? r.Assignee : '';
    createTask_({ name: 'Recurring' }, {
      title: r.Title, details: r.Details, assignee: assignee, dueDate: dateStr, recurringId: r.ID
    });
    r.LastGenerated = dateStr;
    writeRow_(SHEETS.RECURRING, i + 2, r);
    created++;
  });
  PropertiesService.getScriptProperties().setProperty('LAST_RECUR_RUN', dateStr);
  return { created: created };
}

/** Pure function: does a schedule land on dateStr (yyyy-MM-dd)? */
function recursOn_(frequency, days, dateStr) {
  var p = dateStr.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  var dow = d.getUTCDay();
  var dom = d.getUTCDate();
  var lastDom = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
  switch (String(frequency).toLowerCase()) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly':
      return String(days || '').split(',').map(function (s) { return s.trim(); })
        .indexOf(DAY_NAMES[dow]) >= 0;
    case 'monthly':
      // "31" on a 30-day month runs on the last day.
      var want = Number(days) || 1;
      return dom === Math.min(want, lastDom);
    default: return false;
  }
}

function normalizeDays_(freq, days) {
  if (freq === 'weekly') {
    var list = (Array.isArray(days) ? days : String(days || '').split(','))
      .map(function (s) { return String(s).trim().slice(0, 3); })
      .map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); })
      .filter(function (s) { return DAY_NAMES.indexOf(s) >= 0; });
    if (!list.length) throw new Error('Pick at least one day of the week.');
    return DAY_NAMES.filter(function (d) { return list.indexOf(d) >= 0; }).join(',');
  }
  if (freq === 'monthly') {
    var n = Number(days);
    if (!(n >= 1 && n <= 31)) throw new Error('Pick a day of the month (1–31).');
    return String(Math.floor(n));
  }
  return '';
}

/* =========================================================================
 * Sheet setup + admin menu (run from the Sheet)
 * ========================================================================= */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Aspen Tasks')
    .addItem('1. Set up sheets & daily trigger', 'setup')
    .addItem('Add staff member', 'menuAddStaff')
    .addItem('Set or reset a PIN', 'menuSetPin')
    .addSeparator()
    .addItem('Create today\'s recurring tasks now', 'generateRecurringTasks')
    .addItem('Sign everyone out', 'menuSignOutAll')
    .addToUi();
}

function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = HEADERS[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#efe9e1');
    sh.setFrozenRows(1);
    (TEXT_COLUMNS[name] || []).forEach(function (col) {
      var idx = headers.indexOf(col) + 1;
      sh.getRange(2, idx, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    });
  });
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);

  // Seed managers if Staff is empty.
  var staff = sheet_(SHEETS.STAFF);
  if (staff.getLastRow() < 2) {
    [['Scott', 'scott@aspen-elevated.com', 'manager', '', 'TRUE'],
     ['Misha', 'misha@aspen-elevated.com', 'manager', '', 'TRUE'],
     ['Valen', 'valen@aspen-elevated.com', 'manager', '', 'TRUE']]
      .forEach(function (r) { staff.appendRow(r); });
  }

  // Daily recurring-task trigger at ~5 AM.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'generateRecurringTasks') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('generateRecurringTasks').timeBased().everyDays(1).atHour(5).create();
  hashPin_('init'); // makes sure the PIN salt exists

  safeAlert_('Setup complete. Next: use "Aspen Tasks → Set or reset a PIN" for each person.');
}

function menuAddStaff() {
  var ui = SpreadsheetApp.getUi();
  var name = ui.prompt('Add staff member', 'First name (as it should appear in the app):', ui.ButtonSet.OK_CANCEL);
  if (name.getSelectedButton() !== ui.Button.OK) return;
  var n = name.getResponseText().trim();
  if (!n) return;
  if (findStaff_(n, true)) { ui.alert(n + ' is already on the Staff tab.'); return; }
  var role = ui.alert('Manager?', 'Should ' + n + ' be a manager (can delete any task and manage recurring tasks)?',
    ui.ButtonSet.YES_NO) === ui.Button.YES ? 'manager' : 'staff';
  sheet_(SHEETS.STAFF).appendRow([n, '', role, '', 'TRUE']);
  ui.alert(n + ' added as ' + role + '. Now set their PIN.');
  menuSetPin(n);
}

function menuSetPin(presetName) {
  var ui = SpreadsheetApp.getUi();
  var n = typeof presetName === 'string' ? presetName : '';
  if (!n) {
    var r1 = ui.prompt('Set or reset a PIN', 'Staff name:', ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() !== ui.Button.OK) return;
    n = r1.getResponseText().trim();
  }
  var staff = findStaff_(n, true);
  if (!staff) { ui.alert('No staff member named "' + n + '". Add them first.'); return; }
  var r2 = ui.prompt('PIN for ' + staff.Name, 'Enter a 4–6 digit PIN. Share it with them privately.',
    ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var pin = r2.getResponseText().trim();
  try { validatePin_(pin); } catch (e) { ui.alert(e.message); return; }
  setStaffField_(staff.Name, 'PinHash', hashPin_(pin));
  ui.alert('PIN set for ' + staff.Name + '. They can change it in the app under their name.');
}

function menuSignOutAll() {
  var props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(function (k) {
    if (k.indexOf('sess_') === 0) props.deleteProperty(k);
  });
  safeAlert_('Everyone has been signed out.');
}

/* =========================================================================
 * Sheet helpers
 * ========================================================================= */

function sheet_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing "' + name + '" tab. Run Aspen Tasks → Set up sheets.');
  return sh;
}

function readRows_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var headers = HEADERS[name];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.map(function (r) {
    var o = {};
    headers.forEach(function (h, i) { o[h] = cellToString_(r[i]); });
    return o;
  });
}

function findById_(name, id) {
  if (!id) return null;
  var key = name === SHEETS.STAFF ? 'Name' : 'ID';
  var rows = readRows_(name);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][key] === id) return { row: rows[i], rowIndex: i + 2 };
  }
  return null;
}

function appendRow_(name, obj) {
  var headers = HEADERS[name];
  sheet_(name).appendRow(headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
}

function writeRow_(name, rowIndex, obj) {
  var headers = HEADERS[name];
  sheet_(name).getRange(rowIndex, 1, 1, headers.length)
    .setValues([headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; })]);
}

function activeStaff_() {
  return readRows_(SHEETS.STAFF).filter(function (s) { return s.Name && isTrue_(s.Active); });
}

function findStaff_(name, includeInactive) {
  var n = String(name || '').trim().toLowerCase();
  var list = includeInactive ? readRows_(SHEETS.STAFF) : activeStaff_();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].Name).trim().toLowerCase() === n) return list[i];
  }
  return null;
}

function setStaffField_(name, field, value) {
  var rows = readRows_(SHEETS.STAFF);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].Name.toLowerCase() === String(name).toLowerCase()) {
      rows[i][field] = value;
      writeRow_(SHEETS.STAFF, i + 2, rows[i]);
      return;
    }
  }
  throw new Error('Staff member not found.');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* =========================================================================
 * Small utilities
 * ========================================================================= */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function tz_() { return Session.getScriptTimeZone() || 'America/Denver'; }
function nowIso_() { return Utilities.formatDate(new Date(), tz_(), "yyyy-MM-dd'T'HH:mm:ss"); }
function todayStr_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }

function addDays_(dateStr, n) {
  var p = dateStr.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}

function normalizeDate_(v) {
  if (!v) return '';
  var s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Dates must look like 2026-10-12.');
  return s;
}

function cellToString_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  if (v === null || v === undefined) return '';
  return String(v);
}

function clean_(v, max) {
  return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 500);
}

function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

function newId_(prefix) {
  return prefix + Utilities.formatDate(new Date(), tz_(), 'yyMMdd') + '-' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
}

function safeAlert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}
