(function () {
"use strict";

var CFG = window.BOLNUEVO;
var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });

var CATS = [["lejligheden","Hotellet"],["vores","Vores lejlighed"],["spisesteder","Spisesteder"],["strande","Strande"],["natur","Natur og udsigt"],["sevaerdigheder","Seværdigheder"],["oplevelser","Oplevelser"],["sport","Sport"],["dagligvarer","Dagligvarer"],["opladning","Opladning til elbil"],["parkering","Parkering"],["shopping","Shopping"]];
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
  { k: "Koder", v: "Dørkoder og wifi får I af ejerne af lejligheden." },
  { k: "Parkering", v: "På de markerede pladser foran hovedindgangen." },
  { k: "Akut", v: "Ring 112. Nærmeste hospital er Santa Lucía i Cartagena." },
  { k: "Alt det andet", v: "Hotellets egen ABC har svar på næsten alt (pool, cykler, affald, læge, taxa).", link: "https://docs.google.com/document/d/1U_z5GQfR0-Ry7YMQYxSnxF8mHoGCnQN18gQ6_BdrkPc/edit", linkText: "Åbn hotellets ABC" },
  { k: "Lufthavn og lejebil", v: "Vores erfaringer kommer her." }
];

var places = [];
/* Rå data fra databasen; "places", "towns" og "regions" bygges ud fra dem (se decorate) */
var raw = { places: [], towns: [], regions: [], exps: [], photos: [] };
var me = null;          // { andel, label, role, name, admin } for den indloggede
var authors = {};       // bruger-id -> { name, label }
var andelLabels = {};   // andel-id -> "101-043"
var ui = { checking: true, view: "liste", scope: "alle", cat: "hjem", status: "tried", editor: false, user: null, draft: null, login: null, msg: "", busy: false, loaded: false };
// Som app på hjemmeskærmen starter den altid på "Alle" (undtagen lige efter en automatisk opdatering)
var isApp = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
var h = (location.hash || "").slice(1); if ((CATNAME[h] || h === "byer" || h === "dagsture" || h === "alle") && (!isApp || /[?&]v=/.test(location.search))) ui.cat = h;
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
  if (o && o.avg_score != null) { var a = +o.avg_score; return { score: a, stars: Math.round(a), avg: true }; }
  return null;
}
function scoreOf(o) { var v = overall(o); return v ? (v.score != null ? v.score : v.stars) : 0; }
function starRow(n) { var s = ""; for (var i = 1; i <= 5; i++) s += '<span class="' + (i <= n ? "on" : "off") + '">' + (i <= n ? "★" : "☆") + "</span>"; return s; }
/* Lille knap ved navnet. Tryk åbner vurderingsvinduet. */
/* Har vores andel vurderet: vores stjerner + (hvis andre også har) "Alle 4,2 (3)". Ellers: gennemsnittet af alle. */
function ratingButton(kind, key, cat, o) {
  if (!CRITERIA[cat]) return "";
  var v = overall(o), n = (o && o.n_rated) || 0;
  if (!v && !ui.editor) return "";
  var label = v ? dec(v.score) + " ud af 5, " + SCALE[v.stars][0] + (v.avg ? ", gennemsnit af " + n + (n === 1 ? " andel" : " andele") + ". Tryk for at give jeres egen vurdering" : ", jeres vurdering") : "Giv en vurdering";
  var both = v && !v.avg && o.avg_score != null && n > 1;
  return '<span class="rwrap"><button type="button" class="rbtn' + (v ? "" : " empty") + (v && v.avg ? " avg" : "") + '" data-rateopen="' + kind + '" data-key="' + esc(key) + '" aria-label="' + esc(label) + '">' +
    (v ? '<span class="rnum">' + dec(v.score) + "</span>" : "") + '<span class="rstars" aria-hidden="true">' + starRow(v ? v.stars : 0) + "</span>" + (v && v.avg ? '<span class="rcount">(' + n + ")</span>" : "") + "</button>" +
    (both ? '<span class="ravg">Alle ' + dec(+o.avg_score) + " ★ (" + n + ")</span>" : "") + "</span>";
}

var rateBox = document.createElement("div"); rateBox.id = "ratemodal"; document.body.appendChild(rateBox);
var rateReturn = null;
function openRating(kind, key) {
  var o, cat, name;
  if (kind === "town") { o = towns[key] || { name: key, ratings: {} }; cat = "byer"; name = key; }
  else if (kind === "region") return;
  else { o = places.filter(function (x) { return x.id === key; })[0]; if (!o) return; cat = o.cat; name = o.name; }
  if (!CRITERIA[cat]) return;
  rateReturn = document.activeElement;
  ui.rate = { kind: kind, key: key, cat: cat, name: name, values: JSON.parse(JSON.stringify(o.ratings || {})), legacy: null, readonly: !ui.editor, saving: false, err: "", others: (o.others || []).filter(function (x) { return x.rating_score != null; }) };
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
    (r.others && r.others.length ? '<div class="rothers"><p class="rcap">Andre andeles vurdering</p>' + r.others.map(function (x) { return '<p><span class="rstars" aria-hidden="true">' + starRow(Math.round(x.rating_score)) + "</span> " + dec(+x.rating_score) + " · " + esc(authorText(x)) + "</p>"; }).join("") + "</div>" : "") +
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
  r.saving = true; r.err = ""; renderRating();
  var res = await saveExp(r.kind === "town" ? "town" : "place", r.key, { ratings: vals, rating_score: score });
  if (res.error) { r.saving = false; r.err = "Vurderingen blev ikke gemt: " + res.error.message; renderRating(); return; }
  closeRating(); decorate(); render();
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
/* Billederne ligger i en lukket mappe. Hvert billede hentes via en midlertidig adresse (7 dage), som huskes i browseren. */
var signed = (function () { try { return JSON.parse(localStorage.getItem("bol-signed") || "{}"); } catch (e) { return {}; } })();
function photoUrl(path) { var s = signed[path]; return s ? s.u : ""; }
async function signPhotos(paths) {
  var now = Date.now(), need = paths.filter(function (p) { var s = signed[p]; return !s || s.exp - now < 24 * 3600 * 1000; });
  for (var i = 0; i < need.length; i += 100) {
    var r = await sb.storage.from("photos").createSignedUrls(need.slice(i, i + 100), 7 * 24 * 3600);
    (r.data || []).forEach(function (x) { if (x.signedUrl) signed[x.path] = { u: x.signedUrl, exp: now + 7 * 24 * 3600 * 1000 }; });
  }
  Object.keys(signed).forEach(function (k) { if (signed[k].exp < now) delete signed[k]; });
  try { localStorage.setItem("bol-signed", JSON.stringify(signed)); } catch (e) { /* fuld; hentes igen næste gang */ }
}
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
  if (!ui.member) { ui.loaded = true; render(); return; }
  var res = await Promise.all([sb.from("towns").select("*"), sb.from("regions").select("*"), sb.from("places").select("*"),
    sb.from("experiences").select("*"), sb.from("photos").select("*").order("sort").order("created_at"), sb.rpc("author_names"), sb.from("andele").select("id,lejlighed,nummer")]);
  if (res[2].error) { ui.msg = "Kunne ikke hente stederne. Prøv at genindlæse siden."; ui.loaded = true; render(); return; }
  raw.towns = res[0].data || []; raw.regions = res[1].data || []; raw.places = res[2].data || []; raw.exps = res[3].data || []; raw.photos = res[4].data || [];
  authors = {}; (res[5].data || []).forEach(function (a) { authors[a.user_id] = a; });
  andelLabels = {}; (res[6].data || []).forEach(function (a) { andelLabels[a.id] = a.lejlighed + "-" + a.nummer; });
  await signPhotos(raw.photos.map(function (p) { return p.path; }));
  decorate();
  ui.loaded = true;
  render();
}

/* Login: hent hvilken andel man hører til (og knyt evt. ventende invitationer til brugeren) */
async function checkUser() {
  var s = await sb.auth.getSession();
  ui.user = s.data.session ? s.data.session.user : null;
  ui.editor = false; ui.member = false; me = null; ui.checking = false;
  if (!ui.user) return;
  await sb.rpc("claim_invites");
  var m = await sb.from("members").select("andel_id,name,role,andele(lejlighed,nummer,aktiv)").eq("user_id", ui.user.id);
  var row = (m.data || []).filter(function (x) { return x.andele && x.andele.aktiv; })[0];
  if (!row) return;
  var ad = await sb.rpc("am_i_admin");
  me = { andel: row.andel_id, label: row.andele.lejlighed + "-" + row.andele.nummer, role: row.role, name: row.name, admin: ad.data === true };
  ui.member = true; ui.editor = true;
}
function authorText(e) {
  var a = e && authors[e.updated_by];
  var label = (a && a.label) || andelLabels[e.andel_id] || "";
  return a && a.name ? a.name + (label ? " (" + label + ")" : "") : (label ? "Andel " + label : "En andelshaver");
}
function isMine(e) { return e && me && e.andel_id === me.andel; }
function canEditCore(p) { return !p || !me || me.admin || p.created_by === ui.user.id; }

/* Bygger stederne, byerne og områderne til visning ud fra rådata og valget "Alle andele / Kun vores andel" */
function decorate() {
  var key = function (k, t) { return k + "|" + t; }, eBy = {}, pBy = {};
  raw.exps.forEach(function (e) { (eBy[key(e.kind, e.target)] = eBy[key(e.kind, e.target)] || []).push(e); });
  raw.photos.forEach(function (p) { (pBy[key(p.kind, p.target)] = pBy[key(p.kind, p.target)] || []).push(p); });
  var vOrder = { alle: 0, andel: 1, mig: 2 };
  var build = function (kind, id, base) {
    var es = eBy[key(kind, id)] || [], ours = es.filter(isMine)[0] || null, others = es.filter(function (e) { return !isMine(e); });
    var ph = (pBy[key(kind, id)] || []).slice().sort(function (a, b) { return (vOrder[a.visibility] - vOrder[b.visibility]) || a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)); });
    var rated = es.filter(function (e) { return e.rating_score != null; });
    var avg = rated.length ? Math.round(rated.reduce(function (s, e) { return s + (+e.rating_score); }, 0) / rated.length * 10) / 10 : null;
    var vis = {}; (ui.scope === "vores" ? (ours ? [ours] : []) : es).forEach(function (e) { (e.visits || []).forEach(function (m) { vis[m] = 1; }); });
    var lastOthers = others.map(function (e) { return e.last_visit || ""; }).sort().pop() || null;
    return Object.assign({}, base, {
      mine: ours, others: others, texts: others.filter(function (e) { return e.note; }),
      status: ours && ours.status ? ours.status : (others.some(function (e) { return e.status === "tried"; }) ? "tried" : "wish"),
      visits: ours ? (ours.visits || []) : [], allVisits: Object.keys(vis).sort(), last_visit: ours ? ours.last_visit : lastOthers,
      ratings: ours ? ours.ratings || {} : {}, rating_score: ours && ours.rating_score != null ? +ours.rating_score : null, rating: null,
      avg_score: avg, n_rated: rated.length, note: ours ? ours.note || "" : "", noteVis: ours ? ours.visibility : "alle",
      photos: ph.map(function (p) { return p.path; }), photoRows: ph, photo_credit: (ph.filter(function (p) { return p.credit; })[0] || {}).credit || null
    });
  };
  places = raw.places.map(function (p) { return build("place", p.id, p); })
    .filter(function (p) { return ui.scope !== "vores" || p.mine || p.andel_id === me.andel; });
  towns = {}; raw.towns.forEach(function (t) { var o = build("town", t.name, t); o.visits = o.allVisits; towns[t.name] = o; });
  regions = {}; raw.regions.forEach(function (r) { var o = build("region", r.name, r); o.visits = o.allVisits; regions[r.name] = o; });
}

