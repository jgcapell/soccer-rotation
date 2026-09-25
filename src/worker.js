// Soccer Rotation - Cloudflare Worker
// Serves the static app from /public and a small shared-state API backed by D1.
//
//   GET  /api/state   -> { version, updatedAt, data }
//   PUT  /api/state   <- { baseVersion, data }   (optimistic concurrency; 409 on conflict)
//   GET  /api/health  -> { ok: true }
//
// The whole season lives in one JSON document (a few KB). Every successful write
// bumps the version and keeps a copy in the history table for recovery.

const ROSTER = ["Bennett", "Trainor", "Pierson", "Mila", "James", "Levi", "Memphis", "Teddy", "Hudson", "Nora"];

// Games 1-2 were already played (entered afterwards as results);
// games 3-9 are every Saturday at 10:15 starting 2026-09-26.
const SCHEDULE = [
  "2026-09-12", "2026-09-19",
  "2026-09-26", "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31", "2026-11-07",
];

function seedState() {
  return {
    schemaVersion: 1,
    teamName: "Toddler Soccer",
    quarterMinutes: 5,
    players: ROSTER.map((name, i) => ({ id: "p" + (i + 1), name, active: true })),
    games: SCHEDULE.map((date, i) => {
      const past = i < 2;
      return {
        id: "g" + (i + 1),
        date,
        time: "10:15",
        opponent: "",
        status: past ? "final" : "scheduled",
        mode: past ? "manual" : "live",
        needsEntry: past,
        attendance: [],
        available: [],
        quarters: [],
        manualPlayed: {},
      };
    }),
  };
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const getRow = (env) =>
  env.DB.prepare("SELECT version, data, updated_at FROM state WHERE id = 1").first();

async function handleApi(request, env, url) {
  if (url.pathname === "/api/health") return json({ ok: true });
  if (url.pathname !== "/api/state") return json({ error: "Not found" }, 404);

  if (request.method === "GET") {
    let row = await getRow(env);
    if (!row) {
      await env.DB.prepare("INSERT OR IGNORE INTO state (id, version, data, updated_at) VALUES (1, 1, ?, ?)")
        .bind(JSON.stringify(seedState()), new Date().toISOString())
        .run();
      row = await getRow(env);
    }
    return json({ version: row.version, updatedAt: row.updated_at, data: JSON.parse(row.data) });
  }

  if (request.method === "PUT") {
    if (env.EDIT_KEY && request.headers.get("X-Edit-Key") !== env.EDIT_KEY) {
      return json({ error: "Edit key required" }, 401);
    }
    const body = await request.json().catch(() => null);
    const d = body && body.data;
    if (!body || typeof body.baseVersion !== "number" || !d || !Array.isArray(d.players) || !Array.isArray(d.games)) {
      return json({ error: "Invalid payload" }, 400);
    }
    const data = JSON.stringify(d);
    if (data.length > 1_000_000) return json({ error: "Season data is too large" }, 413);

    const now = new Date().toISOString();
    const res = await env.DB.prepare(
      "UPDATE state SET data = ?, version = version + 1, updated_at = ? WHERE id = 1 AND version = ?"
    ).bind(data, now, body.baseVersion).run();

    const row = await getRow(env);
    if (!row) return json({ error: "State not initialised; reload the app" }, 409);
    if (!res.meta.changes) {
      return json({ error: "conflict", version: row.version, updatedAt: row.updated_at, data: JSON.parse(row.data) }, 409);
    }

    await env.DB.batch([
      env.DB.prepare("INSERT OR REPLACE INTO history (version, data, created_at) VALUES (?, ?, ?)").bind(row.version, data, now),
      env.DB.prepare("DELETE FROM history WHERE version < ?").bind(row.version - 500),
    ]);
    return json({ version: row.version, updatedAt: row.updated_at });
  }

  return json({ error: "Method not allowed" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: (err && err.message) || "Server error" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
