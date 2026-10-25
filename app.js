(function () {
"use strict";

var CFG = window.BOLNUEVO;
var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });

var CATS = [["lejligheden","Lejligheden"],["spisesteder","Spisesteder"],["strande","Strande"],["natur","Natur og udsigt"],["sevaerdigheder","Seværdigheder"],["oplevelser","Oplevelser"],["sport","Sport"],["dagligvarer","Dagligvarer"],["opladning","Opladning til elbil"],["parkering","Parkering"],["shopping","Shopping"]];
var CATNAME = {}; CATS.forEach(function (c) { CATNAME[c[0]] = c[1]; });
/* Underkategorier pr. kategori (valgfrie). Rækkefølgen her er rækkefølgen på knapperne. */
var SUBCATS = {
  spisesteder: [["restaurant","Restaurant"],["barcafe","Bar/café"],["strandbar","Strandbar (chiringuito)"],["is","Is og bageri"]],
  strande: [["bystrand","Bystrand"],["bugt","Bugt og vig"],["naturstrand","Naturstrand"]],
  natur: [["udsigt","Udsigtspunkt"],["vandretur","Vandretur og sti"],["fanomen","Naturfænomen"],["naturpark","Naturpark"]],
  sevaerdigheder: [["kirke","Kirke og kloster"],["borg","Borg, tårn og fæstning"],["museum","Museum"],["historisk","Historisk sted"],["have","Have og park"],["bymiljo","Havn og bymiljø"]],
  oplevelser: [["spa","Bad og spa"],["vin","Vin og smagning"],["baad","Bådtur"],["action","Action (rafting o.l.)"],["familie","Børn og familie"],["fest","Marked og fest"]],
  sport: [["padel","Padel"],["golf","Golf"],["cykel","Cykling"],["dykning","Dykning og snorkling"],["vandsport","Vandsport (SUP, kajak, sejlads)"],["tennis","Tennis"],["fitness","Løb og fitness"]],
  dagligvarer: [["supermarked","Supermarked"],["marked","Marked"],["bager","Bager"],["slagter","Slagter og fisk"]],
  opladning: [["lynlader","Lynlader"],["normal","Normallader"]],
  parkering: [["gratis","Gratis parkering"],["betalt","Betalt parkering"],["phus","P-hus og kælder"],["autocamper","Autocamper"]],
  shopping: [["marked","Marked"],["butik","Butik"],["center","Indkøbscenter"],["outlet","Outlet"]]
};
function subName(cat, sc) { var l = SUBCATS[cat] || []; for (var i = 0; i < l.length; i++) if (l[i][0] === sc) return l[i][1]; return ""; }
var MONTHS = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
var PRACTICAL = [
  { k: "Adresse", v: "Laderita de Bolnuevo, Travesía Jabeque 3, Playasol II, 30877 Bolnuevo (Mazarrón)" },
  { k: "Ankomst", v: "Lejligheden er klar kl. 15 lørdag. Nøgler og navneskilt ligger i en plastlomme i receptionen." },
  { k: "Afrejse", v: "Ud senest kl. 11 lørdag. Tøm køleskab, aflever linned i vaskerummet, start opvaskeren og aflever nøglerne i receptionen." },
  { k: "Koder", v: "Dørkoder og wifi får I direkte fra os." },
  { k: "Parkering", v: "På de markerede pladser foran hovedindgangen." },
  { k: "Akut", v: "Ring 112. Nærmeste hospital er Santa Lucía i Cartagena." },
  { k: "Alt det andet", v: "Hotellets egen ABC har svar på næsten alt (pool, cykler, affald, læge, taxa).", link: "https://docs.google.com/document/d/1U_z5GQfR0-Ry7YMQYxSnxF8mHoGCnQN18gQ6_BdrkPc/edit", linkText: "Åbn hotellets ABC" },
  { k: "Lufthavn og lejebil", v: "Vores erfaringer kommer her." }
];