/* Gem (dele af) vores andels oplevelse af et sted, en by eller et område */
async function saveExp(kind, target, patch) {
  var cur = raw.exps.filter(function (e) { return e.kind === kind && e.target === target && isMine(e); })[0];
  var row = Object.assign({ kind: kind, target: target, andel_id: me.andel, updated_by: ui.user.id, updated_at: new Date().toISOString() }, patch);
  if (!cur && !row.status) row.status = "tried";
  var r = await sb.from("experiences").upsert(row, { onConflict: "kind,target,andel_id" }).select().single();
  if (!r.error) { if (cur) Object.assign(cur, r.data); else raw.exps.push(r.data); }
  return r;
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
  lejligheden: svg('<path d="M3 21h18M5 21V4h14v17"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4"/>'),
  vores: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M12 17.5s-3-1.8-3-3.6a1.5 1.5 0 0 1 3-.4 1.5 1.5 0 0 1 3 .4c0 1.8-3 3.6-3 3.6z"/>'),
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
/* Tekster: vores egen først, derefter andre andeles med navn. På listen kun én (vores, ellers den nyeste). */
function textsHtml(p, detail) {
  var own = p.note ? '<p class="note">' + esc(p.note) + (p.mine && p.mine.visibility === "andel" ? ' <span class="privnote">(kun vores andel)</span>' : "") + "</p>" : "";
  var others = (p.texts || []).slice().sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
  var one = function (e) { return '<blockquote class="otext"><p>' + esc(e.note) + "</p><cite>" + esc(authorText(e)) + (e.rating_score != null ? " · " + dec(+e.rating_score) + " ★" : "") + "</cite></blockquote>"; };
  if (!detail) return own || (others.length ? one(others[0]) : (isApt(p.cat) ? "" : '<p class="note empty">Ingen beskrivelse endnu.</p>'));
  var h = own;
  if (others.length) h += (own ? '<p class="rcap">Andre andele skriver</p>' : "") + others.map(one).join("");
  if (!h && !isApt(p.cat)) h = '<p class="note empty">Ingen beskrivelse endnu.</p>';
  return h;
}
/* Toppen af en by- eller områdeside: billeder, navn, vurdering, beskrivelse */
function areaHeader(kind, name) {
  var a = areaObj(kind, name), t = a.rec || {};
  var html = '<section class="place areahead">' + carousel({ name: name, cat: a.cat, photos: a.photos.length ? a.photos : (a.cover ? [a.cover] : []), photo_credit: t.photo_credit });
  html += '<div class="place-top"><h2>' + esc(name) + "</h2>" + (kind === "town" ? ratingButton("town", name, "byer", towns[name]) : "") + "</div>";
  var meta = kind === "town" ? [regionOf(name) !== NO_REGION ? "" : "", driveText(t.drive_min != null ? t.drive_min : (a.drive < 9999 ? a.drive : null), t.drive_km)].filter(Boolean) :
    [townsInRegion(name).length + (townsInRegion(name).length === 1 ? " by" : " byer"), a.drive < 9999 ? "nærmeste ca. " + timeText(a.drive) + " i bil" : ""].filter(Boolean);
  html += '<p class="meta">' + (kind === "town" && regionOf(name) !== NO_REGION && regionOf(name) !== name ? '<button class="linkbtn" type="button" data-region="' + esc(regionOf(name)) + '">' + esc(regionOf(name)) + "</button>" + (meta.length ? " · " : "") : "") + esc(meta.join(" · ")) + "</p>";
  html += textsHtml({ note: a.note, texts: (a.rec && a.rec.texts) || [], mine: a.rec && a.rec.mine, cat: "byer" }, true);
  if (a.visits.length) html += '<div class="tags"><span class="tag">' + esc(visitsText(a.visits)) + "</span></div>";
  var mq = kind === "town" ? name + ", Murcia, España" : name + ", España";
  html += '<div class="row"><a class="maps" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mq) + '" target="_blank" rel="noopener">Åbn i Google Maps</a>';
  if (ui.editor) html += '<button class="btn small" type="button" data-editarea="' + kind + '" data-key="' + esc(name) + '">Ret ' + (kind === "town" ? "by" : "område") + '</button><button class="btn small" type="button" data-addarea="' + kind + '" data-key="' + esc(name) + '">+ Billeder</button>';
  return html + "</div></section>";
}

/* Lille kort i gitteret (som byerne): billede, navn, by og kategori, stjerner. Tryk åbner stedet. */
function gridCard(p, showKat) {
  var img = p.photos && p.photos[0] ? photoUrl(p.photos[0]) : "";
  var meta = [p.town || p.area, showKat ? (subName(p.cat, p.subcat) || CATNAME[p.cat]) : subName(p.cat, p.subcat), p.drive_min != null && p.drive_min >= 15 ? "ca. " + timeText(p.drive_min) : ""].filter(Boolean).join(" · ");
  var warn = (p.facts || {}).saeson === "ja" ? '<span class="tag warn">Sæsonlukket</span>' : "";
  var priv = p.visibility === "andel" ? '<span class="tag priv">Kun vores andel</span>' : p.visibility === "mig" ? '<span class="tag priv">Kun mig</span>' : "";
  return '<div class="town pcard" id="' + esc(p.id) + '"><button class="tlink" type="button" data-open="' + esc(p.id) + '">' +
    (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="noimg">' + (CAT_ICONS[p.cat] || "") + "</span>") +
    '<span class="tname">' + esc(p.name) + '</span><span class="tmeta">' + esc(meta) + "</span>" + (warn || priv ? '<span class="ptags">' + warn + priv + "</span>" : "") + "</button>" +
    '<div class="trate">' + ratingButton("place", p.id, p.cat, p) + "</div></div>";
}
function placeCard(p, detail, showKat) {
    var html = '<article class="place' + (detail ? " detailcard" : "") + '" id="' + esc(p.id) + '" data-pid="' + esc(p.id) + '">' + carousel(p);
    html += '<div class="place-top"><h3>' + (detail ? esc(p.name) : '<button class="titlebtn" type="button" data-open="' + esc(p.id) + '">' + esc(p.name) + "</button>") + "</h3>" + ratingButton("place", p.id, p.cat, p) + "</div>";
    var ov = overall(p);
    if (detail && ov && ov.score != null) html += '<p class="rsum"><strong>' + SCALE[ov.stars][0] + '</strong> "' + SCALE[ov.stars][1] + '"</p>';
    var where = p.area && p.area !== p.town ? (p.town && p.area.indexOf(p.town) < 0 ? p.area + ", " + p.town : p.area) : (p.town || p.area);
    var meta = isApt(p.cat) ? "" : [where, distText(p), p.price].filter(Boolean).join(" · ");
    if (meta) html += '<p class="meta">' + esc(meta) + "</p>";
    html += textsHtml(p, detail);
    html += '<div class="tags">';
    if (p.visibility === "andel") html += '<span class="tag priv">Kun vores andel</span>';
    if (p.visibility === "mig") html += '<span class="tag priv">Kun mig</span>';
    if (showKat) html += '<span class="tag kat">' + esc(CATNAME[p.cat] || p.cat) + "</span>";
    if (detail && p.visits && p.visits.length) html += '<span class="tag">' + esc("Vi har besøgt " + visitsText(p.visits).slice(7)) + "</span>";
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
      if (p.mine && p.mine.status === "wish") html += '<button class="btn small" type="button" data-move="' + esc(p.id) + '">Flyt til "Har prøvet"</button>';
      if (!p.mine && detail) html += '<button class="btn small" type="button" data-move="' + esc(p.id) + '">Vi har været her</button><button class="btn small" type="button" data-wish="' + esc(p.id) + '">Sæt på vores "Vil prøve"</button>';
    }
    html += "</div>";
    if (detail && p.town) html += '<p class="meta">Mere i <button class="linkbtn" type="button" data-town="' + esc(p.town) + '">' + esc(p.town) + "</button>" + (regionOf(p.town) !== NO_REGION && regionOf(p.town) !== p.town ? ' · <button class="linkbtn" type="button" data-region="' + esc(regionOf(p.town)) + '">' + esc(regionOf(p.town)) + "</button>" : "") + "</p>";
    return html + "</article>";
}

/* ---------- forside (to bud, A og B, kan skiftes øverst) ---------- */
var HOME_TILES = [["spisesteder", "Spisesteder"], ["strande", "Strande"], ["natur", "Natur og udsigt"], ["sevaerdigheder", "Seværdigheder"], ["oplevelser", "Oplevelser"], ["dagsture", "Dagsture"],
  ["byer", "Byer"], ["dagligvarer", "Indkøb"], ["sport", "Sport"], ["lejligheden", "Hotellet"], ["alle", "Alle steder"], ["kort", "Kort"]];
/* Forsidebillede til et felt: det bedst bedømte sted med billede – og aldrig samme sted på to felter */
function coverFor(list, used) {
  used = used || {};
  var w = list.filter(function (p) { return p.photos && p.photos.length && !used[p.id]; }).sort(function (a, b) { return (b.status === "tried") - (a.status === "tried") || scoreOf(b) - scoreOf(a); })[0];
  if (!w) return "";
  used[w.id] = 1; return photoUrl(w.photos[0]);
}
function miniCard(p, extra) {
  var v = overall(p), img = p.photos && p.photos[0] ? photoUrl(p.photos[0]) : "";
  return '<button type="button" class="hcard" data-open="' + esc(p.id) + '">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="hnoimg">' + (CAT_ICONS[p.cat] || "") + "</span>") +
    '<span class="hname">' + esc(p.name) + '</span><span class="hmeta">' + (v ? '<span class="hstars">' + starRow(v.stars) + "</span> " : "") + esc([p.town, CATNAME[p.cat]].filter(Boolean).join(" · ")) + "</span>" +
    (extra ? '<span class="hextra">' + extra + "</span>" : "") + "</button>";
}
function homeRow(title, items, empty) {
  return '<section class="hrow"><h2 class="subhead">' + esc(title) + "</h2>" + (items.length ? '<div class="hscroll">' + items.join("") + "</div>" : '<p class="hint">' + esc(empty) + "</p>") + "</section>";
}
function newsItems() {
  var byId = {}; places.forEach(function (p) { byId[p.id] = p; });
  return raw.exps.filter(function (e) { return e.kind === "place" && byId[e.target] && (e.note || e.rating_score != null); })
    .sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); }).slice(0, 10)
    .map(function (e) { return miniCard(byId[e.target], esc(authorText(e)) + (e.rating_score != null ? " · " + dec(+e.rating_score) + " ★" : "") + (e.note ? '<span class="hquote">"' + esc(e.note.length > 70 ? e.note.slice(0, 68) + "…" : e.note) + '"</span>' : "")); });
}
function wishItems() {
  return places.filter(function (p) { return p.mine && p.mine.status === "wish"; }).sort(function (a, b) { return scoreOf(b) - scoreOf(a); }).slice(0, 10).map(function (p) { return miniCard(p); });
}
function renderHome() {
  var spots = places.filter(function (p) { return !isApt(p.cat); });
  var hotel = places.filter(function (p) { return p.cat === "lejligheden" && p.photos && p.photos.length; })[0];
  var hero = hotel ? photoUrl(hotel.photos[0]) : coverFor(spots);
  setTop(headerHtml() + '<section class="hero"' + (hero ? ' style="--hero:url(&quot;' + esc(hero) + '&quot;)"' : "") + '><div class="herotext"><p>Hej ' + esc(me.name || "") + '</p><p class="herosub">Andel ' + esc(me.label) + " · " + spots.length + " steder i guiden</p></div></section>");
  var sc = statusCounts(); toolbar(true, sc.tried, sc.wish);
  var html = "";
  if (ui.msg) html += '<p class="notice" role="status">' + esc(ui.msg) + "</p>";
  if (ui.draft) html += formHtml(ui.draft);
  if (ui.areaDraft) html += areaFormHtml(ui.areaDraft);
  spots = spots.filter(function (p) { return p.status === ui.status; });
  var homeMap = ui.view === "kort";
  if (homeMap) html += '<div class="mapwrap"><div id="map" role="region" aria-label="Kort over stederne"></div><p class="hint">' + spots.filter(function (p) { return p.lat != null; }).length + " af " + spots.length + " steder har en placering og vises på kortet.</p></div>";
  var used = {}; if (hotel) used[hotel.id] = 1;
  if (!homeMap)
  html += '<div class="tiles">' + HOME_TILES.map(function (t) {
    var list = t[0] === "alle" || t[0] === "kort" ? spots : t[0] === "dagsture" ? spots.filter(function (p) { return regionDrive(regionOf(p.town)) >= DAYTRIP_MIN; }) : t[0] === "byer" ? spots : places.filter(function (p) { return p.cat === t[0]; });
    var n = t[0] === "byer" ? allTownNames().filter(function (x) { return placesIn(x).length; }).length : t[0] === "kort" ? null : list.length;
    var img = coverFor(list, used);
    return '<button type="button" class="tile" data-hometile="' + t[0] + '"' + (img ? ' style="--img:url(&quot;' + esc(img) + '&quot;)"' : "") + ">" + (img ? "" : '<span class="ticon">' + (CAT_ICONS[t[0] === "kort" ? "dagsture" : t[0]] || CAT_ICONS.alle) + "</span>") + '<span class="tlabel">' + esc(t[1]) + (n != null ? ' <span class="tn">' + n + "</span>" : "") + "</span></button>";
  }).join("") + "</div>";
  html += homeRow("Nyt fra andelshaverne", newsItems(), "Når andelshaverne skriver og giver stjerner, kommer det her.");
  html += homeRow('Jeres "Vil prøve"', wishItems(), 'Tryk "Sæt på vores Vil prøve" på et sted, så kommer det her.');
  html += homeRow("Bedst bedømt", spots.filter(function (p) { return overall(p); }).sort(function (a, b) { return scoreOf(b) - scoreOf(a); }).slice(0, 10).map(function (p) { return miniCard(p); }), "Ingen vurderinger endnu.");
  html += homeRow("Senest besøgt af jer", spots.filter(function (p) { return p.mine && p.mine.status === "tried"; }).sort(function (a, b) { return lastKey(b).localeCompare(lastKey(a)); }).slice(0, 10).map(function (p) { return miniCard(p); }), "Når I har været et sted, kommer det her.");
  html += footerHtml();
  if (ui.editor && !ui.draft) {
    if (ui.chooser) html += '<div class="chooser" role="menu"><button class="btn primary" type="button" id="new-photo">Vælg billeder</button><button class="btn" type="button" id="new-manual">Uden billede (fx et sted vi vil prøve)</button></div>';
    html += '<button class="fab" type="button" id="new" aria-label="Nyt sted" aria-expanded="' + !!ui.chooser + '"><span aria-hidden="true">' + (ui.chooser ? "×" : "+") + "</span> " + (ui.chooser ? "Luk" : "Nyt sted") + "</button>";
  }
  root.innerHTML = html;
  if (homeMap) drawMap(spots, []);
  slim.innerHTML = ""; slim.classList.remove("show"); panel.hidden = true;
}
function statusCounts() {
  var spots = places.filter(function (p) { return !isApt(p.cat); }), t = spots.filter(function (p) { return p.status === "tried"; }).length;
  return { tried: t, wish: spots.length - t };
}

