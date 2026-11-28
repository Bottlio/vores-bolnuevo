// Udetemperatur fra hotellets Netatmo-vejrstation "Laderita" (delt af Ole, andel 105-047, med Christians konto).
// Svar: { t: 16.4, hum: 64, min: 12.1, max: 19.0, at: <ms for målingen> } eller { error }.
// Målingen gemmes og hentes højst hvert 10. minut. Adgangsnøglen (3 timer) genbruges, til den udløber;
// fornyelsesnøglen skifter ved hver fornyelse og gemmes i databasen (secret_set_srv "netatmo_refresh").
// Første fornyelsesnøgle kommer fra secret NETATMO_REFRESH_TOKEN (sat af Christian).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const STATION = "70:ee:50:bd:20:c2";
const CACHE_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const get = async (k: string) => (await sb.rpc("secret_get_srv", { p_name: k })).data as string | null;
  const set = (k: string, v: string) => sb.rpc("secret_set_srv", { p_name: k, p_value: v });

  // 1) Gemt måling, der er frisk nok
  try { const last = JSON.parse((await get("netatmo_last")) || "null"); if (last && Date.now() - last.fetched < CACHE_MS && "hum" in last) return J({ t: last.t, hum: last.hum, min: last.min, max: last.max, at: last.at, cached: true }); } catch { /* */ }

  const id = Deno.env.get("NETATMO_CLIENT_ID"), secret = Deno.env.get("NETATMO_CLIENT_SECRET");
  if (!id || !secret) return J({ error: "Nøglerne til Netatmo mangler" }, 500);

  // 2) Adgangsnøgle: genbrug den gemte, ellers forny
  let access: string | null = null;
  try { const a = JSON.parse((await get("netatmo_access")) || "null"); if (a && a.exp - Date.now() > 60 * 1000) access = a.token; } catch { /* */ }
  if (!access) {
    const refresh = (await get("netatmo_refresh")) || Deno.env.get("NETATMO_REFRESH_TOKEN");
    if (!refresh) return J({ error: "Fornyelsesnøglen til Netatmo mangler" }, 500);
    const r = await fetch("https://api.netatmo.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: id, client_secret: secret }) });
    const tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.access_token) return J({ error: "Netatmo afviste nøglen", status: r.status, detail: String(tok.error || "").slice(0, 80) }, 502);
    access = tok.access_token;
    await set("netatmo_access", JSON.stringify({ token: access, exp: Date.now() + (tok.expires_in || 10800) * 1000 }));
    if (tok.refresh_token) await set("netatmo_refresh", tok.refresh_token);
  }

  // 3) Hent målingen fra udemodulet
  const s = await fetch("https://api.netatmo.com/api/getstationsdata?device_id=" + encodeURIComponent(STATION), { headers: { Authorization: "Bearer " + access } });
  const d = await s.json().catch(() => ({}));
  if (!s.ok) { if (s.status === 403 || s.status === 401) await set("netatmo_access", "null"); return J({ error: "Netatmo svarede ikke", status: s.status }, 502); }
  const dev = (d.body?.devices || [])[0];
  const out = (dev?.modules || []).find((m: Record<string, unknown>) => m.type === "NAModule1");
  const dd = out?.dashboard_data;
  if (!dd || typeof dd.Temperature !== "number") return J({ error: "Ingen udemåling", reachable: out?.reachable ?? null }, 502);
  const res = { t: dd.Temperature, hum: dd.Humidity ?? null, min: dd.min_temp ?? null, max: dd.max_temp ?? null, at: (dd.time_utc || 0) * 1000, fetched: Date.now() };
  await set("netatmo_last", JSON.stringify(res));
  return J({ t: res.t, hum: res.hum, min: res.min, max: res.max, at: res.at, cached: false });
});
