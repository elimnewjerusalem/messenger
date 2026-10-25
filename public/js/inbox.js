(function () {
  var App = window.App, h = App.h;
  var filter = 'all';

  App.screens.inbox = function (args) {
    if (args[0]) return thread(args[0]);
    return App.api('GET', '/inbox?filter=' + filter).then(function (d) {
      App.unread = d.unread;
      var nav = document.querySelector('#nav a[href="#/inbox"]');
      if (nav) { var b = nav.querySelector('.badge'); if (b) b.remove(); if (d.unread) nav.appendChild(h('span', { class: 'badge' }, d.unread > 99 ? '99+' : d.unread)); }
      App.every(20000, function () { App.soft(); });
      var out = [h('div', { class: 'row between' }, h('div', { class: 'title' }, 'Inbox'), d.unread ? h('span', { class: 'pill green', style: 'padding:6px 10px' }, d.unread + ' unread') : null)];
      out.push(h('div', { class: 'chips' }, [['all', 'All'], ['unread', 'Unread'], ['prayer', 'Prayer requests'], ['stop', 'STOP']].map(function (f) {
        return h('button', { class: 'chip' + (filter === f[0] ? ' on' : ''), onclick: function () { filter = f[0]; App.refresh(); } }, f[1]);
      })));
      out.push(h('div', { class: 'note warn' }, 'Replies are free for 24 hours after the member writes. After that, only an approved template can start the chat.'));
      if (!d.threads.length) out.push(h('div', { class: 'card empty' }, 'No replies yet. When members answer your messages they appear here.'));
      else out.push(h('div', { class: 'card flush' }, d.threads.map(function (t) {
        return h('a', { class: 'item' + (t.unread ? ' unread' : ''), href: '#/inbox/' + t.phone, style: 'align-items:flex-start' },
          App.avatar(t.name),
          h('div', { class: 'grow' },
            h('div', { class: 'row between' }, h('span', { style: 'font-weight:' + (t.unread ? 700 : 600) }, t.name), h('span', { class: 'sub' }, App.ago(t.last_ts))),
            h('div', { style: 'font-size:13px;line-height:1.45;' + (t.unread ? '' : 'color:var(--muted)'), class: 'clamp' }, (t.last_dir === 'out' ? 'You: ' : '') + t.last_body),
            h('div', { class: 'row', style: 'margin-top:6px;gap:6px;flex-wrap:wrap' },
              t.tag ? h('span', { class: 'pill ' + (t.tag === 'Stopped' ? 'red' : 'amber') }, t.tag) : null,
              t.last_auto ? h('span', { class: 'pill green' }, 'Auto-replied') : null,
              t.unread && t.hours_left ? h('span', { class: 'sub' }, t.hours_left + 'h left to reply free') : null)),
          t.unread ? h('span', { style: 'width:10px;height:10px;border-radius:50%;background:var(--green);margin-top:6px;flex:none' }) : null);
      })));
      return out;
    });
  };

  function thread(phone) {
    return App.api('GET', '/inbox/' + phone).then(function (d) {
      App.every(15000, function () { App.soft(); });
      var name = d.contact && d.contact.name ? d.contact.name : App.fmtPhone(phone);
      var out = [App.header(name, '#/inbox')];
      out.push(h('div', { class: 'sub', style: 'margin-top:-6px' }, App.fmtPhone(phone)));
      if (!d.messages.length) out.push(h('div', { class: 'empty' }, 'No messages.'));
      out.push(h('div', { class: 'thread' }, d.messages.map(function (m) {
        return h('div', { class: 'msg ' + m.direction }, m.body,
          h('small', null, (m.auto ? 'Auto-reply · ' : '') + new Date(m.ts * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + (m.tag ? ' · ' + m.tag : '')));
      })));
      var box = h('textarea', { placeholder: d.windowOpen ? 'Reply to ' + name : 'The 24 hour window is closed', disabled: !d.windowOpen, style: 'min-height:48px;height:48px;resize:none', 'aria-label': 'Reply' });
      var send = h('button', { class: 'btn', disabled: !d.windowOpen, onclick: function () {
        var text = box.value.trim(); if (!text) return;
        send.disabled = true;
        App.api('POST', '/inbox/' + phone + '/reply', { text: text }).then(function () { App.afterRender = function () { var p = document.getElementById('page'); p.scrollTop = p.scrollHeight; }; App.soft(); }).catch(function (e) { send.disabled = false; App.fail(e); });
      } }, 'Send');
      out.push(h('div', { class: 'row', style: 'position:sticky;bottom:0;background:var(--bg);padding:6px 0 4px;align-items:flex-end' }, box, send));
      if (d.windowOpen) out.push(h('div', { class: 'sub', style: 'text-align:center' }, d.hoursLeft + ' hours left to reply for free'));
      App.afterRender = function () { var p = document.getElementById('page'); p.scrollTop = p.scrollHeight; };
      return out;
    });
  }

  /* ---------- auto replies ---------- */
  function ruleSheet(r, done) {
    var isNew = !r;
    r = r || { keywords: '', reply: '', tag: '', notify: 0, match: 'exact', locked: 0 };
    App.sheet(function (el, close) {
      var kw = h('input', { type: 'text', value: r.keywords, placeholder: 'SERVICE, TIMING' });
      var reply = h('textarea', null); reply.value = r.reply;
      var tag = h('input', { type: 'text', value: r.tag, placeholder: 'Prayer request (optional label)' });
      var notify = h('input', { type: 'checkbox', checked: !!r.notify });
      var contains = h('input', { type: 'checkbox', checked: r.match === 'contains' });
      el.appendChild(h('h2', null, isNew ? 'New auto-reply' : 'Edit auto-reply'));
      el.appendChild(h('label', { class: 'f' }, 'When the member writes (separate words with commas)', kw));
      el.appendChild(h('label', { class: 'f' }, 'We reply', reply));
      el.appendChild(h('label', { class: 'f' }, 'Label the chat', tag));
      el.appendChild(h('label', { class: 'chk' }, notify, 'Keep it as unread so I notice it'));
      if (!r.action) el.appendChild(h('label', { class: 'chk' }, contains, 'Also match inside longer messages'));
      el.appendChild(h('div', { class: 'row' },
        !isNew && !r.locked ? h('button', { class: 'btn danger', onclick: function () { App.api('DELETE', '/rules/' + r.id).then(function () { close(); done(); }).catch(App.fail); } }, 'Delete') : null,
        h('button', { class: 'btn grow', onclick: function () {
          var body = { keywords: kw.value, reply: reply.value, tag: tag.value, notify: notify.checked, match: contains.checked ? 'contains' : 'exact' };
          (isNew ? App.api('POST', '/rules', body) : App.api('PATCH', '/rules/' + r.id, body)).then(function () { close(); done(); }).catch(App.fail);
        } }, 'Save')));
    });
  }

  App.screens.replies = function () {
    return App.api('GET', '/rules').then(function (d) {
      var out = [App.header('Auto-replies', '#/settings', h('button', { class: 'btn small', onclick: function () { ruleSheet(null, App.refresh); } }, '+ Add'))];
      out.push(h('p', { class: 'muted', style: 'font-size:13px;line-height:1.5' }, 'When a member sends one of these words, the app answers by itself. Anything else goes to your Inbox.'));
      d.rules.forEach(function (r) {
        out.push(h('div', { class: 'card', style: 'cursor:pointer', onclick: function () { ruleSheet(r, App.refresh); } },
          h('div', { class: 'row between' },
            h('span', { style: 'font-weight:700;font-size:13px;background:var(--chip);padding:4px 10px;border-radius:8px;letter-spacing:.04em' }, r.keywords.split(',')[0].trim().toUpperCase()),
            r.locked ? h('span', { class: 'pill' }, 'Always on') : App.switchBtn(!!r.enabled, function (on) { App.api('PATCH', '/rules/' + r.id, { enabled: on }).catch(App.fail); }, 'Enable')),
          h('div', { style: 'font-size:13px;line-height:1.6' }, r.reply),
          h('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' },
            r.keywords.indexOf(',') > 0 ? h('span', { class: 'sub' }, 'Also: ' + r.keywords.split(',').slice(1).map(function (x) { return x.trim(); }).join(', ')) : null,
            r.tag ? h('span', { class: 'pill amber' }, 'Label: ' + r.tag) : null,
            r.notify ? h('span', { class: 'pill blue' }, 'Notify me') : null,
            r.action === 'stop' ? h('span', { class: 'pill red' }, 'Stops all messages') : null)));
      });
      out.push(h('div', { class: 'note' }, 'Auto-replies are free when the member writes first (24 hour window).'));
      return out;
    });
  };
})();
