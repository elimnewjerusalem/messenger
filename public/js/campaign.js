(function () {
  var App = window.App, h = App.h;
  var filter = 'all';

  var STATUS = {
    queued: ['', 'Waiting'], sending: ['', 'Sending'], sent: ['', 'Sent'], delivered: ['green', 'Delivered'], read: ['blue', 'Read'], failed: ['red', 'Failed']
  };

  App.screens.campaign = function (args) {
    var id = args[0];
    return App.api('GET', '/campaigns/' + id + '?filter=' + filter).then(function (d) {
      var c = d.campaign, s = d.stats, total = c.total || 1;
      var out = [App.header(c.title, '#/home')];
      var live = c.status === 'sending';
      if (live || c.status === 'paused') App.every(4000, function () { App.soft(); });

      var sentPct = Math.round((s.delivered / total) * 100), leftPct = Math.round(((s.sent - s.delivered) / total) * 100);
      out.push(h('div', { class: 'card' },
        h('div', { class: 'row between' },
          h('div', { style: 'font-size:32px;font-weight:700;letter-spacing:-.02em' }, s.sent, h('span', { class: 'muted', style: 'font-size:16px;font-weight:500' }, ' / ' + c.total)),
          h('span', { class: 'pill ' + (c.status === 'done' ? 'green' : c.status === 'paused' ? 'amber' : 'blue') }, c.status === 'done' ? 'Finished' : c.status === 'paused' ? 'Paused' : 'Sending')),
        h('div', { class: 'bar' }, h('i', { style: 'width:' + sentPct + '%' }), h('i', { class: 'l', style: 'width:' + leftPct + '%' })),
        h('div', { class: 'stats' },
          h('div', null, h('b', null, s.sent), h('span', null, 'Sent')),
          h('div', null, h('b', null, s.delivered), h('span', null, 'Delivered')),
          h('div', null, h('b', null, s.read), h('span', null, 'Read')),
          h('div', null, h('b', { style: s.failed ? 'color:var(--red)' : '' }, s.failed), h('span', null, 'Failed')))));

      if (live && s.queued) out.push(h('div', { class: 'card', style: 'flex-direction:row;align-items:center' }, App.icon('cal', 20),
        h('div', { class: 'grow', style: 'font-size:13px' }, h('b', null, 'Paced sending: '), d.perMinute + ' per minute (' + d.perMinute * 10 + ' per 10 minutes). About ' + d.minutesLeft + ' minute' + (d.minutesLeft === 1 ? '' : 's') + ' left. You can close the app, it keeps going.')));
      if (c.status === 'paused') out.push(h('div', { class: 'note warn' }, 'Paused. ' + s.queued + ' messages are waiting.'));

      out.push(h('div', { class: 'chips' }, [['all', 'All'], ['read', 'Read'], ['notdelivered', 'Not delivered'], ['failed', 'Failed']].map(function (f) {
        return h('button', { class: 'chip' + (filter === f[0] ? ' on' : ''), onclick: function () { filter = f[0]; App.refresh(); } }, f[1]);
      })));

      if (!d.messages.length) out.push(h('div', { class: 'card empty' }, 'Nothing here.'));
      else out.push(h('div', { class: 'card flush' }, d.messages.map(function (m) {
        var st = STATUS[m.status] || ['', m.status];
        return h('div', { class: 'item' },
          h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, m.name || App.fmtPhone(m.phone)),
            m.error ? h('div', { class: 'sub', style: 'color:var(--red)' }, m.error) : h('div', { class: 'sub' }, m.name ? App.fmtPhone(m.phone) : '')),
          h('span', { class: 'pill ' + st[0] }, st[1]));
      })));
      if (d.messages.length >= 200) out.push(h('div', { class: 'sub', style: 'text-align:center' }, 'Showing the first 200.'));

      var act = [];
      if (c.status === 'sending') act.push(h('button', { class: 'btn line grow', onclick: function () { post('pause'); } }, 'Pause'));
      if (c.status === 'paused') act.push(h('button', { class: 'btn grow', onclick: function () { post('resume'); } }, 'Resume'));
      if (s.failed) act.push(h('button', { class: 'btn danger grow', onclick: function () { post('retry'); } }, 'Retry failed'));
      if (c.status !== 'done' && s.queued) act.push(h('button', { class: 'btn danger grow', onclick: function () { App.confirm('Stop this send? Waiting messages are cancelled.', 'Stop', function () { post('cancel'); }); } }, 'Stop'));
      if (act.length) out.push(h('div', { class: 'row' }, act));
      return out;

      function post(a) { App.api('POST', '/campaigns/' + id + '/' + a).then(function () { App.refresh(); }).catch(App.fail); }
    });
  };
})();
