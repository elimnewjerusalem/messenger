(function () {
  var App = window.App, h = App.h;
  var ROLE_TEXT = { admin: 'Admin · full access', sender: 'Can send and reply', inbox: 'Inbox only, contacts hidden' };

  function row(label, right, href) {
    return h(href ? 'a' : 'div', { class: 'item', href: href || null, style: 'justify-content:space-between' }, h('span', { style: 'font-weight:500' }, label), h('span', { class: 'sub' }, right));
  }

  function copy(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { App.toast('Copied'); }, function () { App.toast(text); });
    else App.toast(text);
  }

  function userSheet() {
    App.sheet(function (el, close) {
      var f = { name: h('input', { type: 'text' }), login: h('input', { type: 'text', autocapitalize: 'none' }), pass: h('input', { type: 'password', autocomplete: 'new-password' }),
        role: h('select', null, [['sender', 'Can send and reply'], ['inbox', 'Inbox only (office team)'], ['admin', 'Admin']].map(function (r) { return h('option', { value: r[0] }, r[1]); })) };
      el.appendChild(h('h2', null, 'Add team member'));
      el.appendChild(h('label', { class: 'f' }, 'Name', f.name));
      el.appendChild(h('label', { class: 'f' }, 'Login', f.login));
      el.appendChild(h('label', { class: 'f' }, 'Password (8 or more characters)', f.pass));
      el.appendChild(h('label', { class: 'f' }, 'Access', f.role));
      el.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn line grow', onclick: close }, 'Cancel'),
        h('button', { class: 'btn grow', onclick: function () {
          App.api('POST', '/users', { name: f.name.value, login: f.login.value, password: f.pass.value, role: f.role.value }).then(function () { close(); App.toast('Added'); App.refresh(); }).catch(App.fail);
        } }, 'Add')));
    });
  }

  App.screens.settings = function () {
    return Promise.all([
      App.api('GET', '/settings'),
      App.can('admin') ? App.api('GET', '/users') : Promise.resolve({ users: [] }),
      App.api('GET', '/meta/status').catch(function (e) { return { ok: false, error: e.message }; }),
      App.api('GET', '/rules'), App.api('GET', '/templates')
    ]).then(function (r) {
      var s = r[0].settings, demo = r[0].demo, info = r[2], me = App.session.user;
      var out = [h('div', { class: 'title' }, 'Settings')];

      var apiCard = [h('div', { class: 'row between' }, h('b', null, 'WhatsApp Business API'),
        h('span', { class: 'pill ' + (demo ? 'amber' : info.ok ? 'green' : 'red') }, demo ? 'Demo mode' : info.ok ? 'Connected' : 'Problem'))];
      if (demo) {
        apiCard.push(h('div', { class: 'note warn' }, 'Nothing is really sent yet. The app is fully usable for practice. To go live, follow the steps in the README (Meta account, then add 3 secrets) and this turns to Connected.'));
      } else if (info.ok && info.info) {
        apiCard.push(h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px' },
          h('div', { style: 'background:var(--bg);border-radius:12px;padding:10px' }, h('div', { class: 'sub' }, 'Number'), h('b', null, info.info.display_phone_number || '-')),
          h('div', { style: 'background:var(--bg);border-radius:12px;padding:10px' }, h('div', { class: 'sub' }, 'Quality'), h('b', { style: 'color:var(--green-d)' }, (info.info.quality_rating || '-').replace('GREEN', 'High').replace('YELLOW', 'Medium').replace('RED', 'Low')))));
        apiCard.push(h('div', { class: 'sub' }, 'Name shown: ' + (info.info.verified_name || '-') + ' · Limit: ' + String(info.info.messaging_limit_tier || '-').replace('TIER_', 'Tier ')));
      } else if (!info.ok) apiCard.push(h('div', { class: 'note bad' }, 'Meta said: ' + (info.error || 'could not connect')));
      apiCard.push(h('div', { class: 'sub' }, 'The access token is kept on the server only. It never appears in this app.'));
      apiCard.push(h('div', { class: 'row' }, h('div', { class: 'grow sub', style: 'word-break:break-all' }, 'Webhook URL: ' + r[0].webhook),
        h('button', { class: 'btn ghost small', onclick: function () { copy(r[0].webhook); } }, 'Copy')));
      out.push(h('div', { class: 'card' }, apiCard));

      out.push(h('div', { class: 'card flush' },
        row('Message templates', r[4].templates.length + ' ›', '#/templates'),
        row('Auto-replies', r[3].rules.filter(function (x) { return x.enabled; }).length + ' keywords ›', '#/replies')));

      if (App.can('admin')) {
        var web = h('input', { type: 'text', value: s.website, autocapitalize: 'none' });
        var yt = h('input', { type: 'text', value: s.youtube, placeholder: 'https://youtube.com/@yourchannel', autocapitalize: 'none' });
        var pm = h('input', { type: 'text', value: s.per_minute, inputmode: 'numeric' });
        out.push(h('div', { class: 'card' },
          h('b', null, 'Links and speed'),
          h('label', { class: 'f' }, 'Website link  ( {website} )', web),
          h('label', { class: 'f' }, 'YouTube channel link  ( {youtube} )', yt),
          h('label', { class: 'f' }, 'Messages per minute (20 = 200 every 10 minutes)', pm),
          h('button', { class: 'btn small', style: 'align-self:flex-start', onclick: function () {
            App.api('PUT', '/settings', { website: web.value, youtube: yt.value, per_minute: pm.value }).then(function () { App.toast('Saved'); }).catch(App.fail);
          } }, 'Save')));

        out.push(h('div', { class: 'sec' }, 'Team'));
        out.push(h('div', { class: 'card flush' }, r[1].users.map(function (u) {
          return h('div', { class: 'item' }, App.avatar(u.name), h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, u.name + (u.id === me.id ? ' (you)' : '')), h('div', { class: 'sub' }, ROLE_TEXT[u.role] + ' · ' + u.login)),
            u.id === me.id ? null : h('button', { class: 'btn ghost small', onclick: function () {
              App.confirm('Remove ' + u.name + '?', 'Remove', function () { App.api('DELETE', '/users/' + u.id).then(function () { App.refresh(); }).catch(App.fail); });
            } }, 'Remove'));
        })));
        out.push(h('button', { class: 'btn line', onclick: userSheet }, 'Add team member'));
      }

      out.push(h('div', { class: 'note' }, 'Contacts stay in your own database. No third-party messaging service sees them. Only Meta receives the number and text at the moment a message is sent.'));
      out.push(h('button', { class: 'btn danger', onclick: function () {
        App.api('POST', '/logout').then(function () { App.session = null; location.hash = '#/login'; location.reload(); });
      } }, 'Log out (' + me.name + ')'));
      return out;
    });
  };

  App.screens.templates = function () {
    return Promise.all([App.api('GET', '/templates'), App.api('GET', '/settings')]).then(function (r) {
      var links = r[1].settings, demo = r[1].demo; App.isDemo = demo;
      var out = [App.header('Message templates', '#/settings', h('button', { class: 'btn small', onclick: function () { App.editTemplate(null, links, App.refresh); } }, '+ New'))];
      out.push(h('p', { class: 'muted', style: 'font-size:13px;line-height:1.5' }, demo ? 'In demo mode every template counts as approved.' : 'WhatsApp only lets you start a chat with an approved template. Submit a template, then Meta approves it (minutes to a day).'));
      if (!r[0].templates.length) out.push(h('div', { class: 'card empty' }, 'No templates yet.'));
      r[0].templates.forEach(function (t) {
        out.push(h('div', { class: 'card' },
          h('div', { class: 'row between' }, h('b', null, t.title), App.statusPill(t)),
          App.previewBubble(t, links),
          h('div', { class: 'row' },
            h('button', { class: 'btn line small grow', onclick: function () { App.editTemplate(t, links, App.refresh); } }, 'Edit'),
            !demo && (t.status === 'DRAFT' || t.status === 'REJECTED') ? h('button', { class: 'btn small grow', onclick: function () {
              App.api('POST', '/templates/' + t.id + '/submit').then(function () { App.toast('Sent to Meta'); App.refresh(); }).catch(App.fail);
            } }, 'Submit to Meta') : null)));
      });
      if (!demo) out.push(h('button', { class: 'btn line', onclick: function () {
        App.api('POST', '/templates/sync').then(function (x) { App.toast(x.changed ? x.changed + ' updated' : 'No changes yet'); App.refresh(); }).catch(App.fail);
      } }, 'Check Meta for approvals'));
      return out;
    });
  };
})();
