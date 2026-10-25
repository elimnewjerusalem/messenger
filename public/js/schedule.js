(function () {
  var App = window.App, h = App.h;

  function tplOptions(tpls, sel, none) {
    var o = [];
    if (none) o.push(h('option', { value: '0' }, none));
    tpls.forEach(function (t) { o.push(h('option', { value: t.id, selected: +sel === t.id }, t.title + (t.status === 'APPROVED' ? '' : ' (' + t.status.toLowerCase() + ')'))); });
    return o;
  }

  function birthdaySheet(bd, tpls) {
    var at = h('input', { type: 'time', value: bd ? bd.at : '08:00' });
    var ta = h('select', null, tplOptions(tpls, bd ? bd.tpl_ta : 0, 'Choose a Tamil wish'));
    var en = h('select', null, tplOptions(tpls, bd ? bd.tpl_en : 0, 'Same as Tamil / none'));
    App.sheet(function (el, close) {
      el.appendChild(h('h2', null, 'Birthday wishes'));
      el.appendChild(h('p', { class: 'sub' }, 'Every day at this time, members whose birthday is today get a wish. Tamil speakers get the Tamil one, English speakers the English one. Contacts need a birthday saved (Birthday column, day-month like 15-03).'));
      el.appendChild(h('label', { class: 'f' }, 'Send at (India time)', at));
      el.appendChild(h('label', { class: 'f' }, 'Tamil template', ta));
      el.appendChild(h('label', { class: 'f' }, 'English template', en));
      if (!tpls.length) el.appendChild(h('div', { class: 'note warn' }, 'Create a message template first (Compose > + New template), for example "வாழ்த்துக்கள் {name}!".'));
      el.appendChild(h('div', { class: 'row' },
        h('button', { class: 'btn line grow', onclick: close }, 'Cancel'),
        h('button', { class: 'btn grow', onclick: function () {
          if (!+ta.value && !+en.value) return App.toast('Choose at least one template');
          var body = { title: 'Birthday wishes', kind: 'birthday', at: at.value || '08:00', tpl_ta: +ta.value, tpl_en: +en.value, enabled: true };
          (bd ? App.api('PATCH', '/schedules/' + bd.id, body) : App.api('POST', '/schedules', body)).then(function () { close(); App.toast('Saved'); App.refresh(); }).catch(App.fail);
        } }, 'Save')));
    });
  }

  function scheduleSheet(s, tpls) {
    var isNew = !s;
    s = s || { title: '', template_id: 0, filter: {}, kind: 'weekly', dow: 0, at: '07:00', on_date: '' };
    var filter = s.filter || {};
    var f = {
      title: h('input', { type: 'text', value: s.title, placeholder: 'Sunday service reminder' }),
      tpl: h('select', null, tplOptions(tpls, s.template_id, 'Choose a message')),
      kind: h('select', null, [['weekly', 'Every week'], ['monthly', 'First week of every month'], ['once', 'One time']].map(function (k) { return h('option', { value: k[0], selected: s.kind === k[0] }, k[1]); })),
      dow: h('select', null, App.dayNames.map(function (d, i) { return h('option', { value: i, selected: s.dow === i }, d); })),
      at: h('input', { type: 'time', value: s.at }),
      date: h('input', { type: 'date', value: s.on_date })
    };
    var dowL = h('label', { class: 'f' }, 'Day', f.dow), dateL = h('label', { class: 'f' }, 'Date', f.date);
    function showKind() { dowL.hidden = f.kind.value === 'once'; dateL.hidden = f.kind.value !== 'once'; }
    f.kind.addEventListener('change', showKind);
    App.sheet(function (el, close) {
      var toLabel = h('b', null, App.describeFilter(filter));
      el.appendChild(h('h2', null, isNew ? 'New schedule' : 'Edit schedule'));
      el.appendChild(h('label', { class: 'f' }, 'Name', f.title));
      el.appendChild(h('label', { class: 'f' }, 'Message', f.tpl));
      el.appendChild(h('div', { class: 'row between card', style: 'flex-direction:row' }, h('div', null, h('div', { class: 'sub' }, 'To'), toLabel),
        h('button', { class: 'btn ghost small', onclick: function () { App.pickAudience(filter, function (nf) { filter = nf; toLabel.textContent = App.describeFilter(nf); }); } }, 'Change')));
      el.appendChild(h('label', { class: 'f' }, 'Repeat', f.kind));
      el.appendChild(dowL); el.appendChild(dateL);
      el.appendChild(h('label', { class: 'f' }, 'Time (India time)', f.at));
      showKind();
      el.appendChild(h('div', { class: 'row' },
        !isNew ? h('button', { class: 'btn danger', onclick: function () {
          App.confirm('Delete this schedule?', 'Delete', function () { App.api('DELETE', '/schedules/' + s.id).then(function () { close(); App.refresh(); }).catch(App.fail); });
        } }, 'Delete') : null,
        h('button', { class: 'btn grow', onclick: function () {
          if (!+f.tpl.value) return App.toast('Choose a message');
          if (f.kind.value === 'once' && !f.date.value) return App.toast('Choose a date');
          var body = { title: f.title.value || 'Schedule', template_id: +f.tpl.value, filter: filter, kind: f.kind.value, dow: +f.dow.value, at: f.at.value || '08:00', on_date: f.date.value };
          if (!isNew) body.enabled = true;
          (isNew ? App.api('POST', '/schedules', body) : App.api('PATCH', '/schedules/' + s.id, body)).then(function () { close(); App.toast('Saved'); App.refresh(); }).catch(App.fail);
        } }, 'Save')));
    });
  }

  App.screens.schedule = function () {
    return Promise.all([App.api('GET', '/schedules'), App.api('GET', '/templates')]).then(function (r) {
      var list = r[0].schedules, tpls = r[1].templates;
      var bd = list.filter(function (s) { return s.kind === 'birthday'; })[0];
      var rep = list.filter(function (s) { return s.kind === 'weekly' || s.kind === 'monthly'; });
      var once = list.filter(function (s) { return s.kind === 'once' && s.enabled; });
      var out = [];
      out.push(h('div', { class: 'row between' }, h('div', { class: 'title' }, 'Schedule'),
        h('button', { class: 'btn small', onclick: function () { scheduleSheet(null, tpls); } }, '+ New schedule')));

      var bdBody = [h('div', { class: 'row between' }, h('b', { style: 'font-size:16px' }, 'Birthday wishes'),
        bd ? App.switchBtn(!!bd.enabled, function (on) { App.api('PATCH', '/schedules/' + bd.id, { enabled: on }).then(function () { App.toast(on ? 'Birthday wishes on' : 'Birthday wishes off'); }).catch(App.fail); }, 'Birthday wishes') : null)];
      bdBody.push(h('div', { style: 'font-size:13px;opacity:.92;line-height:1.5' }, bd ? 'Every day at ' + bd.at + ', members with a birthday get their wish automatically in their language.' : 'Send a wish to every member on their birthday, automatically.'));
      bdBody.push(h('button', { class: 'btn small', style: 'background:rgba(255,255,255,.2);align-self:flex-start', onclick: function () { birthdaySheet(bd, tpls); } }, bd ? 'Change time or messages' : 'Set up'));
      out.push(h('div', { class: 'on-green', style: 'background:var(--green);color:#fff;border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:10px' }, bdBody));

      out.push(h('div', { class: 'sec' }, 'Repeating'));
      if (!rep.length) out.push(h('div', { class: 'card empty' }, 'No repeating reminders yet. Add "Sunday service" every Sunday 7 AM, for example.'));
      rep.forEach(function (s) {
        out.push(h('div', { class: 'card', style: 'cursor:pointer', onclick: function () { scheduleSheet(s, tpls); } },
          h('div', { class: 'row between' }, h('div', null, h('div', { style: 'font-weight:600' }, s.title),
            h('div', { class: 'sub' }, (s.kind === 'monthly' ? 'First ' : 'Every ') + App.dayNames[s.dow] + ' at ' + s.at + ' · ' + App.describeFilter(s.filter))),
            App.switchBtn(!!s.enabled, function (on) { App.api('PATCH', '/schedules/' + s.id, { enabled: on }).catch(App.fail); }, s.title)),
          h('div', { class: 'row between sub' }, h('span', null, s.audience + ' people · ' + (s.template_title || 'no message')), h('span', null, s.enabled ? 'Next: ' + App.nextLabel(s) : 'Paused'))));
      });

      out.push(h('div', { class: 'sec' }, 'One time'));
      if (!once.length) out.push(h('div', { class: 'sub' }, 'Nothing waiting. Use Schedule on the New message screen.'));
      once.forEach(function (s) {
        out.push(h('div', { class: 'card', style: 'flex-direction:row;align-items:center;cursor:pointer', onclick: function () { scheduleSheet(s, tpls); } },
          h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, s.title), h('div', { class: 'sub' }, s.on_date + ' at ' + s.at + ' · ' + s.audience + ' people')),
          h('span', { class: 'pill amber' }, 'Waiting')));
      });
      return out;
    });
  };
})();
