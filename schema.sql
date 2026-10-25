-- ENJC Messenger v2 database (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'sender',      -- admin | sender | inbox
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL UNIQUE,                -- 91XXXXXXXXXX
  groups TEXT NOT NULL DEFAULT '[]',         -- JSON array
  area TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  bday TEXT NOT NULL DEFAULT '',             -- MM-DD
  optin INTEGER NOT NULL DEFAULT 0,          -- 0 not asked, 1 opted in, -1 stopped
  valid INTEGER NOT NULL DEFAULT 1,
  last_sent INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,                       -- shown in the app
  meta_name TEXT NOT NULL DEFAULT '',        -- approved template name at Meta (lowercase_underscores)
  language TEXT NOT NULL DEFAULT 'ta',       -- Meta language code
  category TEXT NOT NULL DEFAULT 'MARKETING',
  body TEXT NOT NULL,                        -- text with {{1}} {{2}} placeholders
  params TEXT NOT NULL DEFAULT '["name"]',   -- JSON: what fills {{1}}, {{2}}...
  buttons TEXT NOT NULL DEFAULT '[]',        -- JSON: [{type:'URL',text,url}|{type:'QUICK_REPLY',text}]
  status TEXT NOT NULL DEFAULT 'DRAFT',      -- DRAFT | PENDING | APPROVED | REJECTED
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  template_id INTEGER NOT NULL,
  filter TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sending',    -- sending | paused | done
  total INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',     -- manual | schedule | birthday
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  phone TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',     -- queued | sent | delivered | read | failed
  wamid TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  updated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_msg_campaign ON messages(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_msg_wamid ON messages(wamid);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  template_id INTEGER NOT NULL DEFAULT 0,
  filter TEXT NOT NULL DEFAULT '{}',
  kind TEXT NOT NULL,                        -- weekly | monthly | once | birthday
  dow INTEGER NOT NULL DEFAULT 0,            -- 0 Sunday .. 6 Saturday (weekly), or nth for monthly (first <dow>)
  at TEXT NOT NULL DEFAULT '08:00',          -- HH:MM IST
  on_date TEXT NOT NULL DEFAULT '',          -- YYYY-MM-DD for once
  tpl_ta INTEGER NOT NULL DEFAULT 0,         -- birthday templates by language
  tpl_en INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run TEXT NOT NULL DEFAULT ''          -- YYYY-MM-DD of last run
);

CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  contact_id INTEGER NOT NULL DEFAULT 0,
  direction TEXT NOT NULL,                   -- in | out
  body TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  auto INTEGER NOT NULL DEFAULT 0,
  is_read INTEGER NOT NULL DEFAULT 0,
  wamid TEXT NOT NULL DEFAULT '',
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_phone ON chat(phone, ts);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keywords TEXT NOT NULL,                    -- comma separated, case-insensitive
  reply TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  notify INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL DEFAULT '',           -- '' | stop | start
  match TEXT NOT NULL DEFAULT 'exact',       -- exact | contains
  enabled INTEGER NOT NULL DEFAULT 1,
  locked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO rules (id, keywords, reply, tag, notify, action, match, enabled, locked) VALUES
 (1, 'SERVICE,SERVICES,TIMING,ஆராதனை', 'ஞாயிறு: காலை 9 மணி · வெள்ளி: மாலை 7 மணி. Tondiarpet, Chennai.', '', 0, '', 'exact', 1, 0),
 (2, 'PRAYER,PRAYER REQUEST,PRAY,ஜெபம்,ஜெப', 'உங்கள் ஜெப விண்ணப்பம் கிடைத்தது. நாங்கள் ஜெபிப்போம்.', 'Prayer request', 1, '', 'contains', 1, 0),
 (3, 'STOP,UNSUBSCRIBE', 'You will not receive messages from us. Send START to join again.', 'Stopped', 0, 'stop', 'exact', 1, 1),
 (4, 'START', 'Welcome back. You will get church updates again.', '', 0, 'start', 'exact', 1, 0);

INSERT OR IGNORE INTO settings (key, value) VALUES
 ('website', 'https://elimnewjerusalem.github.io/church'),
 ('youtube', ''),
 ('per_minute', '20'),
 ('church', 'Elim New Jerusalem Church');