/* ---------- fast top og værktøjslinje: samme sted og samme udseende på alle sider ---------- */
var topEl = document.getElementById("top"), tbEl = document.getElementById("toolbar"), tbInput = null, tbCtrl = null, tbClear = null;
function setTop(h) { topEl.innerHTML = h; }
function toolbar(show, tried, wish) {
  tbEl.hidden = !show; if (!show) return;
  if (!tbInput) {
    tbEl.innerHTML = '<div class="tsearch">' + ICON_SEARCH + '<input id="tq" type="search" placeholder="Hvad leder du efter?" autocomplete="off" enterkeyhint="search" aria-label="Søg"><button type="button" class="tclear" data-tb="clear" aria-label="Ryd søgning" hidden>×</button></div><div class="tctrl"></div>';
    tbInput = tbEl.querySelector("#tq"); tbCtrl = tbEl.querySelector(".tctrl"); tbClear = tbEl.querySelector(".tclear");
    tbInput.addEventListener("input", function () { ui.q = tbInput.value; tbClear.hidden = !ui.q; render(); });
  }
  if (document.activeElement !== tbInput) tbInput.value = ui.q || "";
  tbClear.hidden = !(ui.q || "");
  var toMap = ui.view !== "kort";
  tbCtrl.innerHTML = '<div class="seg small" role="group" aria-label="Liste"><button type="button" data-status="tried" aria-pressed="' + (ui.status === "tried") + '">Har prøvet (' + tried + ')</button><button type="button" data-status="wish" aria-pressed="' + (ui.status === "wish") + '">Vil prøve (' + wish + ")</button></div>" +
    '<div class="seg small" role="group" aria-label="Hvis indhold"><button type="button" data-scope="alle" aria-pressed="' + (ui.scope !== "vores") + '">Alle andele</button><button type="button" data-scope="vores" aria-pressed="' + (ui.scope === "vores") + '">Kun vores</button></div>' +
    '<button class="iconbtn viewbtn" type="button" data-view="' + (toMap ? "kort" : "liste") + '" aria-label="' + (toMap ? "Vis på kort" : "Vis som gitter") + '" title="' + (toMap ? "Vis på kort" : "Vis som gitter") + '">' + (toMap ? ICON_MAP : ICON_LIST) + "</button>";
}

