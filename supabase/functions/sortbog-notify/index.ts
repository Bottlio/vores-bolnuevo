// Besked fra den sorte bog.
// { action: "pubkey" }          → den offentlige nøgle til push-beskeder (nøglerne laves første gang og gemmes i databasen)
// { action: "new", id }         → push-besked til drift og administrator, der har slået beskeder til; ved røde sager også en mail (Resend)
// { action: "event", id }       → en ny linje i sagens tråd (kommentar, statusskift, rettelse): push til dem, der følger sagen
//                                  · "Håndværker skal tilkaldes" også til dem, der bestiller håndværkere
//                                  · melderens rettelser kun til drift; rettet til rød giver også mail
//                                  · melderen lukker selv sin sag: også til drift
// { action: "test" }             → en prøvebesked til den, der kalder
// Mails om røde sager går til Christian med [TEST], så længe den sorte bog er i test (sæt secret SORTBOG_LIVE=1 for at sende til kontoret)
// Beskeder og mails linker direkte til sagen: APP?menu=test#sortbog-<id>[/kommentarer]
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const J = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const APP = "https://bottlio.github.io/vores-bolnuevo/";
const MAIL_TO = Deno.env.get("SORTBOG_MAIL_TO") || "kontakt@bolnuevo.dk";
const MAIL_FROM = Deno.env.get("SORTBOG_MAIL_FROM") || "Den sorte bog <noreply@bottlio.dk>";
const PRIO: Record<string, string> = { rod: "Rød – haster", gul: "Gul", gron: "Grøn" };
const STATUS: Record<string, string> = { ny: "Ny", igang: "I gang", venter: "Afventer · Håndværker skal tilkaldes", hvbestilt: "Afventer · Håndværker bestilt", varer: "Afventer · Varer bestilt", bestilt: "Afventer · Bestilt", loest: "Løst" };
const FIELDS: Record<string, string> = { sted: "stedet", hvad: "hvad det drejer sig om", beskrivelse: "beskrivelsen", prioritet: "prioriteten", billeder: "billederne" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const caseUrl = (id: unknown, tab = "") => APP + "?menu=test#sortbog-" + String(id) + (tab ? "/" + tab : "");
type Sub = { endpoint: string; p256dh: string; auth: string; user_id?: string };
type Row = Record<string, unknown>;
const whereOf = (d: Row) => d.where_kind === "lejlighed" ? "Lejl. " + (d.where_lejl || "?") : d.where_kind === "udstyr" ? "Udstyr: " + (d.where_text || "") : String(d.where_text || "Fællesområde");
const joinDa = (a: string[]) => a.length < 2 ? (a[0] || "") : a.slice(0, -1).join(", ") + " og " + a[a.length - 1];

async function keys(sb: ReturnType<typeof createClient>) {
  let pub = (await sb.rpc("secret_get_srv", { p_name: "vapid_public" })).data as string | null;
  let priv = (await sb.rpc("secret_get_srv", { p_name: "vapid_private" })).data as string | null;
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    await sb.rpc("secret_set_srv", { p_name: "vapid_public", p_value: k.publicKey });
    await sb.rpc("secret_set_srv", { p_name: "vapid_private", p_value: k.privateKey });
    pub = (await sb.rpc("secret_get_srv", { p_name: "vapid_public" })).data as string;
    priv = (await sb.rpc("secret_get_srv", { p_name: "vapid_private" })).data as string;
  }
  webpush.setVapidDetails("mailto:kontakt@bolnuevo.dk", pub!, priv!);
  return pub!;
}

async function push(sb: ReturnType<typeof createClient>, subs: Sub[], msg: Row) {
  let ok = 0, gone = 0;
  const seen = new Set<string>();
  for (const s of subs) {
    if (seen.has(s.endpoint)) continue; seen.add(s.endpoint);
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 86400 }); ok++; }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); gone++; } }
  }
  return { ok, gone };
}

