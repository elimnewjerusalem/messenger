(function () {
  var App = window.App, h = App.h;
  var st = { q: '', groups: [], area: '', language: '', optin: '', limit: 100 };

  var HEAD_MAP = {
    number: 'phone', phone: 'phone', mobile: 'phone', whatsapp: 'phone', 'phone number': 'phone', 'mobile number': 'phone', contact: 'phone', 'contact number': 'phone', 'whatsapp number': 'phone',
    name: 'name', 'full name': 'name',
    group: 'groups', groups: 'groups', ministry: 'groups', category: 'groups',
    area: 'area', place: 'area', location: 'area', locality: 'area',
    language: 'language', lang: 'language',
    birthday: 'bday', dob: 'bday', 'date of birth': 'bday', birthdate: 'bday', 'birth date': 'bday', bday: 'bday'
  };

  function optinPill(c) {
    if (c.valid === 0) return h('span', { class: 'pill red' }, 'Invalid number');
    if (c.optin === 1) return h('span', { class: 'pill green' }, 'Opted in');
    if (c.optin === -1) return h('span', { class: 'pill red' }, 'Replied STOP');
    return h('span', { class: 'pill amber' }, 'Not asked');
  }

  /* ---------- reading an Excel or CSV file ---------- */
  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array', cellDates: true });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
      if (!rows.length) throw new Error('The file is empty.');
      var cols = {}, first = rows[0], hasHeader = false;
      first.forEach(function (cell, i) {
        var k = HEAD_MAP[String(cell).trim().toLowerCase()];
        if (k && cols[k] == null) { cols[k] = i; hasHeader = true; }
      });
      var start = 1;
      if (cols.phone == null) {
        if (!hasHeader && /\d{8,}/.test(String(first[0]).replace(/\D/g, ''))) { cols = { phone: 0, name: 1 }; start = 0; }
        else throw new Error('Could not find a "Number" column. Put the word Number in the first row.');
      }
      var out = [];
      for (var r = start; r < rows.length; r++) {
        var row = rows[r], rec = {};
        Object.keys(cols).forEach(function (k) { var v = row[cols[k]]; rec[k] = v instanceof Date ? v : (v == null ? '' : v); });
        if (rec.bday instanceof Date) rec.bday = String(rec.bday.getDate()).padStart(2, '0') + '-' + String(rec.bday.getMonth() + 1).padStart(2, '0');
        if (rec.phone === '' && !rec.name) continue;
        rec.phone = String(rec.phone);
        out.push(rec);
      }
      if (!out.length) throw new Error('No contacts found in this file.');
      return out;
    });
  }

  function downloadSample() {
    var rows = [['Number', 'Name', 'Group', 'Area', 'Language', 'Birthday'],
      ['98410 00001', 'Abraham', 'Sunday, Youth', 'Tondiarpet', 'Tamil', '15-03'],
      ['98410 00002', 'Beulah', 'Friday, Deliverance', 'Korukkupet', 'Tamil', '21-10'],
      ['98410 00003', 'Christopher', 'Sunday', 'Tondiarpet', 'English', '02-12']];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Contacts');
    XLSX.writeFile(wb, 'enjc-contacts-sample.xlsx');
  }

  function doImport() {
    var input = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', hidden: true });
    input.addEventListener('change', function () {
      var f = input.files[0]; if (!f) return;
      readFile(f).then(function (rows) {
        App.sheet(function (el, close) {
          el.appendChild(h('h2', null, 'Import ' + rows.length + ' rows'));
          el.appendChild(h('p', { class: 'muted' }, 'Numbers already in the app are updated and their groups are added together (nothing is deleted).'));
          el.appendChild(h('div', { class: 'row' },
            h('button', { class: 'btn line grow', onclick: close }, 'Cancel'),
            h('button', { class: 'btn grow', onclick: function (e) {
              e.target.disabled = true; e.target.textContent = 'Importing...';
              App.api('POST', '/contacts/import', { rows: rows }).then(function (r) {
                close(); App.toast(r.added + ' added, ' + r.updated + ' updated' + (r.invalid ? ', ' + r.invalid + ' invalid numbers' : '')); App.refresh();
              }).catch(function (err) { App.fail(err); close(); });
            } }, 'Import')));
        });
      }).catch(App.fail);
    });
    input.click();
  }

  /* ---------- edit sheet ---------- */
  function editContact(c) {
    var isNew = !c;
    c = c || { name: '', phone: '', groups: [], area: '', language: '', bday: '', optin: 0 };
    App.sheet(function (el, close) {
      var f = {
        name: h('input', { type: 'text', value: c.name }),
        phone: h('input', { type: 'tel', value: c.phone ? App.fmtPhone(c.phone) : '' }),
        groups: h('input', { type: 'text', value: c.groups.join(', '), placeholder: 'Sunday, Youth' }),
        area: h('input', { type: 'text', value: c.area }),
        language: h('input', { type: 'text', value: c.language, placeholder: 'Tamil or English' }),
        bday: h('input', { type: 'text', value: c.bday ? c.bday.split('-').reverse().join('-') : '', placeholder: '15-03 (day-month)' }),
        optin: h('select', null,
          h('option', { value: '0', selected: c.optin === 0 }, 'Not asked'),
          h('option', { value: '1', selected: c.optin === 1 }, 'Opted in'),
          h('option', { value: '-1', selected: c.optin === -1 }, 'Stopped (never message)'))
      };
      el.appendChild(h('h2', null, isNew ? 'Add contact' : 'Edit contact'));
      [['Name', 'name'], ['WhatsApp number', 'phone'], ['Groups (comma separated)', 'groups'], ['Area', 'area'], ['Language', 'language'], ['Birthday', 'bday'], ['Permission', 'optin']].forEach(function (p) {
        el.appendChild(h('label', { class: 'f' }, p[0], f[p[1]]));
      });
      el.appendChild(h('div', { class: 'row' },
        !isNew ? h('button', { class: 'btn danger', onclick: function () {
          App.confirm('Delete ' + (c.name || 'this contact') + '?', 'Delete', function () {
            App.api('DELETE', '/contacts/' + c.id).then(function () { close(); App.refresh(); }).catch(App.fail);
          });
        } }, 'Delete') : null,
        h('button', { class: 'btn grow', onclick: function () {
          var body = { name: f.name.value, phone: f.phone.value, groups: f.groups.value, area: f.area.value, language: f.language.value, bday: f.bday.value, optin: +f.optin.value };
          App.api(isNew ? 'POST' : 'PATCH', isNew ? '/contacts' : '/contacts/' + c.id, body).then(function () { close(); App.toast('Saved'); App.refresh(); }).catch(App.fail);
        } }, 'Save')));
    });
  }

  /* ---------- the Contacts screen ---------- */
  App.screens.contacts = function () {
    var qs = new URLSearchParams();
    if (st.q) qs.set('q', st.q);
    if (st.groups.length) qs.set('groups', st.groups.join('|'));
    if (st.area) qs.set('areas', st.area);
    if (st.language) qs.set('languages', st.language);
    if (st.optin) qs.set('optin', st.optin);
    qs.set('limit', st.limit);
    return Promise.all([App.api('GET', '/contacts/facets'), App.api('GET', '/contacts?' + qs.toString())]).then(function (r) {
      var fa = r[0], list = r[1];
      var search = h('input', { type: 'search', placeholder: 'Search name or number', value: st.q, 'aria-label': 'Search contacts' });
      var t;
      search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { st.q = search.value; st.limit = 100; App.afterRender = function () { var el = document.querySelector('input[type=search]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }; App.soft(); }, 350); });
      function sel(label, key, items) {
        var s = h('select', { 'aria-label': label }, h('option', { value: '' }, label),
          items.map(function (i) { return h('option', { value: i.v, selected: st[key] === i.v }, i.v + ' (' + i.n + ')'); }));
        s.addEventListener('change', function () { st[key] = s.value; st.limit = 100; App.refresh(); });
        return s;
      }
      var optSel = h('select', { 'aria-label': 'Permission' },
        [['', 'Permission'], ['yes', 'Opted in'], ['none', 'Not asked'], ['stopped', 'Stopped']].map(function (o) { return h('option', { value: o[0], selected: st.optin === o[0] }, o[1]); }));
      optSel.addEventListener('change', function () { st.optin = optSel.value; App.refresh(); });

      var out = [];
      out.push(h('div', { class: 'row between' }, h('div', { class: 'title' }, 'Contacts'),
        h('button', { class: 'btn small', onclick: doImport }, 'Import Excel')));
      out.push(search);
      out.push(h('div', { class: 'chips' },
        h('button', { class: 'chip' + (st.groups.length ? '' : ' on'), onclick: function () { st.groups = []; App.refresh(); } }, 'All ' + (fa.counts.valid || 0)),
        fa.groups.map(function (g) {
          var on = st.groups.indexOf(g.v) >= 0;
          return h('button', { class: 'chip' + (on ? ' on' : ''), onclick: function () {
            st.groups = on ? st.groups.filter(function (x) { return x !== g.v; }) : st.groups.concat(g.v); st.limit = 100; App.refresh();
          } }, g.v + ' ' + g.n);
        })));
      out.push(h('div', { class: 'row' }, sel('Area', 'area', fa.areas), sel('Language', 'language', fa.languages), optSel));
      out.push(h('div', { class: 'row between sub' },
        h('span', null, list.total + ' shown · ' + (fa.counts.total - fa.counts.valid) + ' invalid · ' + (fa.counts.stopped || 0) + ' stopped'),
        h('button', { class: 'btn ghost small', onclick: function () { editContact(null); } }, '+ Add one')));

      if (!list.contacts.length) {
        out.push(h('div', { class: 'card empty' }, fa.counts.total ? 'No contacts match these filters.' : 'No contacts yet. Tap "Import Excel" and choose your file (columns: Number, Name, Group, Area, Language, Birthday).',
          fa.counts.total ? null : h('div', null, h('button', { class: 'btn line small', style: 'margin-top:10px', onclick: downloadSample }, 'Download sample file'))));
      } else {
        out.push(h('div', { class: 'card flush' }, list.contacts.map(function (c) {
          return h('button', { class: 'item', onclick: function () { editContact(c); } },
            App.avatar(c.name || '#'),
            h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, c.name || '(no name)'),
              h('div', { class: 'sub' }, App.fmtPhone(c.phone) + (c.groups.length ? ' · ' + c.groups.join(', ') : ''))),
            optinPill(c));
        })));
        if (list.contacts.length < list.total) out.push(h('button', { class: 'btn line', onclick: function () { st.limit += 200; App.refresh(); } }, 'Show more (' + (list.total - list.contacts.length) + ' left)'));
      }
      if (fa.counts.total && App.can('admin')) {
        out.push(h('div', { class: 'note' }, 'Meta needs proof that members agreed to get messages. If your members already agreed (church WhatsApp group, form, in person), mark them as opted in. ',
          h('button', { class: 'btn ghost small', style: 'padding:0;min-height:30px', onclick: function () {
            App.confirm('Mark every "Not asked" contact as opted in?', 'Yes, mark them', function () {
              App.api('POST', '/contacts/bulk-optin', { filter: {} }).then(function (r) { App.toast(r.changed + ' contacts marked'); App.refresh(); }).catch(App.fail);
            });
          } }, 'Mark all as opted in')));
        out.push(h('div', { class: 'note' }, 'Members who reply STOP are skipped in every send automatically.'));
      }
      return out;
    });
  };

  /* ---------- audience picker, shared with Compose and Schedule ---------- */
  App.describeFilter = function (f) {
    f = f || {};
    var parts = [].concat(f.groups || [], f.areas || [], f.languages || []);
    return (parts.length ? parts.join(' + ') : 'Everyone') + (f.optin === 'yes' ? ' (opted in only)' : '');
  };
  App.pickAudience = function (filter, onDone) {
    App.api('GET', '/contacts/facets').then(function (fa) {
      var f = JSON.parse(JSON.stringify(filter || {}));
      f.groups = f.groups || []; f.areas = f.areas || []; f.languages = f.languages || [];
      App.sheet(function (el, close) {
        var countEl = h('div', { class: 'sub' }, '...');
        function recount() {
          App.api('POST', '/audience/count', { filter: f }).then(function (r) { countEl.textContent = r.count + ' people will get this'; });
        }
        function section(title, key, items) {
          if (!items.length) return null;
          return h('div', null, h('div', { class: 'sec' }, title), h('div', { class: 'chips', style: 'margin-top:6px' }, items.map(function (i) {
            var b = h('button', { class: 'chip' + (f[key].indexOf(i.v) >= 0 ? ' on' : '') }, i.v + ' ' + i.n);
            b.addEventListener('click', function () {
              var idx = f[key].indexOf(i.v);
              if (idx >= 0) f[key].splice(idx, 1); else f[key].push(i.v);
              b.classList.toggle('on'); recount();
            });
            return b;
          })));
        }
        el.appendChild(h('h2', null, 'Who gets this message?'));
        el.appendChild(h('p', { class: 'sub' }, 'Pick nothing to send to everyone. Within a section it is "any of", between sections it is "and".'));
        el.appendChild(section('Groups', 'groups', fa.groups));
        el.appendChild(section('Area', 'areas', fa.areas));
        el.appendChild(section('Language', 'languages', fa.languages));
        var yes = h('input', { type: 'checkbox', checked: f.optin === 'yes' });
        yes.addEventListener('change', function () { f.optin = yes.checked ? 'yes' : 'any'; recount(); });
        el.appendChild(h('label', { class: 'chk' }, yes, 'Only members marked as opted in'));
        el.appendChild(countEl);
        el.appendChild(h('div', { class: 'row' },
          h('button', { class: 'btn line grow', onclick: close }, 'Cancel'),
          h('button', { class: 'btn grow', onclick: function () { close(); onDone(f); } }, 'Use this')));
        recount();
      });
    }).catch(App.fail);
  };
})();
