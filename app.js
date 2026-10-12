/* Aspen Front Desk Tasks — front end */
(function () {
  'use strict';

  var CFG = window.ASPEN_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var DEMO = !CFG.API_URL || params.get('demo') === '1';
  var LS_TOKEN = DEMO ? 'aspenTasksDemoToken' : 'aspenTasksToken';
  var LS_NAME = 'aspenTasksLastName';
  var LS_FILTER = 'aspenTasksFilter';

  var S = {
    token: lsGet(LS_TOKEN), user: null, staff: [], tasks: [], recurring: [], statuses: [], today: '',
    view: 'board',
    filter: Object.assign({ status: 'active', person: '', q: '' }, jsonParse(lsGet(LS_FILTER)) || {}),
    activity: null
  };
  S.filter.q = '';

  /* ---------------------------------------------------------------- utils */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function jsonParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localToday() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return S.today && S.today > localToday() ? S.today : localToday(); }
  function parseD(s) { var p = String(s).slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function diffDays(a, b) { return Math.round((parseD(a) - parseD(b)) / 86400000); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function fmtDate(s) { if (!s) return ''; var d = parseD(s); return DOW[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate(); }
  function fmtStamp(s) {
    if (!s) return '';
    var day = String(s).slice(0, 10), t = String(s).slice(11, 16), lbl;
    var dd = diffDays(day, localToday());
    lbl = dd === 0 ? 'Today' : dd === -1 ? 'Yesterday' : MON[parseD(day).getMonth()] + ' ' + parseD(day).getDate();
    if (!t) return lbl;
    var h = Number(t.slice(0, 2)), m = t.slice(3, 5);
    return lbl + ' ' + ((h % 12) || 12) + ':' + m + (h < 12 ? 'am' : 'pm');
  }
  function initials(n) { return String(n || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(); }
  function isMgr() { return S.user && S.user.role === 'manager'; }

  var IC = {
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
    hist: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    team: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    clip: '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
    msg: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
    out: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>'
  };
  function ic(name, size) { return '<svg class="ic" viewBox="0 0 24 24" width="' + (size || 13) + '" height="' + (size || 13) + '">' + IC[name] + '</svg>'; }

  /* ------------------------------------------------------------------ api */
  var pending = 0;
  function api(action, body) {
    var req = Object.assign({ action: action, token: S.token }, body || {});
    setSync('busy'); pending++;
    var p = DEMO ? window.AspenMockApi.call(req) :
      fetch(CFG.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req) })
        .then(function (r) { return r.json(); });
    return p.then(function (res) {
      pending--; setSync(pending ? 'busy' : 'ok');
      if (!res.ok) {
        var e = new Error(res.error || 'Something went wrong.'); e.auth = res.auth; throw e;
      }
      return res.data;
    }, function () {
      pending--; setSync('err');
      throw new Error('Can\'t reach the task sheet. Check the internet connection and try again.');
    }).catch(function (e) {
      if (e.auth && action !== 'login') { S.token = null; lsSet(LS_TOKEN, null); showSignIn(e.message); }
      throw e;
    });
  }
  function setSync(st) {
    var el = $('syncStatus');
    el.innerHTML = st === 'busy' ? '<span class="busy">● Saving…</span>' : st === 'err' ? '<span class="err">● Offline</span>' : '<span class="ok">● Synced</span>';
  }

  /* --------------------------------------------------------------- toast */
  var toastTimer;
  function toast(msg, isErr) {
    var t = $('toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
  }

  /* ------------------------------------------------------------- sign-in */
  var signinName = lsGet(LS_NAME) || '';
  function showSignIn(msg) {
    S.user = null; closeModal();
    $('navBar').hidden = true; $('userChip').hidden = true; $('userMenu').hidden = true;
    $('main').innerHTML = '<div class="signin"><div class="md"><h2>' + ic('lock', 16) + ' Sign in</h2>' +
      '<p class="lead">Tap your name, then enter your personal PIN.</p><div class="who-grid" id="whoGrid"><div class="empty">Loading team…</div></div>' +
      '<div class="fm-group"><label for="pinIn">PIN</label><input class="pw-input" id="pinIn" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off"></div>' +
      '<div class="pw-error" id="pinErr">' + esc(msg || '') + '</div>' +
      '<button class="btn bp" id="signBtn" style="width:100%;padding:11px;margin-top:6px">Unlock</button></div></div>';
    api('staffList').then(function (names) {
      $('whoGrid').innerHTML = names.map(function (n) {
        return '<button class="who-btn' + (n === signinName ? ' ac' : '') + '" data-n="' + esc(n) + '"><span class="av lg">' + esc(initials(n)) + '</span>' + esc(n) + '</button>';
      }).join('') || '<div class="empty">No staff set up yet. Add people from the Sheet menu: Aspen Tasks → Add staff member.</div>';
      if (signinName && names.indexOf(signinName) >= 0) $('pinIn').focus();
    }).catch(function (e) { $('pinErr').textContent = e.message; });
    $('whoGrid').onclick = function (e) {
      var b = e.target.closest('.who-btn'); if (!b) return;
      signinName = b.getAttribute('data-n');
      Array.prototype.forEach.call(this.children, function (c) { c.classList.toggle('ac', c === b); });
      $('pinIn').value = ''; $('pinErr').textContent = ''; $('pinIn').focus();
    };
    $('pinIn').onkeydown = function (e) { if (e.key === 'Enter') doSignIn(); };
    $('signBtn').onclick = doSignIn;
  }
  function doSignIn() {
    var pin = $('pinIn').value.trim();
    if (!signinName) { $('pinErr').textContent = 'Tap your name first.'; return; }
    if (!pin) { $('pinErr').textContent = 'Enter your PIN.'; return; }
    $('signBtn').disabled = true; $('signBtn').textContent = 'Checking…';
    api('login', { name: signinName, pin: pin }).then(function (res) {
      S.token = res.token; lsSet(LS_TOKEN, res.token); lsSet(LS_NAME, signinName);
      S.filter.person = ''; S.view = 'board';
      return boot();
    }).catch(function (e) {
      $('pinErr').textContent = e.message; $('pinIn').value = ''; $('pinIn').focus();
      $('signBtn').disabled = false; $('signBtn').textContent = 'Unlock';
    });
  }

  /* ---------------------------------------------------------------- boot */
  function boot() {
    return api('bootstrap').then(function (d) {
      S.user = d.user; S.staff = d.staff; S.tasks = d.tasks; S.recurring = d.recurring; S.statuses = d.statuses; S.today = d.today;
      renderChrome(); render();
    });
  }
  function refresh(quiet) {
    if (!S.token || !S.user) return;
    return api('bootstrap').then(function (d) {
      S.staff = d.staff; S.tasks = d.tasks; S.recurring = d.recurring; S.today = d.today; S.user = d.user;
      if (S.view === 'activity') S.activity = null;
      renderChrome(); render();
      if (!quiet) toast('Up to date');
    }).catch(function (e) { if (!quiet && !e.auth) toast(e.message, true); });
  }

  /* --------------------------------------------------------------- chrome */
  function renderChrome() {
    var d = new Date();
    $('dateDisplay').textContent = DOW[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    var chip = $('userChip');
    chip.hidden = false;
    chip.innerHTML = '<span class="av">' + esc(initials(S.user.name)) + '</span>' + esc(S.user.name);
    var mine = S.tasks.filter(function (t) { return t.assignee === S.user.name && t.status !== 'Done'; });
    var od = S.tasks.filter(function (t) { return t.status !== 'Done' && t.dueDate && t.dueDate < today(); }).length;
    var nav = $('navBar'); nav.hidden = false;
    var items = [
      ['board', 'grid', 'Dashboard', od ? '<span class="nb">' + od + '</span>' : ''],
      ['mine', 'user', 'My Tasks', mine.length ? '<span class="nb soft">' + mine.length + '</span>' : ''],
      ['recurring', 'repeat', 'Recurring', ''],
      ['activity', 'hist', 'History', ''],
      ['team', 'team', 'Team', '']
    ];
    nav.innerHTML = items.map(function (i) {
      return '<button class="ni' + (S.view === i[0] ? ' ac' : '') + '" data-v="' + i[0] + '">' + ic(i[1]) + i[2] + i[3] + '</button>';
    }).join('') + '<button class="ni" data-v="refresh" style="margin-left:auto" title="Refresh from Sheet">⟳ Refresh</button>';
  }
  $('navBar').onclick = function (e) {
    var b = e.target.closest('.ni'); if (!b) return;
    var v = b.getAttribute('data-v');
    if (v === 'refresh') { refresh(false); return; }
    S.view = v; renderChrome(); render(); window.scrollTo(0, 0);
  };
  $('userChip').onclick = function (e) {
    e.stopPropagation();
    var m = $('userMenu');
    if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = '<div class="uh"><b>' + esc(S.user.name) + '</b><span>' + (isMgr() ? 'Manager' : 'Front desk') + '</span></div>' +
      '<button data-a="switch">' + ic('out') + 'Switch user / sign out</button>' +
      '<button data-a="pin">' + ic('lock') + 'Change my PIN</button>';
    m.hidden = false;
  };
  $('userMenu').onclick = function (e) {
    var b = e.target.closest('button'); if (!b) return;
    this.hidden = true;
    if (b.getAttribute('data-a') === 'switch') {
      api('logout').catch(function () {}); S.token = null; lsSet(LS_TOKEN, null); signinName = ''; showSignIn();
    } else openChangePin();
  };
  document.addEventListener('click', function (e) {
    var m = $('userMenu'); if (!m.hidden && !m.contains(e.target)) m.hidden = true;
  });

  /* --------------------------------------------------------------- render */
  function render() {
    var m = $('main');
    if (S.view === 'board') m.innerHTML = renderBoard(false);
    else if (S.view === 'mine') m.innerHTML = renderBoard(true);
    else if (S.view === 'recurring') m.innerHTML = renderRecurring();
    else if (S.view === 'activity') { m.innerHTML = renderActivity(); if (!S.activity) loadActivity(); }
    else if (S.view === 'team') m.innerHTML = renderTeam();
  }

  function statusClass(s) { return s === 'Done' ? 'st-done' : s === 'In progress' ? 'st-prog' : s === 'Waiting' ? 'st-wait' : 'st-open'; }
  function dueInfo(t) {
    if (!t.dueDate) return { cls: 'none', label: 'No date' };
    var dd = diffDays(t.dueDate, today());
    if (t.status === 'Done') return { cls: 'none', label: fmtDate(t.dueDate) };
    if (dd < 0) return { cls: 'od', label: (dd === -1 ? 'Yesterday' : fmtDate(t.dueDate)) + ' · ' + (-dd) + 'd late' };
    if (dd === 0) return { cls: 'today', label: 'Today' };
    if (dd === 1) return { cls: 'soon', label: 'Tomorrow' };
    return { cls: 'soon', label: fmtDate(t.dueDate) };
  }
  function bucket(t) {
    if (t.status === 'Done') return 'done';
    if (!t.dueDate) return 'nodate';
    var dd = diffDays(t.dueDate, today());
    return dd < 0 ? 'od' : dd === 0 ? 'today' : dd <= 7 ? 'week' : 'later';
  }
  var BUCKETS = [['od', 'Overdue', 'sr-od'], ['today', 'Due today', 'sr-today'], ['week', 'Next 7 days', ''], ['later', 'Later', ''], ['nodate', 'No due date', ''], ['done', 'Completed', 'sr-done']];

  function stats() {
    var open = S.tasks.filter(function (t) { return t.status !== 'Done'; });
    var t0 = today(), wk = addDays(t0, -7);
    return {
      open: open.length,
      od: open.filter(function (t) { return t.dueDate && t.dueDate < t0; }).length,
      today: open.filter(function (t) { return t.dueDate === t0; }).length,
      unassigned: open.filter(function (t) { return !t.assignee; }).length,
      waiting: open.filter(function (t) { return t.status === 'Waiting'; }).length,
      done7: S.tasks.filter(function (t) { return t.status === 'Done' && String(t.completedAt).slice(0, 10) >= wk; }).length
    };
  }

  function filteredTasks(mine) {
    var f = S.filter, t0 = today(), q = f.q.toLowerCase();
    return S.tasks.filter(function (t) {
      if (mine) { if (t.assignee !== S.user.name) return false; }
      else if (f.person === '__none') { if (t.assignee) return false; }
      else if (f.person && t.assignee !== f.person) return false;
      if (f.status === 'active' && t.status === 'Done') return false;
      if (f.status === 'done' && t.status !== 'Done') return false;
      if (f.status === 'od' && !(t.status !== 'Done' && t.dueDate && t.dueDate < t0)) return false;
      if (f.status === 'today' && !(t.status !== 'Done' && t.dueDate === t0)) return false;
      if (f.status === 'waiting' && t.status !== 'Waiting') return false;
      if (q && (t.title + ' ' + t.details + ' ' + t.assignee + ' ' + t.createdBy).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      if (a.status === 'Done' && b.status === 'Done') return String(b.completedAt).localeCompare(String(a.completedAt));
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || String(a.createdAt).localeCompare(String(b.createdAt));
    });
  }

  function renderBoard(mine) {
    var st = stats(), html = '';
    if (mine) {
      var my = S.tasks.filter(function (t) { return t.assignee === S.user.name; }), t0 = today();
      var myOpen = my.filter(function (t) { return t.status !== 'Done'; });
      html += '<div class="sg">' +
        card('My open tasks', myOpen.length, 'assigned to you', '', 'active') +
        card('Overdue', myOpen.filter(function (t) { return t.dueDate && t.dueDate < t0; }).length, 'past due date', 'sa', 'od') +
        card('Due today', myOpen.filter(function (t) { return t.dueDate === t0; }).length, fmtDate(t0), 'sw', 'today') +
        card('Completed', my.filter(function (t) { return t.status === 'Done'; }).length, 'last 30 days', 'sgood', 'done') +
        quickActions() + '</div>';
    } else {
      html += '<div class="sg">' +
        card('Open tasks', st.open, st.waiting + ' waiting on someone', '', 'active') +
        card('Overdue', st.od, st.od ? 'need attention' : 'all caught up', st.od ? 'sa' : 'sgood', 'od') +
        card('Due today', st.today, fmtDate(today()), 'sw', 'today') +
        card('Unassigned', st.unassigned, 'need an owner', '', 'unassigned') +
        card('Done this week', st.done7, 'last 7 days', 'sgood', 'done') +
        quickActions() + '</div>';
    }

    var f = S.filter;
    var pills = [['active', 'Active'], ['od', 'Overdue'], ['today', 'Today'], ['waiting', 'Waiting'], ['done', 'Done'], ['all', 'All']];
    html += '<div class="tb"><div class="sb">' + ic('search') + '<input id="q" placeholder="Search tasks…" value="' + esc(f.q) + '"></div>' +
      '<div class="fp" id="pills">' + pills.map(function (p) { return '<button class="pl' + (f.status === p[0] ? ' ac' : '') + '" data-s="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>' +
      (mine ? '' : '<select class="selp" id="personSel"><option value="">Everyone</option><option value="__none"' + (f.person === '__none' ? ' selected' : '') + '>Unassigned</option>' +
        S.staff.map(function (s) { return '<option' + (f.person === s.name ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select>') +
      '<button class="btn bp" data-act="new">' + ic('plus', 12) + 'New Task</button></div>';

    html += '<div class="tc"><div class="thb"><div class="tt">' + ic('clip') + (mine ? 'My Tasks' : 'Team Tasks') +
      (f.person && !mine ? ' — ' + esc(f.person === '__none' ? 'Unassigned' : f.person) : '') + '</div><div class="tcount" id="tcount"></div></div><div class="ts" id="taskTable"></div></div>';
    setTimeout(function () { drawTable(mine); }, 0);
    return html;
  }
  function card(label, val, sub, cls, filt) {
    return '<button class="sc ' + cls + '" data-filt="' + filt + '"><div class="scl">' + label + '</div><div class="scv">' + val + '</div><div class="scs">' + esc(sub) + '</div></button>';
  }
  function quickActions() {
    return '<div class="sc"><div class="scl">Quick Actions</div><div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">' +
      '<button class="btn bp bsm" data-act="new">' + ic('plus', 12) + 'New Task</button>' +
      '<button class="btn bo bsm" data-act="mine">' + ic('user', 12) + 'My Tasks</button>' +
      '<button class="btn bo bsm" data-act="recurring" style="border-color:var(--g);color:var(--g)">' + ic('repeat', 12) + 'Recurring</button></div></div>';
  }

  function drawTable(mine) {
    var el = $('taskTable'); if (!el) return;
    var list = filteredTasks(mine);
    $('tcount').textContent = list.length + (list.length === 1 ? ' task' : ' tasks');
    if (!list.length) {
      el.innerHTML = '<div class="empty"><b>Nothing here</b>' + (S.filter.status === 'active' || S.filter.status === 'od' ? 'No open tasks match — nice work.' : 'Try another filter or search.') + '</div>';
      return;
    }
    var groups = {};
    list.forEach(function (t) { var b = bucket(t); (groups[b] = groups[b] || []).push(t); });
    var head = '<tr><th style="width:36px"></th><th>Task</th><th class="hide-sm">Assigned</th><th class="hide-sm">Due</th><th class="hide-sm">Status</th><th class="hide-sm"></th><th class="hide-sm">Added by</th></tr>';
    var body = '';
    BUCKETS.forEach(function (b) {
      var g = groups[b[0]]; if (!g) return;
      body += '<tr class="sr ' + b[2] + '"><td colspan="7">' + b[1] + ' · ' + g.length + '</td></tr>';
      g.forEach(function (t) {
        var di = dueInfo(t), done = t.status === 'Done';
        body += '<tr class="trow' + (done ? ' isdone' : '') + '" data-id="' + esc(t.id) + '">' +
          '<td><button class="ck' + (done ? ' on' : '') + '" data-ck="' + esc(t.id) + '" title="' + (done ? 'Reopen' : 'Mark done') + '">' + ic('check', 12) + '</button></td>' +
          '<td><div class="pn">' + esc(t.title) + (t.recurringId ? '<span class="tp">Recurring</span>' : '') + '</div>' +
            (t.details ? '<div class="ps">' + esc(t.details) + '</div>' : '') +
            '<div class="mmeta">' + assigneePill(t.assignee) + '<span class="due ' + di.cls + '">' + esc(di.label) + '</span>' +
              (t.status !== 'Open' ? '<span class="st ' + statusClass(t.status) + '"><span class="sd2"></span>' + esc(t.status) + '</span>' : '') +
              (t.commentCount ? '<span class="cmt">' + ic('msg', 11) + t.commentCount + '</span>' : '') + '</div></td>' +
          '<td class="hide-sm">' + assigneePill(t.assignee) + '</td>' +
          '<td class="hide-sm"><span class="due ' + di.cls + '">' + esc(di.label) + '</span></td>' +
          '<td class="hide-sm"><span class="st ' + statusClass(t.status) + '"><span class="sd2"></span>' + esc(t.status) + '</span></td>' +
          '<td class="hide-sm">' + (t.commentCount ? '<span class="cmt">' + ic('msg', 11) + t.commentCount + '</span>' : '') + '</td>' +
          '<td class="hide-sm" style="font-size:11px;color:var(--mu);white-space:nowrap">' + esc(t.createdBy) + '</td></tr>';
      });
    });
    el.innerHTML = '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }
  function assigneePill(n) {
    return n ? '<span class="ub"><span class="av">' + esc(initials(n)) + '</span>' + esc(n) + '</span>' : '<span class="ub none">Unassigned</span>';
  }

  // Delegated clicks in main
  $('main').addEventListener('click', function (e) {
    var t;
    if ((t = e.target.closest('[data-ck]'))) { e.stopPropagation(); toggleDone(t.getAttribute('data-ck')); return; }
    if ((t = e.target.closest('[data-act]'))) {
      var a = t.getAttribute('data-act');
      if (a === 'new') openTaskForm(null);
      else if (a === 'mine' || a === 'recurring') { S.view = a; renderChrome(); render(); }
      else if (a === 'newrec') openRecurringForm(null);
      return;
    }
    if ((t = e.target.closest('[data-filt]'))) {
      var fv = t.getAttribute('data-filt');
      if (fv === 'unassigned') { S.filter.person = '__none'; S.filter.status = 'active'; }
      else { S.filter.status = fv; if (S.view === 'board' && S.filter.person === '__none') S.filter.person = ''; }
      saveFilter(); render(); return;
    }
    if ((t = e.target.closest('#pills .pl'))) { S.filter.status = t.getAttribute('data-s'); saveFilter(); render(); return; }
    if ((t = e.target.closest('.trow'))) { openTask(t.getAttribute('data-id')); return; }
    if ((t = e.target.closest('[data-rec]'))) { openRecurringForm(t.getAttribute('data-rec')); return; }
    if ((t = e.target.closest('[data-person]'))) {
      S.filter.person = t.getAttribute('data-person'); S.filter.status = 'active'; S.view = 'board'; saveFilter(); renderChrome(); render(); return;
    }
    if ((t = e.target.closest('[data-open]'))) { var id = t.getAttribute('data-open'); if (S.tasks.some(function (x) { return x.id === id; })) openTask(id); }
  });
  $('main').addEventListener('input', function (e) {
    if (e.target.id === 'q') { S.filter.q = e.target.value; drawTable(S.view === 'mine'); }
  });
  $('main').addEventListener('change', function (e) {
    if (e.target.id === 'personSel') { S.filter.person = e.target.value; saveFilter(); render(); }
  });
  function saveFilter() { lsSet(LS_FILTER, JSON.stringify({ status: S.filter.status, person: S.filter.person })); }

  function upsertTask(t) {
    var i = S.tasks.findIndex(function (x) { return x.id === t.id; });
    if (i >= 0) S.tasks[i] = t; else S.tasks.push(t);
  }
  function toggleDone(id) {
    var t = S.tasks.find(function (x) { return x.id === id; }); if (!t) return;
    var next = t.status === 'Done' ? 'Open' : 'Done', prev = t.status;
    t.status = next; t.completedAt = next === 'Done' ? today() + 'T23:59:59' : '';
    renderChrome(); render();
    api('updateTask', { id: id, changes: { status: next } }).then(function (r) {
      upsertTask(r.task); renderChrome(); render();
      toast(next === 'Done' ? 'Marked done ✓' : 'Reopened');
    }).catch(function (e) { t.status = prev; renderChrome(); render(); if (!e.auth) toast(e.message, true); });
  }

  /* ---------------------------------------------------------------- modal */
  function openModal(html, wide) {
    $('modalBody').className = 'md' + (wide ? ' wide' : '');
    $('modalBody').innerHTML = html; $('modal').classList.add('show');
  }
  function closeModal() { $('modal').classList.remove('show'); $('modalBody').innerHTML = ''; }
  $('modal').addEventListener('mousedown', function (e) { if (e.target === this) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('modal').classList.contains('show')) closeModal(); });

  function staffOptions(sel) {
    return '<option value="">Unassigned</option>' + S.staff.map(function (s) {
      return '<option' + (s.name === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
  }
  function quickDates() {
    var t0 = today(), d = parseD(t0), toFri = (5 - d.getDay() + 7) % 7 || 7;
    return '<div class="quick" id="quickDates"><button type="button" data-d="' + t0 + '">Today</button><button type="button" data-d="' + addDays(t0, 1) + '">Tomorrow</button>' +
      '<button type="button" data-d="' + addDays(t0, toFri) + '">Friday</button><button type="button" data-d="' + addDays(t0, 7) + '">Next week</button><button type="button" data-d="">Clear</button></div>';
  }
  function wireQuickDates() {
    var q = $('quickDates'); if (!q) return;
    q.onclick = function (e) { var b = e.target.closest('button'); if (b) $('fDue').value = b.getAttribute('data-d'); };
  }

  /* New task */
  function openTaskForm() {
    var defAssignee = S.view === 'board' && S.filter.person && S.filter.person !== '__none' ? S.filter.person : '';
    openModal('<div class="mhead"><h2>New Task</h2><button class="xbtn" data-close>' + ic('x', 16) + '</button></div>' +
      '<div class="fm-group"><label for="fTitle">Task</label><input id="fTitle" maxlength="200" placeholder="What needs to happen?"></div>' +
      '<div class="fm-group"><label for="fDetails">Details</label><textarea id="fDetails" placeholder="Steps, phone numbers, vendor names, anything the next person needs to know."></textarea></div>' +
      '<div class="fm-row"><div class="fm-group"><label for="fAssignee">Assign to</label><select id="fAssignee">' + staffOptions(defAssignee) + '</select></div>' +
      '<div class="fm-group"><label for="fDue">Due date</label><input id="fDue" type="date">' + quickDates() + '</div></div>' +
      '<div class="ferr" id="fErr"></div><div class="ma"><button class="btn bo" data-close>Cancel</button><button class="btn bp" id="fSave">' + ic('plus', 12) + 'Add Task</button></div>');
    wireQuickDates(); $('fTitle').focus();
    $('fTitle').onkeydown = function (e) { if (e.key === 'Enter') $('fSave').click(); };
    $('fSave').onclick = function () {
      var title = $('fTitle').value.trim();
      if (!title) { $('fErr').textContent = 'Give the task a title.'; $('fTitle').focus(); return; }
      this.disabled = true;
      api('createTask', { task: { title: title, details: $('fDetails').value, assignee: $('fAssignee').value, dueDate: $('fDue').value } })
        .then(function (r) { upsertTask(r.task); closeModal(); renderChrome(); render(); toast('Task added' + (r.task.assignee ? ' for ' + r.task.assignee : '')); })
        .catch(function (e) { if (!e.auth) { $('fErr').textContent = e.message; $('fSave').disabled = false; } });
    };
  }

  /* Task detail / edit */
  function openTask(id) {
    var t = S.tasks.find(function (x) { return x.id === id; }); if (!t) return;
    var canDelete = isMgr() || t.createdBy === S.user.name;
    openModal('<div class="mhead"><h2>Task</h2><button class="xbtn" data-close>' + ic('x', 16) + '</button></div>' +
      '<div class="meta">Added by ' + esc(t.createdBy) + ' · ' + esc(fmtStamp(t.createdAt)) +
        (t.recurringId ? ' · <span class="tp" style="margin:0">Recurring</span>' : '') +
        (t.status === 'Done' && t.completedBy ? ' · Completed by ' + esc(t.completedBy) + ' ' + esc(fmtStamp(t.completedAt)) : '') + '</div>' +
      '<div class="fm-group"><label for="fTitle">Task</label><input id="fTitle" maxlength="200" value="' + esc(t.title) + '"></div>' +
      '<div class="fm-group"><label for="fDetails">Details</label><textarea id="fDetails">' + esc(t.details) + '</textarea></div>' +
      '<div class="fm-row3"><div class="fm-group"><label for="fAssignee">Assigned to</label><select id="fAssignee">' + staffOptions(t.assignee) + '</select></div>' +
      '<div class="fm-group"><label for="fDue">Due date</label><input id="fDue" type="date" value="' + esc(t.dueDate) + '"></div>' +
      '<div class="fm-group"><label for="fStatus">Status</label><select id="fStatus">' + S.statuses.map(function (s) { return '<option' + (s === t.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="ferr" id="fErr"></div>' +
      '<div class="ma">' + (canDelete ? '<button class="btn bd bsm" id="fDel">' + ic('trash', 12) + 'Delete</button>' : '') + '<span class="grow"></span>' +
        (t.status !== 'Done' ? '<button class="btn bo" id="fDone" style="border-color:var(--g);color:var(--g)">' + ic('check', 12) + 'Mark Done</button>' : '') +
        '<button class="btn bp" id="fSave">Save Changes</button></div>' +
      '<div class="dsec"><h3>' + ic('msg', 12) + 'Comments</h3><div id="cList"><div class="tcount">Loading…</div></div>' +
        '<div class="cbox"><textarea id="cText" placeholder="Add an update or note…"></textarea><button class="btn bp" id="cAdd">Post</button></div></div>' +
      '<div class="dsec"><h3>' + ic('hist', 12) + 'History</h3><ul class="hl" id="hList"><li>Loading…</li></ul></div>', true);

    function loadDetail() {
      api('getTask', { id: id }).then(function (d) {
        if (!$('cList')) return;
        $('cList').innerHTML = d.comments.length ? d.comments.map(function (c) {
          return '<div class="cm"><span class="av lg">' + esc(initials(c.author)) + '</span><div class="bub"><div class="who"><b>' + esc(c.author) + '</b> · ' + esc(fmtStamp(c.at)) + '</div>' + esc(c.text) + '</div></div>';
        }).join('') : '<div class="tcount" style="margin-bottom:10px">No comments yet.</div>';
        $('hList').innerHTML = d.history.slice().reverse().map(function (h) {
          return '<li><b>' + esc(h.actor) + '</b> ' + esc(h.action.toLowerCase()) + (h.detail ? ': ' + esc(h.detail) : '') + '<time>' + esc(fmtStamp(h.at)) + '</time></li>';
        }).join('') || '<li>No history.</li>';
      }).catch(function (e) { if ($('cList') && !e.auth) $('cList').innerHTML = '<div class="ferr">' + esc(e.message) + '</div>'; });
    }
    loadDetail();

    function save(extra) {
      var ch = { title: $('fTitle').value, details: $('fDetails').value, assignee: $('fAssignee').value, dueDate: $('fDue').value, status: $('fStatus').value };
      Object.assign(ch, extra || {});
      $('fSave').disabled = true;
      api('updateTask', { id: id, changes: ch }).then(function (r) {
        upsertTask(r.task); closeModal(); renderChrome(); render(); toast(ch.status === 'Done' && t.status !== 'Done' ? 'Marked done ✓' : 'Saved');
      }).catch(function (e) { if (!e.auth && $('fErr')) { $('fErr').textContent = e.message; $('fSave').disabled = false; } });
    }
    $('fSave').onclick = function () { save(); };
    if ($('fDone')) $('fDone').onclick = function () { save({ status: 'Done' }); };
    if ($('fDel')) $('fDel').onclick = function () {
      if (!confirm('Delete "' + t.title + '"? This can\'t be undone.')) return;
      api('deleteTask', { id: id }).then(function () {
        S.tasks = S.tasks.filter(function (x) { return x.id !== id; }); closeModal(); renderChrome(); render(); toast('Task deleted');
      }).catch(function (e) { if (!e.auth) $('fErr').textContent = e.message; });
    };
    $('cAdd').onclick = function () {
      var txt = $('cText').value.trim(); if (!txt) return;
      this.disabled = true;
      api('addComment', { id: id, text: txt }).then(function () {
        $('cText').value = ''; $('cAdd').disabled = false; t.commentCount = (t.commentCount || 0) + 1; render(); loadDetail();
      }).catch(function (e) { if (!e.auth) { toast(e.message, true); $('cAdd').disabled = false; } });
    };
    $('cText').onkeydown = function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('cAdd').click(); };
  }
  $('modalBody').addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeModal(); });

  /* Change PIN */
  function openChangePin() {
    openModal('<div class="mhead"><h2>Change My PIN</h2><button class="xbtn" data-close>' + ic('x', 16) + '</button></div>' +
      '<p class="lead">Pick a 4–6 digit PIN only you know.</p>' +
      '<div class="fm-group"><label for="pOld">Current PIN</label><input class="pw-input" id="pOld" type="password" inputmode="numeric" maxlength="6"></div>' +
      '<div class="fm-row"><div class="fm-group"><label for="pNew">New PIN</label><input class="pw-input" id="pNew" type="password" inputmode="numeric" maxlength="6"></div>' +
      '<div class="fm-group"><label for="pNew2">Repeat new PIN</label><input class="pw-input" id="pNew2" type="password" inputmode="numeric" maxlength="6"></div></div>' +
      '<div class="pw-error" id="pErr"></div><div class="ma"><button class="btn bo" data-close>Cancel</button><button class="btn bp" id="pSave">Update PIN</button></div>');
    $('pOld').focus();
    $('pSave').onclick = function () {
      var n = $('pNew').value.trim();
      if (!/^\d{4,6}$/.test(n)) { $('pErr').textContent = 'New PIN must be 4 to 6 digits.'; return; }
      if (n !== $('pNew2').value.trim()) { $('pErr').textContent = 'New PINs don\'t match.'; return; }
      api('changePin', { oldPin: $('pOld').value.trim(), newPin: n }).then(function () { closeModal(); toast('PIN updated'); })
        .catch(function (e) { if (!e.auth) $('pErr').textContent = e.message; });
    };
  }

  /* ------------------------------------------------------------ recurring */
  var FREQ = { daily: 'Every day', weekdays: 'Weekdays (Mon–Fri)', weekly: 'Weekly', monthly: 'Monthly' };
  function ordinal(n) { n = Number(n); var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function schedLabel(r) {
    if (r.frequency === 'weekly') return 'Every ' + String(r.days || '').split(',').join(', ');
    if (r.frequency === 'monthly') return 'Monthly on the ' + ordinal(r.days || 1);
    return FREQ[r.frequency] || r.frequency;
  }
  function renderRecurring() {
    var html = '';
    if (!isMgr()) html += '<div class="ob">' + ic('repeat') + 'Recurring tasks are created automatically each morning. Managers can add or change them.</div>';
    html += '<div class="tb"><div class="tt" style="flex:1;font-size:14px">' + ic('repeat') + 'Recurring Tasks <span class="tcount">· ' + S.recurring.length + '</span></div>' +
      (isMgr() ? '<button class="btn bp" data-act="newrec">' + ic('plus', 12) + 'New Recurring Task</button>' : '') + '</div>';
    if (!S.recurring.length) return html + '<div class="tc"><div class="empty"><b>No recurring tasks yet</b>Use these for things like the opening checklist or the weekly retail count.</div></div>';
    html += S.recurring.slice().sort(function (a, b) { return (b.active - a.active) || a.title.localeCompare(b.title); }).map(function (r) {
      return '<div class="rc' + (r.active ? '' : ' paused') + '"' + (isMgr() ? ' data-rec="' + esc(r.id) + '" style="cursor:pointer"' : '') + '>' +
        '<div class="ri"><h3>' + esc(r.title) + (r.active ? '' : ' <span class="tp" style="background:var(--sand);color:var(--mu)">Paused</span>') + '</h3>' +
        '<p>' + esc(schedLabel(r)) + (r.details ? ' · ' + esc(r.details) : '') + '</p></div>' +
        '<div style="text-align:right">' + assigneePill(r.assignee) + (r.lastGenerated ? '<div class="tcount" style="margin-top:4px">Last created ' + esc(fmtDate(r.lastGenerated)) + '</div>' : '') + '</div></div>';
    }).join('');
    return html;
  }
  function openRecurringForm(id) {
    var r = id ? S.recurring.find(function (x) { return x.id === id; }) : { title: '', details: '', assignee: '', frequency: 'weekdays', days: '', active: true };
    if (!r) return;
    var days = String(r.days || '').split(',');
    openModal('<div class="mhead"><h2>' + (id ? 'Edit' : 'New') + ' Recurring Task</h2><button class="xbtn" data-close>' + ic('x', 16) + '</button></div>' +
      '<p class="lead">A fresh task is created automatically on each scheduled day (around 5 AM), due that day.</p>' +
      '<div class="fm-group"><label for="rTitle">Task</label><input id="rTitle" maxlength="200" value="' + esc(r.title) + '" placeholder="e.g. Opening checklist"></div>' +
      '<div class="fm-group"><label for="rDetails">Details</label><textarea id="rDetails">' + esc(r.details) + '</textarea></div>' +
      '<div class="fm-row"><div class="fm-group"><label for="rAssignee">Assign to</label><select id="rAssignee">' + staffOptions(r.assignee) + '</select></div>' +
      '<div class="fm-group"><label for="rFreq">Repeats</label><select id="rFreq">' + Object.keys(FREQ).map(function (k) { return '<option value="' + k + '"' + (k === r.frequency ? ' selected' : '') + '>' + FREQ[k] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="fm-group" id="rWeekly"><span class="flabel">On these days</span><div class="fm-locs">' + DOW.map(function (d) {
        return '<label><input type="checkbox" value="' + d + '"' + (days.indexOf(d) >= 0 ? ' checked' : '') + '>' + d + '</label>'; }).join('') + '</div></div>' +
      '<div class="fm-group" id="rMonthly"><label for="rDom">Day of the month</label><input id="rDom" type="number" min="1" max="31" value="' + esc(r.frequency === 'monthly' ? r.days : 1) + '" style="max-width:120px"></div>' +
      '<div class="fm-group"><div class="fm-locs"><label><input type="checkbox" id="rActive"' + (r.active ? ' checked' : '') + '>Active</label></div></div>' +
      '<div class="ferr" id="rErr"></div><div class="ma">' + (id ? '<button class="btn bd bsm" id="rDel">' + ic('trash', 12) + 'Remove</button>' : '') +
      '<span class="grow"></span><button class="btn bo" data-close>Cancel</button><button class="btn bp" id="rSave">Save</button></div>');
    function sync() { var f = $('rFreq').value; $('rWeekly').hidden = f !== 'weekly'; $('rMonthly').hidden = f !== 'monthly'; }
    $('rFreq').onchange = sync; sync(); $('rTitle').focus();
    $('rSave').onclick = function () {
      var f = $('rFreq').value;
      var d = f === 'weekly' ? Array.prototype.map.call(document.querySelectorAll('#rWeekly input:checked'), function (i) { return i.value; }).join(',') : f === 'monthly' ? $('rDom').value : '';
      this.disabled = true;
      api('saveRecurring', { rec: { id: id || '', title: $('rTitle').value, details: $('rDetails').value, assignee: $('rAssignee').value, frequency: f, days: d, active: $('rActive').checked } })
        .then(function () { closeModal(); toast('Recurring task saved'); return refresh(true); })
        .catch(function (e) { if (!e.auth) { $('rErr').textContent = e.message; $('rSave').disabled = false; } });
    };
    if ($('rDel')) $('rDel').onclick = function () {
      if (!confirm('Stop and remove "' + r.title + '"? Tasks already created stay on the board.')) return;
      api('deleteRecurring', { id: id }).then(function () { closeModal(); toast('Removed'); return refresh(true); })
        .catch(function (e) { if (!e.auth) $('rErr').textContent = e.message; });
    };
  }

  /* -------------------------------------------------------------- history */
  function loadActivity() {
    api('activity', { limit: 200 }).then(function (d) { S.activity = d.activity; if (S.view === 'activity') render(); })
      .catch(function (e) { if (!e.auth && $('actTable')) $('actTable').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }
  function renderActivity() {
    var html = '<div class="tc"><div class="thb"><div class="tt">' + ic('hist') + 'Team Activity</div><div class="tcount">Most recent 200 changes</div></div><div class="ts" id="actTable">';
    if (!S.activity) return html + '<div class="empty">Loading…</div></div></div>';
    if (!S.activity.length) return html + '<div class="empty"><b>No activity yet</b>Changes to tasks show up here.</div></div></div>';
    html += '<table><thead><tr><th>When</th><th>Who</th><th>Task</th><th>Change</th></tr></thead><tbody>' + S.activity.map(function (a) {
      return '<tr class="trow" data-open="' + esc(a.taskId) + '"><td class="nowrap" style="color:var(--mu);font-size:11px">' + esc(fmtStamp(a.at)) + '</td>' +
        '<td>' + assigneePill(a.actor) + '</td><td class="pn">' + esc(a.title || (a.action === 'Deleted' ? a.detail : '—')) + '</td>' +
        '<td style="font-size:11px"><b>' + esc(a.action) + '</b>' + (a.detail && a.action !== 'Deleted' ? ' · ' + esc(a.detail) : '') + '</td></tr>';
    }).join('') + '</tbody></table>';
    return html + '</div></div>';
  }

  /* ----------------------------------------------------------------- team */
  function renderTeam() {
    var t0 = today(), wk = addDays(t0, -7);
    var html = '<div class="tb"><div class="tt" style="flex:1;font-size:14px">' + ic('team') + 'Team <span class="tcount">· tap a person to see their tasks</span></div></div><div class="tg">';
    html += S.staff.map(function (s) {
      var mine = S.tasks.filter(function (t) { return t.assignee === s.name; });
      var open = mine.filter(function (t) { return t.status !== 'Done'; });
      var od = open.filter(function (t) { return t.dueDate && t.dueDate < t0; }).length;
      var done = mine.filter(function (t) { return t.status === 'Done' && String(t.completedAt).slice(0, 10) >= wk; }).length;
      return '<div class="pc" data-person="' + esc(s.name) + '"><div class="top"><span class="av lg">' + esc(initials(s.name)) + '</span><div><h3>' + esc(s.name) + '</h3><div class="role">' + (s.role === 'manager' ? 'Manager' : 'Front desk') + '</div></div></div>' +
        '<div class="nums"><div><b>' + open.length + '</b>open</div><div class="' + (od ? 'red' : '') + '"><b>' + od + '</b>overdue</div><div><b>' + done + '</b>done (7d)</div></div></div>';
    }).join('');
    var un = S.tasks.filter(function (t) { return !t.assignee && t.status !== 'Done'; }).length;
    html += '<div class="pc" data-person="__none"><div class="top"><span class="av lg" style="background:var(--sand);color:var(--mu)">?</span><div><h3>Unassigned</h3><div class="role">Needs an owner</div></div></div><div class="nums"><div><b>' + un + '</b>open</div></div></div>';
    return html + '</div>';
  }

  /* ---------------------------------------------------------- auto-refresh */
  setInterval(function () {
    if (document.hidden || $('modal').classList.contains('show') || !S.user) return;
    if (document.activeElement && document.activeElement.id === 'q') return;
    refresh(true);
  }, Math.max(20, Number(CFG.REFRESH_SECONDS) || 60) * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S.user) refresh(true); });

  /* ----------------------------------------------------------------- start */
  if (DEMO) $('demoBar').hidden = false;
  setSync('ok');
  if (S.token) boot().catch(function (e) { if (!e.auth) { $('main').innerHTML = '<div class="empty"><b>Can\'t load tasks</b>' + esc(e.message) + '</div>'; } });
  else showSignIn();
})();
