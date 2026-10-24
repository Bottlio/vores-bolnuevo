(function () {
"use strict";

var CFG = window.BOLNUEVO;
var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });

var CATS = [["lejligheden","Lejligheden"],["spisesteder","Spisesteder"],["strande","Strande"],["ture","Ture i nærområdet"],["dagsture","Dagsture"],["oplevelser","Oplevelser"],["dagligvarer","Dagligvarer"],["opladning","Opladning til elbil"],["shopping","Shopping"]];
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
var h = (location.hash || "").slice(1); if (CATNAME[h] || h === "byer") ui.cat = h;
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
function mapsUrl(p) {
  var q = (p.cat === "spisesteder" || p.cat === "shopping" || p.lat == null) ? (p.name + ", " + (p.area || "Mazarrón")) : (p.lat + "," + p.lon);
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
}
/* Stjerner ved navnet: redaktører kan trykke direkte (tryk på samme stjerne igen fjerner karakteren) */
function starsHtml(p) {
  var r = p.rating || 0;
  if (!ui.editor) return r ? '<span class="rating" aria-label="' + r + ' ud af 5 stjerner">' + stars(r) + "</span>" : "";
  var s = '<span class="stars" role="group" aria-label="Giv karakter">';
  for (var i = 1; i <= 5; i++) s += '<button type="button" class="star' + (i <= r ? " on" : "") + '" data-rate="' + i + '" data-id="' + esc(p.id) + '" aria-label="' + i + " stjerne" + (i > 1 ? "r" : "") + '" aria-pressed="' + (i === r) + '">' + (i <= r ? "★" : "☆") + "</button>";
  return s + "</span>";
}
async function setRating(id, n) {
  var p = places.filter(function (x) { return x.id === id; })[0]; if (!p) return;
  var old = p.rating, next = p.rating === n ? null : n;
  p.rating = next; render();
  var r = await sb.from("places").update({ rating: next, updated_at: new Date().toISOString() }).eq("id", id);
  if (r.error) { p.rating = old; ui.msg = "Karakteren blev ikke gemt. Prøv igen."; render(); }
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
  if (!ph.length) return '<div class="noimg-card" aria-hidden="true">' + (CAT_ICONS[p.cat] || "") + "</div>";
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


/* Enkle stregikoner til kategorierne */
function svg(p) { return '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>"; }
var CAT_ICONS = {
  alle: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
  byer: svg('<path d="M3 21h18M5 21V10l5-3v14M10 21V5l6 3v13M16 21v-9l4 2v7"/>'),
  lejligheden: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  spisesteder: svg('<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-2 2-2 6 0 8v10"/>'),
  strande: svg('<path d="M4 12a8 8 0 0 1 16 0z"/><path d="M12 12v8M3 21c2-1.3 4-1.3 6 0s4 1.3 6 0 4-1.3 6 0"/>'),
  ture: svg('<path d="M3 20l6-12 4 7 3-4 5 9z"/><circle cx="17" cy="6" r="2"/>'),
  dagsture: svg('<path d="M5 16h14l-1.5-5.5A2 2 0 0 0 15.6 9H8.4a2 2 0 0 0-1.9 1.5z"/><path d="M4 16v3h3v-3M17 16v3h3v-3"/><circle cx="8" cy="13.5" r=".6"/><circle cx="16" cy="13.5" r=".6"/>'),
  oplevelser: svg('<path d="M12 3l2.2 5.4L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.6z"/>'),
  dagligvarer: svg('<path d="M3 5h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>'),
  opladning: svg('<path d="M13 3L6 13h5l-1 8 7-10h-5z"/>'),
  shopping: svg('<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>')
};
var TOWN_CATS = ["spisesteder","strande","ture","oplevelser","dagligvarer","opladning","shopping"];
var TIME_BUCKETS = [["kort","Under 45 min",0,45],["mellem","45–90 min",45,90],["lang","Over 1,5 time",90,9999]];
function townsOf(list) {
  var c = {}; list.forEach(function (p) { if (p.town) c[p.town] = (c[p.town] || 0) + 1; });
  return Object.keys(c).map(function (t) { return [t, c[t]]; }).sort(function (x, y) { return y[1] - x[1] || x[0].localeCompare(y[0], "es"); });
}
function chip(attr, val, label, n, on) { return '<button class="chip" type="button" data-' + attr + '="' + esc(val) + '" aria-pressed="' + on + '">' + esc(label) + (n != null ? '<span class="n">' + n + "</span>" : "") + "</button>"; }

function render() {
  var APT = "lejligheden", inApt = ui.cat === APT, inTowns = ui.cat === "byer";
  var spots = places.filter(function (p) { return p.cat !== APT; });
  var byStatus = spots.filter(function (p) { return p.status === ui.status; });
  var rated = function (p) { return !ui.minRating || (p.rating || 0) >= ui.minRating; };
  var counts = { alle: byStatus.length };
  CATS.forEach(function (c) { counts[c[0]] = byStatus.filter(function (p) { return p.cat === c[0]; }).length; });
  counts[APT] = places.filter(function (p) { return p.cat === APT; }).length;
  var tried = spots.filter(function (p) { return p.status === "tried"; }).length, wish = spots.length - tried;

  var list, sub = "";
  if (inApt) list = places.filter(function (p) { return p.cat === APT; });
  else if (inTowns) {
    var towns = townsOf(byStatus);
    if (!ui.town) list = null;
    else {
      var inTown = byStatus.filter(function (p) { return p.town === ui.town; });
      sub = '<div class="chips" role="group" aria-label="I byen">' + chip("town", "", "‹ Alle byer", null, false) + chip("sub", "", ui.town, inTown.length, !ui.sub);
      CATS.forEach(function (c) { var n = inTown.filter(function (p) { return p.cat === c[0]; }).length; if (n) sub += chip("sub", c[0], c[1], n, ui.sub === c[0]); });
      sub += "</div>";
      list = inTown.filter(function (p) { return (!ui.sub || p.cat === ui.sub) && rated(p); });
    }
  } else {
    var inCat = byStatus.filter(function (p) { return ui.cat === "alle" || p.cat === ui.cat; });
    if (TOWN_CATS.indexOf(ui.cat) >= 0) {
      var ts = townsOf(inCat);
      if (ts.length > 1) sub = '<div class="chips" role="group" aria-label="By">' + chip("town", "", "Alle byer", null, !ui.town) + ts.map(function (t) { return chip("town", t[0], t[0], t[1], ui.town === t[0]); }).join("") + "</div>";
      if (ui.town) inCat = inCat.filter(function (p) { return p.town === ui.town; });
    } else if (ui.cat === "dagsture") {
      sub = '<div class="chips" role="group" aria-label="Køretid">' + chip("time", "", "Alle", null, !ui.time) + TIME_BUCKETS.map(function (b) {
        var n = inCat.filter(function (p) { return (p.drive_min || 0) >= b[2] && (p.drive_min || 0) < b[3]; }).length;
        return n ? chip("time", b[0], b[1], n, ui.time === b[0]) : "";
      }).join("") + "</div>";
      var tb = TIME_BUCKETS.filter(function (b) { return b[0] === ui.time; })[0];
      if (tb) inCat = inCat.filter(function (p) { return (p.drive_min || 0) >= tb[2] && (p.drive_min || 0) < tb[3]; });
    }
    list = inCat.filter(rated);
  }
  var q = (ui.q || "").trim().toLowerCase(), searching = q.length > 0;
  if (searching) {
    var words = q.split(/\s+/);
    list = places.filter(function (p) {
      var hay = [p.name, p.area, p.town, p.note, CATNAME[p.cat], p.status === "wish" ? "vil prøve" : "har prøvet"].join(" ").toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    });
  }
  var dist = function (p) { return p.drive_min != null ? p.drive_min : (km(p.lat, p.lon) || 0) * 1.2; };
  var SORTS = {
    nyeste: function (a, b) { return String(b.created_at || "").localeCompare(String(a.created_at || "")) || dist(a) - dist(b); },
    naermeste: function (a, b) { return dist(a) - dist(b); },
    stjerner: function (a, b) { return (b.rating || 0) - (a.rating || 0) || dist(a) - dist(b); },
    navn: function (a, b) { return a.name.localeCompare(b.name, "da"); }
  };
  if (list) list.sort(SORTS[ui.sort] || SORTS.nyeste);

  var html = '<header><div><p class="eyebrow">Laderita de Bolnuevo · Costa Cálida</p><h1>Vores Bolnuevo</h1></div><button class="iconbtn" type="button" data-open-search aria-label="Søg">' + ICON_SEARCH + "</button>";
  html += "</header>";
  if (ui.msg) html += '<p class="notice" role="status">' + esc(ui.msg) + "</p>";
  if (ui.login) html += loginHtml();
  if (ui.draft) html += formHtml(ui.draft);

  var f = "";
  if (!inApt) f += '<div class="seg" role="group" aria-label="Vis"><button type="button" data-status="tried" aria-pressed="' + (ui.status === "tried") + '">Har prøvet (' + tried + ')</button><button type="button" data-status="wish" aria-pressed="' + (ui.status === "wish") + '">Vil prøve (' + wish + ")</button></div>";
  f += '<div class="cats" role="group" aria-label="Kategori">' + catBtn("alle", "Alle", counts.alle) + catBtn("byer", "Byer", null);
  CATS.forEach(function (c) { f += catBtn(c[0], c[0] === "opladning" ? "Elbil" : c[1], counts[c[0]]); });
  f += "</div>";
  if (sub) f += '<div class="subchips">' + sub + "</div>";
  f += '<div class="selects">';
  if (!inApt && !(inTowns && !ui.town)) f += '<label class="sel"><span aria-hidden="true">★</span><select data-select="rating" aria-label="Karakter">' +
    [[0, "Alle karakterer"], [4, "4 stjerner og op"], [5, "Kun 5 stjerner"]].map(function (r) { return '<option value="' + r[0] + '"' + ((ui.minRating || 0) === r[0] ? " selected" : "") + ">" + r[1] + "</option>"; }).join("") + "</select></label>";
  f += '<label class="sel"><span aria-hidden="true">⇅</span><select data-select="sort" aria-label="Sortér">' +
    [["nyeste", "Nyeste først"], ["naermeste", "Nærmeste først"], ["stjerner", "Flest stjerner"], ["navn", "Navn A–Å"]].map(function (o) { return '<option value="' + o[0] + '"' + ((ui.sort || "nyeste") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>";
  f += "</div>";
  function catBtn(id, label, n) {
    return '<button type="button" class="cat" data-cat="' + id + '" aria-pressed="' + (ui.cat === id) + '">' + (CAT_ICONS[id] || "") + '<span class="cl">' + esc(label) + "</span>" + (n != null ? '<span class="cn">' + n + "</span>" : "") + "</button>";
  }
  var summary = searching ? 'Søgning: "' + ui.q.trim() + '"' : [inApt ? "" : (ui.status === "wish" ? "Vil prøve" : "Har prøvet"), ui.cat === "alle" ? "Alle" : ui.cat === "byer" ? "Byer" : CATNAME[ui.cat], ui.town || "", ui.sub ? CATNAME[ui.sub] : "",
    ui.time ? TIME_BUCKETS.filter(function (b) { return b[0] === ui.time; })[0][1] : "", ui.minRating ? ui.minRating + "+ ★" : "", ui.sort && ui.sort !== "nyeste" ? { naermeste: "nærmeste først", stjerner: "flest stjerner", navn: "A–Å" }[ui.sort] : ""].filter(Boolean).join(" · ");
  if (searching) {
    html += '<div class="bar" id="fullbar"><div class="row"><strong>' + list.length + (list.length === 1 ? " sted" : " steder") + ' matcher "' + esc(ui.q.trim()) + '"</strong><button class="btn small" type="button" id="q-clear">Ryd søgning</button></div></div>';
  } else html += '<div class="bar" id="fullbar">' + f + "</div>";
  slimBar(summary, f, list ? list.length : null);

  if (inTowns && !ui.town && !searching) {
    html += '<div class="towns">';
    var tlist = townsOf(byStatus);
    if (!tlist.length) html += '<p class="empty-state">Ingen byer her endnu.</p>';
    tlist.forEach(function (t) {
      var withPhoto = byStatus.filter(function (p) { return p.town === t[0] && p.photos && p.photos.length; })[0];
      var cats = []; CATS.forEach(function (c) { if (byStatus.some(function (p) { return p.town === t[0] && p.cat === c[0]; })) cats.push(c[1]); });
      html += '<button class="town" type="button" data-town="' + esc(t[0]) + '">' + (withPhoto ? '<img src="' + esc(photoUrl(withPhoto.photos[0])) + '" alt="" loading="lazy">' : '<span class="noimg"></span>') +
        '<span class="tname">' + esc(t[0]) + '</span><span class="tmeta">' + t[1] + (t[1] === 1 ? " sted" : " steder") + " · " + esc(cats.join(", ")) + "</span></button>";
    });
    html += "</div>";
    list = [];
  }
  html += '<div class="list">';
  if (!ui.loaded) html += '<p class="empty-state">Henter steder…</p>';
  else if (!list.length && inApt) html += '<p class="empty-state">Ingen billeder af lejligheden endnu.' + (ui.editor ? ' Tryk "+ Nyt sted" og vælg billeder taget på hotellet, så havner de her.' : "") + "</p>";
  else if (!list.length && searching) html += '<p class="empty-state">Ingen steder matcher søgningen.</p>';
  else if (!list.length && !(inTowns && !ui.town)) html += '<p class="empty-state">' + (ui.status === "wish" ? "Ingen ønsker her endnu." : "Intet her endnu.") + (ui.editor ? ' Tryk "+ Nyt sted" for at tilføje et.' : "") + "</p>";
  list.forEach(function (p) {
    html += '<article class="place" id="' + esc(p.id) + '">' + carousel(p);
    html += '<div class="place-top"><h3>' + esc(p.name) + "</h3>" + (p.cat === "lejligheden" ? "" : starsHtml(p)) + "</div>";
    var where = p.area && p.area !== p.town ? (p.town && p.area.indexOf(p.town) < 0 ? p.area + ", " + p.town : p.area) : (p.town || p.area);
    var meta = p.cat === "lejligheden" ? "" : [where, distText(p), p.price].filter(Boolean).join(" · ");
    if (meta) html += '<p class="meta">' + esc(meta) + "</p>";
    html += p.note ? '<p class="note">' + esc(p.note) + "</p>" : (p.cat === "lejligheden" ? "" : '<p class="note empty">Mangler vores beskrivelse.</p>');
    html += '<div class="tags">';
    if (ui.cat === "alle" || inTowns || searching) html += '<span class="tag kat">' + esc(CATNAME[p.cat] || p.cat) + "</span>";
    if (p.visits && p.visits.length) html += '<span class="tag">' + esc(visitsText(p.visits)) + "</span>";
    if (p.guess) html += '<span class="tag guess">Navnet er gættet ud fra billeder</span>';
    html += "</div>";
    html += '<div class="row"><a class="maps" href="' + esc(mapsUrl(p)) + '" target="_blank" rel="noopener">Åbn i Google Maps</a>';
    if (ui.editor) {
      html += '<button class="btn small" type="button" data-edit="' + esc(p.id) + '">Ret</button><button class="btn small" type="button" data-addphotos="' + esc(p.id) + '">+ Billeder</button>';
      if (p.status === "wish") html += '<button class="btn small" type="button" data-move="' + esc(p.id) + '">Flyt til "Har prøvet"</button>';
    }
    html += "</div></article>";
  });
  html += "</div>";

  if (inApt) html += '<section class="practical"><p class="eyebrow">Det praktiske, kort</p><h2>Når I bor i lejligheden</h2><dl>';
  if (inApt) PRACTICAL.forEach(function (r) { html += "<dt>" + esc(r.k) + "</dt><dd>" + esc(r.v) + (r.link ? ' <a href="' + esc(r.link) + '" target="_blank" rel="noopener">' + esc(r.linkText) + "</a>" : "") + "</dd>"; });
  if (inApt) html += "</dl></section>";
  html += "<footer><span>Afstand og tid er i bil fra hotellet, beregnet uden trafik.</span>";
  if (ui.user) html += "<span>Logget ind som " + esc(ui.user.email) + '. <button class="linkbtn" type="button" id="logout">Log ud</button></span>';
  else html += '<span><button class="linkbtn" type="button" id="open-login">Log ind for at rette</button></span>';
  html += "</footer>";
  if (ui.editor && !ui.draft) html += '<button class="fab" type="button" id="new" aria-label="Nyt sted"><span aria-hidden="true">+</span> Nyt sted</button>';
  root.innerHTML = html;
  wireCarousels();
  watchBar();
}

/* ---------- smal menulinje øverst + søgning ---------- */
var ICON_SEARCH = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
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

var LOCAL_TOWNS = [["Bolnuevo",37.5635,-1.3080,1.6],["Puerto de Mazarrón",37.5640,-1.2560,2.2],["Mazarrón",37.5985,-1.3150,2.0],["La Azohía",37.5530,-1.1700,1.8],["Isla Plana",37.5750,-1.2100,1.5],["Cañada de Gallego",37.5770,-1.4000,2.0],["El Alamillo",37.5690,-1.2370,1.2]];
function townFor(lat, lon, addr) {
  var best = null;
  LOCAL_TOWNS.forEach(function (t) { var d = distM(lat, lon, t[1], t[2]) / 1000; if (d < t[3] && (!best || d < best[1])) best = [t[0], d]; });
  if (best) return best[0];
  addr = addr || {};
  return addr.village || addr.town || addr.city || addr.neighbourhood || addr.hamlet || addr.municipality || "";
}
var GROCERY = ["supermarket","convenience","bakery","butcher","greengrocer","seafood","deli","marketplace","alcohol","beverages","frozen_food"];
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
      else if (t === "charging_station") out.cat = "opladning";
      else if (GROCERY.indexOf(t) >= 0) out.cat = "dagligvarer";
      else if (c === "shop" || t === "marketplace" || t === "mall") out.cat = "shopping";
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
    var near = places.filter(function (p) { return p.lat != null; }).map(function (p) { return [p, distM(d.lat, d.lon, p.lat, p.lon)]; })
      .filter(function (x) { return x[1] < 120; }).sort(function (a, b) { return a[1] - b[1]; })[0];
    if (near) d.match = { id: near[0].id, name: near[0].name, m: Math.round(near[1]) };
    var found = await lookupPlace(d.lat, d.lon);
    if (ui.draft !== d) return;
    d.name = found.name; d.area = found.area; d.cat = found.cat; d.town = found.town || "";
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
    '<div class="grid"><label>Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Restaurante La Siesta"></label><label>By<input id="f-town" value="' + esc(f.town || "") + '" placeholder="Puerto de Mazarrón"></label></div>' +
    '<label>Sted/område (valgfrit)<input id="f-area" value="' + esc(f.area) + '" placeholder="Plaza del Muelle"></label>' +
    '<div class="grid"><label>Kategori<select id="f-cat">' + opts + '</select></label><label>Liste<select id="f-status"><option value="tried"' + (f.status === "tried" ? " selected" : "") + '>Har prøvet</option><option value="wish"' + (f.status === "wish" ? " selected" : "") + ">Vil prøve</option></select></label><label>Karakter<select id=\"f-rating\">" + r + '</select></label><label>Pris<select id="f-price">' + pr + "</select></label></div>" +
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
    (f.match && !f.finding ? '<div class="match"><p>Billederne er taget ' + (f.match.m < 15 ? "ved" : f.match.m + " m fra") + " <strong>" + esc(f.match.name) + '</strong>.</p><button class="btn primary" type="button" id="add-to-match"' + (ui.busy ? " disabled" : "") + ">" + (ui.busy ? "Gemmer…" : "Tilføj billederne dér") + '</button><p class="hint">Eller opret et nyt sted nedenfor.</p></div>' : "") +
    (f.finding ? '<p class="hint">Finder stedet ud fra billedet…</p>' :
      '<label>Navn<input id="f-name" required value="' + esc(f.name) + '" placeholder="Skriv stedets navn"></label>' +
      '<p class="meta">' + esc([f.area, dist].filter(Boolean).join(" · ") || "Ingen placering fundet") + "</p>" +
      (f.info ? '<p class="hint">' + esc(f.info) + "</p>" : "") +
      (f.lat == null ? '<div><button class="btn" type="button" id="my-loc">Brug min placering</button></div>' : "") +
      '<div class="chips" role="group" aria-label="Kategori">' + chips + "</div>" +
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
  ui.draft = { isNew: false, id: p.id, town: p.town || "", cat: p.cat, status: p.status, name: p.name, area: p.area || "", note: p.note || "", rating: p.rating, price: p.price || "", visits: (p.visits || []).slice(), guess: !!p.guess, lat: p.lat, lon: p.lon,
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
async function addPhotosTo(placeId, files) {
  var p = places.filter(function (x) { return x.id === placeId; })[0]; if (!p || !files.length) return;
  ui.busy = true;
  try {
    var paths = await uploadFiles(placeId, files, function (i, n) { ui.msg = "Uploader billede " + i + " af " + n + "…"; render(); });
    var r = await sb.from("places").update({ photos: (p.photos || []).concat(paths), updated_at: new Date().toISOString() }).eq("id", placeId);
    if (r.error) throw new Error("Billederne blev ikke gemt: " + r.error.message);
    ui.msg = files.length + (files.length === 1 ? " billede" : " billeder") + " tilføjet til " + p.name + ".";
    ui.draft = null; await load();
    var el = document.getElementById(placeId); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { ui.msg = e.message || "Billederne blev ikke uploadet. Prøv igen."; }
  ui.busy = false; render();
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
    var drive = orig && orig.lat === d.lat && orig.lon === d.lon && orig.drive_min ? { km: orig.drive_km, min: orig.drive_min } : (d.lat != null ? await driveFromHotel(d.lat, d.lon) : null);
    var row = { town: (d.town || "").trim() || null, drive_km: drive ? drive.km : null, drive_min: drive ? drive.min : null, id: d.id, cat: d.cat, status: d.status, name: d.name.trim(), area: d.area.trim(), note: d.note.trim(), rating: d.rating, price: d.price,
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
document.addEventListener("click", async function (e) {
  if (!root.contains(e.target) && !panel.contains(e.target)) return;
  var t = e.target.closest("button"); if (!t) return;
  if (t.dataset.status) { ui.status = t.dataset.status; render(); return; }
  if (t.dataset.town != null) { ui.town = t.dataset.town || null; ui.sub = null; render(); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.sub != null) { ui.sub = t.dataset.sub || null; render(); return; }
  if (t.dataset.sort) { ui.sort = t.dataset.sort; render(); return; }
  if (t.dataset.time != null) { ui.time = t.dataset.time || null; render(); return; }
  if (t.dataset.cat) { ui.town = null; ui.sub = null; ui.time = null; ui.cat = t.dataset.cat; try { history.replaceState(null, "", ui.cat === "alle" ? location.pathname : "#" + ui.cat); } catch (x) {} render(); return; }
  if (t.dataset.step || t.dataset.go) {
    var tr = t.closest("[data-car]").querySelector(".track"), n = tr.children.length;
    var cur = Math.round(tr.scrollLeft / tr.clientWidth);
    var to = t.dataset.go != null ? +t.dataset.go : (cur + (+t.dataset.step) + n) % n;
    tr.scrollTo({ left: to * tr.clientWidth, behavior: "smooth" }); return;
  }
  if (t.dataset.addphotos) { addInput.dataset.target = t.dataset.addphotos; addInput.value = ""; addInput.click(); return; }
  if (t.id === "add-to-match") { addPhotosTo(ui.draft.match.id, ui.draft.items.map(function (x) { return x.file; })); return; }
  if (t.id === "new") { newInput.value = ""; newInput.click(); return; }
  if (t.dataset.edit) { editPlace(t.dataset.edit); return; }
  if (t.dataset.move) {
    var r = await sb.from("places").update({ status: "tried", updated_at: new Date().toISOString() }).eq("id", t.dataset.move);
    ui.msg = r.error ? "Det blev ikke gemt. Prøv igen." : "Flyttet til \"Har prøvet\"."; await load(); return;
  }
  if (t.dataset.first) { syncDraft(); var it = ui.draft.items.splice(+t.dataset.first, 1)[0]; ui.draft.items.unshift(it); render(); return; }
  if (t.dataset.rm) { syncDraft(); var gone = ui.draft.items.splice(+t.dataset.rm, 1)[0]; if (gone.path) ui.draft.removed.push(gone.path); render(); return; }
  if (t.dataset.rate) { setRating(t.dataset.id, +t.dataset.rate); return; }
  if (t.dataset.minrating != null) { ui.minRating = +t.dataset.minrating; render(); return; }
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
document.addEventListener("change", function (e) {
  var sel = e.target.closest("select[data-select]"); if (!sel) return;
  if (sel.dataset.select === "rating") ui.minRating = +sel.value;
  if (sel.dataset.select === "sort") ui.sort = sel.value;
  render();
});
var addInput = document.getElementById("add-photos");
addInput.addEventListener("change", function () { var files = Array.prototype.slice.call(addInput.files); if (files.length) addPhotosTo(addInput.dataset.target, files); });
newInput.addEventListener("change", function () { var files = Array.prototype.slice.call(newInput.files); if (files.length) startNew(files); });

/* ---------- automatisk opdatering ----------
   Appen på hjemmeskærmen har ingen genindlæs-knap. Ved start, og hver gang den åbnes igen,
   tjekker den version.json og henter selv den nye udgave, hvis der er en. */
var APP_VERSION = 17;
async function checkForUpdate() {
  try {
    var r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    var j = await r.json();
    if (j && j.v > APP_VERSION && !ui.draft && !ui.busy) location.replace(location.pathname + "?v=" + j.v + location.hash);
  } catch (e) { /* ingen forbindelse; prøv igen næste gang */ }
}
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") checkForUpdate(); });
checkForUpdate();

/* ---------- start ---------- */
sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") { ui.user = null; ui.editor = false; } });
render();
checkUser().then(load);
})();
