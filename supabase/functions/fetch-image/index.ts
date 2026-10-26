// Henter op til 3 billeder fra et steds hjemmeside eller blog og gemmer dem på stedet.
// Kun for medlemmer af en andel (tjekkes med brugerens eget login). Billederne gemmes som "Alle" og tilhører brugerens andel.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const UA = "Mozilla/5.0 (compatible; VoresBolnuevo/1.0)";

function abs(u: string, base: string) { try { return new URL(u.replace(/&amp;/g, "&"), base).href; } catch { return null; } }
function hostOf(u: string) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }

function candidates(html: string, base: string): string[] {
  const out: string[] = [];
  const add = (u: string | null) => { if (u && /^https?:/.test(u) && !out.includes(u)) out.push(u); };
  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*>/gi)) {
    const c = m[0].match(/content=["']([^"']+)/i); if (c) add(abs(c[1], base));
  }
  for (const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi)) add(abs(m[1], base));
  const imgs: [string, number][] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = (tag.match(/\sdata-src=["']([^"']+)/i) || tag.match(/\ssrc=["']([^"']+)/i) || [])[1];
    if (!src || src.startsWith("data:")) continue;
    const alt = (tag.match(/alt=["']([^"']*)/i) || [])[1] || "";
    if (/logo|icon|favicon|sprite|avatar|badge|flag|pixel/i.test(src + " " + alt)) continue;
    if (/\.svg(\?|$)|\.gif(\?|$)/i.test(src)) continue;
    const w = +((tag.match(/(?:data-eio-rwidth|width)=["']?(\d+)/i) || [])[1] || 0);
    if (w && w < 400) continue;
    const score = (/\.jpe?g|\.webp/i.test(src) ? 2 : 0) + (w >= 800 ? 1 : 0);
    const a = abs(src, base); if (a) imgs.push([a, score]);
  }
  imgs.sort((x, y) => y[1] - x[1]).forEach((x) => add(x[0]));
  return out;
}

async function get(u: string, ms = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(u, { headers: { "User-Agent": UA, "Accept-Language": "es,en;q=0.8" }, redirect: "follow", signal: c.signal }); }
  finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const { id, max } = await req.json();
    const auth = req.headers.get("Authorization") || "";
    const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!u || !u.user) return json({ error: "Log ind først." }, 401);
    const mem = await user.from("members").select("andel_id").eq("user_id", u.user.id).limit(1);
    const andel = mem.data && mem.data[0] && mem.data[0].andel_id;
    if (!andel) return json({ error: "Kun for andelshavere og deres gæster." }, 403);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Stedet skal kunne ses af brugeren (læses med brugerens eget login)
    const pr = await user.from("places").select("id,website,link").eq("id", id).single();
    if (pr.error || !pr.data) return json({ error: "Stedet findes ikke." }, 404);
    const p = pr.data;
    const sources = [p.website, p.link].filter((s: string | null) => s && /^https?:/.test(s) && !/google\.[a-z.]+\/maps|goo\.gl|maps\.app/i.test(s));
    if (!sources.length) return json({ error: "Stedet har ingen hjemmeside eller blog-link at hente fra." }, 400);

    const want = Math.min(Math.max(+max || 3, 1), 5);
    const saved: string[] = []; let credit = "";
    for (const src of sources) {
      if (saved.length >= want) break;
      let html = "";
      try { const r = await get(src); if (!r.ok) continue; html = (await r.text()).slice(0, 3_000_000); } catch { continue; }
      for (const img of candidates(html, src)) {
        if (saved.length >= want) break;
        try {
          const r = await get(img, 15000); if (!r.ok) continue;
          const type = (r.headers.get("content-type") || "").split(";")[0];
          if (!/^image\/(jpeg|png|webp)$/.test(type)) continue;
          const buf = new Uint8Array(await r.arrayBuffer());
          if (buf.length < 15_000 || buf.length > 8_000_000) continue;
          const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
          const path = `${andel}/${id}/web-${Date.now().toString(36)}${saved.length}.${ext}`;
          const up = await admin.storage.from("photos").upload(path, buf, { contentType: type, upsert: false });
          if (up.error) continue;
          saved.push(path); credit = credit || hostOf(src);
        } catch { /* næste billede */ }
      }
    }
    if (!saved.length) return json({ error: "Fandt ingen brugbare billeder på siden." }, 404);
    const ins = await admin.from("photos").insert(saved.map((path, i) => ({ kind: "place", target: id, path, andel_id: andel, owner: u.user.id, visibility: "alle", faces: false, credit, sort: 200 + i })));
    if (ins.error) return json({ error: ins.error.message }, 500);
    return json({ added: saved.length, photos: saved, credit });
  } catch (e) {
    return json({ error: String(e && (e as Error).message || e) }, 500);
  }
});
