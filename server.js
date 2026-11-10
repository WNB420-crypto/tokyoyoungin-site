"use strict";
// TokyoYoungin site server. Runs on Bun. Postgres for data (Bun's built-in client), a volume for uploads, Stripe over fetch.
const http = require("node:http"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { SQL } = require("bun");

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, "data");
const PUB = path.join(__dirname, "public"), UP = path.join(DATA, "uploads");
const BASE = (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? "https://" + process.env.RAILWAY_PUBLIC_DOMAIN : "http://localhost:" + PORT)).replace(/\/$/, "");
const KEY = process.env.STRIPE_SECRET_KEY || "";
const SECURE = BASE.startsWith("https://");
const PRICE = 899, HALF_OFF = 400, SHIP = 599, MEMBER_OFF = 0.15, HR = 36e5, DAY = 864e5;
const SHIFTS = 3, SHIFT_CAP = 15, CRED_PER = 4;
const REWARDS = {
  pct5: { cost: 250, label: "5% off one order", uses: 1 },
  ship: { cost: 250, label: "Free shipping on one order", uses: 1 },
  pct10: { cost: 500, label: "10% off one order", uses: 1 },
  sub: { cost: 1000, label: "Half off next month's membership" },
  pct10x3: { cost: 1000, label: "10% off your next 3 orders", uses: 3 },
  shirt: { cost: 5000, label: "Free shirt of your choice", uses: 1 },
};
const REASONS = ["Spam or scam", "Harassment or hate", "False information", "Violence or threats", "Copyright", "Something else"];
const EXT = { mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4", webm: "video/webm", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const STATIC = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set"); process.exit(1); }
fs.mkdirSync(UP, { recursive: true });
const sql = new SQL({ url: process.env.DATABASE_URL, max: 10 });
// Queries are written with ? placeholders and converted to $1, $2 ...
const conv = s => { let i = 0; return s.replace(/\?/g, () => "$" + (++i)); };
const all = (s, ...a) => sql.unsafe(conv(s), a.map(v => v === undefined ? null : v));
const one = async (s, ...a) => (await all(s, ...a))[0];
const run = all;
// Timestamps are milliseconds stored as DOUBLE PRECISION so they come back as plain numbers.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, email TEXT UNIQUE, pass TEXT, role TEXT DEFAULT 'fan', created DOUBLE PRECISION, customer TEXT, sub_id TEXT, sub_status TEXT, paid INTEGER DEFAULT 0, sub_half INTEGER DEFAULT 0, pts INTEGER DEFAULT 0, earned INTEGER DEFAULT 0, spent INTEGER DEFAULT 0, intel INTEGER DEFAULT 0, day TEXT, slot TEXT, must_change INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(th TEXT PRIMARY KEY, user_id INTEGER, created DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, kind TEXT, title TEXT, cap TEXT, created DOUBLE PRECISION, tier TEXT, media TEXT, url TEXT, platform TEXT, color TEXT, views INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS votes(vid TEXT, post_id TEXT, v INTEGER, PRIMARY KEY(vid, post_id));
CREATE TABLE IF NOT EXISTS donations(id SERIAL PRIMARY KEY, post_id TEXT, cents INTEGER, ts DOUBLE PRECISION, name TEXT, session TEXT UNIQUE, user_id INTEGER);
CREATE TABLE IF NOT EXISTS reports(id SERIAL PRIMARY KEY, post_id TEXT, reason TEXT, details TEXT, ts DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS subs_free(email TEXT PRIMARY KEY, ts DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS updates(id SERIAL PRIMARY KEY, subj TEXT, msg TEXT, ts DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS ads(id SERIAL PRIMARY KEY, client TEXT, head TEXT, url TEXT, img TEXT, imps INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, active INTEGER DEFAULT 1, ts DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS products(id SERIAL PRIMARY KEY, name TEXT, cents INTEGER, img TEXT, shirt INTEGER DEFAULT 0, sizes TEXT, ts DOUBLE PRECISION);
CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY, session TEXT UNIQUE, user_id INTEGER, email TEXT, items TEXT, cents INTEGER, ship TEXT, ts DOUBLE PRECISION, shipped INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS coupons(id SERIAL PRIMARY KEY, user_id INTEGER, type TEXT, label TEXT, uses INTEGER);
CREATE TABLE IF NOT EXISTS visits(day TEXT, vid TEXT, hits INTEGER DEFAULT 0, PRIMARY KEY(day, vid));
CREATE TABLE IF NOT EXISTS shifts(id TEXT PRIMARY KEY, user_id INTEGER, started DOUBLE PRECISION, done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);`;
const TABLES = { // column lists, used to copy the old SQLite file across once
  users: ["id", "email", "pass", "role", "created", "customer", "sub_id", "sub_status", "paid", "sub_half", "pts", "earned", "spent", "intel", "day", "slot", "must_change"],
  sessions: ["th", "user_id", "created"], posts: ["id", "kind", "title", "cap", "created", "tier", "media", "url", "platform", "color", "views"],
  votes: ["vid", "post_id", "v"], donations: ["id", "post_id", "cents", "ts", "name", "session", "user_id"], reports: ["id", "post_id", "reason", "details", "ts"],
  subs_free: ["email", "ts"], updates: ["id", "subj", "msg", "ts"], ads: ["id", "client", "head", "url", "img", "imps", "clicks", "active", "ts"],
  products: ["id", "name", "cents", "img", "shirt", "sizes", "ts"], orders: ["id", "session", "user_id", "email", "items", "cents", "ship", "ts", "shipped"],
  coupons: ["id", "user_id", "type", "label", "uses"], visits: ["day", "vid", "hits"], shifts: ["id", "user_id", "started", "done"], kv: ["k", "v"],
};
const SERIALS = ["users", "donations", "reports", "updates", "ads", "products", "orders", "coupons"];

// small key/value settings are kept in memory and written through
const kvCache = new Map();
const kv = k => kvCache.has(k) ? kvCache.get(k) : null;
const setkv = async (k, v) => { kvCache.set(k, v); await run("INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", k, JSON.stringify(v)); };

const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const rid = (n = 16) => crypto.randomBytes(n).toString("hex");
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" });
const dayOf = ts => dayFmt.format(new Date(ts));
const today = () => dayOf(Date.now());
function hashPw(pw, salt = rid(16)) { return salt + ":" + crypto.scryptSync(pw, salt, 32).toString("hex"); }
function checkPw(pw, stored) { const [salt, h] = String(stored).split(":"); if (!h) return false; const a = Buffer.from(h, "hex"), b = crypto.scryptSync(pw, salt, 32); return a.length === b.length && crypto.timingSafeEqual(a, b); }
class Err extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const emailOk = e => typeof e === "string" && e.length < 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const validUrl = u => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch (e) { return false; } };

/* ---------- startup: schema, one-time copy from the old SQLite file, owner logins ---------- */
async function importSqlite() {
  const f = path.join(DATA, "site.db");
  if (!fs.existsSync(f) || (await one("SELECT COUNT(*)::int AS n FROM users")).n > 0 || (await one("SELECT k FROM kv WHERE k='migrated'"))) return;
  const { DatabaseSync } = require("node:sqlite"), old = new DatabaseSync(f, { readOnly: true }); let n = 0;
  await sql.begin(async tx => {
    for (const [t, cols] of Object.entries(TABLES)) {
      let rows = []; try { rows = old.prepare("SELECT * FROM " + t).all(); } catch (e) { continue; }
      for (const r of rows) {
        const use = cols.filter(c => c in r);
        await tx.unsafe(`INSERT INTO ${t}(${use.join(",")}) VALUES(${use.map((c, i) => "$" + (i + 1)).join(",")}) ON CONFLICT DO NOTHING`, use.map(c => r[c] === undefined ? null : r[c])); n++;
      }
    }
    for (const t of SERIALS) await tx.unsafe(`SELECT setval(pg_get_serial_sequence('${t}','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM ${t}),1))`);
    await tx.unsafe("INSERT INTO kv(k,v) VALUES('migrated',$1) ON CONFLICT(k) DO NOTHING", [JSON.stringify(Date.now())]);
  });
  old.close(); console.log("copied " + n + " rows from the old SQLite file into Postgres");
}
// Owner logins start from environment variables (OWNER_* for TokyoYoungin, ADMIN_* for the site manager).
// Each must be changed at first login. After that the person's own choice wins, until the variable is
// edited in Railway, which resets that login to the new starter values.
async function bootOwners() {
  for (const [slot, ek, pk] of [["owner", "OWNER_EMAIL", "OWNER_PASSWORD"], ["admin", "ADMIN_EMAIL", "ADMIN_PASSWORD"]]) {
    if (!process.env[ek] || !process.env[pk]) continue;
    const e = process.env[ek].trim().toLowerCase(), tag = sha(e + "\n" + process.env[pk]);
    const u = (await one("SELECT * FROM users WHERE slot=?", slot)) || (await one("SELECT * FROM users WHERE email=? AND role='owner'", e));
    if (u && kv("boot_" + slot) === tag) { if (!u.slot) await run("UPDATE users SET slot=? WHERE id=?", slot, u.id); continue; }
    if (u) {
      if (await one("SELECT id FROM users WHERE email=? AND id<>?", e, u.id)) { console.error("starter login for " + slot + " clashes with another account"); continue; }
      await run("UPDATE users SET email=?, pass=?, role='owner', slot=?, must_change=1 WHERE id=?", e, hashPw(process.env[pk]), slot, u.id);
      await run("DELETE FROM sessions WHERE user_id=?", u.id);
    } else await run("INSERT INTO users(email,pass,role,created,slot,must_change) VALUES(?,?,'owner',?,?,1) ON CONFLICT(email) DO UPDATE SET pass=excluded.pass, role='owner', slot=excluded.slot, must_change=1", e, hashPw(process.env[pk]), Date.now(), slot);
    await setkv("boot_" + slot, tag);
  }
}

// First merch drop: ten tees added once. Deleting one in Studio keeps it deleted.
const MERCH_SEED = [["bet", "BET"], ["hot97", "Hot 97"], ["mtv", "MTV"], ["vibe", "VIBE"], ["xxl", "XXL"], ["breakfast-club", "Breakfast Club"], ["complex", "Complex"], ["no-jumper", "No Jumper"], ["shade-room", "Shade Room"], ["worldstarhiphop", "WorldStarHipHop"]];
async function seedMerch() {
  if (kv("seed_merch_1")) return;
  for (const [file, brand] of MERCH_SEED) {
    const src = path.join(__dirname, "seed", "merch", file + ".jpg"), name = sha("merch1:" + file).slice(0, 24) + ".jpg";
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(UP, name));
    await run("INSERT INTO products(name,cents,img,shirt,sizes,ts) VALUES(?,?,?,1,?,?)", "TokyoYoungin " + brand + " Tee", 3200, name, "S,M,L,XL,2XL", Date.now());
  }
  await setkv("seed_merch_1", Date.now()); console.log("added the first ten tees to the store");
}

/* ---------- rate limit ---------- */
const hits = new Map();
function limit(ip, name, max, perMs = 60000) {
  const k = name + ":" + ip, now = Date.now(), arr = (hits.get(k) || []).filter(t => now - t < perMs);
  if (arr.length >= max) throw new Err(429, "Too many tries. Wait a minute and try again.");
  arr.push(now); hits.set(k, arr);
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 60000)) hits.delete(k); }, 60000).unref();

