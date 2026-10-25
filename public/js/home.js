(function () {
  var App = window.App, h = App.h;

  App.screens.home = function () {
    return App.api('GET', '/home').then(function (d) {
      App.unread = d.unread;
      var cards = [];

      cards.push(h('div', { class: 'row between' },
        h('div', null, h('div', { class: 'sub' }, d.church || 'Church'), h('div', { class: 'title' }, 'Vanakkam, ' + (App.session.user.name || '').split(' ')[0])),
        h('a', { href: '#/settings', class: 'pill ' + (d.demo ? 'amber' : 'green'), style: 'padding:7px 11px' }, d.demo ? 'Demo mode' : 'API connected')));

      if (d.demo) cards.push(h('div', { class: 'note warn' }, 'Demo mode: nothing is really sent. Messages are only simulated until you add the Meta token (see Settings).'));

      cards.push(h('a', { class: 'hero', href: '#/compose' },
        h('div', { class: 'ic' }, App.icon('plus', 26)),
        h('div', { class: 'grow' }, h('b', null, 'New message'), h('span', null, 'Send now or schedule, with buttons')),
        App.icon('next', 20)));

      if (d.active) {
        var a = d.active, s = a.stats, pct = a.total ? Math.round((s.sent / a.total) * 100) : 0;
        cards.push(h('a', { class: 'card', href: '#/campaign/' + a.id },
          h('div', { class: 'row between' }, h('b', null, a.title),
            h('span', { class: 'pill ' + (a.status === 'paused' ? 'amber' : 'blue') }, a.status === 'paused' ? 'Paused' : 'Sending')),
          h('div', { class: 'bar' }, h('i', { style: 'width:' + pct + '%' })),
          h('div', { class: 'row between sub' }, h('span', null, s.sent + ' of ' + a.total + ' sent'), h('span', null, s.delivered + ' delivered · ' + s.failed + ' failed'))));
      }

      var next = d.schedules[0];
      cards.push(h('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px' },
        h('a', { class: 'card', href: '#/inbox' }, h('div', { class: 'sub' }, 'New replies'),
          h('div', { style: 'font-size:26px;font-weight:700' }, d.unread),
          d.prayer ? h('div', { class: 'sub', style: 'color:var(--amber);font-weight:600' }, d.prayer + ' prayer request' + (d.prayer > 1 ? 's' : '')) : h('div', { class: 'sub' }, 'All caught up')),
        h('a', { class: 'card', href: '#/schedule' }, h('div', { class: 'sub' }, 'Next scheduled'),
          h('div', { style: 'font-size:16px;font-weight:700;margin-top:6px' }, next ? nextLabel(next) : 'Nothing yet'),
          h('div', { class: 'sub' }, next ? next.title : 'Add one in Schedule'))));

      var bd = [h('div', { class: 'row between' }, h('b', null, 'Birthdays today'),
        d.birthdayAuto ? h('a', { href: '#/schedule', class: 'sub', style: 'color:var(--green);font-weight:600' }, d.birthdayAuto.enabled ? 'Auto at ' + d.birthdayAuto.at : 'Auto is off') :
          h('a', { href: '#/schedule', class: 'sub', style: 'color:var(--green);font-weight:600' }, 'Set up auto wishes'))];
      if (!d.birthdaysToday.length) bd.push(h('div', { class: 'sub' }, 'No birthdays today.'));
      d.birthdaysToday.slice(0, 5).forEach(function (c) {
        var st = c.wish;
        bd.push(h('div', { class: 'row' }, App.avatar(c.name),
          h('div', { class: 'grow' }, h('div', { style: 'font-weight:500' }, c.name || 'No name'), h('div', { class: 'sub' }, [c.area, c.language].filter(Boolean).join(' · '))),
          st ? h('span', { class: 'pill green' }, st === 'queued' ? 'Wish queued' : st === 'failed' ? 'Failed' : st === 'sent' ? 'Sent' : st === 'delivered' ? 'Delivered' : 'Read') :
            h('span', { class: 'pill' }, d.birthdayAuto && d.birthdayAuto.enabled ? 'Waiting' : 'Not sent')));
      });
      if (d.birthdaysToday.length > 5) bd.push(h('div', { class: 'sub' }, '+ ' + (d.birthdaysToday.length - 5) + ' more today'));
      bd.push(h('div', { class: 'sub' }, 'Next 7 days: ' + d.birthdaysWeek + ' birthday' + (d.birthdaysWeek === 1 ? '' : 's') + '  ·  ' + (d.contacts.withb || 0) + ' of ' + (d.contacts.total || 0) + ' contacts have a birthday saved'));
      cards.push(h('div', { class: 'card' }, bd));

      cards.push(h('div', { class: 'card' }, h('div', { class: 'row between' },
        h('div', null, h('b', null, 'Last 30 days'), h('div', { class: 'sub' }, d.month.messages.toLocaleString('en-IN') + ' messages sent')),
        h('div', { style: 'text-align:right' }, h('b', null, 'Est. Meta fee'), h('div', { class: 'sub' }, d.demo ? 'Demo, no fee' : App.rupees(d.month.cost))))));
      return cards;
    });
  };

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function nextLabel(s) {
    if (s.kind === 'once') return s.on_date.slice(5).split('-').reverse().join('/') + ' ' + s.at;
    return (s.kind === 'monthly' ? '1st ' : '') + DAYS[s.dow] + ' ' + s.at;
  }
  App.dayNames = DAYS;
  App.nextLabel = nextLabel;
})();
