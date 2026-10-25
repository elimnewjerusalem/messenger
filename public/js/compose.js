(function () {
  var App = window.App, h = App.h;
  var cm = { tplId: 0, filter: {} };
  var TOKENS = ['name', 'area', 'group', 'website', 'youtube'];

  // Friendly {name} <-> Meta's {{1}}
  function toMeta(text) {
    var params = [];
    var body = text.replace(/\{(name|area|group|website|youtube)\}/gi, function (m, k) { params.push(k.toLowerCase()); return '{{' + params.length + '}}'; });
    return { body: body, params: params };
  }
  function fromMeta(body, params) {
    return String(body).replace(/\{\{(\d+)\}\}/g, function (m, n) { return '{' + (params[+n - 1] || 'name') + '}'; });
  }
  function fill(text, links) {
    return text.replace(/\{(name|area|group|website|youtube)\}/gi, function (m, k) {
      k = k.toLowerCase();
      return { name: 'Abraham', area: 'Tondiarpet', group: 'Sunday', website: links.website || '', youtube: links.youtube || '' }[k];
    });
  }
  App.fillPreview = fill;

  var statusPill = function (t) {
    var map = { APPROVED: ['green', 'Approved'], PENDING: ['amber', 'Waiting for Meta'], REJECTED: ['red', 'Rejected'], DRAFT: ['', 'Draft'] };
    var m = map[t.status] || ['', t.status];
    return h('span', { class: 'pill ' + m[0] }, m[1]);
  };
  App.statusPill = statusPill;

  App.previewBubble = function (tpl, links) {
    var text = fill(fromMeta(tpl.body, tpl.params), links);
    return h('div', { class: 'bubble-wrap' },
      h('div', { class: 'bubble' }, text),
      (tpl.buttons || []).map(function (b) { return h('div', { class: 'bubble-btn' }, b.text); }));
  };

  /* ---------- template editor ---------- */
  App.editTemplate = function (tpl, links, done) {
    var isNew = !tpl;
    tpl = tpl || { title: '', language: 'ta', category: 'MARKETING', body: '', params: [], buttons: [] };
    var f = {
      title: h('input', { type: 'text', value: tpl.title, placeholder: 'Sunday service reminder' }),
      language: h('select', null, h('option', { value: 'ta', selected: tpl.language === 'ta' }, 'Tamil'), h('option', { value: 'en', selected: tpl.language === 'en' }, 'English')),
      category: h('select', null, h('option', { value: 'MARKETING', selected: tpl.category === 'MARKETING' }, 'Marketing (wishes, invites, announcements)'),
        h('option', { value: 'UTILITY', selected: tpl.category === 'UTILITY' }, 'Utility (confirmed event details, updates)')),
      body: h('textarea', { placeholder: 'வணக்கம் {name}, இன்று காலை 9 மணிக்கு ஆராதனை.' })
    };
    f.body.value = fromMeta(tpl.body, tpl.params);
    var buttons = JSON.parse(JSON.stringify(tpl.buttons || []));
    var btnBox = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    function drawButtons() {
      btnBox.innerHTML = '';
      buttons.forEach(function (b, i) {
        var text = h('input', { type: 'text', value: b.text, placeholder: b.type === 'URL' ? 'Visit website' : 'Prayer request', maxlength: 25, 'aria-label': 'Button text' });
        text.addEventListener('input', function () { b.text = text.value; });
        var row = [h('div', { class: 'row' }, h('span', { class: 'pill' }, b.type === 'URL' ? 'Link button' : 'Quick reply'), h('div', { class: 'grow' }),
          h('button', { class: 'btn ghost small', onclick: function () { buttons.splice(i, 1); drawButtons(); } }, 'Remove')), text];
        if (b.type === 'URL') {
          var url = h('input', { type: 'text', value: b.url || '', placeholder: 'https://', autocapitalize: 'none', 'aria-label': 'Button link' });
          url.addEventListener('input', function () { b.url = url.value; });
          row.push(url);
        }
        btnBox.appendChild(h('div', { class: 'card', style: 'padding:10px 12px' }, row));
      });
      if (buttons.length < 3) btnBox.appendChild(h('div', { class: 'row' },
        h('button', { class: 'btn line small grow', onclick: function () { buttons.push({ type: 'URL', text: 'Visit website', url: links.website || 'https://' }); drawButtons(); } }, '+ Link button'),
        h('button', { class: 'btn line small grow', onclick: function () { buttons.push({ type: 'QUICK_REPLY', text: 'Prayer request' }); drawButtons(); } }, '+ Quick reply')));
    }
    drawButtons();
    App.sheet(function (el, close) {
      el.appendChild(h('h2', null, isNew ? 'New message template' : 'Edit template'));
      el.appendChild(h('label', { class: 'f' }, 'Name (only you see this)', f.title));
      el.appendChild(h('label', { class: 'f' }, 'Language', f.language));
      el.appendChild(h('label', { class: 'f' }, 'Type', f.category));
      el.appendChild(h('label', { class: 'f' }, 'Message', f.body));
      el.appendChild(h('div', { class: 'chips' }, TOKENS.map(function (k) {
        return h('button', { class: 'chip', onclick: function () {
          var s = f.body.selectionStart || f.body.value.length;
          f.body.value = f.body.value.slice(0, s) + '{' + k + '}' + f.body.value.slice(s);
          f.body.focus();
        } }, '+ {' + k + '}');
      })));
      el.appendChild(h('div', { class: 'sub' }, 'Meta does not allow a message to start or end with {name}. Add a word before or after it.'));
      el.appendChild(h('div', { class: 'sec' }, 'Buttons (up to 3)'));
      el.appendChild(btnBox);
      el.appendChild(h('div', { class: 'note warn' }, 'After Meta approves a template its text and buttons cannot change. Editing creates a new one for approval.'));
      el.appendChild(h('div', { class: 'row' },
        !isNew ? h('button', { class: 'btn danger', onclick: function () {
          App.confirm('Delete this template?', 'Delete', function () { App.api('DELETE', '/templates/' + tpl.id).then(function () { close(); done(); }).catch(App.fail); });
        } }, 'Delete') : null,
        h('button', { class: 'btn grow', onclick: function () {
          var m = toMeta(f.body.value.trim());
          if (/^\{\{/.test(m.body) || /\}\}$/.test(m.body)) return App.toast('Add a word before the first or after the last {name}');
          var body = { title: f.title.value, language: f.language.value, category: f.category.value, body: m.body, params: m.params, buttons: buttons.filter(function (b) { return b.text; }) };
          // an approved template is read-only at Meta, so a changed one is saved as a new template
          var changed = !isNew && tpl.status === 'APPROVED' && !App.isDemo && (m.body !== tpl.body || JSON.stringify(body.buttons) !== JSON.stringify(tpl.buttons));
          if (changed) body.title = body.title + ' v2';
          var call = (isNew || changed) ? App.api('POST', '/templates', body) : App.api('PUT', '/templates/' + tpl.id, body);
          call.then(function () { close(); App.toast('Saved'); done(); }).catch(App.fail);
        } }, 'Save')));
    });
  };

  /* ---------- the Compose screen ---------- */
  App.screens.compose = function () {
    return Promise.all([App.api('GET', '/templates'), App.api('GET', '/settings')]).then(function (r) {
      var tpls = r[0].templates, links = r[1].settings; App.isDemo = r[1].demo;
      var usable = tpls.filter(function (t) { return r[1].demo || t.status === 'APPROVED'; });
      var tpl = tpls.filter(function (t) { return t.id === cm.tplId; })[0] || usable[0] || null;
      if (tpl) cm.tplId = tpl.id;
      var out = [App.header('New message', '#/home')];

      out.push(h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('div', null, h('div', { class: 'sub' }, 'To'), h('b', { id: 'to-label' }, App.describeFilter(cm.filter))),
          h('button', { class: 'btn ghost small', onclick: function () { App.pickAudience(cm.filter, function (f) { cm.filter = f; App.refresh(); }); } }, 'Change'))));

      out.push(h('div', { class: 'row between' }, h('div', { class: 'sec' }, 'Message'), h('button', { class: 'btn ghost small', onclick: function () { App.editTemplate(null, links, App.refresh); } }, '+ New template')));
      if (!tpls.length) out.push(h('div', { class: 'card empty' }, 'No templates yet. Tap "+ New template" to write your first message.'));
      else out.push(h('div', { class: 'chips' }, tpls.map(function (t) {
        return h('button', { class: 'chip' + (tpl && t.id === tpl.id ? ' on' : ''), onclick: function () { cm.tplId = t.id; App.refresh(); } }, t.title);
      })));

      if (tpl) {
        out.push(h('div', { class: 'card' },
          h('div', { class: 'row between' }, statusPill(tpl), h('button', { class: 'btn ghost small', onclick: function () { App.editTemplate(tpl, links, App.refresh); } }, 'Edit')),
          App.previewBubble(tpl, links),
          tpl.status === 'APPROVED' || r[1].demo ? null : h('div', { class: 'note warn' }, tpl.status === 'PENDING' ? 'Meta is still checking this template. It can take a few minutes to a day. Check Settings > Templates.' : 'Submit this template to Meta first (Settings > Templates).')));
      }

      var countEl = h('span', null, '...'), feeEl = h('span', null, '');
      out.push(h('div', { class: 'row between sub' }, countEl, feeEl));
      App.api('POST', '/audience/count', { filter: cm.filter, template_id: tpl && tpl.id }).then(function (c) {
        countEl.textContent = c.count + ' people';
        feeEl.textContent = App.isDemo ? 'Demo, no fee' : 'Est. Meta fee ' + App.rupees(c.cost);
        cm.count = c.count; cm.cost = c.cost;
      });

      var can = tpl && (r[1].demo || tpl.status === 'APPROVED');
      out.push(h('div', { class: 'row' },
        h('button', { class: 'btn line grow', disabled: !can, onclick: function () { scheduleSheet(tpl); } }, 'Schedule'),
        h('button', { class: 'btn grow', style: 'flex:1.4', disabled: !can, onclick: function () {
          App.confirm('Send "' + tpl.title + '" to ' + (cm.count || 0) + ' people now?', 'Send now', function () {
            App.api('POST', '/campaigns', { template_id: tpl.id, filter: cm.filter, title: tpl.title }).then(function (c) { location.hash = '#/campaign/' + c.id; }).catch(App.fail);
          });
        } }, 'Send now')));
      return out;
    });
  };

  function scheduleSheet(tpl) {
    App.sheet(function (el, close) {
      var when = h('input', { type: 'datetime-local' });
      var d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0);
      var pad = function (n) { return String(n).padStart(2, '0'); };
      when.value = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':00';
      el.appendChild(h('h2', null, 'Send later'));
      el.appendChild(h('label', { class: 'f' }, 'Date and time (India time)', when));
      el.appendChild(h('div', { class: 'row' },
        h('button', { class: 'btn line grow', onclick: close }, 'Cancel'),
        h('button', { class: 'btn grow', onclick: function () {
          if (!when.value) return;
          App.api('POST', '/campaigns', { template_id: tpl.id, filter: cm.filter, title: tpl.title, send_at: when.value }).then(function () {
            close(); App.toast('Scheduled'); location.hash = '#/schedule';
          }).catch(App.fail);
        } }, 'Schedule')));
    });
  }
})();