/* ---------- Stripe ---------- */
function enc(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === "object") enc(v, key, out); else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(v));
  }
  return out;
}
async function stripe(p, params, method = "POST") {
  if (!KEY) throw new Err(503, "Payments are not switched on yet.");
  const r = await fetch("https://api.stripe.com/v1/" + p, { method, headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/x-www-form-urlencoded" }, body: params ? enc(params).join("&") : undefined });
  const j = await r.json();
  if (!r.ok) { console.error("stripe", p, j.error && j.error.message); throw new Err(502, "The payment service returned an error. Try again in a moment."); }
  return j;
}
const whSecret = () => process.env.STRIPE_WEBHOOK_SECRET || (kv("wh") || {}).secret || "";
async function ensureWebhook() {
  if (!KEY || process.env.STRIPE_WEBHOOK_SECRET || !SECURE) return;
  const tag = sha(KEY + BASE).slice(0, 16), cur = kv("wh");
  if (cur && cur.tag === tag) return;
  try {
    // remove this site's older endpoints so Stripe only calls the current address
    const mine = new Set([new URL(BASE).host, "tokyoyoungin.com", "www.tokyoyoungin.com", process.env.RAILWAY_PUBLIC_DOMAIN, "site-production-85e4.up.railway.app"].filter(Boolean));
    const list = await stripe("webhook_endpoints?limit=100", null, "GET");
    for (const w of list.data || []) { let u; try { u = new URL(w.url); } catch (e) { continue; } if (u.pathname === "/stripe/webhook" && mine.has(u.host)) await stripe("webhook_endpoints/" + w.id, null, "DELETE").catch(() => {}); }
    const e = await stripe("webhook_endpoints", { url: BASE + "/stripe/webhook", enabled_events: ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"] });
    await setkv("wh", { tag, secret: e.secret, id: e.id }); console.log("stripe webhook registered for " + BASE);
  } catch (e) { console.error("could not register stripe webhook:", e.message); }
}
function verifyStripe(raw, header) {
  const secret = whSecret(); if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=")));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const exp = crypto.createHmac("sha256", secret).update(parts.t + "." + raw).digest("hex");
  const a = Buffer.from(exp), b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- points ---------- */
function dayState(u) { let d = null; try { d = JSON.parse(u.day); } catch (e) {} const k = today(); if (!d || d.k !== k) d = { k, shifts: 0, votes: 0, shares: 0, login: 0, tip: 0 }; return d; }
const saveDay = async (u, d) => { u.day = JSON.stringify(d); await run("UPDATE users SET day=? WHERE id=?", u.day, u.id); };
async function award(u, n) { if (!n) return; const pts = Math.max(0, u.pts + n); await run("UPDATE users SET pts=?, earned=earned+? WHERE id=?", pts, n > 0 ? n : 0, u.id); u.pts = pts; }
const isMember = u => !!u && (u.paid === 1 || u.role === "owner");
const publicAt = p => p.tier === "early" ? p.created + 48 * HR : p.created;
const locked = (p, u) => !isMember(u) && (p.tier === "members" || (p.tier === "early" && Date.now() < publicAt(p)));

/* ---------- live chat (memory only) ---------- */
let chat = [], chatSeq = 0;

/* ---------- http helpers ---------- */
function cookies(req) { const o = {}; (req.headers.cookie || "").split(";").forEach(p => { const i = p.indexOf("="); if (i > 0) { try { o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) {} } }); return o; }
const cookie = (n, v, age) => `${n}=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${SECURE ? "; Secure" : ""}`;
function readBody(req, max = 200000) { return new Promise((res, rej) => { let n = 0; const ch = []; req.on("data", c => { n += c.length; if (n > max) { rej(new Err(413, "That is too large.")); req.destroy(); } else ch.push(c); }); req.on("end", () => res(Buffer.concat(ch).toString("utf8"))); req.on("error", rej); }); }
function send(res, status, body, headers = {}) { const b = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body); res.writeHead(status, { "Content-Type": typeof body === "object" && !Buffer.isBuffer(body) ? "application/json" : "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", ...headers }); res.end(b); }
function serveFile(req, res, file, type, cache) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) return send(res, 404, "Not found");
    const h = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" }, m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (m && (m[1] || m[2])) {
      let s = m[1] ? +m[1] : st.size - +m[2], en = m[1] && m[2] ? +m[2] : st.size - 1;
      if (s < 0) s = 0; if (en >= st.size) en = st.size - 1;
      if (s > en) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...h, "Content-Range": `bytes ${s}-${en}/${st.size}`, "Content-Length": en - s + 1 });
      return fs.createReadStream(file, { start: s, end: en }).pipe(res);
    }
    res.writeHead(200, { ...h, "Content-Length": st.size });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- state for the page ---------- */