var APTS = ["lejligheden", "vores"];
function isApt(c) { return APTS.indexOf(c) >= 0; }
function render() {
  // Ikke logget ind / ingen andel: kun velkomst og login. Egne sider: Vores andel, Regler og privatliv.
  if (!ui.member || ui.page) { renderGate(); return; }
  if (ui.cat === "hjem" && !ui.place && !(ui.q || "").trim()) { renderHome(); return; }
  var APT = ui.cat, inApt = isApt(ui.cat), inTowns = ui.cat === "byer", inTrips = ui.cat === "dagsture";
  var spots = places.filter(function (p) { return !isApt(p.cat); });
  var byStatus = spots.filter(function (p) { return p.status === ui.status; });
  var rated = function (p) { var v = overall(p); return !ui.minRating || (v ? v.stars : 0) >= ui.minRating; };
  var counts = { alle: byStatus.length };
  CATS.forEach(function (c) { counts[c[0]] = byStatus.filter(function (p) { return p.cat === c[0]; }).length; });
  APTS.forEach(function (a) { counts[a] = places.filter(function (p) { return p.cat === a; }).length; });
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
    head = areaHeader("region", ui.region);
    var rt = townsInRegion(ui.region).filter(townShown);
    if (rt.length) grid = '<h2 class="subhead">Byer i ' + esc(ui.region) + '</h2><div class="towns">' + rt.map(function (n) { return areaCard("town", n, ui.status); }).join("") + "</div>";
    if (inReg.length) grid += '<h2 class="subhead">Steder i ' + esc(ui.region) + "</h2>" + subChips(inReg, "Kategori");
    list = inReg.filter(function (p) { return (!ui.sub || p.cat === ui.sub) && rated(p); });
  } else if (inTowns && ui.town) {
    var inTown = byStatus.filter(function (p) { return p.town === ui.town; });
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
      var hay = [p.name, p.area, p.town, regionOf(p.town), p.note, (p.texts || []).map(function (e) { return e.note; }).join(" "), p.website, CATNAME[p.cat], subName(p.cat, p.subcat), p.status === "wish" ? "vil prøve" : "har prøvet"].join(" ").toLowerCase();
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

  setTop(headerHtml()); toolbar(true, tried, wish);
  var html = "";
  if (ui.msg) html += '<p class="notice" role="status">' + esc(ui.msg) + "</p>";
  if (ui.login) html += loginHtml();
  if (ui.draft) html += formHtml(ui.draft);
  if (ui.areaDraft) html += areaFormHtml(ui.areaDraft);

  var f = "";
  // Knappen viser den visning, man skifter TIL: kort-ikon i listen, liste-ikon på kortet
  var toMap = ui.view !== "kort";
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
  var summary = searching ? 'Søgning: "' + ui.q.trim() + '"' : [ui.scope === "vores" && !inApt ? "Kun vores" : "", inApt ? "" : (ui.status === "wish" ? "Vil prøve" : "Har prøvet"), ui.cat === "alle" ? "Alle" : ui.cat === "byer" ? "Byer" : ui.cat === "dagsture" ? "Dagsture" : CATNAME[ui.cat], ui.subcat && ui.subcat !== "__ingen" ? subName(ui.cat, ui.subcat) : "", ui.fOpen ? "uden sæsonlukkede" : "", ui.fSun ? "søndagsåbent" : "", ui.fEarly ? "åbent før kl. 20" : "", ui.region || "", ui.town || ui.ftown || "", ui.sub ? CATNAME[ui.sub] : "",
    ui.minRating ? ui.minRating + "+ ★" : "", ui.sort && ui.sort !== "senest" ? { nyeste: "senest tilføjet", naermeste: "nærmeste først", stjerner: "flest stjerner", navn: "A–Å" }[ui.sort] : ""].filter(Boolean).join(" · ");
  if (detail) {
    html += '<div class="bar detailbar" id="fullbar"></div>';
  } else if (searching) {
    html += '<div class="bar" id="fullbar"><div class="row"><strong>' + list.length + (list.length === 1 ? " sted" : " steder") + ' matcher "' + esc(ui.q.trim()) + '"</strong></div></div>';
  } else html += '<div class="bar" id="fullbar">' + f + "</div>";
  slimBar(summary, f, list ? list.length : null);

  if (detail) { list = [detail]; head = grid = ""; }
  // På kortet erstatter kortet oversigten med by- og områdekort; overskriften for en valgt by/område bliver stående
  // Valgt by/område på kortet: kortet øverst, derefter overskrift og byerne i området
  var areaDetail = ui.view === "kort" && !detail && !searching && (inTowns || inTrips) && !!(ui.town || ui.region);
  if (!searching && !areaDetail) html += head + (ui.view === "kort" && !detail ? (inTrips && !ui.region ? '<p class="hint">Steder i områder mindst ' + DAYTRIP_MIN + ' minutters kørsel fra hotellet.</p>' : "") : grid);
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
    if (areaDetail) html += head + grid;
  }
  html += '<div class="list' + (detail ? "" : " grid") + '">';
  if (!ui.loaded) html += '<p class="empty-state">Henter steder…</p>';
  else if (!list.length && inApt) html += '<p class="empty-state">' + (ui.cat === "vores" ? "Intet om jeres lejlighed endnu. Tryk \"+ Nyt sted\" for at lægge billeder og noter om jeres lejlighed ind – det kan kun jeres andel se." : "Ingen billeder af hotellet endnu.") + "</p>";
  else if (!list.length && searching && !detail) html += '<p class="empty-state">Ingen steder matcher søgningen.</p>';
  else if (!list.length && listView && !((inTowns || inTrips) && (ui.town || ui.region))) html += '<p class="empty-state">' + (ui.status === "wish" ? "Ingen ønsker her endnu." : "Intet her endnu.") + (ui.editor ? ' Tryk "+ Nyt sted" for at tilføje et.' : "") + "</p>";
  list.forEach(function (p) { html += detail ? placeCard(p, true, true) : gridCard(p, ui.cat === "alle" || inTowns || inTrips || searching || isApt(ui.cat)); });
  html += "</div>";

  if (ui.cat === "lejligheden") html += '<section class="practical"><p class="eyebrow">Det praktiske, kort</p><h2>Når I bor på hotellet</h2><dl>';
  if (ui.cat === "lejligheden") PRACTICAL.forEach(function (r) { html += "<dt>" + esc(r.k) + "</dt><dd>" + esc(r.v) + (r.link ? ' <a href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc(r.linkText) + "</a>" : "") + "</dd>"; });
  if (ui.cat === "lejligheden") html += "</dl></section>";
  html += footerHtml();
  if (ui.editor && !ui.draft) {
    if (ui.chooser) html += '<div class="chooser" role="menu"><button class="btn primary" type="button" id="new-photo">Vælg billeder</button><button class="btn" type="button" id="new-manual">Uden billede (fx et sted vi vil prøve)</button></div>';
    html += '<button class="fab" type="button" id="new" aria-label="Nyt sted" aria-expanded="' + !!ui.chooser + '"><span aria-hidden="true">' + (ui.chooser ? "×" : "+") + "</span> " + (ui.chooser ? "Luk" : "Nyt sted") + "</button>";
  }
  root.innerHTML = html;
  if (mapList) {
    // Store, næsten gennemsigtige cirkler om byerne (Byer) eller områderne (Dagsture); tryk på en cirkel åbner byen/området
    var areas = [];
    if (inTowns && !ui.town && !ui.region) areas = allTownNames().filter(townShown).map(function (n) { return { kind: "town", name: n, pts: placesIn(n) }; });
    else if ((inTowns || inTrips) && ui.region) areas = townsInRegion(ui.region).filter(townShown).map(function (n) { return { kind: "town", name: n, pts: placesIn(n) }; });
    else if (inTrips) areas = tripRegions.map(function (r) {
      var pts = byStatus.filter(function (p) { return regionOf(p.town) === r; });
      townsInRegion(r).filter(townShown).forEach(function (n) { var c = townCenter(n); if (c) pts = pts.concat([{ lat: c[0], lon: c[1] }]); });
      return { kind: "region", name: r, pts: pts };
    });
    drawMap(mapList, areas, areaDetail);
  }
  wireCarousels();
  watchBar();
}

/* ---------- kortvisning (Leaflet + OpenStreetMap) ---------- */
var CAT_COLORS = { lejligheden: "#0d5c6b", vores: "#0d5c6b", spisesteder: "#c0392b", strande: "#e1a21b", natur: "#2e8b57", sevaerdigheder: "#7d3c98", oplevelser: "#d35400", sport: "#1f77b4", dagligvarer: "#6b8e23", opladning: "#16a085", parkering: "#5d6d7e", shopping: "#c2185b" };
var mapObj = null, mapView = null;
function areaCircle(a) {
  var pts = a.pts.filter(function (p) { return p.lat != null; });
  var t = a.kind === "town" ? towns[a.name] : null;
  if (!pts.length && t && t.lat != null) pts = [{ lat: t.lat, lon: t.lon }];
  if (!pts.length) return null;
  var lat = pts.reduce(function (s, p) { return s + p.lat; }, 0) / pts.length, lon = pts.reduce(function (s, p) { return s + p.lon; }, 0) / pts.length;
  var r = Math.max.apply(null, pts.map(function (p) { return distM(lat, lon, p.lat, p.lon); }));
  return { lat: lat, lon: lon, n: a.pts.length, r: Math.max(r * 1.25 + (a.kind === "town" ? 400 : 1500), a.kind === "town" ? 1500 : 4000) };
}
function goArea(kind, name) {
  nav(function () {
    ui.place = null;
    if (kind === "town") { ui.town = name; ui.region = null; ui.cat = "byer"; }
    else { ui.region = name; ui.town = null; if (ui.cat !== "byer") ui.cat = "dagsture"; }
    ui.sub = null;
  });
}
function drawMap(list, areas, focus) {
  var el = document.getElementById("map"); if (!el || !window.L) return;
  if (mapObj) { mapView = { c: mapObj.getCenter(), z: mapObj.getZoom(), key: mapObj._bolKey }; mapObj.remove(); mapObj = null; }
  var m = L.map(el, { scrollWheelZoom: true, tap: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
  var pts = [];
  var labels = [], circles = [];
  var sizeCircles = function () {
    var z = m.getZoom();
    circles.forEach(function (ci) { var lat = ci.getLatLng().lat, mpp = 40075016.686 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z + 8); ci.setRadius(Math.max(22, ci._bolR / mpp)); });
  };
  (areas || []).forEach(function (a) {
    var c = areaCircle(a); if (!c) return;
    pts.push([c.lat, c.lon]);
    // Cirklen følger det rigtige område i meter, men er aldrig mindre end 22 punkter, så den altid kan rammes
    var circ = L.circleMarker([c.lat, c.lon], { radius: 22, color: "#0d5c6b", weight: 1.5, opacity: 0.55, fillColor: "#0d5c6b", fillOpacity: 0.1 }).addTo(m)
      .bindTooltip(esc(a.name), { permanent: true, interactive: true, direction: "center", className: "arealabel" })
      .on("click", function () { goArea(a.kind, a.name); });
    circ._bolR = c.r; circles.push(circ);
    labels.push({ t: circ.getTooltip(), n: c.n });
  });
  // Navne der ville ligge oven i hinanden skjules; byen med flest steder vinder. Zoom ind for at se resten.
  var declutter = function () {
    var taken = [];
    labels.slice().sort(function (a, b) { return b.n - a.n; }).forEach(function (l) {
      var el = l.t.getElement(); if (!el) return; el.style.visibility = "";
      var r = el.getBoundingClientRect();
      var hit = taken.some(function (o) { return r.left < o.right + 4 && r.right > o.left - 4 && r.top < o.bottom + 2 && r.bottom > o.top - 2; });
      if (hit) el.style.visibility = "hidden"; else taken.push(r);
    });
  };
  m.on("zoomend", sizeCircles);
  m.on("zoomend moveend", declutter);
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
    // En valgt by/et område: zoom ind på det (uden hotellet). Ellers: de nære steder plus hotellet.
    var box = focus ? pts : (near.length ? near : pts).concat([[CFG.hotel.lat, CFG.hotel.lon]]);
    if (focus) (areas || []).forEach(function (a) { var c = areaCircle(a); if (c) { var d = c.r / 111320; box = box.concat([[c.lat - d, c.lon - d], [c.lat + d, c.lon + d]]); } });
    m.fitBounds(L.latLngBounds(box), { padding: [30, 30], maxZoom: focus ? 14 : 15 });
  } else m.setView([CFG.hotel.lat, CFG.hotel.lon], 11);
  mapObj = m;
  sizeCircles(); setTimeout(declutter, 50);
}

/* ---------- smal menulinje øverst + søgning ---------- */
var ICON_SEARCH = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
var ICON_MAP = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 4 3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>';
var ICON_LIST = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="4" width="7" height="7" rx="1.5"/><rect x="13.5" y="4" width="7" height="7" rx="1.5"/><rect x="3.5" y="14" width="7" height="7" rx="1.5"/><rect x="13.5" y="14" width="7" height="7" rx="1.5"/></svg>';
var ICON_BACK = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';
var ICON_HOME = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>';
var ICON_FILTER = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6h18M6 12h12M10 18h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
var slim = document.getElementById("slim"), panel = document.getElementById("filterpanel");
function slimBar(summary, filters, n) {
  slim.innerHTML = '<button type="button" class="slim-sum" data-toggle-panel>' + ICON_FILTER + '<span>' + esc(summary) + "</span></button>" + navBtns() + '<button class="iconbtn" type="button" data-open-search aria-label="Søg">' + ICON_SEARCH + "</button>";
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
function openSearch() { ui.panel = false; window.scrollTo({ top: 0 }); render(); if (tbInput) tbInput.focus(); }
function closeSearch() { ui.q = ""; if (tbInput) tbInput.value = ""; render(); }
document.addEventListener("click", function (e) {
  var t = e.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-open-search")) { openSearch(); return; }
  if (t.dataset.nav === "back") { goBack(); return; }
  if (t.dataset.nav === "home") { goHome(); return; }
  if (t.hasAttribute("data-toggle-panel")) {
    var wasOpen = ui.panel; ui.panel = !ui.panel; render();
    if (wasOpen) { var b = document.getElementById("fullbar"); if (b) window.scrollTo({ top: b.getBoundingClientRect().bottom + window.scrollY - 58 }); }
    return;
  }
  if (t.id === "q-clear" || t.dataset.tb === "clear") { closeSearch(); if (tbInput) tbInput.focus(); return; }
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

/* ---------- top, bund, velkomst ---------- */
function navBtns() {
  if (!ui.member) return "";
  return (navStack.length ? '<button class="iconbtn" type="button" data-nav="back" aria-label="Tilbage" title="Tilbage">' + ICON_BACK + "</button>" : "") +
    (!atStart() ? '<button class="iconbtn" type="button" data-nav="home" aria-label="Til forsiden" title="Til forsiden">' + ICON_HOME + "</button>" : "");
}
function headerHtml() {
  return '<header><div><p class="eyebrow">Andelshavernes guide · Costa Cálida</p><h1>Laderita de Bolnuevo</h1></div><div class="hbtns">' + navBtns() + "</div></header>";
}
function footerHtml() {
  var h = "<footer><span>Afstand og tid er i bil fra hotellet, beregnet uden trafik.</span>";
  if (me) h += '<span><button class="linkbtn" type="button" data-page="andel">Vores andel (' + esc(me.label) + ")</button>" + (me.admin ? ' · <button class="linkbtn" type="button" data-page="admin">Administration</button>' : "") + "</span>";
  if (ui.member) h += '<span><button class="linkbtn" type="button" id="open-import">Importér billeder fra PC</button></span>';
  h += '<span><button class="linkbtn" type="button" data-page="regler">Regler og privatliv</button></span>';
  if (ui.user) h += "<span>Logget ind som " + esc(ui.user.email) + '. <button class="linkbtn" type="button" id="logout">Log ud</button></span>';
  return h + "</footer>";
}
function renderGate() {
  setTop(headerHtml()); toolbar(false);
  var html = "";
  if (ui.msg) html += '<p class="notice" role="status">' + esc(ui.msg) + "</p>";
  if (ui.checking) html += '<p class="loading">Henter…</p>';
  else if (ui.page === "regler") html += pageBack() + RULES_HTML;
  else if (ui.page === "andel" && ui.member) html += pageBack() + andelPageHtml();
  else if (ui.page === "admin" && me && me.admin) html += pageBack() + adminPageHtml();
  else if (!ui.user) {
    html += '<section class="welcome"><p class="lead">Andelshavernes egne tips til lokalområdet: spisesteder, strande, udsigtspunkter, dagsture og det praktiske. Adgang kun via invitation fra en andelshaver.</p></section>';
    if (!ui.login) ui.login = { mode: "login" };
    html += loginHtml();
  } else if (!ui.member) {
    html += '<section class="panel"><h2>Ingen invitation endnu</h2><p>Du er logget ind som <strong>' + esc(ui.user.email) + "</strong>, men den mail er ikke inviteret til guiden.</p>" +
      "<p>Bed en andelshaver om at invitere dig med præcis denne mailadresse. Når invitationen er sendt, så tryk på knappen herunder.</p>" +
      '<div class="row"><button class="btn primary" type="button" id="recheck">Jeg er inviteret nu – prøv igen</button><button class="btn" type="button" id="logout">Log ud</button></div></section>';
  }
  html += '<footer><span><button class="linkbtn" type="button" data-page="regler">Regler og privatliv</button></span></footer>';
  root.innerHTML = html;
  slim.innerHTML = ""; slim.classList.remove("show"); panel.hidden = true;
}
function pageBack() { return ""; }

/* ---------- Vores andel: medlemmer, invitationer, billeder med personer ---------- */
var andelData = null;
async function loadAndel() {
  var m = await sb.from("members").select("*").eq("andel_id", me.andel).order("created_at");
  andelData = { members: m.data || [], err: m.error ? m.error.message : "" };
  render();
}
function andelPageHtml() {
  var d = andelData, owner = me.role === "ejer" || me.admin;
  var h = '<section class="panel andelpage"><p class="eyebrow">Vores andel</p><h2>Andel ' + esc(me.label) + "</h2>" +
    '<p class="hint">Ejere og gæster ser og kan det samme i guiden. Kun ejere kan give og fjerne adgang.</p>';
  if (!d) { loadAndel(); return h + "<p>Henter…</p></section>"; }
  h += '<ul class="members">' + d.members.map(function (m) {
    var you = m.user_id === ui.user.id;
    return "<li><span><strong>" + esc(m.name || m.email) + "</strong> " + (m.role === "ejer" ? "Ejer" : "Gæst") + (you ? " (dig)" : "") + '<br><span class="hint">' + esc(m.email) + (m.user_id ? "" : " · inviteret, har ikke logget ind endnu") + "</span></span>" +
      (owner && !you ? '<button class="btn small danger" type="button" data-rmmember="' + esc(m.email) + '">' + (ui.confirmRm === m.email ? "Tryk igen for at fjerne" : "Fjern adgang") + "</button>" : "") + "</li>";
  }).join("") + "</ul>";
  if (owner) h += '<form id="invite-form" class="invite"><h3>Invitér en person</h3><div class="grid"><label>Fornavn<input id="i-name" required placeholder="Fx Emma"></label><label>Mail<input id="i-email" type="email" required placeholder="navn@mail.dk"></label></div>' +
    '<div class="seg small" role="group" aria-label="Rolle"><button type="button" data-irole="gaest" aria-pressed="' + (ui.irole !== "ejer") + '">Gæst</button><button type="button" data-irole="ejer" aria-pressed="' + (ui.irole === "ejer") + '">Ejer</button></div>' +
    '<button class="btn primary" type="submit">Invitér</button></form>';
  if (ui.inviteText) h += '<div class="invitetext"><p class="hint">Send denne besked til personen (sms, WhatsApp eller mail):</p><textarea readonly id="invite-copy">' + esc(ui.inviteText) + '</textarea><button class="btn small" type="button" id="copy-invite">Kopiér beskeden</button></div>';
  if (d.err) h += '<p class="err">' + esc(d.err) + "</p>";
  h += "</section>";
  // Billeder med personer, som kun vores andel kan se
  var ph = raw.photos.filter(function (p) { return p.andel_id === me.andel && (p.faces !== false || p.visibility !== "alle"); });
  if (ph.length) {
    h += '<section class="panel"><h2>Billeder med personer (' + ph.length + ")</h2>" +
      '<p class="hint">Billeder, hvor guiden har fundet personer (eller ikke kunne tjekke). De er som udgangspunkt kun for jeres andel. Tryk "Alle" på et billede, hvis andre andelshavere gerne må se det.</p>' +
      '<div class="pgrid">' + ph.map(function (p) {
        return '<div class="pcell"><img src="' + esc(photoUrl(p.path)) + '" alt="" loading="lazy"><div class="seg small" role="group" aria-label="Hvem kan se billedet">' +
          [["alle", "Alle"], ["andel", "Vores andel"], ["mig", "Kun mig"]].map(function (o) { return '<button type="button" data-setvis="' + esc(p.id) + '" data-v="' + o[0] + '" aria-pressed="' + (p.visibility === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div></div>";
      }).join("") + "</div></section>";
  }
  return h;
}
async function invite() {
  var name = document.getElementById("i-name").value.trim(), email = document.getElementById("i-email").value.trim().toLowerCase(), role = ui.irole === "ejer" ? "ejer" : "gaest";
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { andelData.err = "Skriv fornavn og en gyldig mail."; render(); return; }
  var r = await sb.from("members").insert({ andel_id: me.andel, email: email, name: name, role: role, invited_by: ui.user.id });
  if (r.error) { andelData.err = /duplicate|unique/i.test(r.error.message) ? "Den mail er allerede inviteret." : "Invitationen blev ikke gemt: " + r.error.message; render(); return; }
  ui.inviteText = "Hej " + name + ". Du er inviteret til Laderita de Bolnuevo guide – andelshavernes tips til området omkring hotellet. Åbn " + location.origin + location.pathname +
    ', tryk "Første gang: opret adgangskode" og brug mailen ' + email + ". Du får en mail, hvor du bekræfter, og så er du med.";
  andelData.err = ""; await loadAndel();
}
async function removeMember(email) {
  if (ui.confirmRm !== email) { ui.confirmRm = email; render(); return; }
  ui.confirmRm = null;
  var r = await sb.from("members").delete().eq("andel_id", me.andel).eq("email", email);
  if (r.error) andelData.err = "Adgangen blev ikke fjernet: " + r.error.message;
  await loadAndel();
}
async function setPhotoVis(id, v) {
  var r = await sb.from("photos").update({ visibility: v }).eq("id", id);
  if (!r.error) { var p = raw.photos.filter(function (x) { return x.id === id; })[0]; if (p) p.visibility = v; decorate(); }
  else ui.msg = "Det blev ikke gemt: " + r.error.message;
  render();
}

/* ---------- administration (kun administrator): andele ---------- */
var adminData = null;
async function loadAdmin() {
  var a = await sb.from("andele").select("*").order("lejlighed").order("nummer");
  var m = await sb.from("members").select("andel_id,email,name,role,user_id");
  adminData = { andele: a.data || [], members: m.data || [], err: a.error ? a.error.message : "" };
  render();
}
function adminPageHtml() {
  var d = adminData;
  var h = '<section class="panel"><p class="eyebrow">Administration</p><h2>Andele</h2>';
  if (!d) { loadAdmin(); return h + "<p>Henter…</p></section>"; }
  h += '<ul class="members">' + d.andele.map(function (a) {
    var ms = d.members.filter(function (m) { return m.andel_id === a.id; });
    return "<li><span><strong>" + esc(a.lejlighed + "-" + a.nummer) + "</strong>" + (a.aktiv ? "" : " (solgt)") + '<br><span class="hint">' + esc(ms.map(function (m) { return (m.name || m.email) + (m.role === "ejer" ? " (ejer)" : "") + (m.user_id ? "" : " – inviteret"); }).join(", ") || "Ingen medlemmer") + "</span></span>" +
      (a.aktiv ? '<button class="btn small" type="button" data-sold="' + esc(a.id) + '">' + (ui.confirmSold === a.id ? "Tryk igen: andelen er solgt" : "Marker som solgt") + "</button>" : "") + "</li>";
  }).join("") + "</ul>";
  h += '<form id="newandel-form" class="invite"><h3>Opret andel og invitér første ejer</h3><div class="grid"><label>Lejlighed<input id="n-lejl" required placeholder="101" inputmode="numeric"></label><label>Andelshavernummer<input id="n-num" required placeholder="043" inputmode="numeric"></label></div>' +
    '<div class="grid"><label>Ejerens fornavn<input id="n-name" required></label><label>Ejerens mail<input id="n-email" type="email" required></label></div><button class="btn primary" type="submit">Opret andel</button></form>';
  if (ui.inviteText) h += '<div class="invitetext"><p class="hint">Send denne besked til ejeren:</p><textarea readonly id="invite-copy">' + esc(ui.inviteText) + '</textarea><button class="btn small" type="button" id="copy-invite">Kopiér beskeden</button></div>';
  if (d.err) h += '<p class="err">' + esc(d.err) + "</p>";
  h += '<p class="hint">"Marker som solgt" lukker andelens adgang. Deres private indhold følger ikke med til køberen, som får en ny andel med samme nummer.</p>';
  return h + "</section>";
}
async function createAndel() {
  var g = function (id) { return document.getElementById(id).value.trim(); };
  var lejl = g("n-lejl"), num = g("n-num"), name = g("n-name"), email = g("n-email").toLowerCase();
  if (!lejl || !num || !name || !email) { adminData.err = "Udfyld alle felter."; render(); return; }
  var a = await sb.from("andele").insert({ lejlighed: lejl, nummer: num }).select().single();
  if (a.error) { adminData.err = /unique|duplicate/i.test(a.error.message) ? "Andel " + lejl + "-" + num + " findes allerede." : "Andelen blev ikke oprettet: " + a.error.message; render(); return; }
  var m = await sb.from("members").insert({ andel_id: a.data.id, email: email, name: name, role: "ejer", invited_by: ui.user.id });
  if (m.error) { adminData.err = "Andelen er oprettet, men ejeren blev ikke inviteret: " + m.error.message; render(); return; }
  ui.inviteText = "Hej " + name + ". Du er inviteret til Laderita de Bolnuevo guide som ejer af andel " + lejl + "-" + num + ". Åbn " + location.origin + location.pathname +
    ', tryk "Første gang: opret adgangskode" og brug mailen ' + email + ". Bagefter kan du selv invitere familie og venner under \"Vores andel\" nederst på siden.";
  adminData.err = ""; await loadAdmin();
}
async function markSold(id) {
  if (ui.confirmSold !== id) { ui.confirmSold = id; render(); return; }
  ui.confirmSold = null;
  var r = await sb.from("andele").update({ aktiv: false }).eq("id", id);
  if (r.error) adminData.err = "Det blev ikke gemt: " + r.error.message;
  await loadAdmin();
}

var RULES_HTML = '<article class="panel rules"><h2>Regler og privatliv</h2>' +
  "<h3>Hvad er guiden?</h3><p>Laderita de Bolnuevo guide er andelshavernes egne tips til lokalområdet: spisesteder, strande, udsigtspunkter, seværdigheder, dagsture, indkøb og det praktiske. Alt er skrevet af andelshavere og deres gæster, ud fra egne besøg.</p>" +
  "<p>Guiden handler om <strong>lokalområdet</strong> – ikke om hotellet, foreningen eller andre andelshavere. Spørgsmål og ris/ros om hotellet hører til hos bestyrelsen.</p>" +
  "<h3>Hvem har adgang?</h3><ul><li><strong>Ejere</strong> – andelshavere. En andel har et nummer, fx 101-043 (lejlighed 101, andelshavernummer 043). En andel kan have flere ejere.</li>" +
  "<li><strong>Gæster</strong> – familie og venner, som ejerne giver adgang. Gæster ser og kan det samme som ejerne; det eneste, ejere kan ud over gæster, er at give og fjerne adgang for andre på deres andel.</li>" +
  "<li>Man kommer kun ind via invitation.</li><li>Ved salg af en andel følger andelsnummeret med til køberen – det gør jeres private indhold ikke.</li></ul>" +
  "<h3>Hvad hører hjemme i guiden?</h3><ul><li>Steder og oplevelser i området, med jeres ærlige vurdering.</li><li>Skriv om stedet, ikke om personer. Ingen navne på ansatte, ingen personangreb.</li>" +
  "<li>Billeder af andre end jeres egen familie: kun med deres accept.</li><li>Ingen reklame for egen virksomhed eller udlejning.</li><li>Opdater gerne åbningstider og praktiske oplysninger – alle kan rette dem, fordi de ændrer sig hele tiden.</li></ul>" +
  "<p>Administratoren kan fjerne indhold, der ikke hører hjemme her, og lukke adgang ved gentagne overtrædelser.</p>" +
  "<h3>Hvem kan se hvad?</h3><ul><li><strong>Alle</strong> – alle andelshavere og gæster i guiden.</li><li><strong>Vores andel</strong> – kun ejere og gæster på jeres andel.</li><li><strong>Kun mig</strong> – kun dig (steder og billeder).</li></ul>" +
  '<p>Standard er "Alle" for steder, stjerner og tekster; stjerner og tekst kan sættes til "Vores andel". For billeder foreslår guiden "Vores andel", hvis der er personer på billedet, og ellers "Alle". Ved en tekst står dit fornavn og jeres andelsnummer, fx "Christian (101-043)".</p>' +
  "<h3>Hvad gemmer guiden?</h3><ul><li>Dit navn, din mailadresse og hvilken andel du hører til.</li><li>Det, du selv lægger ind: steder, vurderinger, tekster og billeder.</li>" +
  "<li>Billeder gemmes i mindre størrelse og <strong>uden GPS-placering</strong>. Placeringen og tjekket for personer sker kun på din egen telefon eller computer.</li><li>Vi bruger ikke cookies til sporing og sælger eller deler ikke data med nogen.</li></ul>" +
  "<p><strong>Hvor ligger data?</strong> I en database hos Supabase i Stockholm (EU). Selve siden hentes fra GitHub. Kortene og opslag af adresser kommer fra OpenStreetMap; når du søger et sted eller bruger din placering, sendes søgningen/koordinaterne til OpenStreetMap.</p>" +
  "<h3>Slet din konto</h3><p>Du kan til enhver tid bede om at få din konto slettet sammen med alt, du har lagt ind – eller få en kopi af det. Skriv til administratoren.</p>" +
  '<h3>Kontakt</h3><p>Administrator: Christian Sorgenfrey (101-043)<br>Mail: <a href="mailto:c@sorgenfrey.net">c@sorgenfrey.net</a> · WhatsApp: <a href="https://wa.me/4529919966">+45 29 91 99 66</a></p></article>';

/* ---------- login ---------- */
function loginHtml() {
  var l = ui.login;
  return '<form class="panel" id="login-form"><h2>Log ind</h2>' +
    '<div class="seg" role="group" aria-label="Login"><button type="button" id="to-login" aria-pressed="' + (l.mode !== "signup") + '">Jeg har en adgangskode</button><button type="button" id="to-signup" aria-pressed="' + (l.mode === "signup") + '">Første gang: opret adgangskode</button></div>' +
    (l.mode === "signup" ? '<p class="hint">Brug den mail, du er inviteret med, og vælg en adgangskode. Du får en mail, hvor du bekræfter, og så kan du logge ind.</p>' : "") +
    '<label>Mail<input type="email" id="l-email" autocomplete="email" required value="' + esc(l.email || "") + '"></label>' +
    '<label>Adgangskode<input type="password" id="l-pass" autocomplete="' + (l.mode === "signup" ? "new-password" : "current-password") + '" required minlength="8"></label>' +
    (l.info ? '<p class="hint">' + esc(l.info) + "</p>" : "") + (l.err ? '<p class="err" role="alert">' + esc(l.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit">' + (l.mode === "signup" ? "Opret adgangskode" : "Log ind") + "</button>" + (ui.user ? '<button class="btn" type="button" id="close-login">Annuller</button>' : "") + "</div></form>";
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
  ui.msg = ""; ui.loaded = false; render();
  await load();
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
  ui.draft.vis = ui.draft.cat === "vores" ? "andel" : "alle"; ui.draft.expVis = "alle";
  ui.draft.items.forEach(suggestVis);
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
    visits: [], guess: false, lat: null, lon: null, link: "", website: "", maps: "", items: [], removed: [], info: 'Skriv navnet og tryk "Find på kortet", så finder siden by, placering og køretid.', vis: ui.cat === "vores" ? "andel" : "alle", expVis: "alle" };
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
    return '<div class="ph"><img src="' + esc(it.url || photoUrl(it.path)) + '" alt="">' + (i === 0 ? '<span class="first">Forsidebillede</span>' : "") + visBtn(it, i) +
      '<div class="row">' + (i > 0 ? '<button class="btn small" type="button" data-first="' + i + '">Gør til forside</button>' : "") +
      '<button class="btn small danger" type="button" data-rm="' + i + '">Slet</button></div></div>';
  }).join("");
  var core = canEditCore(f.isNew ? null : raw.places.filter(function (x) { return x.id === f.id; })[0]), dis = core ? "" : " disabled";
  if (f.isNew && !f.more) return quickHtml(f);
  return '<form class="panel" id="editor"><h2>' + (f.isNew ? "Nyt sted" : "Ret sted") + "</h2>" +
    (f.finding ? '<p class="hint">Finder stedet ud fra billedet…</p>' : "") + (f.info ? '<p class="hint">' + esc(f.info) + "</p>" : "") +
    (f.lat == null && !f.finding ? '<div><button class="btn" type="button" id="my-loc">Brug min placering</button></div>' : "") +
    (core ? "" : '<p class="hint">Navn, by, kategori og placering kan kun rettes af den, der oprettede stedet. Alt andet – fx åbningstider, links og jeres egen vurdering – kan I rette.</p>') +
    '<div class="grid"><label>Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Restaurante La Siesta"' + dis + '></label><label>By<input id="f-town" list="townlist" value="' + esc(f.town || "") + '" placeholder="Puerto de Mazarrón"' + dis + '></label><datalist id="townlist">' + allTownNames().sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist></div>" +
    '<label>Sted/område (valgfrit)<input id="f-area" value="' + esc(f.area) + '" placeholder="Plaza del Muelle"' + dis + "></label>" +
    linkFields(f) +
    '<div class="grid"><label>Kategori<select id="f-cat"' + dis + ">" + opts + "</select></label>" + (SUBCATS[f.cat] ? '<label>Underkategori<select id="f-subcat"' + dis + '><option value="">Ikke valgt</option>' + SUBCATS[f.cat].map(function (x) { return '<option value="' + x[0] + '"' + (f.subcat === x[0] ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select></label>" : "") + '<label>Liste<select id="f-status"><option value="tried"' + (f.status === "tried" ? " selected" : "") + '>Har prøvet</option><option value="wish"' + (f.status === "wish" ? " selected" : "") + ">Vil prøve</option></select></label>" + '<label>Pris<select id="f-price">' + pr + "</select></label></div>" +
    questionsHtml(f) +
    '<label>Vores beskrivelse<textarea id="f-note" placeholder="Bestil dagens fisk. Book bord lørdag aften.">' + esc(f.note) + "</textarea></label>" +
    '<div class="grid"><label>Hvem kan se vores stjerner og tekst?<select id="f-expvis"><option value="alle"' + (f.expVis !== "andel" ? " selected" : "") + '>Alle</option><option value="andel"' + (f.expVis === "andel" ? " selected" : "") + ">Vores andel</option></select></label>" +
    (core ? '<label>Hvem kan se stedet?<select id="f-vis">' + ["alle", "andel", "mig"].map(function (v) { return '<option value="' + v + '"' + ((f.vis || "alle") === v ? " selected" : "") + ">" + VIS_NAMES[v] + "</option>"; }).join("") + "</select></label>" : "") + "</div>" +
    '<div><p class="hint" style="margin-bottom:8px">Jeres billeder (det første vises først). Tryk på mærket på et billede for at vælge, hvem der kan se det.' + (f.otherPhotos ? " Stedet har også " + f.otherPhotos + " billeder fra andre andele." : "") + '</p><div class="photos">' + ph + "</div>" +
    '<label class="btn" style="display:inline-flex;margin-top:10px;color:var(--fg)">+ Tilføj billeder<input type="file" id="f-add" accept="image/*" multiple hidden></label></div>' +
    '<div class="grid"><label>Vi har besøgt (fx 2025-02, 2026-07)<input id="f-visits" value="' + esc((f.visits || []).join(", ")) + '"></label><label>Placering (bredde, længde)<input id="f-pos" inputmode="decimal" value="' + (f.lat != null ? esc(f.lat + ", " + f.lon) : "") + '" placeholder="37.5654, -1.2584"' + dis + "></label></div>" +
    '<label class="inline"><input type="checkbox" id="f-guess"' + (f.guess ? " checked" : "") + "> Navnet er ikke bekræftet</label>" +
    (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + '</button><button class="btn" type="button" id="cancel">Annuller</button>' +
    (!f.isNew && core ? '<button class="btn danger" type="button" id="del-place">' + (f.confirmDel ? "Tryk igen for at slette stedet" : "Slet sted") + "</button>" : "") + "</div></form>";
}
function visBtn(it, i) {
  var label = it.file && it.people === undefined ? "Tjekker for personer…" : VIS_NAMES[it.vis || "andel"] + (it.file && it.people === null && !it.visSet ? " (kunne ikke tjekke)" : "");
  return '<button type="button" class="visbtn v-' + (it.vis || "andel") + '" data-vis="' + i + '" title="Hvem kan se billedet? Tryk for at skifte">' + esc(label) + "</button>";
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
  var thumbs = f.items.map(function (it, i) { return '<div class="qthumb"><img src="' + esc(it.url || photoUrl(it.path)) + '" alt="">' + visBtn(it, i) + "</div>"; }).join("");
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
    (thumbs ? '<div class="qthumbs">' + thumbs + "</div>" : "") +
    '<label class="btn" style="display:inline-flex;align-self:flex-start;color:var(--fg)">+ Tilføj billeder (valgfrit)<input type="file" id="f-add" accept="image/*" multiple hidden></label>' +
    (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + "</button>" +
    '<button class="btn" type="button" id="more">Tilføj beskrivelse, karakter m.m.</button><button class="btn" type="button" id="cancel">Annuller</button></div></form>';
  return '<form class="panel" id="editor"><h2>Nyt sted</h2>' +
    '<div class="qthumbs">' + thumbs + '</div><p class="hint">Billeder med personer bliver kun vist for jeres andel. Tryk på mærket for at ændre det.</p>' +
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
  if (v("f-expvis") != null) d.expVis = v("f-expvis");
  if (v("f-vis") != null) d.vis = v("f-vis");
}

function editPlace(id) {
  var p = places.filter(function (x) { return x.id === id; })[0]; if (!p) return;
  var ours = (p.photoRows || []).filter(function (x) { return x.andel_id === me.andel || x.owner === ui.user.id; });
  ui.draft = { isNew: false, id: p.id, link: p.link || "", website: p.website || "", maps: p.maps_url || "", lastVisit: p.mine ? p.mine.last_visit : null, town: p.town || "", cat: p.cat, subcat: p.subcat || "", facts: JSON.parse(JSON.stringify(p.facts || {})), status: p.mine ? p.mine.status || "tried" : "tried", name: p.name, area: p.area || "", note: p.note || "", rating: null, price: p.price || "", visits: (p.visits || []).slice(), guess: !!p.guess, lat: p.lat, lon: p.lon,
    vis: p.visibility || "alle", expVis: p.mine ? p.mine.visibility : "alle", otherPhotos: (p.photoRows || []).length - ours.length,
    items: ours.map(function (x) { return { path: x.path, id: x.id, vis: x.visibility, origVis: x.visibility, people: x.faces }; }), removed: [] };
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

/* Er der personer på billedet? Tjekkes i browseren (billedet sendes ingen steder hen). Svar: true/false, eller null hvis tjekket ikke kunne køre. */
var detector = null;
function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function getDetector() {
  if (detector !== null) return detector;
  detector = (async function () {
    try {
      if (!window.tf) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
      if (!window.cocoSsd) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js");
      return await window.cocoSsd.load({ base: "lite_mobilenet_v2" });
    } catch (e) { return false; }
  })();
  return detector;
}
async function hasPeople(file) {
  try {
    var det = await getDetector(); if (!det) return null;
    var bm = await createImageBitmap(file, { resizeWidth: 640, resizeQuality: "medium" });
    var c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height; c.getContext("2d").drawImage(bm, 0, 0); bm.close && bm.close();
    var preds = await det.detect(c, 20, 0.35);
    return preds.some(function (p) { return p.class === "person" && p.bbox[3] / c.height >= 0.12; });
  } catch (e) { return null; }
}
/* Nye billeder: tjek for personer og foreslå synlighed (personer → Vores andel, ellers Alle) */
function suggestVis(item) {
  item.people = undefined; item.vis = item.vis || null;
  hasPeople(item.file).then(function (p) { item.people = p; if (!item.visSet) item.vis = p === false ? "alle" : "andel"; render(); });
}
var VIS_NAMES = { alle: "Alle", andel: "Vores andel", mig: "Kun mig" };
function nextVis(v) { return v === "alle" ? "andel" : v === "andel" ? "mig" : "alle"; }

/* Upload til andelens mappe; billederne gemmes mindre og uden GPS (canvas fjerner placeringen) */
async function uploadFiles(target, files, onProgress) {
  var paths = [];
  for (var i = 0; i < files.length; i++) {
    if (onProgress) onProgress(i + 1, files.length);
    var blob = await shrink(files[i]);
    var path = me.andel + "/" + target + "/" + Date.now().toString(36) + i + ".jpg";
    var up = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (up.error) throw new Error("Et billede blev ikke uploadet: " + up.error.message);
    paths.push(path);
  }
  return paths;
}
async function addPhotoRows(kind, target, rows) {
  if (!rows.length) return;
  var r = await sb.from("photos").insert(rows.map(function (x, i) { return { kind: kind, target: target, path: x.path, andel_id: me.andel, owner: ui.user.id, visibility: x.vis || "andel", faces: x.people === true, sort: x.sort != null ? x.sort : 100 + i }; }));
  if (r.error) throw new Error("Billederne blev ikke gemt: " + r.error.message);
}
/* Upload af filer + synlighed ud fra personer (bruges af "+ Billeder" og importen) */
async function uploadWithVis(kind, target, files, progress) {
  var items = [];
  for (var i = 0; i < files.length; i++) {
    if (progress) progress("Tjekker billede " + (i + 1) + " af " + files.length + " for personer…");
    var p = await hasPeople(files[i]); items.push({ people: p, vis: p === false ? "alle" : "andel" });
  }
  var paths = await uploadFiles(kind === "place" ? target : kind + "-" + slug(target), files, function (i, n) { if (progress) progress("Uploader billede " + i + " af " + n + "…"); });
  paths.forEach(function (p, i) { items[i].path = p; });
  await addPhotoRows(kind, target, items);
  return items;
}
async function addPhotosTo(placeId, files, opts) {
  opts = opts || {};
  var p = places.filter(function (x) { return x.id === placeId; })[0] || raw.places.filter(function (x) { return x.id === placeId; })[0]; if (!p || !files.length) return;
  ui.busy = true;
  try {
    var items = await uploadWithVis("place", placeId, files, function (t) { ui.msg = t; render(); });
    var pi = await readPhotoInfo(files), visits = ((p.mine && p.mine.visits) || []).slice();
    (opts.months || [pi.month]).forEach(function (m) { if (m && visits.indexOf(m) < 0) visits.push(m); }); visits.sort();
    var r = await saveExp("place", placeId, { status: "tried", visits: visits, last_visit: newestVisit(p.mine && p.mine.last_visit, visits, opts.last || pi.date) });
    if (r.error) throw new Error("Besøget blev ikke gemt: " + r.error.message);
    var priv = items.filter(function (x) { return x.vis !== "alle"; }).length;
    ui.msg = files.length + (files.length === 1 ? " billede" : " billeder") + " tilføjet til " + p.name + "." + (priv ? " " + priv + " med personer er kun synlige for jeres andel (kan ændres under \"Vores andel\")." : "");
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
  if (d.items.some(function (it) { return it.file && it.people === undefined; })) { d.err = "Vent et øjeblik – billederne bliver tjekket for personer."; render(); return; }
  ui.busy = true; d.err = ""; render();
  try {
    var orig = raw.places.filter(function (x) { return x.id === d.id; })[0], core = d.isNew || canEditCore(orig);
    var fix = function (u) { u = (u || "").trim(); return u && !/^https?:\/\//i.test(u) ? "https://" + u : u; };
    var web = fix(d.website), maps = fix(d.maps), link = fix(d.link);
    [web, link].forEach(function (u) { if (u && isMapsLink(u) && !maps) maps = u; });   // et Google Maps-link havner i Maps-feltet
    if (isMapsLink(web)) web = ""; if (isMapsLink(link)) link = "";
    if (core && d.lat == null) { var gc = coordsFromLink(maps); if (gc) { d.lat = +gc[0].toFixed(5); d.lon = +gc[1].toFixed(5); if (!d.town) d.town = townFor(d.lat, d.lon, {}); } }
    // Fakta, som alle må rette
    var row = { link: link || null, website: web || null, maps_url: maps || null, facts: cleanFacts(d), price: d.price, guess: d.guess, updated_at: new Date().toISOString() };
    if (core) {
      var drive = orig && orig.lat === d.lat && orig.lon === d.lon && orig.drive_min ? { km: orig.drive_km, min: orig.drive_min } : (d.lat != null ? await driveFromHotel(d.lat, d.lon) : null);
      Object.assign(row, { name: d.name.trim(), cat: d.cat, subcat: subName(d.cat, d.subcat) ? d.subcat : null, town: (d.town || "").trim() || null, area: d.area.trim(), lat: d.lat, lon: d.lon,
        drive_km: drive ? drive.km : null, drive_min: drive ? drive.min : null, visibility: d.vis || "alle" });
    }
    var r = d.isNew ? await sb.from("places").insert(Object.assign({ id: d.id, created_by: ui.user.id, andel_id: me.andel }, row))
                    : await sb.from("places").update(row).eq("id", d.id);
    if (r.error) throw new Error("Stedet blev ikke gemt: " + r.error.message);
    // Vores oplevelse
    var e = await saveExp("place", d.id, { status: d.status || "tried", visits: d.visits, last_visit: newestVisit(d.lastVisit, d.visits, d.lastVisit), note: d.note.trim() || null, visibility: d.expVis === "andel" ? "andel" : "alle" });
    if (e.error) throw new Error("Vurderingen blev ikke gemt: " + e.error.message);
    // Billeder: nye uploades, rækkefølge og synlighed gemmes, slettede fjernes
    var newOnes = d.items.filter(function (it) { return it.file; });
    if (newOnes.length) {
      var paths = await uploadFiles(d.id, newOnes.map(function (it) { return it.file; }), function (i, n) { ui.msg = "Uploader billede " + i + " af " + n + "…"; });
      newOnes.forEach(function (it, i) { it.path = paths[i]; it.sort = d.items.indexOf(it); });
      await addPhotoRows("place", d.id, newOnes);
    }
    for (var i = 0; i < d.items.length; i++) {
      var it = d.items[i]; if (!it.id) continue;
      await sb.from("photos").update({ sort: i, visibility: it.vis }).eq("id", it.id);
    }
    if (d.removed.length) {
      await sb.from("photos").delete().in("path", d.removed);
      await sb.storage.from("photos").remove(d.removed);
    }
    var townMsg = core ? await ensureTown(row.town, row.lat, row.lon) : "";
    ui.status = d.status || "tried"; ui.cat = isApt(d.cat) || CATNAME[d.cat] ? d.cat : ui.cat; ui.draft = null; ui.msg = "Gemt." + townMsg;
    await load();
    var hasPhotos = (raw.photos || []).some(function (x) { return x.kind === "place" && x.target === d.id; });
    if (!hasPhotos && (web || link)) await fetchWebImages(d.id, true);
    var el = document.getElementById(d.id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (BOL.afterSave) { ui.busy = false; render(); BOL.afterSave(d.id); return; }
  } catch (err) {
    d.err = err.message || "Noget gik galt. Prøv igen.";
  }
  ui.busy = false; render();
}

async function deletePlace() {
  var d = ui.draft;
  if (!d.confirmDel) { syncDraft(); d.confirmDel = true; render(); return; }
  ui.busy = true; render();
  var r = await sb.from("places").delete().eq("id", d.id);
  if (r.error) { d.err = "Stedet blev ikke slettet: " + r.error.message; ui.busy = false; render(); return; }
  var files = d.items.map(function (x) { return x.path; }).concat(d.removed).filter(Boolean);
  if (files.length) await sb.storage.from("photos").remove(files);
  ui.draft = null; ui.busy = false; ui.msg = "Stedet er slettet."; await load();
}

/* ---------- tilbage og hjem ----------
   Hver gang man går ind i noget (et sted, en kategori, en by, et område, en side), huskes hvor man var.
   Tilbage-pilen (og telefonens egen tilbage) går ét skridt tilbage; huset går til forsiden. */
var navStack = [];
function snap() { return { cat: ui.cat, town: ui.town, region: ui.region, sub: ui.sub, subcat: ui.subcat, ftown: ui.ftown, place: ui.place, page: ui.page, y: window.scrollY }; }
function atStart() { return ui.cat === "hjem" && !ui.town && !ui.region && !ui.place && !ui.page && !ui.subcat && !ui.ftown && !ui.sub && !ui.fOpen && !ui.fSun && !ui.fEarly; }
function nav(change) {
  navStack.push(snap()); if (navStack.length > 60) navStack.shift();
  change(); ui.panel = false;
  try { history.pushState({ nav: navStack.length }, "", ui.place ? "#sted/" + ui.place : (isApt(ui.cat) || CATNAME[ui.cat] || ui.cat === "byer" || ui.cat === "dagsture" || ui.cat === "alle") ? "#" + ui.cat : location.pathname); } catch (x) {}
  render(); window.scrollTo({ top: 0 });
}
function goBack() {
  if (!navStack.length) return;
  try { history.back(); } catch (x) { restore(navStack.pop()); }
}
function restore(s) {
  ui.cat = s.cat; ui.town = s.town; ui.region = s.region; ui.sub = s.sub; ui.subcat = s.subcat; ui.ftown = s.ftown; ui.place = s.place; ui.page = s.page; ui.panel = false;
  if (!ui.page) { andelData = null; adminData = null; }
  render(); window.scrollTo({ top: s.y || 0 });
}
function goHome() {
  if (ui.draft || ui.areaDraft) { ui.msg = "Gem eller annuller først det, du er ved at rette."; render(); return; }
  navStack = []; ui.page = null; resetToStart();
}
window.addEventListener("popstate", function () {
  if (navStack.length) { restore(navStack.pop()); return; }
  var m = (location.hash || "").match(/^#sted\/(.+)$/);
  ui.place = m ? decodeURIComponent(m[1]) : null; render(); window.scrollTo({ top: 0 });
});
function openPlace(id) { nav(function () { ui.place = id; }); }
function closePlace() { if (navStack.length) goBack(); else { ui.place = null; try { history.replaceState(null, "", location.pathname); } catch (x) {} render(); } }

/* ---------- ret by / område ---------- */
function slug(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function startAreaEdit(kind, name) {
  var o = (kind === "town" ? towns[name] : regions[name]) || {};
  var ours = (o.photoRows || []).filter(function (x) { return x.andel_id === me.andel || x.owner === ui.user.id; });
  ui.areaDraft = { kind: kind, name: name, region: kind === "town" ? (o.region || "") : "", newRegion: "", note: o.note || "", visits: ((o.mine && o.mine.visits) || []).slice(), lastVisit: o.mine ? o.mine.last_visit : null,
    expVis: o.mine ? o.mine.visibility : "alle", items: ours.map(function (x) { return { path: x.path, id: x.id, vis: x.visibility, people: x.faces }; }), removed: [], err: "" };
  ui.msg = ""; render();
  var f = document.getElementById("area-editor"); if (f) window.scrollTo({ top: f.getBoundingClientRect().top + window.scrollY - 16, behavior: "smooth" });
}
function areaFormHtml(f) {
  var ph = f.items.map(function (it, i) {
    return '<div class="ph"><img src="' + esc(it.url || photoUrl(it.path)) + '" alt="">' + (i === 0 ? '<span class="first">Forsidebillede</span>' : "") + visBtn(it, i).replace("data-vis=", "data-avis=") +
      '<div class="row">' + (i > 0 ? '<button class="btn small" type="button" data-afirst="' + i + '">Gør til forside</button>' : "") + '<button class="btn small danger" type="button" data-arm="' + i + '">Slet</button></div></div>';
  }).join("");
  var regs = regionNames().filter(function (r) { return r !== NO_REGION; });
  var regSel = f.kind === "town" ? '<label>Område<select id="a-region"><option value="">Intet område</option>' + regs.map(function (r) { return '<option' + (f.region === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") +
    '<option value="__ny"' + (f.region === "__ny" ? " selected" : "") + '>Nyt område…</option></select></label>' + (f.region === "__ny" ? '<label>Navn på nyt område<input id="a-newregion" value="' + esc(f.newRegion) + '" placeholder="Fx Costa Blanca"></label>' : "") : "";
  return '<form class="panel" id="area-editor"><h2>Ret ' + (f.kind === "town" ? "byen " : "området ") + esc(f.name) + "</h2>" + regSel +
    '<label>Vores beskrivelse<textarea id="a-note" placeholder="Hvad er værd at se, hvor parkerer man, hvad skal man spise?">' + esc(f.note) + "</textarea></label>" +
    '<div><p class="hint" style="margin-bottom:8px">Billeder (det første vises først)</p><div class="photos">' + ph + "</div>" +
    '<label class="btn" style="display:inline-flex;margin-top:10px;color:var(--fg)">+ Tilføj billeder<input type="file" id="a-add" accept="image/*" multiple hidden></label></div>' +
    '<label>Vi har besøgt (fx 2025-02, 2026-07)<input id="a-visits" value="' + esc(f.visits.join(", ")) + '"></label>' +
    '<label>Hvem kan se vores tekst?<select id="a-expvis"><option value="alle"' + (f.expVis !== "andel" ? " selected" : "") + '>Alle</option><option value="andel"' + (f.expVis === "andel" ? " selected" : "") + ">Vores andel</option></select></label>" +
    (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + '</button><button class="btn" type="button" id="a-cancel">Annuller</button></div></form>';
}
function syncArea() {
  var f = ui.areaDraft, g = function (id) { return document.getElementById(id); }; if (!f) return;
  if (g("a-region")) f.region = g("a-region").value;
  if (g("a-newregion")) f.newRegion = g("a-newregion").value;
  if (g("a-note")) f.note = g("a-note").value;
  if (g("a-visits")) f.visits = g("a-visits").value.split(/[,\s]+/).filter(function (s) { return /^\d{4}-\d{2}$/.test(s); }).sort();
  if (g("a-expvis")) f.expVis = g("a-expvis").value;
}
async function saveArea() {
  syncArea(); var f = ui.areaDraft;
  if (f.items.some(function (it) { return it.file && it.people === undefined; })) { f.err = "Vent et øjeblik – billederne bliver tjekket for personer."; render(); return; }
  ui.busy = true; f.err = ""; render();
  try {
    var newOnes = f.items.filter(function (it) { return it.file; });
    var info = newOnes.length ? await readPhotoInfo(newOnes.map(function (it) { return it.file; })) : {};
    if (info.month && f.visits.indexOf(info.month) < 0) { f.visits.push(info.month); f.visits.sort(); }
    if (f.kind === "town") {
      var reg = f.region === "__ny" ? f.newRegion.trim() : f.region;
      if (reg && !regions[reg]) { var nr = await sb.from("regions").insert({ name: reg }); if (nr.error) throw new Error("Området blev ikke oprettet: " + nr.error.message); }
      var tr = towns[f.name] ? await sb.from("towns").update({ region: reg || null, updated_at: new Date().toISOString() }).eq("name", f.name) : await sb.from("towns").insert({ name: f.name, region: reg || null });
      if (tr.error) throw new Error("Byen blev ikke gemt: " + tr.error.message);
    } else if (!regions[f.name]) await sb.from("regions").insert({ name: f.name });
    var e = await saveExp(f.kind, f.name, { visits: f.visits, last_visit: newestVisit(f.lastVisit, f.visits, info.date), note: f.note.trim() || null, visibility: f.expVis === "andel" ? "andel" : "alle" });
    if (e.error) throw new Error("Det blev ikke gemt: " + e.error.message);
    if (newOnes.length) {
      var paths = await uploadFiles(f.kind + "-" + slug(f.name), newOnes.map(function (it) { return it.file; }));
      newOnes.forEach(function (it, i) { it.path = paths[i]; it.sort = f.items.indexOf(it); });
      await addPhotoRows(f.kind, f.name, newOnes);
    }
    for (var i = 0; i < f.items.length; i++) { var it = f.items[i]; if (it.id) await sb.from("photos").update({ sort: i, visibility: it.vis }).eq("id", it.id); }
    if (f.removed.length) { await sb.from("photos").delete().in("path", f.removed); await sb.storage.from("photos").remove(f.removed); }
    ui.areaDraft = null; ui.msg = "Gemt."; await load();
  } catch (err) { f.err = err.message || "Noget gik galt. Prøv igen."; }
  ui.busy = false; render();
}
async function addPhotosToArea(kind, name, files, opts) {
  opts = opts || {};
  ui.busy = true;
  try {
    var o = (kind === "town" ? towns[name] : regions[name]) || {};
    if (kind === "town" && !towns[name]) {
      var row = { name: name, region: opts.region || null };
      if (opts.lat != null) { row.lat = +opts.lat.toFixed(5); row.lon = +opts.lon.toFixed(5); var dr = await driveFromHotel(row.lat, row.lon); if (dr) { row.drive_km = dr.km; row.drive_min = dr.min; } }
      var t = await sb.from("towns").insert(row); if (t.error) throw new Error("Byen blev ikke oprettet: " + t.error.message);
    }
    if (kind === "region" && !regions[name]) await sb.from("regions").insert({ name: name });
    await uploadWithVis(kind, name, files, function (t) { ui.msg = t; render(); });
    var pi = await readPhotoInfo(files), visits = ((o.mine && o.mine.visits) || []).slice();
    (opts.months || [pi.month]).forEach(function (m) { if (m && visits.indexOf(m) < 0) visits.push(m); }); visits.sort();
    var e = await saveExp(kind, name, { visits: visits, last_visit: newestVisit(o.mine && o.mine.last_visit, visits, opts.last || pi.date) });
    if (e.error) throw new Error("Besøget blev ikke gemt: " + e.error.message);
    ui.msg = files.length + (files.length === 1 ? " billede" : " billeder") + " tilføjet til " + name + "."; await load();
    ui.busy = false; render(); return true;
  } catch (err) { ui.msg = err.message || "Billederne blev ikke uploadet. Prøv igen."; }
  ui.busy = false; render(); return false;
}

/* ---------- hændelser ---------- */
document.addEventListener("click", async function (e) {
  if (!root.contains(e.target) && !panel.contains(e.target) && !tbEl.contains(e.target) && !topEl.contains(e.target)) return;
  var sl = e.target.closest(".slide"), art = sl && sl.closest("article.place[data-pid]");
  if (art && !art.classList.contains("detailcard")) { openPlace(art.dataset.pid); return; }
  var t = e.target.closest("button"); if (!t) return;
  if (t.dataset.open) { openPlace(t.dataset.open); return; }
  if (t.hasAttribute("data-closeplace")) { closePlace(); return; }
  if (t.dataset.status) { ui.status = t.dataset.status; render(); return; }
  if (t.dataset.town != null) { var tw = t.dataset.town; nav(function () { ui.place = null; ui.town = tw || null; ui.region = null; ui.sub = null; if (ui.town) ui.cat = "byer"; }); return; }
  if (t.dataset.region != null) { var rg = t.dataset.region; nav(function () { ui.place = null; ui.region = rg || null; ui.town = null; ui.sub = null; if (ui.region && ui.cat !== "byer") ui.cat = "dagsture"; }); return; }
  if (t.dataset.fopen) { ui.fOpen = !ui.fOpen; render(); return; }
  if (t.dataset.fsun) { ui.fSun = !ui.fSun; render(); return; }
  if (t.dataset.fearly) { ui.fEarly = !ui.fEarly; render(); return; }
  if (t.dataset.subcat != null) { ui.subcat = t.dataset.subcat || null; render(); return; }
  if (t.dataset.filtertown != null) { ui.ftown = t.dataset.filtertown || null; render(); return; }
  if (t.dataset.sub != null) { ui.sub = t.dataset.sub || null; render(); return; }
  if (t.dataset.sort) { ui.sort = t.dataset.sort; render(); return; }
  if (t.dataset.view) { ui.view = t.dataset.view; render(); return; }
  if (t.dataset.scope) { ui.scope = t.dataset.scope; decorate(); render(); return; }
  if (t.dataset.cat) { var ct = t.dataset.cat; if (ct === ui.cat && !ui.town && !ui.region) return; nav(function () { ui.town = null; ui.region = null; ui.ftown = null; ui.subcat = null; ui.fOpen = false; ui.fSun = false; ui.fEarly = false; ui.sub = null; ui.cat = ct; }); return; }
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
    var r = await saveExp("place", t.dataset.move, { status: "tried", visits: mv, last_visit: today });
    ui.msg = r.error ? "Det blev ikke gemt. Prøv igen." : "Lagt under \"Har prøvet\" for jeres andel."; decorate(); render(); return;
  }
  if (t.dataset.wish) {
    var rw = await saveExp("place", t.dataset.wish, { status: "wish" });
    ui.msg = rw.error ? "Det blev ikke gemt. Prøv igen." : "Lagt på jeres \"Vil prøve\"-liste."; decorate(); render(); return;
  }
  if (t.dataset.hometile) { var ht = t.dataset.hometile; nav(function () { ui.place = null; ui.town = null; ui.region = null; ui.sub = null; ui.subcat = null; ui.ftown = null; if (ht === "kort") { ui.cat = "alle"; ui.view = "kort"; } else { ui.cat = ht; ui.view = "liste"; } }); return; }
  if (t.id === "near-me") {
    if (!navigator.geolocation) { ui.nearErr = "Telefonen kan ikke give placeringen her."; render(); return; }
    t.textContent = "Finder din placering…";
    navigator.geolocation.getCurrentPosition(function (pos) { ui.nearMe = [pos.coords.latitude, pos.coords.longitude]; ui.nearErr = ""; render(); }, function () { ui.nearErr = "Placeringen blev ikke givet."; render(); }, { timeout: 15000 });
    return;
  }
  if (t.dataset.page != null) { var pg = t.dataset.page; ui.inviteText = ""; andelData = null; adminData = null; if (!pg && navStack.length) { goBack(); return; } nav(function () { ui.page = pg || null; }); return; }
  if (t.dataset.rmmember) { removeMember(t.dataset.rmmember); return; }
  if (t.dataset.irole) { ui.irole = t.dataset.irole; render(); return; }
  if (t.dataset.setvis) { setPhotoVis(t.dataset.setvis, t.dataset.v); return; }
  if (t.dataset.sold) { markSold(t.dataset.sold); return; }
  if (t.id === "copy-invite") { var ta = document.getElementById("invite-copy"); ta.select(); try { navigator.clipboard.writeText(ta.value); t.textContent = "Kopieret"; } catch (x) { document.execCommand("copy"); } return; }
  if (t.id === "recheck") { await checkUser(); if (ui.member) { ui.loaded = false; await load(); } else { ui.msg = "Der er stadig ingen invitation til " + ui.user.email + "."; render(); } return; }
  if (t.dataset.vis != null && ui.draft) { syncDraft(); var vi = ui.draft.items[+t.dataset.vis]; vi.vis = nextVis(vi.vis || "andel"); vi.visSet = true; render(); return; }
  if (t.dataset.avis != null && ui.areaDraft) { syncArea(); var va = ui.areaDraft.items[+t.dataset.avis]; va.vis = nextVis(va.vis || "andel"); va.visSet = true; render(); return; }
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
  if (t.id === "logout") { await sb.auth.signOut(); ui.user = null; ui.editor = false; ui.member = false; me = null; ui.draft = null; ui.page = null; places = []; raw = { places: [], towns: [], regions: [], exps: [], photos: [] }; render(); return; }
});
root.addEventListener("submit", function (e) {
  e.preventDefault();
  if (e.target.id === "editor") saveDraft();
  if (e.target.id === "login-form") submitLogin();
  if (e.target.id === "area-editor") saveArea();
  if (e.target.id === "invite-form") invite();
  if (e.target.id === "newandel-form") createAndel();
});
root.addEventListener("change", function (e) {
  if (e.target.id === "a-region") { syncArea(); render(); return; }
  if (e.target.id === "f-cat") { syncDraft(); render(); return; }
  if (e.target.id === "a-add") { syncArea(); Array.prototype.forEach.call(e.target.files, function (f) { var it = { file: f, url: URL.createObjectURL(f) }; ui.areaDraft.items.push(it); suggestVis(it); }); render(); return; }
  if (e.target.id === "f-add") {
    syncDraft();
    Array.prototype.forEach.call(e.target.files, function (f) { var it = { file: f, url: URL.createObjectURL(f) }; ui.draft.items.push(it); suggestVis(it); });
    render();
  }
});
document.addEventListener("change", function (e) {
  var sel = e.target.closest("select[data-select]"); if (!sel) return;
  if (sel.dataset.select === "rating") ui.minRating = +sel.value;
  if (sel.dataset.select === "sort") ui.sort = sel.value;
  if (sel.dataset.select === "scope") { ui.scope = sel.value; decorate(); }
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
var APP_VERSION = 57;
async function checkForUpdate() {
  try {
    var r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    var j = await r.json();
    if (j && j.v > APP_VERSION && !ui.draft && !ui.busy && !(window.BOL && window.BOL.importing)) location.replace(location.pathname + "?v=" + j.v + location.hash);
  } catch (e) { /* ingen forbindelse; prøv igen næste gang */ }
}
/* Åbnes appen igen efter mere end 30 minutter, starter den forfra på "Alle" som liste */
var hiddenAt = 0;
function resetToStart() {
  if (ui.draft || ui.areaDraft || ui.busy || (window.BOL && window.BOL.importing)) return;
  ui.cat = "hjem"; ui.view = "liste"; ui.town = null; ui.region = null; ui.ftown = null; ui.subcat = null; ui.sub = null; ui.place = null;
  ui.fOpen = ui.fSun = ui.fEarly = false; ui.minRating = 0; ui.q = ""; ui.msg = ""; ui.page = null; navStack = [];
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  render(); window.scrollTo({ top: 0 });
}
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000) resetToStart();
  checkForUpdate();
});
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
