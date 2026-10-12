/* ============================================================
   sterren.js - de ruimte om de bol, met citaten.
   window.Sterren: init(map)

   Keuze: canvas 2D, geen honderden losse elementen en geen tweede
   WebGL-context (de kaart heeft die al). Een paar honderd stipjes
   met een eigen pols tekenen in een enkele requestAnimationFrame
   is goedkoper dan evenzoveel divs die de lay-out belasten.

   De sterren staan op een hemelbol om de wereldbol heen: elke ster
   is een richting, geen schermpunt. Draait de kaart, dan draait de
   camera om de bol en schuift de hemel de andere kant op. Het citaat
   hangt aan diezelfde hemelbol, dus het draait gewoon mee.
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

/* Alles verder dan deze diepte ligt achter de camera; niet tekenen. */
var SNEE = 0.55;
var RAD = Math.PI / 180;

var map, laag, canvas, ctx, citaatEl;
var sterren = [], vallers = [];
var dpr = 1, W = 0, H = 0, cx = 0, cy = 0, K = 1;
var alpha = 0, doel = 0;
var loopId = 0, vorigeTijd = 0;
var actief = false;

/* De stand van de hemel, los meegeteld zodat de datumgrens niets doet. */
var hemelLon = 0, hemelLat = 0, draai = 0, kanteling = 0, bolPx = 180;
var vorigeLon = null, vorigeLat = 0;
/* De assen van de camera, elke tekenbeurt opnieuw. */
var aX = [1,0,0], aY = [0,1,0], aZ = [0,0,1];

