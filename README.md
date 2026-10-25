# ENJC Messenger v2

Church WhatsApp messaging on the **official WhatsApp Business API**:
Excel contacts, groups and filters, template messages with buttons, scheduled reminders,
automatic birthday wishes, delivery status, reply inbox, keyword auto-replies, team logins.

It runs free on Cloudflare (Workers + D1). Your contacts live only in your own database.
No third-party messaging service sees them. Only Meta receives the number and text when a message is sent.

**It starts in DEMO mode.** Nothing is really sent until you add the Meta secrets (Part 3).
Use demo mode to learn the app and import your Excel file first.

---

## Part 1. Put the app online (about 15 minutes, free)

1. Make a free account at https://dash.cloudflare.com/sign-up (email only).
2. Install Node.js (LTS) from https://nodejs.org on your PC.
3. Open a terminal inside this folder and run:

```
npm install
npx wrangler login
npx wrangler d1 create enjc-messenger
```

4. The last command prints a `database_id`. Open `wrangler.toml` and replace `PASTE-YOUR-DATABASE-ID-HERE` with it.
5. Create the tables, then deploy:

```
npm run db:remote
npx wrangler deploy
```

6. Set two secrets (the command asks you to type the value):

```
npx wrangler secret put SESSION_SECRET     # type 30+ random letters and numbers
npx wrangler secret put VERIFY_TOKEN       # type any word you choose, remember it
```

7. Open the address printed by `wrangler deploy` (looks like `https://enjc-messenger.YOURNAME.workers.dev`).
   The first screen asks you to create the admin login. On your phone choose "Add to Home screen".

The 1-minute timer (sending queue, schedules, birthdays) is created automatically from `wrangler.toml`.

## Part 2. Use it in demo mode

1. Contacts > Import Excel. Columns: `Number, Name, Group, Area, Language, Birthday` (Birthday as day-month, like 15-03).
   A contact can have many groups: `Sunday, Youth`. Importing the same number again merges the groups.
2. Compose > + New template. Write the message with `{name}`, add buttons (website, YouTube, quick reply).
3. Choose who gets it, tap Send now. Watch the progress. Try Schedule > Birthday wishes.

## Part 3. Go live with Meta (do this when you are ready)

You need a WhatsApp Business Platform account. In short:

1. https://developers.facebook.com > Create app > type **Business** > add the **WhatsApp** product.
2. In Meta Business Suite create or choose your Business, and add a phone number to the WhatsApp account.
   Use a number that is **not** in the WhatsApp or WhatsApp Business app (or delete that WhatsApp account first).
   A new SIM for the church is the easiest. Once it is on the API, that number cannot be used in the normal app.
3. Create a **System User** (Business settings > Users > System users), give it the WhatsApp account, and generate a
   **permanent token** with the permissions `whatsapp_business_messaging` and `whatsapp_business_management`.
4. Collect four values and store them as secrets:

```
npx wrangler secret put META_TOKEN         # the permanent token
npx wrangler secret put PHONE_NUMBER_ID    # WhatsApp > API setup > Phone number ID
npx wrangler secret put WABA_ID            # WhatsApp Business Account ID
npx wrangler secret put APP_SECRET         # App settings > Basic > App secret
npx wrangler deploy
```

5. In the Meta app: WhatsApp > Configuration > Webhook.
   Callback URL = `https://YOUR-ADDRESS/webhook` (Settings screen shows it, with a Copy button).
   Verify token = the `VERIFY_TOKEN` word. Subscribe to the **messages** field.
6. Open the app > Settings. It should say **Connected**, with the number quality.
7. Templates: open Settings > Message templates > **Submit to Meta**. Approval takes minutes to a day.
   Then use "Check Meta for approvals". Only approved templates can be sent.

Things to know (as far as I know, check Meta's current pages):
* Meta decides if a template is Marketing or Utility, whatever you choose. Budget for Marketing.
* Until your Business is **verified**, the number can message only a limited number of different people per day
  (250 at the start). With 550 contacts either verify the business (Trust registration papers) or send in parts over 3 days.
* Members must have agreed to get messages. Use "Mark all as opted in" only if that is true.
* Replies are free for 24 hours after a member writes. After that only a template can start the chat.
* Members who reply STOP are skipped automatically in every send.

## Daily use

* **Home**: new message, active send, replies, birthdays today.
* **Schedule**: Sunday and Friday reminders (weekly), first Saturday of the month, one-time sends, birthday wishes.
* **Inbox**: replies, prayer requests, reply for free inside 24 hours.
* **Settings > Auto-replies**: SERVICE, PRAYER, STOP, START and your own words.
* **Settings > Team**: add the pastor (can send and reply) or the office (inbox only, contacts hidden).

## Backup

```
npm run backup        # creates backup.sql with all contacts and history
```

Keep that file private. It contains your members' numbers.

## Run it on your own PC to test

```
copy .dev.vars.example .dev.vars        (Windows)   |   cp .dev.vars.example .dev.vars   (Mac, Linux)
npm run db:local
npm run dev
```

Open http://localhost:8787. Open http://localhost:8787/cdn-cgi/handler/scheduled to run one timer tick by hand.

## Files

* `src/worker.js` the API, webhook, and timer entry. `src/engine.js` sending queue, schedules, birthdays, replies.
* `src/meta.js` talks to Meta. `src/auth.js` logins. `schema.sql` the database.
* `public/` the app (plain JavaScript, no build step).
