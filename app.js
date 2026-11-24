(function () {
"use strict";

var CFG = window.BOLNUEVO;
var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });

var CATS = [["lejligheden","Hotellet"],["vores","Lejligheden"],["spisesteder","Spisesteder"],["strande","Strande"],["natur","Natur og udsigt"],["sevaerdigheder","Seværdigheder"],["oplevelser","Oplevelser"],["sport","Sport"],["dagligvarer","Dagligvarer"],["opladning","Opladning til elbil"],["parkering","Parkering"],["lejebil","Lejebil"],["shopping","Shopping"]];
var CATNAME = {}; CATS.forEach(function (c) { CATNAME[c[0]] = c[1]; });
/* Underkategorier pr. kategori (valgfrie). Rækkefølgen her er rækkefølgen på knapperne. */
var SUBCATS = {
  spisesteder: [["restaurant","Restaurant"],["barcafe","Bar/café"],["strandbar","Strandbar (chiringuito)"],["is","Is og bageri"]],
  strande: [["bystrand","Bystrand"],["bugt","Bugt og vig"],["naturstrand","Naturstrand"]],
  natur: [["udsigt","Udsigtspunkt"],["vandretur","Vandretur og sti"],["fanomen","Naturfænomen"],["naturpark","Naturpark"]],
  sevaerdigheder: [["kirke","Kirke og kloster"],["borg","Borg, tårn og fæstning"],["palads","Palads"],["museum","Museum"],["historisk","Historisk sted"],["have","Have og park"],["bymiljo","Havn og bymiljø"]],
  oplevelser: [["spa","Bad og spa"],["vin","Vin og smagning"],["baad","Bådtur"],["action","Action (rafting o.l.)"],["familie","Børn og familie"],["fest","Marked og fest"]],
  sport: [["padel","Padel"],["pickleball","Pickleball"],["tennis","Tennis"],["golf","Golf"],["cykel","Cykling"],["fitness","Løb og fitness"],["svoemning","Svømning"],["dykning","Dykning og snorkling"],["vandsport","Vandsport (SUP, kajak, sejlads)"],["fiskeri","Fiskeri"],["klatring","Klatring"],["ridning","Ridning"],["petanque","Petanque"]],
  dagligvarer: [["supermarked","Supermarked"],["marked","Marked"],["bager","Bager"],["slagter","Slagter og fisk"]],
  opladning: [["lynlader","Lynlader"],["normal","Normallader"]],
  parkering: [["gratis","Gratis parkering"],["betalt","Betalt parkering"],["phus","P-hus og kælder"],["autocamper","Autocamper"]],
  shopping: [["marked","Marked"],["butik","Butik"],["center","Indkøbscenter"],["outlet","Outlet"]]
};
function subName(cat, sc) { var l = SUBCATS[cat] || []; for (var i = 0; i < l.length; i++) if (l[i][0] === sc) return l[i][1]; return ""; }
var MONTHS = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
/* Det praktiske om hotellet ligger nu som beskrivelse på stedet "Laderita de Bolnuevo" (facts.beskrivelse) */

var places = [];
/* Rå data fra databasen; "places", "towns" og "regions" bygges ud fra dem (se decorate) */
var raw = { places: [], towns: [], regions: [], exps: [], photos: [] };
var visitCounts = {}, favCounts = {};   // antal husstande, der har markeret et sted som besøgt / favorit (ikke hvem)
var me = null;          // { andel, label, role, name, admin } for den indloggede
var authors = {};       // bruger-id -> { name, label }
var andelLabels = {};   // andel-id -> "101-043" (eller "102-025 m.fl.")
var andelNums = {};     // andel-id -> [{ l: lejlighed, n: nummer }, …]
var ui = { checking: true, view: "liste", scope: "alle", cat: "hjem", status: "tried", editor: false, user: null, draft: null, login: null, msg: "", busy: false, loaded: false };
// Som app på hjemmeskærmen starter den altid på "Alle" (undtagen lige efter en automatisk opdatering)
var isApp = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
var h = (location.hash || "").slice(1); if ((CATNAME[h] || h === "byer" || h === "dagsture" || h === "alle") && (!isApp || /[?&]v=/.test(location.search))) ui.cat = h;
if (/^sted\//.test(h)) ui.place = decodeURIComponent(h.slice(5));
// Startmenuen er under test: vises kun via QR-koden på skærmen (?fra=skaerm) eller ?menu=test – ellers er guiden forsiden som før
// Huskes på enheden, så testmenuen bliver ved, selvom adressen ændrer sig (fx ved automatisk opdatering). ?menu=off slår den fra igen.
var TEST_MENU = /[?&](fra=skaerm|menu=test)/.test(location.search);
var TEST_ONCE = /[?&]menu=vis/.test(location.search);   // kun dette besøg – huskes ikke på enheden
try {
  if (TEST_ONCE) TEST_MENU = true;
  else if (/[?&]menu=off/.test(location.search)) localStorage.removeItem("bol_testmenu");
  else if (TEST_MENU) localStorage.setItem("bol_testmenu", "1");
  else TEST_MENU = localStorage.getItem("bol_testmenu") === "1";
} catch (x) {}
ui.menu = TEST_MENU && ui.cat === "hjem" && !ui.place;
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
  // Navn + adresse + by, så Google ikke finder et sted med samme navn et helt andet sted i Spanien
  var where = [p.area && p.area !== p.town ? p.area : "", p.town || (p.area ? "" : "Mazarrón")].filter(Boolean).join(", ");
  // Steder med et rigtigt navn søges på navnet, så Google viser selve stedet (fx Plaza de España) og ikke bare en nål.
  // Naturspots, parkering og ladestandere har ofte egne navne, som Google ikke kender – dem viser vi med placeringen.
  var byCoord = ["natur", "parkering", "opladning", "vores", "lejligheden"].indexOf(p.cat) >= 0;
  var q = (p.lat == null || !byCoord) ? (p.name + ", " + where + ", España") : (p.lat + "," + p.lon);
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
  lejebil: ["Udlejervurdering", [["pris", "Pris"], ["service", "Service og afhentning"], ["bil", "Bilen"]]],
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
/* Den samlede vurdering = gennemsnittet af alle andeles vurderinger (jeres egen tæller med) */
function overall(o) {
  if (o && o.avg_score != null) { var a = +o.avg_score; return { score: a, stars: Math.round(a), avg: true }; }
  if (o && o.rating_score != null) { var s = +o.rating_score; return { score: s, stars: Math.round(s) }; }
  return null;
}
function scoreOf(o) { var v = overall(o); return v ? (v.score != null ? v.score : v.stars) : 0; }
/* Kort i listen: kun de udfyldte stjerner (3 = tre stjerner), så der altid er plads */
function onStars(n) { var s = ""; for (var i = 1; i <= Math.max(1, Math.round(n)); i++) s += '<span class="on">★</span>'; return s; }
function starRow(n) { var s = ""; for (var i = 1; i <= 5; i++) s += '<span class="' + (i <= n ? "on" : "off") + '">' + (i <= n ? "★" : "☆") + "</span>"; return s; }
/* Lille knap ved navnet. Tryk åbner vurderingsvinduet. */
/* Har vores andel vurderet: vores stjerner + (hvis andre også har) "Alle 4,2 (3)". Ellers: gennemsnittet af alle. */
function ratingButton(kind, key, cat, o, compact) {
  if (!CRITERIA[cat]) return "";
  var v = overall(o), n = (o && o.n_rated) || 0, own = o && o.rating_score != null ? +o.rating_score : null;
  if (!v && !ui.editor) return "";
  var label = v ? "Alle andele: " + dec(v.score) + " ud af 5, " + SCALE[v.stars][0] + ", " + n + (n === 1 ? " vurdering" : " vurderinger") + (own != null ? ". Din vurdering: " + dec(own) : "") + ". Tryk for at se eller give din vurdering" : "Giv din vurdering";
  var attrs = ' data-rateopen="' + kind + '" data-key="' + esc(key) + '"';
  // Kort i listen: én stjerne + karakter + antal (fx "★ 3,8 (12)"), så der altid er plads på telefonen
  var big = compact
    ? '<button type="button" class="rbtn rone' + (v ? "" : " empty") + '"' + attrs + ' aria-label="' + esc(label) + '"><span class="rstars" aria-hidden="true"><span class="' + (v ? "on" : "off") + '">' + (v ? "★" : "☆") + "</span></span>" + (v ? '<span class="rnum">' + dec(v.score) + '</span><span class="rcount">(' + n + ")</span>" : "") + "</button>"
    : '<button type="button" class="rbtn' + (v ? "" : " empty") + '"' + attrs + ' aria-label="' + esc(label) + '">' +
    (v ? '<span class="rnum">' + dec(v.score) + "</span>" : "") + '<span class="rstars" aria-hidden="true">' + starRow(v ? v.stars : 0) + "</span>" + (v ? '<span class="rcount">(' + n + ")</span>" : "") + "</button>";
  var mine = "";
  if (!compact && ui.editor && (v || own != null)) mine = '<button type="button" class="rown"' + attrs + ' tabindex="-1" aria-hidden="true">' + (own != null ? '<span class="rmini" aria-hidden="true">' + starRow(Math.round(own)) + '</span><span class="rmtxt">Din vurdering ' + dec(own) + "</span>" : '<span class="rmini" aria-hidden="true">' + starRow(0) + '</span><span class="rmtxt">Giv din vurdering</span>') + "</button>";
  return '<span class="rwrap">' + big + mine + "</span>";
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
/* Små udgaver (højst 600 punkter) til felter, kort og rækker – de store bruges kun i billedfremviseren og øverst på forsiden.
   Sparer hukommelse på telefoner (indbyggede browsere i fx Messenger gik ned på de store billeder). */
var THUMBS = {};
function thumbPath(p) { return String(p).replace(/\.[A-Za-z0-9]+$/, "") + ".t.jpg"; }
function photoUrl(path, small) {
  if (small && THUMBS[path]) { var t = signed[thumbPath(path)]; if (t) return t.u; }
  var s = signed[path]; return s ? s.u : "";
}
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
    sb.from("experiences").select("*"), sb.from("photos").select("*").order("sort").order("created_at"), sb.rpc("author_names"), sb.from("andele").select("id,lejlighed,nummer,rul"), sb.from("andel_numre").select("andel_id,lejlighed,nummer,rul"), sb.rpc("place_counts")]);
  if (res[2].error) { ui.msg = "Kunne ikke hente stederne. Prøv at genindlæse siden."; ui.loaded = true; render(); return; }
  raw.towns = res[0].data || []; raw.regions = res[1].data || []; raw.places = res[2].data || []; raw.exps = res[3].data || []; raw.photos = res[4].data || [];
  authors = {}; (res[5].data || []).forEach(function (a) { authors[a.user_id] = a; });
  visitCounts = {}; favCounts = {}; (res[8].data || []).forEach(function (v) { visitCounts[v.target] = v.visits; favCounts[v.target] = v.favs; });
  // En husstand kan have flere andelsnumre: label = laveste nummer + " m.fl." (fx "102-025 m.fl.")
  andelNums = {}; (res[6].data || []).forEach(function (a) { andelNums[a.id] = [{ l: a.lejlighed, n: a.nummer, r: a.rul }]; });
  (res[7].data || []).forEach(function (x) { if (andelNums[x.andel_id] && !andelNums[x.andel_id].some(function (y) { return y.l === x.lejlighed && y.n === x.nummer; })) andelNums[x.andel_id].push({ l: x.lejlighed, n: x.nummer, r: x.rul }); });
  andelLabels = {}; Object.keys(andelNums).forEach(function (id) {
    var ns = andelNums[id].slice().sort(function (a, b) { return String(a.n).localeCompare(String(b.n), "da", { numeric: true }); }); andelNums[id] = ns;
    andelLabels[id] = ns[0].l + "-" + ns[0].n + (ns.length > 1 ? " m.fl." : "");
  });
  if (me && andelNums[me.andel]) { me.label = andelLabels[me.andel]; me.allLabels = andelNums[me.andel].map(function (x) { return x.l + "-" + x.n; }); me.apts = andelNums[me.andel].map(function (x) { return x.l; }).filter(function (v, i, a) { return a.indexOf(v) === i; }); }
  THUMBS = {}; raw.photos.forEach(function (p) { if (p.thumb) THUMBS[p.path] = 1; });
  await signPhotos(raw.photos.map(function (p) { return p.path; }).concat(raw.photos.filter(function (p) { return p.thumb; }).map(function (p) { return thumbPath(p.path); })));
  await loadReportCount();
  await loadSeen();
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
  var rows = (m.data || []).filter(function (x) { return x.andele && x.andele.aktiv; });
  // Med i flere husstande (fx en andel alene og en sammen med en anden): husk det sidste valg på enheden
  var pick = null; try { pick = localStorage.getItem("bol_andel_" + ui.user.id); } catch (x) {}
  var row = rows.filter(function (x) { return x.andel_id === pick; })[0] || rows[0];
  if (!row) return;
  var ad = await sb.rpc("am_i_admin"), cp = await sb.rpc("can_post_notices");
  me = { andel: row.andel_id, label: row.andele.lejlighed + "-" + row.andele.nummer, role: row.role, name: row.name, admin: ad.data === true,
    others: rows.filter(function (x) { return x !== row; }).map(function (x) { return { id: x.andel_id, label: x.andele.lejlighed + "-" + x.andele.nummer }; }) };
  me.canPost = cp.data === true;
  me.readonly = !me.admin && rows.every(function (x) { return x.role === "laeser"; });
  ui.member = true; ui.editor = !me.readonly;
}
function authorText(e) {
  var a = e && authors[e.updated_by];
  var label = andelLabels[e.andel_id] || (a && a.label) || "";
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
    var vis = {}; (ui.scope !== "alle" ? (ours ? [ours] : []) : es).forEach(function (e) { (e.visits || []).forEach(function (m) { vis[m] = 1; }); });
    var lastOthers = others.map(function (e) { return e.last_visit || ""; }).sort().pop() || null;
    return Object.assign({}, base, {
      mine: ours, others: others, texts: others.filter(function (e) { return e.note; }),
      status: "tried", fav: !!(ours && ours.favorite), visited: !!(ours && ours.visited), visitedAt: ours ? ours.visited_at : null, reviewed: !!(ours && (ours.rating_score != null || (ours.note || "").trim())),
      visits: ours ? (ours.visits || []) : [], allVisits: Object.keys(vis).sort(), last_visit: ours ? ours.last_visit : lastOthers,
      ratings: ours ? ours.ratings || {} : {}, rating_score: ours && ours.rating_score != null ? +ours.rating_score : null, rating: null,
      avg_score: avg, n_rated: rated.length, note: ours ? ours.note || "" : "", noteVis: ours ? ours.visibility : "alle",
      photos: ph.map(function (p) { return p.path; }), photoRows: ph, photo_credit: (ph.filter(function (p) { return p.credit; })[0] || {}).credit || null
    });
  };
  places = raw.places.map(function (p) { return build("place", p.id, p); })
    .filter(function (p) { return isApt(p.cat) || p.id === ui.place || (ui.scope === "vurderet" ? p.visited : ui.scope === "fav" ? p.fav : true); });
  towns = {}; raw.towns.forEach(function (t) { var o = build("town", t.name, t); o.visits = o.allVisits; towns[t.name] = o; });
  regions = {}; raw.regions.forEach(function (r) { var o = build("region", r.name, r); o.visits = o.allVisits; regions[r.name] = o; });
}

/* Gem (dele af) vores andels oplevelse af et sted, en by eller et område */
async function saveExp(kind, target, patch) {
  var cur = raw.exps.filter(function (e) { return e.kind === kind && e.target === target && isMine(e); })[0];
  var row = Object.assign({ kind: kind, target: target, andel_id: me.andel, updated_by: ui.user.id, updated_at: new Date().toISOString() }, patch);
  var r = await sb.from("experiences").upsert(row, { onConflict: "kind,target,andel_id" }).select().single();
  if (!r.error) { if (cur) Object.assign(cur, r.data); else raw.exps.push(r.data); }
  return r;
}

/* ---------- visning ---------- */
/* Hvem billedet er fra: kilden for billeder fra nettet, ellers fornavn + andel på den, der lagde det ind */
function photoCredit(row, path, fallback) {
  if (row && row.credit) return row.credit;
  if (/\/web-/.test(path || "") && fallback) return fallback;
  if (!row) return "";
  var a = row.owner && authors[row.owner], label = andelLabels[row.andel_id] || "";
  if (a && a.name) return a.name + (label ? " (" + label + ")" : "");
  return label ? "andel " + label : "";
}
function carousel(p) {
  var ph = p.photos || [];
  if (!ph.length) return '<div class="noimg-card" aria-hidden="true">' + (CAT_ICONS[p.cat] || "") + "</div>";
  var html = '<div class="car" data-car>';
  html += '<div class="track">' + ph.map(function (x, i) {
    var u = esc(photoUrl(x));
    // Den slørede baggrund sættes først når billedet er hentet (se "load"-lytteren), så kun synlige billeder hentes.
    var row = (p.photoRows || [])[i] || raw.photos.filter(function (r) { return r.path === x; })[0];
    var who = photoCredit(row, x, p.photo_credit), credit = who ? '<span class="credit">Foto: ' + esc(who) + "</span>" : "";
    var rb = row && me && row.andel_id && row.andel_id !== me.andel && p.id ? reportBtn("billede", row.id, "place", p.id, true) : "";
    // Jeres egne billeder: mærke nede til højre med hvem der kan se det – tryk for at skifte
    if (row && me && row.id && row.andel_id === me.andel && !canSetVis(row.owner === ui.user.id)) rb += '<span class="visbtn carvis visro v-' + esc(row.visibility) + '">' + esc(VIS_NAMES[row.visibility] || row.visibility) + "</span>";
    else if (row && me && row.id && row.andel_id === me.andel) rb += '<button type="button" class="visbtn carvis v-' + esc(row.visibility) + '" data-cvis="' + esc(row.id) + '" title="Hvem kan se billedet? Tryk for at skifte">' + esc(VIS_NAMES[row.visibility] || row.visibility) + "</button>" + helpBtn(row.visibility === "lejlighed" || (row.kind === "place" && isAptPlace(row.target)) ? "photovisapt" : "photovis", "onphoto");
    return '<div class="slide">' + rb + '<img src="' + u + '" alt="' + esc(p.name) + (ph.length > 1 ? ", billede " + (i + 1) : "") + '" loading="lazy" decoding="async">' + credit + "</div>";
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
  lejebil: svg('<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>'),
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
  places.forEach(function (p) { if (p.town && !isApt(p.cat)) s[p.town] = 1; });
  return Object.keys(s);
}
function regionOf(town) { var t = towns[town]; return (t && t.region) || NO_REGION; }
function placesIn(town) { return places.filter(function (p) { return p.town === town && !isApt(p.cat); }); }
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
  var ps = kind === "town" ? placesIn(name) : places.filter(function (p) { return !isApt(p.cat) && regionOf(p.town) === name; });
  var photos = (o && o.photos && o.photos.length) ? o.photos : [];
  var townCover = kind === "region" ? townsInRegion(name).map(function (n) { var t = towns[n]; return t && t.photos && t.photos[0]; }).filter(Boolean)[0] : null;
  // Uden egne billeder: billedet fra det bedst bedømte sted med billeder, ellers stedet med flest billeder
  var best = ps.filter(function (p) { return p.photos && p.photos.length; }).sort(function (a, b) { return scoreOf(b) - scoreOf(a) || b.photos.length - a.photos.length; })[0];
  var cover = photos[0] || townCover || (best ? best.photos[0] : null);
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
  return '<div class="town"><button class="tlink" type="button" data-' + (kind === "town" || only ? "town" : "region") + '="' + esc(only || name) + '">' + (a.cover ? '<img src="' + esc(photoUrl(a.cover, true)) + '" alt="" loading="lazy">' : '<span class="noimg"></span>') +
    '<span class="tname">' + esc(name) + '</span><span class="tmeta">' + esc(sub) + "</span></button>" +
    (kind === "town" ? '<div class="trate">' + ratingButton("town", name, "byer", towns[name], true) + "</div>" : "") + "</div>";
}
/* Tekster: vores egen først, derefter andre andeles med navn. På listen kun én (vores, ellers den nyeste). */
function textsHtml(p, detail) {
  var own = p.note ? '<p class="note">' + esc(p.note) + (p.mine && p.mine.visibility === "andel" ? ' <span class="privnote">(kun vores andel)</span>' : "") + "</p>" : "";
  var others = (p.texts || []).slice().sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); });
  var one = function (e) { return '<blockquote class="otext"><p>' + esc(e.note) + "</p><cite>" + esc(authorText(e)) + (e.rating_score != null ? " · " + dec(+e.rating_score) + " ★" : "") + "</cite>" + (detail ? reportBtn("tekst", e.id, e.kind, e.target) : "") + "</blockquote>"; };
  var hasDesc = !!(p.facts && p.facts.beskrivelse);
  if (!detail) return own || (others.length ? one(others[0]) : (isApt(p.cat) || hasDesc ? "" : '<p class="note empty">Ingen beskrivelse endnu.</p>'));
  var h = own;
  if (others.length) h += (own ? '<p class="rcap">Andre andele skriver</p>' : "") + others.map(one).join("");
  if (!h && !isApt(p.cat) && !hasDesc) h = '<p class="note empty">Ingen beskrivelse endnu.</p>';
  return h;
}
/* Toppen af en by- eller områdeside: billeder, navn, vurdering, beskrivelse */
function areaHeader(kind, name) {
  var a = areaObj(kind, name), t = a.rec || {};
  var html = '<section class="place areahead">' + carousel({ name: name, cat: a.cat, photos: a.photos.length ? a.photos : (a.cover ? [a.cover] : []), photo_credit: t.photo_credit });
  // Jeres egne besøg: på byen/området selv og på jeres steder i den
  var ov = {}; ((a.rec && a.rec.mine && a.rec.mine.visits) || []).forEach(function (m) { ov[m] = 1; }); a.places.forEach(function (p) { (p.visits || []).forEach(function (m) { ov[m] = 1; }); });
  var vv = Object.keys(ov).sort(), lastV = vv.length ? vv[vv.length - 1] : null;
  var visitLine = lastV ? '<span class="visitline">' + (vv.length > 1 ? "Senest besøgt " : "Vi har besøgt ") + MONTHS[parseInt(lastV.slice(5, 7), 10) - 1] + " " + lastV.slice(0, 4) + "</span>" : "";
  html += '<div class="place-top"><div class="ptitle"><h2>' + esc(name) + "</h2>" + visitLine + "</div>" + (kind === "town" ? ratingButton("town", name, "byer", towns[name]) : "") + "</div>";
  var meta = kind === "town" ? [regionOf(name) !== NO_REGION ? "" : "", driveText(t.drive_min != null ? t.drive_min : (a.drive < 9999 ? a.drive : null), t.drive_km)].filter(Boolean) :
    [townsInRegion(name).length + (townsInRegion(name).length === 1 ? " by" : " byer"), a.drive < 9999 ? "nærmeste ca. " + timeText(a.drive) + " i bil" : ""].filter(Boolean);
  html += '<p class="meta">' + (kind === "town" && regionOf(name) !== NO_REGION && regionOf(name) !== name ? '<button class="linkbtn" type="button" data-region="' + esc(regionOf(name)) + '">' + esc(regionOf(name)) + "</button>" + (meta.length ? " · " : "") : "") + esc(meta.join(" · ")) + "</p>";
  html += textsHtml({ note: a.note, texts: (a.rec && a.rec.texts) || [], mine: a.rec && a.rec.mine, cat: "byer" }, true);
  var mq = kind === "town" ? name + ", Murcia, España" : name + ", España";
  if (ui.editor) html += '<div class="actrow act3"><button class="btn act" type="button" data-comment="' + kind + '" data-key="' + esc(name) + '">' + ICON_CHAT + '<span>Tilføj kommentar</span></button><button class="btn act" type="button" data-addarea="' + kind + '" data-key="' + esc(name) + '">' + ICON_CAM + '<span>Tilføj billeder</span></button><button class="btn act" type="button" data-editarea="' + kind + '" data-key="' + esc(name) + '">' + ICON_PEN + "<span>Rediger</span></button></div>";
  html += '<div class="linklist">' + lrow("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(mq), ICON_PIN, "Åbn i Google Maps", true) + "</div>";
  return html + "</section>";
}

/* Lille kort i gitteret (som byerne): billede, navn, by og kategori, stjerner. Tryk åbner stedet. */
function gridCard(p, showKat) {
  var img = p.photos && p.photos[0] ? photoUrl(p.photos[0], true) : "";
  var meta = [p.town || p.area, showKat ? (subName(p.cat, p.subcat) || CATNAME[p.cat]) : subName(p.cat, p.subcat), p.drive_min != null && p.drive_min >= 15 ? "ca. " + timeText(p.drive_min) : ""].filter(Boolean).join(" · ");
  var warn = (p.facts || {}).saeson === "ja" ? '<span class="tag warn">Sæsonlukket</span>' : "";
  var priv = p.visibility === "andel" ? '<span class="tag priv">Kun vores andel</span>' : p.visibility === "mig" ? '<span class="tag priv">Kun mig</span>' : "";
  return '<div class="town pcard" id="' + esc(p.id) + '"><button class="tlink" type="button" data-open="' + esc(p.id) + '">' +
    (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="noimg">' + (CAT_ICONS[p.cat] || "") + "</span>") +
    '<span class="tname">' + esc(p.name) + '</span><span class="tmeta">' + esc(meta) + "</span>" + (warn || priv ? '<span class="ptags">' + warn + priv + "</span>" : "") + "</button>" +
    '<div class="trate">' + ratingButton("place", p.id, p.cat, p, true) + '<span class="tbtns">' + visitBtn(p) + heartBtn(p) + "</span>" + "</div></div>";
}
/* Beskrivelse: linjer som "Ankomst: …" vises som en pæn liste; "ABC'en" bliver et link til stedets link */
function descHtml(p) {
  var used = false, rows = [], loose = [];
  function fmt(t) {
    var h = esc(t);
    if (p.link && /ABC'en/.test(t)) { used = true; h = h.replace(/ABC&#39;en|ABC'en/, '<a href="' + esc(p.link) + '" target="_blank" rel="noopener">ABC\'en ↗</a>'); }
    return h;
  }
  String(p.facts.beskrivelse).split(/\n+/).forEach(function (line) {
    line = line.trim(); if (!line) return;
    var m = line.match(/^([A-ZÆØÅ][A-Za-zæøåÆØÅ ]{1,18}):\s*(.+)$/);
    if (m) rows.push("<dt>" + esc(m[1]) + "</dt><dd>" + fmt(m[2]) + "</dd>"); else loose.push("<p>" + fmt(line) + "</p>");
  });
  var html = rows.length ? '<div class="factbox"><dl>' + rows.join("") + "</dl>" + loose.join("") + "</div>" : '<div class="desc">' + loose.join("") + "</div>";
  return { html: html, usedLink: used };
}
function lrow(href, icon, text, ext) { return '<a class="lrow" href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + icon + '<span class="ltext">' + esc(text) + '</span><span class="lchev" aria-hidden="true">' + (ext ? "↗" : "›") + "</span></a>"; }
function licon(p) { return '<svg class="licon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>"; }
var ICON_PIN = licon('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>');
var ICON_GLOBE = licon('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.5 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.5-3.6-8.5S9.5 6.1 12 3.5z"/>');
var ICON_LINK = licon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>');
var ICON_TOWN = licon('<path d="M3 21h18M5 21V10l5-3v14M10 21V5l6 3v13M16 21v-9l4 2v7"/>');
var ICON_PEN = licon('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>');
var ICON_CHAT = licon('<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-8l-4.5 3.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5z"/><path d="M8 9.5h8M8 12.5h5"/>');
var ICON_CAM = licon('<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.3"/>');
function placeCard(p, detail, showKat) {
    var html = '<article class="place' + (detail ? " detailcard" : "") + '" id="' + esc(p.id) + '" data-pid="' + esc(p.id) + '">' +
      (detail && ui.view === "kort" && p.lat != null ? '<div class="car"><div id="map" class="dmap" role="region" aria-label="Kort over ' + esc(p.name) + '"></div></div>' : carousel(p));
    var vv = (p.visits || []).slice().sort(), lastV = vv.length ? vv[vv.length - 1] : null;
    var hotelCard = p.cat === "lejligheden" && !!(p.facts && p.facts.beskrivelse);
    var visitLine = detail && lastV && !hotelCard ? '<span class="visitline">' + (vv.length > 1 ? "Senest besøgt " : "Vi har besøgt ") + MONTHS[parseInt(lastV.slice(5, 7), 10) - 1] + " " + lastV.slice(0, 4) + "</span>" : "";
    html += '<div class="place-top"><div class="ptitle"><h3>' + (detail ? esc(p.name) : '<button class="titlebtn" type="button" data-open="' + esc(p.id) + '">' + esc(p.name) + "</button>") + "</h3>" + visitLine + "</div>" + '<span class="topright">' + ratingButton("place", p.id, p.cat, p) + visitBtn(p, !!detail) + heartBtn(p, !!detail) + "</span></div>";
    // Hvad stedet er (underkategori, ellers kategori) og åbningsforhold – som almindelig tekst øverst
    var kind = isApt(p.cat) ? [] : [esc(subName(p.cat, p.subcat) || CATNAME[p.cat] || "")].concat(factList(p, detail).map(function (t) { return t[0] ? '<span class="warn">' + esc(t[1]) + "</span>" : esc(t[1]); })).filter(Boolean);
    if (kind.length) html += '<p class="kindline">' + kind.join(" · ") + "</p>";
    var where = p.area && p.area !== p.town ? (p.town && p.area.indexOf(p.town) < 0 ? p.area + ", " + p.town : p.area) : (p.town || p.area);
    var meta = isApt(p.cat) ? "" : [where, distText(p), p.price].filter(Boolean).join(" · ");
    if (meta) html += '<p class="meta">' + esc(meta) + "</p>";
    var dsc = p.facts && p.facts.beskrivelse ? descHtml(p) : null;
    if (dsc) html += dsc.html;
    html += textsHtml(p, detail);
    html += '<div class="tags">';
    if (p.visibility === "andel") html += '<span class="tag priv">Kun vores andel</span>';
    if (p.visibility === "mig") html += '<span class="tag priv">Kun mig</span>';
    if (p.guess) html += '<span class="tag guess">Navnet er gættet ud fra billeder</span>';
    html += "</div>";
    if (ui.editor) {
      html += detail ? '<div class="actrow act3"><button class="btn act" type="button" data-comment="place" data-key="' + esc(p.id) + '">' + ICON_CHAT + '<span>Tilføj kommentar</span></button><button class="btn act" type="button" data-addphotos="' + esc(p.id) + '">' + ICON_CAM + '<span>Tilføj billeder</span></button><button class="btn act" type="button" data-edit="' + esc(p.id) + '">' + ICON_PEN + "<span>Rediger</span></button>"
        : '<div class="row"><button class="btn small" type="button" data-comment="place" data-key="' + esc(p.id) + '">Tilføj kommentar</button><button class="btn small" type="button" data-addphotos="' + esc(p.id) + '">Tilføj billeder</button><button class="btn small" type="button" data-edit="' + esc(p.id) + '">Rediger</button>';
      if ((!p.photos || !p.photos.length) && (p.website || (p.link && !isMapsLink(p.link)))) html += '<button class="btn small" type="button" data-fetchimg="' + esc(p.id) + '">Hent billeder fra nettet</button>';
      html += "</div>";
    }
    if (detail) {
      // Links som en liste med én række pr. link – store felter, der er lette at ramme
      var lr = lrow(mapsUrl(p), ICON_PIN, "Åbn i Google Maps", true);
      if (p.website) lr += lrow(p.website, ICON_GLOBE, hotelCard ? "Foreningens hjemmeside" : "Stedets hjemmeside", true);
      if (p.link && !(dsc && dsc.usedLink)) lr += lrow(p.link, ICON_LINK, "Læs mere på " + hostOf(p.link), true);
      if (p.town && !hotelCard) {
        lr += '<button class="lrow" type="button" data-town="' + esc(p.town) + '">' + ICON_TOWN + '<span class="ltext">Flere steder i ' + esc(p.town) + '</span><span class="lchev" aria-hidden="true">›</span></button>';
        if (regionOf(p.town) !== NO_REGION && regionOf(p.town) !== p.town) lr += '<button class="lrow" type="button" data-region="' + esc(regionOf(p.town)) + '">' + ICON_TOWN + '<span class="ltext">Flere steder i ' + esc(regionOf(p.town)) + '</span><span class="lchev" aria-hidden="true">›</span></button>';
      }
      html += '<div class="linklist">' + lr + "</div>";
    } else {
      html += '<div class="row links"><a class="maps" href="' + esc(mapsUrl(p)) + '" target="_blank" rel="noopener">Åbn i Google Maps</a>';
      if (p.website) html += '<a class="maps" href="' + esc(p.website) + '" target="_blank" rel="noopener">' + (hotelCard ? "Foreningens hjemmeside" : "Hjemmeside") + ' ↗</a>';
      if (p.link && !(dsc && dsc.usedLink)) html += '<a class="maps" href="' + esc(p.link) + '" target="_blank" rel="noopener">Læs mere (' + esc(hostOf(p.link)) + ") ↗</a>";
      html += "</div>";
    }
    return html + "</article>";
}

/* ---------- forside (to bud, A og B, kan skiftes øverst) ---------- */
/* Lejlighedsnummer for et sted om en lejlighed, og for den indloggede andel */
function aptOf(p) { return p.lejlighed || String(andelLabels[p.andel_id] || "").split("-")[0]; }
function myApt() { return me ? String(me.label || "").split("-")[0] : ""; }
function myApts() { return me ? (me.apts && me.apts.length ? me.apts : [myApt()]) : []; }
/* Faste forsidebilleder pr. kategori (valgt af Christian 19.11.2026): forsidebilledet fra det nævnte sted, by eller område */
var TILE_COVER = { byer: ["town", "Cartagena"], dagsture: ["region", "Ricote-dalen"], natur: ["place", "pmvrq6eiwy64m"], sevaerdigheder: ["place", "pmvrq3fk10chq"],
  shopping: ["place", "pmvnjtwvomk43"], spisesteder: ["place", "p4"], strande: ["place", "p1"] };
function fixedCover(key) {
  var c = TILE_COVER[key]; if (!c) return null;
  var vo = { alle: 0, lejlighed: 1, andel: 1, mig: 2 };
  var ph = raw.photos.filter(function (x) { return x.kind === c[0] && x.target === c[1]; }).sort(function (a, b) { return (vo[a.visibility] - vo[b.visibility]) || a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)); })[0];
  return ph ? ph.path : null;
}
/* Hjælpetekst i kommentarfeltet – passer til kategorien */
var NOTE_PH = { spisesteder: "Fx hvad der var godt, om man skal bestille bord, og hvad det kostede.", strande: "Fx parkering, skygge, toiletter og om der er strandbar.",
  natur: "Fx hvor man parkerer, hvor lang turen er, og hvornår der er bedst.", sevaerdigheder: "Fx åbningstider, pris og hvor lang tid man skal regne med.",
  oplevelser: "Fx pris, booking og om det passer til børn.", sport: "Fx pris, booking og udstyr.", dagligvarer: "Fx åbningstider, udvalg og parkering.",
  opladning: "Fx ladehastighed, pris pr. kWh og hvad man kan lave imens.", parkering: "Fx pris, hvor man betaler, og hvornår der er plads.",
  lejebil: "Fx udlejer, pris, afhentning i lufthavnen og forsikring.", shopping: "Fx hvad de har, priser og åbningstider.",
  vores: "Fx hvor tingene står, eller hvordan aircon og tv virker.", lejligheden: "Fx et godt råd om hotellet." };
function notePh(cat) { return NOTE_PH[cat] || "Hvad er godt at vide om stedet?"; }
/* Navnet til "Type …" over underkategori-vælgeren, fx "Type indkøb" */
function typeName(cat) { var t = (typeof HOME_TILES !== "undefined" ? HOME_TILES : []).filter(function (x) { return x[0] === cat; })[0]; return ((t && t[1]) || CATNAME[cat] || "").toLowerCase(); }
/* Forsidens felter: "Alle steder" først, så alfabetisk, "Hotellet" sidst. Kortet over alle steder ligger på kort-knappen i værktøjslinjen. */
var HOME_TILES = [["alle", "Alle steder"]].concat([["spisesteder", "Spisesteder"], ["strande", "Strande"], ["natur", "Natur og udsigt"], ["sevaerdigheder", "Seværdigheder"], ["oplevelser", "Oplevelser"], ["dagsture", "Dagsture"],
  ["byer", "Byer"], ["dagligvarer", "Indkøb"], ["sport", "Sport"], ["shopping", "Shopping"], ["parkering", "Parkering"], ["lejebil", "Lejebil"], ["opladning", "Elbil-opladning"]]
  .sort(function (a, b) { return a[1].localeCompare(b[1], "da"); })).concat([["lejligheden", "Hotellet"]]);
/* Forsidebillede til et felt: det bedst bedømte sted med billede – og aldrig samme sted på to felter */
function coverFor(list, used) {
  used = used || {};
  var w = list.filter(function (p) { return p.photos && p.photos.length && !used[p.id]; }).sort(function (a, b) { return (b.status === "tried") - (a.status === "tried") || scoreOf(b) - scoreOf(a); })[0];
  if (!w) return "";
  used[w.id] = 1; return photoUrl(w.photos[0], true);
}
function miniCard(p, extra) {
  var v = overall(p), img = p.photos && p.photos[0] ? photoUrl(p.photos[0], true) : "";
  return '<button type="button" class="hcard" data-open="' + esc(p.id) + '">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="hnoimg">' + (CAT_ICONS[p.cat] || "") + "</span>") +
    '<span class="hname">' + esc(p.name) + '</span><span class="hmeta">' + (v ? '<span class="hstars">' + starRow(v.stars) + "</span> " : "") + esc([p.town, CATNAME[p.cat]].filter(Boolean).join(" · ")) + "</span>" +
    (extra ? '<span class="hextra">' + extra + "</span>" : "") + "</button>";
}
function rowIcon(kind) { return kind === "fav" ? '<span class="hicon hfav">' + heartSvg(true) + "</span>" : kind === "visit" ? '<span class="hicon hvisit">' + visitSvg(true) + "</span>" : ""; }
function homeRow(title, items, empty, icon) {
  return '<section class="hrow"><h2 class="subhead">' + rowIcon(icon) + esc(title) + "</h2>" + (items.length ? '<div class="hscroll">' + items.join("") + "</div>" : '<p class="hint">' + esc(empty) + "</p>") + "</section>";
}
function newsItems() {
  // Nyeste fra alle andele (også jeres egen) på steder, byer og områder: stjerner, kommentarer og nye billeder.
  // Ét kort pr. andel og sted. Et nyt sted vises kun, når det har billeder, en kommentar eller stjerner.
  var byId = {}; places.forEach(function (p) { byId[p.id] = p; });
  var rawById = {}; raw.places.forEach(function (p) { rawById[p.id] = p; });
  var DAY = 864e5, ev = {};
  function exists(kind, target) {
    if (kind === "place") return !!byId[target] && !isApt(byId[target].cat);
    return (kind === "town" && !!towns[target]) || (kind === "region" && !!regions[target]);
  }
  function slot(kind, target, andel) { var k = kind + "|" + target + "|" + andel; return ev[k] || (ev[k] = { kind: kind, target: target, andel: andel, t: "", photos: [] }); }
  raw.exps.forEach(function (e) {
    if (!(e.note || e.rating_score != null) || !exists(e.kind, e.target)) return;
    // Tidspunktet for stjernerne eller kommentaren – ikke for andre rettelser
    var et = [e.rating_score != null ? e.rated_at : null, e.note ? e.noted_at : null].filter(Boolean).sort().pop() || "";
    var o = slot(e.kind, e.target, e.andel_id); o.exp = e; if (String(et) > o.t) o.t = String(et);
  });
  raw.photos.forEach(function (r) {
    if (!r.andel_id || !exists(r.kind, r.target)) return;
    slot(r.kind, r.target, r.andel_id).photos.push(r);
  });
  var list = Object.keys(ev).map(function (k) {
    var o = ev[k];
    if (o.photos.length) {
      o.photos.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
      var last = Date.parse(o.photos[0].created_at);
      // "Nye billeder" = dem, der blev lagt ind samme omgang (inden for et døgn af det seneste)
      o.batch = o.photos.filter(function (r) { return last - Date.parse(r.created_at) < DAY; });
      if (String(o.photos[0].created_at) > o.t) o.t = String(o.photos[0].created_at);
    }
    return o;
  }).filter(function (o) { return o.t; });
  list.sort(function (a, b) { return b.t.localeCompare(a.t); });
  return list.slice(0, 10).map(function (o) {
    var e = o.exp, rp = o.kind === "place" ? rawById[o.target] : null, tt = Date.parse(o.t);
    var isNew = rp && rp.andel_id === o.andel && rp.created_at && Math.abs(tt - Date.parse(rp.created_at)) < DAY;
    var who = e ? authorText(e) : (photoCredit(o.batch[0], o.batch[0].path) || "En andelshaver");
    var bits = [who];
    if (e && e.rating_score != null) bits.push(dec(+e.rating_score) + " ★");
    if (o.batch && Date.parse(o.batch[0].created_at) > tt - DAY) bits.push(o.batch.length === 1 ? "1 nyt billede" : o.batch.length + " nye billeder");
    var extra = (isNew ? "Nyt sted · " : "") + esc(bits.map(function (b) { return b.replace(/ /g, "\u00a0"); }).join(" · ")) + '<span class="hquote">' + (e && e.note ? '"' + esc(e.note) + '"' : "") + "</span>";
    return o.kind === "place" ? miniCard(byId[o.target], extra) : areaMini(o.kind, o.target, extra);
  });
}
/* ---------- Nyt siden sidst ----------
   Hvornår brugeren sidst så listen gemmes i user_state.seen_at (følger brugeren på alle enheder).
   Første gang sættes tidspunktet til nu, så nye brugere ikke får hele guiden som "nyt". */
async function loadSeen() {
  ui.since = null; ui.sinceOpen = false;
  var r = await sb.from("user_state").select("seen_at,notify").maybeSingle();
  if (r.error) { ui.seenAt = null; return; }
  if (r.data) { ui.seenAt = r.data.seen_at; ui.notify = r.data.notify || {}; return; }
  ui.notify = {};
  var now = new Date().toISOString(); ui.seenAt = now;
  await sb.from("user_state").insert({ user_id: ui.user.id, seen_at: now });
}
var NOTIFY_TYPES = [["stars", "Nye stjerner og kommentarer på steder, I har vurderet eller kommenteret"], ["photos", "Nye billeder på steder, I har vurderet eller kommenteret"], ["places", "Nye steder i guiden"], ["apt", "Billeder og kommentarer på jeres lejlighed"]];
function notifyOn(k) { var n = ui.notify || {}; return !n.off && n[k] !== false; }
function notifyHtml() {
  var n = ui.notify || {}, many = myApts().length > 1;
  var state = n.off ? "Slået fra" : NOTIFY_TYPES.every(function (t) { return n[t[0]] !== false; }) ? "Alt slået til" : NOTIFY_TYPES.filter(function (t) { return n[t[0]] !== false; }).length + " af 4 slået til";
  var h = '<section class="panel nbox"><button type="button" class="nhead" data-fold="notify" aria-expanded="' + !!(ui.fold && ui.fold.notify) + '"><span><strong>Notifikationer:</strong> Nyt siden sidst<span class="hint">' + state + '</span></span><span class="sincego" aria-hidden="true">' + (ui.fold && ui.fold.notify ? "⌃" : "›") + "</span></button>";
  if (!(ui.fold && ui.fold.notify)) return h + "</section>";
  return h + '<div class="nbody"><p class="hint">Bestem, hvad der skal stå i "Nyt siden sidst" øverst på forsiden. Gælder kun dig.</p>' +
    '<label class="chk nchk"><input type="checkbox" data-notify="off"' + (n.off ? "" : " checked") + "> Vis \"Nyt siden sidst\" på forsiden</label>" +
    (n.off ? "" : '<div class="nlist">' + NOTIFY_TYPES.map(function (t) { return '<label class="chk nchk"><input type="checkbox" data-notify="' + t[0] + '"' + (n[t[0]] === false ? "" : " checked") + "> " + esc(t[0] === "apt" && many ? "Billeder og kommentarer på jeres lejligheder" : t[1]) + "</label>"; }).join("") + "</div>") +
    '<p class="hint" id="notify-msg" role="status"></p></div></section>';
}
async function saveNotify(el) {
  var n = Object.assign({}, ui.notify || {}), k = el.dataset.notify;
  if (k === "off") { if (el.checked) delete n.off; else n.off = true; } else { if (el.checked) delete n[k]; else n[k] = false; }
  ui.notify = n; ui.since = null;
  var r = await sb.from("user_state").upsert({ user_id: ui.user.id, notify: n });
  render();
  var m = document.getElementById("notify-msg"); if (m) m.textContent = r.error ? "Det blev ikke gemt – prøv igen." : "Gemt.";
}
function sinceItems() {
  if (!ui.seenAt || !me) return [];
  var seen = Date.parse(ui.seenAt), after = function (t) { return t && Date.parse(t) > seen; };
  var byId = {}; places.forEach(function (p) { byId[p.id] = p; });
  var out = [];
  // 1) Nye stjerner eller kommentarer fra andre andele på steder, I selv har vurderet eller kommenteret
  raw.exps.forEach(function (e) {
    if (e.kind !== "place" || e.andel_id === me.andel) return;
    var p = byId[e.target]; if (!p || isApt(p.cat) || !p.mine || !(p.mine.rating_score != null || p.mine.note)) return;
    var newStars = e.rating_score != null && after(e.rated_at), newNote = e.note && after(e.noted_at);
    if (!newStars && !newNote) return;
    var what = [newStars ? "gav " + dec(+e.rating_score) + " ★" : "", newNote ? "skrev en kommentar" : ""].filter(Boolean).join(" og ");
    out.push({ ty: "stars", t: [newStars ? e.rated_at : "", newNote ? e.noted_at : ""].filter(Boolean).sort().pop(), id: p.id, title: p.name, text: authorText(e) + " " + what, quote: newNote ? e.note : "" });
  });
  // 2) Nye steder fra andre andele – kun når de har billeder, en kommentar eller stjerner
  raw.places.forEach(function (rp) {
    var p = byId[rp.id]; if (!p || isApt(p.cat) || rp.andel_id === me.andel || !after(rp.created_at)) return;
    var hasExp = raw.exps.some(function (e) { return e.kind === "place" && e.target === rp.id && (e.note || e.rating_score != null); });
    if (!(p.photos && p.photos.length) && !hasExp) return;
    out.push({ ty: "places", t: rp.created_at, id: p.id, title: p.name, text: "Nyt sted · " + [CATNAME[p.cat], p.town].filter(Boolean).join(" · ") + (andelLabels[rp.andel_id] ? " · lagt ind af " + (authors[rp.created_by] && authors[rp.created_by].name ? authors[rp.created_by].name + " (" + andelLabels[rp.andel_id] + ")" : andelLabels[rp.andel_id]) : "") });
  });
  // 3) Jeres lejlighed(er): nye billeder og kommentarer fra andre andele med samme lejlighedsnummer (alle husstandens lejligheder)
  var apts = myApts(), aptIds = {};
  places.forEach(function (p) { if (isApt(p.cat) && apts.indexOf(String(aptOf(p))) >= 0) aptIds[p.id] = p; });
  raw.exps.forEach(function (e) {
    var p = e.kind === "place" && aptIds[e.target]; if (!p || e.andel_id === me.andel || !e.note || !after(e.noted_at)) return;
    out.push({ ty: "apt", t: e.noted_at, id: p.id, title: p.name, text: authorText(e) + " skrev en kommentar", quote: e.note });
  });
  // 4) Nye billeder fra andre andele på steder, I selv har vurderet eller kommenteret (og på jeres lejlighed)
  var batches = {};
  raw.photos.forEach(function (r) {
    if (r.kind !== "place" || !r.andel_id || r.andel_id === me.andel || !after(r.created_at)) return;
    var p = aptIds[r.target], ty = "apt";
    if (!p) { p = byId[r.target]; ty = "photos"; if (!p || isApt(p.cat) || !p.mine || !(p.mine.rating_score != null || p.mine.note)) return; }
    var k = p.id + "|" + r.andel_id; (batches[k] = batches[k] || { p: p, ty: ty, rows: [] }).rows.push(r);
  });
  Object.keys(batches).forEach(function (k) {
    var b = batches[k], rows = b.rows.sort(function (x, y) { return String(y.created_at).localeCompare(String(x.created_at)); });
    out.push({ ty: b.ty, t: rows[0].created_at, id: b.p.id, title: b.p.name, text: (photoCredit(rows[0], rows[0].path) || "En andelshaver") + " lagde " + (rows.length === 1 ? "1 nyt billede" : rows.length + " nye billeder") + " ind" });
  });
  // Kun de slags, brugeren har valgt under Vores andel
  out = out.filter(function (it) { return notifyOn(it.ty); });
  // Samme sted samles i én linje i listen (fx et nyt sted med en kommentar)
  var g = {}, list = [];
  out.forEach(function (it) {
    var o = g[it.id]; if (!o) { o = g[it.id] = { id: it.id, title: it.title, t: it.t, lines: [] }; list.push(o); }
    if (Date.parse(it.t) > Date.parse(o.t)) o.t = it.t;
    o.lines[/^Nyt sted/.test(it.text) ? "unshift" : "push"]({ text: it.text, quote: it.quote });
  });
  list.sort(function (a, b) { return Date.parse(b.t) - Date.parse(a.t); });
  return list;
}
function sinceHtml() {
  var items = ui.since || sinceItems();
  if (!items.length) return "";
  if (!ui.sinceOpen) return '<button type="button" class="sincebtn" data-since="open"><span class="sincedot" aria-hidden="true"></span>' + (items.length === 1 ? "1 nyt siden sidst" : items.length + " nye siden sidst") + '<span class="sincego" aria-hidden="true">›</span></button>';
  return '<section class="sincebox"><div class="sincehead"><h2>Nyt siden sidst</h2><button class="linkbtn" type="button" data-since="close">Luk</button></div><ul>' + items.map(function (it) {
    return '<li><button type="button" data-open="' + esc(it.id) + '"><strong>' + esc(it.title) + "</strong>" + it.lines.map(function (l) { return "<span>" + esc(l.text) + "</span>" + (l.quote ? '<span class="sinceq">"' + esc(l.quote.length > 140 ? l.quote.slice(0, 140) + "…" : l.quote) + '"</span>' : ""); }).join("") + "</button></li>";
  }).join("") + "</ul></section>";
}
async function openSince() {
  ui.since = sinceItems(); ui.sinceOpen = true; render();
  // Listen bliver stående resten af besøget; næste gang tæller kun det, der er kommet til siden nu
  var now = new Date().toISOString();
  var r = await sb.from("user_state").upsert({ user_id: ui.user.id, seen_at: now });
  if (!r.error) ui.seenAt = now;
}
/* Lille kort til forsiden for en by eller et område */
function areaMini(kind, name, extraHtml) {
  var a = areaObj(kind, name), img = a.cover ? photoUrl(a.cover, true) : "", o = kind === "town" ? towns[name] : regions[name], v = overall(o);
  return '<button type="button" class="hcard" data-' + (kind === "town" ? "town" : "region") + '="' + esc(name) + '">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">' : '<span class="hnoimg">' + (CAT_ICONS.byer || "") + "</span>") +
    '<span class="hname">' + esc(name) + '</span><span class="hmeta">' + (v ? '<span class="hstars">' + starRow(v.stars) + "</span> " : "") + (kind === "town" ? "By" : "Område") + "</span>" +
    (extraHtml ? '<span class="hextra">' + extraHtml + "</span>" : "") + "</button>";
}
function wishItems() {
  return places.filter(function (p) { return p.fav; }).sort(function (a, b) { return scoreOf(b) - scoreOf(a); }).slice(0, 10).map(function (p) { return miniCard(p); });
}
/* Åbnet inde i Messenger/Facebook/Instagram o.l.: der kan guiden ikke lægges på hjemmeskærmen */
var IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|Snapchat|LinkedInApp/i.test(navigator.userAgent || "");
var IS_ANDROID = /Android/i.test(navigator.userAgent || "");
var FROM_SCREEN = /[?&]fra=skaerm/.test(location.search);
function screenNote() {
  if (!FROM_SCREEN || ui.screenHide) return "";
  return '<div class="notice"><p><strong>Test:</strong> Du kom hertil fra skærmen i receptionen. Fælles aktiviteter og Den sorte bog er ved at blive bygget.</p>' +
    '<button class="linkbtn" type="button" id="screen-hide">Skjul</button></div>';
}
function inAppNote() {
  if (!IN_APP || ui.inAppHide) return "";
  return '<div class="notice inappnote"><p><strong>Du har åbnet guiden inde i en anden app</strong> (fx Messenger). Herfra kan den ikke lægges på hjemmeskærmen.</p>' +
    '<p>Tryk på de tre prikker <strong>•••</strong> øverst til højre og vælg <strong>' + (IS_ANDROID ? "Åbn i browser" : "Åbn i Safari") + '</strong>. ' +
    (IS_ANDROID ? 'Tryk så på de tre prikker i Chrome og vælg <strong>Føj til startskærm</strong>.' : 'Tryk så på Del-knappen og vælg <strong>Føj til hjemmeskærm</strong>.') + '</p>' +
    '<button class="linkbtn" type="button" id="inapp-hide">Skjul</button></div>';
}
// Samme toppe med billede og "Hej …" på menuen, guidens forside og siderne fra menuen
function heroHtml() {
  if (!me) return "";
  var hero = "";
  if (ui.loaded) {
    var spots = places.filter(function (p) { return !isApt(p.cat); });
    var hotel = places.filter(function (p) { return p.cat === "lejligheden" && p.photos && p.photos.length; })[0];
    hero = hotel ? photoUrl(hotel.photos[0]) : coverFor(spots);
  }
  return '<section class="hero"' + (hero ? ' style="--hero:url(&quot;' + esc(hero) + '&quot;)"' : "") + '><div class="herotext"><p>Hej ' + esc(me.name || "") + '</p><p class="herosub">Andel ' + esc(me.label) + "</p></div></section>";
}
function renderHome() {
  var spots = places.filter(function (p) { return !isApt(p.cat); });
  var hotel = places.filter(function (p) { return p.cat === "lejligheden" && p.photos && p.photos.length; })[0];
  setTop(headerHtml() + heroHtml());
  toolbar(true);
  var html = "";
  if (ui.msg) html += '<p class="notice" role="status">' + esc(ui.msg) + "</p>";
  html += screenNote() + inAppNote();
  if (me && me.readonly) html += '<p class="notice">Du har læseadgang: du kan se det hele, men ikke ændre noget eller give vurderinger.</p>';
  if (me && me.admin && ui.reportCount) html += '<p class="notice">' + (ui.reportCount === 1 ? "Der er 1 ny anmeldelse." : "Der er " + ui.reportCount + " nye anmeldelser.") + ' <button class="linkbtn" type="button" data-page="admin">Se ' + (ui.reportCount === 1 ? "den" : "dem") + "</button></p>";
  html += hiddenDupHtml();
  html += sinceHtml();
  html += scopeHint();
  if (ui.draft) html += formHtml(ui.draft);
  html += wizOverlays();
  if (ui.areaDraft) html += areaFormHtml(ui.areaDraft);
  spots = spots.filter(function (p) { return p.status === ui.status; });
  var homeMap = ui.view === "kort";
  if (homeMap) html += '<div class="mapwrap"><div id="map" role="region" aria-label="Kort over stederne"></div><p class="hint">' + spots.filter(function (p) { return p.lat != null; }).length + " af " + spots.length + " steder har en placering og vises på kortet.</p>" +
    '<p class="legend">' + legendItem("lejligheden", "Hotellet", "lhome") + CATS.filter(function (c) { return !isApt(c[0]) && spots.some(function (p) { return p.cat === c[0] && p.lat != null; }); }).map(function (c) { return legendItem(c[0], c[1]); }).join("") + "</p></div>";
  var used = {}; if (hotel) used[hotel.id] = 1;
  Object.keys(TILE_COVER).forEach(function (k) { if (TILE_COVER[k][0] === "place") used[TILE_COVER[k][1]] = 1; });   // de faste billeder bruges ikke igen på andre felter
  // Besøgt / Favoritter: kun de steder – ingen felter og ingen andre rækker
  var scoped = ui.scope === "vurderet" || ui.scope === "fav";
  if (scoped && !homeMap) {
    var sl = spots.slice().sort(ui.scope === "vurderet" ? function (a, b) { return String(b.visitedAt || "").localeCompare(String(a.visitedAt || "")); } : function (a, b) { return scoreOf(b) - scoreOf(a); });
    html += '<section class="hrow"><h2 class="subhead">' + rowIcon(ui.scope === "vurderet" ? "visit" : "fav") + (ui.scope === "vurderet" ? "Seneste besøg" : "Jeres favoritter") + "</h2>" +
      (sl.length ? '<div class="list grid">' + sl.map(function (p) { return gridCard(p, true); }).join("") + "</div>" : '<p class="hint">' + (ui.scope === "vurderet" ? "Tryk på besøgt-mærket ved et sted, I har været, så kommer det her." : "Tryk på hjertet ved et sted, så kommer det her.") + "</p>") + "</section>";
  }
  if (!homeMap && !scoped)
  html += '<div class="tiles">' + HOME_TILES.map(function (t) {
    var list = t[0] === "alle" || t[0] === "kort" ? spots : t[0] === "dagsture" ? spots.filter(function (p) { return regionDrive(regionOf(p.town)) >= DAYTRIP_MIN; }) : t[0] === "byer" ? spots : t[0] === "lejligheden" ? places.filter(function (p) { return p.cat === "lejligheden" || (p.cat === "vores" && aptOf(p) === myApt()); }) : places.filter(function (p) { return p.cat === t[0]; });
    var n = t[0] === "byer" ? allTownNames().filter(function (x) { return placesIn(x).length; }).length : t[0] === "kort" ? null : list.length;
    if (ui.scope !== "alle" && (t[0] === "lejligheden" || n === 0)) return "";
    var forside = t[0] === "lejligheden" && hotel ? hotel.photos.filter(function (x) { return /\/web-forside\./.test(x); })[0] : null;
    var fixed = fixedCover(t[0]);
    var img = forside ? photoUrl(forside, true) : fixed && photoUrl(fixed, true) ? photoUrl(fixed, true) : coverFor(list, used);
    return '<button type="button" class="tile" data-hometile="' + t[0] + '"' + (img ? ' style="--img:url(&quot;' + esc(img) + '&quot;)"' : "") + ">" + (img ? '<span class="tcorner" aria-hidden="true">' + (CAT_ICONS[t[0]] || CAT_ICONS.alle) + "</span>" : '<span class="ticon">' + (CAT_ICONS[t[0]] || CAT_ICONS.alle) + "</span>") + '<span class="tlabel">' + esc(t[1]) + "</span></button>";
  }).join("") + "</div>";
  if (!scoped) {
  html += homeRow("Jeres favoritter", wishItems(), "Tryk på hjertet ved et sted, så kommer det her.", "fav");
  html += homeRow("Seneste besøg", spots.filter(function (p) { return p.visited; }).sort(function (a, b) { return String(b.visitedAt || "").localeCompare(String(a.visitedAt || "")); }).slice(0, 10).map(function (p) { return miniCard(p); }), "Tryk på besøgt-mærket ved et sted, I har været, så kommer det her.", "visit");
  html += homeRow("Nyt fra andelshaverne", newsItems(), "Når andelshaverne skriver, giver stjerner eller lægger billeder ind, kommer det her.");
  }
  html += footerHtml();
  if (ui.editor && !ui.draft) {
    if (ui.chooser) html += '<div class="chooser" role="menu"><button class="btn primary" type="button" id="new-photo">Vælg billeder</button><button class="btn" type="button" id="new-manual">Uden billede</button></div>';
    html += '<button class="fab" type="button" id="new" aria-label="Nyt sted" aria-expanded="' + !!ui.chooser + '"><span aria-hidden="true">' + (ui.chooser ? "×" : "+") + "</span> " + (ui.chooser ? "Luk" : "Nyt sted") + "</button>";
  }
  root.innerHTML = html;
  setTimeout(maybeWelcome, 400);
  if (homeMap) { drawMap(spots, []); refocusMap(); }
  slim.innerHTML = ""; slim.classList.remove("show"); panel.hidden = true;
}

/* Tal til knapperne Alle / Vores vurderede / Favoritter – uafhængigt af hvad der vises lige nu */
function scopeCounts() {
  var ids = {}; raw.places.forEach(function (p) { if (!isApt(p.cat)) ids[p.id] = 1; });
  var mine = raw.exps.filter(function (e) { return e.kind === "place" && isMine(e) && ids[e.target]; });
  return { alle: Object.keys(ids).length, vurderet: mine.filter(function (e) { return e.visited; }).length, fav: mine.filter(function (e) { return e.favorite; }).length };
}
function heartSvg(on) { return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="' + (on ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>'; }
function visitSvg(on) { return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="' + (on ? "2.3" : "1.9") + '" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.2s-6.8-5.8-6.8-11.4a6.8 6.8 0 0 1 13.6 0c0 5.6-6.8 11.4-6.8 11.4z"/><path d="M9 9.9l2.1 2.1 3.9-4"/></svg>'; }
/* "Besøgt": fælles for husstanden, sættes kun når man selv trykker */
function visitBtn(p, withCount) {
  if (!ui.editor || isApt(p.cat)) return "";
  var n = withCount ? visitCounts[p.id] || 0 : 0;
  return '<button type="button" class="visit' + (p.visited ? " on" : "") + (n ? " haspill" : "") + '" data-visit="' + esc(p.id) + '" aria-pressed="' + p.visited + '" aria-label="' + (p.visited ? "Fjern markeringen som besøgt" : "Marker som besøgt") + (n ? ". " + n + (n === 1 ? " andel har besøgt stedet" : " andele har besøgt stedet") : "") + '" title="' + (n ? n + (n === 1 ? " andel har besøgt" : " andele har besøgt") : "Marker som besøgt") + '">' + visitSvg(p.visited) + (n ? '<span class="bc">' + n + "</span>" : "") + "</button>";
}
function heartBtn(p, withCount) {
  if (!ui.editor || isApt(p.cat)) return "";
  var n = withCount ? favCounts[p.id] || 0 : 0;
  return '<button type="button" class="heart' + (p.fav ? " on" : "") + (n ? " haspill" : "") + '" data-fav="' + esc(p.id) + '" aria-pressed="' + p.fav + '" aria-label="' + (p.fav ? "Fjern fra jeres favoritter" : "Læg på jeres favoritter") + (n ? ". " + n + (n === 1 ? " andel har stedet som favorit" : " andele har stedet som favorit") : "") + '" title="' + (n ? n + (n === 1 ? " andel har stedet som favorit" : " andele har stedet som favorit") : (p.fav ? "Fjern fra favoritter" : "Læg på favoritter")) + '">' + heartSvg(p.fav) + (n ? '<span class="bc">' + n + "</span>" : "") + "</button>";
}
function scopeHint() {
  if (ui.scope === "vurderet") return '<p class="scopehint">Steder, jeres andel har markeret som besøgt. Tryk på ' + visitSvg(false) + ' ved et sted for at markere det.</p>';
  if (ui.scope === "fav") return '<p class="scopehint">Jeres andels favoritter. Tryk på hjertet ved et sted for at tilføje eller fjerne det.</p>';
  return "";
}

/* ---------- fast top og værktøjslinje: samme sted og samme udseende på alle sider ---------- */
var topEl = document.getElementById("top"), tbEl = document.getElementById("toolbar"), tbInput = null, tbCtrl = null, tbClear = null;
function setTop(h) { topEl.innerHTML = h; }
function toolbar(show, noScope) {
  tbEl.hidden = !show; if (!show) return;
  if (!tbInput) {
    tbEl.innerHTML = '<div class="tsearch">' + ICON_SEARCH + '<input id="tq" type="search" placeholder="Søg" autocomplete="off" enterkeyhint="search" aria-label="Søg"><button type="button" class="tclear" data-tb="clear" aria-label="Ryd søgning" hidden>×</button></div><div class="tctrl"></div>';
    tbInput = tbEl.querySelector("#tq"); tbCtrl = tbEl.querySelector(".tctrl"); tbClear = tbEl.querySelector(".tclear");
    tbClear.addEventListener("mousedown", function (e) { e.preventDefault(); });
    tbInput.addEventListener("input", function () { ui.q = tbInput.value; tbClear.hidden = !ui.q; render(); });
  }
  if (document.activeElement !== tbInput) tbInput.value = ui.q || "";
  tbClear.hidden = !(ui.q || "");
  var toMap = ui.view !== "kort", c = scopeCounts();
  var seg = function (val, label, short, n, title) { return '<button type="button" data-scope="' + val + '" aria-pressed="' + (ui.scope === val) + '" title="' + title + '"><span class="pl">' + label + '</span><span class="ps">' + short + "</span>" + (n == null ? "" : '<span class="pn">' + n + "</span>") + "</button>"; };
  tbCtrl.innerHTML = (noScope ? "" : '<div class="pill" role="group" aria-label="Vis">' +
      seg("alle", "Alle", "Alle", null, "Alle steder i guiden") +
      seg("vurderet", visitSvg(ui.scope === "vurderet") + " Besøgt", visitSvg(ui.scope === "vurderet"), c.vurderet, "Steder jeres andel har besøgt") +
      seg("fav", heartSvg(ui.scope === "fav") + " Favoritter", heartSvg(ui.scope === "fav"), c.fav, "Jeres favoritter") + "</div>") +
    '<button class="tview" type="button" data-view="' + (toMap ? "kort" : "liste") + '" aria-label="' + (toMap ? "Vis på kort" : "Vis som gitter") + '" title="' + (toMap ? "Vis på kort" : "Vis som gitter") + '">' + (toMap ? ICON_MAP : ICON_LIST) + "</button>";
}

var APTS = ["lejligheden", "vores"];
function isApt(c) { return APTS.indexOf(c) >= 0; }
function render() {
  // Ikke logget ind / ingen andel: kun velkomst og login. Egne sider: Vores andel, Regler og privatliv.
  markOrig();
  if (!ui.member || ui.page || ui.recovery) { renderGate(); return; }
  if (ui.menu) { renderMenu(); return; }
  if (!ui.loaded) { setTop(headerHtml()); toolbar(false); root.innerHTML = '<p class="loading">Henter guiden…</p>'; slim.innerHTML = ""; slim.classList.remove("show"); panel.hidden = true; return; }
  if (ui.cat === "hjem" && !ui.place && !(ui.q || "").trim()) { renderHome(); return; }
  var APT = ui.cat, inApt = isApt(ui.cat), inTowns = ui.cat === "byer", inTrips = ui.cat === "dagsture";
  var spots = places.filter(function (p) { return !isApt(p.cat); });
  var byStatus = spots.filter(function (p) { return p.status === ui.status; });
  var rated = function (p) { var v = overall(p); return !ui.minRating || (v ? v.stars : 0) >= ui.minRating; };
  var counts = { alle: byStatus.length };
  CATS.forEach(function (c) { counts[c[0]] = byStatus.filter(function (p) { return p.cat === c[0]; }).length; });
  APTS.forEach(function (a) { counts[a] = places.filter(function (p) { return p.cat === a && (a !== "vores" || myApts().indexOf(aptOf(p)) >= 0); }).length; });
  counts.lejligheden += counts.vores;
  // Byer og områder, der hører til den valgte liste (Har prøvet / Vil prøve)
  var townShown = function (n) { var t = towns[n]; return byStatus.some(function (p) { return p.town === n; }) || (ui.scope === "alle" && t && ((t.visits && t.visits.length) || (t.photos && t.photos.length))); };
  var regionShown = function (r) { return townsInRegion(r).some(townShown) || (ui.scope === "alle" && regions[r] && ((regions[r].visits || []).length || (regions[r].photos || []).length)); };
  var tripRegions = regionNames().filter(function (r) { return r !== NO_REGION && regionDrive(r) >= DAYTRIP_MIN && regionShown(r); });
  counts.dagsture = tripRegions.length;
  counts.byer = allTownNames().filter(townShown).length;

  var list = null, sub = "", head = "", grid = "";
  // Rullemenu i stedet for en række knapper: [["", "Alle", n], [værdi, navn, antal], …]
  var ddSel = function (key, label, opts, cur) {
    return '<label class="fbox"><span class="flabel">' + esc(label) + '</span><select data-select="' + key + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + ((cur || "") === o[0] ? " selected" : "") + ">" + esc(o[1]) + (o[2] != null ? " (" + o[2] + ")" : "") + "</option>"; }).join("") + "</select></label>";
  };
  var subChips = function (pool, label) {
    var o = [["", "Alle", null]];
    CATS.forEach(function (c) { var n = pool.filter(function (p) { return p.cat === c[0]; }).length; if (n) o.push([c[0], c[1], n]); });
    return '<div class="fgrid">' + ddSel("sub", label, o, ui.sub) + "</div>";
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
    var inCat = byStatus.filter(function (p) { return ui.cat === "alle" || p.cat === ui.cat; }), subSel = "", townSel = "", factChips = "";
    if (SUBCATS[ui.cat]) {
      var scs = SUBCATS[ui.cat].map(function (x) { return [x, inCat.filter(function (p) { return p.subcat === x[0]; }).length]; }).filter(function (x) { return x[1] || ui.subcat === x[0][0]; });
      var none = inCat.filter(function (p) { return !subName(ui.cat, p.subcat); }).length;
      if (scs.length) subSel = ddSel("subcat", "Type " + typeName(ui.cat), [["", "Alle", null]].concat(scs.map(function (x) { return [x[0][0], x[0][1], x[1]]; })).concat(none ? [["__ingen", "Ikke valgt", none]] : []), ui.subcat);
      if (ui.subcat) inCat = inCat.filter(function (p) { return ui.subcat === "__ingen" ? !subName(ui.cat, p.subcat) : p.subcat === ui.subcat; });
    }
    var qs = (QUESTIONS[ui.cat] || []).map(function (x) { return x[0]; });
    if (qs.length) {
      factChips = '<div class="ftogs" role="group" aria-label="Åbningstider">' +
        (qs.indexOf("saeson") >= 0 ? chip("fopen", "1", "Skjul sæsonlukkede", inCat.filter(function (p) { return (p.facts || {}).saeson === "ja"; }).length || null, !!ui.fOpen) : "") +
        (qs.indexOf("sondag") >= 0 ? chip("fsun", "1", "Kun søndagsåbent", inCat.filter(function (p) { return (p.facts || {}).sondag === "ja"; }).length, !!ui.fSun) : "") +
        (qs.indexOf("frokost") >= 0 ? chip("flunch", "1", "Frokoståbent", inCat.filter(function (p) { return (p.facts || {}).frokost === "ja"; }).length, !!ui.fLunch) : "") +
        (qs.indexOf("tidlig") >= 0 ? chip("fearly", "1", "Køkken åbent før kl. 20.00", inCat.filter(function (p) { return (p.facts || {}).tidlig === "ja"; }).length, !!ui.fEarly) : "") + "</div>";
      if (ui.fOpen) inCat = inCat.filter(function (p) { return (p.facts || {}).saeson !== "ja"; });
      if (ui.fSun) inCat = inCat.filter(function (p) { return (p.facts || {}).sondag === "ja"; });
      if (ui.fEarly) inCat = inCat.filter(function (p) { return (p.facts || {}).tidlig === "ja"; });
      if (ui.fLunch) inCat = inCat.filter(function (p) { return (p.facts || {}).frokost === "ja"; });
    }
    if (TOWN_CATS.indexOf(ui.cat) >= 0) {
      var ts2 = townsOf(inCat);
      if (ts2.length > 1 || ui.ftown) townSel = ddSel("ftown", "Byer", [["", "Alle", null]].concat(ts2.map(function (t) { return [t[0], t[0], t[1]]; })), ui.ftown);
      if (ui.ftown) inCat = inCat.filter(function (p) { return p.town === ui.ftown; });
    }
    list = inCat.filter(rated);
  }
  var q = (ui.q || "").trim().toLowerCase(), searching = q.length > 0;
  if (searching) {
    var words = q.split(/\s+/);
    list = places.filter(function (p) {
      var hay = [p.name, p.area, p.town, regionOf(p.town), p.note, (p.texts || []).map(function (e) { return e.note; }).join(" "), p.website, CATNAME[p.cat], subName(p.cat, p.subcat), p.fav ? "favorit favoritter" : ""].join(" ").toLowerCase();
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

  setTop(headerHtml()); toolbar(true, !!detail);
  var html = "";
  if (ui.msg) html += '<p class="notice" role="status">' + esc(ui.msg) + "</p>";
  if (!detail && !inApt) html += scopeHint();
  if (detail) html += hiddenDupHtml(detail.id);
  if (ui.login) html += loginHtml();
  if (ui.draft) html += formHtml(ui.draft);
  html += wizOverlays();
  if (ui.areaDraft) html += areaFormHtml(ui.areaDraft);

  var f = "";
  // Knappen viser den visning, man skifter TIL: kort-ikon i listen, liste-ikon på kortet
  var toMap = ui.view !== "kort";
  // Samme rækkefølge og navne som felterne på forsiden; "Vores lejlighed" til sidst, hvis andelen har noget
  f += '<div class="cats" role="group" aria-label="Kategori">';
  HOME_TILES.forEach(function (t) {
    var id = t[0], n = counts[id];
    if (ui.cat !== id && id !== "alle") {
      if (id === "vores" && !counts.vores) return;
      if (ui.scope !== "alle" && (id === "lejligheden" || !n)) return;
    }
    f += catBtn(id, id === "opladning" ? "Elbil" : id === "alle" ? "Alle" : t[1], n);
  });;
  f += "</div>";
  if (sub) f += '<div class="subchips">' + sub + "</div>";
  // Åbningsfiltre øverst, derefter fire lige store bokse: type, by, karakter, sortering
  if (factChips) f += factChips;
  f += '<div class="fgrid"' + (inApt ? " hidden" : "") + ">" + (subSel || "") + (townSel || "");
  var listView = list !== null;
  if (!inApt && listView) f += '<label class="fbox"><span class="flabel">Karakter</span><select data-select="rating">' +
    [[0, "Alle"], [4, "4 stjerner og op"], [5, "Kun 5 stjerner"]].map(function (r) { return '<option value="' + r[0] + '"' + ((ui.minRating || 0) === r[0] ? " selected" : "") + ">" + r[1] + "</option>"; }).join("") + "</select></label>";
  f += '<label class="fbox"><span class="flabel">Sortering</span><select data-select="sort">' +
    [["senest", "Senest besøgt"], ["nyeste", "Senest tilføjet"], ["naermeste", "Nærmeste først"], ["stjerner", "Flest stjerner"], ["navn", "Navn A–Å"]].map(function (o) { return '<option value="' + o[0] + '"' + ((ui.sort || "senest") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
  f += "</div>";
  function catBtn(id, label, n) {
    return '<button type="button" class="cat" data-cat="' + id + '" aria-pressed="' + (ui.cat === id) + '">' + (CAT_ICONS[id] || "") + '<span class="cl">' + esc(label) + "</span>" + "</button>";
  }
  var summary = searching ? 'Søgning: "' + ui.q.trim() + '"' : [inApt ? "" : (ui.scope === "vurderet" ? "Besøgt" : ui.scope === "fav" ? "Favoritter" : ""), ui.cat === "alle" ? "Alle" : ui.cat === "byer" ? "Byer" : ui.cat === "dagsture" ? "Dagsture" : CATNAME[ui.cat], ui.subcat && ui.subcat !== "__ingen" ? subName(ui.cat, ui.subcat) : "", ui.fOpen ? "uden sæsonlukkede" : "", ui.fSun ? "søndagsåbent" : "", ui.fEarly ? "åbent før kl. 20" : "", ui.region || "", ui.town || ui.ftown || "", ui.sub ? CATNAME[ui.sub] : "",
    ui.minRating ? ui.minRating + "+ ★" : "", ui.sort && ui.sort !== "senest" ? { nyeste: "senest tilføjet", naermeste: "nærmeste først", stjerner: "flest stjerner", navn: "A–Å" }[ui.sort] : ""].filter(Boolean).join(" · ");
  if (detail) {
    html += '<div class="bar detailbar" id="fullbar"></div>';
  } else if (searching) {
    // Byer og områder (fx Lorca, Totana) er ikke steder – find dem også
    var hitW = function (n) { var h = String(n || "").toLowerCase(); return words.every(function (w) { return h.indexOf(w) >= 0; }); };
    var hitTowns = allTownNames().filter(hitW), hitRegions = regionNames().filter(function (r) { return r !== NO_REGION && hitW(r) && townsInRegion(r).length > 1; });
    var nAreas = hitTowns.length + hitRegions.length, cnt = [];
    if (list.length || !nAreas) cnt.push(list.length + (list.length === 1 ? " sted" : " steder"));
    if (hitTowns.length) cnt.push(hitTowns.length + (hitTowns.length === 1 ? " by" : " byer"));
    if (hitRegions.length) cnt.push(hitRegions.length + (hitRegions.length === 1 ? " område" : " områder"));
    html += '<div class="bar" id="fullbar"><div class="row"><strong>' + cnt.join(" og ") + ' matcher "' + esc(ui.q.trim()) + '"</strong></div></div>';
    if (nAreas) html += '<div class="towns searchtowns">' + hitRegions.map(function (r) { return areaCard("region", r, ui.status); }).join("") + hitTowns.map(function (n) { return areaCard("town", n, ui.status); }).join("") + "</div>";
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
      '<p class="legend">' + CATS.filter(function (c) { return mapList.some(function (p) { return p.cat === c[0] && p.lat != null; }); }).map(function (c) { return legendItem(c[0], c[1]); }).join("") + "</p></div>";
    list = [];
    if (areaDetail) html += head + grid;
  }
  // Kortet på en stedside: vises i stedet for billederne (se placeCard)
  if (ui.view === "kort" && detail) {
    mapList = [detail];
    if (detail.lat == null) html += '<p class="hint">' + esc(detail.name) + " har ingen placering endnu, så det kan ikke vises på kortet." + (ui.editor ? ' Tryk "Ret" for at tilføje et link fra Google Maps.' : "") + "</p>";
  }
  // Hotellet: Laderita de Bolnuevo og andelens lejlighed side om side som to kort
  var myAp = myApts(), aptAll = [], aptMain = null;
  if (ui.cat === "lejligheden" && me) {
    // Alle husstandens lejligheder (fx 102 og 203), i nummerorden
    var byNo = function (a, b) { return String(aptOf(a)).localeCompare(String(aptOf(b)), "da", { numeric: true }); };
    aptAll = places.filter(function (p) { return p.cat === "vores" && myAp.indexOf(aptOf(p)) >= 0; });
    var mineApts = aptAll.filter(function (p) { return p.subcat === "lejlighed"; }).sort(byNo);
    aptMain = mineApts[0] || null;
    // Administratoren ser alle lejligheder i samme række, i nummerorden efter sine egne
    var otherApts = me.admin ? places.filter(function (p) { return p.cat === "vores" && p.subcat === "lejlighed" && myAp.indexOf(aptOf(p)) < 0; }).sort(byNo) : [];
    if (!detail && !searching) list = list.filter(function (p) { return p.cat !== "vores"; }).concat(mineApts).concat(otherApts);
  }
  html += '<div class="list' + (detail ? "" : " grid") + '">';
  if (!ui.loaded) html += '<p class="empty-state">Henter steder…</p>';
  else if (!list.length && inApt) html += '<p class="empty-state">' + (ui.cat === "vores" ? "Intet om jeres lejlighed endnu. Tryk \"+ Nyt sted\" for at lægge billeder og noter om jeres lejlighed ind – det kan kun jeres andel se." : "Ingen billeder af hotellet endnu.") + "</p>";
  else if (!list.length && searching && !detail) html += nAreas ? "" : '<p class="empty-state">Ingen steder matcher søgningen.</p>';
  else if (!list.length && listView && ui.view !== "kort" && !((inTowns || inTrips) && (ui.town || ui.region))) html += '<p class="empty-state">' + (ui.status === "wish" ? "Ingen ønsker her endnu." : "Intet her endnu.") + (ui.editor ? ' Tryk "+ Nyt sted" for at tilføje et.' : "") + "</p>";
  // Mens stedet rettes, vises kun redigeringen – ikke selve stedet nedenunder
  var editingDetail = detail && ui.draft && !ui.draft.isNew && !ui.draft.wiz && ui.draft.id === detail.id;
  if (editingDetail) list = [];
  list.forEach(function (p) { html += detail ? placeCard(p, true, true) : gridCard(p, ui.cat === "alle" || inTowns || inTrips || searching || isApt(ui.cat)); });
  html += "</div>";

  // På lejlighedskortet: andelenes egne ting om lejligheden + knap til at tilføje (kun andele i lejligheden kan se dem)
  if (detail && detail.cat === "vores" && detail.subcat === "lejlighed" && me) {
    var aptNo2 = detail.name.replace(/^Lejlighed\s*/i, ""), aptTips = places.filter(function (p) { return p.cat === "vores" && p.subcat !== "lejlighed"; });
    if (aptTips.length) html += '<h2 class="subhead">Gode råd og billeder fra andelene</h2><div class="list grid">' + aptTips.map(function (p) { return gridCard(p, false); }).join("") + "</div>";
  }
  html += footerHtml();
  if (ui.editor && !ui.draft) {
    if (ui.chooser) html += '<div class="chooser" role="menu"><button class="btn primary" type="button" id="new-photo">Vælg billeder</button><button class="btn" type="button" id="new-manual">Uden billede</button></div>';
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
    if (detail) drawMap(mapList, [], true); else drawMap(mapList, areas, areaDetail);
    refocusMap();
  }
  wireCarousels();
  watchBar();
}

/* ---------- kortvisning (Leaflet + OpenStreetMap) ---------- */
var CAT_COLORS = { lejebil: "#34495e", lejligheden: "#0d5c6b", vores: "#0d5c6b", spisesteder: "#c0392b", strande: "#e1a21b", natur: "#2e8b57", sevaerdigheder: "#7d3c98", oplevelser: "#d35400", sport: "#1f77b4", dagligvarer: "#6b8e23", opladning: "#16a085", parkering: "#5d6d7e", shopping: "#c2185b" };
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
/* Farveforklaringen kan trykkes på: den valgte kategori fremhæves, resten bliver grå og halvt gennemsigtige */
var mapMarkers = [], hotelMarker = null;
function legendItem(cat, label, cls) {
  var on = ui.mapFocus === cat, dim = ui.mapFocus && !on;
  return '<button type="button" class="legbtn' + (on ? " on" : "") + (dim ? " dim" : "") + '" data-legend="' + cat + '" aria-pressed="' + on + '"><i' + (cls ? ' class="' + cls + '"' : "") + ' style="background:' + CAT_COLORS[cat] + '"></i>' + esc(label) + "</button>";
}
function refocusMap() {
  // Fremhævningen huskes, så længe kategorien findes på kortet; ellers nulstilles den
  if (ui.mapFocus && ui.mapFocus !== "lejligheden" && !mapMarkers.some(function (mk) { return mk._bolCat === ui.mapFocus; })) ui.mapFocus = null;
  if (ui.mapFocus) setTimeout(applyMapFocus, 0);
}
function applyMapFocus() {
  var f = ui.mapFocus;
  mapMarkers.forEach(function (mk) {
    var hit = !f || mk._bolCat === f || (f === "lejligheden" && mk._bolCat === "vores");
    mk.setStyle(hit ? { fillColor: CAT_COLORS[mk._bolCat] || "#333", fillOpacity: 0.95, opacity: 1 } : { fillColor: "#9aa3a5", fillOpacity: 0.35, opacity: 0.4 });
    if (hit && f) mk.bringToFront();
  });
  if (hotelMarker && hotelMarker.getElement()) hotelMarker.getElement().style.opacity = !f || f === "lejligheden" ? "1" : "0.35";
  document.querySelectorAll("[data-legend]").forEach(function (b) { var on = b.dataset.legend === f; b.classList.toggle("on", on); b.classList.toggle("dim", !!f && !on); b.setAttribute("aria-pressed", String(on)); });
}
function drawMap(list, areas, focus) {
  var el = document.getElementById("map"); if (!el || !window.L) return;
  if (mapObj) { mapView = { c: mapObj.getCenter(), z: mapObj.getZoom(), key: mapObj._bolKey }; mapObj.remove(); mapObj = null; }
  var m = L.map(el, { scrollWheelZoom: true, tap: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
  var pts = [];
  var labels = [], circles = [];
  mapMarkers = [];
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
  hotelMarker = L.marker([CFG.hotel.lat, CFG.hotel.lon], { title: "Laderita de Bolnuevo", icon: L.divIcon({ className: "hotelpin", html: "⌂", iconSize: [26, 26] }) }).addTo(m);
  hotelMarker.bindPopup("<strong>Laderita de Bolnuevo</strong><br>Hotellet");
  list.forEach(function (p) {
    if (p.lat == null) return;
    pts.push([p.lat, p.lon]);
    var v = overall(p), img = (p.photos || [])[0];
    var pop = (img ? '<img class="popimg" src="' + esc(photoUrl(img, true)) + '" alt="">' : "") + "<strong>" + esc(p.name) + "</strong><br>" +
      '<span class="muted">' + esc([CATNAME[p.cat], p.town].filter(Boolean).join(" · ")) + "</span>" + (v ? '<br><span class="popstars">' + starRow(v.stars) + "</span>" : "") +
      '<br><button class="btn small" type="button" data-open="' + esc(p.id) + '">Åbn</button>';
    var mk = L.circleMarker([p.lat, p.lon], { radius: 8, weight: 2, color: "#fff", fillColor: CAT_COLORS[p.cat] || "#333", fillOpacity: 0.95 }).addTo(m).bindPopup(pop, { maxWidth: 240 }).bindTooltip(esc(p.name));
    mk._bolCat = p.cat; mapMarkers.push(mk);
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
var ICON_PEOPLE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14c2.4.2 4 1.7 4.5 4.5"/></svg>';
var ICON_HOUSE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>';
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
  if (ui.menu && !ui.page) return "";
  return (TEST_MENU ? '<button class="iconbtn" type="button" data-menu="menu" aria-label="Menu" title="Menu">' + ICON_MENU + "</button>" : "") + (navStack.length ? '<button class="iconbtn" type="button" data-nav="back" aria-label="Tilbage" title="Tilbage">' + ICON_BACK + "</button>" : "") +
    (!atStart() ? '<button class="iconbtn" type="button" data-nav="home" aria-label="Til forsiden" title="Til forsiden">' + ICON_HOME + "</button>" : "");
}
function headerHtml() {
  return '<header><div><p class="eyebrow">Andelshavernes guide · Costa Cálida</p><h1>Laderita de Bolnuevo</h1></div><span class="beta" title="Guiden er stadig under udvikling">Beta</span><div class="hbtns">' + navBtns() + (ui.page === "hjaelp" ? "" : '<button class="iconbtn helpnav" type="button" data-page="hjaelp" aria-label="Hjælp" title="Hjælp">?</button>') + "</div></header>";
}
function footerHtml() {
  // Bunden som felter side om side (ikon over tekst), så den ikke ligner linklisten på stederne
  var tile = function (attr, icon, text, sub, cls) { return '<button class="ftile' + (cls ? " " + cls : "") + '" type="button" ' + attr + ">" + icon + '<span class="ftext">' + text + "</span>" + (sub ? '<span class="fsub">' + sub + "</span>" : "") + "</button>"; };
  var h = '<footer class="foot"><p class="footlabel">Indstillinger og hjælp</p><div class="ftiles">';
  if (me) h += tile('data-page="andel"', ICON_GEAR, me.allLabels && me.allLabels.length > 1 ? "Vores andele" : "Vores andel", esc(me.label), "fmain");
  if (me && me.canPost && !me.admin) h += tile('data-page="opslag"', ICON_BOOK, "Opslag på skærmen");
  h += tile('data-page="hjaelp"', ICON_HELP, "Hjælp") + tile('data-page="regler"', ICON_SHIELD, "Regler og privatliv") + "</div>";
  // Kun administratoren
  if (me && me.admin) h += '<p class="footlabel">Kun for administrator</p><div class="ftiles f2">' + tile('data-page="admin"', ICON_ADMIN, "Administration") + tile('id="open-import"', ICON_UPLOAD, "Importér billeder") + "</div>";
  if (ui.user) h += '<p class="footuser">Logget ind som ' + esc(ui.user.email) + ' · <button class="linkbtn" type="button" id="logout">Log ud</button></p>';
  return h + "</footer>";
}
var ICON_GEAR = licon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>');
var ICON_HELP = licon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>');
var ICON_SHIELD = licon('<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/>');
var ICON_ADMIN = licon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>');
var ICON_UPLOAD = licon('<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>');
function renderGate() {
  setTop(headerHtml() + (ui.member && ["akt", "udstyr", "sortbog"].indexOf(ui.page) >= 0 ? heroHtml() : "")); toolbar(false);
  var html = "";
  if (ui.msg) html += '<p class="notice" role="status">' + esc(ui.msg) + "</p>";
  html += screenNote() + inAppNote();
  if (ui.recovery) { if (!ui.login || ui.login.mode !== "newpw") ui.login = { mode: "newpw" }; html += loginHtml(); }
  else if (ui.checking) html += '<p class="loading">Henter…</p>';
  else if (ui.page === "regler") html += pageBack() + RULES_HTML;
  else if (ui.page === "hjaelp") html += helpPageHtml();
  else if (ui.page === "andel" && ui.member) html += pageBack() + andelPageHtml();
  else if (ui.page === "admin" && me && me.admin) html += pageBack() + adminPageHtml();
  else if (ui.page === "akt" && ui.member) html += aktPageHtml();
  else if (ui.page === "opslag" && me && me.canPost) html += '<h2 class="pagetitle">Opslag på skærmen</h2><section class="panel">' + noticesAdminHtml() + "</section>";
  else if (ui.page === "udstyr" && ui.member) html += udstyrPageHtml();
  else if (ui.page === "sortbog" && ui.member) html += sortbogPageHtml();
  else if (!ui.user) {
    html += '<section class="welcome"><p class="lead">Andelshavernes egne tips til lokalområdet: spisesteder, strande, udsigtspunkter, dagsture og det praktiske. Adgang kun via invitation fra en andelshaver.</p></section>';
    if (!ui.login) ui.login = { mode: "login" };
    html += loginHtml();
  } else if (!ui.member) {
    html += '<section class="panel"><h2>Ingen invitation endnu</h2><p>Du er logget ind som <strong>' + esc(ui.user.email) + "</strong>, men den mail er ikke inviteret til guiden.</p>" +
      "<p>Bed en andelshaver om at invitere dig med præcis denne mailadresse. Når invitationen er sendt, så tryk på knappen herunder.</p>" +
      '<div class="row"><button class="btn primary" type="button" id="recheck">Jeg er inviteret nu – prøv igen</button><button class="btn" type="button" id="logout">Log ud</button></div></section>';
  }
  html += ui.member && ui.loaded ? footerHtml() : '<footer><span><button class="linkbtn" type="button" data-page="hjaelp">Hjælp</button> · <button class="linkbtn" type="button" data-page="regler">Regler og privatliv</button></span></footer>';
  root.innerHTML = html;
  slim.innerHTML = ""; slim.classList.remove("show"); panel.hidden = true;
}
function pageBack() { return ""; }
/* ---------- Startmenu: det første man ser efter login (også fra QR-koden på skærmen i receptionen) ---------- */
var ICON_CAL = licon('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h3M13 14h3M8 17h3"/>');
var ICON_KEYBED = licon('<path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7"/><path d="M3 15h18M3 18v2M21 18v2"/><rect x="6" y="9" width="5" height="3" rx="1"/>');
var ICON_COMPASS = licon('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>');
var ICON_BOOK = licon('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/><path d="M9 8h6"/>');
var ICON_BIKE = licon('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9 8.5 6H7M15 9l-3 7"/>');
var ICON_MENU = licon('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>');
var MENU = [
  ["akt", ICON_CAL, "Fælles aktiviteter", "Se hvad der sker, tilmeld dig eller opret en aktivitet"],
  ["udstyr", ICON_BIKE, "Booking af udstyr", "Cykler, golfsæt og andet, der kan lånes"],
  ["guide", ICON_COMPASS, "Guide til området", "Spisesteder, strande, udflugter og andelshavernes tips"],
  ["sortbog", ICON_BOOK, "Den sorte bog", "Er noget gået i stykker, eller mangler der noget?"],
  ["ahbooking", ICON_KEYBED, "AHbooking", "Book uger i lejlighederne, point og år-rul"]
];
function renderMenu() {
  setTop(headerHtml() + heroHtml()); toolbar(false);
  var html = "";
  if (ui.msg) html += '<p class="notice" role="status">' + esc(ui.msg) + "</p>";
  html += screenNote() + inAppNote();
  var now = new Date(), MDA = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."], WDA = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
  var deco = {
    ahbooking: '<img class="mlogo" src="logo-ah.png" alt="">',
    akt: '<span class="mcal" aria-hidden="true"><span class="mcal-m">' + MDA[now.getMonth()] + '</span><span class="mcal-d">' + now.getDate() + '</span><span class="mcal-w">' + WDA[now.getDay()] + "</span></span>",
    guide: '<span class="mrate" aria-hidden="true"><span class="mstars">★★★★★</span><span class="mpair"><span class="mb mb-v">' + visitSvg(true) + '</span><span class="mb mb-h">' + heartSvg(true) + "</span></span></span>",
    udstyr: '<span class="micon mright">' + ICON_BIKE + "</span>",
    sortbog: '<span class="micon mright">' + ICON_BOOK + "</span>"
  };
  html += '<nav class="menugrid" aria-label="Startmenu">' + MENU.map(function (m) {
    var inner = (deco[m[0]] ? "" : '<span class="micon">' + m[1] + "</span>") + '<span class="mtext"><span class="mtitle">' + m[2] + (m[0] === "ahbooking" ? ' <span class="mext" aria-hidden="true">↗</span>' : "") + '</span><span class="msub">' + m[3] + "</span></span>" + (deco[m[0]] ? '<span class="mdeco">' + deco[m[0]] + "</span>" : "");
    return m[0] === "ahbooking"
      ? '<a class="mtile m-ah" href="https://ahbooking.dk/" target="_blank" rel="noopener">' + inner + "</a>"
      : '<button class="mtile m-' + m[0] + '" type="button" data-menu="' + m[0] + '">' + inner + "</button>";
  }).join("") + "</nav>";
  html += '<p class="hint menunote">AHbooking er Andelshotellets eget system og har sit eget login.</p>';
  html += ui.loaded ? footerHtml() : "";
  root.innerHTML = html;
  slim.innerHTML = ""; slim.classList.remove("show"); panel.hidden = true;
}
/* ---------- Fælles aktiviteter: alle kan oprette, alle (også gæster) kan tilmelde sig ---------- */
var aktData = null, aktLoading = false;
var DA_DAY = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"], DA_MON = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];
function p2(n) { return n < 10 ? "0" + n : "" + n; }
function hhmm(d) { return p2(d.getHours()) + "." + p2(d.getMinutes()); }
function dayKey(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
function dayTitle(d) {
  var t = new Date(); t.setHours(0, 0, 0, 0); var x = new Date(d); x.setHours(0, 0, 0, 0);
  var diff = Math.round((x - t) / 86400000);
  return (diff === 0 ? "I dag" : diff === 1 ? "I morgen" : DA_DAY[d.getDay()]) + " " + d.getDate() + ". " + DA_MON[d.getMonth()];
}
async function loadAkt() {
  if (aktLoading) return; aktLoading = true;
  var from = weekStart(0), to = weekStart(AK_WEEKS);
  var r = await sb.from("activities").select("*, activity_signups(id, user_id, andel_id, name, people, lejlighed, source)").gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at");   // denne uge + de næste uger
  aktLoading = false;
  aktData = { list: r.data || [], err: r.error ? "Aktiviteterne kunne ikke hentes: " + r.error.message : "" };
  if (ui.page === "akt") render();
}
var AK_WEEKS = 9;   // denne uge + 8 frem
function weekStart(off) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * (off || 0)); return d; }
function isoWeek(d) { var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); var y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 86400000 + 1) / 7); }
function akGoWeek(dir) {
  var w = Math.max(0, Math.min(AK_WEEKS - 1, (ui.akWeek || 0) + dir)); if (w === (ui.akWeek || 0)) return;
  ui.akWeek = w; var d = weekStart(w); if (w === 0) d = new Date(); ui.akDay = dayKey(d); render();
}
// Swipe til venstre/højre på ugevisningen skifter uge
(function () {
  var sx = 0, sy = 0, on = false;
  document.addEventListener("touchstart", function (e) { on = !!(e.target.closest && e.target.closest(".akswipe")) && !e.target.closest(".akcols"); if (on) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (!on) return; on = false; var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) akGoWeek(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
function aktUsed(a) { return (a.activity_signups || []).reduce(function (s, x) { return s + (x.people || 1); }, 0); }
function aktCard(a) {
  var st = new Date(a.starts_at), en = a.ends_at ? new Date(a.ends_at) : null;
  var sig = a.activity_signups || [], mine = ui.user && sig.filter(function (x) { return x.user_id === ui.user.id; })[0];
  var used = aktUsed(a), full = a.max_people && used >= a.max_people, past = (en || st) < new Date();
  var canEdit = ui.user && (a.created_by === ui.user.id || (me && me.admin));
  var status = a.cancelled ? '<p class="akst cancel">Aflyst</p>'
    : !a.signup ? '<p class="akst">Ingen tilmelding<span class="akmeet"> – bare mød op</span></p>'
    : '<p class="akst ' + (full ? "full" : "ok") + '">' + (a.max_people ? (full ? "Fuldt booket" : used + " af " + a.max_people + " tilmeldt") : used + " tilmeldt") + "</p>";
  var who = a.signup && sig.length ? '<p class="akwho">' + sig.map(function (x) { return esc((x.name || "?") + (andelLabels[x.andel_id] ? " (" + andelLabels[x.andel_id].replace(/ m\.fl\.$/, "") + ")" : x.lejlighed ? " (lejl. " + x.lejlighed + ")" : "")) + (x.people > 1 ? " ×" + x.people : ""); }).join(", ") + "</p>" : "";
  var btns = "";
  if (ui.editor && !a.cancelled && !past && a.signup) {
    if (mine) btns += '<button class="btn small" type="button" data-akoff="' + esc(a.id) + '">Afmeld' + (mine.people > 1 ? " (" + mine.people + ")" : "") + "</button>";
    else if (!full) btns += '<select class="akppl" id="akppl-' + esc(a.id) + '" aria-label="Antal personer">' + [1, 2, 3, 4, 5, 6].map(function (n) { return '<option value="' + n + '">' + n + (n === 1 ? " person" : " personer") + "</option>"; }).join("") + '</select><button class="btn small primary" type="button" data-akon="' + esc(a.id) + '">Tilmeld</button>';
  }
  if (canEdit && !past) btns += '<button class="linkbtn" type="button" data-akedit="' + esc(a.id) + '">Ret</button>' +
    (a.cancelled ? "" : '<button class="linkbtn danger-t" type="button" data-akcancel="' + esc(a.id) + '">' + (ui.akConfirm === a.id ? "Tryk igen for at aflyse" : "Aflys") + "</button>");
  if (canEdit) btns += '<button class="linkbtn danger-t" type="button" data-akdel="' + esc(a.id) + '">' + (ui.akDelConfirm === a.id ? "Tryk igen for at slette helt" : "Slet") + "</button>";
  return '<article class="akcard' + (a.cancelled ? " cancelled" : "") + '"><p class="aktime">' + hhmm(st) + (en ? "–" + hhmm(en) : "") + '</p><h3>' + esc(a.title) + "</h3>" +
    (a.place ? '<p class="akplace">' + esc(a.place) + "</p>" : "") + (a.creator_name ? '<p class="akplace">Oprettet på skærmen af ' + esc(a.creator_name) + (a.creator_lejl ? " (lejl. " + esc(a.creator_lejl) + ")" : "") + "</p>" : "") + (a.description ? '<p class="akdesc">' + esc(a.description) + "</p>" : "") +
    status + who + (btns ? '<div class="akbtns">' + btns + "</div>" : "") + "</article>";
}
function aktFormHtml() {
  var e = ui.akEdit && aktData ? aktData.list.filter(function (x) { return x.id === ui.akEdit; })[0] : null;
  var st = e ? new Date(e.starts_at) : null, en = e && e.ends_at ? new Date(e.ends_at) : null;
  var v = function (x) { return x == null ? "" : esc(x); };
  return '<form class="panel" id="akt-form"><h2>' + (e ? "Ret aktivitet" : "Ny aktivitet") + "</h2>" +
    '<label>Hvad skal der ske?<input name="title" required maxlength="80" placeholder="Fx padel, cykeltur til Puerto, kortspil" value="' + v(e && e.title) + '"></label>' +
    '<div class="akrow"><label>Dato<input type="date" name="date" required value="' + (st ? dayKey(st) : "") + '"></label>' +
    '<label>Fra kl.<input type="time" name="from" required value="' + (st ? p2(st.getHours()) + ":" + p2(st.getMinutes()) : "") + '"></label>' +
    '<label>Til kl. (valgfri)<input type="time" name="to" value="' + (en ? p2(en.getHours()) + ":" + p2(en.getMinutes()) : "") + '"></label></div>' +
    '<label>Hvor?<input name="place" maxlength="80" placeholder="Fx terrassen, receptionen, Mazarrón Padel Club" value="' + v(e && e.place) + '"></label>' +
    '<label>Beskrivelse (valgfri)<textarea name="desc" rows="3" maxlength="600">' + v(e && e.description) + "</textarea></label>" +
    '<label class="akcheck"><input type="checkbox" name="signup"' + (!e || e.signup ? " checked" : "") + "> Man skal tilmelde sig</label>" +
    '<label>Højst antal deltagere (valgfri)<input type="number" name="max" min="1" max="200" inputmode="numeric" placeholder="Ingen grænse" value="' + v(e && e.max_people) + '"></label>' +
    (ui.aktErr ? '<p class="error">' + esc(ui.aktErr) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit">' + (e ? "Gem" : "Opret aktivitet") + '</button><button class="btn" type="button" data-akclose="1">Annuller</button></div></form>';
}
function aktPageHtml() {
  if (!aktData) { loadAkt(); return '<p class="loading">Henter aktiviteter…</p>'; }
  var h = '<section class="akhead"><h2>Fælles aktiviteter</h2>' + (ui.editor && !ui.akForm ? '<button class="btn primary" type="button" data-aknew="1">+ Opret aktivitet</button>' : "") + "</section>";
  h += '<p class="notice">Test: aktiviteter, du opretter her, er rigtige og kan ses af alle andre testere.</p>';
  if (aktData.err) h += '<p class="error">' + esc(aktData.err) + "</p>";
  if (ui.akForm) h += aktFormHtml();
  var pick = ui.akPick && aktData.list.filter(function (a) { return a.id === ui.akPick; })[0];
  if (pick) h += '<section class="panel akpick">' + aktCard(pick) + '<div class="row"><button class="btn" type="button" data-akpick="">Luk</button></div></section>';
  h += weekBlockHtml(aktData.list, aktCard, "Intet planlagt", aktGrid);
  return h;
}
// Ugevisning (fælles for aktiviteter og udstyr): dagene fra venstre mod højre, pile eller swipe mellem ugerne
function weekBlockHtml(list, card, emptyTxt, grid) {   // grid: tegn dagene som tidsskema i stedet for kort
  var h = "";
  var wk = ui.akWeek || 0, ws = weekStart(wk), we = new Date(ws); we.setDate(ws.getDate() + 6);
  var days = [], todayK = dayKey(new Date());
  for (var i = 0; i < 7; i++) { var d = new Date(ws); d.setDate(ws.getDate() + i); days.push({ d: d, k: dayKey(d), items: [] }); }
  list.forEach(function (a) { var k = dayKey(new Date(a.starts_at)); days.forEach(function (x) { if (x.k === k) x.items.push(a); }); });
  // Valgt dag: den man har trykket på – ellers første dag fra i dag med noget på programmet
  var sel = days.filter(function (x) { return x.k === ui.akDay; })[0] || days.filter(function (x) { return x.k >= todayK && x.items.length; })[0] || days.filter(function (x) { return x.k === todayK; })[0] || days[0];
  var wlabel = ws.getMonth() === we.getMonth() ? ws.getDate() + ".–" + we.getDate() + ". " + DA_MON[we.getMonth()] : ws.getDate() + ". " + DA_MON[ws.getMonth()] + " – " + we.getDate() + ". " + DA_MON[we.getMonth()];
  h += '<div class="akswipe">' +
    '<div class="akweekbar"><button class="iconbtn" type="button" data-akwk="-1" aria-label="Forrige uge"' + (wk <= 0 ? " disabled" : "") + '>‹</button>' +
    '<div class="akwl"><strong>' + (wk === 0 ? "Denne uge" : wk === 1 ? "Næste uge" : "Uge " + isoWeek(ws)) + "</strong><span>" + wlabel + "</span></div>" +
    '<button class="iconbtn" type="button" data-akwk="1" aria-label="Næste uge"' + (wk >= AK_WEEKS - 1 ? " disabled" : "") + ">›</button></div>" +
    '<div class="akstrip" role="tablist">' + days.map(function (x) {
      return '<button type="button" role="tab" class="akdaybtn' + (x === sel ? " on" : "") + (x.k === todayK ? " today" : "") + '" data-akday="' + x.k + '" aria-selected="' + (x === sel) + '"><span class="dn">' + DA_DAY[x.d.getDay()].slice(0, 3) + '</span><span class="dd">' + x.d.getDate() + '</span><span class="dc">' + (x.items.length ? x.items.filter(function (a) { return !a.cancelled; }).map(function () { return "•"; }).join("").slice(0, 4) : "&nbsp;") + "</span></button>";
    }).join("") + "</div>" +
    (grid ? '<div class="akone"><h3 class="akday">' + dayTitle(sel.d) + "</h3>" + grid([sel], todayK) + "</div>" + '<div class="akcols tg">' + grid(days, todayK) + "</div></div>" :
    // Telefon: den valgte dag under strimlen
    '<div class="akone"><h3 class="akday">' + dayTitle(sel.d) + "</h3>" + (sel.items.length ? '<div class="aklist">' + sel.items.map(card).join("") + "</div>" : '<p class="hint">' + emptyTxt + ".</p>") + "</div>" +
    // Bred skærm: hele ugen i kolonner
    '<div class="akcols">' + days.map(function (x) {
      return '<div class="akcol' + (x.k === todayK ? " today" : "") + '"><p class="akch"><b>' + (x.k === todayK ? "I dag" : DA_DAY[x.d.getDay()].slice(0, 3)) + "</b> <span>" + x.d.getDate() + ". " + DA_MON[x.d.getMonth()] + "</span></p>" +
        (x.items.length ? x.items.map(card).join("") : '<p class="hint">' + emptyTxt + "</p>") + "</div>";
    }).join("") + "</div></div>");
  return h;
}
async function saveAkt(f) {
  var g = function (n) { return (f.elements[n].value || "").trim(); };
  var st = new Date(g("date") + "T" + g("from")), en = g("to") ? new Date(g("date") + "T" + g("to")) : null;
  if (!g("title") || isNaN(st)) { ui.aktErr = "Skriv hvad der skal ske, og vælg dato og tidspunkt."; render(); return; }
  if (en && en <= st) en.setDate(en.getDate() + 1);   // slutter efter midnat
  if (!ui.akEdit && st < new Date(Date.now() - 3600000)) { ui.aktErr = "Tidspunktet er allerede passeret."; render(); return; }
  var max = parseInt(g("max"), 10);
  var row = { title: g("title"), starts_at: st.toISOString(), ends_at: en ? en.toISOString() : null, place: g("place") || null, description: g("desc") || null,
    signup: f.elements.signup.checked, max_people: f.elements.signup.checked && max > 0 ? max : null };
  var r = ui.akEdit ? await sb.from("activities").update(row).eq("id", ui.akEdit) : await sb.from("activities").insert(Object.assign(row, { andel_id: me && me.andel }));
  if (r.error) { ui.aktErr = "Det blev ikke gemt: " + r.error.message; render(); return; }
  // Vis den uge og dag, aktiviteten ligger på
  var off = Math.floor((new Date(st.getFullYear(), st.getMonth(), st.getDate()) - weekStart(0)) / (7 * 86400000));
  ui.akWeek = Math.max(0, Math.min(AK_WEEKS - 1, off)); ui.akDay = dayKey(st);
  ui.akForm = false; ui.akEdit = null; ui.aktErr = ""; aktData = null; render(); window.scrollTo({ top: 0 });
}
async function aktSignup(id, on) {
  var r;
  if (on) {
    var sel = document.getElementById("akppl-" + id), n = sel ? parseInt(sel.value, 10) || 1 : 1;
    r = await sb.from("activity_signups").insert({ activity_id: id, andel_id: me && me.andel, name: (me && me.name) || "", people: n });
  } else r = await sb.from("activity_signups").delete().eq("activity_id", id).eq("user_id", ui.user.id);
  if (r.error) { ui.msg = /plads|fuldt/i.test(r.error.message) ? "Der er desværre ikke plads længere." : "Det lykkedes ikke: " + r.error.message; }
  else ui.msg = on ? "Du er tilmeldt." : "Du er afmeldt.";
  aktData = null; render();
}
async function aktDelete(id) {
  var r = await sb.from("activities").delete().eq("id", id).select("id");
  ui.akDelConfirm = null;
  ui.msg = r.error ? "Aktiviteten blev ikke slettet: " + r.error.message : !(r.data || []).length ? "Aktiviteten blev ikke slettet – du kan kun slette dine egne." : "Aktiviteten er slettet.";
  aktData = null; render();
}
async function aktCancel(id) {
  var r = await sb.from("activities").update({ cancelled: true }).eq("id", id);
  ui.akConfirm = null; ui.msg = r.error ? "Aktiviteten blev ikke aflyst: " + r.error.message : "Aktiviteten er aflyst.";
  aktData = null; render();
}
/* ---------- Booking af udstyr: samme ugevisning som Fælles aktiviteter. "Book udstyr" åbner en formular. Samme bookinger som på skærmen ---------- */
var bkData = null, bkLoading = false, BK_H0 = 8, BK_H1 = 20;
async function loadBk() {
  if (bkLoading) return; bkLoading = true;
  var r = await Promise.all([
    sb.from("equipment").select("*").eq("active", true).order("sort"),
    sb.from("equipment_bookings").select("*, equipment(name, kind, sort)").lt("starts_at", weekStart(AK_WEEKS).toISOString()).gt("ends_at", weekStart(0).toISOString()).order("starts_at")
  ]);
  bkLoading = false;
  var list = (r[1].data || []).slice().sort(function (a, b) { return String(a.starts_at).localeCompare(String(b.starts_at)) || ((a.equipment || {}).sort || 0) - ((b.equipment || {}).sort || 0); });
  bkData = { equip: r[0].data || [], list: list, err: (r[0].error || r[1].error) ? "Kunne ikke hente bookinger." : "" };
  if (ui.page === "udstyr") render();
}
function bkLabel(b) { var a = andelLabels[b.andel_id]; return b.lejlighed || (a ? a.split("-")[0] : ""); }
function bkRange() { var d = new Date((ui.bkDate || dayKey(new Date())) + "T00:00"), st = new Date(d), en = new Date(d); st.setHours(ui.bkFrom); en.setHours(ui.bkTo); return [st, en]; }
function bkIsFree(id) { var rg = bkRange(); return !bkData.list.some(function (b) { return b.equipment_id === id && new Date(b.starts_at) < rg[1] && new Date(b.ends_at) > rg[0]; }); }
function bkCard(b) {
  var st = new Date(b.starts_at), en = new Date(b.ends_at), e = b.equipment || {};
  var mine = ui.user && b.user_id === ui.user.id, can = mine || (me && me.admin), past = en < new Date();
  return '<article class="akcard bkcard ' + (e.kind || "") + '"><p class="aktime">' + hhmm(st) + "–" + hhmm(en) + "</p><h3>" + esc(e.name || "Udstyr") + '</h3><p class="akplace">' + esc([b.name, bkLabel(b) ? "lejl. " + bkLabel(b) : ""].filter(Boolean).join(" · ")) + (b.source === "skaerm" ? " · booket på skærmen" : "") + "</p>" +
    (can && !past ? '<div class="akbtns"><button class="linkbtn danger-t" type="button" data-bkdel="' + esc(b.id) + '">' + (ui.bkDelConfirm === b.id ? "Tryk igen for at aflyse" : "Aflys") + "</button></div>" : "") + "</article>";
}
function bkKey(b) { return [b.starts_at, b.ends_at, b.user_id || "", b.lejlighed || "", b.name || ""].join("|"); }
// Kort tekst for en gruppe: "Cykel 3" – eller "2 cykler, golf herre 2"
function bkWhat(g) {
  if (g.length === 1) return String((g[0].equipment || {}).name || "").replace("Golfsæt ", "Golf ");
  var c = g.filter(function (b) { return (b.equipment || {}).kind === "cykel"; }).length, gl = g.length - c, out = [];
  if (c) out.push(c === 1 ? "1 cykel" : c + " cykler"); if (gl) out.push(gl === 1 ? "1 golfsæt" : gl + " golfsæt");
  return out.join(", ");
}
// Fordel blokke, der overlapper, i spor ved siden af hinanden (kun så smalle, som nødvendigt)
function lanes(rows) {
  rows.sort(function (a, b) { return a.a - b.a || b.z - a.z; });
  var cluster = [], end = -1, laneEnd = [];
  var flush = function () { var n = laneEnd.length || 1; cluster.forEach(function (r) { r.n = n; }); cluster = []; laneEnd = []; };
  rows.forEach(function (r) {
    if (r.a >= end) flush();
    var k = laneEnd.findIndex(function (e) { return e <= r.a; }); if (k < 0) { k = laneEnd.length; laneEnd.push(r.z); } else laneEnd[k] = r.z;
    r.k = k; cluster.push(r); end = Math.max(end, r.z);
  });
  flush();
}
// Tidsskema som på skærmen: tiderne ude til venstre, en kolonne pr. dag, blokke for hver booking/aktivitet.
// rowsFor(dag, d0, d1) giver blokke {a, z (timer), html(stil)}; overlappende blokke lægges i spor ved siden af hinanden.
function tgGrid(days, todayK, h0, h1, rowsFor) {
  var span = h1 - h0, now = new Date(), nowH = now.getHours() + now.getMinutes() / 60;
  var ax = '<div class="tgax"><div class="tgh">&nbsp;</div><div class="tgbody">';
  for (var t = h0; t <= h1; t += 2) ax += '<span style="top:' + ((t - h0) / span * 100) + '%">' + p2(t) + "</span>";
  ax += "</div></div>";
  // Timestreger som rigtige streger (en baggrundsgradient tabte nogle af dem ved afrunding)
  var hourLines = "";
  for (var h = h0 + 1; h < h1; h++) hourLines += '<i class="tgl" style="top:' + ((h - h0) / span * 100) + '%"></i>';
  return '<div class="tgwrap" style="--n:' + days.length + '">' + ax + days.map(function (x) {
    var d0 = new Date(x.d), d1 = new Date(x.d); d1.setDate(d1.getDate() + 1);
    var rows = rowsFor(x, d0, d1).map(function (r) { r.a = Math.max(h0, r.a); r.z = Math.min(h1, r.z); return r; }).filter(function (r) { return r.z > r.a; });
    lanes(rows);
    var blocks = rows.map(function (r) {
      return r.html('top:' + ((r.a - h0) / span * 100) + "%;height:" + ((r.z - r.a) / span * 100) + "%;left:calc(" + (r.k / r.n * 100) + "% + 2px);width:calc(" + (100 / r.n) + "% - 4px)");
    }).join("");
    var nowLine = x.k === todayK && nowH >= h0 && nowH <= h1 ? '<span class="tgnow" style="top:' + ((nowH - h0) / span * 100) + '%"></span>' : "";
    return '<div class="tgday' + (x.k === todayK ? " today" : "") + '"><div class="tgh"><b>' + (x.k === todayK ? "I dag" : DA_DAY[x.d.getDay()].slice(0, 3)) + "</b> <span>" + x.d.getDate() + ". " + DA_MON[x.d.getMonth()] + '</span></div><div class="tgbody">' + hourLines + blocks + nowLine + "</div></div>";
  }).join("") + "</div>";
}
function hOf(d, d0, d1, edge) { return d < d0 ? 0 : d >= d1 ? 24 : d.getHours() + d.getMinutes() / 60; }
function bkGrid(days, todayK) {
  return tgGrid(days, todayK, BK_H0, BK_H1, function (x, d0, d1) {
    // Samme person, samme tidsrum = én blok (fx "2 cykler + golfsæt")
    var groups = {};
    bkData.list.filter(function (b) { return new Date(b.starts_at) < d1 && new Date(b.ends_at) > d0; }).forEach(function (b) { var k = bkKey(b); (groups[k] = groups[k] || []).push(b); });
    return Object.keys(groups).map(function (k) {
      var g = groups[k], b = g[0];
      var mine = ui.user && b.user_id === ui.user.id, kinds = g.map(function (y) { return (y.equipment || {}).kind; });
      var kind = kinds.every(function (q) { return q === "golf"; }) ? "golf" : kinds.every(function (q) { return q === "cykel"; }) ? "cykel" : "mix";
      return { a: hOf(new Date(b.starts_at), d0, d1), z: hOf(new Date(b.ends_at), d0, d1), html: function (st) {
        return '<button type="button" class="tgb ' + kind + (mine ? " mine" : "") + '" data-bkpick="' + esc(k) + '" style="' + st + '"><b>' + esc(bkLabel(b) || b.name || "") + "</b>" + esc(bkWhat(g)) + "</button>"; } };
    });
  });
}
// Aktiviteter uden sluttid vises som 1½ time. Skemaet går fra kl. 8 til 20 – længere, hvis en aktivitet ligger uden for
var AK_LEN = 1.5;
function akEnd(a) { return a.ends_at ? new Date(a.ends_at) : new Date(new Date(a.starts_at).getTime() + AK_LEN * 3600000); }
function akHours() {
  var h0 = 8, h1 = 20;
  (aktData ? aktData.list : []).forEach(function (a) {
    var st = new Date(a.starts_at), en = akEnd(a), sh = st.getHours(), eh = en.getHours() + (en.getMinutes() ? 1 : 0);
    if (dayKey(en) !== dayKey(st)) eh = 24;
    h0 = Math.min(h0, sh); h1 = Math.max(h1, eh);
  });
  return [h0, Math.min(24, h1)];
}
function aktGrid(days, todayK) {
  var hr = akHours();
  return tgGrid(days, todayK, hr[0], hr[1], function (x) {
    return x.items.map(function (a) {
      var st = new Date(a.starts_at), en = akEnd(a), a0 = st.getHours() + st.getMinutes() / 60, z = dayKey(en) !== dayKey(st) ? 24 : en.getHours() + en.getMinutes() / 60;
      var sig = a.signup ? aktUsed(a) : 0, mine = ui.user && (a.activity_signups || []).some(function (y) { return y.user_id === ui.user.id; });
      return { a: a0, z: Math.max(z, a0 + 0.75), html: function (stl) {
        return '<button type="button" class="tgb akt' + (a.cancelled ? " cancel" : "") + (mine ? " mine" : "") + '" data-akpick="' + esc(a.id) + '" style="' + stl + '"><b>' + esc(a.title) + "</b>" +
          (a.cancelled ? "Aflyst" : esc(a.place || "")) + (a.signup && !a.cancelled ? '<small>' + sig + (a.max_people ? "/" + a.max_people : "") + " tilmeldt</small>" : "") + "</button>"; } };
    });
  });
}
function bkFormHtml() {
  ui.bkSel = (ui.bkSel || []).filter(bkIsFree);
  var hs = function (name, v, min, max) { var o = ""; for (var x = min; x <= max; x++) o += '<option value="' + x + '"' + (x === v ? " selected" : "") + ">" + p2(x) + ".00</option>"; return '<select name="' + name + '" data-bkt="' + name + '">' + o + "</select>"; };
  return '<form class="panel" id="bk-form"><h2>Book udstyr</h2>' +
    '<div class="akrow"><label>Dato<input type="date" name="date" data-bkt="date" required min="' + dayKey(new Date()) + '" value="' + esc(ui.bkDate) + '"></label>' +
    '<label>Fra kl.' + hs("from", ui.bkFrom, BK_H0, BK_H1 - 1) + '</label><label>Til kl.' + hs("to", ui.bkTo, ui.bkFrom + 1, BK_H1) + "</label></div>" +
    '<p class="hint">Hvad vil du låne? Vælg gerne flere. Gråt er optaget i det tidsrum.</p><div class="bkgrid">' + bkData.equip.map(function (e) {
      var free = bkIsFree(e.id), on = ui.bkSel.indexOf(e.id) >= 0;
      return '<button type="button" class="bkit ' + e.kind + (on ? " on" : "") + '" data-bksel="' + esc(e.id) + '"' + (free ? "" : " disabled") + ">" + esc(e.name) + (free ? "" : "<small>optaget</small>") + "</button>";
    }).join("") + "</div>" + (ui.bkErr ? '<p class="error">' + esc(ui.bkErr) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.bkSel.length ? "" : " disabled") + ">Book" + (ui.bkSel.length > 1 ? " " + ui.bkSel.length + " ting" : "") + '</button><button class="btn" type="button" data-bkclose="1">Annuller</button></div></form>';
}
function udstyrPageHtml() {
  if (!bkData) { loadBk(); return '<section class="akhead"><h2>Booking af udstyr</h2></section><p class="loading">Henter…</p>'; }
  var h = '<section class="akhead"><h2>Booking af udstyr</h2>' + (ui.editor && !ui.bkForm ? '<button class="btn primary" type="button" data-bknew="1">+ Book udstyr</button>' : "") + "</section>";
  h += '<p class="notice">Test: bookinger her er rigtige og kan ses på skærmen i receptionen.</p>';
  if (bkData.err) h += '<p class="error">' + esc(bkData.err) + "</p>";
  if (ui.bkForm) h += bkFormHtml();
  if (ui.bkPick) {   // valgt booking (evt. flere ting booket sammen): vis detaljer og Aflys
    var grp = bkData.list.filter(function (b) { return bkKey(b) === ui.bkPick; });
    if (grp.length) {
      var pb = grp[0], pst = new Date(pb.starts_at), pen = new Date(pb.ends_at), pcan = ((ui.user && pb.user_id === ui.user.id) || (me && me.admin)) && pen > new Date();
      h += '<section class="panel bkpick"><p><strong>' + dayTitle(pst) + " kl. " + hhmm(pst) + "–" + hhmm(pen) + "</strong><br>" + esc([pb.name, bkLabel(pb) ? "lejl. " + bkLabel(pb) : ""].filter(Boolean).join(" · ")) + (pb.source === "skaerm" ? " · booket på skærmen" : "") + "</p>" +
        '<ul class="nlist">' + grp.map(function (b) { return '<li class="nitem"><span>' + esc((b.equipment || {}).name || "Udstyr") + "</span>" + (pcan ? '<button class="linkbtn danger-t" type="button" data-bkdel="' + esc(b.id) + '">' + (ui.bkDelConfirm === b.id ? "Tryk igen for at aflyse" : "Aflys") + "</button>" : "") + "</li>"; }).join("") + "</ul>" +
        '<div class="row"><button class="btn" type="button" data-bkpick="">Luk</button></div></section>';
    }
  }
  h += weekBlockHtml(bkData.list, bkCard, "Intet booket", bkGrid);
  return h;
}
async function bkBook() {
  var rg = bkRange(); if (rg[1] < new Date()) { ui.bkErr = "Tidsrummet er allerede passeret."; render(); return; }
  var made = [], err = "";
  for (var i = 0; i < ui.bkSel.length; i++) {
    var r = await sb.from("equipment_bookings").insert({ equipment_id: ui.bkSel[i], starts_at: rg[0].toISOString(), ends_at: rg[1].toISOString(), andel_id: me && me.andel, name: (me && me.name) || "" }).select("id").single();
    if (r.error) { var nm = (bkData.equip.filter(function (e) { return e.id === ui.bkSel[i]; })[0] || {}).name || "Udstyret"; err = /dobbeltbooking|exclu|23P01/i.test(r.error.message + (r.error.code || "")) ? nm + " er allerede booket i det tidsrum." : "Bookingen blev ikke gemt: " + r.error.message; break; }
    made.push(r.data.id);
  }
  if (err && made.length) await sb.from("equipment_bookings").delete().in("id", made);
  ui.bkErr = err;
  if (!err) {
    ui.msg = made.length === 1 ? "Booket – god tur!" : made.length + " ting er booket – god tur!"; ui.bkSel = []; ui.bkForm = false;
    var off = Math.floor((new Date(rg[0].getFullYear(), rg[0].getMonth(), rg[0].getDate()) - weekStart(0)) / (7 * 86400000));
    ui.akWeek = Math.max(0, Math.min(AK_WEEKS - 1, off)); ui.akDay = dayKey(rg[0]);
  }
  bkData = null; render(); if (!err) window.scrollTo({ top: 0 });
}
async function bkDelete(id) { await sb.from("equipment_bookings").delete().eq("id", id); ui.bkDelConfirm = null; ui.bkPick = null; ui.msg = "Bookingen er aflyst."; bkData = null; render(); }
function soonHtml(k) {
  var udst = k === "udstyr";
  return '<section class="panel"><h2>' + (udst ? "Booking af udstyr" : "Den sorte bog") + '</h2><p class="notice">Test – kommer snart.</p><p>' +
    (udst ? "Her kommer man til at kunne booke cykler, golfsæt og andet udstyr – også fra Danmark, fx to cykler i næste uge. Bookinger herfra og fra skærmen i receptionen er de samme."
      : "Her kommer man til at kunne skrive, hvis noget er gået i stykker eller mangler i en lejlighed – fx et knust spejl eller manglende gryder. Den ansvarlige får besked og kan markere, når det er ordnet.") +
    '</p></section>';
}

/* ---------- Den sorte bog: fejl og mangler. Ny sag laves med en guide i 4 trin, så alle oplysninger kommer med ---------- */
var sbData = null, sbLoading = false;
var SB_STEPS = ["Hvor er det?", "Hvad er galt?", "Billeder", "Hvor haster det?"];
var SB_AREAS = ["Receptionen", "Fællesrummet / spisesalen", "Køkkenet i fællesrummet", "Terrassen", "Poolområdet", "Udendørs brusere", "Trapper og gange", "Garagen / depotrum", "Haven / udearealer", "Andet"];
var SB_PRIO = { rod: ["Rød", "Haster", "Fx vandskade, noget der er farligt, eller lejligheden kan ikke bruges"], gul: ["Gul", "Bør ordnes snart", "Fx en sprunget pære eller en maskine, der ikke virker ordentligt"], gron: ["Grøn", "Kan vente", "Fx en ridse i gulvet eller noget, der mangler at blive købt"] };
var SB_STATUS = { ny: "Ny", igang: "I gang", bestilt: "Bestilt", loest: "Løst" };
function sbMyLejl() { var a = me && andelLabels[me.andel]; return a ? String(a).split("-")[0].replace(/ m\.fl\.$/, "") : ""; }
async function loadSb() {
  if (sbLoading) return; sbLoading = true;
  var r = await sb.from("defects").select("*").order("created_at", { ascending: false }).limit(500);
  var list = r.data || [], ph = [];
  if (list.length) {
    var p = await sb.from("photos").select("path, thumb, target").eq("kind", "defect").in("target", list.map(function (d) { return d.id; }));
    ph = p.data || [];
    ph.forEach(function (x) { if (x.thumb) THUMBS[x.path] = 1; });
    await signPhotos(ph.reduce(function (a, x) { a.push(x.path); if (x.thumb) a.push(thumbPath(x.path)); return a; }, []));
  }
  sbLoading = false;
  sbData = { list: list, photos: ph, err: r.error ? "Den sorte bog kunne ikke hentes: " + r.error.message : "" };
  if (ui.page === "sortbog") render();
}
function sbWhere(d) {
  return d.where_kind === "lejlighed" ? "Lejl. " + (d.where_lejl || "?") : d.where_kind === "udstyr" ? "Udstyr" + (d.where_text ? ": " + d.where_text : "") : (d.where_text || "Fællesområde");
}
function sbCard(d) {
  var pr = SB_PRIO[d.priority] || ["", ""], st = new Date(d.created_at), mine = ui.user && d.created_by === ui.user.id, adm = me && me.admin;
  var pics = (sbData.photos || []).filter(function (x) { return x.target === d.id; });
  var h = '<article class="sbcard ' + d.status + '"><div class="sbtop"><span class="sbprio ' + d.priority + '">' + pr[0] + '</span><span class="sbstat ' + d.status + '">' + SB_STATUS[d.status] + (d.status === "loest" && d.solved_at ? " " + new Date(d.solved_at).toLocaleDateString("da-DK", { day: "numeric", month: "short" }) : "") + "</span>" +
    '<span class="sbdate">' + st.getDate() + ". " + DA_MON[st.getMonth()] + " " + st.getFullYear() + "</span></div>" +
    "<h3>" + esc(sbWhere(d)) + (d.item ? " · " + esc(d.item) : "") + "</h3>" +
    '<p class="sbdesc">' + esc(d.description) + "</p>" +
    (pics.length ? '<div class="qthumbs sbpics">' + pics.map(function (x) { return '<a href="' + esc(photoUrl(x.path)) + '" target="_blank" rel="noopener"><img src="' + esc(photoUrl(x.path, true)) + '" alt="Billede af problemet"></a>'; }).join("") + "</div>" : "") +
    '<p class="sbwho">Skrevet af ' + esc(d.reporter_name || "?") + (d.andel_id && andelLabels[d.andel_id] ? " (" + esc(String(andelLabels[d.andel_id]).replace(/ m\.fl\.$/, "")) + ")" : "") + (d.source === "regneark" ? " · fra det gamle regneark" : "") + "</p>" +
    (d.handling || d.sent_limaser ? '<p class="sbhandl"><b>Opfølgning:</b> ' + esc([d.handling, d.sent_limaser ? "sendt til Limaser" : ""].filter(Boolean).join(" · ")) + "</p>" : "");
  if (adm) {
    h += '<div class="sbadm" data-sbid="' + esc(d.id) + '"><label>Status<select data-sbset="status">' + Object.keys(SB_STATUS).map(function (k) { return '<option value="' + k + '"' + (k === d.status ? " selected" : "") + ">" + SB_STATUS[k] + "</option>"; }).join("") + "</select></label>" +
      '<label>Opfølgning<input data-sbset="handling" maxlength="200" placeholder="Fx Stig har bestilt tekniker 12.11" value="' + esc(d.handling || "") + '"></label>' +
      '<label class="akcheck"><input type="checkbox" data-sbset="sent_limaser"' + (d.sent_limaser ? " checked" : "") + "> Sendt til Limaser</label></div>";
  }
  if ((mine && d.status === "ny") || adm) h += '<div class="akbtns"><button class="linkbtn danger-t" type="button" data-sbdel="' + esc(d.id) + '">' + (ui.sbDelConfirm === d.id ? "Tryk igen for at slette sagen" : "Slet") + "</button></div>";
  return h + "</article>";
}
function sortbogPageHtml() {
  if (!sbData) { loadSb(); return '<section class="akhead"><h2>Den sorte bog</h2></section><p class="loading">Henter…</p>'; }
  var h = '<section class="akhead"><h2>Den sorte bog</h2>' + (ui.editor ? '<button class="btn primary" type="button" data-sbnew="1">+ Ny sag</button>' : "") + "</section>";
  h += '<p class="notice">Test: sager, du opretter her, er rigtige og kan ses af alle andre testere.</p>';
  h += '<p class="hint">Er noget gået i stykker, eller mangler der noget? Opret en sag, så den ansvarlige kan følge op. Har du brug for akut hjælp, så ring eller skriv til Stig på WhatsApp/telefon +45 20 16 12 17.</p>';
  if (sbData.err) h += '<p class="error">' + esc(sbData.err) + "</p>";
  var f = ui.sbFilter || "open", open = sbData.list.filter(function (d) { return d.status !== "loest"; }), done = sbData.list.filter(function (d) { return d.status === "loest"; });
  var ord = { rod: 0, gul: 1, gron: 2 };
  var srt = ui.sbSort || (f === "open" ? "prio" : "date");
  var byDate = function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); };
  var list = (f === "open" ? open : done).slice().sort(srt === "prio" ? function (a, b) { return (ord[a.priority] - ord[b.priority]) || byDate(a, b); } : srt === "old" ? function (a, b) { return byDate(b, a); } : byDate);
  h += '<div class="sbtabs"><button type="button" class="chip' + (f === "open" ? " on" : "") + '" data-sbf="open">Åbne sager (' + open.length + ')</button><button type="button" class="chip' + (f === "done" ? " on" : "") + '" data-sbf="done">Løste (' + done.length + ")</button>" +
    '<label class="sbsort">Sortér<select data-sbsort="1">' + [["prio", "Prioritet"], ["date", "Nyeste først"], ["old", "Ældste først"]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === srt ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label></div>";
  h += list.length ? '<div class="sblist">' + list.map(sbCard).join("") + "</div>" : '<p class="hint">' + (f === "open" ? "Ingen åbne sager." : "Ingen løste sager endnu.") + "</p>";
  if (ui.sb) h += sbWizHtml();
  return h;
}
function sbWizHtml() {
  var w = ui.sb, step = w.step, body = "", next = '<button type="button" class="btn primary" data-sbw="next">Næste</button>';
  if (step === 1) {
    body = '<div class="wizbig">' +
      '<button type="button" class="wizopt' + (w.kind === "lejlighed" ? " on" : "") + '" data-sbkind="lejlighed">' + ICON_HOME + '<span><strong>I en lejlighed</strong><small>Fx noget i køkkenet, badeværelset eller soveværelset</small></span></button>' +
      '<button type="button" class="wizopt' + (w.kind === "faelles" ? " on" : "") + '" data-sbkind="faelles">' + ICON_PIN + '<span><strong>På et fællesområde</strong><small>Fx receptionen, poolen, terrassen eller fællesrummet</small></span></button>' +
      '<button type="button" class="wizopt' + (w.kind === "udstyr" ? " on" : "") + '" data-sbkind="udstyr">' + ICON_BIKE + '<span><strong>Udstyr, der lånes ud</strong><small>Fx en cykel, et golfsæt eller en motionscykel</small></span></button></div>';
    if (w.kind === "lejlighed") body += '<label>Hvilken lejlighed?<input data-sbf2="lejl" inputmode="numeric" maxlength="4" placeholder="Fx 203" value="' + esc(w.lejl || "") + '"></label>';
    if (w.kind === "faelles") body += '<p class="hint">Hvor?</p><div class="sbareas">' + SB_AREAS.map(function (a) { return '<button type="button" class="chip' + (w.area === a ? " on" : "") + '" data-sbarea="' + esc(a) + '">' + esc(a) + "</button>"; }).join("") + "</div>" +
      (w.area === "Andet" ? '<label>Skriv hvor<input data-sbf2="areaTxt" maxlength="80" placeholder="Fx parkeringspladsen" value="' + esc(w.areaTxt || "") + '"></label>' : "");
    if (w.kind === "udstyr") body += '<label>Hvilket udstyr?<input data-sbf2="equip" maxlength="80" placeholder="Fx Cykel 3 eller Golfsæt dame 1" value="' + esc(w.equip || "") + '"></label>';
  } else if (step === 2) {
    body = '<label>Hvad drejer det sig om?<input data-sbf2="item" maxlength="80" placeholder="Fx opvaskemaskinen, dørhåndtaget, håndklæder" value="' + esc(w.item || "") + '"></label>' +
      '<label>Beskriv problemet<textarea data-sbf2="desc" maxlength="1500" placeholder="Hvad er der galt? Hvornår opdagede du det? Er der noget, du allerede har prøvet?">' + esc(w.desc || "") + "</textarea></label>" +
      '<p class="hint">Skriv så meget, at den, der skal ordne det, kan forstå problemet uden at ringe til dig.</p>';
  } else if (step === 3) {
    body = '<p class="hint">Et billede gør det meget lettere at se, hvad der er galt. Du kan tage et nu eller vælge nogle, du allerede har.</p>' +
      (w.files.length ? '<div class="qthumbs">' + w.files.map(function (x, i) { return '<div class="qthumb"><img src="' + esc(x.url) + '" alt=""><button type="button" class="sbrm" data-sbrm="' + i + '" aria-label="Fjern billede">×</button></div>'; }).join("") + "</div>" : "") +
      '<div class="wizbig"><button type="button" class="wizopt" data-sbpic="cam">' + ICON_CAM + '<span><strong>Tag et billede</strong><small>Med telefonens kamera</small></span></button>' +
      '<button type="button" class="wizopt" data-sbpic="pick">' + ICON_CAM + '<span><strong>Vælg billeder</strong><small>Fra telefonen eller computeren</small></span></button></div>' +
      (w.files.length ? "" : '<p class="hint">Har du ikke et billede, så tryk bare Næste.</p>');
  } else {
    body = '<div class="wizbig">' + Object.keys(SB_PRIO).map(function (k) { var p = SB_PRIO[k];
      return '<button type="button" class="wizopt sbpr ' + k + (w.prio === k ? " on" : "") + '" data-sbprio="' + k + '"><span class="sbdot ' + k + '"></span><span><strong>' + p[0] + " – " + p[1] + "</strong><small>" + p[2] + "</small></span></button>"; }).join("") + "</div>" +
      '<p class="hint">Har du brug for akut hjælp, så ring eller skriv også til Stig på WhatsApp/telefon +45 20 16 12 17.</p>' +
      '<p class="hint">Sagen bliver gemt med dit navn' + (sbMyLejl() ? " og andel " + esc(String(andelLabels[me.andel]).replace(/ m\.fl\.$/, "")) : "") + ".</p>";
    next = '<button type="button" class="btn primary" data-sbw="save"' + (w.busy ? " disabled" : "") + ">" + (w.busy ? (w.prog || "Gemmer…") : "Opret sag") + "</button>";
  }
  return '<div class="wizwrap"><div class="rback"></div><div class="helpmodal wiz" role="dialog" aria-modal="true">' +
    '<button type="button" class="hclose" data-sbw="close" aria-label="Luk">×</button>' +
    '<div class="wizdots" aria-label="Trin ' + step + ' af 4">' + SB_STEPS.map(function (s, i) { return '<span class="' + (i + 1 < step ? "done" : i + 1 === step ? "on" : "") + '"></span>'; }).join("") + "</div>" +
    '<p class="eyebrow">Ny sag i den sorte bog · trin ' + step + " af 4</p><h2>" + SB_STEPS[step - 1] + "</h2>" + body +
    (w.err ? '<p class="err" role="alert">' + esc(w.err) + "</p>" : "") +
    '<div class="row wizfoot">' + (step > 1 ? '<button type="button" class="btn" data-sbw="back">Tilbage</button>' : '<button type="button" class="btn" data-sbw="close">Annuller</button>') + next + "</div></div></div>";
}
function sbCheck(step) {
  var w = ui.sb;
  if (step === 1) {
    if (!w.kind) return "Vælg hvor problemet er.";
    if (w.kind === "lejlighed" && !/^\d{3,4}$/.test((w.lejl || "").trim())) return "Skriv lejlighedens nummer, fx 203.";
    if (w.kind === "faelles" && !w.area) return "Vælg hvor på fællesområdet.";
    if (w.kind === "faelles" && w.area === "Andet" && !(w.areaTxt || "").trim()) return "Skriv hvor det er.";
    if (w.kind === "udstyr" && !(w.equip || "").trim()) return "Skriv hvilket udstyr det drejer sig om.";
  }
  if (step === 2) {
    if (!(w.item || "").trim()) return "Skriv hvad det drejer sig om, fx opvaskemaskinen.";
    if ((w.desc || "").trim().length < 10) return "Beskriv problemet lidt mere – mindst en hel sætning.";
  }
  if (step === 4 && !w.prio) return "Vælg hvor meget det haster.";
  return "";
}
function sbOpen() { ui.sb = { step: 1, kind: null, lejl: sbMyLejl(), files: [], err: "" }; render(); }
function sbClose() { if (ui.sb) ui.sb.files.forEach(function (x) { try { URL.revokeObjectURL(x.url); } catch (e) {} }); ui.sb = null; render(); }
function sbNav(dir) {
  var w = ui.sb; if (!w || w.busy) return;
  if (dir === "close") { sbClose(); return; }
  if (dir === "back") { w.err = ""; w.step = Math.max(1, w.step - 1); render(); return; }
  var e = sbCheck(w.step); w.err = e; if (e) { render(); return; }
  if (dir === "next") { w.step = Math.min(4, w.step + 1); render(); return; }
  if (dir === "save") sbSave();
}
async function sbSave() {
  var w = ui.sb; w.busy = true; w.err = ""; render();
  try {
    var row = { created_by: ui.user.id, andel_id: me.andel, reporter_name: (me && me.name) || "", where_kind: w.kind,
      where_lejl: w.kind === "lejlighed" ? w.lejl.trim() : null,
      where_text: w.kind === "faelles" ? (w.area === "Andet" ? w.areaTxt.trim() : w.area) : w.kind === "udstyr" ? w.equip.trim() : null,
      item: w.item.trim(), description: w.desc.trim(), priority: w.prio };
    var r = await sb.from("defects").insert(row).select("id").single();
    if (r.error) throw new Error("Sagen blev ikke gemt: " + r.error.message);
    if (w.files.length) {
      var paths = await uploadFiles("sortbog-" + r.data.id, w.files.map(function (x) { return x.file; }), function (i, n) { w.prog = "Uploader billede " + i + " af " + n + "…"; render(); });
      await addPhotoRows("defect", r.data.id, paths.map(function (p) { return { path: p, vis: "alle" }; }));
    }
    sbClose(); ui.sbFilter = "open"; ui.msg = "Sagen er oprettet. Tak!"; sbData = null; render(); window.scrollTo({ top: 0 });
  } catch (x) { w.busy = false; w.prog = ""; w.err = x.message || "Det lykkedes ikke at gemme sagen."; render(); }
}
async function sbSet(id, field, val) {
  var u = {}; u[field] = val;
  var r = await sb.from("defects").update(u).eq("id", id);
  ui.msg = r.error ? "Det blev ikke gemt: " + r.error.message : field === "status" ? "Status er ændret til " + SB_STATUS[val].toLowerCase() + "." : "Gemt.";
  sbData = null; render();
}
async function sbDelete(id) {
  var pics = (sbData.photos || []).filter(function (x) { return x.target === id; });
  var r = await sb.from("defects").delete().eq("id", id).select("id");
  if (!r.error && (r.data || []).length && pics.length) {
    // Filerne først – bagefter kan de ikke længere ses (og dermed ikke slettes), når billedrækkerne er væk
    await sb.storage.from("photos").remove(withThumbs(pics.map(function (x) { return x.path; })));
    await sb.from("photos").delete().eq("kind", "defect").eq("target", id);
  }
  ui.sbDelConfirm = null; ui.msg = r.error ? "Sagen blev ikke slettet: " + r.error.message : !(r.data || []).length ? "Sagen blev ikke slettet." : "Sagen er slettet.";
  sbData = null; render();
}
// Billeder: kamera eller fra telefonen/computeren
var sbCam = document.createElement("input"); sbCam.type = "file"; sbCam.accept = "image/*"; sbCam.setAttribute("capture", "environment"); sbCam.hidden = true;
var sbPick = document.createElement("input"); sbPick.type = "file"; sbPick.accept = "image/*"; sbPick.multiple = true; sbPick.hidden = true;
document.body.appendChild(sbCam); document.body.appendChild(sbPick);
[sbCam, sbPick].forEach(function (inp) {
  inp.addEventListener("change", function () {
    if (ui.sb) Array.prototype.slice.call(inp.files).slice(0, 8 - ui.sb.files.length).forEach(function (f) { ui.sb.files.push({ file: f, url: URL.createObjectURL(f) }); });
    inp.value = ""; render();
  });
});
document.addEventListener("input", function (e) { var k = e.target.dataset && e.target.dataset.sbf2; if (k && ui.sb) ui.sb[k] = e.target.value; });
document.addEventListener("change", function (e) {
  if (e.target.dataset && e.target.dataset.sbsort) { ui.sbSort = e.target.value; render(); return; }
  var k = e.target.dataset && e.target.dataset.sbset; if (!k) return; var box = e.target.closest("[data-sbid]"); if (!box) return;
  sbSet(box.dataset.sbid, k, e.target.type === "checkbox" ? e.target.checked : k === "handling" ? (e.target.value.trim() || null) : e.target.value);
});

/* ---------- Vores andel: medlemmer, invitationer, billeder med personer ---------- */
var andelData = null;
async function loadAndel() {
  var m = await sb.from("members").select("*").eq("andel_id", me.andel).order("created_at");
  andelData = { members: m.data || [], err: m.error ? m.error.message : "" };
  render();
}
/* Boks der foldes ud ved tryk (Vores andel) */
function foldBox(key, titleHtml, hint, bodyHtml, cls) {
  var open = !!(ui.fold && ui.fold[key]);
  return '<section class="panel nbox' + (cls ? " " + cls : "") + '"><button type="button" class="nhead" data-fold="' + esc(key) + '" aria-expanded="' + open + '"><span>' + titleHtml + (hint ? '<span class="hint">' + esc(hint) + "</span>" : "") + '</span><span class="sincego" aria-hidden="true">' + (open ? "⌃" : "›") + "</span></button>" +
    (open ? '<div class="nbody">' + bodyHtml + "</div>" : "") + "</section>";
}
function andelPageHtml() {
  var d = andelData, owner = me.role === "ejer" || me.admin, many = me.allLabels && me.allLabels.length > 1;
  var h = '<h2 class="pagetitle">' + (many ? "Vores andele" : "Vores andel") + "</h2>";
  var sw = andelSwitchHtml(); if (sw) h += '<section class="panel">' + sw + "</section>";
  if (!d) { loadAndel(); return h + '<section class="panel"><p>Henter…</p></section>'; }
  function personRow(m) {
    var you = m.user_id === ui.user.id;
    return "<li><span><strong>" + esc(m.name || m.email) + "</strong> " + roleName(m.role) + (you ? " (dig)" : "") + '<br><span class="hint">' + esc(m.email) + (m.user_id ? "" : " · inviteret, har ikke logget ind endnu") + "</span>" + (!m.user_id && owner ? '<br><button class="linkbtn" type="button" data-reinvite="' + esc(m.email) + '" data-rname="' + esc(m.name || "") + '" data-rrole="' + esc(m.role) + '">Send invitationen igen</button>' : "") + "</span>" +
      (owner && !you ? '<button class="btn small danger" type="button" data-rmmember="' + esc(m.email) + '">' + (ui.confirmRm === m.email ? "Tryk igen for at fjerne" : "Fjern adgang") + "</button>" : "") + "</li>";
  }
  var owners = d.members.filter(function (m) { return m.role === "ejer"; }), guests = d.members.filter(function (m) { return m.role !== "ejer"; });
  var nums = (andelNums[me.andel] || [{ l: String(me.label).split("-")[0], n: String(me.label).split("-")[1] }]);
  var ownerBody = '<ul class="members">' + owners.map(personRow).join("") + "</ul>" + '<p class="hint">Ejere og gæster ser og kan det samme i guiden. Kun ejere kan give og fjerne adgang.</p>';
  nums.forEach(function (x) {
    h += foldBox("andel-" + x.l + "-" + x.n, "<strong>Andel " + esc(x.l + "-" + x.n) + "</strong>", ["Lejlighed " + x.l, x.r ? "rul " + x.r : "", owners.length === 1 ? "1 ejer" : owners.length + " ejere"].filter(Boolean).join(" · "), ownerBody);
  });
  var gBody = (guests.length ? '<ul class="members">' + guests.map(personRow).join("") + "</ul>" : "") +
    (owner ? '<form id="invite-form" class="invite"><h3>Låner nogen jeres lejlighed? ' + helpBtn("invite", "inline") + '</h3><p class="hint">Giv familie eller venner, der skal låne lejligheden, adgang til guiden, så de kan finde rundt i området.</p><div class="grid"><label>Fornavn<input id="i-name" required placeholder="Fx Emma"></label><label>Mail<input id="i-email" type="email" required placeholder="navn@mail.dk"></label></div>' +
      '<button class="btn primary" type="submit">Invitér</button></form>' : "") +
    (d.err ? '<p class="err">' + esc(d.err) + "</p>" : "");
  h += foldBox("gaester", "<strong>Gæster</strong>", guests.length ? (guests.length === 1 ? "1 gæst" : guests.length + " gæster") + " · Låner nogen jeres lejlighed?" : "Låner nogen jeres lejlighed?", gBody);
  h += notifyHtml();
  // Billeder med personer, som kun vores andel kan se
  var ph = raw.photos.filter(function (p) { return p.andel_id === me.andel && (p.faces !== false || p.visibility !== "alle"); });
  var guest = !canSetVis(false);
  if (ph.length) {
    h += '<section class="panel nbox"><button type="button" class="nhead" data-fold="faces" aria-expanded="' + !!(ui.fold && ui.fold.faces) + '"><span><strong>Billeder med personer</strong> (' + ph.length + ')<span class="hint">' + (guest ? "Se hvem der kan se dem" : "Vælg, hvem der kan se dem") + '</span></span><span class="sincego" aria-hidden="true">' + (ui.fold && ui.fold.faces ? "⌃" : "›") + "</span></button>";
    if (ui.fold && ui.fold.faces) h += '<div class="nbody">' +
      '<p class="hint">Billeder, hvor guiden har fundet personer (eller ikke kunne tjekke). De er som udgangspunkt kun for jeres andel. Tryk "Alle" på et billede, hvis andre andelshavere gerne må se det.</p>' +
      '<div class="pgrid">' + ph.map(function (p) {
        // Gæster ser ejernes billeder, men kan kun ændre deres egne
        if (!canSetVis(p.owner === ui.user.id)) return '<div class="pcell"><img src="' + esc(photoUrl(p.path, true)) + '" alt="" loading="lazy"><p class="hint">Kan ses af: ' + esc(VIS_NAMES[p.visibility] || p.visibility) + "</p></div>";
        return '<div class="pcell"><img src="' + esc(photoUrl(p.path, true)) + '" alt="" loading="lazy"><div class="seg small" role="group" aria-label="Hvem kan se billedet">' +
          [["alle", "Alle"], ["andel", "Vores andel"], ["mig", "Kun mig"]].filter(function (o) { return o[0] !== "mig" || p.owner === ui.user.id || p.visibility === "mig"; }).map(function (o) { return '<button type="button" data-setvis="' + esc(p.id) + '" data-v="' + o[0] + '" aria-pressed="' + (p.visibility === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div></div>";
      }).join("") + "</div></div>";
    h += "</section>";
  }
  // Slet min konto
  h += foldBox("slet", '<strong class="danger-t">Slet min konto</strong>', "", '<p class="hint">Sletter dit login og din plads på andel ' + esc(me.label) + ". Det, du har lagt ind – steder, vurderinger, tekster og billeder – bliver hos andelen, så de andre ikke mister det.</p>" +
    (me.admin ? '<p class="hint">Som administrator kan du ikke slette din egen konto her.</p>'
      : '<button class="btn danger" type="button" id="del-account"' + (ui.busy ? " disabled" : "") + ">" + (ui.confirmDelAcc ? "Tryk igen for at slette din konto – det kan ikke fortrydes" : "Slet min konto") + "</button>") +
    (ui.delAccErr ? '<p class="err" role="alert">' + esc(ui.delAccErr) + "</p>" : ""), "nslet");
  return h;
}
/* Pop-up efter "Invitér": beskeden og knapper til Mail, SMS, WhatsApp og Messenger */
var inviteBox = null;
function sendBtns() {
  var t = ui.inviteText || "", enc = encodeURIComponent(t);
  var mail = "mailto:" + encodeURIComponent(ui.inviteTo || "") + "?subject=" + encodeURIComponent("Invitation til Laderita de Bolnuevo guide") + "&body=" + enc;
  var ph = ui.invitePhone && /^\d{8}$/.test(ui.invitePhone) ? "45" + ui.invitePhone : "";
  var sms = "sms:" + (ph ? "+" + ph : "") + "?&body=" + enc;
  var wa = "https://wa.me/" + ph + "?text=" + enc;
  return '<div class="sendrow">' +
    '<a class="sendbtn s-mail" href="' + esc(mail) + '">' + ICON_MAIL + "<span>Mail</span></a>" +
    '<a class="sendbtn s-sms" href="' + esc(sms) + '">' + ICON_SMS + "<span>SMS</span></a>" +
    '<a class="sendbtn s-wa" href="' + esc(wa) + '" target="_blank" rel="noopener">' + ICON_WA + "<span>WhatsApp</span></a>" +
    '<button type="button" class="sendbtn s-msg" data-sendmsg>' + ICON_MSG + "<span>Messenger</span></button></div>";
}
function openInvite() {
  if (!inviteBox) { inviteBox = document.createElement("div"); inviteBox.id = "invitebox"; document.body.appendChild(inviteBox); }
  inviteBox.innerHTML = '<div class="rback" data-invclose></div><div class="helpmodal invmodal" role="dialog" aria-modal="true" aria-labelledby="iv-h"><button type="button" class="hclose" data-invclose aria-label="Luk">×</button>' +
    '<h2 id="iv-h">Send invitationen' + (ui.inviteName ? " til " + esc(ui.inviteName) : "") + "</h2>" +
    '<p class="hint">' + esc(ui.inviteName || "Personen") + ' er nu inviteret. Vælg, hvordan beskeden skal sendes. Teksten er skrevet på forhånd' + (ui.inviteTo ? ", og ved Mail er modtageren udfyldt" : "") + '. Til sidst trykker du send.</p>' +
    sendBtns() +
    '<details class="invpreview"><summary>Se beskeden</summary><textarea readonly id="invite-copy">' + esc(ui.inviteText) + "</textarea></details>" +
    '<p class="invnote" id="inv-note" role="status"></p>' +
    '<div class="row"><button type="button" class="btn" id="copy-invite">Kopiér beskeden</button><button type="button" class="btn primary" data-invclose>Færdig</button></div></div>';
  inviteBox.hidden = false; document.body.classList.add("modal-open");
}
function closeInvite() { if (inviteBox) { inviteBox.hidden = true; inviteBox.innerHTML = ""; } ui.inviteText = ""; document.body.classList.remove("modal-open"); }
async function copyInvite() {
  try { await navigator.clipboard.writeText(ui.inviteText); return true; } catch (x) {
    var ta = document.getElementById("invite-copy"); if (ta) { ta.parentNode.open = true; ta.select(); try { return document.execCommand("copy"); } catch (y) {} }
  }
  return false;
}
var ICON_MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>';
var ICON_SMS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4c4.97 0 9 3.13 9 7s-4.03 7-9 7c-1 0-1.95-.12-2.84-.35L4 20l1.3-3.6C4.48 15.13 3 13.2 3 11c0-3.87 4.03-7 9-7z"/></svg>';
var ICON_WA = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="13" rx="4"/><path d="M8 17.5v3l3.5-3"/><circle cx="8.5" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="11.5" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="11.5" r="1" fill="currentColor" stroke="none"/></svg>';
var ICON_MSG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-8l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z"/><circle cx="8.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10.5" r="1" fill="currentColor" stroke="none"/></svg>';
/* Skift mellem husstande (kun for dem, der er med i mere end én) */
function andelSwitchHtml() {
  if (!me || !me.others || !me.others.length) return "";
  return '<div class="switchbox"><p class="hint">Du er også med i ' + (me.others.length === 1 ? "en anden andel" : "andre andele") + ". Det, du skriver og giver stjerner, hører til den andel, du er inde som nu.</p>" +
    me.others.map(function (o) { return '<button class="btn small" type="button" data-switchandel="' + esc(o.id) + '">Skift til ' + esc(andelLabels[o.id] || o.label) + "</button>"; }).join(" ") + "</div>";
}
/* Invitationsbesked med en kort log ind-guide */
function listDa(a) { return a.length > 1 ? a.slice(0, -1).join(", ") + " og " + a[a.length - 1] : a[0] || ""; }
function myAndelTxt() { return me ? listDa(me.allLabels && me.allLabels.length ? me.allLabels : [me.label]) : ""; }
function myLendTxt() { var a = me && me.apts && me.apts.length ? me.apts : []; return a.length > 1 ? "en af lejlighederne " + listDa(a) : a.length ? "lejlighed " + a[0] : "lejligheden"; }
var READ_LEJL = "901";   // lejlighed 901 = læseadgang: kan se alt, men ikke ændre noget
function isReadAndel(d, id) { var a = (d.andele || []).filter(function (x) { return x.id === id; })[0]; return !!a && a.lejlighed === READ_LEJL; }
function roleName(r) { return r === "ejer" ? "Ejer" : r === "laeser" ? "Læseadgang" : "Gæst"; }
function inviteMsg(name, email, andel, lend, readOnly) {
  return "Hej" + (name ? " " + name : "") + ".\n\n" + (readOnly
    ? "Du har fået læseadgang til Laderita de Bolnuevo guide – en guide til området omkring hotellet med steder, billeder og andelshavernes kommentarer. Du kan se det hele, men ikke ændre noget eller give vurderinger."
    : lend
    ? "Du er inviteret til Laderita de Bolnuevo guide, fordi du skal låne " + lend + ". Guiden viser steder i området omkring hotellet med billeder og andelshavernes kommentarer."
    : "Du er inviteret til Laderita de Bolnuevo guide – en guide til området omkring hotellet med steder, billeder og andelshavernes kommentarer" + (andel ? ". Du er med som ejer af " + (/,| og /.test(andel) ? "andelene " : "andel ") + andel : "") + ".") + "\n\n" +
    "Sådan kommer du i gang:\n" +
    "1. Åbn " + location.origin + location.pathname + "\n" +
    "2. Tryk på \"Første gang: opret adgangskode\".\n" +
    "3. Skriv din mail (" + email + ") og vælg en adgangskode på mindst 8 tegn.\n" +
    "4. Du får en mail. Tryk på linket i mailen.\n" +
    "5. Gå tilbage til guiden og log ind med din mail og adgangskode.\n\n" +
    "Tip: Læg guiden på telefonens hjemmeskærm, så den åbner som en app. Har du brug for hjælp, så tryk på ? øverst i guiden – den virker også, før du er logget ind.";
}
async function invite() {
  var name = document.getElementById("i-name").value.trim(), email = document.getElementById("i-email").value.trim().toLowerCase(), role = "gaest";
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { andelData.err = "Skriv fornavn og en gyldig mail."; render(); return; }
  var r = await sb.from("members").insert({ andel_id: me.andel, email: email, name: name, role: role, invited_by: ui.user.id });
  if (r.error && /duplicate|unique/i.test(r.error.message)) {
    // Allerede på listen: har personen ikke logget ind endnu, vises invitationen igen, så den kan sendes
    var ex = ((andelData && andelData.members) || []).filter(function (m) { return (m.email || "").toLowerCase() === email; })[0];
    if (ex && ex.user_id) { andelData.err = (ex.name || email) + " har allerede adgang til guiden."; render(); return; }
    andelData.err = ""; ui.inviteText = role === "ejer" ? inviteMsg(name, email, myAndelTxt()) : inviteMsg(name, email, "", myLendTxt()); ui.inviteTo = email; ui.inviteName = name; render(); openInvite(); return;
  }
  if (r.error) { andelData.err = "Invitationen blev ikke gemt: " + r.error.message; render(); return; }
  ui.inviteText = role === "ejer" ? inviteMsg(name, email, myAndelTxt()) : inviteMsg(name, email, "", myLendTxt()); ui.inviteTo = email; ui.inviteName = name; openInvite();
  andelData.err = ""; await loadAndel();
}
async function removeMember(email) {
  if (ui.confirmRm !== email) { ui.confirmRm = email; render(); return; }
  ui.confirmRm = null;
  var r = await sb.from("members").delete().eq("andel_id", me.andel).eq("email", email);
  if (r.error) andelData.err = "Adgangen blev ikke fjernet: " + r.error.message;
  await loadAndel();
}
/* Skift synlighed direkte på billedet i karrusellen – uden at tegne siden om, så man bliver på samme billede */
async function carouselVis(btn) {
  if (btn.disabled) return;
  var id = btn.dataset.cvis, row = raw.photos.filter(function (x) { return x.id === id; })[0]; if (!row) return;
  var mineRow = row.owner === ui.user.id, v = row.kind === "place" ? visFor(row.target, nextVis(row.visibility, mineRow)) : nextVis(row.visibility, mineRow);
  btn.disabled = true; btn.textContent = "Gemmer…";
  var r = await sb.from("photos").update({ visibility: v }).eq("id", id);
  btn.disabled = false;
  if (r.error) { btn.textContent = "Ikke gemt – prøv igen"; return; }
  row.visibility = v;
  document.querySelectorAll('[data-cvis="' + id + '"]').forEach(function (b) { b.className = "visbtn carvis v-" + v; b.textContent = VIS_NAMES[v] || v; });
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
  var rp = await sb.from("reports").select("*").eq("handled", false).order("created_at", { ascending: false });
  var nn = await sb.from("andel_numre").select("*").order("lejlighed").order("nummer");
  var kk = await sb.from("andel_kontakter").select("*").order("sort");
  var lg = await sb.from("activity_log").select("*").order("at", { ascending: false }).limit(300);
  adminData = { andele: a.data || [], members: m.data || [], reports: rp.data || [], nums: nn.data || [], contacts: kk.data || [], log: lg.data || [], err: a.error ? a.error.message : "" };
  render();
}
function adminPageHtml() {
  var d = adminData;
  if (!d) { loadAdmin(); return '<h2 class="pagetitle">Administration</h2><section class="panel"><p>Henter…</p></section>'; }
  var h = '<h2 class="pagetitle">Administration</h2>' + (d.err ? '<p class="err">' + esc(d.err) + "</p>" : "") + reportsHtml(d.reports) + logHtml(d) + andelshaverListHtml(d);
  var addnum = '<form id="addnum-form" class="invite"><h3>Tilføj et ekstra andelsnummer til en husstand</h3><p class="hint">Til andelshavere med flere andele (fx Trærup: 203-002, 102-025 og 102-039). Stjerner, kommentarer og favoritter er fælles for husstanden, og de ser alle deres lejligheder under Hotellet.</p>' +
    '<div class="grid"><label>Husstand<select id="x-andel" required><option value="">Vælg …</option>' + d.andele.filter(function (a) { return a.aktiv; }).map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.lejlighed + "-" + a.nummer) + " · " + esc(d.members.filter(function (m) { return m.andel_id === a.id; }).map(function (m) { return m.name || m.email; }).join(", ")) + "</option>"; }).join("") + "</select></label>" +
    '<label>Lejlighed<input id="x-lejl" required placeholder="102" inputmode="numeric"></label><label>Andelsnummer<input id="x-num" required placeholder="025" inputmode="numeric"></label></div><button class="btn" type="submit">Tilføj nummer</button></form>';
  h += foldBox("adm-num", "<strong>Ekstra andelsnummer</strong>", "Til husstande med flere andele", addnum);
  var newandel = '<form id="newandel-form" class="invite"><h3>Opret andel og invitér første ejer</h3><div class="grid"><label>Lejlighed<input id="n-lejl" required placeholder="101" inputmode="numeric"></label><label>Andelshavernummer<input id="n-num" required placeholder="043" inputmode="numeric"></label></div>' +
    '<div class="grid"><label>Ejerens fornavn<input id="n-name" required></label><label>Ejerens mail<input id="n-email" type="email" required></label></div><button class="btn primary" type="submit">Opret andel</button></form>' +
    '<p class="hint">"Marker som solgt" (under Andelshavere) lukker andelens adgang. Deres private indhold følger ikke med til køberen, som får en ny andel med samme nummer.</p>';
  h += foldBox("adm-new", "<strong>Opret ny andel</strong>", "Ny andel og invitation til første ejer – fx ved salg", newandel);
  h += foldBox("adm-notes", "<strong>Opslag på skærmen</strong>", "Korte beskeder i receptionen, fx \"Poolen er lukket torsdag\" – og hvem der må skrive dem", editorsHtml(d) + noticesAdminHtml());
  return h;
}
/* ---------- Opslag til skærmen i receptionen (administratoren og udvalgte personer skriver dem) ---------- */
var noticeData = null, editorData = null;
async function loadEditors() { var r = await sb.from("notice_editors").select("email"); editorData = (r.data || []).map(function (x) { return x.email; }); rerenderAdmin(); }
function editorsHtml(d) {
  if (!editorData) { loadEditors(); return ""; }
  var byMail = {}; (d.members || []).forEach(function (m) { var k = (m.email || "").toLowerCase(); if (k && !byMail[k]) byMail[k] = m.name || k; });
  var opts = Object.keys(byMail).filter(function (k) { return editorData.indexOf(k) < 0; }).sort(function (a, b) { return byMail[a].localeCompare(byMail[b], "da"); });
  return '<h3>Hvem må skrive opslag?</h3><p class="hint">Du kan altid selv. Udvalgte personer får feltet "Opslag på skærmen" nederst i appen.</p>' +
    (editorData.length ? '<ul class="nlist">' + editorData.map(function (e) { return '<li class="nitem"><span>' + esc(byMail[e] || e) + ' <span class="hint">' + esc(e) + '</span></span><button class="linkbtn danger-t" type="button" data-edrm="' + esc(e) + '">Fjern</button></li>'; }).join("") + "</ul>" : '<p class="hint">Ingen andre endnu.</p>') +
    '<form id="editor-form" class="invite"><label>Giv adgang til<select name="email" required><option value="">Vælg person …</option>' + opts.map(function (k) { return '<option value="' + esc(k) + '">' + esc(byMail[k]) + " – " + esc(k) + "</option>"; }).join("") + '</select></label><button class="btn" type="submit">Giv adgang</button></form><h3>Opslag</h3>';
}
async function addEditor(f) { var e = f.elements.email.value; if (!e) return; await sb.from("notice_editors").insert({ email: e.toLowerCase() }); editorData = null; rerenderAdmin(); }
async function rmEditor(e) { await sb.from("notice_editors").delete().eq("email", e); editorData = null; rerenderAdmin(); }
async function loadNotices() {
  var r = await sb.from("notices").select("*").order("created_at", { ascending: false });
  noticeData = { list: r.data || [], err: r.error ? r.error.message : "" }; render();
}
function noticesAdminHtml() {
  if (!noticeData) { loadNotices(); return '<p class="hint">Henter…</p>'; }
  var today = dayKey(new Date());
  var list = noticeData.list.map(function (n) {
    var gone = n.show_until && n.show_until < today;
    return '<li class="nitem' + (gone ? " gone" : "") + '"><div><strong>' + esc(n.title) + "</strong>" + (n.body ? '<p class="hint">' + esc(n.body) + "</p>" : "") +
      '<p class="hint">' + (n.show_until ? (gone ? "Udløbet " : "Vises til og med ") + esc(n.show_until.split("-").reverse().join(".")) : "Vises indtil det slettes") + "</p></div>" +
      '<button class="linkbtn danger-t" type="button" data-ndel="' + esc(n.id) + '">' + (ui.nDelConfirm === n.id ? "Tryk igen for at slette" : "Slet") + "</button></li>";
  }).join("");
  return (noticeData.err ? '<p class="err">' + esc(noticeData.err) + "</p>" : "") +
    '<form id="notice-form" class="invite"><label>Overskrift<input name="title" required maxlength="70" placeholder="Fx Poolen er lukket torsdag"></label>' +
    '<label>Tekst (valgfri)<textarea name="body" rows="2" maxlength="240" placeholder="Fx på grund af rengøring – åbner igen fredag kl. 9."></textarea></label>' +
    '<label>Vis til og med (valgfri)<input type="date" name="until"></label><button class="btn primary" type="submit">Sæt opslag op</button></form>' +
    (list ? '<ul class="nlist">' + list + "</ul>" : '<p class="hint">Ingen opslag endnu.</p>') +
    '<p class="hint">Opslag vises på skærmen i receptionen inden for 2 minutter. De nyeste står øverst.</p>';
}
async function saveNotice(f) {
  var g = function (n) { return (f.elements[n].value || "").trim(); };
  if (!g("title")) return;
  var r = await sb.from("notices").insert({ title: g("title"), body: g("body") || null, show_until: g("until") || null });
  if (r.error) { noticeData.err = "Opslaget blev ikke gemt: " + r.error.message; render(); return; }
  noticeData = null; rerenderAdmin();
}
async function delNotice(id) { await sb.from("notices").delete().eq("id", id); ui.nDelConfirm = null; noticeData = null; rerenderAdmin(); }
/* ---------- Ændringer: alt der oprettes, rettes og slettes (logges af databasen) ---------- */
var LOG_FIELDS = { name: "navn", town: "by", area: "område", cat: "kategori", subcat: "type", lat: "placering", lon: "placering", visibility: "synlighed", facts: "fakta", website: "hjemmeside", link: "link", maps_url: "Google Maps-link", lejlighed: "lejlighed", guess: "navn ikke bekræftet", region: "område", note: "kommentar", visits: "besøg", last_visit: "besøg", ratings: "stjerner", rating_score: "stjerner", favorite: "hjerte", visited: "besøgt", role: "rolle", user_id: "login", aktiv: "aktiv", rul: "rul", handled: "behandlet", reason: "begrundelse", path: "fil", credit: "kilde" };
var VIS_TXT = { alle: "Alle", andel: "Vores andel", mig: "Kun mig", lejlighed: "Lejligheden" };
function logWho(r) {
  var a = r.user_id && authors[r.user_id], lab = r.andel_id && andelLabels[r.andel_id];
  if (a && a.name) return a.name + " (" + (a.label || lab || "") + ")";
  if (!r.user_id) return "Systemet (rettet direkte i databasen)";
  return lab ? "Andel " + lab : "En bruger";
}
function logTarget(ref) {
  var id = ref.kind === "place" ? ref.target : ref.target || ref.id;
  var p = raw.places.filter(function (x) { return x.id === (ref.kind ? ref.target : ref.id); })[0];
  if (p) return p.name;
  if (ref.kind === "town" || ref.kind === "region") return ref.target;
  return ref.name || id || "";
}
function logWhat(r) {
  var ref = r.ref || {}, c = r.changes || {}, op = r.op, ks = Object.keys(c);
  var val = function (k) { return c[k] ? c[k][1] : null; }, was = function (k) { return c[k] ? c[k][0] : null; };
  var fields = ks.map(function (k) { return LOG_FIELDS[k] || k; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  var t = logTarget(ref);
  switch (r.tbl) {
    case "places":
      if (op !== "UPDATE") return op === "INSERT" ? "Oprettede stedet " + t : "Slettede stedet " + (ref.name || t);
      var pb = ks.filter(function (k) { return k !== "facts"; }).map(function (k) { return LOG_FIELDS[k] || k; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      if (c.facts) {
        var fo = c.facts[0] || {}, fn = c.facts[1] || {}, FT = { saeson: ["Sæsonlukket", { ja: "ja", nej: "nej" }], frokost: ["Frokoståbent", { ja: "ja", nej: "nej" }], tidlig: ["Køkkenet om aftenen åbner", { ja: "før kl. 20", nej: "efter kl. 20" }] };
        Object.keys(Object.assign({}, fo, fn)).forEach(function (k) {
          if (fo[k] === fn[k] || k === "beskrivelse") { if (k === "beskrivelse" && fo[k] !== fn[k]) pb.push("beskrivelse"); return; }
          var ft = FT[k]; pb.push(ft ? ft[0] + ": " + (fn[k] ? ft[1][fn[k]] || fn[k] : "ikke angivet") : k);
        });
      }
      return "Rettede " + t + ": " + pb.join(", ");
    case "experiences":
      if (op === "DELETE") return "Slettede sin vurdering af " + t;
      var bits = [];
      if ("rating_score" in c) bits.push(val("rating_score") == null ? "fjernede stjernerne" : "gav " + dec(+val("rating_score")) + " ★");
      if ("note" in c) bits.push(!val("note") ? "fjernede kommentaren" : was("note") ? "rettede kommentaren" : "skrev en kommentar");
      if ("visited" in c && (op === "UPDATE" || val("visited"))) bits.push(val("visited") ? "markerede som besøgt" : "fjernede besøgt");
      if ("favorite" in c && (op === "UPDATE" || val("favorite"))) bits.push(val("favorite") ? "satte hjerte" : "fjernede hjertet");
      if ("visibility" in c && op === "UPDATE") bits.push("synlighed → " + (VIS_TXT[val("visibility")] || val("visibility")));
      if (("visits" in c || "last_visit" in c) && !bits.length) bits.push("rettede besøg");
      if (!bits.length && op === "INSERT") return "";   // tom række, der oprettes, når man gemmer – ikke interessant
      if (!bits.length) bits.push("rettede " + fields.join(", "));
      var txt = bits.join(", "); return txt.charAt(0).toUpperCase() + txt.slice(1) + " – " + t;
    case "photos":
      return op === "INSERT" ? "Lagde et billede ind – " + t : op === "DELETE" ? "Slettede et billede – " + t
        : "visibility" in c ? "Billedet ved " + t + ": synlighed " + (VIS_TXT[was("visibility")] || was("visibility")) + " → " + (VIS_TXT[val("visibility")] || val("visibility")) : "Rettede et billede (" + fields.join(", ") + ") – " + t;
    case "members":
      var who = (ref.name || "") + (ref.email ? " (" + ref.email + ")" : "");
      if (op === "INSERT") return "Inviterede " + who;
      if (op === "DELETE") return "Fjernede adgang for " + who;
      if ("user_id" in c && val("user_id")) return who + " loggede ind første gang";
      return "Rettede " + who + ": " + fields.join(", ");
    case "towns": return (op === "INSERT" ? "Ny by: " : op === "DELETE" ? "Slettede byen " : "Rettede byen ") + (ref.name || "") + (op === "UPDATE" ? ": " + fields.join(", ") : "");
    case "regions": return (op === "INSERT" ? "Nyt område: " : op === "DELETE" ? "Slettede området " : "Rettede området ") + (ref.name || "") + (op === "UPDATE" ? ": " + fields.join(", ") : "");
    case "reports": return op === "INSERT" ? "Anmeldte " + (ref.kind === "tekst" ? "en tekst" : "et billede") : "handled" in c ? "Anmeldelse behandlet" : "Anmeldelse rettet";
    case "andele": return (op === "INSERT" ? "Oprettede andel " : op === "DELETE" ? "Slettede andel " : "Rettede andel ") + (ref.lejlighed || "") + "-" + (ref.nummer || "") + (op === "UPDATE" ? ": " + fields.join(", ") : "");
    case "andel_numre": return (op === "DELETE" ? "Fjernede ekstra nummer " : "Tilføjede ekstra nummer ") + (ref.lejlighed || "") + "-" + (ref.nummer || "");
  }
  return r.tbl + " " + op;
}
function logTime(at) { var d = new Date(at); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function logHtml(d) {
  var list = (d.log || []).filter(function (r) { return logWhat(r) !== ""; }), today = new Date().toDateString();
  var nToday = list.filter(function (r) { return new Date(r.at).toDateString() === today; }).length;
  var hint = list.length ? (nToday === 1 ? "1 ændring i dag" : nToday + " ændringer i dag") + " · seneste " + logTime(list[0].at) : "Ingen ændringer endnu";
  // Samme slags ændring fra samme person på samme sted inden for 10 minutter samles i én linje (fx "Lagde 12 billeder ind")
  var groups = [];
  list.forEach(function (r) {
    var key = (r.user_id || "") + "|" + r.tbl + "|" + r.op + "|" + ((r.ref || {}).target || "") + "|" + (r.tbl === "photos" ? "" : logWhat(r));
    var g = groups[groups.length - 1];
    if (g && g.key === key && Math.abs(Date.parse(g.r.at) - Date.parse(r.at)) < 6e5) g.n++;
    else groups.push({ key: key, r: r, n: 1 });
  });
  function groupText(g) {
    var r = g.r, t = logTarget(r.ref || {});
    if (g.n > 1 && r.tbl === "photos") return (r.op === "INSERT" ? "Lagde " + g.n + " billeder ind" : r.op === "DELETE" ? "Slettede " + g.n + " billeder" : "Ændrede " + g.n + " billeder") + " – " + t;
    return logWhat(r) + (g.n > 1 ? " (" + g.n + " gange)" : "");
  }
  var body = list.length ? '<ul class="loglist">' + groups.map(function (g) {
    var r = g.r;
    var open = r.ref && (r.ref.kind === "place" ? r.ref.target : r.tbl === "places" && r.op !== "DELETE" ? r.ref.id : null);
    return "<li><span class=\"logt\">" + logTime(r.at) + '</span><span class="logw"><strong>' + esc(logWho(r)) + "</strong><br>" + esc(groupText(g)) + "</span>" +
      (open && raw.places.some(function (x) { return x.id === open; }) ? '<button class="linkbtn" type="button" data-open="' + esc(open) + '">Åbn</button>' : "") + "</li>";
  }).join("") + "</ul>" + '<p class="hint">Viser de seneste ' + list.length + " ændringer. Logningen startede 20.11.2026.</p>" : '<p class="hint">Når nogen opretter, retter eller sletter noget, kommer det her. Logningen startede 20.11.2026.</p>';
  return foldBox("adm-log", "<strong>Ændringer</strong>", hint, body);
}
/* Liste over alle andelshavere med søgning og Invitér-knap */
function hhNums(d, a) { return [{ l: a.lejlighed, n: a.nummer, r: a.rul }].concat((d.nums || []).filter(function (x) { return x.andel_id === a.id; }).map(function (x) { return { l: x.lejlighed, n: x.nummer, r: x.rul }; })); }
function personStatus(d, a, k) {
  if (!k.mail) return "nomail";
  var ml = k.mail.toLowerCase(), ms = d.members.filter(function (x) { return (x.email || "").toLowerCase() === ml; });
  return !ms.length ? "ikke" : ms.some(function (m) { return m.user_id; }) ? "adgang" : "inviteret";
}
var STATUS_TXT = { adgang: "Har adgang", inviteret: "Inviteret – ikke logget ind endnu", ikke: "Ikke inviteret", nomail: "Mangler mail" };
function andelshaverListHtml(d) {
  var hh = d.andele.filter(function (a) { return a.aktiv && a.lejlighed !== "999"; });
  var cnt = { adgang: 0, inviteret: 0, ikke: 0 };
  var rows = [];
  hh.forEach(function (a) {
    var ks = (d.contacts || []).filter(function (k) { return k.andel_id === a.id; });
    var ms = d.members.filter(function (m) { return m.andel_id === a.id; });
    var nums = hhNums(d, a);
    var sts = ks.map(function (k) { return personStatus(d, a, k); });
    var hs = sts.indexOf("adgang") >= 0 ? "adgang" : sts.indexOf("inviteret") >= 0 ? "inviteret" : "ikke"; cnt[hs]++;
    var extraMembers = ms.filter(function (m) { return !ks.some(function (k) { return k.mail && k.mail.toLowerCase() === (m.email || "").toLowerCase(); }); });
    var people = ks.map(function (k, i) {
        var st = sts[i];
        // Ret navn, mail og telefon direkte i listen (fx når en mail mangler)
        if (ui.editK === k.id) return '<div class="aperson aedit"><form class="kform" data-kform="' + esc(k.id) + '"><label>Navn<input name="navn" value="' + esc(k.navn || "") + '"></label><label>Mail<input name="mail" type="email" value="' + esc(k.mail || "") + '" placeholder="navn@mail.dk"></label><label>Telefon<input name="tlf" inputmode="tel" value="' + esc(k.tlf || "") + '" placeholder="12345678"></label>' +
          '<div class="row"><button class="btn small primary" type="submit">' + (ui.editKInv ? "Gem og invitér" : "Gem") + '</button><button class="btn small" type="button" data-editk="">Annuller</button></div></form></div>';
        var resetBox = ui.resetK === k.id ? '<div class="resetbox"><p class="hint">Hjælp ' + esc((k.navn || "").split(" ")[0]) + ' med at komme ind:</p>' +
          (st === "adgang" ? '<button class="btn small" type="button" data-rpw="' + esc(k.id) + '">Send link til ny adgangskode</button><p class="hint">Personen får en mail (på engelsk) med et link og vælger selv en ny adgangskode.</p>' : "") +
          '<form class="kform" data-kmail="' + esc(k.id) + '"><label>Ny mail<input name="nm" type="email" placeholder="ny@mail.dk"></label><div class="row"><button class="btn small" type="submit">Skift mail</button></div></form><p class="hint">Mailen skiftes på login, invitation og kontaktoplysninger. Personen logger ind med den nye mail og samme adgangskode.</p>' +
          '<button class="btn small danger" type="button" data-rstart="' + esc(k.id) + '">' + (ui.confirmStart === k.id ? "Tryk igen: slet login og start forfra" : "Start forfra") + '</button><p class="hint">Sletter personens login og adgangskode. Invitationen og alt det, personen har lagt ind, bliver. Personen vælger så "Første gang: opret adgangskode" igen – send evt. invitationen igen bagefter.</p>' +
          (ui.resetMsg ? '<p class="notice" role="status">' + esc(ui.resetMsg) + "</p>" : "") + '<button class="linkbtn" type="button" data-resetk="">Luk</button></div>' : "";
        return '<div class="aperson' + (resetBox ? " aedit" : "") + '"><div><strong>' + esc(k.navn || "–") + '</strong><span class="hint">' + esc([k.mail, k.tlf].filter(Boolean).join(" · ")) + '</span><span class="ast st-' + st + '">' + STATUS_TXT[st] + '</span> <button class="linkbtn" type="button" data-editk="' + esc(k.id) + '">Ret</button>' + (st === "adgang" || st === "inviteret" ? ' · <button class="linkbtn" type="button" data-resetk="' + esc(k.id) + '">Nulstil</button>' : "") + "</div>" + resetBox +
          (st === "nomail" ? '<button class="btn small primary" type="button" data-editk="' + esc(k.id) + '" data-andinv="1">Invitér</button>' : st === "ikke" ? '<button class="btn small primary" type="button" data-adminvite="' + esc(k.id) + '">Invitér</button>' : st === "inviteret" ? '<button class="btn small" type="button" data-adminvite="' + esc(k.id) + '">Send igen</button>' : "") + "</div>";
      }).join("") +
      (extraMembers.length ? '<p class="hint">Også med: ' + esc(extraMembers.map(function (m) { return (m.name || m.email) + " (" + roleName(m.role).toLowerCase() + ")" + (m.user_id ? "" : " – inviteret"); }).join(", ")) + "</p>" : "") +
      '<div class="ahh-foot"><button class="linkbtn" type="button" data-sold="' + esc(a.id) + '">' + (ui.confirmSold === a.id ? "Tryk igen: andelen er solgt" : "Marker som solgt") + "</button></div></div>";
    var who = [ks.map(function (k) { return [k.navn, k.mail, k.tlf, k.bynavn].join(" "); }).join(" "), ms.map(function (m) { return m.name + " " + m.email; }).join(" ")].join(" ").toLowerCase();
    nums.filter(function (x) { return x.l !== "999"; }).forEach(function (x) {
      var others = nums.filter(function (y) { return y !== x; }).map(function (y) { return y.l + "-" + y.n; });
      rows.push({ l: x.l, n: x.n, html: '<div class="ahh" data-s="' + esc((x.l + "-" + x.n + " " + x.n + " " + x.l + " " + who).toLowerCase()) + '" data-st="' + hs + '"><div class="ahh-top"><strong>' + esc(x.l + "-" + x.n) + "</strong>" +
        '<span class="hint">' + esc([ks[0] && ks[0].bynavn, x.r ? "rul " + x.r : ""].filter(Boolean).join(" · ")) + "</span></div>" +
        (others.length ? '<p class="hint ahh-also">Samme husstand som ' + esc(others.join(", ")) + "</p>" : "") + people });
    });
  });
  rows.sort(function (p, q) { return String(p.l).localeCompare(String(q.l), "da", { numeric: true }) || String(p.n).localeCompare(String(q.n), "da", { numeric: true }); });
  var items = rows.map(function (r) { return r.html; }).join("");
  var stats = rows.length + " andelsnumre · " + hh.length + " husstande · " + cnt.adgang + " har adgang · " + cnt.inviteret + " inviteret · " + cnt.ikke + " ikke inviteret";
  return foldBox("adm-list", "<strong>Andelshavere</strong>", stats,
    '<input type="search" id="adm-q" class="admq" placeholder="Søg: navn, nummer, by eller mail" autocomplete="off">' +
    '<div class="seg small admfilter" role="group" aria-label="Vis">' + [["alle", "Alle"], ["ikke", "Ikke inviteret"], ["inviteret", "Inviteret"], ["adgang", "Har adgang"]].map(function (o) { return '<button type="button" data-admf="' + o[0] + '" aria-pressed="' + ((ui.admF || "alle") === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div>" +
    '<div class="ahhlist" id="ahhlist">' + items + '</div><p class="hint" id="adm-none" hidden>Ingen andelshavere matcher.</p>');
}
function filterAdmList() {
  var q = ((document.getElementById("adm-q") || {}).value || "").trim().toLowerCase(), f = ui.admF || "alle", shown = 0;
  document.querySelectorAll("#ahhlist .ahh").forEach(function (el) {
    var ok = (!q || q.split(/\s+/).every(function (w) { return el.dataset.s.indexOf(w) >= 0; })) && (f === "alle" || el.dataset.st === f);
    el.hidden = !ok; if (ok) shown++;
  });
  var n = document.getElementById("adm-none"); if (n) n.hidden = shown > 0;
}
/* Nulstil en andelshaver (kun administratoren): nyt adgangskode-link, skift mail eller start forfra */
function rerenderAdmin() { var q = (document.getElementById("adm-q") || {}).value || ""; render(); var qi = document.getElementById("adm-q"); if (qi) { qi.value = q; filterAdmList(); } }
function contactById(id) { return ((adminData && adminData.contacts) || []).filter(function (x) { return x.id === id; })[0]; }
async function adminResetPw(id) {
  var k = contactById(id); if (!k || !k.mail) return;
  var r = await sb.auth.resetPasswordForEmail(k.mail, { redirectTo: location.origin + location.pathname });
  ui.resetMsg = r.error ? "Linket blev ikke sendt: " + r.error.message : "Linket er sendt til " + k.mail + ". Det kan tage et par minutter, og det kan ende i spam.";
  rerenderAdmin();
}
var adminBusy = false;
async function fnErr(r) {   // læs fejlteksten fra funktionen (ellers kun "non-2xx status code")
  if (!r.error) return r.data && r.data.error;
  try { var j = await r.error.context.json(); if (j && j.error) return j.error; } catch (e) {}
  return r.error.message;
}
async function adminChangeMail(f) {
  if (adminBusy) return;
  var k = contactById(f.dataset.kmail), nm = (f.elements.nm.value || "").trim().toLowerCase(); if (!k) return;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nm)) { ui.resetMsg = "Skriv en gyldig mail."; rerenderAdmin(); return; }
  adminBusy = true;
  var r = await sb.functions.invoke("admin-user", { body: { action: "email", email: k.mail, newEmail: nm } });
  adminBusy = false;
  var err = await fnErr(r);
  if (err) { ui.resetMsg = "Mailen blev ikke skiftet: " + err; rerenderAdmin(); return; }
  ui.resetMsg = "Mailen er skiftet til " + nm + "." + (r.data && r.data.hadLogin ? " Personen logger ind med den nye mail og samme adgangskode." : " Send evt. invitationen igen.");
  await loadAdmin(); rerenderAdmin();
}
async function adminStartOver(id) {
  var k = contactById(id); if (!k || !k.mail || adminBusy) return;
  adminBusy = true;
  var r = await sb.functions.invoke("admin-user", { body: { action: "reset", email: k.mail } });
  adminBusy = false;
  var err = await fnErr(r);
  ui.confirmStart = null;
  if (err) { ui.resetMsg = "Det gik ikke: " + err; rerenderAdmin(); return; }
  ui.resetMsg = "Login er slettet. " + (k.navn || "Personen").split(" ")[0] + " skal vælge \"Første gang: opret adgangskode\" med " + k.mail + ". Tryk \"Send igen\" for at sende invitationen igen.";
  await loadAdmin(); rerenderAdmin();
}
async function saveContact(f) {
  var id = f.dataset.kform, g = function (n) { return (f.elements[n].value || "").trim(); };
  var mail = g("mail").toLowerCase(), tlf = g("tlf").replace(/[^\d+]/g, "");
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) { adminData.err = "Mailen ser ikke rigtig ud."; render(); return; }
  var r = await sb.from("andel_kontakter").update({ navn: g("navn"), mail: mail || null, tlf: tlf || null }).eq("id", id);
  if (r.error) { adminData.err = "Det blev ikke gemt: " + r.error.message; render(); return; }
  var inv = ui.editKInv && mail; ui.editK = null; ui.editKInv = false; adminData.err = "";
  var q = (document.getElementById("adm-q") || {}).value || "";
  await loadAdmin(); var qi = document.getElementById("adm-q"); if (qi) { qi.value = q; filterAdmList(); }
  if (inv) await adminInvite(id);   // mail udfyldt fra "Invitér": send invitationen med det samme
}
async function adminInvite(kid) {
  var d = adminData, k = (d.contacts || []).filter(function (x) { return x.id === kid; })[0]; if (!k || !k.mail) return;
  var a = d.andele.filter(function (x) { return x.id === k.andel_id; })[0];
  var first = (k.navn || "").split(" ")[0];
  var ml = k.mail.toLowerCase(), aids = (d.contacts || []).filter(function (x) { return (x.mail || "").toLowerCase() === ml; }).map(function (x) { return x.andel_id; }).filter(function (id, i, arr) { return arr.indexOf(id) === i; });
  for (var i = 0; i < aids.length; i++) {
    if (d.members.some(function (m) { return m.andel_id === aids[i] && (m.email || "").toLowerCase() === ml; })) continue;
    var r = await sb.from("members").insert({ andel_id: aids[i], email: ml, name: first, role: isReadAndel(d, aids[i]) ? "laeser" : "ejer", invited_by: ui.user.id });
    if (r.error && !/duplicate|unique/i.test(r.error.message)) { d.err = "Invitationen blev ikke gemt: " + r.error.message; render(); return; }
  }
  var nums = []; aids.forEach(function (id) { var aa = d.andele.filter(function (x) { return x.id === id && x.aktiv; })[0]; if (aa) hhNums(d, aa).forEach(function (x) { if (x.l !== "999") nums.push(x.l + "-" + x.n); }); });
  nums.sort(function (p, q) { return p.localeCompare(q, "da", { numeric: true }); });
  ui.inviteText = isReadAndel(d, k.andel_id) ? inviteMsg(first, k.mail, "", "", true) : inviteMsg(first, k.mail, listDa(nums));
  ui.inviteTo = k.mail; ui.inviteName = first; ui.invitePhone = (k.tlf || "").replace(/\D/g, "");
  openInvite(); ui.invitePhone = "";
  var q = (document.getElementById("adm-q") || {}).value || "";
  await loadAdmin(); var qi = document.getElementById("adm-q"); if (qi) { qi.value = q; filterAdmList(); }
}
async function addAndelNum() {
  var g = function (id) { return document.getElementById(id).value.trim(); };
  var id = g("x-andel"), lejl = g("x-lejl"), num = g("x-num");
  if (!id || !lejl || !num) { adminData.err = "Vælg husstand og skriv lejlighed og andelsnummer."; render(); return; }
  if (adminData.andele.some(function (a) { return a.lejlighed === lejl && a.nummer === num && a.aktiv; })) { adminData.err = "Andel " + lejl + "-" + num + " findes allerede som egen andel."; render(); return; }
  var r = await sb.from("andel_numre").insert({ andel_id: id, lejlighed: lejl, nummer: num });
  adminData.err = r.error ? (/duplicate|unique/i.test(r.error.message) ? "Nummeret " + lejl + "-" + num + " er allerede tilknyttet en husstand." : "Nummeret blev ikke gemt: " + r.error.message) : "";
  await loadAdmin(); if (!r.error) await load();
}
async function rmAndelNum(key) {
  if (ui.confirmRmNum !== key) { ui.confirmRmNum = key; render(); return; }
  ui.confirmRmNum = null; var p = key.split("|");
  var r = await sb.from("andel_numre").delete().eq("lejlighed", p[0]).eq("nummer", p[1]);
  adminData.err = r.error ? "Nummeret blev ikke fjernet: " + r.error.message : "";
  await loadAdmin(); await load();
}
async function createAndel() {
  var g = function (id) { return document.getElementById(id).value.trim(); };
  var lejl = g("n-lejl"), num = g("n-num"), name = g("n-name"), email = g("n-email").toLowerCase();
  if (!lejl || !num || !name || !email) { adminData.err = "Udfyld alle felter."; render(); return; }
  var a = await sb.from("andele").insert({ lejlighed: lejl, nummer: num }).select().single();
  if (a.error) { adminData.err = /unique|duplicate/i.test(a.error.message) ? "Andel " + lejl + "-" + num + " findes allerede." : "Andelen blev ikke oprettet: " + a.error.message; render(); return; }
  var m = await sb.from("members").insert({ andel_id: a.data.id, email: email, name: name, role: "ejer", invited_by: ui.user.id });
  if (m.error) { adminData.err = "Andelen er oprettet, men ejeren blev ikke inviteret: " + m.error.message; render(); return; }
  ui.inviteText = inviteMsg(name, email, lejl + "-" + num); ui.inviteTo = email; ui.inviteName = name; openInvite();
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
  "<h3>Anmeld</h3><p>Ser du en tekst eller et billede fra en anden andel, som ikke hører hjemme i guiden, så tryk \"Anmeld\" ved det. Administratoren får besked. Den, der har lagt det ind, kan ikke se, hvem der har anmeldt.</p>" +
  "<h3>Slet din konto</h3><p>Du kan selv slette din konto under \"Vores andel\" nederst på siden. Dit login og din plads på andelen slettes; det, du har lagt ind, bliver hos andelen. Er du den eneste ejer på andelen, eller vil du også have dit indhold slettet – eller have en kopi af det – så skriv til administratoren.</p>" +
  '<h3>Kontakt</h3><p>Administrator: Christian Sorgenfrey (101-043)<br>Mail: <a href="mailto:c@sorgenfrey.net">c@sorgenfrey.net</a> · WhatsApp: <a href="https://wa.me/4529919966">+45 29 91 99 66</a></p></article>';

/* ---------- login ---------- */
function loginHtml() {
  var l = ui.login;
  var msg = (l.info ? '<p class="hint">' + esc(l.info) + "</p>" : "") + (l.err ? '<p class="err" role="alert">' + esc(l.err) + "</p>" : "");
  if (l.mode === "newpw") return '<form class="panel" id="login-form"><h2>Vælg en ny adgangskode</h2>' +
    '<p class="hint">Skriv din nye adgangskode to gange. Den skal være mindst 8 tegn.</p>' +
    '<label>Ny adgangskode<input type="password" id="l-pass" autocomplete="new-password" required minlength="8"></label>' +
    '<label>Skriv den igen<input type="password" id="l-pass2" autocomplete="new-password" required minlength="8"></label>' + msg +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem ny adgangskode") + "</button></div></form>";
  if (l.mode === "reset") return '<form class="panel" id="login-form"><h2>Glemt adgangskode</h2>' +
    '<p class="hint">Skriv den mail, du bruger til guiden. Du får en mail med et link, hvor du kan vælge en ny adgangskode.</p>' +
    '<label>Mail<input type="email" id="l-email" autocomplete="email" required value="' + esc(l.email || "") + '"></label>' + msg +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Sender…" : "Send link") + '</button><button class="btn" type="button" id="to-login">Tilbage til log ind</button></div></form>';
  return '<form class="panel" id="login-form"><h2>Log ind</h2>' +
    '<div class="seg" role="group" aria-label="Login"><button type="button" id="to-login" aria-pressed="' + (l.mode !== "signup") + '">Jeg har en adgangskode</button><button type="button" id="to-signup" aria-pressed="' + (l.mode === "signup") + '">Første gang: opret adgangskode</button></div>' +
    (l.mode === "signup" ? '<p class="hint">Brug den mail, du er inviteret med, og vælg en adgangskode. Du får en mail, hvor du bekræfter, og så kan du logge ind.</p>' : "") +
    '<label>Mail<input type="email" id="l-email" autocomplete="email" required value="' + esc(l.email || "") + '"></label>' +
    '<label>Adgangskode<input type="password" id="l-pass" autocomplete="' + (l.mode === "signup" ? "new-password" : "current-password") + '" required minlength="8"></label>' +
    (l.mode === "signup" ? '<label>Skriv adgangskoden igen<input type="password" id="l-pass2" autocomplete="new-password" required minlength="8"></label>' : "") +
    (l.mode !== "signup" ? '<p class="forgot"><button type="button" class="linkbtn" id="to-reset">Glemt adgangskode?</button></p>' : "") + msg +
    '<div class="row"><button class="btn primary" type="submit">' + (l.mode === "signup" ? "Opret adgangskode" : "Log ind") + "</button>" + (ui.user ? '<button class="btn" type="button" id="close-login">Annuller</button>' : "") + "</div></form>";
}

async function submitLogin() {
  if (ui.login.mode === "newpw") {
    var p1 = document.getElementById("l-pass").value, p2 = document.getElementById("l-pass2").value;
    ui.login.err = ""; ui.login.info = "";
    if (p1.length < 8) { ui.login.err = "Adgangskoden skal være mindst 8 tegn."; render(); return; }
    if (p1 !== p2) { ui.login.err = "De to adgangskoder er ikke ens. Prøv igen."; render(); return; }
    ui.busy = true; render();
    var u = await sb.auth.updateUser({ password: p1 });
    ui.busy = false;
    if (u.error) { ui.login.err = "Adgangskoden blev ikke skiftet: " + u.error.message + ". Prøv at bestille et nyt link."; render(); return; }
    ui.recovery = false; ui.login = null;
    try { history.replaceState(null, "", location.pathname); } catch (x) {}
    await afterLogin(); ui.msg = "Din adgangskode er skiftet."; render(); return;
  }
  if (ui.login.mode === "reset") {
    var em = document.getElementById("l-email").value.trim();
    ui.login.email = em; ui.login.err = ""; ui.login.info = "";
    ui.busy = true; render();
    var rr = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
    ui.busy = false;
    if (rr.error) { ui.login.err = /rate|seconds|many/i.test(rr.error.message) ? "Der er sendt for mange mails lige nu. Vent lidt, og prøv igen." : "Det lykkedes ikke: " + rr.error.message; render(); return; }
    ui.login.info = "Hvis mailen er med i guiden, har vi nu sendt et link til " + em + ". Åbn mailen og tryk på linket. Kan du ikke finde den, så kig også i uønsket post (spam)."; render(); return;
  }
  var email = document.getElementById("l-email").value.trim(), pass = document.getElementById("l-pass").value;
  ui.login.email = email; ui.login.err = ""; ui.login.info = "";
  if (pass.length < 8) { ui.login.err = "Adgangskoden skal være mindst 8 tegn."; render(); return; }
  if (ui.login.mode === "signup") {
    if (pass !== document.getElementById("l-pass2").value) { ui.login.err = "De to adgangskoder er ikke ens. Skriv dem igen."; render(); return; }
    var s = await sb.auth.signUp({ email: email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
    if (s.error) { ui.login.err = /rate|seconds|many/i.test(s.error.message) ? "Der er sendt for mange mails fra guiden lige nu. Vent en halv time, og prøv igen – din adgangskode er ikke gemt endnu." : "Det lykkedes ikke: " + s.error.message; render(); return; }
    if (s.data.user && s.data.user.identities && s.data.user.identities.length === 0) {   // mailen har allerede en adgangskode
      ui.login.mode = "login"; ui.login.info = "Du har allerede oprettet en adgangskode med " + email + ". Log ind her. Har du glemt den, så tryk \"Glemt adgangskode\"."; render(); return;
    }
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
  // Placering: midten af ALLE billedernes placeringer (medianen), så et enkelt billede taget et stykke væk ikke flytter stedet
  var info = { lat: null, lon: null, month: null, date: null }, lats = [], lons = [];
  for (var i = 0; i < files.length && i < 30; i++) {
    try {
      var gps = await window.exifr.gps(files[i]);
      if (gps && typeof gps.latitude === "number" && isFinite(gps.latitude)) { lats.push(gps.latitude); lons.push(gps.longitude); }
    } catch (e) { /* billedet har ingen placering */ }
    try {
      if (!info.month) {
        var data = await window.exifr.parse(files[i], ["DateTimeOriginal", "CreateDate"]);
        if (data) { info.month = monthOf(data.DateTimeOriginal || data.CreateDate); info.date = dayOf(data.DateTimeOriginal || data.CreateDate); }
      }
    } catch (e) { /* billedet har ingen dato */ }
  }
  if (lats.length) {
    var med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
    info.lat = med(lats); info.lon = med(lons);
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
  var local = addr.village || addr.town || "";
  if (local) return local;
  g = nearestGuideTown(lat, lon, 8); if (g) return g.name;
  // Langt væk: storbyen frem for bydelen (fx Granada, ikke "Realejo Alto")
  return addr.city || addr.hamlet || addr.municipality || addr.neighbourhood || "";
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
  if (!name) return "";
  var old = towns[name];
  if (old && old.region && old.lat != null) return "";
  /* Byen får placering, køretid og et område (dagstur) med det samme */
  var row = { name: name };
  if (lat != null && (!old || old.lat == null)) {
    row.lat = +(+lat).toFixed(5); row.lon = +(+lon).toFixed(5);
    var dr = await driveFromHotel(row.lat, row.lon); if (dr) { row.drive_km = dr.km; row.drive_min = dr.min; }
  }
  var reg = old && old.region, msg = "";
  if (!reg) {
    var near = lat != null ? nearestGuideTown(lat, lon, 15) : null;
    reg = near && near.name !== name && towns[near.name] && towns[near.name].region;
    if (reg) msg = ' Byen "' + name + '" er lagt under dagsturen "' + reg + '" (nærmeste by er ' + near.name + "). Ret det under Byer, hvis det er forkert.";
    else {
      reg = name;
      if (!regions[reg]) { var nr = await sb.from("regions").insert({ name: reg }); if (nr.error) reg = null; }
      if (reg) msg = ' Der er oprettet en ny dagstur "' + reg + '". Du kan omdøbe den eller flytte byen under Dagsture.';
    }
    row.region = reg || null;
  }
  var r = old ? await sb.from("towns").update(row).eq("name", name) : await sb.from("towns").insert(row);
  return r.error ? "" : msg;
}
var GROCERY = ["supermarket","convenience","bakery","butcher","greengrocer","seafood","deli","marketplace","alcohol","beverages","frozen_food"];
var FOOD = ["restaurant","cafe","bar","pub","fast_food","ice_cream","biergarten","food_court"];
var SPORT = ["sports_centre","golf_course","pitch","stadium","fitness_centre","tennis","padel"];
var FUN = ["spa","water_park","marina","theme_park","zoo","aquarium","public_bath","dive_centre","boat_rental","horse_riding","swimming_pool"];
/* ---------- kortopslag via OpenStreetMap (Overpass) ---------- */
var OVERPASS = "https://overpass-api.de/api/interpreter";
async function overpass(q) {
  var r1 = await overpassAt(OVERPASS, q);
  return r1 || await overpassAt("https://overpass.private.coffee/api/interpreter", q);   // reserve, når hovedserveren er optaget
}
async function overpassAt(url, q) {
  var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 7000);
  try {
    var r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: c.signal });
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
  if (l === "swimming_pool" || l === "sports_centre" && /swim/i.test(t.sport || "")) return ["sport", "svoemning"];
  if (l === "horse_riding" || /equestrian/i.test(t.sport || "")) return ["sport", "ridning"];
  if (l === "fishing") return ["sport", "fiskeri"];
  if (l === "sports_centre" || l === "pitch" || l === "fitness_centre") {
    var sp = t.sport || "";
    return ["sport", /padel/i.test(sp) ? "padel" : /pickleball/i.test(sp) ? "pickleball" : /tennis/i.test(sp) ? "tennis" : /golf/i.test(sp) ? "golf" : /div/i.test(sp) ? "dykning" :
      /climb/i.test(sp) ? "klatring" : /boules|petanque/i.test(sp) ? "petanque" : /swim/i.test(sp) ? "svoemning" : l === "fitness_centre" || /fitness/i.test(sp) ? "fitness" : null];
  }
  if (t.natural === "beach" || l === "beach_resort") return ["strande", null];
  if (to === "viewpoint") return ["natur", "udsigt"];
  if (to === "museum") return ["sevaerdigheder", "museum"];
  if (h === "palace" || /^(palace|stately|manor)$/.test(t.castle_type || "")) return ["sevaerdigheder", "palads"];
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
/* Photon (OpenStreetMap-data) – svarer også, når Overpass er optaget, og kender store seværdigheder og pladser (fx Alhambra, Plaza de España) */
var PH_SMALL = ["artwork", "memorial", "information", "board", "bench", "vacant", "hotel", "guest_house", "apartment", "hostel", "house", "residential"];
async function photonFetch(url) {
  var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 6000);
  try { var r = await fetch(url, { signal: c.signal }); return r.ok ? ((await r.json()).features || []) : []; } catch (e) { return []; } finally { clearTimeout(t); }
}
function boxDist(lat, lon, ex) {   // ex = [vest, nord, øst, syd]; 0 = inde i området
  if (!ex) return null;
  var la = Math.min(Math.max(lat, ex[3]), ex[1]), lo = Math.min(Math.max(lon, ex[0]), ex[2]);
  return distM(lat, lon, la, lo);
}
async function photonNear(lat, lon) {
  var base = "https://photon.komoot.io/reverse?lat=" + lat + "&lon=" + lon + "&lang=default&radius=0.15";
  var res = await Promise.all([photonFetch(base + "&limit=15"),
    photonFetch(base + "&limit=20&osm_tag=place:square&osm_tag=historic&osm_tag=tourism&osm_tag=amenity:place_of_worship")]);
  var seen = {}, list = [], city = "";
  res[0].concat(res[1]).forEach(function (f) {
    var q = f.properties || {}, g = (f.geometry || {}).coordinates || [];
    if (!city && q.city) city = q.city;
    var k = q.osm_type + q.osm_id; if (seen[k] || !q.name || PH_SMALL.indexOf(q.osm_value) >= 0) return; seen[k] = 1;
    if (["amenity", "shop", "tourism", "historic", "leisure", "place"].indexOf(q.osm_key) < 0 || (q.osm_key === "place" && q.osm_value !== "square")) return;
    var tags = { name: q.name }; tags[q.osm_key] = q.osm_value;
    var cc = q.osm_key === "place" ? ["sevaerdigheder", "historisk"] : catFromTags(tags), ex = q.extent;
    list.push({ name: q.name, key: q.osm_key, cat: cc[0], subcat: cc[1], d: g.length ? distM(lat, lon, g[1], g[0]) : 9999, bd: boxDist(lat, lon, ex), area: ex ? Math.abs((ex[2] - ex[0]) * (ex[1] - ex[3])) : 0 });
  });
  return { city: city, list: list };
}
/* Vælg navn: 1) spisested/butik helt tæt på (15 m), 2) en seværdighed man står inde i (den største, fx Alhambra),
   3) en plads/seværdighed højst 40 m væk (fx Plaza de España), 4) det nærmeste sted fra Overpass, 5) det nærmeste fra Photon */
var NEAR_CATS = ["spisesteder", "dagligvarer", "shopping", "opladning"];
function pickPlaceName(lat, lon, op, ph) {
  var list = (ph && ph.list) || [];
  var food = list.filter(function (x) { return NEAR_CATS.indexOf(x.cat) >= 0 && x.d <= 15; }).sort(function (a, b) { return a.d - b.d; })[0];
  if (op && NEAR_CATS.indexOf(op.cat) >= 0 && op.lat != null && distM(lat, lon, op.lat, op.lon) <= 15) return op;
  if (food) return food;
  var inside = list.filter(function (x) { return (x.key === "historic" || x.key === "tourism") && x.bd === 0 && !/^(per[ií]metro|recinto|[aá]rea|zona)\b/i.test(x.name); }).sort(function (a, b) { return b.area - a.area; })[0];
  if (inside) return inside;
  var mark = list.filter(function (x) { return (x.key === "historic" || x.key === "tourism" || x.key === "place" || x.cat === "sevaerdigheder") && x.bd != null && x.bd <= 40; }).sort(function (a, b) { return a.bd - b.bd; })[0];
  if (mark) return mark;
  if (op) return op;
  return list.filter(function (x) { return x.d <= 120; }).sort(function (a, b) { return a.d - b.d; })[0] || null;
}
async function lookupPlace(lat, lon) {
  var base = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&lat=" + lat + "&lon=" + lon;
  var out = { name: "", cat: null, subcat: null, area: "" };
  var both = await Promise.all([poiNear(lat, lon, 120), photonNear(lat, lon)]), ph = both[1];
  var op = pickPlaceName(lat, lon, both[0], ph);
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
    out.town = townFor(lat, lon, where || (ph && ph.city ? { city: ph.city } : null));
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
  ui.draft = { isNew: true, id: uid(), cat: CATNAME[ui.cat] && ui.cat !== "lejligheden" ? ui.cat : "spisesteder", fav: false, name: "", area: "", note: "", rating: null, price: "", visits: [], guess: false, lat: null, lon: null,
    items: files.map(function (f) { return { file: f, url: URL.createObjectURL(f) }; }), removed: [], finding: true, info: "" };
  ui.draft.vis = ui.draft.cat === "vores" ? "andel" : "alle"; ui.draft.expVis = "alle";
  ui.draft.items.forEach(suggestVis);
  if (ui.wizFlow) { ui.draft.wiz = 2; ui.wizFlow = false; ui.wizStart = false; }
  render(); if (!ui.draft.wiz) scrollToForm();
  var info = await readPhotoInfo(files);
  var d = ui.draft; if (!d) return;
  if (info.month) d.visits = [info.month];
  d.lastVisit = info.date;
  if (opts.visits && opts.visits.length) d.visits = opts.visits.slice(); if (opts.last) d.lastVisit = opts.last;
  d.fromImport = !!opts.fromImport;
  if (info.lat != null) {
    d.lat = +info.lat.toFixed(5); d.lon = +info.lon.toFixed(5);
    var near = raw.places.filter(function (p) { return p.lat != null && !isApt(p.cat); }).map(function (p) { return [p, distM(d.lat, d.lon, p.lat, p.lon)]; })
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
  render(); if (!d.wiz) scrollToForm();
}

function startManual() {
  ui.msg = "";
  ui.draft = { isNew: true, manual: true, id: uid(), cat: CATNAME[ui.cat] && ui.cat !== "lejligheden" ? ui.cat : "spisesteder", fav: false, name: "", area: "", town: "", note: "", rating: null, price: "",
    visits: [], guess: false, lat: null, lon: null, link: "", website: "", maps: "", items: [], removed: [], info: 'Skriv navnet og tryk "Find på kortet", så finder siden by, placering og køretid.', vis: ui.cat === "vores" ? "andel" : "alle", expVis: "alle" };
  if (ui.wizFlow) { ui.draft.wiz = 2; ui.wizFlow = false; ui.wizStart = false; }
  render(); if (!ui.draft.wiz) scrollToForm(); var n = document.getElementById("f-name"); if (n) n.focus();
}
function keepCore(d) { if (d && d.keep) { Object.assign(d, d.keep); } }
async function findOnMap() {
  var d = ui.draft; if (!d || !d.name.trim()) { if (d) { d.err = "Skriv et navn først."; render(); } return; }
  d.keep = d.isNew ? null : { name: d.name, cat: d.cat, subcat: d.subcat, area: d.area };
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
    // Er der skrevet en adresse/by, så søg på den i området, før der søges bredt på navnet
    var addr = [d.area && d.area !== d.town ? d.area : "", d.town].filter(Boolean).join(", ");
    if (!hit && d.area && d.area !== d.town) {
      var ar = await (await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=3&accept-language=es&countrycodes=es&bounded=1&viewbox=-2.3,38.7,-0.3,37.2&q=" + encodeURIComponent(addr))).json();
      if (ui.draft !== d) return;
      if (ar && ar.length) { hit = ar[0]; hit.type = null; hit.category = null; hit._addr = d.area; }
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
    // Langt væk (fx et sted med samme navn i Barcelona): spørg i stedet for at gemme det
    if (hit && km(+hit.lat, +hit.lon) > 150) {
      var fa = hit.address || {};
      d.choices = [{ name: hit.name || d.name.trim(), lat: +hit.lat, lon: +hit.lon, cat: null, subcat: null, addr: [fa.road, fa.village || fa.town || fa.city].filter(Boolean).join(", ") || (hit.display_name || "").split(",").slice(0, 3).join(","), km: km(+hit.lat, +hit.lon), address: fa }];
      d.info = "Jeg fandt kun et sted med det navn langt væk – ca. " + Math.round(d.choices[0].km) + " km fra hotellet. Er det ikke det rigtige, så skriv adressen i \"Sted/område\" og byen, og tryk igen – eller indsæt et link fra Google Maps.";
      render(); return;
    }
    if (!hit) { d.info = "Fandt ikke stedet på kortet. Tip: indsæt et link fra Google Maps i link-feltet og tryk igen. Du kan også gemme stedet uden placering."; render(); return; }
    d.lat = +(+hit.lat).toFixed(5); d.lon = +(+hit.lon).toFixed(5);
    d.town = townFor(d.lat, d.lon, hit.address); d.area = hit._addr || d.town;
    var t = hit.type, c = hit.category;
    if (c === "amenity" && FOOD.indexOf(t) >= 0) d.cat = "spisesteder";
    else if (t === "charging_station") d.cat = "opladning";
    else if (GROCERY.indexOf(t) >= 0) d.cat = "dagligvarer";
    else if ((c === "natural" && t === "beach") || t === "beach_resort") d.cat = "strande";
    else if (SPORT.indexOf(t) >= 0) d.cat = "sport";
    d.info = "Fundet: " + (hit.display_name || "").split(",").slice(0, 3).join(",") + ". Passer det ikke, så ret navnet og prøv igen.";
  } catch (e) { d.info = "Kortet svarer ikke lige nu. Du kan gemme stedet alligevel."; }
  keepCore(d); render();
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
  keepCore(d); render();
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
  if (f.wiz) return wizardHtml(f);
  var opts = CATS.map(function (c) { return '<option value="' + c[0] + '"' + (f.cat === c[0] ? " selected" : "") + ">" + c[1] + "</option>"; }).join("");
  var r = [["", "Ingen"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]].map(function (o) { return '<option value="' + o[0] + '"' + (String(f.rating || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
  var pr = ["", "€", "€€", "€€€"].map(function (o) { return '<option value="' + o + '"' + (f.price === o ? " selected" : "") + ">" + (o || "Ikke relevant") + "</option>"; }).join("");
  var ph = f.items.map(function (it, i) {
    return '<div class="ph"><img src="' + esc(it.url || photoUrl(it.path, true)) + '" alt="">' + (i === 0 ? '<span class="first">Forsidebillede</span>' : "") + visBtn(it, i) +
      '<div class="row">' + (i > 0 ? '<button class="btn small" type="button" data-first="' + i + '">Gør til forside</button>' : "") +
      (it.file || canSetVis(it.own) ? '<button class="btn small danger" type="button" data-rm="' + i + '">Slet</button>' : "") + "</div></div>";
  }).join("");
  var core = canEditCore(f.isNew ? null : raw.places.filter(function (x) { return x.id === f.id; })[0]), dis = core ? "" : " disabled";
  if (f.isNew && !f.more) return quickHtml(f);
  var adv = !!f.adv || f.isNew;
  var posTxt = f.lat != null ? "Placeringen er fundet automatisk (" + (+f.lat).toFixed(4).replace(".", ",") + " / " + (+f.lon).toFixed(4).replace(".", ",") + ")." : "Stedet har ingen placering endnu.";
  return '<form class="panel" id="editor"><h2>' + (f.isNew ? "Nyt sted" : esc(f.name)) + "</h2>" +
    (f.finding ? '<p class="finding" role="status"><span class="spin" aria-hidden="true"></span>Finder stedet ud fra billederne …</p>' : "") + (f.info ? '<p class="hint">' + esc(f.info) + "</p>" : "") +
    (f.choices ? '<div class="choices">' + f.choices.map(function (x, i) { return '<button class="btn" type="button" data-choose="' + i + '"><strong>' + esc(x.name) + "</strong> " + esc([x.addr, x.km != null ? Math.round(x.km) + " km fra hotellet" : ""].filter(Boolean).join(" · ")) + "</button>"; }).join("") + "</div>" : "") +
    '<label>Kommentar<textarea id="f-note" placeholder="' + esc(notePh(f.cat)) + '">' + esc(f.note) + "</textarea></label>" +
    '<button type="button" class="favtoggle' + (f.fav ? " on" : "") + '" id="f-favbtn" aria-pressed="' + !!f.fav + '">' + heartSvg(f.fav) + ' Tilføj som favorit</button>' +
    '<div><p class="hint" style="margin-bottom:8px">Jeres billeder (det første vises først). Tryk på mærket på et billede for at vælge, hvem der kan se det.' + (f.otherPhotos ? " Stedet har også " + f.otherPhotos + " billeder fra andre andele." : "") + '</p><div class="photos">' + ph + "</div>" +
    '<label class="btn" style="display:inline-flex;margin-top:10px;color:var(--fg)">+ Tilføj billeder<input type="file" id="f-add" accept="image/*" multiple hidden></label></div>' +
    '<button class="btn advtoggle" type="button" id="adv-toggle" aria-expanded="' + adv + '">' + (adv ? "Skjul avanceret redigering ▴" : "Avanceret redigering ▾") + "</button>" + helpBtn("advanced", "inline") +
    (adv ? '<div class="advsec">' + '<p class="hint">Hvem kan se hvad? ' + helpBtn(f.cat === "vores" ? "whoseeapt" : "whosee", "inline") + "</p>" +
      (core ? "" : '<p class="hint">Navn, by, kategori og placering kan kun rettes af den, der oprettede stedet. Alt andet – fx åbningstider og links – kan I rette.</p>') +
      '<div class="grid"><label>Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Restaurante La Siesta"' + dis + '></label><label>By<input id="f-town" list="townlist" value="' + esc(f.town || "") + '" placeholder="Puerto de Mazarrón"' + dis + '></label><datalist id="townlist">' + allTownNames().sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join("") + "</datalist></div>" +
      '<label>Sted/område (valgfrit)<input id="f-area" value="' + esc(f.area) + '" placeholder="Plaza del Muelle"' + dis + "></label>" +
      '<div class="grid"><label>Kategori<select id="f-cat"' + dis + ">" + opts + "</select></label>" + (SUBCATS[f.cat] ? '<label>Underkategori<select id="f-subcat"' + dis + '><option value="">Ikke valgt</option>' + SUBCATS[f.cat].map(function (x) { return '<option value="' + x[0] + '"' + (f.subcat === x[0] ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select></label>" : "") + "" + '<label>Pris<select id="f-price">' + pr + "</select></label></div>" +
      questionsHtml(f) +
      ((f.vis || "alle") !== "alle"
        ? '<div class="grid"><label>Hvem kan se vores stjerner og tekst?<select disabled><option>Vores andel</option></select><span class="hint">Følger stedet: når kun ' + (f.vis === "mig" ? "du" : "jeres andel") + " kan se stedet, kan andre heller ikke se jeres stjerner og tekst.</span></label>"
        : '<div class="grid"><label>Hvem kan se vores stjerner og tekst?<select id="f-expvis"><option value="alle"' + (f.expVis !== "andel" ? " selected" : "") + '>Alle</option><option value="andel"' + (f.expVis === "andel" ? " selected" : "") + ">Vores andel</option></select></label>") +
    (core ? '<label>Hvem kan se stedet?<select id="f-vis">' + (f.cat === "vores" ? ["lejlighed", "andel", "mig"] : ["alle", "andel", "mig"]).map(function (v) { return '<option value="' + v + '"' + ((f.vis || "alle") === v ? " selected" : "") + ">" + VIS_NAMES[v] + "</option>"; }).join("") + "</select></label>" : "") + "</div>" +
      linkFields(f) +
      '<label>Vi har besøgt (fx 2025-02, 2026-07)<input id="f-visits" value="' + esc((f.visits || []).join(", ")) + '"><span class="hint">Kommer automatisk fra datoen på de billeder, I lægger ind. Her kan I tilføje eller rette.</span></label>' +
      '<div><p class="hint" style="margin:0 0 6px">' + esc(posTxt) + " Den findes automatisk fra billedernes placering, et link fra Google Maps eller stedets navn.</p>" +
        (core ? '<div class="row"><button class="btn small" type="button" id="find-map">' + (f.lat != null ? "Find igen ud fra navnet" : "Find på kortet ud fra navnet") + '</button><button class="btn small" type="button" id="my-loc">Brug min placering</button></div>' : "") + "</div>" +
      '<label class="inline"><input type="checkbox" id="f-guess"' + (f.guess ? " checked" : "") + "> Navnet er ikke bekræftet</label>" +
      (!f.isNew && core ? '<div><button class="btn danger" type="button" id="del-place">' + (f.confirmDel ? "Tryk igen for at slette stedet" : "Slet sted") + "</button></div>" : "") +
      "</div>" : "") +
    dupHtml(f) + (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row savebar"><button class="btn primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + '</button><button class="btn" type="button" id="cancel">Annuller</button></div></form>';
}
/* Gæster må kun ændre synlighed på (og slette) deres egne billeder – ejernes billeder kan de kun se */
function canSetVis(own) { return !!own || !me || me.role === "ejer" || !!me.admin; }
function visBtn(it, i) {
  var vv = ui.draft && ui.draft.cat === "vores" && it.vis === "alle" ? "lejlighed" : (it.vis || "andel");
  var label = it.file && it.people === undefined ? "Tjekker for personer…" : VIS_NAMES[vv] + (it.file && it.people === null && !it.visSet ? " (kunne ikke tjekke)" : "");
  if (!it.file && !canSetVis(it.own)) return '<span class="visbtn visro v-' + (it.vis || "andel") + '">' + esc(label) + "</span>";
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
  spisesteder: [["saeson", "Sæsonlukket?"], ["frokost", "Frokoståbent?"], ["tidlig", "Køkkenet om aftenen åbner", ["Før kl. 20.00", "Efter kl. 20.00"]]]
};
function factList(p, full) {
  var f = p.facts || {}, q = QUESTIONS[p.cat] || [], out = [];
  q.forEach(function (x) {
    var v = f[x[0]];
    if (x[0] === "saeson") { if (v === "ja") out.push(["warn", "Sæsonlukket" + (f.periode ? " (" + f.periode + ")" : "")]); else if (v === "nej" && full) out.push(["", "Åbent hele året"]); }
    if (x[0] === "frokost") { if (v === "ja") out.push(["", "Frokoståbent"]); else if (v === "nej" && full) out.push(["", "Ikke frokoståbent"]); }
    if (x[0] === "tidlig") { if (v === "ja") out.push(["", "Aften før kl. 20"]); else if (v === "nej") out.push(["warn", "Aften efter kl. 20"]); }
    if (x[0] === "sondag") { if (v === "ja" && full) out.push(["", "Søndagsåbent"]); else if (v === "nej") out.push(["warn", "Lukket om søndagen"]); }
  });
  return out;
}
function questionsHtml(f) {
  var q = QUESTIONS[f.cat]; if (!q) return "";
  var fa = f.facts || {};
  return '<div class="questions">' + q.map(function (x) {
    var v = fa[x[0]] || "";
    return '<div class="qrow"><span>' + esc(x[1]) + '</span><div class="seg small" role="group" aria-label="' + esc(x[1]) + '">' +
      [["ja", x[2] ? x[2][0] : "Ja"], ["nej", x[2] ? x[2][1] : "Nej"], ["", "Ved ikke"]].map(function (o) { return '<button type="button" data-q="' + x[0] + '" data-qv="' + o[0] + '" aria-pressed="' + (v === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div></div>" +
      (x[0] === "saeson" && v === "ja" ? '<label class="qperiod">Hvornår er der lukket? (valgfrit)<input id="f-periode" value="' + esc(fa.periode || "") + '" placeholder="Fx november–marts"></label>' : "");
  }).join("") + "</div>";
}
function subChooser(f) {
  if (!SUBCATS[f.cat]) return "";
  return '<div class="chips subchoose" role="group" aria-label="Underkategori (valgfri)"><span class="hint">Underkategori:</span>' + SUBCATS[f.cat].map(function (x) { return '<button class="chip" type="button" data-setsub="' + x[0] + '" aria-pressed="' + (f.subcat === x[0]) + '">' + esc(x[1]) + "</button>"; }).join("") + "</div>";
}
function quickHtml(f) {
  var thumbs = f.items.map(function (it, i) { return '<div class="qthumb"><img src="' + esc(it.url || photoUrl(it.path, true)) + '" alt="">' + visBtn(it, i) + "</div>"; }).join("");
  var dist = f.lat != null ? distText(f) : "";
  var chips = CATS.map(function (c) { return '<button class="chip" type="button" data-setcat="' + c[0] + '" aria-pressed="' + (f.cat === c[0]) + '">' + c[1] + "</button>"; }).join("");
  if (f.manual) return '<form class="panel" id="editor"><h2>Nyt sted</h2>' +
    '<div class="row" style="align-items:flex-end"><label style="flex:1">Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Restaurante El Puerto"></label><button class="btn" type="button" id="find-map">Find på kortet</button></div>' +
    (f.info ? '<p class="hint">' + esc(f.info) + "</p>" : "") +
    (f.choices ? '<div class="choices">' + f.choices.map(function (x, i) { return '<button class="btn" type="button" data-choose="' + i + '"><strong>' + esc(x.name) + "</strong> " + esc([x.addr, x.km != null ? Math.round(x.km) + " km fra hotellet" : ""].filter(Boolean).join(" · ")) + "</button>"; }).join("") + "</div>" : "") +
    (f.lat != null ? '<p class="meta">' + esc([f.town, dist].filter(Boolean).join(" · ")) + "</p>" : "") +
    linkFields(f) + '<p class="hint">Har I ingen billeder, henter siden selv et par stykker fra hjemmesiden eller bloggen, når I gemmer.</p>' +
    '<div class="chips" role="group" aria-label="Kategori">' + chips + "</div>" + subChooser(f) + questionsHtml(f) +
    '<button type="button" class="favtoggle' + (f.fav ? " on" : "") + '" id="f-favbtn" aria-pressed="' + !!f.fav + '">' + heartSvg(f.fav) + ' Tilføj som favorit</button>' +
    (thumbs ? '<div class="qthumbs">' + thumbs + "</div>" : "") +
    '<label class="btn" style="display:inline-flex;align-self:flex-start;color:var(--fg)">+ Tilføj billeder (valgfrit)<input type="file" id="f-add" accept="image/*" multiple hidden></label>' +
    dupHtml(f) + (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + "</button>" +
    '<button class="btn" type="button" id="more">Tilføj beskrivelse, karakter m.m.</button><button class="btn" type="button" id="cancel">Annuller</button></div></form>';
  return '<form class="panel" id="editor"><h2>Nyt sted</h2>' +
    '<div class="qthumbs">' + thumbs + '</div><p class="hint">Billeder med personer bliver kun vist for jeres andel. Tryk på mærket for at ændre det.</p>' +
    (f.match && !f.finding ? '<div class="match"><p>Billederne er taget ' + (f.match.m < 15 ? "ved" : f.match.m + " m fra") + " <strong>" + esc(f.match.name) + '</strong>.</p><button class="btn primary" type="button" id="add-to-match"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Tilføj billederne dér") + '</button><p class="hint">Eller opret et nyt sted nedenfor.</p></div>' : "") +
    (f.finding ? '<p class="finding" role="status"><span class="spin" aria-hidden="true"></span>Finder stedet ud fra billederne …</p>' :
      '<label>Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Skriv stedets navn"></label>' +
      '<p class="meta">' + esc([f.area, dist].filter(Boolean).join(" · ") || "Ingen placering fundet") + "</p>" +
      (f.info ? '<p class="hint">' + esc(f.info) + "</p>" : "") +
      (f.lat == null ? '<div><button class="btn" type="button" id="my-loc">Brug min placering</button></div>' : "") +
      '<div class="chips" role="group" aria-label="Kategori">' + chips + "</div>" + subChooser(f) + questionsHtml(f) +
      '<button type="button" class="favtoggle' + (f.fav ? " on" : "") + '" id="f-favbtn" aria-pressed="' + !!f.fav + '">' + heartSvg(f.fav) + ' Tilføj som favorit</button>') +
    dupHtml(f) + (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row savebar"><button class="btn primary" type="submit"' + (ui.busy || f.finding ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + "</button>" +
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
  var favEl = document.getElementById("f-fav"); if (favEl) d.fav = favEl.checked;
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
  ui.draft = { isNew: false, id: p.id, link: p.link || "", website: p.website || "", maps: p.maps_url || "", lastVisit: p.mine ? p.mine.last_visit : null, town: p.town || "", cat: p.cat, subcat: p.subcat || "", facts: JSON.parse(JSON.stringify(p.facts || {})), fav: !!p.fav, name: p.name, area: p.area || "", note: p.note || "", rating: null, price: p.price || "", visits: (p.visits || []).slice(), guess: !!p.guess, lat: p.lat, lon: p.lon,
    vis: p.visibility || "alle", expVis: p.mine ? p.mine.visibility : "alle", otherPhotos: (p.photoRows || []).length - ours.length,
    items: ours.map(function (x) { return { path: x.path, id: x.id, vis: x.visibility, origVis: x.visibility, people: x.faces, own: x.owner === ui.user.id }; }), removed: [] };
  // Udgangspunktet: kun felter, der faktisk rettes, bliver gemt (så en gammel kopi ikke overskriver nyere data)
  ui.draft.start = { name: p.name, cat: p.cat, subcat: p.subcat || "", town: p.town || "", area: p.area || "", lat: p.lat, lon: p.lon, vis: p.visibility || "alle" };
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
var VIS_NAMES = { alle: "Alle", andel: "Vores andel", mig: "Kun mig", lejlighed: "Lejligheden" };
// "Kun mig" kan kun vælges for egne billeder – et billede, en anden i andelen har lagt ind, skifter mellem Alle og Vores andel
function nextVis(v, own) { return v === "alle" || v === "lejlighed" ? "andel" : v === "andel" && own !== false ? "mig" : "alle"; }
/* Ting om lejligheden (kategori "vores"): "Alle" betyder alle andele i samme lejlighed */
function isAptPlace(target) { var p = raw.places.filter(function (x) { return x.id === target; })[0]; var c = p ? p.cat : (ui.draft && ui.draft.id === target ? ui.draft.cat : null); return c === "vores"; }
function visFor(target, v) { return v === "alle" && isAptPlace(target) ? "lejlighed" : v; }

/* Upload til andelens mappe; billederne gemmes mindre og uden GPS (canvas fjerner placeringen) */
var NEW_THUMBS = {};
function withThumbs(paths) { return paths.concat(paths.map(thumbPath)); }
function smallCopy(blob) {
  return new Promise(function (res) {
    var url = URL.createObjectURL(blob), im = new Image();
    im.onload = function () {
      var s = Math.min(1, 600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(function (b) { res(b); }, "image/jpeg", 0.72);
    };
    im.onerror = function () { URL.revokeObjectURL(url); res(null); };
    im.src = url;
  });
}
async function uploadFiles(target, files, onProgress) {
  var paths = [];
  for (var i = 0; i < files.length; i++) {
    if (onProgress) onProgress(i + 1, files.length);
    var blob = await shrink(files[i]);
    var path = me.andel + "/" + target + "/" + Date.now().toString(36) + i + ".jpg";
    var up = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (up.error) throw new Error("Et billede blev ikke uploadet: " + up.error.message);
    // Lille udgave til kort og felter – går det galt, bruges bare det store billede
    try { var sm = await smallCopy(blob); if (sm) { var ut = await sb.storage.from("photos").upload(thumbPath(path), sm, { contentType: "image/jpeg", upsert: false }); if (!ut.error) NEW_THUMBS[path] = 1; } } catch (x) {}
    paths.push(path);
  }
  return paths;
}
async function addPhotoRows(kind, target, rows) {
  if (!rows.length) return;
  var r = await sb.from("photos").insert(rows.map(function (x, i) { return { kind: kind, target: target, path: x.path, thumb: !!NEW_THUMBS[x.path], andel_id: me.andel, owner: ui.user.id, visibility: kind === "place" ? visFor(target, x.vis || "andel") : (x.vis || "andel"), faces: x.people === true, sort: x.sort != null ? x.sort : 100 + i }; }));
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
    var r = await saveExp("place", placeId, { visits: visits, last_visit: newestVisit(p.mine && p.mine.last_visit, visits, opts.last || pi.date) });
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
  if (d.isNew && !d.dupOk && !isApt(d.cat)) {
    var dd = similarPlaces(d.name, d.lat, d.lon, d.id, raw.places);
    if (dd.length) { d.dups = dd; d.err = ""; render(); var bx = document.getElementById("dupbox"); if (bx) bx.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  }
  if (d.items.some(function (it) { return it.file && it.people === undefined; })) { d.err = "Vent et øjeblik – billederne bliver tjekket for personer."; render(); return; }
  ui.busy = true; d.err = ""; render();
  try {
    var orig = raw.places.filter(function (x) { return x.id === d.id; })[0], core = d.isNew || canEditCore(orig);
    var fix = function (u) { u = (u || "").trim(); return u && !/^https?:\/\//i.test(u) ? "https://" + u : u; };
    var web = fix(d.website), maps = fix(d.maps), link = fix(d.link);
    [web, link].forEach(function (u) { if (u && isMapsLink(u) && !maps) maps = u; });   // et Google Maps-link havner i Maps-feltet
    if (isMapsLink(web)) web = ""; if (isMapsLink(link)) link = "";
    // Et nyt eller ændret Google Maps-link med placering vinder over billedernes placering (billederne kan være taget et stykke væk)
    var newMaps = maps && maps !== ((orig && orig.maps_url) || "");
    if (core && (d.lat == null || newMaps)) { var gc = coordsFromLink(maps); if (gc) { var noPos = d.lat == null; d.lat = +gc[0].toFixed(5); d.lon = +gc[1].toFixed(5); if (noPos && !d.town) d.town = townFor(d.lat, d.lon, {}); } }
    // Fakta, som alle må rette
    var row = { link: link || null, website: web || null, maps_url: maps || null, facts: cleanFacts(d), price: d.price, guess: d.guess, updated_at: new Date().toISOString() };
    if (core) {
      var drive = orig && orig.lat === d.lat && orig.lon === d.lon && orig.drive_min ? { km: orig.drive_km, min: orig.drive_min } : (d.lat != null ? await driveFromHotel(d.lat, d.lon) : null);
      var all = { name: d.name.trim(), cat: d.cat, subcat: subName(d.cat, d.subcat) ? d.subcat : null, town: (d.town || "").trim() || null, area: d.area.trim(), lat: d.lat, lon: d.lon,
        drive_km: drive ? drive.km : null, drive_min: drive ? drive.min : null, visibility: d.vis || "alle" };
      var st = d.start;
      if (!st) Object.assign(row, all);
      else {
        if (d.name.trim() !== st.name) row.name = all.name;
        if (d.cat !== st.cat || (d.subcat || "") !== st.subcat) { row.cat = all.cat; row.subcat = all.subcat; }
        if ((d.town || "").trim() !== st.town) row.town = all.town;
        if (d.area.trim() !== st.area) row.area = all.area;
        if (d.lat !== st.lat || d.lon !== st.lon) { row.lat = all.lat; row.lon = all.lon; row.drive_km = all.drive_km; row.drive_min = all.drive_min; }
        if ((d.vis || "alle") !== st.vis) row.visibility = all.visibility;
      }
    }
    var r = d.isNew ? await sb.from("places").insert(Object.assign({ id: d.id, created_by: ui.user.id, andel_id: me.andel }, row))
                    : await sb.from("places").update(row).eq("id", d.id);
    if (r.error) throw new Error("Stedet blev ikke gemt: " + r.error.message);
    // Vores oplevelse
    var e = await saveExp("place", d.id, { favorite: !!d.fav, visits: d.visits, last_visit: newestVisit(d.lastVisit, d.visits, d.lastVisit), note: d.note.trim() || null, visibility: (d.expVis === "andel" || (d.vis && d.vis !== "alle")) ? "andel" : "alle" });
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
      await sb.from("photos").update({ sort: i, visibility: visFor(d.id, it.vis) }).eq("id", it.id);
    }
    if (d.removed.length) {
      await sb.from("photos").delete().in("path", d.removed);
      await sb.storage.from("photos").remove(withThumbs(d.removed));
    }
    var townMsg = core && row.town !== undefined ? await ensureTown(row.town, row.lat !== undefined ? row.lat : d.lat, row.lon !== undefined ? row.lon : d.lon) : "";
    ui.status = d.status || "tried"; ui.cat = isApt(d.cat) ? "lejligheden" : CATNAME[d.cat] ? d.cat : ui.cat; ui.draft = null; ui.msg = "Gemt." + townMsg;
    if (d.wiz) { ui.wizDone = { id: d.id, name: d.name.trim(), cat: d.cat }; ui.msg = townMsg.trim(); }
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
  if (files.length) await sb.storage.from("photos").remove(withThumbs(files));
  ui.draft = null; ui.busy = false; ui.msg = "Stedet er slettet."; await load();
}


/* ---------- dubletter: samme sted oprettet to gange ----------
   Et sted ligner et andet, hvis det ligger under 120 m væk, eller hvis navnene ligner hinanden og stederne ligger under 3 km fra hinanden (eller ét af dem mangler placering). */
var GENERIC_WORDS = { restaurante: 1, restaurant: 1, bar: 1, cafe: 1, cafeteria: 1, la: 1, el: 1, los: 1, las: 1, de: 1, del: 1, the: 1, y: 1, and: 1 };
function normName(x) { return String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(function (w) { return w && !GENERIC_WORDS[w]; }).join(" "); }
function nameSim(a, b) {
  var na = normName(a), nb = normName(b); if (!na || !nb) return false;
  if (na === nb) return true;
  if ((na.length >= 4 && nb.indexOf(na) >= 0) || (nb.length >= 4 && na.indexOf(nb) >= 0)) return true;
  var ta = na.split(" ").filter(function (w) { return w.length >= 4; }), tb = nb.split(" ");
  return ta.some(function (w) { return tb.indexOf(w) >= 0; });
}
function similarPlaces(name, lat, lon, excludeId, pool) {
  return pool.filter(function (p) { return p.id !== excludeId && !isApt(p.cat); }).map(function (p) {
    var d = lat != null && p.lat != null ? distM(lat, lon, p.lat, p.lon) : null, sim = nameSim(name, p.name);
    return (d != null && d < 120) || (sim && (d == null || d < 3000)) ? { id: p.id, name: p.name, town: p.town || "", m: d != null ? Math.round(d) : null } : null;
  }).filter(Boolean).sort(function (a, b) { return (a.m == null ? 1e9 : a.m) - (b.m == null ? 1e9 : b.m); }).slice(0, 3);
}
function dupHtml(f) {
  if (!f || !f.dups || !f.dups.length) return "";
  return '<div class="dupbox" id="dupbox"><p><strong>Findes stedet allerede?</strong> ' + (f.dups.length === 1 ? "Dette sted" : "Disse steder") + " i guiden ligner det, du er ved at oprette:</p>" +
    f.dups.map(function (x) { return '<div class="duprow"><span><strong>' + esc(x.name) + "</strong> " + esc([x.town, x.m != null ? x.m + " m væk" : ""].filter(Boolean).join(" · ")) + '</span><button class="btn small primary" type="button" data-usedup="' + esc(x.id) + '">Brug dette sted</button></div>'; }).join("") +
    '<p class="hint">Bruger du det eksisterende sted, lægges dine billeder, kommentar og hjerte dér.</p><button class="btn small" type="button" id="dup-new">Nej, opret et nyt sted</button></div>';
}
async function useExisting(id) {
  syncDraft(); var d = ui.draft; if (!d) return;
  var p = raw.places.filter(function (x) { return x.id === id; })[0]; if (!p) return;
  ui.busy = true; render();
  var cur = raw.exps.filter(function (e) { return e.kind === "place" && e.target === id && isMine(e); })[0], patch = {};
  if (d.fav) patch.favorite = true;
  var note = (d.note || "").trim(); if (note) patch.note = cur && cur.note ? cur.note + "\n" + note : note;
  if (d.visits && d.visits.length) { var v = ((cur && cur.visits) || []).slice(); d.visits.forEach(function (m) { if (v.indexOf(m) < 0) v.push(m); }); v.sort(); patch.visits = v; }
  if (Object.keys(patch).length) { var r = await saveExp("place", id, patch); if (r.error) { d.err = "Det blev ikke gemt: " + r.error.message; ui.busy = false; render(); return; } }
  var files = d.items.filter(function (x) { return x.file; }).map(function (x) { return x.file; });
  ui.busy = false;
  if (files.length) { var ok = await addPhotosTo(id, files); if (!ok) return; } else { ui.draft = null; await load(); }
  ui.msg = "Lagt på det eksisterende sted " + p.name + ".";
  openPlace(id);
}
/* Jeres skjulte steder, som en anden andel siden har oprettet som et sted, alle kan se */
function dupDismissed() { try { return JSON.parse(localStorage.getItem("bol-dupok") || "{}"); } catch (e) { return {}; } }
function hiddenDups() {
  if (!me) return [];
  var gone = dupDismissed(), pub = raw.places.filter(function (p) { return p.visibility === "alle" && p.andel_id !== me.andel; });
  return raw.places.filter(function (h) { return h.visibility !== "alle" && h.andel_id === me.andel && !isApt(h.cat); }).map(function (h) {
    var m = similarPlaces(h.name, h.lat, h.lon, h.id, pub)[0], p = m && raw.places.filter(function (x) { return x.id === m.id; })[0];
    return p && !gone[h.id + "|" + p.id] ? [h, p] : null;
  }).filter(Boolean);
}
function hiddenDupHtml(onlyId) {
  return hiddenDups().filter(function (x) { return !onlyId || x[0].id === onlyId; }).map(function (x) {
    var k = esc(x[0].id + "|" + x[1].id);
    return '<div class="dupbox"><p><strong>' + esc(x[0].name) + "</strong>, som kun " + (x[0].visibility === "mig" ? "du" : "I") + " kan se, findes nu også som <strong>" + esc(x[1].name) + "</strong>" + (x[1].town ? " i " + esc(x[1].town) : "") + ", oprettet af en anden andel, så alle kan se det.</p>" +
      '<div class="row"><button class="btn small primary" type="button" data-mergedup="' + k + '">Flyt vores ting dertil</button><button class="btn small" type="button" data-opendup="' + esc(x[1].id) + '">Se det andet sted</button><button class="btn small" type="button" data-keepdup="' + k + '">Behold begge</button></div>' +
      '<p class="hint">Flyt: jeres hjerte, stjerner, tekst og billeder flyttes til det andet sted, og jeres skjulte udgave fjernes. Hvem der kan se jeres stjerner, tekst og billeder, er det samme som før.</p></div>';
  }).join("");
}
async function mergeInto(hId, pId) {
  var h = raw.places.filter(function (x) { return x.id === hId; })[0], p = raw.places.filter(function (x) { return x.id === pId; })[0]; if (!h || !p) return;
  ui.busy = true; ui.msg = "Flytter…"; render();
  try {
    var src = raw.exps.filter(function (e) { return e.kind === "place" && e.target === hId && isMine(e); })[0];
    var dst = raw.exps.filter(function (e) { return e.kind === "place" && e.target === pId && isMine(e); })[0];
    if (src) {
      var patch = { favorite: !!(src.favorite || (dst && dst.favorite)) };
      var v = ((dst && dst.visits) || []).slice(); (src.visits || []).forEach(function (m) { if (v.indexOf(m) < 0) v.push(m); }); v.sort(); patch.visits = v;
      var lv = [src.last_visit, dst && dst.last_visit].filter(Boolean).sort().pop(); if (lv) patch.last_visit = lv;
      if (src.rating_score != null && !(dst && dst.rating_score != null)) { patch.ratings = src.ratings || {}; patch.rating_score = src.rating_score; }
      if (src.note) patch.note = dst && dst.note ? dst.note + "\n" + src.note : src.note;
      if (!dst) patch.visibility = src.visibility;
      var r = await saveExp("place", pId, patch); if (r.error) throw new Error("Det blev ikke flyttet: " + r.error.message);
    }
    var ph = await sb.from("photos").update({ target: pId }).eq("kind", "place").eq("target", hId).eq("andel_id", me.andel);
    if (ph.error) throw new Error("Billederne blev ikke flyttet: " + ph.error.message);
    if (src) await sb.from("experiences").delete().eq("id", src.id);
    var del = await sb.from("places").delete().eq("id", hId).select("id");
    ui.msg = del.data && del.data.length ? "Flyttet til " + p.name + ", og jeres skjulte udgave er fjernet." : "Flyttet til " + p.name + ". Den skjulte udgave kan kun fjernes af den, der oprettede den – den er tom nu.";
  } catch (e) { ui.msg = e.message || "Det lykkedes ikke. Prøv igen."; }
  ui.busy = false; ui.place = null; await load(); openPlace(pId);
}


/* ---------- anmeld en tekst eller et billede fra en anden andel ---------- */
function reportBtn(kind, ref, pk, pt, onPhoto) {
  if (!ui.member || !ref) return "";
  return '<button type="button" class="' + (onPhoto ? "repbtn onphoto" : "repbtn") + '" data-report="' + kind + '" data-ref="' + esc(ref) + '" data-pk="' + esc(pk || "") + '" data-pt="' + esc(pt || "") + '" title="Anmeld ' + (kind === "tekst" ? "teksten" : "billedet") + ' til administratoren">Anmeld</button>';
}
var repBox = document.createElement("div"); repBox.id = "repmodal"; repBox.hidden = true; document.body.appendChild(repBox);
function openReport(kind, ref, pk, pt) {
  ui.rep = { kind: kind, ref: ref, pk: pk, pt: pt };
  repBox.innerHTML = '<div class="lbox" role="dialog" aria-modal="true" aria-labelledby="rep-t"><p id="rep-t"><strong>Anmeld ' + (kind === "tekst" ? "teksten" : "billedet") + "</strong></p>" +
    '<p class="hint">Administratoren får besked og fjerner det, hvis det ikke hører hjemme i guiden – fx personer uden deres accept, noget om ansatte eller reklame. Den, der har lagt det ind, kan ikke se, hvem der har anmeldt.</p>' +
    '<label>Hvad er problemet? (valgfrit)<textarea id="rep-reason" rows="3"></textarea></label>' +
    '<div class="row"><button class="btn primary" type="button" id="rep-send">Send anmeldelse</button><button class="btn" type="button" id="rep-cancel">Annuller</button></div></div>';
  repBox.hidden = false; var ta = document.getElementById("rep-reason"); if (ta) ta.focus();
}
repBox.addEventListener("click", async function (e) {
  if (e.target === repBox) { repBox.hidden = true; ui.rep = null; return; }
  var t = e.target.closest("button"); if (!t) return;
  if (t.id === "rep-cancel") { repBox.hidden = true; ui.rep = null; return; }
  if (t.id === "rep-send" && ui.rep) {
    t.disabled = true;
    var r = await sb.from("reports").insert({ kind: ui.rep.kind, ref: ui.rep.ref, place_kind: ui.rep.pk || null, place_target: ui.rep.pt || null, reason: (document.getElementById("rep-reason").value || "").trim() || null });
    repBox.hidden = true; ui.rep = null;
    ui.msg = r.error ? "Anmeldelsen blev ikke sendt: " + r.error.message : "Tak – administratoren har fået besked.";
    render(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
});
/* Administratoren: åbne anmeldelser */
async function loadReportCount() {
  if (!me || !me.admin) return;
  var r = await sb.from("reports").select("id", { count: "exact", head: true }).eq("handled", false);
  ui.reportCount = r.count || 0;
}
function reportsHtml(list) {
  if (!list || !list.length) return foldBox("adm-rep", "<strong>Anmeldelser</strong>", "Ingen nye anmeldelser", '<p class="hint">Ingen nye anmeldelser.</p>');
  return foldBox("adm-rep", "<strong>Anmeldelser</strong> (" + list.length + ")", list.length === 1 ? "1 ny anmeldelse – tryk for at se den" : list.length + " nye anmeldelser – tryk for at se dem", list.map(function (r) {
    var e = r.kind === "tekst" ? raw.exps.filter(function (x) { return x.id === r.ref; })[0] : null, ph = r.kind === "billede" ? raw.photos.filter(function (x) { return x.id === r.ref; })[0] : null;
    var where = r.place_kind === "place" ? ((raw.places.filter(function (x) { return x.id === r.place_target; })[0] || {}).name || "et sted") : (r.place_target || "");
    var what = r.kind === "tekst" ? (e ? '<blockquote class="otext"><p>' + esc(e.note || "(teksten er allerede fjernet)") + "</p><cite>" + esc(authorText(e)) + "</cite></blockquote>" : '<p class="hint">Teksten findes ikke længere.</p>')
      : (ph ? '<img class="repimg" src="' + esc(photoUrl(ph.path, true)) + '" alt="">' : '<p class="hint">Billedet findes ikke længere (eller du kan ikke se det).</p>');
    return '<div class="repitem"><p><strong>' + (r.kind === "tekst" ? "Tekst" : "Billede") + "</strong> ved " + esc(where) + ' <span class="hint">· ' + esc(String(r.created_at).slice(0, 10)) + "</span></p>" + what +
      (r.reason ? '<p class="hint">Begrundelse: ' + esc(r.reason) + "</p>" : "") +
      '<div class="row">' + (r.place_kind === "place" && r.place_target ? '<button class="btn small" type="button" data-open="' + esc(r.place_target) + '">Åbn stedet</button>' : "") +
      (r.kind === "tekst" && e && e.note ? '<button class="btn small danger" type="button" data-repdel="' + esc(r.id) + '">Fjern teksten</button>' : "") +
      (r.kind === "billede" && ph ? '<button class="btn small danger" type="button" data-repdel="' + esc(r.id) + '">Slet billedet</button>' : "") +
      '<button class="btn small" type="button" data-repok="' + esc(r.id) + '">Behold – marker som behandlet</button></div></div>';
  }).join(""));
}
async function handleReport(id, remove) {
  var r = (adminData && adminData.reports || []).filter(function (x) { return x.id === id; })[0]; if (!r) return;
  if (remove && r.kind === "tekst") await sb.from("experiences").update({ note: null }).eq("id", r.ref);
  if (remove && r.kind === "billede") {
    var ph = raw.photos.filter(function (x) { return x.id === r.ref; })[0];
    await sb.from("photos").delete().eq("id", r.ref);
    if (ph) await sb.storage.from("photos").remove(withThumbs([ph.path]));
  }
  await sb.from("reports").update({ handled: true }).eq("id", id);
  ui.msg = remove ? "Fjernet og markeret som behandlet." : "Markeret som behandlet.";
  adminData = null; await load();
}

/* ---------- tilbage og hjem ----------
   Hver gang man går ind i noget (et sted, en kategori, en by, et område, en side), huskes hvor man var.
   Tilbage-pilen (og telefonens egen tilbage) går ét skridt tilbage; huset går til forsiden. */
var navStack = [];
function snap() { return { menu: !!ui.menu, cat: ui.cat, town: ui.town, region: ui.region, sub: ui.sub, subcat: ui.subcat, ftown: ui.ftown, place: ui.place, page: ui.page, y: window.scrollY }; }
function atStart() { return ui.cat === "hjem" && !ui.town && !ui.region && !ui.place && !ui.page && !ui.subcat && !ui.ftown && !ui.sub && !ui.fOpen && !ui.fSun && !ui.fEarly && !ui.fLunch; }
function nav(change) {
  navStack.push(snap()); if (navStack.length > 60) navStack.shift();
  change(); ui.panel = false;
  try { history.pushState({ nav: navStack.length }, "", ui.place ? "#sted/" + ui.place : (isApt(ui.cat) || CATNAME[ui.cat] || ui.cat === "byer" || ui.cat === "dagsture" || ui.cat === "alle") ? "#" + ui.cat : location.pathname); } catch (x) {}
  render(); window.scrollTo({ top: 0 });
}
/* ---------- ændringer, der ikke er gemt ----------
   Tilbage og hus må altid bruges, mens man retter. Er intet ændret, lukkes formularen bare.
   Er noget ændret, spørges: "Gem først" eller "Forlad uden at gemme". */
var DRAFT_SKIP = { start: 1, info: 1, err: 1, choices: 1, adv: 1, finding: 1, confirmDel: 1, keep: 1, more: 1, orig: 1 };
function draftKey(d) { return JSON.stringify(d, function (k, v) { return DRAFT_SKIP[k] ? undefined : (typeof Blob !== "undefined" && v instanceof Blob ? "fil" : v); }); }
function markOrig() {
  [["draft", "editor", syncDraft], ["areaDraft", "area-editor", syncArea]].forEach(function (x) {
    var d = ui[x[0]]; if (!d || d.orig != null) return;
    setTimeout(function () { if (ui[x[0]] !== d || d.orig != null) return; if (document.getElementById(x[1])) x[2](); d.orig = draftKey(d); }, 0);
  });
}
function hasUnsaved() {
  if (ui.draft) {
    if (document.getElementById("editor")) syncDraft();
    var d = ui.draft;
    if (d.isNew) return (d.items || []).length > 0 || !!(d.name || "").trim() || !!(d.note || "").trim();
    return d.orig != null && draftKey(d) !== d.orig;
  }
  if (ui.areaDraft) { if (document.getElementById("area-editor")) syncArea(); return ui.areaDraft.orig != null && draftKey(ui.areaDraft) !== ui.areaDraft.orig; }
  return false;
}
var leaveBox = document.createElement("div"); leaveBox.id = "leavemodal"; leaveBox.hidden = true; document.body.appendChild(leaveBox);
function leaveDraft(action) {
  if (!ui.draft && !ui.areaDraft) { action(); return; }
  if (!hasUnsaved()) { ui.draft = null; ui.areaDraft = null; action(); return; }
  ui.leave = action;
  leaveBox.innerHTML = '<div class="lbox" role="dialog" aria-modal="true" aria-labelledby="leave-t"><p id="leave-t"><strong>Du har ændringer, der ikke er gemt.</strong></p>' +
    '<div class="row"><button class="btn primary" type="button" id="leave-save">Gem først</button><button class="btn" type="button" id="leave-go">Forlad uden at gemme</button></div></div>';
  leaveBox.hidden = false; var b = document.getElementById("leave-save"); if (b) b.focus();
}
leaveBox.addEventListener("click", async function (e) {
  var a = ui.leave;
  if (e.target === leaveBox) { leaveBox.hidden = true; ui.leave = null; return; }   // tryk ved siden af: bliv
  var t = e.target.closest("button"); if (!t) return;
  leaveBox.hidden = true; ui.leave = null;
  if (t.id === "leave-go") { ui.draft = null; ui.areaDraft = null; if (a) a(); return; }
  if (t.id === "leave-save") {
    if (ui.draft) await saveDraft(); else if (ui.areaDraft) await saveArea();
    if (!ui.draft && !ui.areaDraft && a) a();
  }
});
function goBack() {
  if (ui.draft || ui.areaDraft) { leaveDraft(function () { render(); }); return; }
  if (!navStack.length) return;
  try { history.back(); } catch (x) { restore(navStack.pop()); }
}
function restore(s) {
  ui.menu = !!s.menu; ui.cat = s.cat; ui.town = s.town; ui.region = s.region; ui.sub = s.sub; ui.subcat = s.subcat; ui.ftown = s.ftown; ui.place = s.place; ui.page = s.page; ui.panel = false;
  if (!ui.page) { andelData = null; adminData = null; }
  render(); window.scrollTo({ top: s.y || 0 });
}
function goHome() {
  if (ui.draft || ui.areaDraft) { leaveDraft(function () { navStack = []; ui.page = null; resetToStart(); }); return; }
  navStack = []; ui.page = null; resetToStart();
}
window.addEventListener("popstate", function () {
  // Telefonens egen tilbage mens man retter: bliv på siden, og luk formularen (eller spørg, hvis noget er ændret)
  if (ui.draft || ui.areaDraft) {
    try { history.pushState({ nav: navStack.length }, "", ui.place ? "#sted/" + ui.place : location.pathname + location.search); } catch (x) {}
    leaveDraft(function () { render(); }); return;
  }
  if (navStack.length) { restore(navStack.pop()); return; }
  var m = (location.hash || "").match(/^#sted\/(.+)$/);
  ui.place = m ? decodeURIComponent(m[1]) : null; render(); window.scrollTo({ top: 0 });
});
function openPlace(id) { nav(function () { ui.place = id; ui.page = null; }); }
function closePlace() { if (navStack.length) goBack(); else { ui.place = null; try { history.replaceState(null, "", location.pathname); } catch (x) {} render(); } }

/* ---------- ret by / område ---------- */
function slug(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function startAreaEdit(kind, name) {
  var o = (kind === "town" ? towns[name] : regions[name]) || {};
  var ours = (o.photoRows || []).filter(function (x) { return x.andel_id === me.andel || x.owner === ui.user.id; });
  ui.areaDraft = { kind: kind, name: name, region: kind === "town" ? (o.region || "") : "", newRegion: "", note: o.note || "", visits: ((o.mine && o.mine.visits) || []).slice(), lastVisit: o.mine ? o.mine.last_visit : null,
    expVis: o.mine ? o.mine.visibility : "alle", items: ours.map(function (x) { return { path: x.path, id: x.id, vis: x.visibility, people: x.faces, own: x.owner === ui.user.id }; }), removed: [], err: "" };
  ui.msg = ""; render();
  var f = document.getElementById("area-editor"); if (f) window.scrollTo({ top: f.getBoundingClientRect().top + window.scrollY - 16, behavior: "smooth" });
}
function areaFormHtml(f) {
  var ph = f.items.map(function (it, i) {
    return '<div class="ph"><img src="' + esc(it.url || photoUrl(it.path, true)) + '" alt="">' + (i === 0 ? '<span class="first">Forsidebillede</span>' : "") + visBtn(it, i).replace("data-vis=", "data-avis=") +
      '<div class="row">' + (i > 0 ? '<button class="btn small" type="button" data-afirst="' + i + '">Gør til forside</button>' : "") + '<button class="btn small danger" type="button" data-arm="' + i + '">Slet</button></div></div>';
  }).join("");
  var regs = regionNames().filter(function (r) { return r !== NO_REGION; });
  var regSel = f.kind === "town" ? '<label>Område<select id="a-region"><option value="">Intet område</option>' + regs.map(function (r) { return '<option' + (f.region === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") +
    '<option value="__ny"' + (f.region === "__ny" ? " selected" : "") + '>Nyt område…</option></select></label>' + (f.region === "__ny" ? '<label>Navn på nyt område<input id="a-newregion" value="' + esc(f.newRegion) + '" placeholder="Fx Costa Blanca"></label>' : "") : "";
  return '<form class="panel" id="area-editor"><h2>' + esc(f.name) + "</h2>" +
    '<label>Kommentar<textarea id="a-note" placeholder="Hvad er værd at se, hvor parkerer man, hvad skal man spise?">' + esc(f.note) + "</textarea></label>" +
    '<div><p class="hint" style="margin-bottom:8px">Billeder (det første vises først). Tryk på mærket på et billede for at vælge, hvem der kan se det.</p><div class="photos">' + ph + "</div>" +
    '<label class="btn" style="display:inline-flex;margin-top:10px;color:var(--fg)">+ Tilføj billeder<input type="file" id="a-add" accept="image/*" multiple hidden></label></div>' +
    '<button class="btn advtoggle" type="button" id="a-adv-toggle" aria-expanded="' + !!f.adv + '">' + (f.adv ? "Skjul avanceret redigering ▴" : "Avanceret redigering ▾") + "</button>" +
    (f.adv ? '<div class="advsec">' + regSel +
      '<label>Hvem kan se vores tekst?<select id="a-expvis"><option value="alle"' + (f.expVis !== "andel" ? " selected" : "") + '>Alle</option><option value="andel"' + (f.expVis === "andel" ? " selected" : "") + ">Vores andel</option></select></label>" +
      '<label>Vi har besøgt (fx 2025-02, 2026-07)<input id="a-visits" value="' + esc(f.visits.join(", ")) + '"><span class="hint">Kommer automatisk fra datoen på de billeder, I lægger ind. Her kan I tilføje eller rette.</span></label>' +
      "</div>" : "") +
    dupHtml(f) + (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
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
    if (f.removed.length) { await sb.from("photos").delete().in("path", f.removed); await sb.storage.from("photos").remove(withThumbs(f.removed)); }
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

/* ---------- Hjælp: FAQ-side, ?-forklaringer og velkomst første gang ---------- */
var HELP_MAIL = "c@sorgenfrey.net";
var HELP_TIPS = {
  scope: ["Alle, Besøgt og Favoritter", "<p><strong>Alle</strong> viser alle steder i guiden.</p><p><strong>Besøgt</strong> viser de steder, jeres andel har markeret som besøgt med mærket <span class=\"demoicon\" aria-hidden=\"true\">" + visitSvg(false) + "</span> ved hjertet.</p><p><strong>Favoritter</strong> viser de steder, I har trykket på hjertet <span class=\"demoicon\" aria-hidden=\"true\">" + heartSvg(false) + "</span> ved.</p>", "find"],
  stars: ["Stjernerne", "<p>De store stjerner er <strong>gennemsnittet</strong> af alle andeles vurderinger. Tallet i parentes er, hvor mange der har vurderet.</p><p><strong>Din vurdering</strong> nedenunder er jeres egen.</p><p>Tryk på stjernerne for at give eller ændre jeres vurdering.</p>", "stjerner"],
  photovis: ["Hvem kan se billedet?", "<p>Mærket viser, hvem der kan se billedet:</p><p><strong>Alle</strong> – alle andelshavere i guiden.<br><strong>Vores andel</strong> – kun jer i andelen.<br><strong>Kun mig</strong> – kun dig.</p><p>Tryk på mærket for at skifte. Det gemmes med det samme. <strong>Kun mig</strong> kan kun vælges på billeder, du selv har lagt ind.</p>", "billeder"],
  photovisapt: ["Hvem kan se billedet?", "<p>Mærket viser, hvem der kan se billedet:</p><p><strong>Lejligheden</strong> – alle andele i samme lejlighed (fx alle, der har en andel i lejlighed 101).<br><strong>Vores andel</strong> – kun jer i andelen.<br><strong>Kun mig</strong> – kun dig.</p><p>Tryk på mærket for at skifte. Det gemmes med det samme. <strong>Kun mig</strong> kan kun vælges på billeder, du selv har lagt ind.</p>", "billeder"],
  whoseeapt: ["Hvem kan se det?", "<p><strong>Hvem kan se stedet?</strong> <em>Lejligheden</em> – alle andele i samme lejlighed. <em>Vores andel</em> – kun jer. <em>Kun mig</em> – kun dig.</p><p><strong>Hvem kan se vores stjerner og tekst?</strong> Om jeres stjerner og kommentar vises for alle, der kan se stedet, eller kun for jeres andel.</p>", "stjerner"],
  whosee: ["Hvem kan se det?", "<p><strong>Hvem kan se stedet?</strong> Om alle andelshavere kan se stedet, kun jeres andel eller kun dig.</p><p><strong>Hvem kan se vores stjerner og tekst?</strong> Om jeres stjerner og kommentar vises for alle eller kun for jeres andel.</p>", "stjerner"],
  advanced: ["Avanceret redigering", "<p>Her kan man rette stedets navn, by, kategori, links og hvem der kan se det.</p><p>Vil du bare skrive en kommentar, er knappen <strong>Tilføj kommentar</strong> på stedet nemmere.</p>", "avanceret"],
  invite: ["Når nogen låner jeres lejlighed", "<p>1. Tryk på <strong>Gæster</strong> under Vores andel.<br>2. Skriv personens fornavn og mail.<br>3. Tryk <strong>Invitér</strong>.<br>4. Der kommer et vindue: tryk <strong>Mail</strong>, <strong>SMS</strong>, <strong>WhatsApp</strong> eller <strong>Messenger</strong>. Beskeden er skrevet på forhånd – du vælger personen og trykker send.</p><p>Gæster kan det samme i guiden som ejere, men kan ikke invitere andre.</p>", "andel"]
};
function helpBtn(key, cls) { return '<button type="button" class="qhelp' + (cls ? " " + cls : "") + '" data-help="' + key + '" aria-label="Hjælp: ' + esc(HELP_TIPS[key][0]) + '" title="Hjælp">?</button>'; }
var helpBox = null;
function openHelpTip(key) {
  var t = HELP_TIPS[key]; if (!t) return;
  if (!helpBox) { helpBox = document.createElement("div"); helpBox.id = "helpbox"; document.body.appendChild(helpBox); }
  helpBox.innerHTML = '<div class="rback" data-helpclose></div><div class="helpmodal" role="dialog" aria-modal="true" aria-labelledby="hb-h"><button type="button" class="hclose" data-helpclose aria-label="Luk">×</button><h2 id="hb-h">' + esc(t[0]) + "</h2>" + t[1] +
    '<div class="row"><button type="button" class="btn primary" data-helpclose>Forstået</button><button type="button" class="btn" data-helpmore="' + t[2] + '">Læs mere i Hjælp</button></div></div>';
  helpBox.hidden = false; document.body.classList.add("modal-open");
  var b = helpBox.querySelector(".btn.primary"); if (b) b.focus();
}
function closeHelpTip() { if (helpBox) { helpBox.hidden = true; helpBox.innerHTML = ""; } if (!document.querySelector("#welcomebox:not([hidden])")) document.body.classList.remove("modal-open"); }

var DEMO = {
  back: '<span class="iconbtn demo" aria-hidden="true">' + ICON_BACK + "</span>",
  home: '<span class="iconbtn demo" aria-hidden="true">' + ICON_HOME + "</span>",
  map: '<span class="tview demo" aria-hidden="true">' + ICON_MAP + "</span>",
  list: '<span class="tview demo" aria-hidden="true">' + ICON_LIST + "</span>",
  help: '<span class="iconbtn helpnav demo" aria-hidden="true">?</span>',
  heart: '<span class="demoicon" aria-hidden="true">' + heartSvg(false) + "</span>",
  visit: '<span class="demoicon" aria-hidden="true">' + visitSvg(false) + "</span>",
  pill: '<span class="pill demo" aria-hidden="true"><button type="button" tabindex="-1" aria-pressed="true">Alle</button><button type="button" tabindex="-1" aria-pressed="false">' + visitSvg(false) + ' Besøgt</button><button type="button" tabindex="-1" aria-pressed="false">' + heartSvg(false) + " Favoritter</button></span>",
  stars: '<span class="demostars" aria-hidden="true"><span class="rstars">' + starRow(0) + "</span></span>",
  rating: '<span class="demorating" aria-hidden="true"><span class="rbtn"><span class="rnum">4,0</span><span class="rstars">' + starRow(4) + '</span><span class="rcount">(2)</span></span><span class="rown">Din vurdering 4,5 ★</span></span>',
  share: '<span class="osicon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#0a7aff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v9A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 17.5 9H16"/><path d="M12 14V3M8.5 6.5 12 3l3.5 3.5"/></svg></span>',
  addhome: '<span class="osicon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8.5v7M8.5 12h7"/></svg></span>',
  dots: '<span class="osicon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg></span>'
};
var HELP_FAQ = [
  ["start", "Kom i gang", [
    ["Hvordan logger jeg ind første gang?", "<ol><li>Åbn linket fra den invitation, du har fået.</li><li>Tryk på <strong>Første gang: opret adgangskode</strong>.</li><li>Skriv den mail, du er inviteret med, og vælg en adgangskode (mindst 8 tegn).</li><li>Du får en mail. Den er på engelsk og hedder <em>Confirm your signup</em>. Tryk på linket <em>Confirm your mail</em> i mailen.</li><li>Kom tilbage til guiden og log ind med mail og adgangskode.</li></ol>"],
    ["Jeg har glemt min adgangskode", "<ol><li>Tryk på <strong>Glemt adgangskode?</strong> under feltet til adgangskoden på log ind-siden.</li><li>Skriv din mail og tryk <strong>Send link</strong>.</li><li>Åbn mailen. Den er på engelsk og hedder <em>Reset your password</em>. Tryk på linket <em>Reset password</em>. Kan du ikke finde mailen, så kig i uønsket post (spam).</li><li>Skriv din nye adgangskode to gange og tryk <strong>Gem ny adgangskode</strong>.</li></ol><p>Så er du logget ind igen.</p>"],
    ["Hvordan får jeg guiden som \"app\" på min telefon?", "<p>Guiden er ikke en app, du henter i App Store eller Google Play. Det er en hjemmeside. Men du kan lægge den på telefonens hjemmeskærm med sit eget ikon. Så åbner den med ét tryk og ser ud og opfører sig som en app – og du skal ikke logge ind hver gang.</p>" +
      "<p><strong>Åbnede du linket fra Messenger, Facebook eller en mail-app?</strong> Så åbner guiden inde i den app, og der kan den ikke lægges på hjemmeskærmen. Tryk først på de tre prikker øverst og vælg <strong>Åbn i browser</strong> (Android) eller <strong>Åbn i Safari</strong> (iPhone).</p>" +
      "<p><strong>iPhone og iPad</strong> – åbn guiden i <strong>Safari</strong>:</p><ol><li>Tryk på Del-knappen " + DEMO.share + " nederst (på iPad øverst).</li><li>Rul lidt ned og tryk <strong>Føj til hjemmeskærm</strong> " + DEMO.addhome + ".</li><li>Tryk <strong>Tilføj</strong> øverst til højre.</li></ol>" +
      "<p><strong>Android</strong> – åbn guiden i <strong>Chrome</strong>:</p><ol><li>Tryk på de tre prikker " + DEMO.dots + " øverst til højre.</li><li>Tryk <strong>Føj til startskærm</strong> (eller <strong>Installer app</strong>).</li><li>Tryk <strong>Tilføj</strong>.</li></ol><p>Nu ligger guiden som et ikon sammen med dine andre apps.</p>"],
    ["Hvordan kommer jeg tilbage?", "<p>" + DEMO.back + " øverst til højre går et skridt tilbage.</p><p>" + DEMO.home + " går til forsiden.</p>"],
    ["Hvor finder jeg hjælp?", "<p>Tryk på " + DEMO.help + " øverst til højre. Den virker også, før du er logget ind.</p>"],
    ["Kan jeg se velkomsten igen?", "<p>Ja: <button type=\"button\" class=\"linkbtn\" id=\"show-welcome\">Vis velkomsten igen</button>.</p>"]
  ]],
  ["find", "Find steder", [
    ["Hvordan finder jeg et sted?", "<ol><li>Tryk på et af felterne på forsiden – fx <strong>Spisesteder</strong> eller <strong>Strande</strong>.</li><li>Tryk på et sted for at se billeder, stjerner og kommentarer.</li></ol><p>Leder du efter noget bestemt, så skriv i søgefeltet øverst.</p>"],
    ["Hvad betyder Alle, Besøgt og Favoritter?", "<p>" + DEMO.pill + "</p><p><strong>Alle</strong> viser alle steder i guiden.</p><p><strong>Besøgt</strong> viser de steder, jeres andel har markeret som besøgt med mærket <span class=\"demoicon\" aria-hidden=\"true\">" + visitSvg(false) + "</span> ved hjertet.</p><p><strong>Favoritter</strong> viser de steder, I har trykket på hjertet " + DEMO.heart + " ved.</p><p>Det valgte står med hvid tekst på mørkeblåt.</p>"],
    ["Hvad betyder \"nye siden sidst\" på forsiden?", "<p>Står der fx <strong>3 nye siden sidst</strong> øverst på forsiden, er der sket noget, siden du sidst kiggede:</p><ul><li>andre andelshavere har givet stjerner eller skrevet en kommentar til et sted, I selv har vurderet eller kommenteret</li><li>der er kommet et nyt sted i guiden med billeder, en kommentar eller stjerner</li><li>andre andelshavere i jeres lejlighed har lagt billeder ind eller skrevet en kommentar på lejlighedens side (har I flere lejligheder, gælder det dem alle)</li><li>andre har lagt nye billeder ind på steder, I selv har vurderet eller kommenteret</li></ul><p>Tryk på linjen for at se listen, og tryk på et sted for at åbne det. Næste gang du åbner guiden, tæller den kun det, der er kommet til siden. Er der intet nyt, står linjen der ikke.</p><p>Under <strong>Vores andel</strong> nederst på siden kan du slå \"Nyt siden sidst\" helt fra eller vælge, hvad der skal med. Det gælder kun dig.</p>"],
    ["Hvad er forskellen på Byer og Dagsture?", "<p><strong>Byer</strong> er byerne i området med de steder, der ligger i dem.</p><p><strong>Dagsture</strong> er områder mindst en halv time væk i bil. Ture over 2½ time står under <strong>Længere ture</strong>.</p>"],
    ["Hvordan ser jeg stederne på et kort?", "<p>Tryk på kort-knappen " + DEMO.map + " til højre for søgefeltet.</p><p>På kortet bliver knappen til " + DEMO.list + ". Tryk på den for at komme tilbage til listen.</p><p>Inde på et sted viser " + DEMO.map + " stedet på kortet i stedet for billederne.</p>"],
    ["Hvad gør Karakter og Sortering?", "<p><strong>Karakter</strong> viser kun steder med mindst så mange stjerner. <strong>Sortering</strong> bestemmer rækkefølgen, fx senest besøgt eller flest stjerner.</p>"]
  ]],
  ["stjerner", "Stjerner og kommentarer", [
    ["Hvordan giver jeg stjerner?", "<ol><li>Åbn stedet.</li><li>Tryk på stjernerne " + DEMO.stars + " ud for navnet.</li><li>Der kommer et vindue med nogle få spørgsmål – for et spisested fx <em>Mad og drikke</em>, <em>Betjening</em>, <em>Beliggenhed og stemning</em> og <em>Værdi for pengene</em>. Tryk på 1–5 stjerner ved hvert spørgsmål. Du behøver ikke svare på dem alle.</li><li>Nederst ser du den samlede vurdering. Tryk <strong>Gem</strong>.</li></ol><p>Du kan altid ændre jeres stjerner ved at trykke på dem igen.</p>"],
    ["Hvad betyder de store og de små stjerner?", "<p>" + DEMO.rating + "</p><p>De <strong>store stjerner</strong> er gennemsnittet af alle andeles vurderinger. Tallet foran er gennemsnittet, og tallet i parentes er, hvor mange andele der har vurderet.</p><p><strong>Din vurdering</strong> nedenunder er jeres egen.</p><p>Tryk på stjernerne for at give eller ændre jeres vurdering.</p>"],
    ["Hvordan skriver jeg en kommentar?", "<ol><li>Åbn stedet.</li><li>Tryk <strong>Tilføj kommentar</strong>. Der kommer et vindue med kun et tekstfelt.</li><li>Skriv fx hvad I spiste, priser eller gode råd.</li><li>Tryk <strong>Gem</strong>.</li></ol><p>Har I allerede skrevet noget, kan I rette det samme sted. Sletter I teksten og trykker Gem, fjernes kommentaren.</p>"],
    ["Hvem kan se det, jeg skriver?", "<p>Som udgangspunkt kan alle andelshavere se jeres stjerner og kommentarer. Vil I holde dem for jer selv, så tryk <strong>Rediger</strong> på stedet og vælg <strong>Vores andel</strong> under <strong>Hvem kan se vores stjerner og tekst?</strong></p>"],
    ["Hvad er hjertet?", "<p>Tryk på hjertet " + DEMO.heart + " ved et sted for at gøre det til en favorit. Tryk igen for at fjerne det. Favoritter deles med alle i jeres andel. Tallet ved hjertet viser, hvor mange andele der har stedet som favorit – andre kan se antallet, men ikke hvem.</p><p>Jeres favoritter står under <strong>Jeres favoritter</strong> på forsiden og under <strong>Favoritter</strong> øverst.</p>", "fav"],
    ["Hvad er besøgt-mærket?", "<p>Tryk på besøgt-mærket " + DEMO.visit + " ved et sted, når I har været der. Mærket bliver grønt. Tryk igen for at fjerne det. Det er fælles for alle i jeres andel.</p><p>Jeres besøgte steder står under <strong>Seneste besøg</strong> på forsiden og under <strong>Besøgt</strong> øverst.</p><p>Tallet ved mærket viser, hvor mange andele der har besøgt stedet. Andre andele kan se antallet, men ikke hvem.</p>", "visit"]
  ]],
  ["billeder", "Billeder og nye steder", [
    ["Hvordan lægger jeg billeder ind?", "<ol><li>Åbn stedet.</li><li>Tryk <strong>Tilføj billeder</strong>.</li><li>Vælg billederne på telefonen eller computeren.</li><li>Tryk <strong>Gem</strong>.</li></ol>"],
    ["Hvordan opretter jeg et nyt sted?", "<p>Tryk <strong>+ Nyt sted</strong> nederst til højre. Så kommer en guide i fire trin. Prikkerne øverst viser, hvor langt du er, og du kan altid trykke <strong>Tilbage</strong>.</p>" +
      "<ol><li><strong>Har du billeder fra stedet?</strong> Tryk <strong>Vælg billeder</strong> eller <strong>Ingen billeder</strong>.</li>" +
      "<li><strong>Hvor er det?</strong> Med billeder finder guiden selv stedet ud fra, hvor billedet er taget. Ligger der allerede et sted i guiden tæt på, spørger den fx <em>Er det Las Gredas?</em> – tryk <strong>Ja – læg billederne dér</strong>, så er du færdig. Ellers skriv navnet og tryk <strong>Find på kortet</strong>, og tryk på det rigtige sted i listen. Står du på stedet, kan du trykke <strong>Brug min placering</strong>.</li>" +
      "<li><strong>Hvad er det?</strong> Tryk på en kategori, fx <strong>Spisesteder</strong>, og evt. hvilken slags, fx <strong>Restaurant</strong>.</li>" +
      "<li><strong>Jeres oplevelse</strong> (kan springes over): skriv en kommentar, svar på de korte spørgsmål (fx <em>Frokoståbent</em>) og tryk " + DEMO.heart + " for favorit. Tryk <strong>Gem stedet</strong>.</li></ol>" +
      "<p>Til sidst står der, at stedet er oprettet. Her kan du trykke <strong>Giv stjerner</strong>, <strong>Se stedet</strong> eller <strong>Tilføj flere detaljer</strong> (hjemmeside, links, pris, hvem der kan se det).</p>" +
      "<p><strong>Godt at vide</strong></p><ul><li>Findes der allerede et sted med et lignende navn, viser guiden det, før du gemmer. Brug hellere det, så det samme sted ikke står to gange.</li><li>Billeder, hvor guiden finder personer, bliver kun vist for jeres andel.</li><li>Fortryder du, så tryk på krydset øverst.</li></ul>"],
    ["Hvem kan se mine billeder?", HELP_TIPS.photovis[1] + "<p>Billeder, hvor guiden finder personer, bliver automatisk kun vist for jeres andel.</p>"],
    ["Hvordan sletter jeg et billede?", "<ol><li>Åbn stedet.</li><li>Tryk <strong>Rediger</strong>.</li><li>Tryk <strong>Slet</strong> under billedet.</li><li>Tryk <strong>Gem</strong>.</li></ol><p>Du kan kun slette jeres egne billeder. Med <strong>Gør til forside</strong> vælger du, hvilket billede der vises først.</p>"],
    ["Hvad gør Anmeld?", "<p>Er en tekst eller et billede fra en anden andel forkert eller upassende, så tryk <strong>Anmeld</strong> og skriv kort hvorfor. Administratoren ser på det.</p>"]
  ]],
  ["avanceret", "Rediger et sted", [
    ["Hvordan retter jeg et sted?", "<p>Åbn stedet og tryk <strong>Rediger</strong> (til højre for Tilføj billeder). Her kan du rette alt om stedet – også kommentar, favorit og billeder. Vil du kun skrive en kommentar, er knappen <strong>Tilføj kommentar</strong> nemmere.</p><p>Under <strong>Avanceret redigering</strong> finder du:</p><ul>" +
      "<li><strong>Navn</strong>, <strong>By</strong> og <strong>Sted/område</strong> – fx <em>Plaza del Muelle</em>. Kan kun rettes af den, der oprettede stedet.</li>" +
      "<li><strong>Kategori</strong> og <strong>Underkategori</strong> – fx Spisesteder › Strandbar.</li>" +
      "<li><strong>Pris</strong> – prisniveau, eller <em>Ikke relevant</em>.</li>" +
      "<li><strong>Hvem kan se vores stjerner og tekst?</strong> – <em>Alle</em> eller kun <em>Vores andel</em>.</li>" +
      "<li><strong>Hvem kan se stedet?</strong> – <em>Alle</em>, <em>Vores andel</em> eller <em>Kun mig</em>.</li>" +
      "<li><strong>Stedets hjemmeside</strong>, <strong>Link til Google Maps</strong> og <strong>Andet link</strong> (fx en blog eller anmeldelser).</li>" +
      "<li><strong>Vi har besøgt</strong> – måneder som 2026-07. Udfyldes selv ud fra datoen på jeres billeder.</li>" +
      "<li><strong>Find igen ud fra navnet</strong> eller <strong>Brug min placering</strong> – hvis stedet står forkert på kortet.</li>" +
      "<li><strong>Navnet er ikke bekræftet</strong> – sæt flueben, hvis I ikke er sikre på navnet.</li>" +
      "<li><strong>Slet sted</strong> – kun for den, der oprettede stedet. Tryk to gange for at slette.</li></ul><p>Tryk <strong>Gem</strong>, når du er færdig.</p>"]
  ]],
  ["andel", "Vores andel og konto", [
    ["Familie eller venner skal låne vores lejlighed – hvordan får de adgang?", "<p>Gå til <strong>Vores andel</strong> nederst på siden.</p>" + HELP_TIPS.invite[1] + "<p>Beskeden indeholder en kort vejledning i at logge ind. Kun ejere kan invitere.</p>"],
    ["Hvad er forskellen på Ejer og Gæst?", "<p>Begge kan se og bruge alt i guiden. Kun <strong>ejere</strong> kan invitere andre og fjerne adgang.</p>"],
    ["Hvordan sletter jeg min konto?", "<p>Gå til <strong>Vores andel</strong> nederst på siden og tryk <strong>Slet min konto</strong>. Det, du har lagt ind, bliver hos andelen.</p>"]
  ]]
];
function helpPageHtml() {
  var h = '<section class="panel helppage"><p class="eyebrow">Hjælp</p><h2>Sådan bruger du guiden</h2>' +
    '<p class="hint">Tryk på et spørgsmål for at se svaret. Du kan også trykke på <span class="qhelp inline" aria-hidden="true">?</span> rundt omkring i guiden.</p>';
  HELP_FAQ.forEach(function (sec) {
    h += '<h3 id="hjaelp-' + sec[0] + '">' + esc(sec[1]) + "</h3>";
    sec[2].forEach(function (q) { h += '<details class="faq"><summary><span class="fq">' + (q[2] ? rowIcon(q[2]) : "") + esc(q[0]) + '</span></summary><div class="faqa">' + q[1] + "</div></details>"; });
  });
  h += '<div class="helpcontact"><h3>Kan du ikke finde svaret?</h3><p>Skriv til Christian på <a href="mailto:' + HELP_MAIL + '">' + HELP_MAIL + "</a>. Skriv gerne, hvad du prøvede at gøre, og hvad der skete.</p></div></section>";
  return h;
}

/* Velkomst første gang (gemmes pr. bruger på enheden) */
var WELCOME = [
  ["alle", "Find steder", "Tryk på et af felterne på forsiden – fx <strong>Spisesteder</strong> eller <strong>Strande</strong> – for at se steder i området med billeder, stjerner og kommentarer fra andelshaverne. Leder du efter noget bestemt, så skriv i søgefeltet."],
  ["heart", "Hjerte og besøgt", "Ved hvert sted er der to knapper:</p><p class=\"wpair\"><span class=\"wb wbv\">" + visitSvg(true) + "</span><span><strong>Besøgt</strong> – tryk, når I har været der. Så finder I det under <strong>Besøgt</strong> og <strong>Seneste besøg</strong>.</span></p><p class=\"wpair\"><span class=\"wb wbh\">" + heartSvg(true) + "</span><span><strong>Favorit</strong> – tryk på hjertet, så finder I det under <strong>Favoritter</strong>.</span></p><p>Begge deles med alle i jeres andel."],
  ["star", "Del jeres oplevelser", "Tryk på stjernerne for at give jeres vurdering, eller på <strong>+ Nyt sted</strong> for at lægge et sted og billeder ind. Har du brug for hjælp, så tryk på <strong>?</strong> øverst."]
];
var welcomeBox = null, welcomeStep = 0;
function welcomeKey() { return "bol_welcome_" + (ui.user ? ui.user.id : ""); }
function maybeWelcome() {
  if (!ui.user || !ui.member || ui.page || welcomeBox && !welcomeBox.hidden) return;
  var seen = true; try { seen = !!localStorage.getItem(welcomeKey()); } catch (x) { seen = true; }
  if (seen) { saveWelcomed(); return; }
  // Set på en anden enhed eller i en anden browser (fx hjemmeskærm-appen)? Så spring den over her også
  var uid = ui.user.id;
  sb.from("user_state").select("welcomed").eq("user_id", uid).maybeSingle().then(function (r) {
    if (!ui.user || ui.user.id !== uid) return;
    if (r.data && r.data.welcomed) { try { localStorage.setItem(welcomeKey(), "1"); } catch (x) {} return; }
    if (!ui.page && !(welcomeBox && !welcomeBox.hidden)) openWelcome();
  });
}
var welcomedSaved = false;
function saveWelcomed() {
  if (welcomedSaved || !ui.user) return; welcomedSaved = true;
  sb.from("user_state").upsert({ user_id: ui.user.id, welcomed: true }, { onConflict: "user_id" }).then(function () {});
}
function openWelcome() {
  welcomeStep = 0;
  if (!welcomeBox) { welcomeBox = document.createElement("div"); welcomeBox.id = "welcomebox"; document.body.appendChild(welcomeBox); }
  drawWelcome(); welcomeBox.hidden = false; document.body.classList.add("modal-open");
}
function drawWelcome() {
  var w = WELCOME[welcomeStep], last = welcomeStep === WELCOME.length - 1;
  var icon = w[0] === "heart" ? visitSvg(false) + heartSvg(false) : w[0] === "star" ? CAT_ICONS.oplevelser || "★" : CAT_ICONS.alle;
  welcomeBox.innerHTML = '<div class="rback"></div><div class="helpmodal welcome-modal" role="dialog" aria-modal="true" aria-labelledby="wb-h">' +
    '<p class="eyebrow">Velkommen til guiden' + (me && me.name ? ", " + esc(me.name) : "") + '</p><div class="wicon" aria-hidden="true">' + icon + '</div><h2 id="wb-h">' + esc(w[1]) + "</h2><p>" + w[2] + "</p>" +
    '<div class="wdots" aria-hidden="true">' + WELCOME.map(function (x, i) { return '<span class="' + (i === welcomeStep ? "on" : "") + '"></span>'; }).join("") + "</div>" +
    '<div class="row"><button type="button" class="btn primary" data-wnext>' + (last ? "Kom i gang" : "Næste") + "</button>" + (last ? "" : '<button type="button" class="btn" data-wskip>Spring over</button>') + "</div></div>";
  var b = welcomeBox.querySelector(".btn.primary"); if (b) b.focus();
}
function closeWelcome() {
  try { localStorage.setItem(welcomeKey(), "1"); } catch (x) {}
  saveWelcomed();
  if (welcomeBox) { welcomeBox.hidden = true; welcomeBox.innerHTML = ""; }
  document.body.classList.remove("modal-open");
}

/* ---------- Guide til nyt sted: 1 billeder · 2 hvor · 3 hvad · 4 oplevelse · gem ---------- */
var WIZ_STEPS = ["Billeder", "Hvor er det?", "Hvad er det?", "Jeres oplevelse"];
function wizHead(step, title) {
  return '<button type="button" class="hclose" data-wiz="close" aria-label="Luk">×</button>' +
    '<div class="wizdots" aria-label="Trin ' + step + ' af 4">' + WIZ_STEPS.map(function (s, i) { return '<span class="' + (i + 1 < step ? "done" : i + 1 === step ? "on" : "") + '"></span>'; }).join("") + "</div>" +
    '<p class="eyebrow">Nyt sted · trin ' + step + " af 4</p><h2>" + esc(title) + "</h2>";
}
function wizStartHtml() {
  return '<div class="wizwrap"><div class="rback" data-wiz="close"></div><div class="helpmodal wiz" role="dialog" aria-modal="true">' + wizHead(1, "Har du billeder fra stedet?") +
    '<p class="hint">Med billeder kan guiden ofte selv finde stedet ud fra, hvor billedet er taget.</p>' +
    '<div class="wizbig"><button type="button" class="wizopt" id="new-photo">' + ICON_CAM + '<span><strong>Vælg billeder</strong><small>Fra telefonen eller computeren</small></span></button>' +
    '<button type="button" class="wizopt" id="new-manual">' + ICON_PIN + '<span><strong>Ingen billeder</strong><small>Jeg skriver navnet selv</small></span></button></div></div></div>';
}
function wizardHtml(f) {
  var step = f.wiz, body = "", foot = "";
  var choices = f.choices ? '<div class="choices">' + f.choices.map(function (x, i) { return '<button class="btn" type="button" data-choose="' + i + '"><strong>' + esc(x.name) + "</strong> " + esc([x.addr, x.km != null ? Math.round(x.km) + " km fra hotellet" : ""].filter(Boolean).join(" · ")) + "</button>"; }).join("") + "</div>" : "";
  if (step === 2) {
    var thumbs = f.items.length ? '<div class="qthumbs">' + f.items.map(function (it, i) { return '<div class="qthumb"><img src="' + esc(it.url || photoUrl(it.path, true)) + '" alt="">' + visBtn(it, i) + "</div>"; }).join("") + "</div>" : "";
    body = thumbs + (f.finding ? '<p class="finding" role="status"><span class="spin" aria-hidden="true"></span>Finder stedet ud fra billederne …</p>' : "") +
      (f.match && !f.finding ? '<div class="match"><p>Billederne er taget ' + (f.match.m < 15 ? "ved" : f.match.m + " m fra") + " <strong>" + esc(f.match.name) + "</strong>, som allerede er i guiden. Er det det sted?</p>" +
        '<button class="btn primary" type="button" id="add-to-match"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Ja – læg billederne dér") + '</button><p class="hint">Er det et andet sted, så fortsæt herunder.</p></div>' : "") +
      '<label>Stedets navn<input id="f-name" value="' + esc(f.name) + '" placeholder="Fx Restaurante El Puerto" autocomplete="off"></label>' +
      '<div class="wizrow"><button class="btn" type="button" id="find-map">' + ICON_PIN + " Find på kortet</button>" + (navigator.geolocation ? '<button class="btn" type="button" id="my-loc">Brug min placering</button>' : "") + "</div>" +
      (f.info ? '<p class="hint">' + esc(f.info) + "</p>" : "") + choices +
      (f.lat != null ? '<p class="wizfound">' + ICON_PIN + "<span>" + esc([f.town, distText(f)].filter(Boolean).join(" · ") || "Placering fundet") + "</span></p>" : "");
    foot = '<button type="button" class="btn" data-wiz="back">Tilbage</button><button type="button" class="btn primary" data-wiz="next">Næste</button>';
  } else if (step === 3) {
    body = '<div class="wizcats">' + CATS.filter(function (c) { return c[0] !== "vores" && c[0] !== "lejligheden"; }).map(function (c) {
      return '<button class="wizcat" type="button" data-setcat="' + c[0] + '" aria-pressed="' + (f.cat === c[0]) + '">' + (CAT_ICONS[c[0]] || "") + "<span>" + esc(c[1]) + "</span></button>"; }).join("") + "</div>" + subChooser(f);
    foot = '<button type="button" class="btn" data-wiz="back">Tilbage</button><button type="button" class="btn primary" data-wiz="next">Næste</button>';
  } else {
    body = '<p class="hint">Alt her kan springes over – I kan altid tilføje det senere.</p>' +
      '<label>Kommentar<textarea id="f-note" placeholder="' + esc(notePh(f.cat)) + '">' + esc(f.note || "") + "</textarea></label>" +
      questionsHtml(f) +
      '<button type="button" class="favtoggle' + (f.fav ? " on" : "") + '" id="f-favbtn" aria-pressed="' + !!f.fav + '">' + heartSvg(f.fav) + " Tilføj som favorit</button>" +
      (CRITERIA[f.cat] ? '<p class="hint">Stjerner giver I lige efter, at stedet er gemt.</p>' : "") +
      dupHtml(f);
    foot = '<button type="button" class="btn" data-wiz="back">Tilbage</button><button type="submit" class="btn primary"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem stedet") + "</button>";
  }
  return '<div class="wizwrap"><div class="rback"></div><form class="helpmodal wiz" id="editor" role="dialog" aria-modal="true">' + wizHead(step, WIZ_STEPS[step - 1]) + body +
    (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") + '<div class="row wizfoot">' + foot + "</div></form></div>";
}
function wizDoneHtml() {
  var w = ui.wizDone, p = places.filter(function (x) { return x.id === w.id; })[0];
  return '<div class="wizwrap"><div class="rback" data-wizdone="close"></div><div class="helpmodal wiz wizdone" role="dialog" aria-modal="true"><button type="button" class="hclose" data-wizdone="close" aria-label="Luk">×</button>' +
    '<div class="wicon" aria-hidden="true">' + (CAT_ICONS[w.cat] || CAT_ICONS.alle) + '</div><h2>' + esc(w.name) + ' er oprettet</h2><p class="hint">Hvad vil du nu?</p>' +
    '<div class="wizbig">' + (p && CRITERIA[p.cat] ? '<button type="button" class="wizopt" data-rateopen="place" data-key="' + esc(w.id) + '"><span class="wstar" aria-hidden="true">★</span><span><strong>Giv stjerner</strong><small>Hvad synes I om stedet?</small></span></button>' : "") +
    '<button type="button" class="wizopt" data-wizdone="see">' + ICON_PIN + '<span><strong>Se stedet</strong><small>Sådan ser det ud i guiden</small></span></button>' +
    '<button type="button" class="wizopt" data-wizdone="more">' + ICON_PEN + '<span><strong>Tilføj flere detaljer</strong><small>Hjemmeside, links, pris, hvem kan se det</small></span></button></div>' +
    '<div class="row wizfoot"><button type="button" class="btn" data-wizdone="close">Færdig</button></div></div></div>';
}
/* "Tilføj kommentar": kun et kommentarfelt */
function commentTarget() {
  var c = ui.commentFor; if (!c) return null;
  var o = c.kind === "place" ? places.filter(function (x) { return x.id === c.key; })[0] : c.kind === "town" ? towns[c.key] : regions[c.key];
  return o ? { o: o, name: c.kind === "place" ? o.name : c.key, note: (o.mine && o.mine.note) || "", cat: c.kind === "place" ? o.cat : "byer" } : null;
}
function commentHtml() {
  var t = commentTarget(); if (!t) return "";
  return '<div class="wizwrap"><div class="rback" data-cmt="close"></div><form class="helpmodal wiz" id="cmtform" role="dialog" aria-modal="true"><button type="button" class="hclose" data-cmt="close" aria-label="Luk">×</button>' +
    '<p class="eyebrow">' + esc(t.name) + "</p><h2>" + (t.note ? "Ret jeres kommentar" : "Tilføj kommentar") + "</h2>" +
    '<textarea id="c-note" rows="6" placeholder="' + esc(notePh(t.cat)) + '">' + esc(t.note) + "</textarea>" +
    (ui.commentErr ? '<p class="err" role="alert">' + esc(ui.commentErr) + "</p>" : "") +
    '<div class="row wizfoot"><button type="button" class="btn" data-cmt="close">Annuller</button><button type="submit" class="btn primary"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + "</button></div></form></div>";
}
async function saveComment() {
  var t = commentTarget(), c = ui.commentFor; if (!t) return;
  var note = (document.getElementById("c-note").value || "").trim();
  var vis = t.o.mine && t.o.mine.visibility ? t.o.mine.visibility : (c.kind === "place" && t.o.visibility && t.o.visibility !== "alle" ? "andel" : "alle");
  ui.busy = true; ui.commentErr = ""; render();
  var r = await saveExp(c.kind, c.key, { note: note || null, visibility: vis });
  ui.busy = false;
  if (r.error) { ui.commentErr = "Kommentaren blev ikke gemt: " + r.error.message; render(); return; }
  ui.commentFor = null; ui.msg = note ? "Kommentaren er gemt." : "Kommentaren er fjernet."; await load(); render();
}
function wizOverlays() { if (ui.commentFor) return commentHtml(); return ui.wizStart && !ui.draft ? wizStartHtml() : ui.wizDone && !ui.draft ? wizDoneHtml() : ""; }
function wizNav(dir) {
  syncDraft(); var d = ui.draft; d.err = "";
  if (dir === "close") { ui.draft = null; ui.wizStart = false; render(); return; }
  if (dir === "back") { if (d.wiz <= 2) { ui.draft = null; ui.wizStart = true; } else d.wiz--; render(); return; }
  if (d.wiz === 2) {
    if (d.finding) { d.err = "Vent et øjeblik – guiden leder efter stedet."; render(); return; }
    if (!d.name.trim()) { d.err = "Skriv stedets navn."; render(); var n = document.getElementById("f-name"); if (n) n.focus(); return; }
    if (d.lat == null && !d.noLoc) { d.noLoc = true; d.err = 'Stedet har ingen placering endnu. Tryk "Find på kortet" eller "Brug min placering" – eller tryk Næste igen for at fortsætte uden.'; render(); return; }
  }
  d.wiz++; render();
  var m = document.querySelector(".wiz"); if (m) m.scrollTop = 0;
}

/* ---------- hændelser ---------- */
document.addEventListener("click", async function (e) {
  if (!root.contains(e.target) && !panel.contains(e.target) && !tbEl.contains(e.target) && !topEl.contains(e.target)) return;
  var cv = e.target.closest("[data-cvis]"); if (cv) { e.preventDefault(); carouselVis(cv); return; }
  var hq = e.target.closest("[data-help]"); if (hq) { e.preventDefault(); e.stopPropagation(); openHelpTip(hq.dataset.help); return; }
  if (e.target.closest("#show-welcome")) { openWelcome(); return; }
  var sl = e.target.closest(".slide"), art = sl && sl.closest("article.place[data-pid]");
  if (art && !art.classList.contains("detailcard")) { openPlace(art.dataset.pid); return; }
  var t = e.target.closest("button"); if (!t) return;
  if (t.dataset.open) { openPlace(t.dataset.open); return; }
  if (t.hasAttribute("data-closeplace")) { closePlace(); return; }
  if (t.dataset.visit) {
    var vp = places.filter(function (x) { return x.id === t.dataset.visit; })[0]; if (!vp) return;
    var was = vp.visited, vr = await saveExp("place", vp.id, { visited: !was });
    if (!vr.error) visitCounts[vp.id] = Math.max(0, (visitCounts[vp.id] || 0) + (was ? -1 : 1));
    ui.msg = vr.error ? "Det blev ikke gemt. Prøv igen." : ""; decorate(); render(); return;
  }
  if (t.dataset.fav) {
    var fp = places.filter(function (x) { return x.id === t.dataset.fav; })[0]; if (!fp) return;
    var wasF = fp.fav, fr = await saveExp("place", fp.id, { favorite: !wasF });
    if (!fr.error) favCounts[fp.id] = Math.max(0, (favCounts[fp.id] || 0) + (wasF ? -1 : 1));
    ui.msg = fr.error ? "Det blev ikke gemt. Prøv igen." : ""; decorate(); render(); return;
  }
  if (t.dataset.town != null) { var tw = t.dataset.town; nav(function () { ui.place = null; ui.town = tw || null; ui.region = null; ui.sub = null; if (ui.town) { ui.cat = "byer"; ui.q = ""; } }); return; }
  if (t.dataset.region != null) { var rg = t.dataset.region; nav(function () { ui.place = null; ui.region = rg || null; ui.town = null; ui.sub = null; if (ui.region) ui.q = ""; if (ui.region && ui.cat !== "byer") ui.cat = "dagsture"; }); return; }
  if (t.dataset.fopen) { ui.fOpen = !ui.fOpen; render(); return; }
  if (t.dataset.fsun) { ui.fSun = !ui.fSun; render(); return; }
  if (t.dataset.fearly) { ui.fEarly = !ui.fEarly; render(); return; }
  if (t.dataset.flunch) { ui.fLunch = !ui.fLunch; render(); return; }
  if (t.dataset.subcat != null) { ui.subcat = t.dataset.subcat || null; render(); return; }
  if (t.dataset.filtertown != null) { ui.ftown = t.dataset.filtertown || null; render(); return; }
  if (t.dataset.sub != null) { ui.sub = t.dataset.sub || null; render(); return; }
  if (t.dataset.sort) { ui.sort = t.dataset.sort; render(); return; }
  if (t.dataset.view) { ui.view = t.dataset.view; render(); return; }
  if (t.dataset.scope) { ui.scope = t.dataset.scope; decorate(); render(); return; }
  if (t.dataset.cat) { var ct = t.dataset.cat; if (ct === ui.cat && !ui.town && !ui.region) return; nav(function () { ui.town = null; ui.region = null; ui.ftown = null; ui.subcat = null; ui.fOpen = false; ui.fSun = false; ui.fEarly = false; ui.fLunch = false; ui.sub = null; ui.cat = ct; }); return; }
  if (t.dataset.step || t.dataset.go) {
    var tr = t.closest("[data-car]").querySelector(".track"), n = tr.children.length;
    var cur = Math.round(tr.scrollLeft / tr.clientWidth);
    var to = t.dataset.go != null ? +t.dataset.go : (cur + (+t.dataset.step) + n) % n;
    tr.scrollTo({ left: to * tr.clientWidth, behavior: "smooth" }); return;
  }
  if (t.dataset.addphotos) { addInput.dataset.kind = ""; addInput.dataset.target = t.dataset.addphotos; addInput.value = ""; addInput.click(); return; }
  if (t.id === "add-to-match") { addPhotosTo(ui.draft.match.id, ui.draft.items.map(function (x) { return x.file; })); return; }
  if (t.id === "new") { ui.chooser = false; ui.wizDone = null; ui.wizStart = true; render(); return; }
  if (t.id === "new-photo") { ui.chooser = false; ui.wizFlow = !!ui.wizStart; newInput.value = ""; newInput.click(); return; }
  if (t.id === "new-manual") { ui.chooser = false; ui.wizFlow = !!ui.wizStart; startManual(); return; }
  if (t.dataset.wiz) { if (t.dataset.wiz === "close" && !ui.draft) { ui.wizStart = false; render(); return; } wizNav(t.dataset.wiz); return; }
  if (t.dataset.wizdone) { var wd = ui.wizDone; ui.wizDone = null; if (t.dataset.wizdone === "see") openPlace(wd.id); else if (t.dataset.wizdone === "more") { openPlace(wd.id); editPlace(wd.id); ui.draft.adv = true; render(); scrollToForm(); } else render(); return; }
  if (t.id === "new-apt") {
    startManual(); var ad = ui.draft; if (!ad) return;
    ad.cat = "vores"; ad.vis = "lejlighed"; ad.expVis = "andel"; ad.lat = CFG.hotel.lat; ad.lon = CFG.hotel.lon; ad.town = "Bolnuevo";
    ad.info = 'Giv det et navn, fx "Altanen" eller "Sådan virker aircon". Alle andele i lejligheden kan se det. Dørkoder og wifi skal ikke skrives her.';
    render(); scrollToForm(); return;
  }
  if (t.id === "find-map") { syncDraft(); findOnMap(); return; }
  if (t.dataset.choose != null && ui.draft && ui.draft.choices) { syncDraft(); applyChoice(ui.draft, ui.draft.choices[+t.dataset.choose]); return; }
  if (t.dataset.comment) { ui.commentFor = { kind: t.dataset.comment, key: t.dataset.key }; ui.commentErr = ""; render(); var cn = document.getElementById("c-note"); if (cn) { cn.focus(); cn.setSelectionRange(cn.value.length, cn.value.length); } return; }
  if (t.dataset.cmt === "close") { ui.commentFor = null; render(); return; }
  if (t.dataset.edit) { editPlace(t.dataset.edit); ui.draft.adv = false; render(); scrollToForm(); return; }
  if (t.dataset.editarea) { ui.draft = null; startAreaEdit(t.dataset.editarea, t.dataset.key); return; }
  if (t.dataset.addarea) { addInput.dataset.kind = t.dataset.addarea; addInput.dataset.target = t.dataset.key; addInput.value = ""; addInput.click(); return; }
  if (t.dataset.afirst) { syncArea(); var ai = ui.areaDraft.items.splice(+t.dataset.afirst, 1)[0]; ui.areaDraft.items.unshift(ai); render(); return; }
  if (t.dataset.arm) { syncArea(); var ag = ui.areaDraft.items.splice(+t.dataset.arm, 1)[0]; if (ag.path) ui.areaDraft.removed.push(ag.path); render(); return; }
  if (t.id === "a-cancel") { ui.areaDraft = null; render(); return; }
  if (t.id === "a-adv-toggle") { syncArea(); ui.areaDraft.adv = !ui.areaDraft.adv; render(); return; }
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
  if (t.dataset.rmnum) { rmAndelNum(t.dataset.rmnum); return; }
  if (t.dataset.adminvite) { adminInvite(t.dataset.adminvite); return; }
  if (t.dataset.resetk != null) { ui.resetK = t.dataset.resetk || null; ui.resetMsg = ""; ui.confirmStart = null; rerenderAdmin(); return; }
  if (t.dataset.rpw) { adminResetPw(t.dataset.rpw); return; }
  if (t.dataset.edrm) { rmEditor(t.dataset.edrm); return; }
  if (t.dataset.ndel) { if (ui.nDelConfirm !== t.dataset.ndel) { ui.nDelConfirm = t.dataset.ndel; rerenderAdmin(); return; } delNotice(t.dataset.ndel); return; }
  if (t.dataset.akdel) { if (ui.akDelConfirm !== t.dataset.akdel) { ui.akDelConfirm = t.dataset.akdel; ui.akConfirm = null; render(); return; } aktDelete(t.dataset.akdel); return; }
  if (t.dataset.bknew) {
    var sd = ui.akDay && ui.akDay >= dayKey(new Date()) ? ui.akDay : dayKey(new Date());
    ui.bkForm = true; ui.bkDate = sd; ui.bkSel = []; ui.bkErr = ""; ui.msg = "";
    ui.bkFrom = sd === dayKey(new Date()) ? Math.min(BK_H1 - 1, Math.max(BK_H0, new Date().getHours() + 1)) : 10; ui.bkTo = Math.min(BK_H1, ui.bkFrom + 3);
    render(); window.scrollTo({ top: 0 }); return;
  }
  if (t.dataset.bkpick != null) { ui.bkPick = t.dataset.bkpick || null; ui.bkDelConfirm = null; render(); if (ui.bkPick) { var pe = document.querySelector(".bkpick"); if (pe) pe.scrollIntoView({ block: "center", behavior: "smooth" }); } return; }
  if (t.dataset.sbnew) { sbOpen(); return; }
  if (t.dataset.sbw) { sbNav(t.dataset.sbw); return; }
  if (t.dataset.sbkind) { ui.sb.kind = t.dataset.sbkind; ui.sb.err = ""; render(); return; }
  if (t.dataset.sbarea) { ui.sb.area = t.dataset.sbarea; ui.sb.err = ""; render(); return; }
  if (t.dataset.sbprio) { ui.sb.prio = t.dataset.sbprio; ui.sb.err = ""; render(); return; }
  if (t.dataset.sbpic) { (t.dataset.sbpic === "cam" ? sbCam : sbPick).click(); return; }
  if (t.dataset.sbrm != null) { var rf = ui.sb.files.splice(+t.dataset.sbrm, 1)[0]; if (rf) try { URL.revokeObjectURL(rf.url); } catch (x) {} render(); return; }
  if (t.dataset.sbf) { ui.sbFilter = t.dataset.sbf; render(); return; }
  if (t.dataset.sbdel) { if (ui.sbDelConfirm === t.dataset.sbdel) sbDelete(t.dataset.sbdel); else { ui.sbDelConfirm = t.dataset.sbdel; render(); } return; }
  if (t.dataset.akpick != null) { ui.akPick = t.dataset.akpick || null; ui.akDelConfirm = null; ui.akConfirm = null; render(); if (ui.akPick) { var pe = document.querySelector(".akpick"); if (pe) pe.scrollIntoView({ block: "center", behavior: "smooth" }); } return; }
  if (t.dataset.bkclose) { ui.bkForm = false; ui.bkErr = ""; render(); return; }
  if (t.dataset.bksel) { var bi = (ui.bkSel || []).indexOf(t.dataset.bksel); if (bi >= 0) ui.bkSel.splice(bi, 1); else ui.bkSel.push(t.dataset.bksel); ui.bkErr = ""; render(); return; }
  if (t.dataset.bkdel) { if (ui.bkDelConfirm !== t.dataset.bkdel) { ui.bkDelConfirm = t.dataset.bkdel; render(); return; } bkDelete(t.dataset.bkdel); return; }
  if (t.dataset.akwk) { akGoWeek(parseInt(t.dataset.akwk, 10)); return; }
  if (t.dataset.akday) { ui.akDay = t.dataset.akday; render(); return; }
  if (t.dataset.aknew) { ui.akForm = true; ui.akEdit = null; ui.aktErr = ""; ui.msg = ""; render(); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.akedit) { ui.akForm = true; ui.akEdit = t.dataset.akedit; ui.aktErr = ""; ui.msg = ""; render(); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.akclose) { ui.akForm = false; ui.akEdit = null; ui.aktErr = ""; render(); return; }
  if (t.dataset.akon) { aktSignup(t.dataset.akon, true); return; }
  if (t.dataset.akoff) { aktSignup(t.dataset.akoff, false); return; }
  if (t.dataset.akcancel) { if (ui.akConfirm !== t.dataset.akcancel) { ui.akConfirm = t.dataset.akcancel; render(); return; } aktCancel(t.dataset.akcancel); return; }
  if (t.dataset.menu) {
    var mk = t.dataset.menu; ui.msg = ""; if (mk === "akt") { aktData = null; ui.akForm = false; ui.akWeek = 0; ui.akDay = null; } if (mk === "udstyr") { bkData = null; ui.bkForm = false; ui.bkErr = ""; ui.akWeek = 0; ui.akDay = null; }
    leaveDraft(function () {
      if (mk === "menu") { nav(function () { ui.menu = true; ui.page = null; ui.place = null; ui.cat = "hjem"; ui.q = ""; }); return; }
      nav(function () { ui.menu = false; ui.place = null; ui.cat = "hjem"; ui.page = mk === "guide" ? null : mk; });
    });
    return;
  }
  if (t.id === "screen-hide") { ui.screenHide = true; render(); return; }
  if (t.id === "inapp-hide") { ui.inAppHide = true; render(); return; }
  if (t.dataset.rstart) { if (ui.confirmStart !== t.dataset.rstart) { ui.confirmStart = t.dataset.rstart; rerenderAdmin(); return; } adminStartOver(t.dataset.rstart); return; }
  if (t.dataset.editk != null) { ui.editK = t.dataset.editk || null; ui.editKInv = !!t.dataset.andinv; var q0 = (document.getElementById("adm-q") || {}).value || ""; render(); var qi0 = document.getElementById("adm-q"); if (qi0) { qi0.value = q0; filterAdmList(); } return; }
  if (t.dataset.legend) { ui.mapFocus = ui.mapFocus === t.dataset.legend ? null : t.dataset.legend; applyMapFocus(); return; }
  if (t.dataset.fold) { ui.fold = ui.fold || {}; ui.fold[t.dataset.fold] = !ui.fold[t.dataset.fold]; render(); return; }
  if (t.dataset.since) { if (t.dataset.since === "open") openSince(); else { ui.sinceOpen = false; ui.since = []; render(); } return; }
  if (t.dataset.admf) { ui.admF = t.dataset.admf; document.querySelectorAll("[data-admf]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.admf === ui.admF)); }); filterAdmList(); return; }
  if (t.dataset.switchandel) { try { localStorage.setItem("bol_andel_" + ui.user.id, t.dataset.switchandel); } catch (x) {} location.reload(); return; }
  if (t.dataset.reinvite) { ui.inviteText = t.dataset.rrole === "ejer" ? inviteMsg(t.dataset.rname || "", t.dataset.reinvite, myAndelTxt()) : inviteMsg(t.dataset.rname || "", t.dataset.reinvite, "", myLendTxt()); ui.inviteTo = t.dataset.reinvite; ui.inviteName = t.dataset.rname || ""; openInvite(); return; }
  if (t.id === "copy-invite") { var ta = document.getElementById("invite-copy"); ta.select(); try { navigator.clipboard.writeText(ta.value); t.textContent = "Kopieret"; } catch (x) { document.execCommand("copy"); } return; }
  if (t.id === "recheck") { await checkUser(); if (ui.member) { ui.loaded = false; await load(); } else { ui.msg = "Der er stadig ingen invitation til " + ui.user.email + "."; render(); } return; }
  if (t.dataset.vis != null && ui.draft) { syncDraft(); var vi = ui.draft.items[+t.dataset.vis]; if (!vi.file && !canSetVis(vi.own)) return; vi.vis = nextVis(vi.vis || "andel", vi.own); vi.visSet = true; render(); return; }
  if (t.dataset.avis != null && ui.areaDraft) { syncArea(); var va = ui.areaDraft.items[+t.dataset.avis]; va.vis = nextVis(va.vis || "andel", va.own); va.visSet = true; render(); return; }
  if (t.dataset.first) { syncDraft(); var it = ui.draft.items.splice(+t.dataset.first, 1)[0]; ui.draft.items.unshift(it); render(); return; }
  if (t.dataset.rm) { syncDraft(); var gone = ui.draft.items.splice(+t.dataset.rm, 1)[0]; if (gone.path) ui.draft.removed.push(gone.path); render(); return; }
  if (t.dataset.rateopen) { openRating(t.dataset.rateopen, t.dataset.key); return; }
  if (t.dataset.minrating != null) { ui.minRating = +t.dataset.minrating; render(); return; }
  if (t.dataset.setcat) { syncDraft(); if (ui.draft.cat !== t.dataset.setcat) ui.draft.subcat = ""; ui.draft.cat = t.dataset.setcat; render(); return; }
  if (t.dataset.q) { syncDraft(); ui.draft.facts = ui.draft.facts || {}; ui.draft.facts[t.dataset.q] = t.dataset.qv; render(); return; }
  if (t.dataset.setsub) { syncDraft(); ui.draft.subcat = ui.draft.subcat === t.dataset.setsub ? "" : t.dataset.setsub; render(); return; }
  if (t.dataset.setstatus) { syncDraft(); ui.draft.status = t.dataset.setstatus; render(); return; }
  if (t.id === "more") { syncDraft(); ui.draft.more = true; render(); return; }
  if (t.dataset.report) { openReport(t.dataset.report, t.dataset.ref, t.dataset.pk, t.dataset.pt); return; }
  if (t.dataset.repdel) { handleReport(t.dataset.repdel, true); return; }
  if (t.dataset.repok) { handleReport(t.dataset.repok, false); return; }
  if (t.id === "del-account") {
    if (!ui.confirmDelAcc) { ui.confirmDelAcc = true; ui.delAccErr = ""; render(); return; }
    ui.busy = true; render();
    var da = await sb.rpc("delete_my_account"); ui.busy = false; ui.confirmDelAcc = false;
    if (da.error) { ui.delAccErr = da.error.message; render(); return; }
    await sb.auth.signOut(); ui.user = null; ui.editor = false; ui.member = false; me = null; ui.draft = null; ui.page = null; places = []; raw = { places: [], towns: [], regions: [], exps: [], photos: [] };
    ui.msg = "Din konto er slettet. Tak for din tid i guiden."; render(); return;
  }
  if (t.dataset.usedup) { useExisting(t.dataset.usedup); return; }
  if (t.id === "dup-new") { syncDraft(); ui.draft.dupOk = true; ui.draft.dups = null; saveDraft(); return; }
  if (t.dataset.mergedup) { var mk = t.dataset.mergedup.split("|"); mergeInto(mk[0], mk[1]); return; }
  if (t.dataset.opendup) { openPlace(t.dataset.opendup); return; }
  if (t.dataset.keepdup) { var kd = dupDismissed(); kd[t.dataset.keepdup] = 1; try { localStorage.setItem("bol-dupok", JSON.stringify(kd)); } catch (x) {} render(); return; }
  if (t.id === "f-favbtn") { syncDraft(); ui.draft.fav = !ui.draft.fav; render(); return; }
  if (t.id === "adv-toggle") { syncDraft(); ui.draft.adv = !ui.draft.adv; render(); return; }
  if (t.id === "my-loc") { syncDraft(); useMyLocation(); return; }
  if (t.id === "cancel") { ui.draft = null; render(); return; }
  if (t.id === "del-place") { deletePlace(); return; }
  if (t.id === "open-login") { ui.login = { mode: "login" }; render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (t.id === "close-login") { ui.login = null; render(); return; }
  if (t.id === "to-signup") { ui.login.mode = "signup"; ui.login.err = ""; render(); return; }
  if (t.id === "to-login") { ui.login.mode = "login"; ui.login.err = ""; ui.login.info = ""; render(); return; }
  if (t.id === "to-reset") { var le = document.getElementById("l-email"); if (le) ui.login.email = le.value.trim(); ui.login.mode = "reset"; ui.login.err = ""; ui.login.info = ""; render(); return; }
  if (t.id === "open-import") { if (BOL.openImport) BOL.openImport(); return; }
  if (t.id === "logout") { await sb.auth.signOut(); ui.user = null; ui.editor = false; ui.member = false; me = null; ui.draft = null; ui.page = null; places = []; raw = { places: [], towns: [], regions: [], exps: [], photos: [] }; render(); return; }
});
root.addEventListener("input", function (e) { if (e.target.id === "adm-q") filterAdmList(); });
root.addEventListener("change", function (e) {
  if (e.target.dataset && e.target.dataset.notify) saveNotify(e.target);
  if (e.target.dataset && e.target.dataset.bkt === "date") { if (e.target.value) ui.bkDate = e.target.value; ui.bkErr = ""; render(); return; }
  if (e.target.dataset && e.target.dataset.bkt) { var v = parseInt(e.target.value, 10); if (e.target.dataset.bkt === "from") { ui.bkFrom = v; if (ui.bkTo <= v) ui.bkTo = Math.min(BK_H1, v + 1); } else ui.bkTo = v; ui.bkErr = ""; render(); }
});
root.addEventListener("submit", function (e) {
  if (e.target.dataset && e.target.dataset.kform) { e.preventDefault(); saveContact(e.target); return; }
  if (e.target.dataset && e.target.dataset.kmail) { e.preventDefault(); adminChangeMail(e.target); return; }
  e.preventDefault();
  if (e.target.id === "akt-form") { saveAkt(e.target); return; }
  if (e.target.id === "bk-form") { if ((ui.bkSel || []).length) bkBook(); return; }
  if (e.target.id === "notice-form") { saveNotice(e.target); return; }
  if (e.target.id === "editor-form") { addEditor(e.target); return; }
  if (e.target.id === "editor") saveDraft();
  if (e.target.id === "cmtform") saveComment();
  if (e.target.id === "addnum-form") addAndelNum();
  if (e.target.id === "login-form") submitLogin();
  if (e.target.id === "area-editor") saveArea();
  if (e.target.id === "invite-form") invite();
  if (e.target.id === "newandel-form") createAndel();
});
root.addEventListener("change", function (e) {
  if (e.target.id === "a-region") { syncArea(); render(); return; }
  if (e.target.id === "f-cat") { syncDraft(); render(); return; }
  if (e.target.id === "f-vis") { syncDraft(); render(); return; }
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
  if (sel.dataset.select === "subcat") ui.subcat = sel.value || null;
  if (sel.dataset.select === "ftown") ui.ftown = sel.value || null;
  if (sel.dataset.select === "sub") ui.sub = sel.value || null;
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
var APP_VERSION = 223;
async function checkForUpdate() {
  try {
    var r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    var j = await r.json();
    if (j && j.v > APP_VERSION && !ui.draft && !ui.busy && !(window.BOL && window.BOL.importing)) { var qs = location.search.replace(/^\?/, "").split("&").filter(function (x) { return x && !/^v=/.test(x); }); qs.push("v=" + j.v); location.replace(location.pathname + "?" + qs.join("&") + location.hash); }   // behold fx menu=test og fra=skaerm
  } catch (e) { /* ingen forbindelse; prøv igen næste gang */ }
}
/* Åbnes appen igen efter mere end 30 minutter, starter den forfra på "Alle" som liste */
var hiddenAt = 0;
function resetToStart(toMenu) {
  if (ui.draft || ui.areaDraft || ui.busy || (window.BOL && window.BOL.importing)) return;
  ui.cat = "hjem"; ui.view = "liste"; ui.town = null; ui.region = null; ui.ftown = null; ui.subcat = null; ui.sub = null; ui.place = null;
  ui.fOpen = ui.fSun = ui.fEarly = ui.fLunch = false; ui.minRating = 0; ui.q = ""; ui.msg = ""; ui.page = null; navStack = []; ui.menu = !!toMenu && TEST_MENU;
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  render(); window.scrollTo({ top: 0 });
}
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
  if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000) resetToStart(true);
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
sb.auth.onAuthStateChange(function (ev) {
  if (ev === "SIGNED_OUT") { ui.user = null; ui.editor = false; }
  if (ev === "PASSWORD_RECOVERY") { ui.recovery = true; ui.page = null; ui.login = { mode: "newpw" }; setTimeout(render, 0); }
});
if (/type=recovery/.test(location.hash)) ui.recovery = true;
render();
checkUser().then(load);
/* Hjælpeboks og velkomst ligger uden for siden – egne lyttere */
document.addEventListener("click", function (e) {
  if (helpBox && !helpBox.hidden && helpBox.contains(e.target)) {
    if (e.target.closest("[data-helpclose]")) { closeHelpTip(); return; }
    var m = e.target.closest("[data-helpmore]");
    if (m) { var sec = m.dataset.helpmore; closeHelpTip(); nav(function () { ui.page = "hjaelp"; }); setTimeout(function () { var h = document.getElementById("hjaelp-" + sec); if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 12, behavior: "smooth" }); }, 60); }
    return;
  }
  if (inviteBox && !inviteBox.hidden && inviteBox.contains(e.target)) {
    if (e.target.closest("[data-invclose]")) { closeInvite(); return; }
    var note = document.getElementById("inv-note");
    if (e.target.closest("#copy-invite")) { copyInvite().then(function (ok) { if (note) note.textContent = ok ? "Beskeden er kopieret – sæt den ind, hvor du vil sende den." : "Kunne ikke kopiere. Tryk på \"Se beskeden\" og kopiér teksten selv."; }); return; }
    if (e.target.closest("[data-sendmsg]")) {
      // Messenger kan ikke få tekst med i et link: brug telefonens del-menu, ellers kopiér teksten og åbn Messenger
      // Telefon: del-menuen (hvor Messenger findes). Computer: kopiér teksten og åbn Messenger i en ny fane
      var phone = window.matchMedia && matchMedia("(pointer: coarse)").matches;
      if (phone && navigator.share) { navigator.share({ text: ui.inviteText }).catch(function () {}); if (note) note.textContent = "Vælg Messenger i menuen, der kommer frem."; }
      else { window.open("https://www.messenger.com/", "_blank", "noopener"); copyInvite().then(function (ok) { if (note) note.textContent = ok ? "Beskeden er kopieret. Messenger er åbnet i en ny fane – vælg personen, og sæt teksten ind (Ctrl+V)." : "Messenger er åbnet i en ny fane. Kopiér beskeden under \"Se beskeden\" og sæt den ind."; }); }
    }
    return;
  }
  if (welcomeBox && !welcomeBox.hidden && welcomeBox.contains(e.target)) {
    if (e.target.closest("[data-wskip]")) { closeWelcome(); return; }
    if (e.target.closest("[data-wnext]")) { if (welcomeStep < WELCOME.length - 1) { welcomeStep++; drawWelcome(); } else closeWelcome(); }
  }
});
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  if (helpBox && !helpBox.hidden) closeHelpTip(); else if (inviteBox && !inviteBox.hidden) closeInvite(); else if (welcomeBox && !welcomeBox.hidden) closeWelcome();
});
})();