async function meOf(u) {
  if (!u) return null;
  const d = dayState(u);
  return { email: u.email, owner: u.role === "owner", mustChange: !!u.must_change, paid: isMember(u), subStatus: u.sub_status || "", subHalf: !!u.sub_half, pts: u.pts, intel: u.intel, day: d, coupons: await all("SELECT id,type,label,uses FROM coupons WHERE user_id=? AND uses>0 ORDER BY id", u.id) };
}
async function state(ctx) {
  const u = ctx.user;
  if (u && isMember(u)) { const d = dayState(u); if (!d.login) { d.login = 1; await saveDay(u, d); await award(u, 3); ctx.checkedIn = true; } }
  const tips = Object.fromEntries((await all("SELECT post_id, SUM(cents)::int AS c FROM donations GROUP BY post_id")).map(r => [r.post_id, r.c]));
  const vc = {}; (await all("SELECT post_id, v, COUNT(*)::int AS n FROM votes GROUP BY post_id, v")).forEach(r => { (vc[r.post_id] = vc[r.post_id] || {})[r.v] = r.n; });
  const posts = (await all("SELECT * FROM posts ORDER BY created DESC")).map(p => {
    const l = locked(p, u), o = { id: p.id, kind: p.kind, title: p.title, created: p.created, tier: p.tier, publicAt: publicAt(p), locked: l, color: p.color, views: p.views, likes: (vc[p.id] || {})[1] || 0, dislikes: (vc[p.id] || {})[-1] || 0, tips: tips[p.id] || 0 };
    if (!l) Object.assign(o, { cap: p.cap, media: p.media, url: p.url, platform: p.platform });
    return o;
  });
  return {
    me: await meOf(u), checkedIn: !!ctx.checkedIn, posts,
    votes: Object.fromEntries((await all("SELECT post_id, v FROM votes WHERE vid=?", ctx.vid)).map(r => [r.post_id, r.v])),
    ads: await all("SELECT id, client, head, img FROM ads WHERE active=1 ORDER BY id"),
    products: await all("SELECT id, name, cents, img, shirt, sizes FROM products ORDER BY id"),
    updates: await all("SELECT subj, msg, ts FROM updates ORDER BY ts DESC LIMIT 30"),
    live: kv("live") || { on: false }, social: kv("social") || {},
    counts: { list: (await one("SELECT COUNT(*)::int AS n FROM subs_free")).n, members: (await one("SELECT COUNT(*)::int AS n FROM users WHERE paid=1")).n },
    payments: !!KEY, price: PRICE, ship: SHIP, reasons: REASONS,
  };
}
function lastDays(n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(dayOf(Date.now() - i * DAY)); return [...new Set(out)]; }
async function studio() {
  const days = lastDays(91), since = Date.now() - 92 * DAY;
  const v = Object.fromEntries((await all("SELECT day, COUNT(*)::int AS n FROM visits GROUP BY day")).map(r => [r.day, r.n]));
  const dons = await all("SELECT post_id, cents, ts, name FROM donations WHERE ts>=? ORDER BY ts DESC", since);
  const dd = {}; dons.forEach(d => { const k = dayOf(d.ts); dd[k] = (dd[k] || 0) + d.cents; });
  return {
    days, visits: days.map(d => v[d] || 0), dons: days.map(d => dd[d] || 0), donations: dons,
    reports: await all("SELECT r.id, r.post_id, r.reason, r.details, r.ts, p.title FROM reports r LEFT JOIN posts p ON p.id=r.post_id ORDER BY r.ts DESC"),
    subsFree: await all("SELECT email, ts FROM subs_free ORDER BY ts DESC"),
    subsPaid: await all("SELECT email, created AS ts, sub_status FROM users WHERE paid=1 ORDER BY id DESC"),
    ads: await all("SELECT * FROM ads ORDER BY id DESC"),
    orders: (await all("SELECT id, email, items, cents, ship, ts, shipped FROM orders ORDER BY ts DESC LIMIT 200")).map(o => ({ ...o, items: JSON.parse(o.items || "[]"), ship: JSON.parse(o.ship || "null") })),
    points: await one("SELECT COALESCE(SUM(earned),0)::int AS earned, COALESCE(SUM(spent),0)::int AS spent FROM users"),
    unused: (await one("SELECT COUNT(*)::int AS n FROM coupons WHERE uses>0")).n, webhook: !!whSecret(),
  };
}

