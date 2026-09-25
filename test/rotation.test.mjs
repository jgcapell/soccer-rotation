// Simulates seasons with random attendance and mid-game changes, auto-accepting
// every suggestion, and checks the rotation rules and season fairness.
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const logic = html.split("// ==LOGIC START==")[1].split("// ==LOGIC END==")[0];
const factory = new Function(logic + "; return { setS: v => (S = v), suggest, seasonStats, quarterContext };");
const L = factory();

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const names = ["Bennett","Trainor","Pierson","Mila","James","Levi","Memphis","Teddy","Hudson","Nora"];
let failures = 0, worstSpread = 0;

for (let season = 0; season < 200; season++) {
  const S = { players: names.map((n, i) => ({ id: "p" + i, name: n, active: true })), games: [] };
  L.setS(S);
  for (let gi = 0; gi < 9; gi++) {
    const att = S.players.map(p => p.id).filter(() => rand() > 0.15);
    const g = { id: "g" + gi, status: "in_progress", mode: "live", attendance: [...att], available: [...att], quarters: [], manualPlayed: {} };
    S.games.push(g);
    for (let q = 0; q < 8; q++) {
      if (rand() < 0.08 && g.available.length > 5) g.available.splice(Math.floor(rand() * g.available.length), 1); // injury
      const A = [...g.available];
      const { ctx, remainingInHalf } = L.quarterContext(g, q, A);
      const s = L.suggest(g, q, A);
      const on = new Set(s.lineup);
      if (s.lineup.length !== Math.min(4, A.length)) { failures++; console.log("size", season, gi, q); }
      for (const id of A) if (!on.has(id)) {
        if (ctx[id].streak >= 2) { failures++; console.log("3rd sit", season, gi, q, s.note); }
        if (remainingInHalf === 0 && ctx[id].playedHalf === 0) { failures++; console.log("half", season, gi, q, s.note); }
      }
      g.quarters.push({ available: A, lineup: s.lineup });
    }
    g.status = "final";
  }
  const st = L.seasonStats(S);
  const bals = Object.values(st).filter(s => s.avail).map(s => s.balance);
  worstSpread = Math.max(worstSpread, Math.max(...bals) - Math.min(...bals));
}
console.log("rule violations:", failures);
console.log("worst end-of-season spread vs fair share (quarters):", worstSpread.toFixed(2));
if (failures) process.exit(1);
