(function () {
"use strict";

var CFG = window.BOLNUEVO;
var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });

var CATS = [["spisesteder","Spisesteder"],["strande","Strande"],["ture","Ture i nærområdet"],["dagsture","Dagsture"],["oplevelser","Oplevelser"],["shopping","Shopping"]];
var CATNAME = {}; CATS.forEach(function (c) { CATNAME[c[0]] = c[1]; });
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
var ui = { cat: "alle", status: "tried", editor: false, user: null, draft: null, login: null, msg: "", busy: false, loaded: false };
var h = (location.hash || "").slice(1); if (CATNAME[h]) ui.cat = h;
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
function distText(p) { var d = km(p.lat, p.lon); if (d == null) return ""; if (d < 1) return "gåafstand fra hotellet"; return Math.round(d) + " km fra hotellet"; }
function visitsText(v) { if (!v || !v.length) return ""; return "Besøgt " + v.map(function (m) { return MONTHS[parseInt(m.slice(5, 7), 10) - 1] + " " + m.slice(0, 4); }).join(", "); }
function mapsUrl(p) {
  var q = (p.cat === "spisesteder" || p.cat === "shopping" || p.lat == null) ? (p.name + ", " + (p.area || "Mazarrón")) : (p.lat + "," + p.lon);
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}
function stars(r) { var s = ""; for (var i = 1; i <= 5; i++) s += i <= r ? "★" : "☆"; return s; }
function photoUrl(path) { return /^img\//.test(path) ? path : CFG.supabaseUrl + "/storage/v1/object/public/photos/" + encodeURI(path); }
function monthOf(d) { if (!d) return null; var t = d instanceof Date ? d : new Date(d); if (isNaN(t)) return null; return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0"); }
function uid() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ---------- data ---------- */
async function load() {
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
  if (!ph.length) return "";
  var html = '<div class="car" data-car>';
  html += '<div class="track">' + ph.map(function (x, i) {
    var u = esc(photoUrl(x));
    return '<div class="slide" style="--src:url(&quot;' + u + '&quot;)"><img src="' + u + '" alt="' + esc(p.name) + (ph.length > 1 ? ", billede " + (i + 1) : "") + '" loading="lazy"></div>';
  }).join("") + "</div>";
  if (ph.length > 1) {
    html += '<span class="count">1/' + ph.length + '</span><button class="arrow prev" type="button" data-step="-1" aria-label="Forrige billede">‹</button><button class="arrow next" type="button" data-step="1" aria-label="Næste billede">›</button>';
    html += '<div class="dots">' + ph.map(function (x, i) { return '<button class="dot' + (i === 0 ? " on" : "") + '" type="button" data-go="' + i + '" aria-label="Billede ' + (i + 1) + '"></button>'; }).join("") + "</div>";
  }
  return html + "</div>";
}

function render() {
  var byStatus = places.filter(function (p) { return p.status === ui.status; });
  var counts = { alle: byStatus.length };
  CATS.forEach(function (c) { counts[c[0]] = byStatus.filter(function (p) { return p.cat === c[0]; }).length; });
  var list = byStatus.filter(function (p) { return ui.cat === "alle" || p.cat === ui.cat; })
    .sort(function (a, b) { return (km(a.lat, a.lon) || 0) - (km(b.lat, b.lon) || 0); });
  var tried = places.filter(function (p) { return p.status === "tried"; }).length, wish = places.length - tried;

  var html = '<header><div><p class="eyebrow">Laderita de Bolnuevo · Costa Cálida</p><h1>Vores Bolnuevo</h1><p class="lead">Steder vi selv har været, og steder vi gerne vil prøve. Til familie og venner, der låner lejligheden.</p></div>';
  if (ui.editor) html += '<button class="btn primary" type="button" id="new">+ Nyt sted</button>';
  html += "</header>";
  if (ui.editor) html += '<p class="hint" style="margin-top:8px">Tip: Tryk "+ Nyt sted" og vælg et billede. Så finder siden selv navn, type og placering.</p>';
  if (ui.msg) html += '<p class="notice" role="status">' + esc(ui.msg) + "</p>";
  if (ui.login) html += loginHtml();
  if (ui.draft) html += formHtml(ui.draft);

  html += '<div class="bar"><div class="seg" role="group" aria-label="Vis"><button type="button" data-status="tried" aria-pressed="' + (ui.status === "tried") + '">Vi har prøvet (' + tried + ')</button><button type="button" data-status="wish" aria-pressed="' + (ui.status === "wish") + '">Vil gerne prøve (' + wish + ")</button></div>";
  html += '<div class="chips" role="group" aria-label="Kategori"><button class="chip" type="button" data-cat="alle" aria-pressed="' + (ui.cat === "alle") + '">Alle<span class="n">' + counts.alle + "</span></button>";
  CATS.forEach(function (c) { html += '<button class="chip" type="button" data-cat="' + c[0] + '" aria-pressed="' + (ui.cat === c[0]) + '">' + c[1] + '<span class="n">' + counts[c[0]] + "</span></button>"; });
  html += "</div></div>";

  html += '<div class="list">';
  if (!ui.loaded) html += '<p class="empty-state">Henter steder…</p>';
  else if (!list.length) html += '<p class="empty-state">' + (ui.status === "wish" ? "Ingen ønsker her endnu." : "Intet her endnu.") + (ui.editor ? ' Tryk "+ Nyt sted" for at tilføje et.' : "") + "</p>";
  list.forEach(function (p) {
    html += '<article class="place" id="' + esc(p.id) + '">' + carousel(p);
    html += '<div class="place-top"><h3>' + esc(p.name) + "</h3>" + (p.rating ? '<span class="rating" aria-label="' + p.rating + ' ud af 5">' + stars(p.rating) + "</span>" : "") + "</div>";
    var meta = [p.area, distText(p), p.price].filter(Boolean).join(" · ");
    if (meta) html += '<p class="meta">' + esc(meta) + "</p>";
    html += p.note ? '<p class="note">' + esc(p.note) + "</p>" : '<p class="note empty">Mangler vores beskrivelse.</p>';
    html += '<div class="tags">';
    if (ui.cat === "alle") html += '<span class="tag cat">' + esc(CATNAME[p.cat] || p.cat) + "</span>";
    if (p.visits && p.visits.length) html += '<span class="tag">' + esc(visitsText(p.visits)) + "</span>";
    if (p.guess) html += '<span class="tag guess">Navnet er gættet ud fra billeder</span>';
    html += "</div>";
    html += '<div class="row"><a class="maps" href="' + esc(mapsUrl(p)) + '" target="_blank" rel="noopener">Åbn i Google Maps</a>';
    if (ui.editor) {
      html += '<button class="btn small" type="button" data-edit="' + esc(p.id) + '">Ret</button>';
      if (p.status === "wish") html += '<button class="btn small" type="button" data-move="' + esc(p.id) + '">Flyt til "Vi har prøvet"</button>';
    }
    html += "</div></article>";
  });
  html += "</div>";

  html += '<section class="practical"><p class="eyebrow">Det praktiske, kort</p><h2>Når I bor i lejligheden</h2><dl>';
  PRACTICAL.forEach(function (r) { html += "<dt>" + esc(r.k) + "</dt><dd>" + esc(r.v) + (r.link ? ' <a href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc(r.linkText) + "</a>" : "") + "</dd>"; });
  html += "</dl></section>";
  html += "<footer><span>Afstande er i luftlinje fra hotellet.</span>";
  if (ui.user) html += "<span>Logget ind som " + esc(ui.user.email) + '. <button class="linkbtn" type="button" id="logout">Log ud</button></span>';
  else html += '<span><button class="linkbtn" type="button" id="open-login">Log ind for at rette</button></span>';
  html += "</footer>";
  root.innerHTML = html;
  wireCarousels();
}

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
  var info = { lat: null, lon: null, month: null };
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
        if (data) info.month = monthOf(data.DateTimeOriginal || data.CreateDate);
      }
    } catch (e) { /* billedet har ingen dato */ }
    if (info.lat != null && info.month) break;
  }
  if (!info.month && files[0] && files[0].lastModified) info.month = monthOf(new Date(files[0].lastModified));
  return info;
}

var FOOD = ["restaurant","cafe","bar","pub","fast_food","ice_cream","biergarten","food_court"];
var FUN = ["spa","water_park","marina","sports_centre","golf_course","theme_park","zoo","aquarium","public_bath","dive_centre","boat_rental","horse_riding","swimming_pool"];
async function lookupPlace(lat, lon) {
  var base = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&lat=" + lat + "&lon=" + lon;
  var out = { name: "", cat: null, area: "" };
  try {
    var poi = await (await fetch(base + "&zoom=18&layer=poi")).json();
    var near = poi && poi.lat && km(lat, lon) != null ? distM(lat, lon, +poi.lat, +poi.lon) : 99999;
    if (poi && poi.name && near < 150) {
      out.name = poi.name;
      var c = poi.category, t = poi.type;
      if (c === "amenity" && FOOD.indexOf(t) >= 0) out.cat = "spisesteder";
      else if ((c === "natural" && t === "beach") || t === "beach_resort") out.cat = "strande";
      else if (c === "shop" || t === "marketplace" || t === "mall") out.cat = "shopping";
      else if (FUN.indexOf(t) >= 0) out.cat = "oplevelser";
    }
    var where = poi && poi.address ? poi.address : null;
    if (!where || !(where.village || where.town || where.city)) {
      var pl = await (await fetch(base + "&zoom=14")).json();
      where = pl && pl.address;
    }
    if (where) out.area = where.village || where.town || where.city || where.suburb || "";
  } catch (e) { /* ingen forbindelse til kortopslag */ }
  if (!out.cat) out.cat = (km(lat, lon) || 0) > 25 ? "dagsture" : "ture";
  return out;
}
function distM(a, b, c, d) { var r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.sqrt(x * x + y * y) * 6371000; }

async function startNew(files) {
  ui.msg = "";
  ui.draft = { isNew: true, id: uid(), cat: ui.cat === "alle" ? "spisesteder" : ui.cat, status: ui.status, name: "", area: "", note: "", rating: null, price: "", visits: [], guess: false, lat: null, lon: null,
    items: files.map(function (f) { return { file: f, url: URL.createObjectURL(f) }; }), removed: [], finding: true, info: "" };
  render(); scrollToForm();
  var info = await readPhotoInfo(files);
  var d = ui.draft; if (!d) return;
  if (info.month) d.visits = [info.month];
  if (info.lat != null) {
    d.lat = +info.lat.toFixed(5); d.lon = +info.lon.toFixed(5);
    var found = await lookupPlace(d.lat, d.lon);
    if (ui.draft !== d) return;
    d.name = found.name; d.area = found.area; d.cat = found.cat;
    d.info = found.name ? "Navn, type og placering er fundet ud fra billedet. Ret dem, hvis de ikke passer." : "Placeringen er fundet ud fra billedet, men stedet har intet navn på kortet. Skriv navnet selv.";
  } else {
    d.info = 'Billedet har ingen placering gemt. Står du på stedet nu, kan du trykke "Brug min placering".';
  }
  d.finding = false;
  render(); scrollToForm();
}

function useMyLocation() {
  var d = ui.draft; if (!d) return;
  if (!navigator.geolocation) { d.info = "Telefonen kan ikke give placeringen her."; render(); return; }
  d.info = "Finder din placering…"; render();
  navigator.geolocation.getCurrentPosition(async function (pos) {
    d.lat = +pos.coords.latitude.toFixed(5); d.lon = +pos.coords.longitude.toFixed(5);
    var found = await lookupPlace(d.lat, d.lon);
    if (ui.draft !== d) return;
    if (!d.name) d.name = found.name; d.area = d.area || found.area; d.cat = found.cat;
    d.info = found.name ? "Fundet ud fra din placering. Ret, hvis det ikke passer." : "Placeringen er gemt. Skriv navnet selv.";
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
    '<div class="grid"><label>Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Restaurante La Siesta"></label><label>Område eller by<input id="f-area" value="' + esc(f.area) + '" placeholder="Puerto de Mazarrón"></label></div>' +
    '<div class="grid"><label>Kategori<select id="f-cat">' + opts + '</select></label><label>Liste<select id="f-status"><option value="tried"' + (f.status === "tried" ? " selected" : "") + '>Vi har prøvet</option><option value="wish"' + (f.status === "wish" ? " selected" : "") + ">Vil gerne prøve</option></select></label><label>Karakter<select id=\"f-rating\">" + r + '</select></label><label>Pris<select id="f-price">' + pr + "</select></label></div>" +
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
function quickHtml(f) {
  var thumbs = f.items.map(function (it) { return '<img src="' + esc(it.url || photoUrl(it.path)) + '" alt="" style="width:88px;height:88px;object-fit:cover;border-radius:8px;flex:0 0 auto">'; }).join("");
  var dist = f.lat != null ? distText(f) : "";
  var chips = CATS.map(function (c) { return '<button class="chip" type="button" data-setcat="' + c[0] + '" aria-pressed="' + (f.cat === c[0]) + '">' + c[1] + "</button>"; }).join("");
  return '<form class="panel" id="editor"><h2>Nyt sted</h2>' +
    '<div style="display:flex;gap:8px;overflow-x:auto">' + thumbs + "</div>" +
    (f.finding ? '<p class="hint">Finder stedet ud fra billedet…</p>' :
      '<label>Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Skriv stedets navn"></label>' +
      '<p class="meta">' + esc([f.area, dist].filter(Boolean).join(" · ") || "Ingen placering fundet") + "</p>" +
      (f.info ? '<p class="hint">' + esc(f.info) + "</p>" : "") +
      (f.lat == null ? '<div><button class="btn" type="button" id="my-loc">Brug min placering</button></div>' : "") +
      '<div class="chips" role="group" aria-label="Kategori">' + chips + "</div>" +
      '<div class="seg" role="group" aria-label="Liste"><button type="button" data-setstatus="tried" aria-pressed="' + (f.status === "tried") + '">Vi har prøvet</button><button type="button" data-setstatus="wish" aria-pressed="' + (f.status === "wish") + '">Vil gerne prøve</button></div>') +
    (f.err ? '<p class="err" role="alert">' + esc(f.err) + "</p>" : "") +
    '<div class="row"><button class="btn primary" type="submit"' + (ui.busy || f.finding ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Gem") + "</button>" +
    '<button class="btn" type="button" id="more">Tilføj beskrivelse, karakter m.m.</button><button class="btn" type="button" id="cancel">Annuller</button></div></form>';
}

function syncDraft() {
  var d = ui.draft, g = function (id) { return document.getElementById(id); }, v = function (id) { var el = g(id); return el ? el.value : null; };
  if (!d) return;
  if (v("f-name") != null) d.name = v("f-name");
  if (v("f-area") != null) d.area = v("f-area");
  if (v("f-cat") != null) d.cat = v("f-cat");
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
  ui.draft = { isNew: false, id: p.id, cat: p.cat, status: p.status, name: p.name, area: p.area || "", note: p.note || "", rating: p.rating, price: p.price || "", visits: (p.visits || []).slice(), guess: !!p.guess, lat: p.lat, lon: p.lon,
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
    var row = { id: d.id, cat: d.cat, status: d.status, name: d.name.trim(), area: d.area.trim(), note: d.note.trim(), rating: d.rating, price: d.price,
      visits: d.visits, guess: d.guess, lat: d.lat, lon: d.lon, photos: paths, updated_at: new Date().toISOString() };
    var r = await sb.from("places").upsert(row);
    if (r.error) throw new Error("Stedet blev ikke gemt: " + r.error.message);
    var gone = d.removed.filter(function (x) { return !/^img\//.test(x); });
    if (gone.length) await sb.storage.from("photos").remove(gone);
    ui.status = d.status; ui.cat = d.cat; ui.draft = null; ui.msg = "Gemt.";
    await load();
    var el = document.getElementById(row.id); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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

/* ---------- hændelser ---------- */
root.addEventListener("click", async function (e) {
  var t = e.target.closest("button"); if (!t) return;
  if (t.dataset.status) { ui.status = t.dataset.status; render(); return; }
  if (t.dataset.cat) { ui.cat = t.dataset.cat; try { history.replaceState(null, "", ui.cat === "alle" ? location.pathname : "#" + ui.cat); } catch (x) {} render(); return; }
  if (t.dataset.step || t.dataset.go) {
    var tr = t.closest("[data-car]").querySelector(".track"), n = tr.children.length;
    var cur = Math.round(tr.scrollLeft / tr.clientWidth);
    var to = t.dataset.go != null ? +t.dataset.go : (cur + (+t.dataset.step) + n) % n;
    tr.scrollTo({ left: to * tr.clientWidth, behavior: "smooth" }); return;
  }
  if (t.id === "new") { newInput.value = ""; newInput.click(); return; }
  if (t.dataset.edit) { editPlace(t.dataset.edit); return; }
  if (t.dataset.move) {
    var r = await sb.from("places").update({ status: "tried", updated_at: new Date().toISOString() }).eq("id", t.dataset.move);
    ui.msg = r.error ? "Det blev ikke gemt. Prøv igen." : "Flyttet til \"Vi har prøvet\"."; await load(); return;
  }
  if (t.dataset.first) { syncDraft(); var it = ui.draft.items.splice(+t.dataset.first, 1)[0]; ui.draft.items.unshift(it); render(); return; }
  if (t.dataset.rm) { syncDraft(); var gone = ui.draft.items.splice(+t.dataset.rm, 1)[0]; if (gone.path) ui.draft.removed.push(gone.path); render(); return; }
  if (t.dataset.setcat) { syncDraft(); ui.draft.cat = t.dataset.setcat; render(); return; }
  if (t.dataset.setstatus) { syncDraft(); ui.draft.status = t.dataset.setstatus; render(); return; }
  if (t.id === "more") { syncDraft(); ui.draft.more = true; render(); return; }
  if (t.id === "my-loc") { syncDraft(); useMyLocation(); return; }
  if (t.id === "cancel") { ui.draft = null; render(); return; }
  if (t.id === "del-place") { deletePlace(); return; }
  if (t.id === "open-login") { ui.login = { mode: "login" }; render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (t.id === "close-login") { ui.login = null; render(); return; }
  if (t.id === "to-signup") { ui.login.mode = "signup"; ui.login.err = ""; render(); return; }
  if (t.id === "to-login") { ui.login.mode = "login"; ui.login.err = ""; render(); return; }
  if (t.id === "logout") { await sb.auth.signOut(); ui.user = null; ui.editor = false; ui.draft = null; render(); return; }
});
root.addEventListener("submit", function (e) {
  e.preventDefault();
  if (e.target.id === "editor") saveDraft();
  if (e.target.id === "login-form") submitLogin();
});
root.addEventListener("change", function (e) {
  if (e.target.id === "f-add") {
    syncDraft();
    Array.prototype.forEach.call(e.target.files, function (f) { ui.draft.items.push({ file: f, url: URL.createObjectURL(f) }); });
    render();
  }
});
newInput.addEventListener("change", function () { var files = Array.prototype.slice.call(newInput.files); if (files.length) startNew(files); });

/* ---------- start ---------- */
sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") { ui.user = null; ui.editor = false; } });
render();
checkUser().then(load);
})();