/* ---------- fan actions ---------- */
const needUser = ctx => { if (!ctx.user) throw new Err(401, "Log in or make an account first."); return ctx.user; };
const needMember = ctx => { const u = needUser(ctx); if (!isMember(u)) throw new Err(403, "This is for members."); return u; };
async function login(ctx, id) { const t = rid(32); await run("INSERT INTO sessions(th,user_id,created) VALUES(?,?,?)", sha(t), id, Date.now()); ctx.set.push(cookie("sid", t, 60 * 60 * 24 * 60)); }
function priceFor(p, u) { return isMember(u) ? Math.round(p.cents * (1 - MEMBER_OFF)) : p.cents; }

const act = {
  async register(ctx, b) {
    limit(ctx.ip, "auth", 8);
    const email = str(b.email, 200).toLowerCase(), pw = String(b.password || "");
    if (!emailOk(email)) throw new Err(400, "That email doesn't look right. Check it and try again.");
    if (pw.length < 8) throw new Err(400, "Use a password with at least 8 characters.");
    if (await one("SELECT id FROM users WHERE email=?", email)) throw new Err(409, "There is already an account with that email. Log in instead.");
    const r = await one("INSERT INTO users(email,pass,created) VALUES(?,?,?) RETURNING id", email, hashPw(pw), Date.now());
    await run("INSERT INTO subs_free(email,ts) VALUES(?,?) ON CONFLICT DO NOTHING", email, Date.now());
    await login(ctx, r.id); return { ok: true };
  },
  async login(ctx, b) {
    limit(ctx.ip, "auth", 8);
    const u = await one("SELECT * FROM users WHERE email=?", str(b.email, 200).toLowerCase());
    if (!u || !checkPw(String(b.password || ""), u.pass)) throw new Err(401, "Wrong email or password.");
    await login(ctx, u.id); return { ok: true };
  },
  async setLogin(ctx, b) {
    limit(ctx.ip, "auth", 8);
    const u = needUser(ctx); if (u.role !== "owner") throw new Err(403, "Owner only.");
    const name = str(b.name, 60).toLowerCase(), pw = String(b.password || "");
    if (!/^\S{3,60}$/.test(name)) throw new Err(400, "Pick a username or email with 3 to 60 characters and no spaces.");
    if (pw.length < 8) throw new Err(400, "Use a password with at least 8 characters.");
    if (u.must_change && checkPw(pw, u.pass)) throw new Err(400, "Pick a new password, not the starter one.");
    if (await one("SELECT id FROM users WHERE email=? AND id<>?", name, u.id)) throw new Err(409, "That username is taken. Pick another.");
    await run("UPDATE users SET email=?, pass=?, must_change=0 WHERE id=?", name, hashPw(pw), u.id);
    await run("DELETE FROM sessions WHERE user_id=?", u.id); await login(ctx, u.id); return { ok: true };
  },
  async logout(ctx) { const t = cookies(ctx.req).sid; if (t) await run("DELETE FROM sessions WHERE th=?", sha(t)); ctx.set.push(cookie("sid", "", 0)); return { ok: true }; },
  async free(ctx, b) {
    limit(ctx.ip, "free", 5);
    const email = str(b.email, 200).toLowerCase(); if (!emailOk(email)) throw new Err(400, "That email doesn't look right. Check it and try again.");
    await run("INSERT INTO subs_free(email,ts) VALUES(?,?) ON CONFLICT DO NOTHING", email, Date.now()); return { ok: true };
  },
  async vote(ctx, b) {
    limit(ctx.ip, "vote", 60);
    const p = await one("SELECT * FROM posts WHERE id=?", str(b.id, 40)), v = b.v === 1 ? 1 : b.v === -1 ? -1 : 0;
    if (!p || !v || locked(p, ctx.user)) throw new Err(400, "That post isn't available.");
    const cur = await one("SELECT v FROM votes WHERE vid=? AND post_id=?", ctx.vid, p.id); let gained = 0;
    if (cur && cur.v === v) await run("DELETE FROM votes WHERE vid=? AND post_id=?", ctx.vid, p.id);
    else {
      await run("INSERT INTO votes(vid,post_id,v) VALUES(?,?,?) ON CONFLICT(vid,post_id) DO UPDATE SET v=excluded.v", ctx.vid, p.id, v);
      const u = ctx.user; if (u && isMember(u)) { const d = dayState(u); if (d.votes < 3) { d.votes++; await saveDay(u, d); await award(u, 1); gained = 1; } }
    }
    return { ok: true, gained };
  },
  async seen(ctx, b) {
    limit(ctx.ip, "seen", 120);
    for (const id of (Array.isArray(b.posts) ? b.posts : []).slice(0, 50)) { const p = await one("SELECT * FROM posts WHERE id=?", String(id)); if (p && !locked(p, ctx.user)) await run("UPDATE posts SET views=views+1 WHERE id=?", p.id); }
    for (const id of (Array.isArray(b.ads) ? b.ads : []).slice(0, 20)) await run("UPDATE ads SET imps=imps+1 WHERE id=? AND active=1", Math.floor(Number(id)) || 0);
    return { ok: true };
  },
  async report(ctx, b) {
    limit(ctx.ip, "report", 5);
    const p = await one("SELECT id FROM posts WHERE id=?", str(b.id, 40)), reason = str(b.reason, 60), details = str(b.details, 400);
    if (!p) throw new Err(400, "That post isn't available.");
    if (!REASONS.includes(reason)) throw new Err(400, "Pick a reason for the report.");
    if (reason === "Something else" && details.length < 5) throw new Err(400, "Tell us what's wrong so the report can be reviewed.");
    await run("INSERT INTO reports(post_id,reason,details,ts) VALUES(?,?,?,?)", p.id, reason, details, Date.now()); return { ok: true };
  },
  async share(ctx) { const u = ctx.user; let gained = 0; if (u && isMember(u)) { const d = dayState(u); if (d.shares < 2) { d.shares++; await saveDay(u, d); await award(u, 2); gained = 2; } } return { ok: true, gained }; },
  async tip(ctx, b) {
    limit(ctx.ip, "pay", 10);
    const cents = Math.round(Number(b.amt) * 100), id = str(b.id, 40);
    if (!(cents >= 100 && cents <= 50000)) throw new Err(400, "Pick an amount between $1 and $500.");
    const p = id === "live" ? { id: "live", title: "the live stream" } : await one("SELECT id,title FROM posts WHERE id=?", id);
    if (!p) throw new Err(400, "That post isn't available.");
    const s = await stripe("checkout/sessions", { mode: "payment", submit_type: "donate", success_url: BASE + "/?done=tip", cancel_url: BASE + "/", customer_email: ctx.user && emailOk(ctx.user.email) ? ctx.user.email : undefined,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name: "Tip for TokyoYoungin", description: str(p.title, 120) } } }],
      metadata: { kind: "tip", post_id: p.id, name: str(b.name, 40), user_id: ctx.user ? ctx.user.id : "" } });
    return { url: s.url };
  },
  async subscribe(ctx) {
    limit(ctx.ip, "pay", 10);
    const u = needUser(ctx); if (u.paid) throw new Err(400, "You are already a member.");
    const s = await stripe("checkout/sessions", { mode: "subscription", success_url: BASE + "/?done=member", cancel_url: BASE + "/#join", client_reference_id: u.id,
      ...(u.customer ? { customer: u.customer } : emailOk(u.email) ? { customer_email: u.email } : {}),
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: PRICE, recurring: { interval: "month" }, product_data: { name: "TokyoYoungin membership" } } }],
      metadata: { kind: "sub", user_id: u.id }, subscription_data: { metadata: { user_id: u.id } } });
    return { url: s.url };
  },
  async cancel(ctx) {
    const u = needUser(ctx); if (!u.sub_id) throw new Err(400, "There is no membership to cancel.");
    await stripe("subscriptions/" + u.sub_id, { cancel_at_period_end: true });
    await run("UPDATE users SET sub_status='canceling' WHERE id=?", u.id); return { ok: true };
  },
  async checkout(ctx, b) {
    limit(ctx.ip, "pay", 10);
    const u = ctx.user, items = (Array.isArray(b.items) ? b.items : []).slice(0, 20), lines = [], meta = []; let sub = 0, shirtMax = 0;
    for (const it of items) {
      const p = await one("SELECT * FROM products WHERE id=?", Math.floor(Number(it.id)) || 0), q = Math.max(1, Math.min(10, Math.floor(Number(it.q) || 1)));
      if (!p) throw new Err(400, "Something in your cart is no longer for sale. Remove it and try again.");
      const sizes = (p.sizes || "").split(",").map(s => s.trim()).filter(Boolean), size = str(it.size, 12);
      if (sizes.length && !sizes.includes(size)) throw new Err(400, "Pick a size for " + p.name + ".");
      const unit = priceFor(p, u); sub += unit * q; if (p.shirt) shirtMax = Math.max(shirtMax, unit);
      lines.push({ quantity: q, price_data: { currency: "usd", unit_amount: unit, product_data: { name: p.name + (size ? " (" + size + ")" : "") } } });
      meta.push({ n: p.name, s: size, q, c: unit });
    }
    if (!lines.length) throw new Err(400, "Your cart is empty.");
    let ship = SHIP, off = 0, c = null;
    if (b.coupon) {
      c = u && await one("SELECT * FROM coupons WHERE id=? AND user_id=? AND uses>0", Math.floor(Number(b.coupon)) || 0, u.id);
      if (!c) throw new Err(400, "That reward isn't available.");
      if (c.type === "pct5") off = Math.round(sub * 0.05); if (c.type === "pct10" || c.type === "pct10x3") off = Math.round(sub * 0.1);
      if (c.type === "ship") ship = 0;
      if (c.type === "shirt") { if (!shirtMax) throw new Err(400, "Add a shirt to the cart to use the free shirt."); off = shirtMax; }
    }
    const params = { mode: "payment", success_url: BASE + "/?done=order", cancel_url: BASE + "/#merch", customer_email: u && emailOk(u.email) ? u.email : undefined, line_items: lines,
      shipping_address_collection: { allowed_countries: ["US"] },
      shipping_options: [{ shipping_rate_data: { type: "fixed_amount", display_name: ship ? "Shipping" : "Free shipping", fixed_amount: { amount: ship, currency: "usd" } } }],
      metadata: { kind: "order", user_id: u ? u.id : "", coupon: c ? c.id : "", items: JSON.stringify(meta).slice(0, 490) } };
    if (off > 0) { const cp = await stripe("coupons", { amount_off: Math.min(off, sub), currency: "usd", duration: "once", name: c.label.slice(0, 40) }); params.discounts = [{ coupon: cp.id }]; }
    const s = await stripe("checkout/sessions", params); return { url: s.url };
  },
  async redeem(ctx, b) {
    const u = needMember(ctx), r = REWARDS[b.r];
    if (!r) throw new Err(400, "That reward doesn't exist.");
    if (u.pts < r.cost) throw new Err(400, "You need " + r.cost + " points for that.");
    if (b.r === "sub") {
      if (u.sub_half) throw new Err(400, "Half off is already set for your next month.");
      if (!u.sub_id) throw new Err(400, "This reward needs an active paid membership.");
      const cp = await stripe("coupons", { amount_off: HALF_OFF, currency: "usd", duration: "once", name: "Detective Tokyo reward" });
      await stripe("subscriptions/" + u.sub_id, { discounts: [{ coupon: cp.id }] });
      await run("UPDATE users SET sub_half=1 WHERE id=?", u.id);
    } else await run("INSERT INTO coupons(user_id,type,label,uses) VALUES(?,?,?,?)", u.id, b.r, r.label, r.uses);
    await run("UPDATE users SET pts=pts-?, spent=spent+? WHERE id=?", r.cost, r.cost, u.id); return { ok: true };
  },
  async gameStart(ctx) {
    const u = needMember(ctx), d = dayState(u);
    if (d.shifts >= SHIFTS) throw new Err(400, "That's all " + SHIFTS + " shifts for today. Come back tomorrow.");
    d.shifts++; await saveDay(u, d); const id = rid(12); await run("INSERT INTO shifts(id,user_id,started) VALUES(?,?,?)", id, u.id, Date.now()); return { id };
  },
  async gameEnd(ctx, b) {
    const u = needMember(ctx), s = await one("UPDATE shifts SET done=1 WHERE id=? AND user_id=? AND done=0 RETURNING started", str(b.id, 40), u.id);
    if (!s) throw new Err(400, "That shift already ended.");
    const cred = Math.max(-100, Math.min(100, Math.floor(Number(b.cred) || 0))), secs = (Date.now() - s.started) / 1000;
    let pts = Math.max(-10, Math.min(SHIFT_CAP, Math.floor(cred / CRED_PER)));
    if (pts > 0 && (secs < 40 || secs > 600)) pts = 0; // a full shift takes 45 seconds
    const intel = Math.max(0, Math.min(2, Math.floor(Number(b.intel) || 0)));
    await award(u, pts); await run("UPDATE users SET intel=intel+? WHERE id=?", intel, u.id); return { pts };
  },
  async chat(ctx, b) {
    limit(ctx.ip, "chat", 20);
    const u = needUser(ctx), text = str(b.text, 140), live = kv("live");
    if (!live || !live.on) throw new Err(400, "Chat opens when the stream starts."); if (!text) throw new Err(400, "Type a message first.");
    chat.push({ id: ++chatSeq, who: u.role === "owner" ? "TokyoYoungin" : u.email.split("@")[0].slice(0, 16), text, owner: u.role === "owner" }); if (chat.length > 200) chat.shift();
    return { ok: true };
  },
};

