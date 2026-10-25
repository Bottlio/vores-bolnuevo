/* Midlertidigt værktøj til PC: gennemgå alle billeder fra de delte Bolnuevo-albummer,
   vælg et eller flere, og læg dem på et eksisterende sted eller opret et nyt.
   Billederne læses kun lokalt i browseren; kun de valgte uploades (mindre og uden GPS). */
(function () {
"use strict";
var BOL = window.BOL = window.BOL || {};
var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var DAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
var MON = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
var SAME = 14;          // så tæt to billed-fingeraftryk skal være for at tælle som samme billede
var NEAR_M = 250;       // billeder med placering foreslår steder inden for så mange meter

var S = { items: [], sel: new Set(), last: null, hideUsed: false, album: "", newest: true, msg: "", busy: false, skipped: 0, scanning: false };
var placeHash = {};     // stedets billedsti -> fingeraftryk
var box = null, backBtn = null, gridEl = null, barEl = null;

/* ---------- fingeraftryk (dHash) af et billede, så samme billede kan genkendes i en anden størrelse ---------- */
function hashFromBitmap(bm) {
  var c = document.createElement("canvas"); c.width = 32; c.height = 32;
  var x = c.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high"; x.drawImage(bm, 0, 0, 32, 32);
  var small = function (w, h) { var d = document.createElement("canvas"); d.width = w; d.height = h; var y = d.getContext("2d", { willReadFrequently: true }); y.imageSmoothingQuality = "high"; y.drawImage(c, 0, 0, w, h);
    var px = y.getImageData(0, 0, w, h).data, g = []; for (var i = 0; i < px.length; i += 4) g.push(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114); return g; };
  var a = small(9, 8), b = small(8, 9), s = "";
  for (var r = 0; r < 8; r++) for (var k = 0; k < 8; k++) s += a[r * 9 + k] > a[r * 9 + k + 1] ? "1" : "0";
  for (r = 0; r < 8; r++) for (k = 0; k < 8; k++) s += b[r * 8 + k] > b[(r + 1) * 8 + k] ? "1" : "0";
  return s;
}
function ham(a, b) { var n = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; }
function readCache() { try { return JSON.parse(localStorage.getItem("bol-import-hash") || "{}"); } catch (e) { return {}; } }
function writeCache() { try { localStorage.setItem("bol-import-hash", JSON.stringify(placeHash)); } catch (e) { /* ingen lagerplads; regnes ud igen næste gang */ } }

async function hashPlacePhotos() {
  var cached = readCache(), todo = [];
  BOL.places().forEach(function (p) { (p.photos || []).forEach(function (path) { if (cached[path]) placeHash[path] = cached[path]; else if (!placeHash[path]) todo.push(path); }); });
  var run = async function () {
    while (todo.length) {
      var path = todo.shift();
      try {
        var r = await fetch(BOL.photoUrl(path)); if (!r.ok) continue;
        var bm = await createImageBitmap(await r.blob(), { resizeWidth: 64, resizeQuality: "medium" });
        placeHash[path] = hashFromBitmap(bm); bm.close && bm.close();
      } catch (e) { /* billedet kunne ikke hentes */ }
    }
  };
  await Promise.all([run(), run(), run(), run()]);
  writeCache();
}
function placeOfPath(path) { var ps = BOL.places(); for (var i = 0; i < ps.length; i++) if ((ps[i].photos || []).indexOf(path) >= 0) return ps[i]; return null; }
function matchUsed(it) {
  if (!it.hash) return;
  var best = null;
  Object.keys(placeHash).forEach(function (path) { var d = ham(it.hash, placeHash[path]); if (d <= SAME && (!best || d < best.d)) best = { d: d, path: path }; });
  var p = best ? placeOfPath(best.path) : null;
  it.used = p ? { id: p.id, name: p.name } : null;
}

/* ---------- indlæs mappe ---------- */
var isImg = function (f) { return /\.(jpe?g|png|webp)$/i.test(f.name); };
var isHeic = function (f) { return /\.(heic|heif)$/i.test(f.name); };
function dayKey(t) { return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); }

async function readFolder(fileList) {
  var all = Array.prototype.slice.call(fileList);
  var files = all.filter(isImg);
  S.skipped = all.filter(isHeic).length;
  S.items.forEach(function (it) { if (it.thumb) URL.revokeObjectURL(it.thumb); });
  S.items = files.map(function (f, i) {
    var parts = (f.webkitRelativePath || f.name).split("/");
    return { i: i, file: f, album: parts.length > 1 ? parts[parts.length - 2] : "", date: new Date(f.lastModified), lat: null, lon: null };
  });
  S.sel.clear(); S.last = null; S.album = ""; S.scanning = true;
  S.msg = "Læser datoer og placeringer… 0 af " + S.items.length; draw();
  var n = 0, q = S.items.slice();
  var meta = async function () {
    while (q.length) {
      var it = q.shift();
      try {
        var m = await window.exifr.parse(it.file, { tiff: true, exif: true, gps: true, ifd1: false, xmp: false, icc: false, iptc: false, jfif: false });
        if (m) {
          var d = m.DateTimeOriginal || m.CreateDate; if (d instanceof Date && !isNaN(d)) it.date = d;
          if (typeof m.latitude === "number" && isFinite(m.latitude)) { it.lat = m.latitude; it.lon = m.longitude; }
        }
      } catch (e) { /* intet EXIF; filens dato bruges */ }
      if (++n % 25 === 0) { S.msg = "Læser datoer og placeringer… " + n + " af " + S.items.length; drawStatus(); }
    }
  };
  await Promise.all([meta(), meta(), meta(), meta()]);
  S.msg = "Laver små billeder og tjekker, hvilke der allerede er brugt…"; draw();
  await hashPlacePhotos();
  var order = sorted(), k = 0;
  var thumbs = async function () {
    while (order.length) {
      var it = order.shift();
      try {
        var bm = await createImageBitmap(it.file, { resizeWidth: 360, resizeQuality: "medium" });
        var c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height; c.getContext("2d").drawImage(bm, 0, 0);
        it.hash = hashFromBitmap(bm); bm.close && bm.close();
        it.thumb = URL.createObjectURL(await new Promise(function (r) { c.toBlob(r, "image/jpeg", 0.75); }));
        matchUsed(it);
      } catch (e) { it.bad = true; }
      updateTile(it);
      if (++k % 20 === 0) { S.msg = "Laver små billeder… " + k + " af " + S.items.length; drawStatus(); }
    }
  };
  await Promise.all([thumbs(), thumbs(), thumbs()]);
  S.scanning = false;
  var used = S.items.filter(function (x) { return x.used; }).length;
  S.msg = S.items.length + " billeder indlæst. " + used + " af dem ligger allerede på et sted (markeret med grønt)." + (S.skipped ? " " + S.skipped + " HEIC-billeder er sprunget over, fordi browseren ikke kan vise dem." : "");
  draw();
}

/* ---------- visning ---------- */
function visible() {
  return S.items.filter(function (it) { return (!S.album || it.album === S.album) && !(S.hideUsed && it.used) && !it.bad; });
}
function sorted() { var l = visible(); l.sort(function (a, b) { return S.newest ? b.date - a.date : a.date - b.date; }); return l; }
function dayTitle(t) { return DAYS[t.getDay()] + " " + t.getDate() + ". " + MON[t.getMonth()] + " " + t.getFullYear(); }

function tileHtml(it) {
  var on = S.sel.has(it.i);
  return '<button type="button" class="imp-tile' + (on ? " on" : "") + (it.used ? " used" : "") + '" data-i="' + it.i + '" aria-pressed="' + on + '" title="' + esc(it.album + " · " + it.date.toLocaleString("da-DK")) + '">' +
    (it.thumb ? '<img src="' + it.thumb + '" alt="">' : '<span class="imp-wait">…</span>') +
    '<span class="imp-check" aria-hidden="true">✓</span>' +
    (it.lat != null ? '<span class="imp-pin" title="Har placering"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 22s7-7.1 7-12.2A7 7 0 0 0 5 9.8C5 14.9 12 22 12 22z" fill="#d6452f" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="9.8" r="2.6" fill="#fff"/></svg></span>' : "") +
    (it.used ? '<span class="imp-used">På: ' + esc(it.used.name) + "</span>" : "") +
    '<span class="imp-time">' + String(it.date.getHours()).padStart(2, "0") + ":" + String(it.date.getMinutes()).padStart(2, "0") + "</span></button>";
}
function updateTile(it) {
  if (!gridEl) return;
  var el = gridEl.querySelector('.imp-tile[data-i="' + it.i + '"]'); if (!el) return;
  var tmp = document.createElement("div"); tmp.innerHTML = tileHtml(it); el.replaceWith(tmp.firstChild);
}

function draw() {
  if (!box) return;
  var albums = []; S.items.forEach(function (it) { if (albums.indexOf(it.album) < 0) albums.push(it.album); }); albums.sort();
  var h = '<div class="imp-head"><div><p class="eyebrow">Midlertidigt værktøj</p><h1>Importér billeder</h1></div><button class="btn" type="button" data-imp="close">Luk</button></div>';
  if (!BOL.isEditor()) {
    h += '<p class="notice">Du skal være logget ind som redaktør for at bruge værktøjet. Luk og log ind nederst på siden.</p>';
    box.innerHTML = h; return;
  }
  h += '<div class="imp-tools"><label class="btn primary imp-pick">Vælg mappe…<input type="file" id="imp-dir" webkitdirectory directory multiple hidden></label>';
  if (S.items.length) {
    h += '<label class="sel">Album <select data-imp-album><option value="">Alle (' + S.items.length + ")</option>" + albums.map(function (a) { var n = S.items.filter(function (x) { return x.album === a; }).length; return '<option value="' + esc(a) + '"' + (S.album === a ? " selected" : "") + ">" + esc(a || "(uden mappe)") + " (" + n + ")</option>"; }).join("") + "</select></label>";
    h += '<button class="chip" type="button" data-imp="hideused" aria-pressed="' + S.hideUsed + '">Skjul dem, der allerede er brugt</button>';
    h += '<button class="chip" type="button" data-imp="order">' + (S.newest ? "Nyeste først" : "Ældste først") + " ⇅</button>";
  }
  h += "</div>";
  if (!S.items.length) h += '<div class="imp-intro"><p>Vælg mappen <strong>iCloud Photos → Delt</strong> (eller ét af Bolnuevo-albummerne i den). Så vises alle billederne her, sorteret efter dato.</p><ol><li>Klik på et billede for at vælge det. Hold <kbd>Shift</kbd> nede for at vælge alle billeder imellem to klik.</li><li>Dobbeltklik for at se billedet stort.</li><li>Vælg et sted nederst og tryk <strong>Tilføj</strong>, eller tryk <strong>Opret nyt sted</strong>.</li></ol><p class="hint">Billederne bliver på din PC. Kun dem, du vælger at tilføje, uploades, og de gemmes mindre og uden GPS-placering. Billeder, der allerede ligger på et sted, bliver markeret med grønt.</p></div>';
  h += '<p class="notice imp-status" role="status"' + (S.msg ? "" : " hidden") + ">" + esc(S.msg) + "</p>";
  h += '<div class="imp-grid"></div><div class="imp-bar"></div>';
  box.innerHTML = h;
  gridEl = box.querySelector(".imp-grid"); barEl = box.querySelector(".imp-bar");
  drawGrid(); drawBar();
}
function drawStatus() { var el = box && box.querySelector(".imp-status"); if (el) { el.hidden = !S.msg; el.textContent = S.msg; } }
function drawGrid() {
  if (!gridEl) return;
  var l = sorted(), h = "", cur = null;
  l.forEach(function (it) {
    var k = dayKey(it.date);
    if (k !== cur) {
      if (cur) h += "</div></section>";
      cur = k;
      var same = l.filter(function (x) { return dayKey(x.date) === k; });
      var alb = []; same.forEach(function (x) { if (alb.indexOf(x.album) < 0) alb.push(x.album); });
      h += '<section class="imp-day"><div class="imp-dayhead"><h2>' + esc(dayTitle(it.date)) + '</h2><span class="hint">' + same.length + (same.length === 1 ? " billede · " : " billeder · ") + esc(alb.join(", ")) + '</span><button class="btn small" type="button" data-imp-day="' + k + '">Vælg dagen</button></div><div class="imp-tiles">';
    }
    h += tileHtml(it);
  });
  if (cur) h += "</div></section>";
  if (S.items.length && !l.length) h += '<p class="empty-state">Ingen billeder her.</p>';
  gridEl.innerHTML = h;
}

function selItems() { return S.items.filter(function (it) { return S.sel.has(it.i); }).sort(function (a, b) { return a.date - b.date; }); }
function suggestions(sel) {
  var out = [], add = function (p, why) { if (p && !out.some(function (x) { return x.p.id === p.id; })) out.push({ p: p, why: why }); };
  sel.forEach(function (it) { if (it.used) add(BOL.places().filter(function (p) { return p.id === it.used.id; })[0], "samme billede"); });
  var withGps = sel.filter(function (it) { return it.lat != null; });
  if (withGps.length) {
    BOL.places().filter(function (p) { return p.lat != null; }).map(function (p) {
      var d = Math.min.apply(null, withGps.map(function (it) { return BOL.distM(it.lat, it.lon, p.lat, p.lon); })); return [p, d];
    }).filter(function (x) { return x[1] < NEAR_M; }).sort(function (a, b) { return a[1] - b[1]; }).slice(0, 4).forEach(function (x) { add(x[0], Math.round(x[1]) + " m væk"); });
  }
  if (S.recent) S.recent.forEach(function (id) { add(BOL.places().filter(function (p) { return p.id === id; })[0], "brugt lige før"); });
  return out.slice(0, 6);
}
function placeLabel(p) { return p.name + (p.town ? " – " + p.town : "") + " (" + (BOL.CATNAME[p.cat] || p.cat) + ")"; }
function drawBar() {
  if (!barEl) return;
  var sel = selItems();
  if (!sel.length) { barEl.hidden = true; barEl.innerHTML = ""; return; }
  barEl.hidden = false;
  var sug = suggestions(sel);
  var opts = BOL.places().slice().sort(function (a, b) { return a.name.localeCompare(b.name, "es"); }).map(function (p) { return '<option value="' + esc(placeLabel(p)) + '"></option>'; }).join("");
  var used = sel.filter(function (it) { return it.used; }).length;
  var h = '<div class="imp-barrow"><strong>' + sel.length + (sel.length === 1 ? " billede valgt" : " billeder valgt") + "</strong>" +
    '<span class="hint">' + esc(dayTitle(sel[0].date)) + (dayKey(sel[0].date) !== dayKey(sel[sel.length - 1].date) ? " – " + esc(dayTitle(sel[sel.length - 1].date)) : "") + (used ? " · " + used + " ligger allerede på et sted" : "") + "</span>" +
    '<button class="linkbtn" type="button" data-imp="clear">Fravælg alle</button></div>';
  if (sug.length) h += '<div class="imp-barrow"><span class="hint">Forslag:</span>' + sug.map(function (s) { return '<button class="chip" type="button" data-imp-add="' + esc(s.p.id) + '">' + esc(s.p.name) + ' <span class="n">' + esc(s.why) + "</span></button>"; }).join("") + "</div>";
  h += '<div class="imp-barrow"><input id="imp-place" list="imp-places" placeholder="Skriv for at finde et sted…" autocomplete="off"><datalist id="imp-places">' + opts + '</datalist>' +
    '<button class="btn primary" type="button" data-imp="add"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? "Gemmer…" : "Tilføj til stedet") + "</button>" +
    '<span class="hint">eller</span><button class="btn" type="button" data-imp="new"' + (S.busy ? " disabled" : "") + ">Opret nyt sted med dem</button></div>";
  if (S.confirm) h += '<div class="imp-barrow imp-warn"><span>' + S.confirm.dups + " af billederne ligner nogle, der allerede ligger på " + esc(S.confirm.name) + '.</span><button class="btn small primary" type="button" data-imp="skipdups">Spring dem over</button><button class="btn small" type="button" data-imp="adddups">Tilføj alle alligevel</button><button class="linkbtn" type="button" data-imp="nocfm">Fortryd</button></div>';
  barEl.innerHTML = h;
}

/* ---------- handlinger ---------- */
function monthsOf(sel) { var m = []; sel.forEach(function (it) { var k = dayKey(it.date).slice(0, 7); if (m.indexOf(k) < 0) m.push(k); }); return m.sort(); }
function lastOf(sel) { return dayKey(sel[sel.length - 1].date); }

async function addTo(id, force) {
  var p = BOL.places().filter(function (x) { return x.id === id; })[0]; if (!p) return;
  var sel = selItems();
  if (!force) {
    var hs = (p.photos || []).map(function (x) { return placeHash[x]; }).filter(Boolean);
    var dups = sel.filter(function (it) { return it.hash && hs.some(function (h) { return ham(it.hash, h) <= SAME; }); });
    if (dups.length) { S.confirm = { id: id, name: p.name, dups: dups.length }; drawBar(); return; }
  }
  if (force === "skip") sel = sel.filter(function (it) { var hs = (p.photos || []).map(function (x) { return placeHash[x]; }).filter(Boolean); return !(it.hash && hs.some(function (h) { return ham(it.hash, h) <= SAME; })); });
  S.confirm = null;
  if (!sel.length) { S.msg = "Alle de valgte ligger allerede på " + p.name + ". Intet tilføjet."; S.sel.clear(); draw(); return; }
  S.busy = true; S.msg = "Uploader " + sel.length + " billeder til " + p.name + "…"; drawStatus(); drawBar();
  BOL.afterSave = null;
  var ok = await BOL.addPhotosTo(id, sel.map(function (it) { return it.file; }), { months: monthsOf(sel), last: lastOf(sel) });
  S.busy = false;
  if (ok) {
    S.recent = [id].concat((S.recent || []).filter(function (x) { return x !== id; })).slice(0, 3);
    await afterChange(sel, id);
    S.msg = sel.length + (sel.length === 1 ? " billede" : " billeder") + " tilføjet til " + p.name + ".";
  } else S.msg = "Billederne blev ikke gemt. Prøv igen.";
  draw();
}
/* Efter upload: regn fingeraftryk for stedets nye billeder, så de vises som brugt */
async function afterChange(sel, id) {
  await hashPlacePhotos();
  sel.forEach(function (it) { it.used = null; matchUsed(it); if (!it.used) { var p = BOL.places().filter(function (x) { return x.id === id; })[0]; if (p) it.used = { id: p.id, name: p.name }; } });
  S.sel.clear(); S.last = null;
}
function startNewPlace() {
  var sel = selItems(); if (!sel.length) return;
  hide(true);
  BOL.afterSave = async function (id) {
    BOL.afterSave = null;
    var p = BOL.places().filter(function (x) { return x.id === id; })[0];
    await afterChange(sel, id);
    S.recent = [id].concat((S.recent || []).filter(function (x) { return x !== id; })).slice(0, 3);
    S.msg = p ? p.name + " er gemt med " + sel.length + (sel.length === 1 ? " billede." : " billeder.") : "Gemt.";
    show();
  };
  BOL.startNew(sel.map(function (it) { return it.file; }), { fromImport: true, visits: monthsOf(sel), last: lastOf(sel) });
}

/* ---------- stort billede ---------- */
var lb = null;
function openLightbox(i) {
  var l = sorted(), pos = l.findIndex(function (x) { return x.i === i; }); if (pos < 0) return;
  if (!lb) { lb = document.createElement("div"); lb.className = "imp-lb"; document.body.appendChild(lb); }
  var it = l[pos], url = URL.createObjectURL(it.file);
  lb.innerHTML = '<img src="' + url + '" alt=""><div class="imp-lbbar"><span>' + esc(dayTitle(it.date) + " kl. " + it.date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" }) + " · " + it.album) + (it.used ? " · På: " + esc(it.used.name) : "") + '</span><button class="btn small" type="button" data-lb="sel">' + (S.sel.has(it.i) ? "Fravælg" : "Vælg") + '</button><button class="btn small" type="button" data-lb="close">Luk (Esc)</button></div><button class="imp-lbnav prev" type="button" data-lb="prev" aria-label="Forrige">‹</button><button class="imp-lbnav next" type="button" data-lb="next" aria-label="Næste">›</button>';
  lb.hidden = false; lb.dataset.i = i; lb.dataset.url = url;
}
function closeLightbox() { if (!lb) return; URL.revokeObjectURL(lb.dataset.url); lb.hidden = true; lb.innerHTML = ""; }
function stepLightbox(n) { var l = sorted(), pos = l.findIndex(function (x) { return x.i === +lb.dataset.i; }); var nx = l[pos + n]; if (nx) { URL.revokeObjectURL(lb.dataset.url); openLightbox(nx.i); } }
function toggle(i) { if (S.sel.has(i)) S.sel.delete(i); else S.sel.add(i); }

/* ---------- åbn / luk ---------- */
function show() {
  if (!box) {
    box = document.createElement("div"); box.className = "imp"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Importér billeder"); document.body.appendChild(box);
    box.addEventListener("click", onClick); box.addEventListener("change", onChange); box.addEventListener("dblclick", onDbl);
  }
  if (backBtn) backBtn.hidden = true;
  BOL.importing = true; box.hidden = false; document.documentElement.classList.add("imp-open");
  draw();
}
function hide(keep) {
  if (box) box.hidden = true; document.documentElement.classList.remove("imp-open");
  if (keep) {
    if (!backBtn) { backBtn = document.createElement("button"); backBtn.type = "button"; backBtn.className = "btn primary imp-back"; backBtn.textContent = "‹ Tilbage til import"; document.body.appendChild(backBtn);
      backBtn.addEventListener("click", function () { if (BOL.busy()) return; BOL.afterSave = null; BOL.cancelDraft(); show(); }); }
    backBtn.hidden = false;
  } else { BOL.importing = false; if (backBtn) backBtn.hidden = true; try { if (location.hash === "#import") history.replaceState(null, "", location.pathname); } catch (e) {} }
}
BOL.openImport = function () { try { history.replaceState(null, "", "#import"); } catch (e) {} show(); };

function onClick(e) {
  var tile = e.target.closest(".imp-tile");
  if (tile) {
    var i = +tile.dataset.i;
    if (e.shiftKey && S.last != null) {
      var l = sorted(), a = l.findIndex(function (x) { return x.i === S.last; }), b = l.findIndex(function (x) { return x.i === i; });
      var on = !S.sel.has(i); l.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function (x) { if (on) S.sel.add(x.i); else S.sel.delete(x.i); });
      l.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(updateTile);
    } else { toggle(i); updateTile(S.items[i]); }
    S.last = i; S.confirm = null; drawBar(); return;
  }
  var t = e.target.closest("button"); if (!t) return;
  if (t.dataset.impDay) { var day = sorted().filter(function (x) { return dayKey(x.date) === t.dataset.impDay; }), all = day.every(function (x) { return S.sel.has(x.i); }); day.forEach(function (x) { if (all) S.sel.delete(x.i); else S.sel.add(x.i); updateTile(x); }); drawBar(); return; }
  if (t.dataset.impAdd) { addTo(t.dataset.impAdd); return; }
  var a2 = t.dataset.imp;
  if (a2 === "close") { hide(false); return; }
  if (a2 === "hideused") { S.hideUsed = !S.hideUsed; draw(); return; }
  if (a2 === "order") { S.newest = !S.newest; draw(); return; }
  if (a2 === "clear") { S.sel.clear(); S.confirm = null; drawGrid(); drawBar(); return; }
  if (a2 === "new") { startNewPlace(); return; }
  if (a2 === "nocfm") { S.confirm = null; drawBar(); return; }
  if (a2 === "skipdups") { addTo(S.confirm.id, "skip"); return; }
  if (a2 === "adddups") { addTo(S.confirm.id, "all"); return; }
  if (a2 === "add") {
    var v = (box.querySelector("#imp-place") || {}).value || "";
    var p = BOL.places().filter(function (x) { return placeLabel(x) === v; })[0] || BOL.places().filter(function (x) { return x.name.toLowerCase() === v.trim().toLowerCase(); })[0];
    if (!p) { S.msg = v.trim() ? 'Fandt ikke "' + v.trim() + '". Vælg et sted fra listen, der dukker op, når du skriver.' : "Skriv navnet på stedet først, og vælg det fra listen."; drawStatus(); return; }
    addTo(p.id); return;
  }
}
function onDbl(e) { var tile = e.target.closest(".imp-tile"); if (!tile) return; e.preventDefault(); toggle(+tile.dataset.i); updateTile(S.items[+tile.dataset.i]); drawBar(); openLightbox(+tile.dataset.i); }
function onChange(e) {
  if (e.target.id === "imp-dir" && e.target.files.length) { readFolder(e.target.files); return; }
  if (e.target.matches("[data-imp-album]")) { S.album = e.target.value; draw(); }
}
document.addEventListener("click", function (e) {
  if (!lb || lb.hidden) return; var t = e.target.closest("[data-lb]");
  if (!t) { if (e.target === lb) closeLightbox(); return; }
  if (t.dataset.lb === "close") closeLightbox();
  if (t.dataset.lb === "prev") stepLightbox(-1);
  if (t.dataset.lb === "next") stepLightbox(1);
  if (t.dataset.lb === "sel") { var i = +lb.dataset.i; toggle(i); updateTile(S.items[i]); drawBar(); t.textContent = S.sel.has(i) ? "Fravælg" : "Vælg"; }
});
document.addEventListener("keydown", function (e) {
  if (lb && !lb.hidden) {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
    if (e.key === " ") { e.preventDefault(); var b = lb.querySelector('[data-lb="sel"]'); if (b) b.click(); }
  }
});

/* Åbn direkte via #import, når login er tjekket */
if (location.hash === "#import") {
  var tries = 0, wait = setInterval(function () { if (BOL.loaded && BOL.loaded() || ++tries > 40) { clearInterval(wait); show(); } }, 250);
}
})();