// Den sorte bog er i test (Christian 25/11 2026): der må IKKE sendes mails til kontoret.
// Under testen går mailen i stedet til Christian med [TEST] foran emnet.
// Mail til kontoret sendes kun, hvis SORTBOG_LIVE=1 er sat som secret, når den sorte bog går live.
const LIVE = Deno.env.get("SORTBOG_LIVE") === "1";
const TEST_TO = Deno.env.get("SORTBOG_TEST_MAIL_TO") || "c" + "@sorgenfrey.net";
async function redMail(d: Row, title: string, who: string) {
  const to = LIVE ? MAIL_TO : TEST_TO, pre = LIVE ? "" : "[TEST] ";
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return "ikke sendt (ingen nøgle)";
  const where = whereOf(d), url = caseUrl(d.id);
  const html = '<div style="font-family:Arial,sans-serif;max-width:560px;border:1px solid #ddd;border-radius:8px;padding:18px">' +
    (LIVE ? "" : '<p style="color:#b3402f;font-weight:bold;margin:0 0 10px">TEST – denne sag er oprettet i testmiljøet og gælder ikke. Mailen er kun sendt til dig, ikke til kontoret.</p>') +
    '<h2 style="color:#b3402f;margin:0 0 10px">' + esc(title) + "</h2>" +
    "<p><b>Hvor:</b> " + esc(where) + (d.item ? "<br><b>Hvad:</b> " + esc(d.item) : "") + "<br><b>" + esc(who) + "</b></p>" +
    '<p style="white-space:pre-wrap">' + esc(d.description) + "</p>" +
    '<p><a href="' + esc(url) + '" style="color:#0f5c6b;font-weight:bold">Åbn sagen i appen</a> – her kan du også se billederne.</p></div>';
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject: pre + "Rød sag i den sorte bog: " + where + (d.item ? " – " + d.item : ""), html, text: (LIVE ? "" : "TEST – sagen er oprettet i testmiljøet og gælder ikke.\n\n") + title +"\n\nHvor: " + where + (d.item ? "\nHvad: " + d.item : "") + "\n" + who + "\n\n" + (d.description || "") + "\n\nÅbn sagen: " + url }) });
  return r.ok ? "sendt til " + (LIVE ? "kontoret" : "Christian (test)") : "fejl " + r.status + " " + (await r.text()).slice(0, 160);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const me = await user.auth.getUser();
  if (!me.data.user) return J({ error: "Ikke logget ind" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: Row = {}; try { body = await req.json(); } catch { /* */ }
  const pub = await keys(sb);
  if (body.action === "pubkey") return J({ key: pub });

  if (body.action === "test") {
    const subs = (await sb.from("push_subs").select("endpoint, p256dh, auth").eq("user_id", me.data.user.id)).data || [];
    const r = await push(sb, subs, { title: "Den sorte bog", body: "Prøvenotifikation – notifikationerne virker på denne enhed.", url: APP + "?menu=test#sortbog" });
    return J({ ok: true, ...r });
  }

  if (body.action === "new") {
    // Kun en ny sag (oprettet inden for de sidste 10 minutter) kan sende besked – så kan funktionen ikke bruges til at spamme
    const d = (await sb.from("defects").select("*").eq("id", String(body.id || "")).maybeSingle()).data as Row | null;
    if (!d) return J({ error: "Ukendt sag" }, 404);
    if (Date.now() - new Date(String(d.created_at)).getTime() > 10 * 60 * 1000 || d.source !== "app") return J({ ok: true, sendt: 0 });
    const where = whereOf(d);
    const title = (d.priority === "rod" ? "🔴 " : "") + "Ny sag: " + where + (d.item ? " – " + d.item : "");
    const text = String(d.description || "").slice(0, 160) + " (" + (d.reporter_name || "?") + ")";
    const subs = ((await sb.rpc("push_targets_srv", { p_topic: "sortbog" })).data || []) as Sub[];
    const pr = await push(sb, subs, { title, body: text, url: caseUrl(d.id), tag: "sortbog-" + d.id });
    const mail = d.priority === "rod" ? await redMail(d, "Ny sag i den sorte bog – rød (haster)", "Skrevet af: " + (d.reporter_name || "?")) : "ikke rød";
    return J({ ok: true, push: pr, mail, prioritet: PRIO[String(d.priority)] });
  }

  if (body.action === "event") {
    // Kun en ny linje (højst 10 minutter gammel), skrevet af den, der kalder
    const c = (await sb.from("sb_comments").select("*").eq("id", String(body.id || "")).maybeSingle()).data as Row | null;
    if (!c) return J({ error: "Ukendt linje" }, 404);
    if (c.author !== me.data.user.id || Date.now() - new Date(String(c.created_at)).getTime() > 10 * 60 * 1000) return J({ ok: true, sendt: 0 });
    const d = (await sb.from("defects").select("*").eq("id", String(c.defect_id)).maybeSingle()).data as Row | null;
    if (!d) return J({ error: "Ukendt sag" }, 404);
    const who = String(c.author_name || "Nogen");
    const title = whereOf(d) + (d.item ? " · " + d.item : "");
    const url = caseUrl(d.id, "kommentarer");
    const author = String(c.author);
    let subs: Sub[] = [], text = "", mail = "ikke relevant";
    if (c.kind === "edit") {
      // Melderens rettelser: kun drift (og administrator)
      subs = (((await sb.rpc("push_targets_srv", { p_topic: "sortbog" })).data || []) as Sub[]).filter((s) => s.user_id !== author);
      text = who + " rettede " + joinDa(((c.fields as string[]) || []).map((f) => FIELDS[f] || f)) + (c.red ? " – sagen er nu rød" : "");
      if (c.red) mail = await redMail(d, "En sag i den sorte bog er rettet til rød (haster)", "Rettet af: " + who);
    } else {
      subs = ((await sb.rpc("push_follow_targets_srv", { p_defect: d.id, p_exclude: author })).data || []) as Sub[];
      if (c.kind === "comment") text = who + ": " + String(c.body || "");
      else if (c.kind === "status") text = who + " satte sagen til «" + (STATUS[String(c.status)] || c.status) + "»" + (c.body ? ": " + c.body : "");
      else if (c.kind === "limaser") text = who + " har sendt sagen til Limaser";
      else text = who + " har opdateret sagen";
      // Melderen har selv lukket sin sag: Drift får også besked
      if (c.kind === "status" && c.status === "loest" && c.author === d.created_by) {
        const drift = (((await sb.rpc("push_targets_srv", { p_topic: "sortbog" })).data || []) as Sub[]).filter((s) => s.user_id !== author);
        subs = subs.concat(drift);
        text = who + " lukkede selv sagen" + (c.body ? ": " + c.body : "");
      }
      if (c.kind === "status" && c.status === "venter") {
        const role = (((await sb.rpc("push_role_targets_srv")).data || []) as Sub[]).filter((s) => s.user_id !== author);
        subs = subs.concat(role);
      }
    }
    const pr = await push(sb, subs, { title, body: text.slice(0, 200), url, tag: "sortbog-" + d.id });
    return J({ ok: true, push: pr, mail });
  }
  return J({ error: "Ukendt handling" }, 400);
});
