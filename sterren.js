/* ============================================================
   sterren.js - de ruimte om de bol, met citaten.
   window.Sterren: init(map), stop()

   Keuze: canvas 2D, geen honderden losse elementen en geen tweede
   WebGL-context (de kaart heeft die al). Een paar honderd stipjes
   met een eigen pols tekenen in een enkele requestAnimationFrame
   is goedkoper dan evenzoveel divs die de lay-out belasten.
   ============================================================ */

window.Sterren = (function(){
"use strict";

/* Pas deze regels gerust aan; er verschijnt er steeds een. */
var CITATEN = [
  "Een idee dat je niet opschrijft, was geen idee",
  "De doos is niet vol; de agenda wel",
  "Beginnen is makkelijk; twee weken later nog bezig is het werk",
  "Iedereen heeft ideeën; jij hebt ook een schroevendraaier",
  "Twijfel je tussen twee ideeën: doe de goedkoopste eerst",
  "Het beste idee van vandaag overleeft de douche van morgen niet",
  "Plannen genoeg; schoenen aan",
  "Af is mooier dan perfect"
];

/* Bij deze zoom zijn de sterren volledig zichtbaar, en hierboven weg. */
var ZOOM_VOL = 1.6;
var ZOOM_WEG = 2.8;

var map, laag, canvas, ctx, citaatEl;
var sterren = [], vallers = [];
var dpr = 1, W = 0, H = 0;
var alpha = 0, doel = 0;
var loopId = 0, vorigeTijd = 0;
var citaatIdx = -1, citaatFase = "pauze", citaatTot = 0;
var actief = false;

function stil(){
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches);
}

function css(naam){
  return (getComputedStyle(document.documentElement).getPropertyValue("--" + naam) || "").trim();
}

/* Een hex-kleur uit style.css naar losse kanalen, zodat we de
   helderheid per ster kunnen regelen zonder nieuwe strings te bouwen. */
function rgb(hex){
  var h = String(hex).replace("#", "");
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  var n = parseInt(h, 16);
  if (isNaN(n)) return [246, 240, 226];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ---------- de sterren zelf ---------- */

function maakSterren(){
  var smal = window.innerWidth < 640;
  var aantal = smal ? 120 : 330;
  var papier = rgb(css("paper") || "#f6f0e2");
  var cyaan  = rgb(css("cyan")  || "#0aa3c2");
  var magenta= rgb(css("magenta")|| "#d6337e");
  var goud   = rgb(css("gold-glow") || "#f5d98b");

  sterren = [];
  for (var i = 0; i < aantal; i++) {
    var r = Math.random();
    var kleur = papier;
    if (r > 0.94) kleur = cyaan;
    else if (r > 0.89) kleur = magenta;
    else if (r > 0.82) kleur = goud;

    sterren.push({
      x: Math.random(),
      y: Math.random(),
      /* Meest kleine spatjes, een enkele dikke klodder inkt. */
      r: (0.5 + Math.pow(Math.random(), 3) * 2.1) * (smal ? 0.9 : 1),
      basis: 0.22 + Math.random() * 0.62,
      /* Heel trage pols, elk met een eigen tempo en fase. */
      snelheid: 0.12 + Math.random() * 0.34,
      fase: Math.random() * Math.PI * 2,
      diepte: 0.25 + Math.random() * 0.75,
      kleur: kleur
    });
  }
}

function meet(){
  if (!canvas) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* Een vallende ster: zeldzaam, kort, en altijd schuin omlaag. */
function nieuweValler(){
  var vanaf = Math.random();
  vallers.push({
    x: W * (0.1 + vanaf * 0.85),
    y: H * Math.random() * 0.55,
    dx: -(160 + Math.random() * 190),
    dy: (95 + Math.random() * 130),
    leven: 0,
    duur: 0.75 + Math.random() * 0.5,
    lengte: 60 + Math.random() * 80
  });
}

function teken(t, dt){
  ctx.clearRect(0, 0, W, H);
  if (alpha <= 0.002) return;

  var rustig = stil();
  var i, s, a;

  for (i = 0; i < sterren.length; i++) {
    s = sterren[i];
    a = s.basis;
    if (!rustig) a *= 0.66 + 0.34 * Math.sin(t * s.snelheid + s.fase);
    a *= alpha * s.diepte;
    if (a <= 0.01) continue;
    ctx.fillStyle = "rgba(" + s.kleur[0] + "," + s.kleur[1] + "," + s.kleur[2] + "," + a.toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, 6.2832);
    ctx.fill();
  }

  if (rustig) { vallers.length = 0; return; }

  /* Hooguit eens per halve minuut eentje, en nooit twee tegelijk. */
  if (!vallers.length && alpha > 0.6 && Math.random() < dt / 30) nieuweValler();

  for (i = vallers.length - 1; i >= 0; i--) {
    var v = vallers[i];
    v.leven += dt;
    if (v.leven > v.duur) { vallers.splice(i, 1); continue; }
    v.x += v.dx * dt;
    v.y += v.dy * dt;
    var p = v.leven / v.duur;
    var fel = Math.sin(p * Math.PI) * 0.8 * alpha;
    var len = v.lengte;
    var nx = v.dx, ny = v.dy;
    var lengte = Math.sqrt(nx*nx + ny*ny) || 1;
    var g = ctx.createLinearGradient(v.x, v.y, v.x - nx/lengte*len, v.y - ny/lengte*len);
    g.addColorStop(0, "rgba(246,240,226," + fel.toFixed(3) + ")");
    g.addColorStop(1, "rgba(246,240,226,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(v.x, v.y);
    ctx.lineTo(v.x - nx/lengte*len, v.y - ny/lengte*len);
    ctx.stroke();
  }
}

/* ---------- de citaten ---------- */

function volgendCitaat(){
  var n = CITATEN.length;
  if (n < 2) { citaatIdx = 0; return; }
  var k = citaatIdx;
  while (k === citaatIdx) k = Math.floor(Math.random() * n);
  citaatIdx = k;
}

/* Eén klok voor alle fases, meegenomen in dezelfde lus. */
function citaatStap(t){
  if (!citaatEl) return;

  if (alpha < 0.35) {
    if (citaatFase !== "pauze") {
      citaatEl.classList.remove("op");
      citaatFase = "pauze";
      citaatTot = t + 1.2;
    }
    return;
  }
  if (t < citaatTot) return;

  if (citaatFase === "op") {
    citaatEl.classList.remove("op");
    citaatFase = "af";
    citaatTot = t + (stil() ? 0.1 : 2.2);
    return;
  }
  /* pauze of afgevaagd: de volgende regel klaarzetten en opkomen. */
  volgendCitaat();
  citaatEl.textContent = CITATEN[citaatIdx];
  /* Iets andere hoogte per citaat, zodat het niet als een banner voelt. */
  if (window.innerWidth >= 641) citaatEl.style.top = (14 + Math.random() * 24).toFixed(1) + "vh";
  else citaatEl.style.top = "";
  void citaatEl.offsetWidth;
  citaatEl.classList.add("op");
  citaatFase = "op";
  citaatTot = t + (stil() ? 9 : 2 + 9);
}

/* ---------- zoom en lus ---------- */

function leesZoom(){
  if (!map) return;
  var z = map.getZoom();
  var v = (ZOOM_WEG - z) / (ZOOM_WEG - ZOOM_VOL);
  doel = v < 0 ? 0 : (v > 1 ? 1 : v);
  /* Zachte s-curve, zodat het opkomen niet lineair aanvoelt. */
  doel = doel * doel * (3 - 2 * doel);
}

function stap(ms){
  if (!actief) return;
  loopId = requestAnimationFrame(stap);
  var t = ms / 1000;
  var dt = vorigeTijd ? Math.min(t - vorigeTijd, 0.1) : 0.016;
  vorigeTijd = t;

  /* Naar het doel toe kruipen, zodat een sprong in zoom niet knippert. */
  alpha += (doel - alpha) * Math.min(dt * 3.2, 1);
  if (Math.abs(doel - alpha) < 0.002) alpha = doel;

  if (laag) {
    laag.style.opacity = alpha.toFixed(3);
    var aan = alpha > 0.01;
    document.body.classList.toggle("ruimte", aan);
    /* De kaart heeft zelf ook een dekkende achtergrondlaag; die moet
       weg, anders kijk je tegen papier aan in plaats van de ruimte. */
    zetKaartAchtergrond(aan);
  }

  teken(t, dt);
  citaatStap(t);
}

var kaartLeeg = null;
function zetKaartAchtergrond(leeg){
  if (kaartLeeg === leeg || !map) return;
  kaartLeeg = leeg;
  try {
    if (map.getLayer && map.getLayer("bg")) {
      map.setPaintProperty("bg", "background-opacity", leeg ? 0 : 1);
    }
  } catch (e) { /* de stijl is nog niet geladen; volgende frame weer */ kaartLeeg = null; }
}

/* ---------- naar buiten ---------- */

return {
  init: function(kaart){
    if (actief) return;
    map = kaart || window.__map;
    if (!map) return;

    laag = document.getElementById("sterren");
    if (!laag) {
      laag = document.createElement("div");
      laag.id = "sterren";
      laag.setAttribute("aria-hidden", "true");
      canvas = document.createElement("canvas");
      laag.appendChild(canvas);
      /* Vooraan in de body: alles met een hogere z-index ligt erover. */
      document.body.insertBefore(laag, document.body.firstChild);
    } else {
      canvas = laag.querySelector("canvas");
    }

    citaatEl = document.getElementById("citaat");
    if (!citaatEl) {
      citaatEl = document.createElement("p");
      citaatEl.id = "citaat";
      citaatEl.setAttribute("aria-hidden", "true");
      document.body.appendChild(citaatEl);
    }

    meet();
    maakSterren();
    window.addEventListener("resize", this._resize = function(){
      meet();
      maakSterren();
    });

    map.on("zoom", leesZoom);
    map.on("move", leesZoom);
    leesZoom();

    actief = true;
    vorigeTijd = 0;
    citaatFase = "pauze";
    citaatTot = 0;
    loopId = requestAnimationFrame(stap);
  },

  stop: function(){
    actief = false;
    if (loopId) cancelAnimationFrame(loopId);
    loopId = 0;
    if (map) { map.off("zoom", leesZoom); map.off("move", leesZoom); }
    if (this._resize) window.removeEventListener("resize", this._resize);
    zetKaartAchtergrond(false);
    document.body.classList.remove("ruimte");
    if (laag) laag.remove();
    if (citaatEl) citaatEl.remove();
    laag = canvas = ctx = citaatEl = null;
    sterren = []; vallers = [];
  }
};

})();
