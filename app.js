/* ENJC Messenger: WhatsApp click-to-chat sender.
   Everything is stored in this browser only (localStorage). Nothing is uploaded. */
(function () {
  'use strict';

  /* ---------- storage ---------- */
  var LS_KEY = 'enjc_wa_v1';

  var DEFAULT_TEMPLATES = [
    { name: 'Service reminder', text: 'வணக்கம் {name}! இந்த ஞாயிறு காலை 9 மணிக்கு ஆராதனை. அவசியம் வாருங்கள். - ENJC' },
    { name: 'Prayer meeting', text: 'வணக்கம் {name}! இன்று மாலை 7 மணிக்கு ஜெபக்கூடுகை நடைபெறும். அனைவரும் வாருங்கள். - ENJC' },
    { name: 'Birthday wish', text: 'பிறந்தநாள் வாழ்த்துக்கள் {name}! தேவன் உங்களை ஆசீர்வதித்து வழிநடத்துவாராக. - ENJC' },
    { name: 'Event invite', text: 'வணக்கம் {name}! ENJC சிறப்புக் கூட்டத்திற்கு உங்களை அன்புடன் அழைக்கிறோம். தேதி: [date], நேரம்: [time]. - ENJC' }
  ];

  var db = load();

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var r = JSON.parse(raw);
        if (r && Array.isArray(r.contacts)) {
          r.templates = Array.isArray(r.templates) && r.templates.length ? r.templates : DEFAULT_TEMPLATES.slice();
          if (typeof r.autoMark !== 'boolean') r.autoMark = true;
          if (!r.campaign) r.campaign = null;
          return r;
        }
      }
    } catch (e) { /* private mode or bad JSON: start fresh */ }
    return { contacts: [], templates: DEFAULT_TEMPLATES.slice(), campaign: null, autoMark: true };
  }

  var saveWarned = false;
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(db)); }
    catch (e) {
      if (!saveWarned) { saveWarned = true; toast('Could not save on this device. Data will be lost when you close the app.'); }
    }
  }

  /* ---------- tiny DOM helpers (all user text goes through textContent) ---------- */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
        else if (k === 'checked' || k === 'disabled' || k === 'value') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }

  var ICONS = {
    back: '<path d="M15 6l-6 6 6 6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    arrow: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5a3.5 3.5 0 0 1 0 7"/><path d="M18 14c2 .7 3 2.8 3 6"/>',
    upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    sliders: '<path d="M4 6h10"/><path d="M18 6h2"/><circle cx="16" cy="6" r="2"/><path d="M4 12h2"/><path d="M10 12h10"/><circle cx="8" cy="12" r="2"/><path d="M4 18h12"/><circle cx="18" cy="18" r="2"/>',
    x: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.9 7L4 20l1.1-4.9A8 8 0 1 1 21 12z"/>'
  };
  function icon(name, size, sw) {
    var s = size || 20;
    var span = document.createElement('span');
    span.style.display = 'inline-flex';
    span.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
    return span;
  }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  /* ---------- data helpers ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function normPhone(raw) {
    if (raw == null || raw === '') return null;
    var s = typeof raw === 'number' ? String(Math.round(raw)) : String(raw);
    s = s.replace(/\D/g, '');
    if (!s) return null;
    if (s.length === 10) return /^[6-9]/.test(s) ? '91' + s : null;
    if (s.length === 11 && s[0] === '0') return /^[6-9]/.test(s[1]) ? '91' + s.slice(1) : null;
    if (s.length === 12 && s.indexOf('91') === 0) return /^[6-9]/.test(s[2]) ? s : null;
    if (s.length >= 11 && s.length <= 15 && s[0] !== '0') return s; // other countries
    return null;
  }

  function fmtPhone(p) {
    if (!p) return '';
    if (p.length === 12 && p.indexOf('91') === 0) return '+91 ' + p.slice(2, 7) + ' ' + p.slice(7);
    return '+' + p;
  }

  function titleCase(s) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.toLowerCase().replace(/(^|[\s\-/])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); });
  }

  function splitGroups(v) {
    if (v == null || v === '') return [];
    var seen = {}, out = [];
    String(v).split(/[,;|\/]/).forEach(function (g) {
      g = titleCase(g);
      if (g && !seen[g]) { seen[g] = 1; out.push(g); }
    });
    return out;
  }

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  /* returns "MM-DD" or "" */
  function parseBday(v) {
    if (v == null || v === '') return '';
    var m, d;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      var dt = new Date(v.getTime() + 12 * 3600 * 1000); // dodge timezone edge in Excel dates
      return pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
    }
    var s = String(v).trim();
    if (!s) return '';
    var parts = s.split(/[-\/.\s,]+/).filter(Boolean);
    if (parts.length < 2) return '';
    var mi = MONTHS.indexOf(parts[1].slice(0, 3).toLowerCase());
    if (mi >= 0) { d = +parts[0]; m = mi + 1; }
    else if (parts[0].length === 4) { m = +parts[1]; d = +parts[2]; }
    else { d = +parts[0]; m = +parts[1]; }
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    return pad(m) + '-' + pad(d);
  }

  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '#';
    var a = Array.from(p[0])[0] || '';
    var b = p.length > 1 ? (Array.from(p[p.length - 1])[0] || '') : (Array.from(p[0])[1] || '');
    return (a + b).toUpperCase();
  }
  function avClass(name) {
    var n = 0, s = String(name || '');
    for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
    return 'av' + (n % 4);
  }

  function ago(ts) {
    if (!ts) return 'Never';
    var d = Math.floor((Date.now() - ts) / 86400000);
    if (d <= 0) return 'Today';
    if (d < 60) return d + 'd ago';
    return Math.floor(d / 30) + 'mo ago';
  }

  function uniqueSorted(list) {
    var seen = {}, out = [];
    list.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }

  function fillTemplate(t, c) {
    return String(t)
      .replace(/\{name\}/gi, c.name || '')
      .replace(/\{group\}/gi, (c.groups || []).join(', '))
      .replace(/\{area\}/gi, c.area || '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/ ([!,.?])/g, '$1')
      .trim();
  }

  function findContact(id) {
    for (var i = 0; i < db.contacts.length; i++) if (db.contacts[i].id === id) return db.contacts[i];
    return null;
  }

  /* ---------- file import ---------- */
  var HEAD_MAP = {
    number: 'number', phone: 'number', mobile: 'number', whatsapp: 'number', 'phone number': 'number', 'mobile number': 'number', contact: 'number', 'contact number': 'number', 'whatsapp number': 'number',
    name: 'name', 'full name': 'name',
    group: 'group', groups: 'group', ministry: 'group', category: 'group',
    area: 'area', place: 'area', location: 'area', locality: 'area',
    language: 'language', lang: 'language',
    birthday: 'birthday', dob: 'birthday', 'date of birth': 'birthday', birthdate: 'birthday', 'birth date': 'birthday', bday: 'birthday'
  };

  function parseRows(rows) {
    if (!rows.length) throw new Error('The file is empty.');
    var cols = {}, first = rows[0] || [], hasHeader = false;
    first.forEach(function (cell, i) {
      var k = HEAD_MAP[String(cell).trim().toLowerCase()];
      if (k && cols[k] == null) { cols[k] = i; hasHeader = true; }
    });
    var start = 1;
    if (cols.number == null) {
      if (!hasHeader && normPhone(first[0]) !== null) { cols = { number: 0, name: 1 }; start = 0; }
      else throw new Error('Could not find a "Number" column. Put Number in the first row.');
    }
    var byId = {}, list = [], merged = 0;
    for (var r = start; r < rows.length; r++) {
      var row = rows[r] || [];
      var rawNum = row[cols.number];
      var name = cols.name != null ? String(row[cols.name] == null ? '' : row[cols.name]).replace(/\s+/g, ' ').trim() : '';
      if ((rawNum === '' || rawNum == null) && !name) continue; // blank row
      var phone = normPhone(rawNum);
      var id = phone || ('bad:' + String(rawNum) + '|' + name);
      var groups = cols.group != null ? splitGroups(row[cols.group]) : [];
      var area = cols.area != null && row[cols.area] !== '' ? titleCase(row[cols.area]) : '';
      var lang = cols.language != null && row[cols.language] !== '' ? titleCase(row[cols.language]) : '';
      var bday = cols.birthday != null ? parseBday(row[cols.birthday]) : '';
      var ex = byId[id];
      if (ex) {
        merged++;
        groups.forEach(function (g) { if (ex.groups.indexOf(g) < 0) ex.groups.push(g); });
        if (!ex.name && name) ex.name = name;
        if (!ex.area) ex.area = area;
        if (!ex.language) ex.language = lang;
        if (!ex.birthday) ex.birthday = bday;
      } else {
        var c = { id: id, phone: phone, raw: String(rawNum == null ? '' : rawNum), name: name, groups: groups, area: area, language: lang, birthday: bday, lastSent: null, valid: !!phone };
        byId[id] = c; list.push(c);
      }
    }
    if (!list.length) throw new Error('No contacts found in this file.');
    var invalid = list.filter(function (c) { return !c.valid; }).length;
    return { contacts: list, ready: list.length - invalid, invalid: invalid, merged: merged };
  }

  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array', cellDates: true });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      return parseRows(rows);
    });
  }

  function mergeIntoDb(incoming) {
    var map = {};
    db.contacts.forEach(function (c) { map[c.id] = c; });
    var added = 0, updated = 0;
    incoming.forEach(function (c) {
      var ex = map[c.id];
      if (ex) {
        updated++;
        if (c.name) ex.name = c.name;
        c.groups.forEach(function (g) { if (ex.groups.indexOf(g) < 0) ex.groups.push(g); });
        if (c.area) ex.area = c.area;
        if (c.language) ex.language = c.language;
        if (c.birthday) ex.birthday = c.birthday;
      } else { db.contacts.push(c); map[c.id] = c; added++; }
    });
    save();
    return { added: added, updated: updated };
  }

  function downloadSample() {
    var rows = [
      ['Number', 'Name', 'Group', 'Area', 'Language', 'Birthday'],
      ['99628 08110', 'Karthik Daniel', 'Leaders, Men', 'Tondiarpet', 'Tamil', '15-03'],
      ['90250 08781', 'Immanuel', 'Youth, Choir', 'Tondiarpet', 'Tamil', '21-10'],
      ['70927 52601', 'Inbaraj', 'Youth', 'Korukkupet', 'English', '02-12']
    ];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Contacts');
    XLSX.writeFile(wb, 'enjc-contacts-sample.xlsx');
  }

  /* ---------- app state ---------- */
  var app = document.getElementById('app');
  var fileInput = document.getElementById('file');

  var S = {
    view: 'home',
    pending: null,        // parsed import waiting for confirmation
    importError: '',
    filters: newFilters(),
    selected: {},         // id -> true
    compose: null,        // { ids, text, tpl, fromBirthday }
    sheet: null,          // draft filters while the filter sheet is open
    opened: null,         // { id, hidden } for the current WhatsApp hand-off
    chosenFileName: ''
  };

  function newFilters() {
    return { q: '', groups: {}, areas: {}, langs: {}, last: 'any', bdayMonth: false, hideInvalid: true };
  }
  function cloneFilters(f) {
    return { q: f.q, groups: Object.assign({}, f.groups), areas: Object.assign({}, f.areas), langs: Object.assign({}, f.langs), last: f.last, bdayMonth: f.bdayMonth, hideInvalid: f.hideInvalid };
  }
  function activeCount(f) {
    return Object.keys(f.groups).length + Object.keys(f.areas).length + Object.keys(f.langs).length + (f.last !== 'any' ? 1 : 0) + (f.bdayMonth ? 1 : 0);
  }

  function applyFilters(f) {
    var q = f.q.trim().toLowerCase();
    var qd = q.replace(/\D/g, '');
    var now = Date.now(), month = new Date().getMonth() + 1;
    var gk = Object.keys(f.groups), ak = Object.keys(f.areas), lk = Object.keys(f.langs);
    return db.contacts.filter(function (c) {
      if (f.hideInvalid && !c.valid) return false;
      if (q) {
        var hit = c.name.toLowerCase().indexOf(q) >= 0 || (qd && String(c.phone || c.raw).replace(/\D/g, '').indexOf(qd) >= 0);
        if (!hit) return false;
      }
      if (gk.length && !c.groups.some(function (g) { return f.groups[g]; })) return false;
      if (ak.length && !f.areas[c.area]) return false;
      if (lk.length && !f.langs[c.language]) return false;
      if (f.last === 'never' && c.lastSent) return false;
      if (f.last === '30' && c.lastSent && now - c.lastSent < 30 * 86400000) return false;
      if (f.bdayMonth && !(c.birthday && +c.birthday.slice(0, 2) === month)) return false;
      return true;
    }).sort(function (a, b) { return (a.name || a.raw).localeCompare(b.name || b.raw); });
  }

  function go(view) {
    S.view = view;
    render();
  }

  /* ---------- router ---------- */
  function render() {
    var v;
    if (S.view === 'home') v = viewHome();
    else if (S.view === 'import') v = viewImport();
    else if (S.view === 'contacts') v = viewContacts();
    else if (S.view === 'compose') v = viewCompose();
    else v = viewSending();
    app.textContent = '';
    app.appendChild(v);
    if (S.sheet) app.appendChild(viewSheet());
  }

  /* ---------- HOME ---------- */
  function birthdayLists() {
    var now = new Date(), today = [], week = [];
    var wk = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    db.contacts.forEach(function (c) {
      if (!c.valid || !c.birthday) return;
      var m = +c.birthday.slice(0, 2), d = +c.birthday.slice(3);
      for (var i = 0; i <= 7; i++) {
        var t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        if (t.getMonth() + 1 === m && t.getDate() === d) {
          if (i === 0) today.push(c);
          else week.push({ c: c, i: i, day: i === 1 ? 'Tomorrow' : wk[t.getDay()] });
          break;
        }
      }
    });
    week.sort(function (a, b) { return a.i - b.i; });
    return { today: today, week: week };
  }

  function campaignPending() {
    return db.campaign ? db.campaign.items.filter(function (i) { return i.status === 'pending'; }).length : 0;
  }

  function wishBtn(c, primary) {
    return h('button', {
      type: 'button', class: 'btn small' + (primary ? '' : ' outline'),
      onclick: function () { startBirthday(c); }
    }, 'Send wish');
  }

  function birthdayRow(c, sub, primary) {
    return h('div', { class: 'row-card' },
      h('div', { class: 'avatar ' + avClass(c.name) }, initials(c.name)),
      h('div', { class: 'main' },
        h('div', { class: 'name', style: 'font-size:16px' }, c.name || fmtPhone(c.phone)),
        sub ? h('div', { class: 'meta' }, sub) : null),
      wishBtn(c, primary));
  }

  function viewHome() {
    var b = birthdayLists();
    var pend = campaignPending();
    var hasContacts = db.contacts.length > 0;

    var body = h('div', { class: 'scroll pad col', style: 'gap:24px; padding-bottom:24px' });

    body.appendChild(h('button', {
      type: 'button', class: 'hero',
      onclick: function () {
        if (!hasContacts) { toast('Add your contacts first'); go('import'); return; }
        S.filters = newFilters(); S.selected = {}; go('contacts');
      }
    },
      h('div', { class: 'plus' }, icon('plus', 28, 2.4)),
      h('div', { class: 'col gap6', style: 'flex:1' },
        h('div', { class: 't' }, 'New message'),
        h('div', { class: 's' }, 'Pick people, write, send')),
      icon('next', 22, 2.2)));

    if (pend > 0) {
      var done = db.campaign.items.length - pend;
      body.appendChild(h('button', { type: 'button', class: 'resume', onclick: function () { go('sending'); } },
        h('div', { class: 'col gap6', style: 'flex:1; min-width:0' },
          h('div', { class: 'label green' }, 'Continue sending'),
          h('div', { style: 'font-weight:700' }, done + ' of ' + db.campaign.items.length + ' done, ' + pend + ' left')),
        icon('next', 22, 2.2)));
    }

    var sec = h('div', { class: 'col gap12' });
    sec.appendChild(h('div', { style: 'display:flex; align-items:center; justify-content:space-between' },
      h('h2', { class: 'sec-title' }, 'Birthdays'),
      h('div', { class: 'muted', style: 'font-size:13px' }, 'Today and this week')));

    if (!hasContacts) {
      sec.appendChild(h('div', { class: 'empty' }, 'Add your contacts to see birthdays here.'));
    } else {
      sec.appendChild(h('div', { class: 'label green' }, 'Today'));
      if (b.today.length) b.today.slice(0, 20).forEach(function (c) { sec.appendChild(birthdayRow(c, '', true)); });
      else sec.appendChild(h('div', { class: 'empty' }, 'No birthdays today'));
      if (b.week.length) {
        sec.appendChild(h('div', { class: 'label', style: 'margin-top:6px' }, 'This week'));
        b.week.slice(0, 20).forEach(function (x) { sec.appendChild(birthdayRow(x.c, x.day, false)); });
      }
    }
    body.appendChild(sec);

    return h('div', { class: 'view' },
      h('div', { class: 'topbar spread', style: 'padding-bottom:20px' },
        h('div', { class: 'title-col' },
          h('div', { class: 'hello' }, 'வணக்கம், Dani'),
          h('h1', null, 'ENJC Messenger')),
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Contacts and import', onclick: function () { S.pending = null; S.importError = ''; go('import'); } }, icon('people'))),
      body);
  }

  function startBirthday(c) {
    var tpl = db.templates.filter(function (t) { return /birthday/i.test(t.name); })[0] || DEFAULT_TEMPLATES[2];
    S.compose = { ids: [c.id], text: tpl.text, tpl: tpl.name, fromBirthday: true };
    go('compose');
  }

  /* ---------- IMPORT ---------- */
  function viewImport() {
    var p = S.pending;
    var body = h('div', { class: 'scroll pad col gap18', style: 'padding-top:4px; padding-bottom:18px' });

    body.appendChild(h('button', { type: 'button', class: 'dropzone', onclick: function () { fileInput.value = ''; fileInput.click(); } },
      icon('upload', 32),
      h('span', { style: 'font-size:16px; font-weight:700' }, 'Choose Excel or CSV file'),
      h('span', { style: 'font-size:13px' }, '.xlsx or .csv')));

    if (S.importError) body.appendChild(h('div', { class: 'note red', role: 'alert' }, icon('info'), h('div', null, S.importError)));

    body.appendChild(h('div', { class: 'card col gap10' },
      h('div', { class: 'label' }, 'File columns'),
      h('div', { class: 'chips' },
        h('span', { class: 'colchip req' }, 'Number'), h('span', { class: 'colchip req' }, 'Name'),
        h('span', { class: 'colchip' }, 'Group'), h('span', { class: 'colchip' }, 'Area'),
        h('span', { class: 'colchip' }, 'Language'), h('span', { class: 'colchip' }, 'Birthday')),
      h('div', { class: 'small muted' }, 'Green = required. Others are optional. Many groups in one cell: Youth, Choir. Birthday like 15-03 (day-month).'),
      h('button', { type: 'button', class: 'btn text', style: 'align-self:flex-start; padding-left:0', onclick: downloadSample }, 'Download a sample file')));

    if (p) {
      var rows = p.contacts.slice(0, 3);
      body.appendChild(h('div', { class: 'col gap10' },
        h('div', { style: 'display:flex; justify-content:space-between; align-items:center' },
          h('div', { class: 'label' }, 'Preview'),
          h('div', { style: 'font-size:13px; font-weight:600; color:var(--green); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px' }, S.chosenFileName)),
        h('div', { class: 'stats' },
          stat(p.ready, 'Ready', 'var(--green)'), stat(p.invalid, 'Invalid', 'var(--red-ink)'), stat(p.merged, 'Merged', 'var(--amber-ink)')),
        h('div', { class: 'table' },
          h('div', { class: 'tr th' }, h('div', { class: 'c1' }, 'Number'), h('div', { class: 'c2' }, 'Name')),
          rows.map(function (c) {
            return h('div', { class: 'tr' },
              h('div', { class: 'c1', style: c.valid ? '' : 'color:var(--red-ink)' }, c.valid ? fmtPhone(c.phone) : (c.raw || '(empty)')),
              h('div', { class: 'c2' }, c.name || '-'));
          })),
        h('div', { class: 'small muted' }, '91 is added automatically. The same number twice is merged into one contact. Invalid numbers are kept but never messaged.')));
    } else if (db.contacts.length) {
      var bad = db.contacts.filter(function (c) { return !c.valid; }).length;
      body.appendChild(h('div', { class: 'stats' }, stat(db.contacts.length, 'Saved contacts', 'var(--ink)'), stat(bad, 'Invalid numbers', 'var(--red-ink)')));
    }

    body.appendChild(h('div', { class: 'note blue' }, icon('lock'), h('div', null, 'Contacts stay on this phone only. Nothing is uploaded online.')));

    var foot = null;
    if (p) {
      foot = h('div', { class: 'footer' },
        h('button', { type: 'button', class: 'btn', onclick: confirmImport }, 'Import ' + p.contacts.length + ' contacts'));
    } else if (db.contacts.length) {
      foot = h('div', { class: 'footer' },
        h('div', { class: 'two' },
          h('button', { type: 'button', class: 'btn ghost', onclick: function () { S.filters = newFilters(); S.selected = {}; go('contacts'); } }, 'View contacts'),
          h('button', { type: 'button', class: 'btn ghost', style: 'color:var(--red-ink)', onclick: clearAll }, 'Delete all')));
    }

    return h('div', { class: 'view' },
      h('div', { class: 'topbar' },
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Back to home', onclick: function () { S.pending = null; go('home'); } }, icon('back', 20, 2.2)),
        h('h1', null, 'Add contacts')),
      body, foot);
  }

  function stat(n, label, color) {
    return h('div', { class: 'stat' }, h('b', { style: 'color:' + color }, String(n)), h('span', null, label));
  }

  function confirmImport() {
    var r = mergeIntoDb(S.pending.contacts);
    toast(r.added + ' added' + (r.updated ? ', ' + r.updated + ' updated' : ''));
    S.pending = null; S.filters = newFilters(); S.selected = {};
    go('contacts');
  }

  function clearAll() {
    if (!window.confirm('Delete all ' + db.contacts.length + ' saved contacts from this phone?')) return;
    db.contacts = []; db.campaign = null; save(); S.selected = {};
    toast('All contacts deleted');
    go('import');
  }

  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    S.chosenFileName = f.name;
    S.importError = '';
    readFile(f).then(function (res) { S.pending = res; if (S.view === 'import') render(); else go('import'); })
      .catch(function (e) { S.pending = null; S.importError = (e && e.message) || 'Could not read this file.'; if (S.view !== 'import') S.view = 'import'; render(); });
  });

  /* ---------- CONTACTS ---------- */
  function viewContacts() {
    var f = S.filters;
    var listEl = h('div', { class: 'scroll col gap8', style: 'padding:0 20px 12px' });
    var selAll = h('input', { type: 'checkbox', id: 'selall' });
    var selTxt = h('span', null, '');
    var countTxt = h('div', { class: 'muted', style: 'font-size:13px' });
    var chipHost = h('div', { class: 'chiprow' });
    var footSel = h('b', null, '');
    var footBad = h('span', null, '');
    var nextBtn = h('button', { type: 'button', class: 'btn', onclick: toCompose }, 'Write message', icon('arrow', 20, 2.2));
    var filtered = [];

    function validIds() { return filtered.filter(function (c) { return c.valid; }); }

    function paintMeta() {
      var ids = validIds();
      var selCount = Object.keys(S.selected).length;
      var allOn = ids.length > 0 && ids.every(function (c) { return S.selected[c.id]; });
      selAll.checked = allOn;
      selTxt.textContent = 'Select all ' + ids.length;
      countTxt.textContent = filtered.length + ' of ' + db.contacts.length;
      footSel.textContent = selCount + ' selected';
      var bad = db.contacts.filter(function (c) { return !c.valid; }).length;
      footBad.textContent = bad ? bad + ' invalid numbers skipped' : '';
      if (selCount) nextBtn.removeAttribute('disabled'); else nextBtn.setAttribute('disabled', '');
    }

    function paintChips() {
      chipHost.textContent = '';
      var n = activeCount(f);
      chipHost.appendChild(h('button', { type: 'button', class: 'chip soft', style: 'padding:0 12px', onclick: openSheet },
        icon('sliders', 18), 'Filters', n ? h('span', { class: 'count' }, String(n)) : null));
      function rm(map, key, label) {
        chipHost.appendChild(h('button', { type: 'button', class: 'chip removable', 'aria-label': 'Remove filter ' + label, onclick: function () { delete map[key]; reselect(); paintChips(); } },
          label, icon('x', 16, 2.2)));
      }
      Object.keys(f.groups).forEach(function (k) { rm(f.groups, k, k); });
      Object.keys(f.areas).forEach(function (k) { rm(f.areas, k, k); });
      Object.keys(f.langs).forEach(function (k) { rm(f.langs, k, k); });
      if (f.last !== 'any') chipHost.appendChild(h('button', { type: 'button', class: 'chip removable', onclick: function () { f.last = 'any'; reselect(); paintChips(); } }, f.last === 'never' ? 'Never messaged' : 'Not in 30 days', icon('x', 16, 2.2)));
      if (f.bdayMonth) chipHost.appendChild(h('button', { type: 'button', class: 'chip removable', onclick: function () { f.bdayMonth = false; reselect(); paintChips(); } }, 'Birthday this month', icon('x', 16, 2.2)));
    }

    function paintList() {
      listEl.textContent = '';
      if (!filtered.length) {
        listEl.appendChild(h('div', { class: 'empty' }, db.contacts.length ? 'No contacts match. Try clearing a filter.' : 'No contacts yet.'));
        return;
      }
      var frag = document.createDocumentFragment();
      filtered.forEach(function (c) {
        var cb = h('input', { type: 'checkbox', checked: !!S.selected[c.id], disabled: !c.valid, 'aria-label': (c.valid ? 'Select ' : 'Cannot select, invalid number: ') + (c.name || c.raw) });
        cb.addEventListener('change', function () { if (cb.checked) S.selected[c.id] = true; else delete S.selected[c.id]; paintMeta(); });
        var sub = [c.groups.join(', '), c.area].filter(Boolean).join(' · ') || (c.valid ? fmtPhone(c.phone) : c.raw);
        frag.appendChild(h('label', { class: 'row-card' + (c.valid ? '' : ' dim') }, cb,
          h('div', { class: 'avatar ' + avClass(c.name) }, initials(c.name)),
          h('div', { class: 'main' }, h('div', { class: 'name' }, c.name || fmtPhone(c.phone) || c.raw), h('div', { class: 'meta' }, sub)),
          c.valid ? h('div', { class: 'right' }, ago(c.lastSent)) : h('span', { class: 'pill bad' }, 'Invalid no.')));
      });
      listEl.appendChild(frag);
    }

    function refresh() { filtered = applyFilters(f); paintList(); paintMeta(); }
    function reselect() {
      filtered = applyFilters(f);
      S.selected = {};
      validIds().forEach(function (c) { S.selected[c.id] = true; });
      paintList(); paintMeta();
    }

    selAll.addEventListener('change', function () {
      validIds().forEach(function (c) { if (selAll.checked) S.selected[c.id] = true; else delete S.selected[c.id]; });
      paintList(); paintMeta();
    });

    function openSheet() { S.sheet = cloneFilters(f); render(); }
    S.applySheet = function (draft) { S.filters = draft; f = draft; };

    var searchInput = h('input', { id: 'q', type: 'search', placeholder: 'Search name or phone', value: f.q, autocomplete: 'off' });
    var t;
    searchInput.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { f.q = searchInput.value; refresh(); }, 120); });

    paintChips(); refresh();

    return h('div', { class: 'view' },
      h('div', { class: 'topbar spread' },
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Back to home', onclick: function () { go('home'); } }, icon('back', 20, 2.2)),
        h('div', { class: 'title-col' }, h('h1', null, 'Contacts'), h('div', { class: 'sub' }, db.contacts.length.toLocaleString('en-IN') + ' members and friends')),
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Import contacts', onclick: function () { S.pending = null; S.importError = ''; go('import'); } }, icon('upload'))),
      h('label', { class: 'search', for: 'q' }, h('span', { class: 'sr' }, 'Search by name or phone'), icon('search'), searchInput),
      chipHost,
      h('div', { style: 'padding:4px 20px 10px; display:flex; align-items:center; justify-content:space-between; gap:12px' },
        h('label', { for: 'selall', style: 'display:flex; align-items:center; gap:10px; font-size:14px; font-weight:600' }, selAll, selTxt), countTxt),
      listEl,
      h('div', { class: 'footer' }, h('div', { class: 'row' }, footSel, footBad), nextBtn));
  }

  function toCompose() {
    var ids = Object.keys(S.selected);
    if (!ids.length) { toast('Select at least one person'); return; }
    var prev = S.compose;
    S.compose = { ids: ids, text: prev && prev.text ? prev.text : db.templates[0].text, tpl: prev ? prev.tpl : db.templates[0].name, fromBirthday: false };
    go('compose');
  }

  /* ---------- FILTER SHEET ---------- */
  function viewSheet() {
    var d = S.sheet;
    var groups = uniqueSorted([].concat.apply([], db.contacts.map(function (c) { return c.groups; })));
    var areas = uniqueSorted(db.contacts.map(function (c) { return c.area; }));
    var langs = uniqueSorted(db.contacts.map(function (c) { return c.language; }));
    var btn = h('button', { type: 'button', class: 'btn' });

    function count() { return applyFilters(Object.assign({}, d, { q: S.filters.q })).length; }
    function paintBtn() { btn.textContent = 'Show ' + count() + ' contacts'; }

    function chipSection(title, items, map) {
      if (!items.length) return null;
      var wrap = h('div', { class: 'chips' });
      items.forEach(function (it) {
        var b = h('button', { type: 'button', class: 'chip' + (map[it] ? ' on' : ''), 'aria-pressed': map[it] ? 'true' : 'false' });
        function paint() { b.className = 'chip' + (map[it] ? ' on' : ''); b.setAttribute('aria-pressed', map[it] ? 'true' : 'false'); b.textContent = ''; if (map[it]) b.appendChild(icon('check', 16, 2.6)); b.appendChild(document.createTextNode(it)); }
        b.addEventListener('click', function () { if (map[it]) delete map[it]; else map[it] = true; paint(); paintBtn(); });
        paint(); wrap.appendChild(b);
      });
      return h('div', { class: 'col gap10' }, h('div', { class: 'label' }, title), wrap);
    }

    function radio(val, text) {
      var r = h('input', { type: 'radio', name: 'last', checked: d.last === val });
      r.addEventListener('change', function () { d.last = val; paintBtn(); });
      return h('label', { class: 'optrow' }, r, text);
    }
    function sw(text, key) {
      var cb = h('input', { type: 'checkbox', checked: !!d[key] });
      cb.addEventListener('change', function () { d[key] = cb.checked; paintBtn(); });
      return h('label', { class: 'switchrow' }, text, cb);
    }

    btn.addEventListener('click', function () {
      S.applySheet && S.applySheet(d);
      S.filters = d;
      S.sheet = null;
      S.selected = {};
      applyFilters(S.filters).forEach(function (c) { if (c.valid) S.selected[c.id] = true; });
      render();
    });

    function close() { S.sheet = null; render(); }
    var hasAny = groups.length || areas.length || langs.length;
    var body = h('div', { class: 'scroll col', style: 'padding:4px 20px 12px; gap:22px' },
      chipSection('Group', groups, d.groups),
      chipSection('Area', areas, d.areas),
      chipSection('Language', langs, d.langs),
      hasAny ? null : h('div', { class: 'note amber' }, icon('info'), h('div', null, 'Your file has no Group, Area or Language columns, so there is nothing to filter on yet. Add them in Excel and import again.')),
      groups.length ? h('div', { class: 'small muted', style: 'margin-top:-12px' }, 'People in any selected group are included. Different sections must all match.') : null,
      h('div', { class: 'col gap6' }, h('div', { class: 'label' }, 'Last messaged'),
        h('div', { class: 'col' }, radio('any', 'Anytime'), radio('30', 'Not in the last 30 days'), radio('never', 'Never messaged'))),
      h('div', { class: 'col' }, sw('Birthday this month', 'bdayMonth'), sw('Hide invalid numbers', 'hideInvalid')));

    paintBtn();
    return h('div', { class: 'sheet-wrap', role: 'dialog', 'aria-label': 'Filters' },
      h('div', { class: 'sheet' },
        h('div', { class: 'head' },
          h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close filters', onclick: close }, icon('x', 20, 2.2)),
          h('h1', null, 'Filters'),
          h('button', { type: 'button', class: 'btn text', style: 'font-size:15px; font-weight:700', onclick: function () { var q = d.q; S.sheet = Object.assign(newFilters(), { q: q }); render(); } }, 'Clear all')),
        body,
        h('div', { class: 'footer', style: 'padding-top:12px' }, btn)));
  }

  /* ---------- COMPOSE ---------- */
  function viewCompose() {
    var cp = S.compose;
    var ids = cp.ids;
    var first = findContact(ids[0]) || { name: 'Name', groups: [], area: '' };
    var ta = h('textarea', { class: 'msg', id: 'msg', value: cp.text, spellcheck: 'false' });
    var bubble = h('div', { class: 'bubble' });
    var previewLabel = h('div', { class: 'label' }, 'Preview for ' + (first.name || fmtPhone(first.phone)));
    var chips = h('div', { class: 'chiprow', style: 'padding:0' });
    var startBtn = h('button', { type: 'button', class: 'btn', onclick: startCampaign });
    var delBtn = h('button', { type: 'button', class: 'btn text', style: 'color:var(--red-ink)', onclick: deleteTpl }, 'Delete template');

    function paintPreview() {
      bubble.textContent = fillTemplate(cp.text, first) || 'Your message appears here';
      var ok = cp.text.trim().length > 0;
      startBtn.textContent = '';
      startBtn.appendChild(document.createTextNode('Start sending to ' + ids.length));
      startBtn.appendChild(icon('arrow', 20, 2.2));
      if (ok) startBtn.removeAttribute('disabled'); else startBtn.setAttribute('disabled', '');
      delBtn.style.display = cp.tpl ? '' : 'none';
    }
    function paintChips() {
      chips.textContent = '';
      db.templates.forEach(function (t) {
        chips.appendChild(h('button', {
          type: 'button', class: 'chip' + (cp.tpl === t.name ? ' soft' : ''),
          onclick: function () { cp.tpl = t.name; cp.text = t.text; ta.value = t.text; paintChips(); paintPreview(); }
        }, t.name));
      });
    }
    function insert(tok) {
      var s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, e = ta.selectionEnd == null ? s : ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + tok + ta.value.slice(e);
      ta.focus(); ta.selectionStart = ta.selectionEnd = s + tok.length;
      cp.text = ta.value; cp.tpl = tplMatch(cp.text); paintChips(); paintPreview();
    }
    function tplMatch(text) {
      var m = db.templates.filter(function (t) { return t.text === text; })[0];
      return m ? m.name : '';
    }
    function saveTpl() {
      if (!cp.text.trim()) return;
      var name = window.prompt('Template name', cp.tpl || '');
      if (!name) return;
      name = name.trim();
      var ex = db.templates.filter(function (t) { return t.name.toLowerCase() === name.toLowerCase(); })[0];
      if (ex) ex.text = cp.text; else db.templates.push({ name: name, text: cp.text });
      cp.tpl = ex ? ex.name : name; save(); paintChips(); paintPreview(); toast('Template saved');
    }
    function deleteTpl() {
      if (!cp.tpl || !window.confirm('Delete template "' + cp.tpl + '"?')) return;
      db.templates = db.templates.filter(function (t) { return t.name !== cp.tpl; });
      if (!db.templates.length) db.templates = DEFAULT_TEMPLATES.slice();
      cp.tpl = ''; save(); paintChips(); paintPreview();
    }
    ta.addEventListener('input', function () { cp.text = ta.value; cp.tpl = tplMatch(cp.text); paintChips(); paintPreview(); });

    paintChips(); paintPreview();

    return h('div', { class: 'view' },
      h('div', { class: 'topbar' },
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Back', onclick: function () { go(cp.fromBirthday ? 'home' : 'contacts'); } }, icon('back', 20, 2.2)),
        h('h1', null, cp.fromBirthday ? 'Birthday wish' : 'New message'),
        h('div', { class: 'badge' }, ids.length + (ids.length === 1 ? ' person' : ' people'))),
      h('div', { class: 'scroll pad col gap18', style: 'padding-top:4px; padding-bottom:18px' },
        h('div', { class: 'col gap10' },
          h('div', { style: 'display:flex; justify-content:space-between; align-items:center' }, h('div', { class: 'label' }, 'Saved templates'),
            h('button', { type: 'button', class: 'btn text', style: 'height:32px', onclick: saveTpl }, 'Save as template')),
          chips),
        h('div', { class: 'col gap10' },
          h('label', { class: 'label', for: 'msg' }, 'Message'), ta,
          h('div', { style: 'display:flex; gap:8px; align-items:center; flex-wrap:wrap' },
            h('span', { class: 'small muted' }, 'Insert'),
            ['{name}', '{group}', '{area}'].map(function (tk) { return h('button', { type: 'button', class: 'token', onclick: function () { insert(tk); } }, tk); }),
            delBtn)),
        h('div', { class: 'col gap10' }, previewLabel, h('div', { class: 'bubble-wrap' }, bubble)),
        h('div', { class: 'note amber' }, icon('info'), h('div', null, 'Messages open in WhatsApp one by one. You tap Send for each person, so your number stays safe.'))),
      h('div', { class: 'footer' }, startBtn));
  }

  function startCampaign() {
    var cp = S.compose;
    if (campaignPending() > 0 && !window.confirm('You have an unfinished sending list. Replace it with this new one?')) return;
    var items = [];
    cp.ids.forEach(function (id) {
      var c = findContact(id);
      if (c && c.valid) items.push({ id: c.id, phone: c.phone, name: c.name, msg: fillTemplate(cp.text, c), status: 'pending' });
    });
    if (!items.length) { toast('No valid numbers to send to'); return; }
    db.campaign = { id: Date.now(), items: items, started: Date.now() };
    save(); S.opened = null; go('sending');
  }

  /* ---------- SENDING ---------- */
  function setStatus(item, status) {
    item.status = status;
    if (status === 'sent') { var c = findContact(item.id); if (c) c.lastSent = Date.now(); }
    save();
  }
  function currentItem() {
    return db.campaign ? db.campaign.items.filter(function (i) { return i.status === 'pending'; })[0] : null;
  }

  function viewSending() {
    var cam = db.campaign;
    if (!cam) { S.view = 'home'; return viewHome(); }
    var items = cam.items, total = items.length;
    var sent = items.filter(function (i) { return i.status === 'sent'; }).length;
    var skipped = items.filter(function (i) { return i.status === 'skipped'; }).length;
    var pending = total - sent - skipped;
    var cur = currentItem();
    var pct = total ? Math.round(((sent + skipped) / total) * 100) : 0;

    var head = h('div', null,
      h('div', { class: 'topbar' },
        h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Back to home', onclick: function () { go('home'); } }, icon('back', 20, 2.2)),
        h('h1', null, cur ? 'Sending' : 'All done'),
        h('div', { style: 'font-size:14px; font-weight:700' }, (sent + skipped) + ' of ' + total)),
      h('div', { class: 'pad', style: 'padding-bottom:16px' },
        h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(sent + skipped), 'aria-label': 'Messages done' }, h('div', { style: 'width:' + pct + '%' })),
        h('div', { class: 'stats', style: 'margin-top:12px' }, stat(sent, 'Sent', 'var(--green)'), stat(pending, 'Pending', 'var(--amber-ink)'), stat(skipped, 'Skipped', 'var(--muted)'))));

    var card;
    if (cur) {
      var link = 'https://wa.me/' + cur.phone + '?text=' + encodeURIComponent(cur.msg);
      var openA = h('a', {
        class: 'btn big', href: link, target: '_blank', rel: 'noopener',
        onclick: function () { S.opened = { id: cur.id, hidden: false }; }
      }, icon('chat', 22), 'Open WhatsApp and send');
      card = h('div', { class: 'nextcard' },
        h('div', { class: 'label' }, 'Next up'),
        h('div', { style: 'display:flex; align-items:center; gap:12px' },
          h('div', { class: 'avatar bigavatar ' + avClass(cur.name) }, initials(cur.name)),
          h('div', { class: 'col', style: 'gap:2px; min-width:0' },
            h('div', { style: 'font-size:18px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap' }, cur.name || fmtPhone(cur.phone)),
            h('div', { class: 'small muted' }, fmtPhone(cur.phone)))),
        h('div', { class: 'msgbox' }, cur.msg),
        openA,
        h('div', { class: 'two' },
          h('button', { type: 'button', class: 'btn ghost', onclick: function () { setStatus(cur, 'skipped'); S.opened = null; render(); } }, 'Skip'),
          h('button', { type: 'button', class: 'btn ghost', onclick: function () { setStatus(cur, 'sent'); S.opened = null; render(); } }, 'Mark as sent')));
    } else {
      card = h('div', { class: 'nextcard' },
        h('div', { style: 'font-size:18px; font-weight:700' }, 'Finished'),
        h('div', { class: 'small muted' }, sent + ' sent' + (skipped ? ', ' + skipped + ' skipped' : '') + '. Nice work.'),
        h('button', { type: 'button', class: 'btn', onclick: function () { db.campaign = null; save(); go('home'); } }, 'Done'));
    }

    var queue = h('div', { class: 'scroll col gap8', style: 'padding:0 20px 12px' });
    items.forEach(function (it) {
      var isCur = cur && it.id === cur.id;
      var pill = it.status === 'sent' ? h('span', { class: 'pill sent' }, icon('check', 14, 2.8), 'Sent')
        : it.status === 'skipped' ? h('span', { class: 'pill skipped' }, 'Skipped')
        : h('span', { class: 'pill pending' }, isCur ? 'Next' : 'Pending');
      queue.appendChild(h('button', {
        type: 'button', class: 'qrow' + (isCur ? ' current' : ''),
        'aria-label': it.status === 'pending' ? (it.name || it.phone) : 'Undo ' + (it.name || it.phone),
        onclick: function () { if (it.status !== 'pending') { it.status = 'pending'; save(); render(); } }
      }, h('div', { class: 'nm' }, it.name || fmtPhone(it.phone)), pill));
    });

    var auto = h('input', { type: 'checkbox', checked: db.autoMark, id: 'auto' });
    auto.addEventListener('change', function () { db.autoMark = auto.checked; save(); });

    return h('div', { class: 'view' }, head, card,
      h('div', { class: 'label', style: 'padding:16px 20px 8px' }, 'Queue ', h('span', { style: 'text-transform:none; letter-spacing:0; font-weight:500' }, '(tap a done row to undo)')),
      queue,
      h('div', { class: 'footer', style: 'padding-top:10px' },
        h('label', { for: 'auto', style: 'display:flex; align-items:center; gap:10px; font-size:13px; line-height:18px; color:var(--muted)' }, auto, 'Mark as sent when I come back from WhatsApp'),
        h('div', { style: 'display:flex; align-items:center; justify-content:space-between; gap:12px' },
          h('div', { class: 'small muted' }, 'Progress is saved. Close anytime and continue later.'),
          h('button', { type: 'button', class: 'btn ghost small', onclick: function () { go('home'); } }, 'Pause'))));
  }

  /* coming back from WhatsApp: mark the person as sent */
  document.addEventListener('visibilitychange', function () {
    if (!S.opened) return;
    if (document.visibilityState === 'hidden') { S.opened.hidden = true; return; }
    if (!S.opened.hidden || S.view !== 'sending' || !db.autoMark) return;
    var cur = currentItem();
    var openedId = S.opened.id;
    S.opened = null;
    if (cur && cur.id === openedId) {
      setStatus(cur, 'sent');
      toast('Marked ' + (cur.name || fmtPhone(cur.phone)) + ' as sent');
      render();
    }
  });

  /* ---------- boot ---------- */
  render();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