var places = [];
var ui = { view: (function () { try { return localStorage.getItem("bol-view") || "liste"; } catch (e) { return "liste"; } })(), cat: "alle", status: "tried", editor: false, user: null, draft: null, login: null, msg: "", busy: false, loaded: false };
var h = (location.hash || "").slice(1); if (CATNAME[h] || h === "byer" || h === "dagsture") ui.cat = h;
if (/^sted\//.test(h)) ui.place = decodeURIComponent(h.slice(5));
var root = document.getElementById("root");
var newInput = document.getElementById("new-photos");

/* ---------- hjælpere ---------- */
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function km(lat, lon) {
  if (lat == null || lon == null) return null;
  var R = 6371, r = Math.PI / 180, a = CFG.hotel, dLa = (lat - a.lat) * r, dLo = (lon - a.lon) * r;
  var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function distText(p) {
  var d = km(p.lat, p.lon); if (d == null) return "";
  if (d < 0.8) return "gåafstand fra hotellet";
  if (p.drive_min) return (p.drive_km < 10 ? String(p.drive_km).replace(".", ",") : Math.round(p.drive_km)) + " km · ca. " + timeText(p.drive_min) + " i bil";
  return Math.round(d) + " km fra hotellet";
}
function timeText(m) { if (m < 60) return m + " min"; var h = Math.floor(m / 60), r = m % 60; return h + " t" + (r ? " " + r + " min" : ""); }
/* Køretid fra hotellet (vejnet fra OpenStreetMap, uden trafik) */
async function driveFromHotel(lat, lon) {
  try {
    var u = "https://router.project-osrm.org/route/v1/driving/" + CFG.hotel.lon + "," + CFG.hotel.lat + ";" + lon + "," + lat + "?overview=false";
    var j = await (await fetch(u)).json();
    if (j.code !== "Ok" || !j.routes.length) return null;
    return { km: Math.round(j.routes[0].distance / 100) / 10, min: Math.max(1, Math.round(j.routes[0].duration / 60)) };
  } catch (e) { return null; }
}
function visitsText(v) { if (!v || !v.length) return ""; return "Besøgt " + v.map(function (m) { return MONTHS[parseInt(m.slice(5, 7), 10) - 1] + " " + m.slice(0, 4); }).join(", "); }
function isMapsLink(u) { return /google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.google\./i.test(u || ""); }
function mapsUrl(p) {
  if (p.maps_url) return p.maps_url;
  var q = (p.cat === "spisesteder" || p.cat === "shopping" || p.lat == null) ? (p.name + ", " + (p.area || "Mazarrón")) : (p.lat + "," + p.lon);
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}
/* ---------- vurderinger ----------
   Én fælles komponent: kriterierne bestemmes af kategorien. Hvert kriterium får 1–5 stjerner eller "Ikke relevant".
   Samlet score = gennemsnit af de vurderede kriterier med lige vægt, vist med én decimal. */
var SCALE = [null, ["Virkelig dårligt", "Hold dig væk!"], ["Skuffende", "Spring det over"], ["Helt okay", "Hvis vi alligevel er der"], ["Rigtig godt", "Kom gerne igen"], ["Fantastisk", "Gå ikke glip af det!"]];
var CRITERIA = {
  spisesteder: ["Restaurantvurdering", [["mad", "Mad og drikke"], ["betjening", "Betjening"], ["beliggenhed", "Beliggenhed og stemning"], ["vaerdi", "Værdi for pengene"]]],
  strande: ["Strandvurdering", [["vand", "Strand og vand"], ["natur", "Omgivelser og natur"], ["adgang", "Adgang og parkering"], ["faciliteter", "Faciliteter (solsenge, toilet, strandbar)"]]],
  natur: ["Natur- og udsigtsvurdering", [["natur", "Natur og udsigt"], ["sevaerdigheder", "Seværdigheder undervejs"], ["rute", "Sti, rute og adgang"], ["ro", "Ro og atmosfære"]]],
  sevaerdigheder: ["Seværdighedsvurdering", [["oplevelse", "Hvor imponerende det er"], ["formidling", "Historie og formidling"], ["omgivelser", "Omgivelser og atmosfære"], ["vaerdi", "Værd at køre efter"]]],
  oplevelser: ["Oplevelsesvurdering", [["kvalitet", "Oplevelsens kvalitet"], ["formidling", "Formidling og indhold"], ["rammer", "Rammer og atmosfære"], ["vaerdi", "Værdi for pengene"]]],
  sport: ["Sportsvurdering", [["kvalitet", "Aktivitetens kvalitet"], ["faciliteter", "Faciliteter og udstyr"], ["service", "Service og organisering"], ["vaerdi", "Værdi for pengene"]]],
  dagligvarer: ["Butiksvurdering", [["udvalg", "Udvalg og sortiment"], ["friskhed", "Kvalitet og friskhed"], ["pris", "Prisniveau"], ["butik", "Butik og indkøbsoplevelse"]]],
  opladning: ["Ladestandervurdering", [["hastighed", "Ladehastighed og driftssikkerhed"], ["brugervenlighed", "Brugervenlighed"], ["beliggenhed", "Beliggenhed og faciliteter"], ["pris", "Pris og tilgængelighed"]]],
  parkering: ["Parkeringsvurdering", [["plads", "Let at finde plads"], ["afstand", "Afstand til målet"], ["pris", "Pris"], ["tryghed", "Tryghed og standard"]]],
  shopping: ["Butiksvurdering", [["udvalg", "Udvalg og sortiment"], ["pris", "Pris og kvalitet"], ["betjening", "Betjening"], ["butik", "Butik og atmosfære"]]],
  byer: ["Byvurdering", [["sevaerdigheder", "Seværdigheder og kultur"], ["mad", "Spisesteder og caféliv"], ["bymiljoe", "Bymiljø og stemning"], ["praktisk", "Parkering og det praktiske"]]]
};
var towns = {};
function computeScore(cat, r) {
  var c = CRITERIA[cat]; if (!c || !r) return null;
  var vals = c[1].map(function (k) { return r[k[0]]; }).filter(function (v) { return typeof v === "number" && v >= 1 && v <= 5; });
  if (!vals.length) return null;
  return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length * 10) / 10;
}
function dec(n) { return n.toFixed(1).replace(".", ","); }
/* Samlet vurdering for et sted eller en by: ny score, ellers en gammel samlet karakter */
function overall(o) {
  if (o && o.rating_score != null) { var s = +o.rating_score; return { score: s, stars: Math.round(s) }; }
  if (o && o.rating) return { legacy: true, stars: o.rating };
  return null;
}
function scoreOf(o) { var v = overall(o); return v ? (v.score != null ? v.score : v.stars) : 0; }
function starRow(n) { var s = ""; for (var i = 1; i <= 5; i++) s += '<span class="' + (i <= n ? "on" : "off") + '">' + (i <= n ? "★" : "☆") + "</span>"; return s; }
/* Lille knap ved navnet. Tryk åbner vurderingsvinduet. */
function ratingButton(kind, key, cat, o) {
  if (!CRITERIA[cat]) return "";
  var v = overall(o);
  if (!v && !ui.editor) return "";
  var label = v ? (v.score != null ? dec(v.score) + " ud af 5, " + SCALE[v.stars][0] : v.stars + " ud af 5 stjerner") : "Giv en vurdering";
  return '<button type="button" class="rbtn' + (v ? "" : " empty") + '" data-rateopen="' + kind + '" data-key="' + esc(key) + '" aria-label="' + esc(label) + (ui.editor ? "" : ", se detaljer") + '">' +
    (v && v.score != null ? '<span class="rnum">' + dec(v.score) + "</span>" : "") + '<span class="rstars" aria-hidden="true">' + starRow(v ? v.stars : 0) + "</span></button>";
}

var rateBox = document.createElement("div"); rateBox.id = "ratemodal"; document.body.appendChild(rateBox);
var rateReturn = null;
function openRating(kind, key) {
  var o, cat, name;
  if (kind === "town") { o = towns[key] || { name: key, ratings: {} }; cat = "byer"; name = key; }
  else { o = places.filter(function (x) { return x.id === key; })[0]; if (!o) return; cat = o.cat; name = o.name; }
  if (!CRITERIA[cat]) return;
  rateReturn = document.activeElement;
  ui.rate = { kind: kind, key: key, cat: cat, name: name, values: JSON.parse(JSON.stringify(o.ratings || {})), legacy: o.rating_score == null && o.rating ? o.rating : null, readonly: !ui.editor, saving: false, err: "" };
  renderRating(true);
}
function closeRating() {
  ui.rate = null; rateBox.innerHTML = ""; document.body.classList.remove("modal-open");
  if (rateReturn && document.contains(rateReturn)) rateReturn.focus();
}
function renderRating(first) {
  var r = ui.rate; if (!r) return;
  var c = CRITERIA[r.cat], score = computeScore(r.cat, r.values), ro = r.readonly;
  var rows = c[1].map(function (k) {
    var v = r.values[k[0]], na = v === "na", n = typeof v === "number" ? v : 0;
    var st = "";
    for (var i = 1; i <= 5; i++) st += '<button type="button" class="rs' + (i <= n ? " on" : "") + '" data-rv="' + k[0] + '" data-n="' + i + '"' + (ro ? " disabled" : "") +
      ' aria-label="' + i + " – " + SCALE[i][0] + '" aria-pressed="' + (i === n) + '">' + (i <= n ? "★" : "☆") + "</button>";
    return '<div class="rrow' + (na ? " na" : "") + '"><span class="rlabel" id="rl-' + k[0] + '">' + esc(k[1]) + '</span><div class="rright"><div class="rstars-in" role="group" aria-labelledby="rl-' + k[0] + '">' + st + "</div>" +
      (ro ? (na ? '<span class="rna-ro">Ikke relevant</span>' : "") : '<button type="button" class="rna" data-rna="' + k[0] + '" aria-pressed="' + na + '">Ikke relevant</button>') + "</div></div>";
  }).join("");
  var total = score == null ? '<p class="rnone">' + (ro ? "Ingen vurdering endnu." : "Giv stjerner ovenfor, så beregnes den samlede vurdering.") + "</p>" :
    '<div class="rscore"><span class="rbig">' + dec(score) + ' <small>/ 5</small></span><span class="rtot" aria-hidden="true">' + starRow(Math.round(score)) + '</span></div><p class="rtext"><strong>' + SCALE[Math.round(score)][0] + '</strong> <span>"' + SCALE[Math.round(score)][1] + '"</span></p>';
  rateBox.innerHTML = '<div class="rback" data-rclose></div><div class="rmodal" role="dialog" aria-modal="true" aria-labelledby="r-h">' +
    '<p class="rplace">' + esc(r.name) + '</p><h2 id="r-h">' + esc(c[0]) + "</h2>" +
    (r.legacy ? '<p class="hint">Tidligere samlet karakter: ' + r.legacy + " af 5 stjerner." + (ro ? "" : " Den erstattes, når I vurderer kriterierne.") + "</p>" : "") +
    '<div class="rrows">' + rows + '</div><hr class="rsep"><div class="rtotal" aria-live="polite"><p class="rcap">Samlet vurdering</p>' + total + "</div>" +
    (r.err ? '<p class="err" role="alert">' + esc(r.err) + "</p>" : "") +
    '<div class="row rbtns">' + (ro ? '<button type="button" class="btn primary" data-rclose>Luk</button>' :
      '<button type="button" class="btn primary" data-rsave' + (r.saving ? " disabled" : "") + ">" + (r.saving ? "Gemmer…" : "Gem") + '</button><button type="button" class="btn" data-rclose>Annuller</button>') + "</div></div>";
  document.body.classList.add("modal-open");
  if (first) { var f = rateBox.querySelector(".rs:not([disabled])") || rateBox.querySelector("[data-rclose].btn"); if (f) f.focus(); }
}
async function saveRating() {
  var r = ui.rate; if (!r || r.saving) return;
  var vals = {}; CRITERIA[r.cat][1].forEach(function (k) { if (r.values[k[0]] != null) vals[k[0]] = r.values[k[0]]; });
  Object.keys(r.values).forEach(function (k) { if (vals[k] == null) vals[k] = r.values[k]; });   // behold vurderinger fra en tidligere kategori
  var score = computeScore(r.cat, vals), any = CRITERIA[r.cat][1].some(function (k) { return vals[k[0]] != null; });
  var row = { ratings: vals, rating_score: score, rating: score == null ? (any ? null : r.legacy) : Math.round(score), updated_at: new Date().toISOString() };
  r.saving = true; r.err = ""; renderRating();
  var res;
  if (r.kind === "town") res = await sb.from("towns").upsert(Object.assign({ name: r.key }, row));
  else res = await sb.from("places").update(row).eq("id", r.key);
  if (res.error) { r.saving = false; r.err = "Vurderingen blev ikke gemt: " + res.error.message; renderRating(); return; }
  if (r.kind === "town") towns[r.key] = Object.assign({ name: r.key }, towns[r.key] || {}, row);
  else { var p = places.filter(function (x) { return x.id === r.key; })[0]; if (p) Object.assign(p, row); }
  closeRating(); render();
}
rateBox.addEventListener("click", function (e) {
  var r = ui.rate; if (!r) return;
  if (e.target.closest("[data-rclose]")) { closeRating(); return; }
  if (e.target.closest("[data-rsave]")) { saveRating(); return; }
  var b = e.target.closest("button"); if (!b || r.readonly) return;
  if (b.dataset.rv) { var k = b.dataset.rv, n = +b.dataset.n; r.values[k] = r.values[k] === n ? undefined : n; if (r.values[k] === undefined) delete r.values[k]; renderRating(); var again = rateBox.querySelector('[data-rv="' + k + '"][data-n="' + n + '"]'); if (again) again.focus(); return; }
  if (b.dataset.rna) { var kk = b.dataset.rna; if (r.values[kk] === "na") delete r.values[kk]; else r.values[kk] = "na"; renderRating(); var a2 = rateBox.querySelector('[data-rna="' + kk + '"]'); if (a2) a2.focus(); return; }
});
document.addEventListener("keydown", function (e) {
  if (!ui.rate) return;
  if (e.key === "Escape") { closeRating(); return; }
  if (e.key === "Tab") {   // hold fokus inde i vinduet
    var f = rateBox.querySelectorAll("button:not([disabled])"); if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});
/* Placering fra et Google Maps-link (den lange udgave med koordinater) */
function coordsFromLink(u) {
  if (!u) return null;
  var m = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || u.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  return m ? [+m[1], +m[2]] : null;
}
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "link"; } }
function stars(r) { var s = ""; for (var i = 1; i <= 5; i++) s += i <= r ? "★" : "☆"; return s; }
function photoUrl(path) { return /^img\//.test(path) ? path : CFG.supabaseUrl + "/storage/v1/object/public/photos/" + encodeURI(path); }
function monthOf(d) { if (!d) return null; var t = d instanceof Date ? d : new Date(d); if (isNaN(t)) return null; return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0"); }
/* Senest besøgt: præcis dato fra billederne, ellers seneste måned i "Besøgt" */
function lastKey(p) { if (p.last_visit) return String(p.last_visit); var v = (p.visits || []).slice().sort(); return v.length ? v[v.length - 1] + "-01" : ""; }
function dayOf(d) { if (!d) return null; var t = d instanceof Date ? d : new Date(d); if (isNaN(t)) return null; return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); }
function newestVisit(prev, visits, extra) {
  var v = (visits || []).slice().sort(); if (!v.length) return null;
  var m = v[v.length - 1];
  var best = [prev, extra].filter(function (d) { return d && String(d).slice(0, 7) === m; }).sort().pop();
  return best ? String(best).slice(0, 10) : m + "-01";
}
function linkFields(f) {
  return '<label>Stedets hjemmeside (valgfrit)<input id="f-web" type="url" inputmode="url" value="' + esc(f.website || "") + '" placeholder="https://…"></label>' +
    '<label>Link til Google Maps (valgfrit)<input id="f-maps" type="url" inputmode="url" value="' + esc(f.maps || "") + '" placeholder="Del-link fra Google Maps"></label>' +
    '<label>Andet link: blog, anmeldelser el.lign. (valgfrit)<input id="f-link" type="url" inputmode="url" value="' + esc(f.link || "") + '" placeholder="https://…"></label>';
}
async function fetchWebImages(id, quiet) {
  ui.msg = "Henter billeder fra stedets hjemmeside eller blog…"; render();
  try {
    var r = await sb.functions.invoke("fetch-image", { body: { id: id, max: 3 } });
    var err = r.error ? ((r.data && r.data.error) || (r.error.context && (await r.error.context.json().catch(function () { return {}; })).error) || "") : "";
    ui.msg = err ? "Fandt ikke noget billede" + (quiet ? "" : ": " + err) + (quiet ? ". Du kan selv tilføje et under \"+ Billeder\"." : "") : r.data.added + (r.data.added === 1 ? " billede" : " billeder") + " hentet fra " + r.data.credit + ".";
  } catch (e) { ui.msg = "Billedet kunne ikke hentes lige nu."; }
  await load();
}
function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ---------- data ---------- */
async function load() {
  var tw = await sb.from("towns").select("*");
  if (!tw.error) { towns = {}; (tw.data || []).forEach(function (t) { towns[t.name] = t; }); }
  var rg = await sb.from("regions").select("*");
  if (!rg.error) { regions = {}; (rg.data || []).forEach(function (r) { regions[r.name] = r; }); }
  var r = await sb.from("places").select("*");
  if (r.error) { ui.msg = "Kunne ikke hente stederne. Prøv at genindlæse siden."; }
  else places = r.data || [];
  ui.loaded = true;
  render();
}

async function checkUser() {
  var s = await sb.auth.getSession();
  ui.user = s.data.session ? s.data.session.user : null;
  ui.editor = false;
  if (ui.user) {
    var r = await sb.from("editors").select("email").limit(1);
    ui.editor = !r.error && r.data && r.data.length > 0;
  }
}

/* ---------- visning ---------- */
function carousel(p) {
  var ph = p.photos || [];
  if (!ph.length) return '<div class="noimg-card" aria-hidden="true">' + (CAT_ICONS[p.cat] || "") + "</div>";
  var html = '<div class="car" data-car>';
  html += '<div class="track">' + ph.map(function (x, i) {
    var u = esc(photoUrl(x));
    // Den slørede baggrund sættes først når billedet er hentet (se "load"-lytteren), så kun synlige billeder hentes.
    var credit = /\/web-/.test(x) && p.photo_credit ? '<span class="credit">Foto: ' + esc(p.photo_credit) + "</span>" : "";
    return '<div class="slide"><img src="' + u + '" alt="' + esc(p.name) + (ph.length > 1 ? ", billede " + (i + 1) : "") + '" loading="lazy" decoding="async">' + credit + "</div>";
  }).join("") + "</div>";
  if (ph.length > 1) {
    html += '<span class="count">1/' + ph.length + '</span><button class="arrow prev" type="button" data-step="-1" aria-label="Forrige billede">‹</button><button class="arrow next" type="button" data-step="1" aria-label="Næste billede">›</button>';
    html += '<div class="dots">' + ph.map(function (x, i) { return '<button class="dot' + (i === 0 ? " on" : "") + '" type="button" data-go="' + i + '" aria-label="Billede ' + (i + 1) + '"></button>'; }).join("") + "</div>";
  }
  return html + "</div>";
}


/* Enkle stregikoner til kategorierne */
function svg(p) { return '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>"; }
var CAT_ICONS = {
  alle: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
  byer: svg('<path d="M3 21h18M5 21V10l5-3v14M10 21V5l6 3v13M16 21v-9l4 2v7"/>'),
  lejligheden: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  spisesteder: svg('<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-2 2-2 6 0 8v10"/>'),
  strande: svg('<path d="M4 12a8 8 0 0 1 16 0z"/><path d="M12 12v8M3 21c2-1.3 4-1.3 6 0s4 1.3 6 0 4-1.3 6 0"/>'),
  natur: svg('<path d="M3 20l6-12 4 7 3-4 5 9z"/><circle cx="17" cy="6" r="2"/>'),
  dagsture: svg('<path d="M5 16h14l-1.5-5.5A2 2 0 0 0 15.6 9H8.4a2 2 0 0 0-1.9 1.5z"/><path d="M4 16v3h3v-3M17 16v3h3v-3"/><circle cx="8" cy="13.5" r=".6"/><circle cx="16" cy="13.5" r=".6"/>'),
  sport: svg('<circle cx="10" cy="9.5" r="6"/><path d="M14.3 13.8L20 19.5"/><circle cx="19" cy="5" r="1.6"/><path d="M7.5 7v5M10 6v7M12.5 7v5"/>'),
  sevaerdigheder: svg('<path d="M3 21h18M5 21v-9M9.5 21v-9M14.5 21v-9M19 21v-9M3 12h18L12 4z"/>'),
  oplevelser: svg('<path d="M12 3l2.2 5.4L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.6z"/>'),
  dagligvarer: svg('<path d="M3 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>'),
  opladning: svg('<path d="M13 3L6 13h5l-1 8 7-10h-5z"/>'),
  parkering: svg('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M10 17V8h3a2.5 2.5 0 0 1 0 5h-3"/>'),
  shopping: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>')
};
var TOWN_CATS = ["spisesteder","strande","natur","sevaerdigheder","oplevelser","sport","dagligvarer","opladning","parkering","shopping"];
var DAYTRIP_MIN = 30;
var FAR_MIN = 150;      // områder mere end 2½ time væk vises for sig som "Længere ture" (fx Granada, Málaga, Sevilla, bilturen til/fra Danmark)   // områder hvor det nærmeste sted er mindst så mange minutter væk, vises under Dagsture
var NO_REGION = "Uden område";
var regions = {};
function townsOf(list) {
  var c = {}; list.forEach(function (p) { if (p.town) c[p.town] = (c[p.town] || 0) + 1; });
  return Object.keys(c).map(function (t) { return [t, c[t]]; }).sort(function (x, y) { return y[1] - x[1] || x[0].localeCompare(y[0], "es"); });
}
function chip(attr, val, label, n, on) { return '<button class="chip" type="button" data-' + attr + '="' + esc(val) + '" aria-pressed="' + on + '">' + esc(label) + (n != null ? '<span class="n">' + n + "</span>" : "") + "</button>"; }
/* ---------- byer og områder ---------- */
function allTownNames() {
  var s = {}; Object.keys(towns).forEach(function (n) { s[n] = 1; });
  places.forEach(function (p) { if (p.town && p.cat !== "lejligheden") s[p.town] = 1; });
  return Object.keys(s);
}
function regionOf(town) { var t = towns[town]; return (t && t.region) || NO_REGION; }
function placesIn(town) { return places.filter(function (p) { return p.town === town && p.cat !== "lejligheden"; }); }
function townDrive(name) {
  var t = towns[name]; if (t && t.drive_min != null) return t.drive_min;
  var d = placesIn(name).map(function (p) { return p.drive_min; }).filter(function (x) { return x != null; });
  return d.length ? Math.min.apply(null, d) : 9999;
}
function townsInRegion(r) { return allTownNames().filter(function (n) { return regionOf(n) === r; }).sort(function (a, b) { return townDrive(a) - townDrive(b) || a.localeCompare(b, "es"); }); }
function regionNames() {
  var s = {}; Object.keys(regions).forEach(function (n) { s[n] = 1; }); allTownNames().forEach(function (t) { s[regionOf(t)] = 1; });
  return Object.keys(s).filter(function (r) { return townsInRegion(r).length || regions[r]; })
    .sort(function (a, b) { return regionDrive(a) - regionDrive(b) || a.localeCompare(b, "es"); });
}
function regionDrive(r) { var d = townsInRegion(r).map(townDrive); return d.length ? Math.min.apply(null, d) : 9999; }
function areaObj(kind, name) {
  var o = kind === "town" ? towns[name] : regions[name];
  var ps = kind === "town" ? placesIn(name) : places.filter(function (p) { return p.cat !== "lejligheden" && regionOf(p.town) === name; });
  var photos = (o && o.photos && o.photos.length) ? o.photos : [];
  var townCover = kind === "region" ? townsInRegion(name).map(function (n) { var t = towns[n]; return t && t.photos && t.photos[0]; }).filter(Boolean)[0] : null;
  var cover = photos[0] || townCover || (ps.filter(function (p) { return p.photos && p.photos.length && p.status === "tried"; })[0] || ps.filter(function (p) { return p.photos && p.photos.length; })[0] || { photos: [] }).photos[0] || null;
  var v = {}; ((o && o.visits) || []).forEach(function (m) { v[m] = 1; }); ps.forEach(function (p) { if (p.status === "tried") (p.visits || []).forEach(function (m) { v[m] = 1; }); });
  var lv = [(o && o.last_visit) || ""].concat(ps.map(lastKey)).sort().pop() || "";
  return { kind: kind, name: name, rec: o || null, photos: photos, cover: cover, places: ps, visits: Object.keys(v).sort(), last: lv, note: (o && o.note) || "",
    drive: kind === "town" ? townDrive(name) : regionDrive(name), cat: kind === "town" ? "byer" : "dagsture" };
}
function driveText(min, kmv) { if (min == null || min >= 9999) return ""; return (kmv != null ? (kmv < 10 ? String(kmv).replace(".", ",") : Math.round(kmv)) + " km · " : "") + "ca. " + timeText(min) + " i bil"; }
function areaCard(kind, name, status) {
  var a = areaObj(kind, name), n = a.places.filter(function (p) { return p.status === status; }).length;
  var cats = []; CATS.forEach(function (c) { if (a.places.some(function (p) { return p.status === status && p.cat === c[0]; })) cats.push(c[1]); });
  var sub = kind === "town" ? (n ? [n + (n === 1 ? " sted" : " steder"), cats.join(", ")].filter(Boolean).join(" · ") : visitsText(a.visits)) :
    [townsInRegion(name).join(", "), a.drive < 9999 ? "ca. " + timeText(a.drive) : ""].filter(Boolean).join(" · ");
  var only = kind === "region" && townsInRegion(name).length === 1 ? townsInRegion(name)[0] : null;
  return '<div class="town"><button class="tlink" type="button" data-' + (kind === "town" || only ? "town" : "region") + '="' + esc(only || name) + '">' + (a.cover ? '<img src="' + esc(photoUrl(a.cover)) + '" alt="" loading="lazy">' : '<span class="noimg"></span>') +
    '<span class="tname">' + esc(name) + '</span><span class="tmeta">' + esc(sub) + "</span></button>" +
    (kind === "town" ? '<div class="trate">' + ratingButton("town", name, "byer", towns[name]) + "</div>" : "") + "</div>";
}
/* Toppen af en by- eller områdeside: billeder, navn, vurdering, beskrivelse */
function areaHeader(kind, name) {
  var a = areaObj(kind, name), t = a.rec || {};
  var html = '<section class="place areahead">' + carousel({ name: name, cat: a.cat, photos: a.photos.length ? a.photos : (a.cover ? [a.cover] : []), photo_credit: t.photo_credit });
  html += '<div class="place-top"><h2>' + esc(name) + "</h2>" + (kind === "town" ? ratingButton("town", name, "byer", towns[name]) : "") + "</div>";
  var meta = kind === "town" ? [regionOf(name) !== NO_REGION ? "" : "", driveText(t.drive_min != null ? t.drive_min : (a.drive < 9999 ? a.drive : null), t.drive_km)].filter(Boolean) :
    [townsInRegion(name).length + (townsInRegion(name).length === 1 ? " by" : " byer"), a.drive < 9999 ? "nærmeste ca. " + timeText(a.drive) + " i bil" : ""].filter(Boolean);
  html += '<p class="meta">' + (kind === "town" && regionOf(name) !== NO_REGION && regionOf(name) !== name ? '<button class="linkbtn" type="button" data-region="' + esc(regionOf(name)) + '">' + esc(regionOf(name)) + "</button>" + (meta.length ? " · " : "") : "") + esc(meta.join(" · ")) + "</p>";
  html += a.note ? '<p class="note">' + esc(a.note) + "</p>" : '<p class="note empty">Mangler vores beskrivelse.</p>';
  if (a.visits.length) html += '<div class="tags"><span class="tag">' + esc(visitsText(a.visits)) + "</span></div>";
  var mq = kind === "town" ? name + ", Murcia, España" : name + ", España";
  html += '<div class="row"><a class="maps" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mq) + '" target="_blank" rel="noopener">Åbn i Google Maps</a>';
  if (ui.editor) html += '<button class="btn small" type="button" data-editarea="' + kind + '" data-key="' + esc(name) + '">Ret ' + (kind === "town" ? "by" : "område") + '</button><button class="btn small" type="button" data-addarea="' + kind + '" data-key="' + esc(name) + '">+ Billeder</button>';
  return html + "</div></section>";
}

function placeCard(p, detail, showKat) {
    var html = '<article class="place' + (detail ? " detailcard" : "") + '" id="' + esc(p.id) + '" data-pid="' + esc(p.id) + '">' + carousel(p);
    html += '<div class="place-top"><h3>' + (detail ? esc(p.name) : '<button class="titlebtn" type="button" data-open="' + esc(p.id) + '">' + esc(p.name) + "</button>") + "</h3>" + ratingButton("place", p.id, p.cat, p) + "</div>";
    var ov = overall(p);
    if (detail && ov && ov.score != null) html += '<p class="rsum"><strong>' + SCALE[ov.stars][0] + '</strong> "' + SCALE[ov.stars][1] + '"</p>';
    var where = p.area && p.area !== p.town ? (p.town && p.area.indexOf(p.town) < 0 ? p.area + ", " + p.town : p.area) : (p.town || p.area);
    var meta = p.cat === "lejligheden" ? "" : [where, distText(p), p.price].filter(Boolean).join(" · ");
    if (meta) html += '<p class="meta">' + esc(meta) + "</p>";
    html += p.note ? '<p class="note">' + esc(p.note) + "</p>" : (p.cat === "lejligheden" ? "" : '<p class="note empty">Mangler vores beskrivelse.</p>');
    html += '<div class="tags">';
    if (showKat) html += '<span class="tag kat">' + esc(CATNAME[p.cat] || p.cat) + "</span>";
    if (detail && p.visits && p.visits.length) html += '<span class="tag">' + esc(visitsText(p.visits)) + "</span>";
    if (subName(p.cat, p.subcat)) html += '<span class="tag kat">' + esc(subName(p.cat, p.subcat)) + "</span>";
    html += factTags(p, detail);
    if (p.guess) html += '<span class="tag guess">Navnet er gættet ud fra billeder</span>';
    html += "</div>";
    html += '<div class="row"><a class="maps" href="' + esc(mapsUrl(p)) + '" target="_blank" rel="noopener">Åbn i Google Maps</a>';
    if (p.website) html += '<a class="maps" href="' + esc(p.website) + '" target="_blank" rel="noopener">Hjemmeside ↗</a>';
    if (p.link) html += '<a class="maps" href="' + esc(p.link) + '" target="_blank" rel="noopener">Læs mere (' + esc(hostOf(p.link)) + ") ↗</a>";
    if (ui.editor) {
      html += '<button class="btn small" type="button" data-edit="' + esc(p.id) + '">Ret</button><button class="btn small" type="button" data-addphotos="' + esc(p.id) + '">+ Billeder</button>';
      if ((!p.photos || !p.photos.length) && (p.website || (p.link && !isMapsLink(p.link)))) html += '<button class="btn small" type="button" data-fetchimg="' + esc(p.id) + '">Hent billeder fra nettet</button>';
      if (p.status === "wish") html += '<button class="btn small" type="button" data-move="' + esc(p.id) + '">Flyt til "Har prøvet"</button>';
    }
    html += "</div>";
    if (detail && p.town) html += '<p class="meta">Mere i <button class="linkbtn" type="button" data-town="' + esc(p.town) + '">' + esc(p.town) + "</button>" + (regionOf(p.town) !== NO_REGION && regionOf(p.town) !== p.town ? ' · <button class="linkbtn" type="button" data-region="' + esc(regionOf(p.town)) + '">' + esc(regionOf(p.town)) + "</button>" : "") + "</p>";
    return html + "</article>";
}

function render() {
  var APT = "lejligheden", inApt = ui.cat === APT, inTowns = ui.cat === "byer", inTrips = ui.cat === "dagsture";
  var spots = places.filter(function (p) { return p.cat !== APT; });
  var byStatus = spots.filter(function (p) { return p.status === ui.status; });
  var rated = function (p) { var v = overall(p); return !ui.minRating || (v ? v.stars : 0) >= ui.minRating; };
  var counts = { alle: byStatus.length };
  CATS.forEach(function (c) { counts[c[0]] = byStatus.filter(function (p) { return p.cat === c[0]; }).length; });
  counts[APT] = places.filter(function (p) { return p.cat === APT; }).length;
  var tried = spots.filter(function (p) { return p.status === "tried"; }).length, wish = spots.length - tried;
  // Byer og områder, der hører til den valgte liste (Har prøvet / Vil prøve)
  var townShown = function (n) { var t = towns[n]; return byStatus.some(function (p) { return p.town === n; }) || (ui.status === "tried" && t && ((t.visits && t.visits.length) || (t.photos && t.photos.length))); };
  var regionShown = function (r) { return townsInRegion(r).some(townShown) || (ui.status === "tried" && regions[r] && ((regions[r].visits || []).length || (regions[r].photos || []).length)); };
  var tripRegions = regionNames().filter(function (r) { return r !== NO_REGION && regionDrive(r) >= DAYTRIP_MIN && regionShown(r); });
  counts.dagsture = tripRegions.length;
  counts.byer = allTownNames().filter(townShown).length;

  var list = null, sub = "", head = "", grid = "";
  var subChips = function (pool, label) {
    var s = '<div class="chips" role="group" aria-label="' + label + '">' + chip("sub", "", "Alle", pool.length, !ui.sub);
    CATS.forEach(function (c) { var n = pool.filter(function (p) { return p.cat === c[0]; }).length; if (n) s += chip("sub", c[0], c[1], n, ui.sub === c[0]); });
    return s + "</div>";
  };
  if (inApt) list = places.filter(function (p) { return p.cat === APT; });
  else if ((inTowns || inTrips) && ui.region) {
    var inReg = byStatus.filter(function (p) { return regionOf(p.town) === ui.region; });
    sub = '<div class="chips" role="group" aria-label="Tilbage">' + chip(inTrips ? "region" : "town", "", inTrips ? "‹ Alle dagsture" : "‹ Alle byer", null, false) + "</div>";
    head = areaHeader("region", ui.region);
    var rt = townsInRegion(ui.region).filter(townShown);
    if (rt.length) grid = '<h2 class="subhead">Byer i ' + esc(ui.region) + '</h2><div class="towns">' + rt.map(function (n) { return areaCard("town", n, ui.status); }).join("") + "</div>";
    if (inReg.length) grid += '<h2 class="subhead">Steder i ' + esc(ui.region) + "</h2>" + subChips(inReg, "Kategori");
    list = inReg.filter(function (p) { return (!ui.sub || p.cat === ui.sub) && rated(p); });
  } else if (inTowns && ui.town) {
    var inTown = byStatus.filter(function (p) { return p.town === ui.town; });
    sub = '<div class="chips" role="group" aria-label="Tilbage">' + chip("town", "", "‹ Alle byer", null, false) + "</div>";
    head = areaHeader("town", ui.town);
    if (inTown.length) grid = '<h2 class="subhead">Steder i ' + esc(ui.town) + "</h2>" + subChips(inTown, "Kategori");
    list = inTown.filter(function (p) { return (!ui.sub || p.cat === ui.sub) && rated(p); });
  } else if (inTowns) {
    regionNames().forEach(function (r) {
      var ts = townsInRegion(r).filter(townShown); if (!ts.length) return;
      grid += '<section class="regionsec"><h2 class="subhead">' + (r === NO_REGION ? esc(r) : '<button class="linkbtn regionlink" type="button" data-region="' + esc(r) + '">' + esc(r) + " ›</button>") + '</h2><div class="towns">' + ts.map(function (n) { return areaCard("town", n, ui.status); }).join("") + "</div></section>";
    });
    if (!grid) grid = '<p class="empty-state">Ingen byer her endnu.</p>';
  } else if (inTrips) {
    grid = '<p class="hint">Områder, hvor det nærmeste sted ligger mindst ' + DAYTRIP_MIN + ' minutters kørsel fra hotellet. Tryk på et område for at se byer og steder.</p>';
    var nearR = tripRegions.filter(function (r) { return regionDrive(r) < FAR_MIN; }), farR = tripRegions.filter(function (r) { return regionDrive(r) >= FAR_MIN; });
    grid += nearR.length ? '<div class="towns">' + nearR.map(function (r) { return areaCard("region", r, ui.status); }).join("") + "</div>" : '<p class="empty-state">Ingen dagsture her endnu.</p>';
    if (farR.length) grid += '<h2 class="subhead">Længere ture</h2><p class="hint">Steder mere end 2½ times kørsel fra hotellet – med overnatning eller på bilturen til og fra Danmark.</p><div class="towns">' + farR.map(function (r) { return areaCard("region", r, ui.status); }).join("") + "</div>";
  } else {
    var inCat = byStatus.filter(function (p) { return ui.cat === "alle" || p.cat === ui.cat; });
    if (SUBCATS[ui.cat]) {
      var scs = SUBCATS[ui.cat].map(function (x) { return [x, inCat.filter(function (p) { return p.subcat === x[0]; }).length]; }).filter(function (x) { return x[1] || ui.subcat === x[0][0]; });
      var none = inCat.filter(function (p) { return !subName(ui.cat, p.subcat); }).length;
      if (scs.length) sub += '<div class="chips" role="group" aria-label="Underkategori">' + chip("subcat", "", "Alle", inCat.length, !ui.subcat) + scs.map(function (x) { return chip("subcat", x[0][0], x[0][1], x[1], ui.subcat === x[0][0]); }).join("") +
        (none ? chip("subcat", "__ingen", "Ikke valgt", none, ui.subcat === "__ingen") : "") + "</div>";
      if (ui.subcat) inCat = inCat.filter(function (p) { return ui.subcat === "__ingen" ? !subName(ui.cat, p.subcat) : p.subcat === ui.subcat; });
    }
    var qs = (QUESTIONS[ui.cat] || []).map(function (x) { return x[0]; });
    if (qs.length) {
      sub += '<div class="chips" role="group" aria-label="Åbningstider">' +
        (qs.indexOf("saeson") >= 0 ? chip("fopen", "1", "Skjul sæsonlukkede", inCat.filter(function (p) { return (p.facts || {}).saeson === "ja"; }).length || null, !!ui.fOpen) : "") +
        (qs.indexOf("sondag") >= 0 ? chip("fsun", "1", "Kun søndagsåbent", inCat.filter(function (p) { return (p.facts || {}).sondag === "ja"; }).length, !!ui.fSun) : "") +
        (qs.indexOf("tidlig") >= 0 ? chip("fearly", "1", "Åbent før kl. 20", inCat.filter(function (p) { return (p.facts || {}).tidlig === "ja"; }).length, !!ui.fEarly) : "") + "</div>";
      if (ui.fOpen) inCat = inCat.filter(function (p) { return (p.facts || {}).saeson !== "ja"; });
      if (ui.fSun) inCat = inCat.filter(function (p) { return (p.facts || {}).sondag === "ja"; });
      if (ui.fEarly) inCat = inCat.filter(function (p) { return (p.facts || {}).tidlig === "ja"; });
    }
    if (TOWN_CATS.indexOf(ui.cat) >= 0) {
      var ts2 = townsOf(inCat);
      if (ts2.length > 1) sub += '<div class="chips" role="group" aria-label="By">' + chip("filtertown", "", "Alle byer", null, !ui.ftown) + ts2.map(function (t) { return chip("filtertown", t[0], t[0], t[1], ui.ftown === t[0]); }).join("") + "</div>";
      if (ui.ftown) inCat = inCat.filter(function (p) { return p.town === ui.ftown; });
    }
    list = inCat.filter(rated);
  }
  var q = (ui.q || "").trim().toLowerCase(), searching = q.length > 0;
  if (searching) {
    var words = q.split(/\s+/);
    list = places.filter(function (p) {
      var hay = [p.name, p.area, p.town, regionOf(p.town), p.note, p.website, CATNAME[p.cat], subName(p.cat, p.subcat), p.status === "wish" ? "vil prøve" : "har prøvet"].join(" ").toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }
  var dist = function (p) { return p.drive_min != null ? p.drive_min : (km(p.lat, p.lon) || 0) * 1.2; };
  var SORTS = {
    senest: function (a, b) { return lastKey(b).localeCompare(lastKey(a)) || String(b.created_at || "").localeCompare(String(a.created_at || "")); },
    nyeste: function (a, b) { return String(b.created_at || "").localeCompare(String(a.created_at || "")) || dist(a) - dist(b); },
    naermeste: function (a, b) { return dist(a) - dist(b); },
    stjerner: function (a, b) { return scoreOf(b) - scoreOf(a) || dist(a) - dist(b); },
    navn: function (a, b) { return a.name.localeCompare(b.name, "da"); }
  };
  if (list) list.sort(SORTS[ui.sort] || SORTS.senest);
  var detail = ui.place ? places.filter(function (p) { return p.id === ui.place; })[0] || null : null;

  var html = '<header><div><p class="eyebrow">Laderita de Bolnuevo · Costa Cálida</p><h1>Vores Bolnuevo</h1></div><button class="iconbtn" type="button" data-open-search aria-label="Søg">' + ICON_SEARCH + "</button>";
  html += "</header>";
  if (ui.msg) html += '<p class="notice" role="status">' + esc(ui.msg) + "</p>";
  if (ui.login) html += loginHtml();
  if (ui.draft) html += formHtml(ui.draft);
  if (ui.areaDraft) html += areaFormHtml(ui.areaDraft);

  var f = "";
  // Knappen viser den visning, man skifter TIL: kort-ikon i listen, liste-ikon på kortet
  var toMap = ui.view !== "kort";
  if (!inApt) f += '<div class="statusrow"><div class="seg" role="group" aria-label="Vis"><button type="button" data-status="tried" aria-pressed="' + (ui.status === "tried") + '">Har prøvet (' + tried + ')</button><button type="button" data-status="wish" aria-pressed="' + (ui.status === "wish") + '">Vil prøve (' + wish + ")</button></div>" +
    '<button class="iconbtn viewbtn" type="button" data-view="' + (toMap ? "kort" : "liste") + '" aria-label="' + (toMap ? "Vis på kort" : "Vis som liste") + '" title="' + (toMap ? "Vis på kort" : "Vis som liste") + '">' + (toMap ? ICON_MAP : ICON_LIST) + "</button></div>";
  f += '<div class="cats" role="group" aria-label="Kategori">' + catBtn("alle", "Alle", counts.alle) + catBtn("byer", "Byer", counts.byer) + catBtn("dagsture", "Dagsture", counts.dagsture);
  CATS.forEach(function (c) { f += catBtn(c[0], c[0] === "opladning" ? "Elbil" : c[1], counts[c[0]]); });
  f += "</div>";
  if (sub) f += '<div class="subchips">' + sub + "</div>";
  f += '<div class="selects">';
  var listView = list !== null;
  if (!inApt && listView) f += '<label class="sel"><span aria-hidden="true">★</span><select data-select="rating" aria-label="Karakter">' +
    [[0, "Alle karakterer"], [4, "4 stjerner og op"], [5, "Kun 5 stjerner"]].map(function (r) { return '<option value="' + r[0] + '"' + ((ui.minRating || 0) === r[0] ? " selected" : "") + ">" + r[1] + "</option>"; }).join("") + "</select></label>";
  f += '<label class="sel"><span aria-hidden="true">⇅</span><select data-select="sort" aria-label="Sortér">' +
    [["senest", "Senest besøgt"], ["nyeste", "Senest tilføjet"], ["naermeste", "Nærmeste først"], ["stjerner", "Flest stjerner"], ["navn", "Navn A–Å"]].map(function (o) { return '<option value="' + o[0] + '"' + ((ui.sort || "senest") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
  f += "</div>";
  function catBtn(id, label, n) {
    return '<button type="button" class="cat" data-cat="' + id + '" aria-pressed="' + (ui.cat === id) + '">' + (CAT_ICONS[id] || "") + '<span class="cl">' + esc(label) + "</span>" + (n != null ? '<span class="cn">' + n + "</span>" : "") + "</button>";
  }
  var summary = searching ? 'Søgning: "' + ui.q.trim() + '"' : [inApt ? "" : (ui.status === "wish" ? "Vil prøve" : "Har prøvet"), ui.cat === "alle" ? "Alle" : ui.cat === "byer" ? "Byer" : ui.cat === "dagsture" ? "Dagsture" : CATNAME[ui.cat], ui.subcat && ui.subcat !== "__ingen" ? subName(ui.cat, ui.subcat) : "", ui.fOpen ? "uden sæsonlukkede" : "", ui.fSun ? "søndagsåbent" : "", ui.fEarly ? "åbent før kl. 20" : "", ui.region || "", ui.town || ui.ftown || "", ui.sub ? CATNAME[ui.sub] : "",
    ui.minRating ? ui.minRating + "+ ★" : "", ui.sort && ui.sort !== "senest" ? { nyeste: "senest tilføjet", naermeste: "nærmeste først", stjerner: "flest stjerner", navn: "A–Å" }[ui.sort] : ""].filter(Boolean).join(" · ");
  if (detail) {
    html += '<div class="bar" id="fullbar"><div class="row"><button class="chip" type="button" data-closeplace>‹ Tilbage</button></div></div>';
  } else if (searching) {
    html += '<div class="bar" id="fullbar"><div class="row"><strong>' + list.length + (list.length === 1 ? " sted" : " steder") + ' matcher "' + esc(ui.q.trim()) + '"</strong><button class="btn small" type="button" id="q-clear">Ryd søgning</button></div></div>';
  } else html += '<div class="bar" id="fullbar">' + f + "</div>";
  slimBar(summary, f, list ? list.length : null);

  if (detail) { list = [detail]; head = grid = ""; }
  // På kortet erstatter kortet oversigten med by- og områdekort; overskriften for en valgt by/område bliver stående
  if (!searching) html += head + (ui.view === "kort" && !detail ? (inTrips && !ui.region ? '<p class="hint">Steder i områder mindst ' + DAYTRIP_MIN + ' minutters kørsel fra hotellet.</p>' : "") : grid);
  if (!searching && !listView && !detail) list = [];
  var mapList = null;
  if (ui.view === "kort" && !detail) {
    // Kortet viser de samme steder som listen. I Byer og Dagsture vises stederne i de byer/områder, der står på siden.
    mapList = list.length || searching ? list : byStatus.filter(function (p) {
      if (inTowns) return townShown(p.town);
      if (inTrips) return tripRegions.indexOf(regionOf(p.town)) >= 0;
      return false;
    });
    if (!searching && !listView && !list.length && (inTowns || inTrips) && (ui.town || ui.region)) mapList = list;
    html += '<div class="mapwrap"><div id="map" role="region" aria-label="Kort over stederne"></div><p class="hint">' + mapList.filter(function (p) { return p.lat != null; }).length + " af " + mapList.length + " steder har en placering og vises på kortet.</p>" +
      '<p class="legend">' + CATS.filter(function (c) { return mapList.some(function (p) { return p.cat === c[0] && p.lat != null; }); }).map(function (c) { return '<span><i style="background:' + CAT_COLORS[c[0]] + '"></i>' + esc(c[1]) + "</span>"; }).join("") + "</p></div>";
    list = [];
  }
  html += '<div class="list">';
  if (!ui.loaded) html += '<p class="empty-state">Henter steder…</p>';
  else if (!list.length && inApt) html += '<p class="empty-state">Ingen billeder af lejligheden endnu.' + (ui.editor ? ' Tryk "+ Nyt sted" og vælg billeder taget på hotellet, så havner de her.' : "") + "</p>";
  else if (!list.length && searching && !detail) html += '<p class="empty-state">Ingen steder matcher søgningen.</p>';
  else if (!list.length && listView && !((inTowns || inTrips) && (ui.town || ui.region))) html += '<p class="empty-state">' + (ui.status === "wish" ? "Ingen ønsker her endnu." : "Intet her endnu.") + (ui.editor ? ' Tryk "+ Nyt sted" for at tilføje et.' : "") + "</p>";
  list.forEach(function (p) { html += placeCard(p, !!detail, ui.cat === "alle" || inTowns || inTrips || searching || !!detail); });
  html += "</div>";

  if (inApt) html += '<section class="practical"><p class="eyebrow">Det praktiske, kort</p><h2>Når I bor i lejligheden</h2><dl>';
  if (inApt) PRACTICAL.forEach(function (r) { html += "<dt>" + esc(r.k) + "</dt><dd>" + esc(r.v) + (r.link ? ' <a href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc(r.linkText) + "</a>" : "") + "</dd>"; });
  if (inApt) html += "</dl></section>";
  html += "<footer><span>Afstand og tid er i bil fra hotellet, beregnet uden trafik.</span>";
  if (ui.editor) html += '<span><button class="linkbtn" type="button" id="open-import">Importér billeder fra PC</button></span>';
  if (ui.user) html += "<span>Logget ind som " + esc(ui.user.email) + '. <button class="linkbtn" type="button" id="logout">Log ud</button></span>';
  else html += '<span><button class="linkbtn" type="button" id="open-login">Log ind for at rette</button></span>';
  html += "</footer>";
  if (ui.editor && !ui.draft) {
    if (ui.chooser) html += '<div class="chooser" role="menu"><button class="btn primary" type="button" id="new-photo">Vælg billeder</button><button class="btn" type="button" id="new-manual">Uden billede (fx et sted vi vil prøve)</button></div>';
    html += '<button class="fab" type="button" id="new" aria-label="Nyt sted" aria-expanded="' + !!ui.chooser + '"><span aria-hidden="true">' + (ui.chooser ? "×" : "+") + "</span> " + (ui.chooser ? "Luk" : "Nyt sted") + "</button>";
  }
  root.innerHTML = html;
  if (mapList) drawMap(mapList);
  wireCarousels();
  watchBar();
}

/* ---------- kortvisning (Leaflet + OpenStreetMap) ---------- */
var CAT_COLORS = { lejligheden: "#0d5c6b", spisesteder: "#c0392b", strande: "#e1a21b", natur: "#2e8b57", sevaerdigheder: "#7d3c98", oplevelser: "#d35400", sport: "#1f77b4", dagligvarer: "#6b8e23", opladning: "#16a085", parkering: "#5d6d7e", shopping: "#c2185b" };
var mapObj = null, mapView = null;
function drawMap(list) {
  var el = document.getElementById("map"); if (!el || !window.L) return;
  if (mapObj) { mapView = { c: mapObj.getCenter(), z: mapObj.getZoom(), key: mapObj._bolKey }; mapObj.remove(); mapObj = null; }
  var m = L.map(el, { scrollWheelZoom: true, tap: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
  var pts = [];
  L.marker([CFG.hotel.lat, CFG.hotel.lon], { title: "Laderita de Bolnuevo", icon: L.divIcon({ className: "hotelpin", html: "⌂", iconSize: [26, 26] }) }).addTo(m).bindPopup("<strong>Laderita de Bolnuevo</strong><br>Hotellet");
  list.forEach(function (p) {
    if (p.lat == null) return;
    pts.push([p.lat, p.lon]);
    var v = overall(p), img = (p.photos || [])[0];
    var pop = (img ? '<img class="popimg" src="' + esc(photoUrl(img)) + '" alt="">' : "") + "<strong>" + esc(p.name) + "</strong><br>" +
      '<span class="muted">' + esc([CATNAME[p.cat], p.town].filter(Boolean).join(" · ")) + "</span>" + (v ? '<br><span class="popstars">' + starRow(v.stars) + "</span>" : "") +
      '<br><button class="btn small" type="button" data-open="' + esc(p.id) + '">Åbn</button>';
    L.circleMarker([p.lat, p.lon], { radius: 8, weight: 2, color: "#fff", fillColor: CAT_COLORS[p.cat] || "#333", fillOpacity: 0.95 }).addTo(m).bindPopup(pop, { maxWidth: 240 }).bindTooltip(esc(p.name));
  });
  var key = list.map(function (p) { return p.id; }).join(",");
  m._bolKey = key;
  if (mapView && mapView.key === key) m.setView(mapView.c, mapView.z);
  else if (pts.length) {
    // Zoom ind på de nære steder; et enkelt sted langt væk (fx Barcelona) må ikke gøre kortet til hele Spanien
    var near = pts.filter(function (x) { return distM(x[0], x[1], CFG.hotel.lat, CFG.hotel.lon) < 250000; });
    m.fitBounds(L.latLngBounds((near.length ? near : pts).concat([[CFG.hotel.lat, CFG.hotel.lon]])), { padding: [30, 30], maxZoom: 15 });
  } else m.setView([CFG.hotel.lat, CFG.hotel.lon], 11);
  mapObj = m;
}

/* ---------- smal menulinje øverst + søgning ---------- */
var ICON_SEARCH = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
var ICON_MAP = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>';
var ICON_LIST = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="4" width="7" height="7" rx="1.5"/><rect x="13.5" y="4" width="7" height="7" rx="1.5"/><rect x="3.5" y="14" width="7" height="7" rx="1.5"/><rect x="13.5" y="14" width="7" height="7" rx="1.5"/></svg>';
var ICON_FILTER = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6h18M6 12h12M10 18h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
var slim = document.getElementById("slim"), panel = document.getElementById("filterpanel"), searchWrap = document.getElementById("searchwrap"), qInput = document.getElementById("q");
function slimBar(summary, filters, n) {
  slim.innerHTML = '<button type="button" class="slim-sum" data-toggle-panel>' + ICON_FILTER + '<span>' + esc(summary) + '</span></button><button class="iconbtn" type="button" data-open-search aria-label="Søg">' + ICON_SEARCH + "</button>";
  panel.innerHTML = ui.panel ? '<div class="panel-inner">' + filters + '<div class="row"><button class="btn primary" type="button" data-toggle-panel>Vis ' + (n == null ? "" : n + " ") + "steder</button></div></div>" : "";
  panel.hidden = !ui.panel;
}
var barObserver = null;
function watchBar() {
  if (barObserver) barObserver.disconnect();
  var bar = document.getElementById("fullbar"); if (!bar || !("IntersectionObserver" in window)) return;
  barObserver = new IntersectionObserver(function (e) {
    var below = !e[0].isIntersecting && e[0].boundingClientRect.top < 0;
    slim.classList.toggle("show", below || ui.panel);
  }, { rootMargin: "-64px 0px 0px 0px" });
  barObserver.observe(bar);
}
function openSearch() {
  ui.panel = false; searchWrap.hidden = false; slim.classList.add("hidden-by-search");
  qInput.value = ui.q || ""; qInput.focus();
}
function closeSearch() { searchWrap.hidden = true; slim.classList.remove("hidden-by-search"); ui.q = ""; qInput.value = ""; render(); }
qInput.addEventListener("input", function () { ui.q = qInput.value; render(); window.scrollTo({ top: 0 }); });
document.getElementById("q-close").addEventListener("click", closeSearch);
document.addEventListener("click", function (e) {
  var t = e.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-open-search")) { openSearch(); return; }
  if (t.hasAttribute("data-toggle-panel")) {
    var wasOpen = ui.panel; ui.panel = !ui.panel; render();
    if (wasOpen) { var b = document.getElementById("fullbar"); if (b) window.scrollTo({ top: b.getBoundingClientRect().bottom + window.scrollY - 58 }); }
    return;
  }
  if (t.id === "q-clear") { closeSearch(); return; }
});

function wireCarousels() {
  root.querySelectorAll("[data-car]").forEach(function (car) {
    var track = car.querySelector(".track"), dots = car.querySelectorAll(".dot"), count = car.querySelector(".count");
    if (!dots.length) return;
    track.addEventListener("scroll", function () {
      var i = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach(function (d, j) { d.classList.toggle("on", i === j); });
      if (count) count.textContent = (i + 1) + "/" + dots.length;
    }, { passive: true });
  });
}

/* ---------- login ---------- */
function loginHtml() {
  var l = ui.login;
  return '<form class="panel" id="login-form"><h2>Log ind for at rette</h2>' +
    '<div class="seg" role="group" aria-label="Login"><button type="button" id="to-login" aria-pressed="' + (l.mode !== "signup") + '">Jeg har en adgangskode</button><button type="button" id="to-signup" aria-pressed="' + (l.mode === "signup") + '">Første gang: opret adgangskode</button></div>' +
    (l.mode === "signup" ? '<p class="hint">Skriv din mail og vælg en adgangskode. Du får en mail, hvor du bekræfter, og så kan du logge ind.</p>' : "") +
    '<label>Mail<input type="email" id="l-email" autocomplete="email" required value="' + esc(l.email || "") + '"></label>' +
    '<label>Adgangskode<input type="password" id="l-pass" autocomplete="' + (l.mode === "signup" ? "new-password" : "current-password") + '" required minlength="8"></label>' +
    (l.info ? '<p class="hint">' + esc(l.info) + "</p>" : "") + (l.err ? '<p class="err" role="alert">' + esc(l.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit">' + (l.mode === "signup" ? "Opret adgangskode" : "Log ind") + '</button><button class="btn" type="button" id="close-login">Annuller</button></div></form>';
}

async function submitLogin() {
  var email = document.getElementById("l-email").value.trim(), pass = document.getElementById("l-pass").value;
  ui.login.email = email; ui.login.err = ""; ui.login.info = "";
  if (pass.length < 8) { ui.login.err = "Adgangskoden skal være mindst 8 tegn."; render(); return; }
  if (ui.login.mode === "signup") {
    var s = await sb.auth.signUp({ email: email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
    if (s.error) { ui.login.err = "Det lykkedes ikke: " + s.error.message; render(); return; }
    if (s.data.session) { ui.login = null; await afterLogin(); return; }
    ui.login.mode = "login"; ui.login.info = "Tjek din mail og tryk på linket for at bekræfte. Kom så tilbage og log ind her."; render(); return;
  }
  var r = await sb.auth.signInWithPassword({ email: email, password: pass });
  if (r.error) { ui.login.err = /confirm/i.test(r.error.message) ? "Du skal først bekræfte din mail via linket, vi sendte." : 'Forkert mail eller adgangskode. Er det første gang, så tryk "Første gang: opret adgangskode" ovenfor.'; render(); return; }
  ui.login = null; await afterLogin();
}
async function afterLogin() {
  await checkUser();
  ui.msg = ui.editor ? "" : "Du er logget ind, men har ikke ret til at rette endnu. Bed Christian om at give dig adgang.";
  render();
}

/* ---------- nyt sted ud fra billede ---------- */
async function readPhotoInfo(files) {
  var info = { lat: null, lon: null, month: null, date: null };
  for (var i = 0; i < files.length; i++) {
    try {
      if (info.lat == null) {
        var gps = await window.exifr.gps(files[i]);
        if (gps && typeof gps.latitude === "number" && isFinite(gps.latitude)) { info.lat = gps.latitude; info.lon = gps.longitude; }
      }
    } catch (e) { /* billedet har ingen placering */ }
    try {
      if (!info.month) {
        var data = await window.exifr.parse(files[i], ["DateTimeOriginal", "CreateDate"]);
        if (data) { info.month = monthOf(data.DateTimeOriginal || data.CreateDate); info.date = dayOf(data.DateTimeOriginal || data.CreateDate); }
      }
    } catch (e) { /* billedet har ingen dato */ }
    if (info.lat != null && info.month) break;
  }
  if (!info.month && files[0] && files[0].lastModified) { info.month = monthOf(new Date(files[0].lastModified)); info.date = dayOf(new Date(files[0].lastModified)); }
  return info;
}

var LOCAL_TOWNS = [["Bolnuevo",37.5635,-1.3080,1.6],["Puerto de Mazarrón",37.5640,-1.2560,2.2],["Mazarrón",37.5985,-1.3150,2.0],["La Azohía",37.5530,-1.1700,1.8],["Isla Plana",37.5750,-1.2100,1.5],["Cañada de Gallego",37.5770,-1.4000,2.0],["El Alamillo",37.5690,-1.2370,1.2]];
function townFor(lat, lon, addr) {
  var best = null;
  LOCAL_TOWNS.forEach(function (t) { var d = distM(lat, lon, t[1], t[2]) / 1000; if (d < t[3] && (!best || d < best[1])) best = [t[0], d]; });
  if (best) return best[0];
  addr = addr || {};
  // 1) en by fra guiden meget tæt på, 2) landsbyen/byen fra kortet, 3) en by fra guiden inden for 8 km,
  // 4) først til sidst kommunen. Kommuner som Cartagena dækker hele kyster, så de giver forkerte byer.
  var g = nearestGuideTown(lat, lon, 1.5); if (g) return g.name;
  var local = addr.village || addr.town || addr.hamlet || addr.neighbourhood || "";
  if (local) return local;
  g = nearestGuideTown(lat, lon, 8); if (g) return g.name;
  return addr.city || addr.municipality || "";
}
function townCenter(name) {
  var t = towns[name]; if (t && t.lat != null) return [t.lat, t.lon];
  var ps = places.filter(function (p) { return p.town === name && p.lat != null; }); if (!ps.length) return null;
  return [ps.reduce(function (s, p) { return s + p.lat; }, 0) / ps.length, ps.reduce(function (s, p) { return s + p.lon; }, 0) / ps.length];
}
function nearestGuideTown(lat, lon, maxKm) {
  var best = null;
  allTownNames().forEach(function (n) { var c = townCenter(n); if (!c) return; var d = distM(lat, lon, c[0], c[1]) / 1000; if (d <= maxKm && (!best || d < best.km)) best = { name: n, km: d }; });
  return best;
}
/* En ny by oprettes med placering, køretid og et gæt på området (den nærmeste by i guiden inden for 15 km) */
async function ensureTown(name, lat, lon) {
  if (!name || towns[name]) return "";
  var row = { name: name, region: null };
  var near = lat != null ? nearestGuideTown(lat, lon, 15) : null, reg = near && towns[near.name] && towns[near.name].region;
  if (reg) row.region = reg;
  var r = await sb.from("towns").insert(row);
  if (r.error) return "";
  return reg ? ' Den nye by "' + name + '" er lagt i området "' + reg + '" (gæt ud fra ' + near.name + "). Ret det under Byer, hvis det er forkert." : ' Den nye by "' + name + '" har intet område endnu. Vælg det under Byer → ' + name + " → Ret.";
}
var GROCERY = ["supermarket","convenience","bakery","butcher","greengrocer","seafood","deli","marketplace","alcohol","beverages","frozen_food"];
var FOOD = ["restaurant","cafe","bar","pub","fast_food","ice_cream","biergarten","food_court"];
var SPORT = ["sports_centre","golf_course","pitch","stadium","fitness_centre","tennis","padel"];
var FUN = ["spa","water_park","marina","theme_park","zoo","aquarium","public_bath","dive_centre","boat_rental","horse_riding","swimming_pool"];
/* ---------- kortopslag via OpenStreetMap (Overpass) ---------- */
var OVERPASS = "https://overpass-api.de/api/interpreter";
async function overpass(q) {
  var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 7000);
  try {
    var r = await fetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: c.signal });
    if (!r.ok) return null; return (await r.json()).elements || [];
  } catch (e) { return null; } finally { clearTimeout(t); }
}
function elPos(e) { return e.center ? [e.center.lat, e.center.lon] : [e.lat, e.lon]; }
function elName(t) { return t.name || t.brand || t.operator || (t.amenity === "parking" ? "Parkering" : t.amenity === "charging_station" ? "Ladestander" : ""); }
/* Kategori og underkategori ud fra kortets mærker */
function catFromTags(t) {
  var a = t.amenity, sh = t.shop, l = t.leisure, to = t.tourism, h = t.historic;
  if (a === "charging_station") return ["opladning", /dc|ccs|chademo|combo/i.test(JSON.stringify(t)) ? "lynlader" : null];
  if (a === "parking") return ["parkering", t.parking === "multi-storey" || t.parking === "underground" ? "phus" : t.fee === "no" ? "gratis" : t.fee === "yes" ? "betalt" : null];
  if (a === "restaurant" || a === "fast_food") return ["spisesteder", "restaurant"];
  if (a === "cafe" || a === "bar" || a === "pub" || a === "biergarten") return ["spisesteder", "barcafe"];
  if (a === "ice_cream" || sh === "pastry") return ["spisesteder", "is"];
  if (sh === "supermarket" || sh === "convenience" || sh === "greengrocer" || sh === "alcohol" || sh === "beverages") return ["dagligvarer", "supermarked"];
  if (sh === "bakery") return ["dagligvarer", "bager"];
  if (sh === "butcher" || sh === "seafood") return ["dagligvarer", "slagter"];
  if (a === "marketplace") return ["dagligvarer", "marked"];
  if (sh === "mall" || sh === "department_store") return ["shopping", "center"];
  if (sh) return ["shopping", "butik"];
  if (l === "golf_course") return ["sport", "golf"];
  if (l === "sports_centre" || l === "pitch" || l === "fitness_centre") return ["sport", /padel/i.test(t.sport || "") ? "padel" : /tennis/i.test(t.sport || "") ? "tennis" : /golf/i.test(t.sport || "") ? "golf" : /div/i.test(t.sport || "") ? "dykning" : null];
  if (t.natural === "beach" || l === "beach_resort") return ["strande", null];
  if (to === "viewpoint") return ["natur", "udsigt"];
  if (to === "museum") return ["sevaerdigheder", "museum"];
  if (h === "castle" || h === "fort" || h === "tower" || t.man_made === "tower") return ["sevaerdigheder", "borg"];
  if (a === "place_of_worship") return ["sevaerdigheder", "kirke"];
  if (to === "attraction" || h) return ["sevaerdigheder", h ? "historisk" : null];
  if (l === "water_park" || a === "spa" || l === "spa") return ["oplevelser", "spa"];
  return [null, null];
}
/* Det navngivne sted nærmest et punkt (fx hvor billedet er taget) */
async function poiNear(lat, lon, radius) {
  var q = "[out:json][timeout:10];(nwr(around:" + (radius || 120) + "," + lat + "," + lon + ")[name][~\"^(shop|amenity|tourism|leisure|historic)$\"~\".\"];" +
    "nwr(around:" + (radius || 120) + "," + lat + "," + lon + ")[amenity~\"^(charging_station|parking)$\"];);out center 60;";
  var els = await overpass(q); if (!els || !els.length) return null;
  var best = null;
  els.forEach(function (e) {
    var p = elPos(e); if (p[0] == null) return;
    var c = catFromTags(e.tags || {}), d = distM(lat, lon, p[0], p[1]) - (c[0] ? 25 : 0);   // steder med kendt kategori foretrækkes lidt
    if (!elName(e.tags || {})) return;
    if (!best || d < best.d) best = { d: d, name: elName(e.tags), cat: c[0], subcat: c[1], lat: p[0], lon: p[1] };
  });
  return best;
}
async function lookupPlace(lat, lon) {
  var base = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&lat=" + lat + "&lon=" + lon;
  var out = { name: "", cat: null, subcat: null, area: "" };
  var op = await poiNear(lat, lon, 120);
  if (op) { out.name = op.name; out.cat = op.cat; out.subcat = op.subcat; }
  try {
    var poi = op ? null : await (await fetch(base + "&zoom=18&layer=poi")).json();
    var near = poi && poi.lat && km(lat, lon) != null ? distM(lat, lon, +poi.lat, +poi.lon) : 99999;
    if (poi && poi.name && near < 150) {
      out.name = poi.name;
      var c = poi.category, t = poi.type;
      if (c === "amenity" && FOOD.indexOf(t) >= 0) out.cat = "spisesteder";
      else if ((c === "natural" && t === "beach") || t === "beach_resort") out.cat = "strande";
      else if (t === "charging_station") out.cat = "opladning";
      else if (GROCERY.indexOf(t) >= 0) out.cat = "dagligvarer";
      else if (c === "shop" || t === "marketplace" || t === "mall") out.cat = "shopping";
      else if (SPORT.indexOf(t) >= 0) out.cat = "sport";
      else if (FUN.indexOf(t) >= 0) out.cat = "oplevelser";
    }
    var where = poi && poi.address ? poi.address : null;
    if (!where || !(where.village || where.town || where.city)) {
      var pl = await (await fetch(base + "&zoom=14")).json();
      where = pl && pl.address;
    }
    out.town = townFor(lat, lon, where);
    out.area = out.town;
  } catch (e) { /* ingen forbindelse til kortopslag */ }
  if (distM(lat, lon, CFG.hotel.lat, CFG.hotel.lon) < 150) { out.cat = "lejligheden"; out.name = "Laderita de Bolnuevo"; out.area = "Bolnuevo"; out.town = "Bolnuevo"; }
  if (!out.cat) out.cat = (km(lat, lon) || 0) > 25 ? "sevaerdigheder" : "natur";
  return out;
}
function distM(a, b, c, d) { var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * 6371000; }

async function startNew(files, opts) {
  opts = opts || {};
  ui.msg = "";
  ui.draft = { isNew: true, id: uid(), cat: CATNAME[ui.cat] && ui.cat !== "lejligheden" ? ui.cat : "spisesteder", status: ui.status, name: "", area: "", note: "", rating: null, price: "", visits: [], guess: false, lat: null, lon: null,
    items: files.map(function (f) { return { file: f, url: URL.createObjectURL(f) }; }), removed: [], finding: true, info: "" };
  render(); scrollToForm();
  var info = await readPhotoInfo(files);
  var d = ui.draft; if (!d) return;
  if (info.month) d.visits = [info.month];
  d.lastVisit = info.date;
  if (opts.visits && opts.visits.length) d.visits = opts.visits.slice(); if (opts.last) d.lastVisit = opts.last;
  d.fromImport = !!opts.fromImport;
  if (info.lat != null) {
    d.lat = +info.lat.toFixed(5); d.lon = +info.lon.toFixed(5);
    var near = places.filter(function (p) { return p.lat != null; }).map(function (p) { return [p, distM(d.lat, d.lon, p.lat, p.lon)]; })
      .filter(function (x) { return x[1] < 120; }).sort(function (a, b) { return a[1] - b[1]; })[0];
    if (near) d.match = { id: near[0].id, name: near[0].name, m: Math.round(near[1]) };
    var found = await lookupPlace(d.lat, d.lon);
    if (ui.draft !== d) return;
    d.name = found.name; d.area = found.area; d.cat = found.cat; d.subcat = found.subcat || ""; d.town = found.town || "";
    d.info = found.name ? "Navn, type og placering er fundet ud fra billedet. Ret dem, hvis de ikke passer." : "Placeringen er fundet ud fra billedet, men stedet har intet navn på kortet. Skriv navnet selv.";
  } else {
    // iPhone fjerner tit placeringen, når et billede uploades fra browseren. Er billedet taget for nylig, bruger vi telefonens placering.
    if (opts.fromImport) { d.finding = false; d.info = 'Billederne har ingen placering gemt. Skriv navnet og tryk "Find på kortet".'; render(); scrollToForm(); var fn = document.getElementById("f-name"); if (fn) fn.focus(); return; }
    var ft = files[0] && files[0].lastModified ? files[0].lastModified : 0;
    var recent = (info.date && info.date === dayOf(new Date())) || (ft && Date.now() - ft < 6 * 3600 * 1000);
    d.finding = false;
    if (recent && navigator.geolocation) { d.info = "Billedet har ingen placering gemt, men det er taget i dag. Jeg bruger din nuværende placering…"; render(); useMyLocation(true); return; }
    d.info = 'Billedet har ingen placering gemt. Tip: Tryk på "Valg" øverst, når du vælger billeder, og slå "Placering" til (iPhone fjerner den ellers). Står du på stedet nu, kan du trykke "Brug min placering".';
  }
  d.finding = false;
  render(); scrollToForm();
}

function startManual() {
  ui.msg = "";
  ui.draft = { isNew: true, manual: true, id: uid(), cat: CATNAME[ui.cat] && ui.cat !== "lejligheden" ? ui.cat : "spisesteder", status: "wish", name: "", area: "", town: "", note: "", rating: null, price: "",
    visits: [], guess: false, lat: null, lon: null, link: "", website: "", maps: "", items: [], removed: [], info: 'Skriv navnet og tryk "Find på kortet", så finder siden by, placering og køretid.' };
  render(); scrollToForm(); var n = document.getElementById("f-name"); if (n) n.focus();
}
async function findOnMap() {
  var d = ui.draft; if (!d || !d.name.trim()) { if (d) { d.err = "Skriv et navn først."; render(); } return; }
  d.err = ""; d.info = "Søger…"; render();
  try {
    var hit = null, gm = coordsFromLink(d.maps) || coordsFromLink(d.link);
    if (gm) {
      var rv = await (await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&zoom=18&lat=" + gm[0] + "&lon=" + gm[1])).json();
      hit = rv && rv.lat ? rv : { lat: gm[0], lon: gm[1], address: {} };
    }
    if (!hit) {
      // Søg først tæt på hotellet (ca. 35 km), og vis flere valg hvis der er flere steder med navnet
      var H = CFG.hotel, box = [H.lon - 0.4, H.lat + 0.3, H.lon + 0.4, H.lat - 0.3].join(",");
      var nr = await (await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&accept-language=es&countrycodes=es&bounded=1&viewbox=" + box + "&q=" + encodeURIComponent(d.name.trim()))).json();
      if (ui.draft !== d) return;
      var seen = {}, ch = (nr || []).map(function (e) {
        var tg = {}; tg[e.category] = e.type; var c = catFromTags(tg), ad = e.address || {};
        return { name: e.name || d.name.trim(), lat: +e.lat, lon: +e.lon, cat: c[0], subcat: c[1], addr: [ad.road, ad.village || ad.town || ad.city || ad.suburb].filter(Boolean).join(", "), km: km(+e.lat, +e.lon), address: ad };
      }).filter(function (x) { var k = x.lat.toFixed(3) + x.lon.toFixed(3); if (seen[k]) return false; seen[k] = 1; return true; })
        .sort(function (a, b) { return a.km - b.km; }).slice(0, 6);
      if (ch.length === 1) { await applyChoice(d, ch[0]); return; }
      if (ch.length > 1) { d.choices = ch; d.info = "Jeg fandt " + ch.length + " steder med det navn i nærheden. Vælg det rigtige:"; render(); return; }
    }
    var words = d.name.trim().split(/\s+/), tries = [d.name.trim()];
    var generic = /^(restaurante|restaurant|bar|cafe|café|cafetería|faro|playa|el|la|los|las)$/i;
    var stripped = words.filter(function (w) { return !generic.test(w); }).join(" "); if (stripped && tries.indexOf(stripped) < 0) tries.push(stripped);
    if (words.length > 2) tries.push(words.slice(0, 2).join(" "));
    for (var i = 0; !hit && i < tries.length; i++) {
      var u = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&accept-language=es&countrycodes=es&viewbox=-2.3,38.7,-0.3,37.2&q=" + encodeURIComponent(tries[i]);
      var r = await (await fetch(u)).json();
      if (r.length) hit = r.sort(function (a, b) { return km(+a.lat, +a.lon) - km(+b.lat, +b.lon); })[0];   // nærmest hotellet
    }
    if (ui.draft !== d) return;
    if (!hit) { d.info = "Fandt ikke stedet på kortet. Tip: indsæt et link fra Google Maps i link-feltet og tryk igen. Du kan også gemme stedet uden placering."; render(); return; }
    d.lat = +(+hit.lat).toFixed(5); d.lon = +(+hit.lon).toFixed(5);
    d.town = townFor(d.lat, d.lon, hit.address); d.area = d.town;
    var t = hit.type, c = hit.category;
    if (c === "amenity" && FOOD.indexOf(t) >= 0) d.cat = "spisesteder";
    else if (t === "charging_station") d.cat = "opladning";
    else if (GROCERY.indexOf(t) >= 0) d.cat = "dagligvarer";
    else if ((c === "natural" && t === "beach") || t === "beach_resort") d.cat = "strande";
    else if (SPORT.indexOf(t) >= 0) d.cat = "sport";
    d.info = "Fundet: " + (hit.display_name || "").split(",").slice(0, 3).join(",") + ". Passer det ikke, så ret navnet og prøv igen.";
  } catch (e) { d.info = "Kortet svarer ikke lige nu. Du kan gemme stedet alligevel."; }
  render();
}

async function applyChoice(d, x) {
  d.choices = null; d.lat = +x.lat.toFixed(5); d.lon = +x.lon.toFixed(5);
  var addr = {};
  if (x.address) addr = x.address;
  if (!townFor(d.lat, d.lon, addr)) { try { var rv = await (await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&zoom=14&lat=" + d.lat + "&lon=" + d.lon)).json(); addr = (rv && rv.address) || {}; } catch (e) {} }
  d.town = townFor(d.lat, d.lon, addr); d.area = x.addr || d.town;
  if (x.cat) { d.cat = x.cat; d.subcat = x.subcat || ""; }
  if (!d.name || d.name.toLowerCase() === (x.name || "").toLowerCase()) d.name = x.name || d.name;
  d.info = "Fundet: " + [x.name, x.addr || d.town].filter(Boolean).join(", ") + ". Passer det ikke, så ret navnet og prøv igen.";
  render();
}
function useMyLocation(auto) {
  var d = ui.draft; if (!d) return;
  if (!navigator.geolocation) { d.info = "Telefonen kan ikke give placeringen her."; render(); return; }
  if (!auto) d.info = "Finder din placering…"; render();
  navigator.geolocation.getCurrentPosition(async function (pos) {
    d.lat = +pos.coords.latitude.toFixed(5); d.lon = +pos.coords.longitude.toFixed(5);
    var found = await lookupPlace(d.lat, d.lon);
    if (ui.draft !== d) return;
    if (!d.name) d.name = found.name; d.area = d.area || found.area; d.town = d.town || found.town || ""; d.cat = found.cat; if (found.subcat) d.subcat = found.subcat;
    d.info = found.name ? "Fundet ud fra din placering: " + found.name + ". Ret, hvis det ikke passer." : "Placeringen er gemt. Skriv navnet selv.";
    render(); scrollToForm();
  }, function () { d.info = "Placeringen blev ikke givet. Du kan skrive stedet ind selv."; render(); }, { enableHighAccuracy: true, timeout: 15000 });
}

/* ---------- formular ---------- */
function formHtml(f) {
  var opts = CATS.map(function (c) { return '<option value="' + c[0] + '"' + (f.cat === c[0] ? " selected" : "") + ">" + c[1] + "</option>"; }).join("");
  var r = [["", "Ingen"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]].map(function (o) { return '<option value="' + o[0] + '"' + (String(f.rating || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
  var pr = ["", "€", "€€", "€€€"].map(function (o) { return '<option value="' + o + '"' + (f.price === o ? " selected" : "") + ">" + (o || "Ikke relevant") + "</option>"; }).join("");
  var ph = f.items.map(function (it, i) {
    return '<div class="ph"><img src="' + esc(it.url || photoUrl(it.path)) + '" alt="">' + (i === 0 ? '<span class="first">Forsidebillede</span>' : "") +
      '<div class="row">' + (i > 0 ? '<button class="btn small" type="button" data-first="' + i + '">Gør til forside</button>' : "") +
      '<button class="btn small danger" type="button" data-rm="' + i + '">Slet</button></div></div>';
  }).join("");
  if (f.isNew && !f.more) return quickHtml(f);
  return '<form class="panel" id="editor"><h2>' + (f.isNew ? "Nyt sted" : "Ret sted") + "</h2>" +
    (f.finding ? '<p class="hint">Finder stedet ud fra billedet…</p>' : "") + (f.info ? '<p class="hint">' + esc(f.info) + "</p>" : "") +
    (f.lat == null && !f.finding ? '<div><button class="btn" type="button" id="my-loc">Brug min placering</button></div>' : "") +
    '<div class="grid"><label>Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Restaurante La Siesta"></label><label>By<input id="f-town" list="townlist" value="' + esc(f.town || "") + '" placeholder="Puerto de Mazarrón"></label><datalist id="townlist">' + allTownNames().sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist></div>" +
    '<label>Sted/område (valgfrit)<input id="f-area" value="' + esc(f.area) + '" placeholder="Plaza del Muelle"></label>' +
    linkFields(f) +
    '<div class="grid"><label>Kategori<select id="f-cat">' + opts + "</select></label>" + (SUBCATS[f.cat] ? '<label>Underkategori<select id="f-subcat"><option value="">Ikke valgt</option>' + SUBCATS[f.cat].map(function (x) { return '<option value="' + x[0] + '"' + (f.subcat === x[0] ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select></label>" : "") + '<label>Liste<select id="f-status"><option value="tried"' + (f.status === "tried" ? " selected" : "") + '>Har prøvet</option><option value="wish"' + (f.status === "wish" ? " selected" : "") + ">Vil prøve</option></select></label>" + '<label>Pris<select id="f-price">' + pr + "</select></label></div>" +
    questionsHtml(f) +
    '<label>Vores beskrivelse<textarea id="f-note" placeholder="Bestil dagens fisk. Book bord lørdag aften.">' + esc(f.note) + "</textarea></label>" +
    '<div><p class="hint" style="margin-bottom:8px">Billeder (det første vises først, man swiper til de næste)</p><div class="photos">' + ph + "</div>" +
    '<label class="btn" style="display:inline-flex;margin-top:10px;color:var(--fg)">+ Tilføj billeder<input type="file" id="f-add" accept="image/*" multiple hidden></label></div>' +
    '<div class="grid"><label>Besøgt (fx 2025-02, 2026-07)<input id="f-visits" value="' + esc((f.visits || []).join(", ")) + '"></label><label>Placering (bredde, længde)<input id="f-pos" inputmode="decimal" value="' + (f.lat != null ? esc(f.lat + ", " + f.lon) : "") + '" placeholder="37.5654, -1.2584"></label></div>' +
    '<label class="inline"><input type="checkbox" id="f-guess"' + (f.guess ? " checked" : "") + "> Navnet er ikke bekræftet</label>" +
    (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + '</button><button class="btn" type="button" id="cancel">Annuller</button>' +
    (!f.isNew ? '<button class="btn danger" type="button" id="del-place">' + (f.confirmDel ? "Tryk igen for at slette stedet" : "Slet sted") + "</button>" : "") + "</div></form>";
}

/* Hurtig udgave til nyt sted: billeder + det fundne navn, alt andet er valgfrit */
function cleanFacts(d) {
  var f = {}, src = d.facts || {};
  Object.keys(src).forEach(function (k) { if (src[k]) f[k] = src[k]; });   // svar fra en anden kategori bevares
  if (f.saeson !== "ja") delete f.periode;
  return f;
}
/* Faste spørgsmål pr. kategori (svar: "ja", "nej" eller ikke besvaret) */
var QUESTIONS = {
  dagligvarer: [["saeson", "Sæsonlukket?"], ["sondag", "Åbent om søndagen?"]],
  spisesteder: [["saeson", "Sæsonlukket?"], ["tidlig", "Åbent før kl. 20?"]]
};
function factTags(p, full) {
  var f = p.facts || {}, q = QUESTIONS[p.cat] || [], out = [];
  q.forEach(function (x) {
    var v = f[x[0]];
    if (x[0] === "saeson") { if (v === "ja") out.push(["warn", "Sæsonlukket" + (f.periode ? " (" + f.periode + ")" : "")]); else if (v === "nej" && full) out.push(["", "Åbent hele året"]); }
    if (x[0] === "tidlig") { if (v === "ja") out.push(["", "Åbent før kl. 20"]); else if (v === "nej") out.push(["warn", "Åbner først kl. 20"]); }
    if (x[0] === "sondag") { if (v === "ja" && full) out.push(["", "Søndagsåbent"]); else if (v === "nej") out.push(["warn", "Lukket om søndagen"]); }
  });
  return out.map(function (t) { return '<span class="tag' + (t[0] ? " " + t[0] : "") + '">' + esc(t[1]) + "</span>"; }).join("");
}
function questionsHtml(f) {
  var q = QUESTIONS[f.cat]; if (!q) return "";
  var fa = f.facts || {};
  return '<div class="questions">' + q.map(function (x) {
    var v = fa[x[0]] || "";
    return '<div class="qrow"><span>' + esc(x[1]) + '</span><div class="seg small" role="group" aria-label="' + esc(x[1]) + '">' +
      [["ja", "Ja"], ["nej", "Nej"], ["", "Ved ikke"]].map(function (o) { return '<button type="button" data-q="' + x[0] + '" data-qv="' + o[0] + '" aria-pressed="' + (v === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div></div>" +
      (x[0] === "saeson" && v === "ja" ? '<label class="qperiod">Hvornår er der lukket? (valgfrit)<input id="f-periode" value="' + esc(fa.periode || "") + '" placeholder="Fx november–marts"></label>' : "");
  }).join("") + "</div>";
}
function subChooser(f) {
  if (!SUBCATS[f.cat]) return "";
  return '<div class="chips subchoose" role="group" aria-label="Underkategori (valgfri)"><span class="hint">Underkategori:</span>' + SUBCATS[f.cat].map(function (x) { return '<button class="chip" type="button" data-setsub="' + x[0] + '" aria-pressed="' + (f.subcat === x[0]) + '">' + esc(x[1]) + "</button>"; }).join("") + "</div>";
}
function quickHtml(f) {
  var thumbs = f.items.map(function (it) { return '<img src="' + esc(it.url || photoUrl(it.path)) + '" alt="" style="width:88px;height:88px;object-fit:cover;border-radius:8px;flex:0 0 auto">'; }).join("");
  var dist = f.lat != null ? distText(f) : "";
  var chips = CATS.map(function (c) { return '<button class="chip" type="button" data-setcat="' + c[0] + '" aria-pressed="' + (f.cat === c[0]) + '">' + c[1] + "</button>"; }).join("");
  if (f.manual) return '<form class="panel" id="editor"><h2>Nyt sted</h2>' +
    '<div class="row" style="align-items:flex-end"><label style="flex:1">Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Restaurante El Puerto"></label><button class="btn" type="button" id="find-map">Find på kortet</button></div>' +
    (f.info ? '<p class="hint">' + esc(f.info) + "</p>" : "") +
    (f.choices ? '<div class="choices">' + f.choices.map(function (x, i) { return '<button class="btn" type="button" data-choose="' + i + '"><strong>' + esc(x.name) + "</strong> " + esc([x.addr, x.km != null ? Math.round(x.km) + " km fra hotellet" : ""].filter(Boolean).join(" · ")) + "</button>"; }).join("") + "</div>" : "") +
    (f.lat != null ? '<p class="meta">' + esc([f.town, dist].filter(Boolean).join(" · ")) + "</p>" : "") +
    linkFields(f) + '<p class="hint">Har I ingen billeder, henter siden selv et par stykker fra hjemmesiden eller bloggen, når I gemmer.</p>' +
    '<div class="chips" role="group" aria-label="Kategori">' + chips + "</div>" + subChooser(f) + questionsHtml(f) +
    '<div class="seg" role="group" aria-label="Liste"><button type="button" data-setstatus="tried" aria-pressed="' + (f.status === "tried") + '">Har prøvet</button><button type="button" data-setstatus="wish" aria-pressed="' + (f.status === "wish") + '">Vil prøve</button></div>' +
    (thumbs ? '<div style="display:flex;gap:8px;overflow-x:auto">' + thumbs + "</div>" : "") +
    '<label class="btn" style="display:inline-flex;align-self:flex-start;color:var(--fg)">+ Tilføj billeder (valgfrit)<input type="file" id="f-add" accept="image/*" multiple hidden></label>' +
    (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + "</button>" +
    '<button class="btn" type="button" id="more">Tilføj beskrivelse, karakter m.m.</button><button class="btn" type="button" id="cancel">Annuller</button></div></form>';
  return '<form class="panel" id="editor"><h2>Nyt sted</h2>' +
    '<div style="display:flex;gap:8px;overflow-x:auto">' + thumbs + "</div>" +
    (f.match && !f.finding ? '<div class="match"><p>Billederne er taget ' + (f.match.m < 15 ? "ved" : f.match.m + " m fra") + " <strong>" + esc(f.match.name) + '</strong>.</p><button class="btn primary" type="button" id="add-to-match"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Tilføj billederne dér") + '</button><p class="hint">Eller opret et nyt sted nedenfor.</p></div>' : "") +
    (f.finding ? '<p class="hint">Finder stedet ud fra billedet…</p>' :
      '<label>Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Skriv stedets navn"></label>' +
      '<p class="meta">' + esc([f.area, dist].filter(Boolean).join(" · ") || "Ingen placering fundet") + "</p>" +
      (f.info ? '<p class="hint">' + esc(f.info) + "</p>" : "") +
      (f.lat == null ? '<div><button class="btn" type="button" id="my-loc">Brug min placering</button></div>' : "") +
      '<div class="chips" role="group" aria-label="Kategori">' + chips + "</div>" + subChooser(f) + questionsHtml(f) +
      '<div class="seg" role="group" aria-label="Liste"><button type="button" data-setstatus="tried" aria-pressed="' + (f.status === "tried") + '">Har prøvet</button><button type="button" data-setstatus="wish" aria-pressed="' + (f.status === "wish") + '">Vil prøve</button></div>') +
    (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy || f.finding ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + "</button>" +
    '<button class="btn" type="button" id="more">Tilføj beskrivelse, karakter m.m.</button><button class="btn" type="button" id="cancel">Annuller</button></div></form>';
}

function syncDraft() {
  var d = ui.draft, g = function (id) { return document.getElementById(id); }, v = function (id) { var el = g(id); return el ? el.value : null; };
  if (!d) return;
  if (v("f-name") != null) d.name = v("f-name");
  if (v("f-area") != null) d.area = v("f-area");
  if (v("f-town") != null) d.town = v("f-town");
  if (v("f-link") != null) d.link = v("f-link").trim();
  if (v("f-web") != null) d.website = v("f-web").trim();
  if (v("f-maps") != null) d.maps = v("f-maps").trim();
  if (v("f-cat") != null) { if (d.cat !== v("f-cat")) d.subcat = ""; d.cat = v("f-cat"); }
  if (v("f-subcat") != null) d.subcat = v("f-subcat");
  if (v("f-periode") != null) { d.facts = d.facts || {}; d.facts.periode = v("f-periode").trim(); }
  if (v("f-status") != null) d.status = v("f-status");
  if (v("f-rating") != null) d.rating = v("f-rating") ? parseInt(v("f-rating"), 10) : null;
  if (v("f-price") != null) d.price = v("f-price");
  if (v("f-note") != null) d.note = v("f-note");
  if (v("f-visits") != null) d.visits = v("f-visits").split(/[,\s]+/).filter(function (s) { return /^\d{4}-\d{2}$/.test(s); });
  if (v("f-pos") != null) {
    var pos = v("f-pos").split(",").map(function (s) { return parseFloat(s); });
    if (isFinite(pos[0]) && isFinite(pos[1])) { d.lat = pos[0]; d.lon = pos[1]; } else if (!v("f-pos").trim()) { d.lat = null; d.lon = null; }
  }
  if (g("f-guess")) d.guess = g("f-guess").checked;
}

function editPlace(id) {
  var p = places.filter(function (x) { return x.id === id; })[0]; if (!p) return;
  ui.draft = { isNew: false, id: p.id, link: p.link || "", website: p.website || "", maps: p.maps_url || "", lastVisit: p.last_visit || null, town: p.town || "", cat: p.cat, subcat: p.subcat || "", facts: JSON.parse(JSON.stringify(p.facts || {})), status: p.status, name: p.name, area: p.area || "", note: p.note || "", rating: p.rating, price: p.price || "", visits: (p.visits || []).slice(), guess: !!p.guess, lat: p.lat, lon: p.lon,
    items: (p.photos || []).map(function (x) { return { path: x }; }), removed: [] };
  ui.msg = ""; render(); scrollToForm();
}
function scrollToForm() { var f = document.getElementById("editor"); if (f) window.scrollTo({ top: f.getBoundingClientRect().top + window.scrollY - 16, behavior: "smooth" }); }

function shrink(file) {
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      var s = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(function (b) { b ? res(b) : rej(new Error("Billedet kunne ikke læses.")); }, "image/jpeg", 0.8);
    };
    im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("Den filtype virker ikke. Vælg et almindeligt billede.")); };
    im.src = url;
  });
}

async function uploadFiles(placeId, files, onProgress) {
  var paths = [];
  for (var i = 0; i < files.length; i++) {
    if (onProgress) onProgress(i + 1, files.length);
    var blob = await shrink(files[i]);   // gemmes uden placering (canvas fjerner GPS-data)
    var path = placeId + "/" + Date.now().toString(36) + i + ".jpg";
    var up = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (up.error) throw new Error("Et billede blev ikke uploadet: " + up.error.message);
    paths.push(path);
  }
  return paths;
}
async function addPhotosTo(placeId, files, opts) {
  opts = opts || {};
  var p = places.filter(function (x) { return x.id === placeId; })[0]; if (!p || !files.length) return;
  ui.busy = true;
  try {
    var paths = await uploadFiles(placeId, files, function (i, n) { ui.msg = "Uploader billede " + i + " af " + n + "…"; render(); });
    var pi = await readPhotoInfo(files), visits = (p.visits || []).slice();
    (opts.months || [pi.month]).forEach(function (m) { if (m && visits.indexOf(m) < 0) visits.push(m); }); visits.sort();
    var upd = { photos: (p.photos || []).concat(paths), visits: visits, last_visit: newestVisit(p.last_visit, visits, opts.last || pi.date), updated_at: new Date().toISOString() };
    var r = await sb.from("places").update(upd).eq("id", placeId);
    if (r.error) throw new Error("Billederne blev ikke gemt: " + r.error.message);
    ui.msg = files.length + (files.length === 1 ? " billede" : " billeder") + " tilføjet til " + p.name + ".";
    ui.draft = null; await load();
    var el = document.getElementById(placeId); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    ui.busy = false; render(); if (BOL.afterSave) BOL.afterSave(placeId); return true;
  } catch (e) { ui.msg = e.message || "Billederne blev ikke uploadet. Prøv igen."; }
  ui.busy = false; render(); return false;
}

async function saveDraft() {
  syncDraft();
  var d = ui.draft;
  if (!d.name.trim()) { d.err = "Skriv et navn først."; render(); return; }
  ui.busy = true; d.err = ""; render();
  try {
    var paths = [];
    for (var i = 0; i < d.items.length; i++) {
      var it = d.items[i];
      if (it.path) { paths.push(it.path); continue; }
      var blob = await shrink(it.file);   // gemmes uden placering (canvas fjerner GPS-data)
      var path = d.id + "/" + Date.now().toString(36) + i + ".jpg";
      var up = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw new Error("Et billede blev ikke uploadet: " + up.error.message);
      it.path = path; paths.push(path);
    }
    var orig = places.filter(function (x) { return x.id === d.id; })[0];
    var fix = function (u) { u = (u || "").trim(); return u && !/^https?:\/\//i.test(u) ? "https://" + u : u; };
    var web = fix(d.website), maps = fix(d.maps), link = fix(d.link);
    [web, link].forEach(function (u) { if (u && isMapsLink(u) && !maps) maps = u; });   // et Google Maps-link havner i Maps-feltet
    if (isMapsLink(web)) web = ""; if (isMapsLink(link)) link = "";
    if (d.lat == null) { var gc = coordsFromLink(maps); if (gc) { d.lat = +gc[0].toFixed(5); d.lon = +gc[1].toFixed(5); if (!d.town) d.town = townFor(d.lat, d.lon, {}); } }
    var drive = orig && orig.lat === d.lat && orig.lon === d.lon && orig.drive_min ? { km: orig.drive_km, min: orig.drive_min } : (d.lat != null ? await driveFromHotel(d.lat, d.lon) : null);
    var row = { link: link || null, website: web || null, maps_url: maps || null, last_visit: newestVisit(orig && orig.last_visit, d.visits, d.lastVisit), town: (d.town || "").trim() || null, drive_km: drive ? drive.km : null, drive_min: drive ? drive.min : null, id: d.id, cat: d.cat, subcat: subName(d.cat, d.subcat) ? d.subcat : null, facts: cleanFacts(d), status: d.status, name: d.name.trim(), area: d.area.trim(), note: d.note.trim(), price: d.price,
      visits: d.visits, guess: d.guess, lat: d.lat, lon: d.lon, photos: paths, updated_at: new Date().toISOString() };
    // Vurderingen sættes i vurderingsvinduet. Skifter stedet kategori, beregnes den samlede score efter de nye kriterier.
    var oldR = (orig && orig.ratings) || {};
    if (Object.keys(oldR).length) { var sc = computeScore(d.cat, oldR); row.rating_score = sc; row.rating = sc == null ? null : Math.round(sc); }
    var r = await sb.from("places").upsert(row);
    if (r.error) throw new Error("Stedet blev ikke gemt: " + r.error.message);
    var gone = d.removed.filter(function (x) { return !/^img\//.test(x); });
    if (gone.length) await sb.storage.from("photos").remove(gone);
    var townMsg = await ensureTown(row.town, row.lat, row.lon);
    ui.status = d.status; ui.cat = d.cat; ui.draft = null; ui.msg = "Gemt." + townMsg;
    await load();
    if (!paths.length && (web || link)) await fetchWebImages(row.id, true);
    var el = document.getElementById(row.id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (BOL.afterSave) { ui.busy = false; render(); BOL.afterSave(row.id); return; }
  } catch (e) {
    d.err = e.message || "Noget gik galt. Prøv igen.";
  }
  ui.busy = false; render();
}

async function deletePlace() {
  var d = ui.draft;
  if (!d.confirmDel) { syncDraft(); d.confirmDel = true; render(); return; }
  ui.busy = true; render();
  var r = await sb.from("places").delete().eq("id", d.id);
  if (r.error) { d.err = "Stedet blev ikke slettet: " + r.error.message; ui.busy = false; render(); return; }
  var files = d.items.map(function (x) { return x.path; }).concat(d.removed).filter(function (x) { return x && !/^img\//.test(x); });
  if (files.length) await sb.storage.from("photos").remove(files);
  ui.draft = null; ui.busy = false; ui.msg = "Stedet er slettet."; await load();
}

/* ---------- et steds egen side ---------- */
var listScroll = 0;
function openPlace(id) {
  listScroll = window.scrollY; ui.place = id; ui.panel = false;
  try { history.pushState({ place: id }, "", "#sted/" + id); } catch (x) {}
  render(); window.scrollTo({ top: 0 });
}
function closePlace() {
  if (history.state && history.state.place) { history.back(); return; }
  ui.place = null; try { history.replaceState(null, "", location.pathname); } catch (x) {} render(); window.scrollTo({ top: listScroll });
}
window.addEventListener("popstate", function () {
  var m = (location.hash || "").match(/^#sted\/(.+)$/);
  var was = ui.place; ui.place = m ? decodeURIComponent(m[1]) : null;
  render(); window.scrollTo({ top: ui.place ? 0 : (was ? listScroll : 0) });
});

/* ---------- ret by / område ---------- */
function slug(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function startAreaEdit(kind, name) {
  var o = (kind === "town" ? towns[name] : regions[name]) || {};
  ui.areaDraft = { kind: kind, name: name, region: kind === "town" ? (o.region || "") : "", newRegion: "", note: o.note || "", visits: (o.visits || []).slice(), lastVisit: o.last_visit || null,
    items: (o.photos || []).map(function (x) { return { path: x }; }), removed: [], err: "" };
  ui.msg = ""; render();
  var f = document.getElementById("area-editor"); if (f) window.scrollTo({ top: f.getBoundingClientRect().top + window.scrollY - 16, behavior: "smooth" });
}
function areaFormHtml(f) {
  var ph = f.items.map(function (it, i) {
    return '<div class="ph"><img src="' + esc(it.url || photoUrl(it.path)) + '" alt="">' + (i === 0 ? '<span class="first">Forsidebillede</span>' : "") +
      '<div class="row">' + (i > 0 ? '<button class="btn small" type="button" data-afirst="' + i + '">Gør til forside</button>' : "") + '<button class="btn small danger" type="button" data-arm="' + i + '">Slet</button></div></div>';
  }).join("");
  var regs = regionNames().filter(function (r) { return r !== NO_REGION; });
  var regSel = f.kind === "town" ? '<label>Område<select id="a-region"><option value="">Intet område</option>' + regs.map(function (r) { return '<option' + (f.region === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") +
    '<option value="__ny"' + (f.region === "__ny" ? " selected" : "") + '>Nyt område…</option></select></label>' + (f.region === "__ny" ? '<label>Navn på nyt område<input id="a-newregion" value="' + esc(f.newRegion) + '" placeholder="Fx Costa Blanca"></label>' : "") : "";
  return '<form class="panel" id="area-editor"><h2>Ret ' + (f.kind === "town" ? "byen " : "området ") + esc(f.name) + "</h2>" + regSel +
    '<label>Vores beskrivelse<textarea id="a-note" placeholder="Hvad er værd at se, hvor parkerer man, hvad skal man spise?">' + esc(f.note) + "</textarea></label>" +
    '<div><p class="hint" style="margin-bottom:8px">Billeder (det første vises først)</p><div class="photos">' + ph + "</div>" +
    '<label class="btn" style="display:inline-flex;margin-top:10px;color:var(--fg)">+ Tilføj billeder<input type="file" id="a-add" accept="image/*" multiple hidden></label></div>' +
    '<label>Besøgt (fx 2025-02, 2026-07)<input id="a-visits" value="' + esc(f.visits.join(", ")) + '"></label>' +
    (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + '</button><button class="btn" type="button" id="a-cancel">Annuller</button></div></form>';
}
function syncArea() {
  var f = ui.areaDraft, g = function (id) { return document.getElementById(id); }; if (!f) return;
  if (g("a-region")) f.region = g("a-region").value;
  if (g("a-newregion")) f.newRegion = g("a-newregion").value;
  if (g("a-note")) f.note = g("a-note").value;
  if (g("a-visits")) f.visits = g("a-visits").value.split(/[,\s]+/).filter(function (s) { return /^\d{4}-\d{2}$/.test(s); }).sort();
}
async function saveArea() {
  syncArea(); var f = ui.areaDraft; ui.busy = true; f.err = ""; render();
  try {
    var newFiles = f.items.filter(function (it) { return it.file; }).map(function (it) { return it.file; });
    var info = newFiles.length ? await readPhotoInfo(newFiles) : {};
    if (info.month && f.visits.indexOf(info.month) < 0) { f.visits.push(info.month); f.visits.sort(); }
    var prefix = f.kind + "-" + slug(f.name), paths = [];
    for (var i = 0; i < f.items.length; i++) {
      var it = f.items[i];
      if (it.path) { paths.push(it.path); continue; }
      var up = await uploadFiles(prefix, [it.file]); it.path = up[0]; paths.push(up[0]);
    }
    var row = { name: f.name, note: f.note.trim() || null, visits: f.visits, last_visit: newestVisit(f.lastVisit, f.visits, info.date), photos: paths, updated_at: new Date().toISOString() };
    var res;
    if (f.kind === "town") {
      var reg = f.region === "__ny" ? f.newRegion.trim() : f.region;
      if (reg && !regions[reg]) { var nr = await sb.from("regions").insert({ name: reg }); if (nr.error) throw new Error("Området blev ikke oprettet: " + nr.error.message); }
      row.region = reg || null;
      res = await sb.from("towns").upsert(row);
    } else res = await sb.from("regions").upsert(row);
    if (res.error) throw new Error("Det blev ikke gemt: " + res.error.message);
    var gone = f.removed.filter(function (x) { return !/^img\//.test(x); });
    if (gone.length) await sb.storage.from("photos").remove(gone);
    ui.areaDraft = null; ui.msg = "Gemt."; await load();
  } catch (e) { f.err = e.message || "Noget gik galt. Prøv igen."; }
  ui.busy = false; render();
}
async function addPhotosToArea(kind, name, files, opts) {
  opts = opts || {};
  ui.busy = true;
  try {
    var o = (kind === "town" ? towns[name] : regions[name]) || {};
    var paths = await uploadFiles(kind + "-" + slug(name), files, function (i, n) { ui.msg = "Uploader billede " + i + " af " + n + "…"; render(); });
    var pi = await readPhotoInfo(files), visits = (o.visits || []).slice();
    (opts.months || [pi.month]).forEach(function (m) { if (m && visits.indexOf(m) < 0) visits.push(m); }); visits.sort();
    var row = { name: name, photos: (o.photos || []).concat(paths), visits: visits, last_visit: newestVisit(o.last_visit, visits, opts.last || pi.date), updated_at: new Date().toISOString() };
    if (kind === "town" && !towns[name]) {
      row.region = opts.region || null;
      if (opts.lat != null) { row.lat = +opts.lat.toFixed(5); row.lon = +opts.lon.toFixed(5); var dr = await driveFromHotel(row.lat, row.lon); if (dr) { row.drive_km = dr.km; row.drive_min = dr.min; } }
    }
    var r = await sb.from(kind === "town" ? "towns" : "regions").upsert(row);
    if (r.error) throw new Error("Billederne blev ikke gemt: " + r.error.message);
    ui.msg = files.length + (files.length === 1 ? " billede" : " billeder") + " tilføjet til " + name + "."; await load();
    ui.busy = false; render(); return true;
  } catch (e) { ui.msg = e.message || "Billederne blev ikke uploadet. Prøv igen."; }
  ui.busy = false; render(); return false;
}

/* ---------- hændelser ---------- */
document.addEventListener("click", async function (e) {
  if (!root.contains(e.target) && !panel.contains(e.target)) return;
  var sl = e.target.closest(".slide"), art = sl && sl.closest("article.place[data-pid]");
  if (art && !art.classList.contains("detailcard")) { openPlace(art.dataset.pid); return; }
  var t = e.target.closest("button"); if (!t) return;
  if (t.dataset.open) { openPlace(t.dataset.open); return; }
  if (t.hasAttribute("data-closeplace")) { closePlace(); return; }
  if (t.dataset.status) { ui.status = t.dataset.status; render(); return; }
  if ((t.dataset.town != null || t.dataset.region != null) && ui.place) { ui.place = null; try { history.replaceState(null, "", location.pathname); } catch (x) {} }
  if (t.dataset.town != null) { ui.town = t.dataset.town || null; ui.region = null; ui.sub = null; if (ui.town) ui.cat = "byer"; render(); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.region != null) { ui.region = t.dataset.region || null; ui.town = null; ui.sub = null; if (ui.region && ui.cat !== "byer") ui.cat = "dagsture"; render(); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.fopen) { ui.fOpen = !ui.fOpen; render(); return; }
  if (t.dataset.fsun) { ui.fSun = !ui.fSun; render(); return; }
  if (t.dataset.fearly) { ui.fEarly = !ui.fEarly; render(); return; }
  if (t.dataset.subcat != null) { ui.subcat = t.dataset.subcat || null; render(); return; }
  if (t.dataset.filtertown != null) { ui.ftown = t.dataset.filtertown || null; render(); return; }
  if (t.dataset.sub != null) { ui.sub = t.dataset.sub || null; render(); return; }
  if (t.dataset.sort) { ui.sort = t.dataset.sort; render(); return; }
  if (t.dataset.view) { ui.view = t.dataset.view; try { localStorage.setItem("bol-view", ui.view); } catch (x) {} render(); return; }
  if (t.dataset.cat) { ui.town = null; ui.region = null; ui.ftown = null; ui.subcat = null; ui.fOpen = false; ui.fSun = false; ui.fEarly = false; ui.sub = null; ui.cat = t.dataset.cat; try { history.replaceState(null, "", ui.cat === "alle" ? location.pathname : "#" + ui.cat); } catch (x) {} render(); return; }
  if (t.dataset.step || t.dataset.go) {
    var tr = t.closest("[data-car]").querySelector(".track"), n = tr.children.length;
    var cur = Math.round(tr.scrollLeft / tr.clientWidth);
    var to = t.dataset.go != null ? +t.dataset.go : (cur + (+t.dataset.step) + n) % n;
    tr.scrollTo({ left: to * tr.clientWidth, behavior: "smooth" }); return;
  }
  if (t.dataset.addphotos) { addInput.dataset.kind = ""; addInput.dataset.target = t.dataset.addphotos; addInput.value = ""; addInput.click(); return; }
  if (t.id === "add-to-match") { addPhotosTo(ui.draft.match.id, ui.draft.items.map(function (x) { return x.file; })); return; }
  if (t.id === "new") { ui.chooser = !ui.chooser; render(); return; }
  if (t.id === "new-photo") { ui.chooser = false; render(); newInput.value = ""; newInput.click(); return; }
  if (t.id === "new-manual") { ui.chooser = false; startManual(); return; }
  if (t.id === "find-map") { syncDraft(); findOnMap(); return; }
  if (t.dataset.choose != null && ui.draft && ui.draft.choices) { syncDraft(); applyChoice(ui.draft, ui.draft.choices[+t.dataset.choose]); return; }
  if (t.dataset.edit) { editPlace(t.dataset.edit); return; }
  if (t.dataset.editarea) { ui.draft = null; startAreaEdit(t.dataset.editarea, t.dataset.key); return; }
  if (t.dataset.addarea) { addInput.dataset.kind = t.dataset.addarea; addInput.dataset.target = t.dataset.key; addInput.value = ""; addInput.click(); return; }
  if (t.dataset.afirst) { syncArea(); var ai = ui.areaDraft.items.splice(+t.dataset.afirst, 1)[0]; ui.areaDraft.items.unshift(ai); render(); return; }
  if (t.dataset.arm) { syncArea(); var ag = ui.areaDraft.items.splice(+t.dataset.arm, 1)[0]; if (ag.path) ui.areaDraft.removed.push(ag.path); render(); return; }
  if (t.id === "a-cancel") { ui.areaDraft = null; render(); return; }
  if (t.dataset.fetchimg) { fetchWebImages(t.dataset.fetchimg, false); return; }
  if (t.dataset.move) {
    var mp = places.filter(function (x) { return x.id === t.dataset.move; })[0] || {}, today = dayOf(new Date()), mv = (mp.visits || []).slice();
    if (mv.indexOf(today.slice(0, 7)) < 0) mv.push(today.slice(0, 7));
    var r = await sb.from("places").update({ status: "tried", visits: mv, last_visit: today, updated_at: new Date().toISOString() }).eq("id", t.dataset.move);
    ui.msg = r.error ? "Det blev ikke gemt. Prøv igen." : "Flyttet til \"Har prøvet\"."; await load(); return;
  }
  if (t.dataset.first) { syncDraft(); var it = ui.draft.items.splice(+t.dataset.first, 1)[0]; ui.draft.items.unshift(it); render(); return; }
  if (t.dataset.rm) { syncDraft(); var gone = ui.draft.items.splice(+t.dataset.rm, 1)[0]; if (gone.path) ui.draft.removed.push(gone.path); render(); return; }
  if (t.dataset.rateopen) { openRating(t.dataset.rateopen, t.dataset.key); return; }
  if (t.dataset.minrating != null) { ui.minRating = +t.dataset.minrating; render(); return; }
  if (t.dataset.setcat) { syncDraft(); if (ui.draft.cat !== t.dataset.setcat) ui.draft.subcat = ""; ui.draft.cat = t.dataset.setcat; render(); return; }
  if (t.dataset.q) { syncDraft(); ui.draft.facts = ui.draft.facts || {}; ui.draft.facts[t.dataset.q] = t.dataset.qv; render(); return; }
  if (t.dataset.setsub) { syncDraft(); ui.draft.subcat = ui.draft.subcat === t.dataset.setsub ? "" : t.dataset.setsub; render(); return; }
  if (t.dataset.setstatus) { syncDraft(); ui.draft.status = t.dataset.setstatus; render(); return; }
  if (t.id === "more") { syncDraft(); ui.draft.more = true; render(); return; }
  if (t.id === "my-loc") { syncDraft(); useMyLocation(); return; }
  if (t.id === "cancel") { ui.draft = null; render(); return; }
  if (t.id === "del-place") { deletePlace(); return; }
  if (t.id === "open-login") { ui.login = { mode: "login" }; render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (t.id === "close-login") { ui.login = null; render(); return; }
  if (t.id === "to-signup") { ui.login.mode = "signup"; ui.login.err = ""; render(); return; }
  if (t.id === "to-login") { ui.login.mode = "login"; ui.login.err = ""; render(); return; }
  if (t.id === "open-import") { if (BOL.openImport) BOL.openImport(); return; }
  if (t.id === "logout") { await sb.auth.signOut(); ui.user = null; ui.editor = false; ui.draft = null; render(); return; }
});
root.addEventListener("submit", function (e) {
  e.preventDefault();
  if (e.target.id === "editor") saveDraft();
  if (e.target.id === "login-form") submitLogin();
  if (e.target.id === "area-editor") saveArea();
});
root.addEventListener("change", function (e) {
  if (e.target.id === "a-region") { syncArea(); render(); return; }
  if (e.target.id === "f-cat") { syncDraft(); render(); return; }
  if (e.target.id === "a-add") { syncArea(); Array.prototype.forEach.call(e.target.files, function (f) { ui.areaDraft.items.push({ file: f, url: URL.createObjectURL(f) }); }); render(); return; }
  if (e.target.id === "f-add") {
    syncDraft();
    Array.prototype.forEach.call(e.target.files, function (f) { ui.draft.items.push({ file: f, url: URL.createObjectURL(f) }); });
    render();
  }
});
document.addEventListener("change", function (e) {
  var sel = e.target.closest("select[data-select]"); if (!sel) return;
  if (sel.dataset.select === "rating") ui.minRating = +sel.value;
  if (sel.dataset.select === "sort") ui.sort = sel.value;
  render();
});
var addInput = document.getElementById("add-photos");
addInput.addEventListener("change", function () {
  var files = Array.prototype.slice.call(addInput.files); if (!files.length) return;
  if (addInput.dataset.kind) addPhotosToArea(addInput.dataset.kind, addInput.dataset.target, files); else addPhotosTo(addInput.dataset.target, files);
});
newInput.addEventListener("change", function () { var files = Array.prototype.slice.call(newInput.files); if (files.length) startNew(files); });

/* ---------- automatisk opdatering ----------
   Appen på hjemmeskærmen har ingen genindlæs-knap. Ved start, og hver gang den åbnes igen,
   tjekker den version.json og henter selv den nye udgave, hvis der er en. */
var APP_VERSION = 37;
async function checkForUpdate() {
  try {
    var r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    var j = await r.json();
    if (j && j.v > APP_VERSION && !ui.draft && !ui.busy && !(window.BOL && window.BOL.importing)) location.replace(location.pathname + "?v=" + j.v + location.hash);
  } catch (e) { /* ingen forbindelse; prøv igen næste gang */ }
}
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") checkForUpdate(); });
checkForUpdate();

/* Slørret baggrund bag hvert billede, sat når billedet er hentet */
document.addEventListener("load", function (e) {
  var t = e.target;
  if (t && t.tagName === "IMG" && t.parentNode && t.parentNode.classList && t.parentNode.classList.contains("slide")) {
    t.parentNode.style.setProperty("--src", 'url("' + (t.currentSrc || t.src).replace(/"/g, "%22") + '")');
  }
}, true);

/* ---------- bindeled til import-værktøjet (import.js) ---------- */
var BOL = window.BOL = window.BOL || {};
BOL.sb = sb; BOL.cfg = CFG; BOL.places = function () { return places; }; BOL.isEditor = function () { return ui.editor; }; BOL.loaded = function () { return ui.loaded; };
BOL.startNew = startNew; BOL.addPhotosTo = addPhotosTo; BOL.photoUrl = photoUrl; BOL.distM = distM; BOL.CATNAME = CATNAME; BOL.esc = esc;
BOL.towns = function () { return towns; }; BOL.regions = function () { return regions; }; BOL.addPhotosToArea = addPhotosToArea; BOL.allTownNames = allTownNames;
BOL.busy = function () { return ui.busy; }; BOL.cancelDraft = function () { ui.draft = null; render(); };

/* ---------- start ---------- */
sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") { ui.user = null; ui.editor = false; } });
render();
checkUser().then(load);
})();
