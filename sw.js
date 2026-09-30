/* Agenda di turno: l'app resta salvata sul telefono e si apre subito, anche
   senza rete. A ogni apertura controlla in sottofondo se c'e' una versione
   nuova: se c'e', la salva e avvisa la pagina. */
const CACHE = "agenda-v2";
const CORE = ["./", "./index.html", "./medis.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
/* true quando la pagina aperta e' piu' vecchia di quella appena scaricata */
let nuova = false;

async function avvisa() {
  const finestre = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  finestre.forEach((f) => f.postMessage("agenda-nuova"));
}
self.addEventListener("message", (e) => {
  if (e.data === "agenda-ciao" && nuova && e.source) e.source.postMessage("agenda-nuova");
});

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  /* la pagina dell'app; il riquadro dei Medis e' un'altra pagina e resta la sua */
  const pagina = req.mode === "navigate" && req.destination !== "iframe";
  const nostro = url.origin === self.location.origin;
  const caratteri = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!nostro && !caratteri) return;
  const chiave = pagina ? "./index.html" : req;

  if (pagina) nuova = false;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const salvata = await c.match(chiave, { ignoreSearch: pagina });
    /* la copia va fatta subito: la pagina salvata sta per essere consegnata */
    const copia = (pagina && salvata) ? salvata.clone() : null;
    const rete = (pagina ? fetch("./index.html", { cache: "no-cache" }) : fetch(req)).then(async (res) => {
      if (res && (res.ok || res.type === "opaque")) {
        if (copia) {
          const [prima, dopo] = await Promise.all([copia.text(), res.clone().text()]);
          await c.put(chiave, res.clone());
          if (prima !== dopo) {
            nuova = true;
            setTimeout(avvisa, 1200);
          }
        } else {
          await c.put(chiave, res.clone());
        }
      }
      return res;
    }).catch(() => null);
    if (salvata) { e.waitUntil(rete); return salvata; }
    return (await rete) || new Response("Offline", { status: 503 });
  })());
});