/* ---------- owner actions ---------- */
const colors = ["#fdb913", "#ffd9ec", "#dfe9ff", "#d9fff8", "#ffe9a8"];
const safeFile = f => /^[a-f0-9]{24}\.[a-z0-9]{2,5}$/.test(f || "") && fs.existsSync(path.join(UP, f));
const dropFile = f => { if (f && /^[a-f0-9]{24}\.[a-z0-9]{2,5}$/.test(f)) fs.unlink(path.join(UP, f), () => {}); };
const int = v => Math.floor(Number(v)) || 0;
const own = {
  async post(ctx, b) {
    const kind = ["video", "photo", "embed", "text"].includes(b.kind) ? b.kind : "text", title = str(b.title, 90), tier = ["public", "early", "members"].includes(b.tier) ? b.tier : "public";
    if (!title) throw new Err(400, "Give the post a title first.");
    let media = null, url = null, platform = null;
    if (kind === "video" || kind === "photo") { if (!safeFile(b.media)) throw new Err(400, "Upload the file first."); media = b.media; }
    if (kind === "embed") { url = str(b.url, 500); platform = str(b.platform, 20); if (!validUrl(url) || !["YouTube", "Instagram", "TikTok", "Facebook"].includes(platform)) throw new Err(400, "Paste a full link from YouTube, Instagram, TikTok or Facebook."); }
    const n = (await one("SELECT COUNT(*)::int AS n FROM posts")).n;
    await run("INSERT INTO posts(id,kind,title,cap,created,tier,media,url,platform,color) VALUES(?,?,?,?,?,?,?,?,?,?)", "p" + rid(6), kind, title, str(b.cap, 500), Date.now(), tier, media, url, platform, colors[n % colors.length]);
    return { ok: true };
  },
  async delPost(ctx, b) { const p = await one("SELECT * FROM posts WHERE id=?", str(b.id, 40)); if (p) { dropFile(p.media); await run("DELETE FROM posts WHERE id=?", p.id); await run("DELETE FROM reports WHERE post_id=?", p.id); await run("DELETE FROM votes WHERE post_id=?", p.id); } return { ok: true }; },
  async repKeep(ctx, b) { await run("DELETE FROM reports WHERE id=?", int(b.id)); return { ok: true }; },
  async repRemove(ctx, b) { const r = await one("SELECT post_id FROM reports WHERE id=?", int(b.id)); if (r) await own.delPost(ctx, { id: r.post_id }); return { ok: true }; },
  async ad(ctx, b) {
    const client = str(b.client, 60), head = str(b.head, 80), url = str(b.url, 600);
    if (!client || !head) throw new Err(400, "Add the client name and the ad line."); if (!validUrl(url)) throw new Err(400, "The referral link needs to be a full web address starting with https://");
    await run("INSERT INTO ads(client,head,url,img,ts) VALUES(?,?,?,?,?)", client, head, url, safeFile(b.img) ? b.img : null, Date.now()); return { ok: true };
  },
  async adToggle(ctx, b) { await run("UPDATE ads SET active=1-active WHERE id=?", int(b.id)); return { ok: true }; },
  async adDel(ctx, b) { const a = await one("SELECT img FROM ads WHERE id=?", int(b.id)); if (a) dropFile(a.img); await run("DELETE FROM ads WHERE id=?", int(b.id)); return { ok: true }; },
  async live(ctx, b) {
    if (!b.on) { await setkv("live", { on: false }); chat = []; return { ok: true }; }
    const url = str(b.url, 500); if (url && !validUrl(url)) throw new Err(400, "The stream link needs to start with https://");
    await setkv("live", { on: true, title: str(b.title, 80) || "TokyoYoungin live", url, started: Date.now() }); chat = []; return { ok: true };
  },
  async chatDel(ctx, b) { chat = chat.filter(m => m.id !== Number(b.id)); return { ok: true }; },
  async update(ctx, b) { const s = str(b.subj, 80), m = str(b.msg, 600); if (!s || !m) throw new Err(400, "Add a headline and a message."); await run("INSERT INTO updates(subj,msg,ts) VALUES(?,?,?)", s, m, Date.now()); return { ok: true }; },
  async social(ctx, b) { const o = {}; for (const k of ["YouTube", "Instagram", "TikTok", "Facebook"]) { const v = str((b || {})[k], 300); if (v && !validUrl(v)) throw new Err(400, k + " link needs to start with https://"); o[k] = v; } await setkv("social", o); return { ok: true }; },
  async product(ctx, b) {
    const name = str(b.name, 60), cents = Math.round(Number(b.price) * 100);
    if (!name) throw new Err(400, "Give the product a name."); if (!(cents >= 100 && cents <= 100000)) throw new Err(400, "Set a price between $1 and $1,000.");
    const sizes = str(b.sizes, 80).split(",").map(s => s.trim().slice(0, 12)).filter(Boolean).join(",");
    await run("INSERT INTO products(name,cents,img,shirt,sizes,ts) VALUES(?,?,?,?,?,?)", name, cents, safeFile(b.img) ? b.img : null, b.shirt ? 1 : 0, sizes, Date.now()); return { ok: true };
  },
  async productDel(ctx, b) { const p = await one("SELECT img FROM products WHERE id=?", int(b.id)); if (p) dropFile(p.img); await run("DELETE FROM products WHERE id=?", int(b.id)); return { ok: true }; },
  async shipped(ctx, b) { await run("UPDATE orders SET shipped=1-shipped WHERE id=?", int(b.id)); return { ok: true }; },
};

