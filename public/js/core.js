/* ENJC Messenger v2: core helpers, router and shell. Plain JS, no build step. */
(function () {
  var App = window.App = { screens: {}, session: null, unread: 0, timers: [] };

  /* ---------- tiny DOM helper (text is always set as text, so names from Excel can never inject HTML) ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  App.h = h;

  var ICONS = {
    home: '<path d="M3 11l9-8 9 8v10H15v-6H9v6H3z"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M18 15c2.5.5 4 2.5 4 6"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    set: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>'
  };
  App.icon = function (name, size) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    s.innerHTML = ICONS[name] || '';
    return s;
  };

  /* ---------- API ---------- */
  App.api = function (method, path, body) {
    return fetch('/api' + path, {
      method: method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && path !== '/login' && path !== '/session') {
          App.session = null; location.hash = '#/login';
        }
        if (!r.ok) { var e = new Error(data.error || ('Error ' + r.status)); e.status = r.status; throw e; }
        return data;
      });
    });
  };

  var toastTimer;
  App.toast = function (msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  };
  App.fail = function (e) { App.toast(e && e.message ? e.message : 'Something went wrong'); };

  App.sheet = function (build) {
    var close = function () { ov.remove(); };
    var content = h('div', { class: 'sheet', onclick: function (e) { e.stopPropagation(); } });
    var ov = h('div', { class: 'overlay', onclick: close }, content);
    build(content, close);
    document.body.appendChild(ov);
    return close;
  };
  App.confirm = function (text, yes, onYes) {
    App.sheet(function (el, close) {
      el.appendChild(h('h2', null, text));
      el.appendChild(h('div', { class: 'row' },
        h('button', { class: 'btn line grow', onclick: close }, 'Cancel'),
        h('button', { class: 'btn grow', onclick: function () { close(); onYes(); } }, yes)));
    });
  };

  /* ---------- formatting ---------- */
  App.fmtPhone = function (p) {
    p = String(p || '');
    return p.length === 12 && p.indexOf('91') === 0 ? '+91 ' + p.slice(2, 7) + ' ' + p.slice(7) : '+' + p;
  };
  App.ago = function (ts) {
    if (!ts) return '';
    var d = new Date(ts * 1000), n = new Date(), diff = (n - d) / 1000;
    if (diff < 60) return 'now';
    if (diff < 86400 && d.getDate() === n.getDate()) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    if (diff < 172800) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };
  App.initial = function (name) { return (String(name || '?').trim()[0] || '?').toUpperCase(); };
  App.tone = function (s) { var n = 0; String(s || '').split('').forEach(function (c) { n += c.charCodeAt(0); }); return 'a' + (n % 4); };
  App.rupees = function (r) { return r[0] === r[1] ? '₹' + r[0].toLocaleString('en-IN') : '₹' + r[0].toLocaleString('en-IN') + ' to ₹' + r[1].toLocaleString('en-IN'); };
  App.avatar = function (name) { return h('div', { class: 'avatar ' + App.tone(name) }, App.initial(name)); };

  App.switchBtn = function (on, onChange, label) {
    var b = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label || 'Toggle' }, h('i'));
    b.addEventListener('click', function (e) { e.stopPropagation(); on = !on; b.className = 'switch' + (on ? ' on' : ''); b.setAttribute('aria-checked', on ? 'true' : 'false'); onChange(on); });
    return b;
  };

  App.header = function (title, backTo, right) {
    return h('div', { class: 'row' },
      backTo ? h('a', { class: 'back', href: backTo, 'aria-label': 'Back' }, App.icon('back')) : null,
      h('div', { class: 'title grow' }, title), right || null);
  };

  App.every = function (ms, fn) { App.timers.push(setInterval(fn, ms)); };

  /* ---------- router + shell ---------- */
  var TABS = [
    ['home', 'Home', 'home', 'sender'], ['contacts', 'Contacts', 'users', 'sender'], ['inbox', 'Inbox', 'chat', 'inbox'],
    ['schedule', 'Schedule', 'cal', 'sender'], ['settings', 'Settings', 'set', 'sender']
  ];
  var RANK = { admin: 3, sender: 2, inbox: 1 };
  App.can = function (role) { return App.session && App.session.user && RANK[App.session.user.role] >= RANK[role]; };

  function renderNav(active) {
    var nav = document.getElementById('nav');
    nav.innerHTML = '';
    TABS.forEach(function (t) {
      if (!App.can(t[3])) return;
      var a = h('a', { href: '#/' + t[0], class: active === t[0] ? 'on' : '' }, App.icon(t[2]), t[1]);
      if (t[0] === 'inbox' && App.unread > 0) a.appendChild(h('span', { class: 'badge' }, App.unread > 99 ? '99+' : App.unread));
      nav.appendChild(a);
    });
  }

  function parse() {
    var parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    return { name: parts[0] || 'home', args: parts.slice(1).map(decodeURIComponent) };
  }

  var rendering = 0;
  function route(soft) {
    soft = soft === true;
    var r = parse(), page = document.getElementById('page'), nav = document.getElementById('nav');
    App.timers.forEach(clearInterval); App.timers = [];
    var token = ++rendering;
    App.loadSession().then(function () {
      var s = App.session;
      if (token !== rendering) return;
      if (s.needsSetup) r = { name: 'setup', args: [] };
      else if (!s.user) r = { name: 'login', args: [] };
      else if (r.name === 'login' || r.name === 'setup') { location.hash = App.can('sender') ? '#/home' : '#/inbox'; return; }
      else if (!App.can('sender') && ['inbox'].indexOf(r.name) < 0) { location.hash = '#/inbox'; return; }
      var screen = App.screens[r.name] || App.screens.home;
      var tab = TABS.some(function (t) { return t[0] === r.name; });
      nav.hidden = !(s.user && tab);
      page.className = nav.hidden ? 'nonav' : '';
      if (s.user && tab) renderNav(r.name);
      if (!soft) {
        page.innerHTML = '';
        page.scrollTop = 0;
        page.appendChild(h('div', { class: 'empty' }, 'Loading...'));
      }
      return Promise.resolve(screen(r.args)).then(function (node) {
        if (token !== rendering) return;
        var keep = soft ? page.scrollTop : 0;
        page.innerHTML = '';
        add(page, node);
        if (soft) page.scrollTop = keep;
        if (App.afterRender) { var fn = App.afterRender; App.afterRender = null; fn(); }
      });
    }).catch(function (e) { if (token === rendering) { page.innerHTML = ''; page.appendChild(h('div', { class: 'note bad' }, e.message || 'Could not load')); } });
  }
  App.refresh = function () { route(false); };
  App.soft = function () { route(true); };

  App.loadSession = function (force) {
    if (App.session && !force) return Promise.resolve(App.session);
    return App.api('GET', '/session').then(function (s) { App.session = s; return s; });
  };

  App.start = function () {
    window.addEventListener('hashchange', function () { route(false); });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
    route(false);
  };

  /* ---------- login + first-time setup ---------- */
  function authScreen(setup) {
    var name = h('input', { type: 'text', id: 'f-name', autocomplete: 'name' });
    var login = h('input', { type: 'text', id: 'f-login', autocomplete: 'username', autocapitalize: 'none' });
    var pass = h('input', { type: 'password', id: 'f-pass', autocomplete: setup ? 'new-password' : 'current-password' });
    var err = h('div', { class: 'note bad', hidden: true });
    function go() {
      err.hidden = true;
      var body = { login: login.value, password: pass.value };
      if (setup) body.name = name.value;
      App.api('POST', setup ? '/setup' : '/login', body).then(function () {
        App.session = null; location.hash = '#/home'; route(false);
      }).catch(function (e) { err.textContent = e.message; err.hidden = false; });
    }
    [login, pass, name].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); }); });
    return h('div', { class: 'login' },
      h('img', { class: 'logo', src: 'icons/icon-192.png', alt: '' }),
      h('div', { class: 'title' }, setup ? 'Welcome, let us set up' : 'ENJC Messenger'),
      h('p', { class: 'muted' }, setup ? 'Create the first admin login. Choose a strong password (8 or more characters).' : 'Log in to send messages and read replies.'),
      setup ? h('label', { class: 'f', for: 'f-name' }, 'Your name', name) : null,
      h('label', { class: 'f', for: 'f-login' }, 'Login', login),
      h('label', { class: 'f', for: 'f-pass' }, 'Password', pass),
      err,
      h('button', { class: 'btn', onclick: go }, setup ? 'Create admin and start' : 'Log in'));
  }
  App.screens.login = function () { return authScreen(false); };
  App.screens.setup = function () { return authScreen(true); };
})();
