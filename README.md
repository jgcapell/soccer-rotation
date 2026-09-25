# Soccer Rotation

A phone-first roster app for a toddler soccer team. Coaches check players in, get a
suggested lineup one quarter at a time, adjust it for whatever actually happens, and the
app keeps playing time fair across the season.

- Front end: one static file, `public/index.html`
- Back end: a Cloudflare Worker (`src/worker.js`) with a D1 database holding the season
- Everyone with the link sees the same data. It refreshes about every 6 seconds, and
  simultaneous edits from two phones merge safely.

## Rules the rotation follows

1. **4 players on the field**, 8 quarters of 5 minutes each.
2. **Nobody sits more than 2 quarters in a row.**
3. **Everybody plays at least once per half** (Q1–Q4 and Q5–Q8).
4. **Fair share per game attended.** For each quarter a player is checked in, their fair
   share is 4 ÷ (players checked in). Absences don't create a debt. Within the rules,
   players furthest below their season fair share are suggested first.

Every suggestion can be overridden. Tap two players to swap them. What you confirm is what
gets recorded, and past quarters can be corrected from the quarter grid (Played / Sat / Out).

Run `npm test` to simulate 200 random seasons (absences and injuries included). It checks
the rules above. Currently there are 0 violations, and the worst end-of-season spread
between any two players is 1.5 quarters of fair share.

## Deploy

```bash
npm install
npx wrangler login
npm run db:create        # copy the database_id it prints into wrangler.toml
npm run db:init          # creates the tables in the remote D1 database
npm run deploy
```

The first page load seeds the roster and schedule. To deploy from GitHub instead, push the
repo, then in the Cloudflare dashboard go to **Workers & Pages → Create → Import a
repository**. Keep the D1 `database_id` in `wrangler.toml`.

### Optional edit key
The app is public. To stop strangers from editing it, set a shared key:
```bash
npx wrangler secret put EDIT_KEY
```
Each phone is asked for the key the first time it saves a change.

### Local development
```bash
npm run db:init:local
npm run dev              # http://localhost:8787
```

## Season setup (seeded)
- Games 1–2 (Sat 9/12 and 9/19) are marked **Needs results**. Enter who came and how
  many quarters each child played, then tap **Save results**.
- Games 3–9: Saturdays 9/26 through 11/7 at 10:15 AM.
- A rained-out game can be marked **Cancel for weather**. It stops counting and can be
  restored later. Use **Add a makeup game** for a reschedule.

## Recovery
Each save keeps a copy (the last 500 versions) in the `history` table:
```bash
npx wrangler d1 execute soccer-rotation --remote --command "SELECT version, created_at FROM history ORDER BY version DESC LIMIT 20"
```
The Team tab also has **Download backup** (JSON) and the Season tab has **Download CSV**.
