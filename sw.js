/* Vores Laderita – modtager push-beskeder (fx nye sager i den sorte bog). Gemmer intet. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "Vores Laderita", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Vores Laderita", {
    body: d.body || "", icon: "icon4-192.png", badge: "icon4-192.png", tag: d.tag || undefined, data: { url: d.url || "./" }
  }));
});
// Tryk på en notifikation: åbn appen og gå til sagen.
// iPhone tillader ikke, at et åbent vindue flyttes herfra (navigate), så vinduet bringes frem og får besked om, hvor det skal hen.
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    var c = list.filter(function (w) { return w.url.indexOf(self.registration.scope) === 0; })[0] || list[0];
    if (!c) return self.clients.openWindow(url);
    var f = "focus" in c ? c.focus().catch(function () {}) : Promise.resolve();
    return f.then(function () { c.postMessage({ type: "open", url: url }); });
  }).catch(function () { return self.clients.openWindow(url); }));
});
