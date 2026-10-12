/* Demo backend used when config.js has no API_URL (or the URL has ?demo=1).
 * Mirrors the Apps Script API so the app can be tried before the Sheet is set up.
 * Data lives in this browser's localStorage only. Every demo PIN is 1234. */
(function () {
  var KEY = 'aspenTasksDemo_v1';
  var STATUSES = ['Open', 'In progress', 'Waiting', 'Done'];
  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(s, n) { var p = s.split('-').map(Number); var d = new Date(p[0], p[1] - 1, p[2] + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function now() { var d = new Date(); return today() + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function id(p) { return p + Math.random().toString(36).slice(2, 8).toUpperCase(); }
  function ago(mins) { var d = new Date(Date.now() - mins * 60000); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00'; }

  function seed() {
    var t = today();
    var staff = [
      { name: 'Scott', role: 'manager' }, { name: 'Misha', role: 'manager' }, { name: 'Valen', role: 'manager' },
      { name: 'Alex', role: 'staff' }, { name: 'Jordan', role: 'staff' }
    ];
    function task(title, details, assignee, due, status, by, mins) {
      return { id: id('T'), title: title, details: details, assignee: assignee, dueDate: due, status: status,
        createdBy: by, createdAt: ago(mins), updatedAt: ago(Math.max(mins - 30, 1)), completedBy: status === 'Done' ? assignee : '',
        completedAt: status === 'Done' ? ago(60) : '', recurringId: '' };
    }
    var tasks = [
      task('Confirm tomorrow\'s appointments', 'Call or text every client on tomorrow\'s schedule. Note no-answers in Zenoti.', 'Alex', t, 'In progress', 'Misha', 300),
      task('Reorder front desk supplies', 'Receipt paper, pens, intake clipboards. Check the closet before ordering.', 'Jordan', addDays(t, -1), 'Open', 'Valen', 2000),
      task('Update holiday gift card display', 'New signage arrived Friday — swap out the fall display.', 'Jordan', addDays(t, 2), 'Open', 'Scott', 900),
      task('Follow up on vendor invoice', 'Waiting on corrected invoice from the linen service.', 'Valen', addDays(t, 5), 'Waiting', 'Valen', 4000),
      task('Restock retail shelf', 'Fill in gaps on the retail wall from back stock.', '', addDays(t, 1), 'Open', 'Misha', 120),
      task('Print November promo flyers', '', 'Alex', '', 'Open', 'Scott', 50),
      task('Clean and reset waiting area', '', 'Alex', addDays(t, -1), 'Done', 'Misha', 1500)
    ];
    var hist = [];
    tasks.forEach(function (x) { hist.push({ taskId: x.id, at: x.createdAt, actor: x.createdBy, action: 'Created', detail: (x.assignee ? 'assigned to ' + x.assignee : 'unassigned') }); });
    var comments = [{ id: id('C'), taskId: tasks[1].id, author: 'Jordan', at: ago(40), text: 'Closet has 2 rolls of receipt paper left — ordering today.' }];
    var recurring = [
      { id: id('R'), title: 'Opening checklist', details: 'Lights, music, check voicemail, print schedule, brew water/tea station.', assignee: '', frequency: 'weekdays', days: '', active: true, lastGenerated: '', createdBy: 'Misha' },
      { id: id('R'), title: 'Weekly retail count', details: 'Count retail shelf and log in the Inventory app.', assignee: 'Jordan', frequency: 'weekly', days: 'Mon', active: true, lastGenerated: '', createdBy: 'Scott' }
    ];
    return { staff: staff, tasks: tasks, comments: comments, history: hist, recurring: recurring, sessions: {}, lastRecur: '' };
  }

  function load() {
    try { var raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    var db = seed(); save(db); return db;
  }
  function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }

  function recursOn(freq, days, s) {
    var p = s.split('-').map(Number), d = new Date(p[0], p[1] - 1, p[2]), dow = d.getDay(), dom = d.getDate();
    var last = new Date(p[0], p[1], 0).getDate();
    if (freq === 'daily') return true;
    if (freq === 'weekdays') return dow >= 1 && dow <= 5;
    if (freq === 'weekly') return String(days || '').split(',').indexOf(DAY_NAMES[dow]) >= 0;
    if (freq === 'monthly') return dom === Math.min(Number(days) || 1, last);
    return false;
  }

  function findStaff(db, n) { n = String(n || '').toLowerCase(); return db.staff.filter(function (s) { return s.name.toLowerCase() === n; })[0]; }
  function hist(db, taskId, actor, action, detail) { db.history.push({ taskId: taskId, at: now(), actor: actor, action: action, detail: detail || '' }); }
  function withCount(db, t) { var c = db.comments.filter(function (x) { return x.taskId === t.id; }).length; var o = Object.assign({}, t); o.commentCount = c; return o; }
  function err(msg, auth) { var e = new Error(msg); e.auth = !!auth; throw e; }

  function createTask(db, user, inp) {
    var title = String(inp.title || '').trim(); if (!title) err('Give the task a title.');
    var t = { id: id('T'), title: title, details: String(inp.details || '').trim(), assignee: inp.assignee || '', dueDate: inp.dueDate || '',
      status: 'Open', createdBy: user.name, createdAt: now(), updatedAt: now(), completedBy: '', completedAt: '', recurringId: inp.recurringId || '' };
    db.tasks.push(t);
    hist(db, t.id, user.name, 'Created', (t.assignee ? 'assigned to ' + t.assignee : 'unassigned') + ', ' + (t.dueDate ? 'due ' + t.dueDate : 'no due date'));
    return t;
  }

  function runRecurring(db) {
    var t = today(); if (db.lastRecur === t) return;
    db.recurring.forEach(function (r) {
      if (!r.active || (r.lastGenerated && r.lastGenerated >= t) || !recursOn(r.frequency, r.days, t)) return;
      createTask(db, { name: 'Recurring' }, { title: r.title, details: r.details, assignee: r.assignee, dueDate: t, recurringId: r.id });
      r.lastGenerated = t;
    });
    db.lastRecur = t;
  }

  function userFor(db, token) {
    var name = token && db.sessions[token];
    if (!name) err('Please sign in.', true);
    var s = findStaff(db, name); if (!s) err('Please sign in.', true);
    return s;
  }

  function handle(req) {
    var db = load(), a = req.action;
    if (a === 'staffList') return db.staff.map(function (s) { return s.name; }).sort();
    if (a === 'login') {
      var s = findStaff(db, req.name);
      if (!s || String(req.pin) !== '1234') err('Name or PIN not recognized.', true);
      var tok = id('S'); db.sessions[tok] = s.name; save(db);
      return { token: tok, user: { name: s.name, role: s.role } };
    }
    var user = userFor(db, req.token), out;
    var isMgr = user.role === 'manager';
    switch (a) {
      case 'logout': delete db.sessions[req.token]; out = {}; break;
      case 'bootstrap':
        runRecurring(db);
        var cutoff = addDays(today(), -30);
        out = { user: user, staff: db.staff, statuses: STATUSES, today: today(), recurring: db.recurring,
          tasks: db.tasks.filter(function (t) { return t.status !== 'Done' || String(t.completedAt).slice(0, 10) >= cutoff; })
            .map(function (t) { return withCount(db, t); }) };
        break;
      case 'getTask':
        var t = db.tasks.filter(function (x) { return x.id === req.id; })[0]; if (!t) err('Task not found.');
        out = { task: withCount(db, t), comments: db.comments.filter(function (c) { return c.taskId === t.id; }),
          history: db.history.filter(function (h) { return h.taskId === t.id; }) };
        break;
      case 'createTask': out = { task: withCount(db, createTask(db, user, req.task || {})) }; break;
      case 'updateTask':
        var u = db.tasks.filter(function (x) { return x.id === req.id; })[0]; if (!u) err('Task not found.');
        var c = req.changes || {};
        if (c.title !== undefined && c.title.trim() !== u.title) { if (!c.title.trim()) err('Title cannot be empty.'); u.title = c.title.trim(); hist(db, u.id, user.name, 'Edited', 'title'); }
        if (c.details !== undefined && c.details.trim() !== u.details) { u.details = c.details.trim(); hist(db, u.id, user.name, 'Edited', 'details'); }
        if (c.assignee !== undefined && c.assignee !== u.assignee) { hist(db, u.id, user.name, 'Reassigned', (u.assignee || 'Unassigned') + ' → ' + (c.assignee || 'Unassigned')); u.assignee = c.assignee; }
        if (c.dueDate !== undefined && c.dueDate !== u.dueDate) { hist(db, u.id, user.name, 'Due date', (u.dueDate || 'none') + ' → ' + (c.dueDate || 'none')); u.dueDate = c.dueDate; }
        if (c.status !== undefined && c.status !== u.status) {
          hist(db, u.id, user.name, 'Status', u.status + ' → ' + c.status); u.status = c.status;
          if (c.status === 'Done') { u.completedBy = user.name; u.completedAt = now(); } else { u.completedBy = ''; u.completedAt = ''; }
        }
        u.updatedAt = now(); out = { task: withCount(db, u) };
        break;
      case 'deleteTask':
        var d = db.tasks.filter(function (x) { return x.id === req.id; })[0]; if (!d) err('Task not found.');
        if (!isMgr && d.createdBy !== user.name) err('Only a manager or the person who created this task can delete it.');
        db.tasks = db.tasks.filter(function (x) { return x.id !== req.id; });
        hist(db, req.id, user.name, 'Deleted', d.title); out = { deleted: req.id };
        break;
      case 'addComment':
        var text = String(req.text || '').trim(); if (!text) err('Comment is empty.');
        var cm = { id: id('C'), taskId: req.id, author: user.name, at: now(), text: text };
        db.comments.push(cm); out = { comment: cm };
        break;
      case 'activity':
        var titles = {}; db.tasks.forEach(function (t2) { titles[t2.id] = t2.title; });
        out = { activity: db.history.slice(-150).reverse().map(function (h) { return Object.assign({ title: titles[h.taskId] || '' }, h); }) };
        break;
      case 'saveRecurring':
        if (!isMgr) err('Only managers can set up recurring tasks.');
        var r = req.rec || {};
        if (!String(r.title || '').trim()) err('Give the recurring task a title.');
        if (r.frequency === 'weekly' && !String(r.days || '').length) err('Pick at least one day of the week.');
        var rec;
        if (r.id) { rec = db.recurring.filter(function (x) { return x.id === r.id; })[0]; if (!rec) err('Recurring task not found.'); }
        else { rec = { id: id('R'), lastGenerated: '', createdBy: user.name }; db.recurring.push(rec); }
        rec.title = r.title.trim(); rec.details = (r.details || '').trim(); rec.assignee = r.assignee || '';
        rec.frequency = r.frequency; rec.days = r.days || ''; rec.active = r.active !== false;
        db.lastRecur = ''; runRecurring(db);
        out = { recurring: rec };
        break;
      case 'deleteRecurring':
        if (!isMgr) err('Only managers can remove recurring tasks.');
        db.recurring = db.recurring.filter(function (x) { return x.id !== req.id; }); out = { deleted: req.id };
        break;
      case 'changePin': err('PINs can\'t be changed in demo mode.'); break;
      default: err('Unknown action.');
    }
    save(db);
    return out;
  }

  window.AspenMockApi = {
    call: function (req) {
      return new Promise(function (resolve) {
        setTimeout(function () {
          try { resolve({ ok: true, data: handle(req) }); }
          catch (e) { resolve({ ok: false, error: e.message, auth: e.auth }); }
        }, 150);
      });
    },
    reset: function () { localStorage.removeItem(KEY); }
  };
})();