/* ---------- Stripe webhook ---------- */
async function onStripe(ev) {
  const o = ev.data.object;
  if (ev.type === "checkout.session.completed") {
    const m = o.metadata || {}, uid = int(m.user_id) || null, u = uid && await one("SELECT * FROM users WHERE id=?", uid);
    if (m.kind === "tip" && o.payment_status === "paid") {
      const r = await one("INSERT INTO donations(post_id,cents,ts,name,session,user_id) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING id", m.post_id || null, o.amount_total, Date.now(), m.name || "", o.id, uid);
      if (r && u && isMember(u)) { const d = dayState(u); if (!d.tip) { d.tip = 1; await saveDay(u, d); await award(u, 5); } }
    } else if (m.kind === "sub" && u) {
      await run("UPDATE users SET paid=1, sub_id=?, customer=?, sub_status='active' WHERE id=?", o.subscription, o.customer, u.id);
    } else if (m.kind === "order" && o.payment_status === "paid") {
      const sd = o.shipping_details || (o.collected_information && o.collected_information.shipping_details) || null;
      const r = await one("INSERT INTO orders(session,user_id,email,items,cents,ship,ts) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING id", o.id, uid, (o.customer_details && o.customer_details.email) || "", m.items || "[]", o.amount_total, JSON.stringify(sd), Date.now());
      if (r && m.coupon) await run("UPDATE coupons SET uses=uses-1 WHERE id=? AND uses>0", int(m.coupon));
    }
  } else if (ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
    const u = await one("SELECT * FROM users WHERE sub_id=?", o.id); if (!u) return;
    const on = ev.type !== "customer.subscription.deleted" && ["active", "trialing", "past_due"].includes(o.status);
    const hasDiscount = !!(o.discount || (o.discounts && o.discounts.length));
    await run("UPDATE users SET paid=?, sub_status=?, sub_half=?, sub_id=? WHERE id=?", on ? 1 : 0, on ? (o.cancel_at_period_end ? "canceling" : "active") : "ended", on && hasDiscount ? 1 : 0, on ? o.id : null, u.id);
  }
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), ctx = { req, set: [], ip: (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?" };
  let p = url.pathname; try { p = decodeURIComponent(p); } catch (e) {}
  const json = (status, body) => send(res, status, body, { "Cache-Control": "no-store", ...(ctx.set.length ? { "Set-Cookie": ctx.set } : {}) });
  try {
    if (p === "/health") return send(res, 200, "ok");
    if (p === "/stripe/webhook" && req.method === "POST") {
      const raw = await readBody(req, 1e6);
      if (!verifyStripe(raw, req.headers["stripe-signature"])) return send(res, 400, "bad signature");
      await onStripe(JSON.parse(raw)); return send(res, 200, "ok");
    }
    const ck = cookies(req);
    ctx.vid = /^[a-f0-9]{32}$/.test(ck.vid || "") ? ck.vid : null;
    if (!ctx.vid) { ctx.vid = rid(16); ctx.set.push(cookie("vid", ctx.vid, 60 * 60 * 24 * 400)); }
    if (ck.sid) { const s = await one("SELECT user_id FROM sessions WHERE th=?", sha(ck.sid)); if (s) ctx.user = await one("SELECT * FROM users WHERE id=?", s.user_id); }
    const isOwner = !!ctx.user && ctx.user.role === "owner", owner = isOwner && !ctx.user.must_change;
    const ownerOnly = () => { throw new Err(403, isOwner ? "Set your own username and password first." : "Owner only."); };

    if (req.method === "GET" || req.method === "HEAD") {
      if (p === "/" || p === "/index.html") {
        await run("INSERT INTO visits(day,vid,hits) VALUES(?,?,1) ON CONFLICT(day,vid) DO UPDATE SET hits=visits.hits+1", today(), ctx.vid);
        return send(res, 200, fs.readFileSync(path.join(PUB, "index.html")), { "Content-Type": STATIC[".html"], "Cache-Control": "no-cache", ...(ctx.set.length ? { "Set-Cookie": ctx.set } : {}) });
      }
      if (p === "/api/state") return json(200, await state(ctx));
      if (p === "/api/chat") { const after = Number(url.searchParams.get("after")) || 0; return json(200, { live: kv("live") || { on: false }, msgs: chat.filter(m => m.id > after), ids: chat.map(m => m.id) }); }
      if (p === "/api/owner/data") { if (!owner) ownerOnly(); return json(200, await studio()); }
      if (p.startsWith("/go/")) { const a = await one("UPDATE ads SET clicks=clicks+1 WHERE id=? RETURNING url", int(p.slice(4))); if (!a) return send(res, 404, "Not found"); res.writeHead(302, { Location: a.url, "Cache-Control": "no-store" }); return res.end(); }
      if (p.startsWith("/media/")) {
        const f = p.slice(7); if (!/^[a-f0-9]{24}\.[a-z0-9]{2,5}$/.test(f)) return send(res, 404, "Not found");
        const post = await one("SELECT * FROM posts WHERE media=?", f); if (post && locked(post, ctx.user)) return send(res, 403, "Members only");
        return serveFile(req, res, path.join(UP, f), EXT[f.split(".")[1]] || "application/octet-stream", post ? "private, max-age=3600" : "public, max-age=86400");
      }
      const file = path.normalize(path.join(PUB, p)); if (!file.startsWith(PUB + path.sep)) return send(res, 404, "Not found");
      return serveFile(req, res, file, STATIC[path.extname(file)] || "application/octet-stream", path.extname(file) === ".js" ? "no-cache" : "public, max-age=86400");
    }
    // writes: same-origin only
    const origin = req.headers.origin; if (origin && new URL(origin).host !== req.headers.host) throw new Err(403, "Blocked.");
    if (req.method === "PUT" && p === "/api/owner/upload") {
      // Files arrive in pieces: the first call makes the file, later calls (with ?file=) add to it.
      if (!owner) ownerOnly();
      let name = String(url.searchParams.get("file") || "");
      if (name) { if (!safeFile(name)) throw new Err(400, "That upload was not found. Start again."); }
      else { const ext = String(url.searchParams.get("ext") || "").toLowerCase(); if (!EXT[ext]) throw new Err(400, "That file type isn't supported. Use MP4, MOV, WEBM, JPG, PNG, WEBP or GIF."); name = rid(12) + "." + ext; }
      const dest = path.join(UP, name), chunks = []; let n = 0;
      await new Promise((ok, bad) => { req.on("data", c => { n += c.length; if (n > 40e6) { req.destroy(); bad(new Err(413, "That piece is too large.")); } else chunks.push(c); }); req.on("end", ok); req.on("error", bad); });
      const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0, off = Number(url.searchParams.get("offset")) || 0;
      if (off !== size) { if (off + n === size) return json(200, { file: name, size }); throw new Err(409, "The upload got out of order. Start it again."); } // a repeated piece is fine
      if (size + n > 3e9) { fs.unlink(dest, () => {}); throw new Err(413, "That file is larger than 3 GB."); }
      await fs.promises.appendFile(dest, Buffer.concat(chunks));
      return json(200, { file: name, size: size + n });
    }
    if (req.method === "POST" && p.startsWith("/api/")) {
      const body = JSON.parse((await readBody(req)) || "{}"), parts = p.split("/");
      if (parts[2] === "owner") { if (!owner) ownerOnly(); const fn = own[parts[3]]; if (!fn) throw new Err(404, "Not found"); return json(200, await fn(ctx, body)); }
      const fn = act[parts[2]]; if (!fn) throw new Err(404, "Not found");
      return json(200, await fn(ctx, body));
    }
    send(res, 404, "Not found");
  } catch (e) {
    if (!(e instanceof Err)) console.error(req.method, p, e);
    if (!res.headersSent) json(e.status || 500, { error: e instanceof Err ? e.message : "Something went wrong on our side. Try again." });
  }
});

(async () => {
  for (const stmt of SCHEMA.split(";").map(s => s.trim()).filter(Boolean)) await sql.unsafe(stmt);
  await importSqlite();
  for (const r of await all("SELECT k, v FROM kv")) { try { kvCache.set(r.k, JSON.parse(r.v)); } catch (e) {} }
  await bootOwners();
  await seedMerch();
  server.listen(PORT, () => { console.log("TokyoYoungin site on " + BASE + " · payments " + (KEY ? "on" : "off") + " · Postgres · uploads in " + UP); ensureWebhook(); });
})().catch(e => { console.error("startup failed:", e); process.exit(1); });