/* Citaat: een richting aan de hemel, met een eigen op- en afkomen. */
var citaatIdx = -1, citaatVec = null;
var citaatOp = 0, citaatDoel = 0, citaatTot = 0, citaatFase = "pauze";
/* De maat van de regel: een keer gemeten bij het ophangen en bij resize. */
var hw = 0, hh = 0;

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
  var aantal = smal ? 150 : 420;
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

    /* Gelijkmatig over de bol, anders klit alles op de polen. */
    var z = Math.random() * 2 - 1;
    var hoek = Math.random() * Math.PI * 2;
    var straal = Math.sqrt(1 - z * z);

    sterren.push({
      vx: straal * Math.cos(hoek),
      vy: z,
      vz: straal * Math.sin(hoek),
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
  cx = W / 2;
  cy = H / 2;
  /* Stereografisch: K is de afstand op het scherm van een ster die
     precies opzij staat. Ruim genoeg om de hoeken te vullen. */
  K = 0.55 * Math.sqrt(W * W + H * H) / 2;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ---------- de hemelbol ---------- */

/* Hoe ver de hemel meedraait met de bol. Verder uitgezoomd is de bol
   kleiner en mag de hemel ruimer meeschuiven; dichterbij niet. */
function parallax(z){
  return 0.7 / (1 + 0.45 * Math.max(0, z - 1));
}

/* Alleen het verschil sinds de vorige stand telt mee, opgeteld in een
   eigen hoek. Zo is de sprong van +180 naar -180 graden onzichtbaar. */
function leesKaart(){
  if (!map) return;

  var z = map.getZoom();
  var v = (ZOOM_WEG - z) / (ZOOM_WEG - ZOOM_VOL);
  doel = v < 0 ? 0 : (v > 1 ? 1 : v);
  /* Zachte s-curve, zodat het opkomen niet lineair aanvoelt. */
  doel = doel * doel * (3 - 2 * doel);

  var c = map.getCenter();
  if (vorigeLon === null) { vorigeLon = c.lng; vorigeLat = c.lat; }
  var dLon = c.lng - vorigeLon;
  while (dLon > 180) dLon -= 360;
  while (dLon < -180) dLon += 360;
  var dLat = c.lat - vorigeLat;
  vorigeLon = c.lng; vorigeLat = c.lat;

  var p = parallax(z);
  hemelLon += dLon * p * RAD;
  hemelLat += dLat * p * RAD;
  if (hemelLat > 1.35) hemelLat = 1.35;
  if (hemelLat < -1.35) hemelLat = -1.35;

  /* Hoe groot de bol zelf op het scherm staat; daar moet het citaat
     buiten blijven, anders staat de tekst over de aarde heen. Gemeten,
     niet geraden: een punt 90 graden van het midden ligt op de rand. */
  var cp = map.project(c), rp = map.project([c.lng, c.lat >= 0 ? c.lat - 90 : c.lat + 90]);
  bolPx = Math.hypot(rp.x - cp.x, rp.y - cp.y);

  draai = (map.getBearing() || 0) * RAD;
  kanteling = (map.getPitch() || 0) * RAD * 0.6;

  /* De lus stond stil en er komt iets te zien: weer tekenen. */
  if (doel > 0 && actief && !loopId) { vorigeTijd = 0; loopId = requestAnimationFrame(stap); }
}

/* De drie camera-assen: aX naar rechts, aY omhoog, aZ van ons af.
   Een ster met v.aZ < 0 staat voor ons, buiten de bol om. */
function zetAssen(){
  var sl = Math.sin(hemelLon), cl = Math.cos(hemelLon);
  var sf = Math.sin(hemelLat), cf = Math.cos(hemelLat);

  var n  = [cf*cl, sf, cf*sl];            /* de kant waar we vandaan kijken */
  var oo = [-sl, 0, cl];                  /* oost */
  var no = [-sf*cl, cf, -sf*sl];          /* noord */

  var ck = Math.cos(kanteling), sk = Math.sin(kanteling);
  var u = [no[0]*ck - n[0]*sk, no[1]*ck - n[1]*sk, no[2]*ck - n[2]*sk];
  aZ    = [no[0]*sk + n[0]*ck, no[1]*sk + n[1]*ck, no[2]*sk + n[2]*ck];

  var cb = Math.cos(draai), sb = Math.sin(draai);
  aX = [oo[0]*cb - u[0]*sb, oo[1]*cb - u[1]*sb, oo[2]*cb - u[2]*sb];
  aY = [oo[0]*sb + u[0]*cb, oo[1]*sb + u[1]*cb, oo[2]*sb + u[2]*cb];
}

function dot(v, a){ return v[0]*a[0] + v[1]*a[1] + v[2]*a[2]; }

/* Van een richting naar een schermpunt; null als hij achter ons hangt. */
function opScherm(v){
  var z = dot(v, aZ);
  if (z > SNEE) return null;
  var f = K / (1 - z);
  return {x: cx + dot(v, aX) * f, y: cy - dot(v, aY) * f, z: z};
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
  var i, s, a, z, f, sx, sy;

  for (i = 0; i < sterren.length; i++) {
    s = sterren[i];
    z = s.vx*aZ[0] + s.vy*aZ[1] + s.vz*aZ[2];
    if (z > SNEE) continue;
    f = K / (1 - z);
    sx = cx + (s.vx*aX[0] + s.vy*aX[1] + s.vz*aX[2]) * f;
    if (sx < -6 || sx > W + 6) continue;
    sy = cy - (s.vx*aY[0] + s.vy*aY[1] + s.vz*aY[2]) * f;
    if (sy < -6 || sy > H + 6) continue;

    a = s.basis;
    if (!rustig) a *= 0.66 + 0.34 * Math.sin(t * s.snelheid + s.fase);
    a *= alpha * s.diepte;
    if (a <= 0.01) continue;
    ctx.fillStyle = "rgba(" + s.kleur[0] + "," + s.kleur[1] + "," + s.kleur[2] + "," + a.toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(sx, sy, s.r, 0, 6.2832);
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

/* De nieuwe regel komt naast de bol te hangen, niet erachter: een hoek
   van ruim vijftig graden uit het midden, in de bovenste helft van het
   beeld. Zo staat er altijd een citaat binnen handbereik. */
function hangCitaatOp(){
  /* Niet in graden maar in schermafstand mikken: op een smal scherm
     hoort dezelfde hoek veel verder naar buiten, en dan valt de regel
     van het scherm. Terugrekenen via de stereografische straal. */
  var kort = Math.min(W, H);
  /* Ruim buiten de bol beginnen, anders komt de regel al flauw op. */
  var straal = Math.max(0.34 * kort, bolPx + 130) + Math.random() * 0.16 * kort;
  var hoek = 2 * Math.atan(straal / K);
  /* Smal scherm: boven de bol, want naast de bol is geen ruimte. */
  var az = (W < 640 ? (62 + Math.random() * 56) : (28 + Math.random() * 124)) * RAD;
  var ch = Math.cos(hoek), sh = Math.sin(hoek);
  var ca = Math.cos(az) * sh, sa = Math.sin(az) * sh;
  citaatVec = [
    -aZ[0]*ch + aX[0]*ca + aY[0]*sa,
    -aZ[1]*ch + aX[1]*ca + aY[1]*sa,
    -aZ[2]*ch + aX[2]*ca + aY[2]*sa
  ];
  meetCitaat();
}

function meetCitaat(){
  var vak = citaatEl.getBoundingClientRect();
  hw = vak.width / 2 + 8; hh = vak.height / 2 + 8;
}

/* Eén klok voor alle fases, meegenomen in dezelfde lus. */
function citaatStap(t, dt){
  if (!citaatEl) return;

  var rustig = stil();
  var rand = 0;

  /* Waar hangt hij nu; hoe verder uit het midden, hoe zwakker. */
  if (citaatVec) {
    var pt = opScherm(citaatVec);
    if (pt) {
      rand = 1;
      /* Naar binnen toe: over de bol heen is de regel niet te lezen. */
      var afst = Math.sqrt((pt.x - cx)*(pt.x - cx) + (pt.y - cy)*(pt.y - cy));
      var binnen = bolPx + 30;
      if (afst < binnen) rand = 0;
      else if (afst < binnen + 90) rand = (afst - binnen) / 90;

      /* Naar buiten toe: hoe verder de regel het beeld uit loopt, hoe
         zwakker. Hij wordt tegen de rand gehouden zodat je hem nog ziet
         weggaan, en is weg voordat hij half wegvalt. */
      var buiten = Math.max(0, hw - pt.x, pt.x - (W - hw), hh - pt.y, pt.y - (H - hh));
      if (buiten > 0) rand *= Math.max(0, 1 - buiten / 140);
      if (hw * 2 < W) pt.x = Math.max(hw, Math.min(W - hw, pt.x));
      if (hh * 2 < H) pt.y = Math.max(hh, Math.min(H - hh, pt.y));
      citaatEl.style.transform =
        "translate(" + pt.x.toFixed(1) + "px," + pt.y.toFixed(1) + "px) " +
        "translate(-50%,-50%) rotate(" + (-draai / RAD).toFixed(2) + "deg)";
    }
  }

  if (alpha < 0.35) {
    citaatDoel = 0;
    if (citaatFase !== "pauze") { citaatFase = "pauze"; citaatTot = t + 1.2; }
  } else if (t >= citaatTot) {
    if (citaatFase === "op") {
      citaatDoel = 0;
      citaatFase = "af";
      citaatTot = t + (rustig ? 0.1 : 2.2);
    } else {
      /* pauze of afgevaagd: de volgende regel klaarzetten en opkomen. */
      volgendCitaat();
      citaatEl.textContent = CITATEN[citaatIdx];
      hangCitaatOp();
      /* Van nul af opkomen, ook als de vorige net werd weggedraaid. */
      citaatOp = 0;
      citaatDoel = 1;
      citaatFase = "op";
      citaatTot = t + (rustig ? 9 : 11);
      rand = 1;
    }
  } else if (citaatFase === "op" && rand <= 0) {
    /* Uit beeld gedraaid: na een seconde een nieuwe plek zoeken. Op een
       smal scherm past soms geen enkele plek; dan niet elke beeldwisseling
       opnieuw proberen en de tekst herschrijven. */
    citaatFase = "af";
    citaatTot = t + 1;
  }

  var stap = rustig ? 1 : Math.min(dt * 0.6, 1);
  citaatOp += (citaatDoel - citaatOp) * stap;
  if (citaatOp < 0.002) citaatOp = 0;
  citaatEl.style.opacity = (citaatOp * rand * Math.min(1, alpha * 1.4)).toFixed(3);
}

/* ---------- lus ---------- */

function stap(ms){
  if (!actief) return;
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

  zetAssen();
  teken(t, dt);
  citaatStap(t, dt);

  /* Niets te zien en niets onderweg: stilstaan tot de kaart weer beweegt. */
  loopId = (alpha === 0 && doel === 0) ? 0 : requestAnimationFrame(stap);
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
    /* Alleen opnieuw meten; de hemel blijft staan. Een nieuwe hemel alleen
       als het scherm van smal naar breed omslaat (ander aantal sterren). */
    var wasSmal = window.innerWidth < 640;
    window.addEventListener("resize", function(){
      meet();
      var smal = window.innerWidth < 640;
      if (smal !== wasSmal) { wasSmal = smal; maakSterren(); }
      if (citaatVec) meetCitaat();
    });

    /* Zoomen, draaien en kantelen sturen allemaal ook "move". */
    map.on("move", leesKaart);
    vorigeLon = null;
    leesKaart();
    zetAssen();

    actief = true;
    vorigeTijd = 0;
    citaatOp = 0; citaatDoel = 0;
    citaatFase = "pauze";
    citaatTot = 0;
    loopId = requestAnimationFrame(stap);
  }
};

})();
