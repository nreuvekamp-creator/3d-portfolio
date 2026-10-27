/* ============================================================
   globe.js - de wereldbol op aquarelpapier.
   window.Globe: init(data), reveal()
   ============================================================ */

window.Globe = (function(){
"use strict";

/* De aquarel staat in deze repo zelf (tiles/watercolor, zoom 0 tot 5).
   Reden: het Cooper Hewitt archief stuurt geen CORS-kop mee, dus WebGL mag die
   tegels niet gebruiken. Eigen domein heeft dat probleem niet. */
var WATERCOLOR = "tiles/watercolor/{z}/{x}/{y}.jpg";
/* Vanaf zoom 6 is de aquarel op; dan schuift er een lichte kaart overheen zodat
   je tot straatniveau kunt blijven zoomen. */
var DIEP = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
/* Let op: deze Esri-diensten zetten de tegel-y voor de x. */
var LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
var ATTR = 'Aquarel: <a href="http://maps.stamen.com/">Stamen Design</a>, CC BY 3.0 &middot; ' +
           'data <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; kaart en labels Esri';

var STUDY_LABEL = {bi:"Business Innovation", cmd:"Communication and Multimedia Design",
                   wb:"Werktuigbouwkunde", honours:"Honours", stage:"Stage"};
var CONTEXT_LABEL = {studie:"Binnen studie", extracurriculair:"Extracurriculair", prive:"Privé"};
var MONTHS = ["januari","februari","maart","april","mei","juni",
              "juli","augustus","september","oktober","november","december"];

var trips, map, panel, ink = {}, toetsLijst = null;
/* Het enige onderscheid dat er nog is: de dossiermap open of dicht. */
var priveOpen = false;
var tafel = null, tafelOpen = false;
var gelezen = {}, postMap = null, postStapel = null, postTeller = null, postOpen = false;
/* De leesvolgorde: oudste vooraan, laatst gelezen achteraan. */
var gelezenOrde = [], postVellen = {};
var dichtBezig = false, dichtStart = 0, sluitKnop = null;

function stil(){
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
}

/* ------------------------------------------------------------
   Fotos: per reis het gevonden adres, en dat onthouden.
   fotoReg[id] is het adres van de foto, of null als er bij deze reis
   geen foto is. Alleen de gevonden fotos gaan de opslag in; een reis
   zonder foto wordt alleen voor dit bezoek onthouden, zodat een later
   toegevoegde foto bij de volgende keer toch verschijnt. localStorage
   zit in een try/catch, want een privevenster mag daar niet aan.
   ------------------------------------------------------------ */

var FOTO_SLEUTEL = "ideeendoos.fotos.v2";
var fotoReg = {};

function leesFotoGeheugen(){
  try{
    var o = JSON.parse(window.localStorage.getItem(FOTO_SLEUTEL)) || {};
    Object.keys(o).forEach(function(id){ if (o[id]) fotoReg[id] = o[id]; });
  }catch(e){}
}

function bewaarFotoGeheugen(){
  try{
    var o = {};
    Object.keys(fotoReg).forEach(function(id){ if (fotoReg[id]) o[id] = fotoReg[id]; });
    window.localStorage.setItem(FOTO_SLEUTEL, JSON.stringify(o));
  }catch(e){}
}

/* De inkten staan in style.css; hier alleen uitlezen. */
function leesInkten(){
  var cs = getComputedStyle(document.documentElement);
  ["cyan","magenta","yellow","key","paper","paper-2","ink-faint"].forEach(function(n){
    ink[n] = (cs.getPropertyValue("--" + n) || "").trim();
  });
}

function dateLabel(d){
  if (!d) return "";
  var p = String(d).split("-");
  if (p.length > 1) {
    var m = parseInt(p[1], 10);
    if (m >= 1 && m <= 12) return MONTHS[m-1] + " " + p[0];
  }
  return p[0];
}

/* ---------- filters ---------- */

/* Er is nog maar een onderscheid: wat je zomaar mag zien, en wat niet.
   De rest van de filters is eruit; ze werkten niet. */
function bouwMappen(){
  var knop = document.getElementById("tabGeheim");
  var fluister = document.getElementById("fluister");
  if (!knop) return;

  knop.addEventListener("click", function(){
    if (priveOpen) return;                 /* eenmalig: hij gaat niet meer dicht */
    priveOpen = true;
    knop.setAttribute("aria-pressed", "true");
    knop.classList.add("open");
    /* Na de klik blijft er niets staan: alleen de open map. */
    if (fluister) setTimeout(function(){ fluister.textContent = ""; }, 700);
    vliegNaarBuiten();
  });
}

/* De privestukken vliegen vanuit het mapje naar hun plek op de wereld. */
function vliegNaarBuiten(){
  var knop = document.getElementById("tabGeheim");
  if (!knop || !map) { refresh(); return; }
  if (stil()) { refresh(); return; }

  var start = knop.getBoundingClientRect();
  var x0 = start.left + start.width / 2;
  var y0 = start.top + start.height / 2;

  var stukken = trips.filter(function(t){ return t.context === "prive"; });
  var laag = document.createElement("div");
  laag.className = "vlucht";
  document.body.appendChild(laag);

  stukken.forEach(function(t, i){
    var doel = map.project([t.lon, t.lat]);
    var el = document.createElement("div");
    el.className = "brief";
    el.style.left = x0 + "px";
    el.style.top = y0 + "px";
    el.style.setProperty("--dx", (doel.x - x0).toFixed(0) + "px");
    el.style.setProperty("--dy", (doel.y - y0).toFixed(0) + "px");
    el.style.setProperty("--del", (i * 70) + "ms");
    el.style.setProperty("--tol", ((Math.random() - 0.5) * 520).toFixed(0) + "deg");
    laag.appendChild(el);
  });

  /* Pas als ze geland zijn, verschijnen de echte pins eronder. */
  setTimeout(function(){ refresh(); }, 900);
  setTimeout(function(){ laag.remove(); }, 2600 + stukken.length * 70);
}

function visible(t){ return t.context !== "prive" || priveOpen; }

/* ---------- schoon beginnen ---------- */

/* Alles wat de site onthoudt staat onder een eigen naam in localStorage:
   de gelezen post met de volgorde, en het fotogeheugen. Zet ?opnieuw achter
   het webadres en dat gaat allemaal weg; de privéschakelaar staat na een
   herlaadactie toch weer uit. Daarna halen we ?opnieuw uit de adresbalk,
   zodat een herlaadactie niet nog eens wist. In het postmapje zit dezelfde
   knop, voor als de adresbalk niet in beeld is. */
var OPSLAG_VOOR = "ideeendoos.";

function wisGeheugen(){
  try{
    var weg = [];
    for (var i = 0; i < window.localStorage.length; i++) {
      var k = window.localStorage.key(i);
      if (k && k.indexOf(OPSLAG_VOOR) === 0) weg.push(k);
    }
    weg.forEach(function(k){ window.localStorage.removeItem(k); });
  }catch(e){}
  gelezen = {}; gelezenOrde = []; fotoReg = {};
  priveOpen = false;
}

function misschienOpnieuw(){
  if (!/(?:^|[?&])opnieuw(?:=|&|$)/.test(window.location.search)) return;
  wisGeheugen();
  try{
    var zoek = window.location.search
      .replace(/(^\?|&)opnieuw(=[^&]*)?/g, "$1")
      .replace(/^\?&/, "?").replace(/^\?$/, "");
    window.history.replaceState(null, "", window.location.pathname + zoek + window.location.hash);
  }catch(e){}
}

/* ---------- gelezen post ---------- */

var GELEZEN_SLEUTEL = "ideeendoos.gelezen.v1";

function leesGelezen(){
  try{
    var rauw = window.localStorage.getItem(GELEZEN_SLEUTEL);
    if (!rauw) return;
    (JSON.parse(rauw) || []).forEach(function(id){
      if (gelezen[id]) return;
      gelezen[id] = true;
      gelezenOrde.push(id);
    });
  }catch(e){}
}

function bewaarGelezen(){
  try{
    window.localStorage.setItem(GELEZEN_SLEUTEL, JSON.stringify(gelezenOrde));
  }catch(e){}
}

/* Wie je leest gaat bovenop de stapel; een oude brief die je opnieuw
   pakt verhuist dus terug naar boven. */
function markeerGelezen(id){
  var nieuw = !gelezen[id];
  var plek = gelezenOrde.indexOf(id);
  if (!nieuw && plek === gelezenOrde.length - 1) return;
  if (plek >= 0) gelezenOrde.splice(plek, 1);
  gelezen[id] = true;
  gelezenOrde.push(id);
  bewaarGelezen();
  if (nieuw) refresh();
  vulPostmap();
}

function features(){
  return trips.filter(visible).map(function(t){
    return {
      type: "Feature",
      geometry: {type: "Point", coordinates: [t.lon, t.lat]},
      properties: {id: t.id, title: t.title, icoon: icoonNaam(t, !!gelezen[t.id])}
    };
  });
}

function refresh(){
  var feats = features();
  var src = map && map.getSource("trips");
  if (src) src.setData({type: "FeatureCollection", features: feats});
  var c = document.getElementById("count");
  if (c) c.textContent = feats.length + (feats.length === 1 ? " plek" : " plekken");

  /* Voor toetsenbord en schermlezer: de envelopjes zijn tekeningen op het
     canvas, dus hier een onzichtbare knop per reis. Alleen opnieuw bouwen
     als er reizen bijkomen, anders raakt de focus kwijt. */
  if (!toetsLijst || toetsLijst.children.length === feats.length) return;
  toetsLijst.textContent = "";
  feats.forEach(function(f){
    var li = document.createElement("li"), b = document.createElement("button");
    b.type = "button";
    b.textContent = f.properties.title;
    b.addEventListener("click", function(){ openTrip(f.properties.id); });
    li.appendChild(b);
    toetsLijst.appendChild(li);
  });
}

/* ---------- de envelopjes op de kaart ---------- */

/* MapLibre wil rauwe pixels, geen canvas. Daarom tekenen we het envelopje op
   een canvas op dubbele grootte en geven we de ImageData door met pixelRatio 2;
   dan blijft de vouwlijn scherp op een retinascherm. */
var PR = 2;

function nieuwVel(w, h){
  var c = document.createElement("canvas");
  c.width = w * PR; c.height = h * PR;
  var g = c.getContext("2d");
  g.scale(PR, PR);
  return {canvas: c, g: g, w: w, h: h};
}

function alsIcoon(vel){
  var d = vel.g.getImageData(0, 0, vel.canvas.width, vel.canvas.height);
  return {width: d.width, height: d.height, data: d.data};
}

/* ------------------------------------------------------------
   De postzegel: het land kiest de kleur, de reis kiest de vorm.
   De kleuren worden gemengd uit de vier inkten van style.css; er
   komt hier geen nieuwe kleur bij. Per land een korte reden.
   ------------------------------------------------------------ */

function hex(c){
  c = String(c || "").trim();
  var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (!m) return [120,110,100];
  var h = m[1];
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

/* Meng de inkten zoals een pers dat doet: delen van elke plaat. */
function meng(delen){
  var r = 0, g = 0, b = 0, som = 0;
  Object.keys(delen).forEach(function(naam){
    var d = delen[naam], kl = hex(ink[naam]);
    r += kl[0] * d; g += kl[1] * d; b += kl[2] * d; som += d;
  });
  if (!som) return "#7a6e62";
  var f = function(v){ return Math.max(0, Math.min(255, Math.round(v / som))); };
  return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")";
}

/* Elk land zijn eigen inkt, gemengd uit cyaan, magenta, geel en zwart. */
var LAND_MENG = {
  "Nederland":  {yellow:.72, magenta:.28},            /* oranje: de kleur van thuis */
  "België":     {yellow:.86, key:.14},                /* geel met een zwarte rand, als de vlag */
  "Frankrijk":  {cyan:.52, magenta:.22, key:.26},     /* diep blauw, het blauw van de driekleur */
  "Spanje":     {magenta:.46, yellow:.54},            /* rood en geel samen: de vlag */
  "Italië":     {cyan:.5, yellow:.5},                 /* groen, de eerste baan van de vlag */
  "Oostenrijk": {magenta:.58, key:.42},               /* donker wijnrood, het rood van de Alpenvlag */
  "Denemarken": {magenta:.92, yellow:.08},            /* helder rood: de Dannebrog */
  "Noorwegen":  {cyan:.46, magenta:.34, key:.2},      /* indigo: de vlag is blauw met rood */
  "Finland":    {cyan:.62, paper:.38},                /* licht meerblauw op sneeuw */
  "Japan":      {magenta:.78, yellow:.14, key:.08},   /* de zonnerode schijf */
  "Zuid-Korea": {cyan:.5, magenta:.5}                 /* rood en blauw van de taegeuk samen: paars */
};

function zegelKleur(t){
  var recept = LAND_MENG[t.country];
  if (!recept) return ink["ink-faint"] || "#a2927f";
  return meng(recept);
}

/* Een vaste, maar per reis andere vorm: twee reizen uit hetzelfde land
   krijgen zo niet dezelfde zegel. */
function vormVan(t){
  var h = 0, id = String(t.id);
  for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return h % 5;
}

var ZEGELVORM = [
  {w:9,  h:7,   tand:false, stempel:false},   /* liggend, glad gesneden */
  {w:7,  h:9.5, tand:true,  stempel:false},   /* staand, getand */
  {w:7,  h:7,   tand:true,  stempel:true},    /* klein vierkant, afgestempeld */
  {w:11, h:6.5, tand:false, stempel:true},    /* breed, afgestempeld */
  {w:8,  h:8.5, tand:true,  stempel:false}    /* bijna vierkant, getand */
];

function tekenZegel(g, zx, zy, kleur, vorm){
  var v = ZEGELVORM[vorm] || ZEGELVORM[0];
  var w = v.w, h = v.h;

  g.fillStyle = kleur;
  g.fillRect(zx, zy, w, h);

  /* De getande rand: kleine papierkleurige hapjes uit de zijkanten. */
  if (v.tand) {
    g.fillStyle = "#fdf8ec";
    var stap = 2.2, r = .85, x, y;
    for (x = zx + stap / 2; x < zx + w; x += stap) {
      g.beginPath(); g.arc(x, zy, r, 0, 6.284); g.fill();
      g.beginPath(); g.arc(x, zy + h, r, 0, 6.284); g.fill();
    }
    for (y = zy + stap / 2; y < zy + h; y += stap) {
      g.beginPath(); g.arc(zx, y, r, 0, 6.284); g.fill();
      g.beginPath(); g.arc(zx + w, y, r, 0, 6.284); g.fill();
    }
  }

  /* De afstempeling: drie golven van de post er dwars overheen. */
  if (v.stempel) {
    g.save();
    g.strokeStyle = "rgba(36,31,28,.55)";
    g.lineWidth = .7;
    for (var k = 0; k < 3; k++) {
      var yy = zy + h * (.28 + k * .22);
      g.beginPath();
      g.moveTo(zx - 1.5, yy + 1.2);
      g.lineTo(zx + w + 1.5, yy - 1.2);
      g.stroke();
    }
    g.restore();
  }

  g.strokeStyle = "rgba(253,248,236,.9)";
  g.lineWidth = 1.1;
  g.strokeRect(zx - .4, zy - .4, w + .8, h + .8);
}

/* De naam waaronder het icoon bij de kaart bekend staat. */
function icoonNaam(t, open){
  var land = String(t.country || "onbekend").replace(/[^a-zA-Z]/g, "");
  return "env-" + (open ? "o" : "d") + "-" + land + "-" + vormVan(t) + (t.todo ? "-t" : "");
}

/* Een envelopje: papier, twee flapnaden, een klep en een postzegel in
   de kleur van het land. Open is hij herkenbaar anders: de klep staat
   omhoog en er steekt een brief uit, ook als het icoon klein is. */
function tekenEnvelop(zegel, flauw, vorm, open){
  var w = 40, h = 27, m = 3, kop = 13;   /* kop = ruimte voor de opstaande klep */
  var vel = nieuwVel(w + m * 2, h + m * 2 + kop);
  var g = vel.g;
  var x = m, y = m + kop, bw = w, bh = h;

  g.globalAlpha = flauw ? .55 : 1;

  /* De brief die er bij een geopende envelop uitsteekt. */
  if (open) {
    g.save();
    g.translate(x + bw / 2, y);
    g.rotate(-.05);
    g.shadowColor = "rgba(70,55,35,.3)";
    g.shadowBlur = 3; g.shadowOffsetY = 1;
    g.fillStyle = "#fffdf6";
    g.fillRect(-bw * .38, -14, bw * .76, 20);
    g.restore();
    g.strokeStyle = "rgba(36,31,28,.6)";
    g.lineWidth = 1;
    g.save();
    g.translate(x + bw / 2, y);
    g.rotate(-.05);
    g.strokeRect(-bw * .38, -14, bw * .76, 20);
    /* drie regeltjes schrift, zodat je ziet dat het een brief is */
    g.strokeStyle = "rgba(60,45,26,.4)";
    g.lineWidth = .9;
    for (var r = 0; r < 3; r++) {
      g.beginPath();
      g.moveTo(-bw * .3, -10 + r * 3.6);
      g.lineTo(bw * .3, -10 + r * 3.6);
      g.stroke();
    }
    g.restore();
  }

  g.save();
  g.shadowColor = "rgba(70,55,35,.38)";
  g.shadowBlur = 4; g.shadowOffsetY = 2;
  g.fillStyle = "#fdf8ec";
  g.fillRect(x, y, bw, bh);
  g.restore();

  /* De twee zijflappen en de onderflap, als lichte vouwen. */
  g.strokeStyle = "rgba(60,45,26,.26)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y + bh); g.lineTo(x + bw / 2, y + bh * .46); g.lineTo(x + bw, y + bh);
  g.stroke();

  if (open) {
    /* De klep ligt naar achteren opengeslagen: een driehoek boven de rand. */
    g.fillStyle = "#f3ead4";
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + bw / 2, y - bh * .52); g.lineTo(x + bw, y); g.closePath();
    g.fill();
    g.strokeStyle = "rgba(60,45,26,.62)";
    g.lineWidth = 1.2;
    g.stroke();
  } else {
    /* De klep die je straks opent. */
    g.fillStyle = "rgba(60,45,26,.07)";
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + bw / 2, y + bh * .60); g.lineTo(x + bw, y); g.closePath();
    g.fill();
    g.strokeStyle = "rgba(60,45,26,.52)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x + bw / 2, y + bh * .60); g.lineTo(x + bw, y);
    g.stroke();
  }

  tekenZegel(g, x + 3.5, y + (open ? bh - 11 : 3), zegel, vorm);

  /* De rand van de envelop zelf, als laatste zodat hij bovenop ligt. */
  g.strokeStyle = "rgba(36,31,28,.78)";
  g.lineWidth = 1.3;
  g.strokeRect(x + .5, y + .5, bw - 1, bh - 1);

  return alsIcoon(vel);
}

/* Een stapeltje enveloppen voor een cluster: drie vellen die scheef op
   elkaar liggen, met ruimte in het midden voor het aantal. */
function tekenStapel(){
  var w = 46, h = 34, m = 5;
  var vel = nieuwVel(w + m * 2, h + m * 2);
  var g = vel.g;
  var lagen = [
    {dx: -3.5, dy: 3.5, r: -.13},
    {dx: 3, dy: 1, r: .10},
    {dx: 0, dy: -2.5, r: -.02}
  ];
  lagen.forEach(function(l, i){
    g.save();
    g.translate(m + w / 2 + l.dx, m + h / 2 + l.dy);
    g.rotate(l.r);
    g.shadowColor = "rgba(70,55,35,.34)";
    g.shadowBlur = 4; g.shadowOffsetY = 2;
    g.fillStyle = i === 2 ? "#fffcf3" : "#f4ecd8";
    g.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
    g.restore();

    g.save();
    g.translate(m + w / 2 + l.dx, m + h / 2 + l.dy);
    g.rotate(l.r);
    g.strokeStyle = "rgba(36,31,28,.7)";
    g.lineWidth = 1.2;
    g.strokeRect(-w / 2 + 4.5, -h / 2 + 4.5, w - 9, h - 9);
    if (i === 2) {
      g.strokeStyle = "rgba(60,45,26,.45)";
      g.beginPath();
      g.moveTo(-w / 2 + 4.5, -h / 2 + 4.5);
      g.lineTo(0, -h / 2 + 4.5 + (h - 9) * .55);
      g.lineTo(w / 2 - 4.5, -h / 2 + 4.5);
      g.stroke();
    }
    g.restore();
  });
  return alsIcoon(vel);
}

function zetIconen(){
  if (!map.hasImage("envelop-stapel"))
    map.addImage("envelop-stapel", tekenStapel(), {pixelRatio: PR});
  /* Per reis twee iconen: dicht en, als je hem gelezen hebt, open. */
  trips.forEach(function(t){
    [false, true].forEach(function(op){
      var naam = icoonNaam(t, op);
      if (map.hasImage(naam)) return;
      map.addImage(naam, tekenEnvelop(zegelKleur(t), !!t.todo, vormVan(t), op), {pixelRatio: PR});
    });
  });
}

/* ---------- het vel papier ---------- */

/* Alle stappen van de opening lopen op een klok; bij een nieuwe klik
   moet die klok eerst stil, anders lopen twee brieven door elkaar. */
var timers = [], envLaag = null, huidig = null;

function later(fn, ms){ timers.push(setTimeout(fn, ms)); }
function stopTimers(){ timers.forEach(clearTimeout); timers = []; }

function openTrip(id){
  var t = trips.filter(function(x){ return x.id === id; })[0];
  if (!t) return;

  /* Deze pin is geen kaartje maar een deur: je loopt de zaal binnen. */
  if (t.zaal && window.Zaal) { closePanel(); Zaal.open(); return; }

  stopTimers();
  /* stopTimers wist ook de klok die de sluitvlag terugzet; hier dus zelf. */
  dichtBezig = false;
  kaartRust(false);
  ruimEnvelopOp();
  vulPaneel(t);

  var doel = {center: [t.lon, t.lat], zoom: Math.max(map.getZoom(), 4.5)};

  /* De foto wordt vast gezocht, maar hij mag pas komen als de brief openligt. */
  var beurt = {geladen: false, mag: false, img: null, trip: t};
  huidig = beurt;
  zoekFoto(t, function(img){
    if (huidig !== beurt) return;
    beurt.geladen = true;
    beurt.img = img;
    if (beurt.mag) plaatsFoto(beurt);
  });

  if (stil()) {
    knopTerug();
    panel.classList.remove("ontvouwt", "vouwt");
    panel.classList.add("open");
    panel.inert = false;
    beurt.mag = true;
    if (beurt.geladen) plaatsFoto(beurt);
    map.jumpTo(doel);
    markeerGelezen(t.id);
    return;
  }

  /* Ook vouwt eraf: die klasse werd door een klok weggehaald, en een nieuwe
     klik stopt alle klokken; bleef hij staan, dan bleef de brief onzichtbaar. */
  panel.classList.remove("open", "ontvouwt", "vouwt");
  panel.inert = true;
  var p = map.project([t.lon, t.lat]);

  /* De volgorde: (a) het envelopje groeit en komt naar je toe,
     (b) de klep klapt open, (c) de kaart schuift eruit,
     (d) de kaart vouwt open tot de brief, (e) de foto komt aanvliegen. */
  document.body.classList.add("bezig");
  knopLos();
  speelEnvelop(p, t);
  /* De bol vliegt meteen mee en is klaar voordat de brief opengaat; liepen ze
     samen, dan vochten de kaart en de brief om dezelfde beeldjes. */
  map.easeTo(Object.assign({duration: 1150}, doel));
  later(function(){
    kaartRust(true);
    ontvouw(p);
  }, 1300);
  later(function(){
    if (huidig !== beurt) return;
    beurt.mag = true;
    if (beurt.geladen) plaatsFoto(beurt);
  }, 2380);
  /* Zodra de brief plat ligt mag je de bol weer pakken; de menglaag over
     het hele scherm blijft uit tot ook de foto geland is. */
  later(function(){ kaartRust(false); knopTerug(); }, 2420);
  later(function(){ document.body.classList.remove("bezig"); }, 3420);
  /* Pas als de brief openligt telt hij als gelezen. */
  later(function(){ markeerGelezen(t.id); }, 2450);
}

/* De bol laten rusten: hij tekent anders continu door terwijl de brief
   opengaat, en dan is er geen rekenkracht over voor de beweging zelf. */
var rustte = false;
function kaartRust(aan){
  if (!map || rustte === aan) return;
  rustte = aan;
  var h = ["scrollZoom", "dragPan", "dragRotate", "boxZoom", "keyboard", "doubleClickZoom", "touchZoomRotate"];
  if (aan) {
    map.stop();
    h.forEach(function(n){ if (map[n]) map[n].disable(); });
  } else {
    h.forEach(function(n){ if (map[n]) map[n].enable(); });
  }
}

/* Alles wat er in de brief staat, behalve de foto: die komt later. */
function vulPaneel(t){
  document.getElementById("pPhoto").textContent = "";

  var bits = [];
  if (t.date) bits.push(dateLabel(t.date));
  if (CONTEXT_LABEL[t.context]) bits.push(CONTEXT_LABEL[t.context]);
  if (t.study && STUDY_LABEL[t.study]) bits.push(STUDY_LABEL[t.study]);
  document.getElementById("pMeta").textContent = bits.join(" : ");
  document.getElementById("pTitle").textContent = t.title;
  document.getElementById("pWhere").textContent = t.place + (t.country ? ", " + t.country : "");
  document.getElementById("pSum").textContent = t.summary || "";

  var txt = document.getElementById("pText");
  txt.textContent = "";
  if (!t.todo) {
    String(t.body || "").split(/\n\s*\n/).forEach(function(par){
      var sp = document.createElement("span");
      sp.className = "par";
      sp.textContent = par;
      txt.appendChild(sp);
    });
  }

  var links = document.getElementById("pLinks");
  links.textContent = "";
  (t.links || []).forEach(function(l){
    var a = document.createElement("a");
    a.href = l.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = l.label;
    links.appendChild(a);
  });
  links.hidden = !links.firstChild;

  var tags = document.getElementById("pTags");
  tags.textContent = "";
  (t.tags || []).forEach(function(x){
    var s = document.createElement("span");
    s.className = "tag";
    s.textContent = x;
    tags.appendChild(s);
  });

  var todo = document.getElementById("pTodo");
  if (t.todo) {
    todo.textContent = "Nog aan te vullen: " + (t.body || "deze gegevens staan nog niet vast.");
    todo.hidden = false;
  } else {
    todo.hidden = true;
  }

  if (t.country) panel.setAttribute("data-papier", t.country);
  else panel.removeAttribute("data-papier");
}

/* ---------- de foto als los kaartje ---------- */

/* Een poging, meer niet: photos/<id>.jpg (alleen .jpg wordt ondersteund).
   Gevonden gaat het adres het geheugen in; mislukt het, ook bij een eerder
   onthouden adres dat inmiddels weg is, dan wordt de regel gewist. Geen foto
   betekent geen lijst in de brief. */
function zoekFoto(t, klaar){
  if (t.id in fotoReg && !fotoReg[t.id]) { klaar(null); return; }
  var src = fotoReg[t.id] || "photos/" + t.id + ".jpg";
  var img = new Image();
  img.alt = "";
  img.onload = function(){ fotoReg[t.id] = src; bewaarFotoGeheugen(); vulPostmap(); klaar(img); };
  img.onerror = function(){ fotoReg[t.id] = null; bewaarFotoGeheugen(); klaar(null); };
  img.src = src;
}

function plaatsFoto(beurt){
  if (!beurt.img || huidig !== beurt) return;
  var t = beurt.trip;
  var photo = document.getElementById("pPhoto");
  photo.textContent = "";

  var print = document.createElement("div");
  print.className = "print";
  /* papier.css kiest hier de papiersoort bij het land. */
  if (t.country) print.setAttribute("data-papier", t.country);
  print.setAttribute("role", "button");
  print.setAttribute("tabindex", "0");
  print.setAttribute("aria-label", "Bekijk deze foto groot");
  print.addEventListener("click", function(){ legOpTafel(print, t); });
  print.addEventListener("keydown", function(e){
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); legOpTafel(print, t); }
  });

  var shot = document.createElement("div");
  shot.className = "shot";
  var img = beurt.img;
  if (img.naturalHeight > img.naturalWidth * 1.05) {
    shot.classList.add("tall");
    var bg = document.createElement("div");
    bg.className = "blur";
    bg.style.backgroundImage = "url(\"" + img.src.replace(/"/g, "%22") + "\")";
    shot.appendChild(bg);
  }
  shot.appendChild(img);
  print.appendChild(shot);

  var caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = t.place + (t.country ? ", " + t.country : "");
  print.appendChild(caption);
  photo.appendChild(print);

  if (stil()) return;
  /* Los van de kaart: hij komt van opzij aanvliegen en landt in zijn lijst. */
  print.classList.add("vliegt");
  later(function(){ print.classList.remove("vliegt"); }, 1000);
}

/* ---------- het envelopje dat opengaat ---------- */

function ruimEnvelopOp(){
  if (envLaag) { envLaag.remove(); envLaag = null; }
}

/* Een echte envelop met diepte: een bak, een klep die om zijn vouwlijn
   kantelt, en een kaart die er daarna uit schuift. Dezelfde envelop dient
   voor het openen en het sluiten; alleen de startklassen verschillen. */
function maakEnvelop(p, t, klassen){
  var laag = document.createElement("div");
  laag.className = "env3d " + klassen;
  if (t) laag.style.setProperty("--zegel", zegelKleur(t));
  laag.style.left = Math.round(p.x) + "px";
  laag.style.top = Math.round(p.y) + "px";
  laag.innerHTML =
    '<span class="env-schaduw"></span>' +
    '<span class="env-scene">' +
      '<span class="env-kaart"></span>' +
      '<span class="env-bak"><i class="env-dikte"></i></span>' +
      '<span class="env-klep"></span>' +
    '</span>';
  document.body.appendChild(laag);
  envLaag = laag;
  void laag.offsetWidth;
  return laag;
}

/* Waar de brief vandaan komt en naartoe gaat: de plek van de envelop,
   gerekend vanaf de schermrand waar het open paneel ligt (rechts op een
   breed scherm, onder op een smal scherm). Niet meten aan het paneel zelf:
   bij het openen staat dat nog buiten beeld, en dan klopt de som niet.
   De factor: de brief duikt op bij 12,5 procent van de animatie, met 0,766
   van de verschuiving en diep in het beeld (perspectief 1600px, diepte
   -260px; dat trekt alles naar het scharnier toe). 1 / (0,766 * 1600/1860)
   is 1,52, en dan ligt de eerste zichtbare stand precies op de envelop.
   Het smalle scherm (1300px, -230px) komt op dezelfde factor uit. */
var DIEPTE = 1.52;
function zetOorsprong(p){
  panel.style.setProperty("--fx", Math.round((p.x - window.innerWidth) * DIEPTE) + "px");
  panel.style.setProperty("--fy", Math.round((p.y - window.innerHeight / 2) * DIEPTE) + "px");
  panel.style.setProperty("--gx", Math.round((p.x - window.innerWidth / 2) * DIEPTE) + "px");
  panel.style.setProperty("--gy", Math.round((p.y - window.innerHeight) * DIEPTE) + "px");
}

function speelEnvelop(p, t){
  /* Vangnet: het envelopje ligt tijdens het openen in de weg; wie erop klikt
     wil niet verder, dus dat breekt de opening af. */
  var laag = maakEnvelop(p, t, "klikbaar");
  laag.addEventListener("click", function(){ vouwDicht(); });

  laag.classList.add("groeit");                                  /* a */
  later(function(){ laag.classList.add("klep-op"); }, 440);      /* b */
  later(function(){ laag.classList.add("kaart-uit"); }, 900);    /* c */
  later(function(){ laag.classList.add("weg"); }, 1300);
  later(function(){ if (envLaag === laag) ruimEnvelopOp(); }, 1900);
}

/* De kaart vouwt open tot het paneel. Alles via transform; met width of
   height hapert het, want dan moet de hele opmaak opnieuw worden gerekend. */
function ontvouw(p){
  /* De brief scharniert om zijn rechterrand (breed scherm) of om zijn
     onderrand (smal scherm); het beginpunt wordt vanaf die rand gerekend,
     zodat het kaartje echt bij de envelop vandaan komt. */
  zetOorsprong(p);
  panel.classList.add("open");
  panel.inert = false;
  void panel.offsetWidth;                  /* anders slaat de browser de animatie over */
  panel.classList.add("ontvouwt");
}

/* ---------- de foto op tafel ---------- */

function legOpTafel(print, t){
  if (tafelOpen) return;
  tafelOpen = true;
  if (!tafel) {
    tafel = document.createElement("div");
    tafel.className = "tafel";
    tafel.id = "tafel";
    tafel.setAttribute("role", "dialog");
    tafel.setAttribute("aria-label", "Foto groot");
    tafel.addEventListener("click", function(){ vanTafel(); });
    document.body.appendChild(tafel);
  }
  tafel.textContent = "";

  var kopie = print.cloneNode(true);
  kopie.removeAttribute("role");
  kopie.removeAttribute("tabindex");
  kopie.classList.remove("vliegt");
  kopie.classList.add("op-tafel");
  /* Het handgeschreven onderschrift gaat mee; zonder foto is er niets te vergroten. */
  tafel.appendChild(kopie);

  /* Vanaf de plek in het paneel naar het midden van het scherm. */
  var van = print.getBoundingClientRect();
  var doel = kopie.getBoundingClientRect();
  if (!stil() && doel.width > 0) {
    var sx = van.width / doel.width;
    var dx = (van.left + van.width / 2) - (doel.left + doel.width / 2);
    var dy = (van.top + van.height / 2) - (doel.top + doel.height / 2);
    kopie.style.setProperty("--tx", Math.round(dx) + "px");
    kopie.style.setProperty("--ty", Math.round(dy) + "px");
    kopie.style.setProperty("--ts", sx.toFixed(3));
  }
  tafel.classList.add("aan");
  void tafel.offsetWidth;
  tafel.classList.add("neer");
}

function vanTafel(){
  if (!tafelOpen || !tafel) return;
  tafelOpen = false;
  tafel.classList.remove("neer");
  var weg = function(){ if (!tafelOpen && tafel) { tafel.classList.remove("aan"); tafel.textContent = ""; } };
  if (stil()) weg();
  else setTimeout(weg, 460);
}

/* ---------- de sluitknop tijdens het openen ---------- */

/* Waarom dit nodig is: de knop zit in het paneel, en het paneel staat de
   eerste seconde nog buiten beeld en vliegt daarna in een seconde naar zijn
   plek. De knop was dus eerst onbereikbaar en daarna een bewegend doel; een
   klik kwam op de kaart terecht in plaats van op de knop. Een vaste plek via
   position:fixed helpt niet zolang de knop in het paneel zit, want een
   transform op het paneel maakt dat paneel het houvast voor alles erin.
   Daarom hangt de knop tijdens het openen even aan de pagina zelf, op de plek
   waar hij straks ook ligt, en gaat hij daarna terug de brief in. */
function knopLos(){
  if (!sluitKnop || sluitKnop.parentNode === document.body) return;
  sluitKnop.classList.add("los");
  document.body.appendChild(sluitKnop);
}

function knopTerug(){
  if (!sluitKnop || !panel || sluitKnop.parentNode === panel) return;
  sluitKnop.classList.remove("los");
  panel.insertBefore(sluitKnop, panel.firstChild);
}

/* ---------- de brief weer dichtvouwen ---------- */

/* De omgekeerde weg, en korter: eerst vouwt het vel zich op, dan komt
   de envelop terug op zijn plek op de kaart, slikt de brief in, klapt
   zijn klep dicht en krimpt terug tot het icoontje. */
function vouwDicht(){
  /* Vangnet 1: de vlag dichtBezig werd alleen door een klok teruggezet, en die
     klok werd door elke nieuwe brief stilgezet (stopTimers). Bleef de vlag
     staan, dan ging er daarna nooit meer iets dicht. Nu vervalt de vlag ook
     vanzelf, dus een tweede poging werkt altijd. */
  if (dichtBezig && Date.now() - dichtStart < 2600) return;
  dichtBezig = false;

  /* Vangnet 2: tijdens de eerste seconde van de opening heeft het paneel de
     klasse open nog niet; een klik of Escape deed toen niets en de brief ging
     alsnog open. Nu breken we de opening gewoon af. */
  if (!panel.classList.contains("open")) { closePanel(); return; }

  knopTerug();
  var beurt = huidig;
  var t = beurt && beurt.trip;
  if (stil() || !t || !map) { closePanel(); return; }
  dichtBezig = true;
  dichtStart = Date.now();

  stopTimers();
  ruimEnvelopOp();
  var p = map.project([t.lon, t.lat]);
  zetOorsprong(p);

  document.body.classList.add("bezig");
  panel.classList.remove("ontvouwt");
  void panel.offsetWidth;
  panel.classList.add("vouwt");

  later(function(){
    panel.classList.remove("vouwt", "open");
    speelEnvelopDicht(p, t);
  }, 700);
  later(function(){
    dichtBezig = false;
    document.body.classList.remove("bezig");
    closePanel();
  }, 2250);
}

/* Dezelfde envelop als bij het openen, maar de stappen lopen terug. */
function speelEnvelopDicht(p, t){
  var laag = maakEnvelop(p, t, "groeit klep-op kaart-uit");
  later(function(){ laag.classList.remove("kaart-uit"); }, 80);
  later(function(){ laag.classList.remove("klep-op"); }, 480);
  later(function(){ laag.classList.remove("groeit"); }, 900);
  later(function(){ if (envLaag === laag) ruimEnvelopOp(); }, 1450);
}

/* ---------- het postmapje rechtsonder ---------- */

function maakPostmap(){
  if (postMap) return;
  postMap = document.createElement("div");
  postMap.className = "postmap";
  postMap.id = "postmap";
  postMap.hidden = true;
  postMap.innerHTML =
    '<div class="post-map">' +
      '<button class="post-greep" id="postGreep" aria-expanded="false" ' +
              'aria-label="Gelezen post"></button>' +
      '<div class="post-stapel" id="postStapel"></div>' +
      '<span class="post-flap" aria-hidden="true"></span>' +
      '<span class="post-opschrift" aria-hidden="true">Gelezen post</span>' +
      '<button class="post-opnieuw" id="postOpnieuw" type="button" ' +
              'title="Wis wat de site onthoudt">Opnieuw beginnen</button>' +
    '</div>' +
    '<p class="post-teller label" id="postTeller"></p>';
  document.body.appendChild(postMap);
  postStapel = postMap.querySelector("#postStapel");
  postTeller = postMap.querySelector("#postTeller");
  var opnieuw = postMap.querySelector("#postOpnieuw");
  opnieuw.addEventListener("click", function(e){
    e.stopPropagation();
    wisGeheugen();
    window.location.reload();
  });
  /* De wisknop is pas te zien als het mapje open is; tot die tijd hoort hij
     ook niet in de Tab-volgorde. */
  opnieuw.disabled = true;
  postMap.querySelector("#postGreep").addEventListener("click", function(){
    postOpen = !postOpen;
    postMap.classList.toggle("open", postOpen);
    opnieuw.disabled = !postOpen;
    this.setAttribute("aria-expanded", postOpen ? "true" : "false");
  });
  vulPostmap();
}

/* De stapel: elke gelezen brief een eigen hoek, zodat het een echte
   stapel wordt. Wie een foto had, krijgt een fotootje in de stapel. */
function vulPostmap(){
  if (!postMap || !trips) return;
  /* Oudste onderop, laatst gelezen bovenop: de volgorde van de stapel
     volgt de leesvolgorde, niet de volgorde van de reizen. */
  var lijst = [];
  gelezenOrde.forEach(function(id){
    var t = trips.filter(function(x){ return x.id === id; })[0];
    if (t) lijst.push(t);
  });
  var n = lijst.length, gezien = {};

  lijst.forEach(function(t, i){
    gezien[t.id] = true;
    var b = postVellen[t.id];
    /* Kwam de foto pas binnen nadat het kaartje al gebouwd was, dan opnieuw. */
    if (b && fotoReg[t.id] && b.classList.contains("met-brief")) { b.remove(); b = null; }
    if (!b) {
      b = document.createElement("button");
      b.className = "post-item";
      b.type = "button";
      /* Een hoek en een verschuiving die per brief vastliggen, zodat de
         stapel bij het herschikken schuift en niet verspringt. */
      var v = vormVan(t);
      b.style.setProperty("--r", (((v * 7 + 11) % 23) - 11).toFixed(1) + "deg");
      b.style.setProperty("--x", (((v * 5 + 13) % 27) - 13) + "px");
      if (fotoReg[t.id]) {
        b.classList.add("met-foto");
        var img = new Image();
        img.alt = "";
        img.src = fotoReg[t.id];
        b.appendChild(img);
      } else {
        b.classList.add("met-brief");
        var zegel = document.createElement("span");
        zegel.className = "post-zegel";
        zegel.style.background = zegelKleur(t);
        b.appendChild(zegel);
        var titel = document.createElement("span");
        titel.className = "post-titel";
        titel.textContent = t.title;
        b.appendChild(titel);
      }
      b.addEventListener("click", function(e){
        e.stopPropagation();
        openTrip(t.id);
      });
      postVellen[t.id] = b;
      postStapel.appendChild(b);
    }
    var bovenop = (i === n - 1);
    b.setAttribute("aria-label", t.title + (bovenop ? "; bovenop de stapel" : ""));
    b.style.setProperty("--i", String(i));
    b.style.setProperty("--z", String(i + 1));
    b.classList.toggle("bovenop", bovenop);
  });

  /* Vellen die niet meer gelezen zijn, verdwijnen. */
  Object.keys(postVellen).forEach(function(id){
    if (gezien[id]) return;
    if (postVellen[id].parentNode) postVellen[id].parentNode.removeChild(postVellen[id]);
    delete postVellen[id];
  });

  postTeller.textContent = n + " gelezen";
  postMap.classList.toggle("leeg", lijst.length === 0);
}

function closePanel(){
  stopTimers();
  dichtBezig = false;
  knopTerug();
  kaartRust(false);
  document.body.classList.remove("bezig");
  ruimEnvelopOp();
  huidig = null;
  panel.classList.remove("ontvouwt", "open", "vouwt");
  panel.inert = true;
}

/* ---------- de kaart ---------- */

function initMap(){
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      /* Zonder glyphs falen de tekstlagen stil; daarom staan de lettervormen
         in de repo zelf (glyphs/, Open Sans Bold) en niet bij een derde. */
      glyphs: "glyphs/{fontstack}/{range}.pbf",
      sources: {
        base: {type: "raster", tiles: [WATERCOLOR], tileSize: 256, attribution: ATTR, maxzoom: 5},
        diep: {type: "raster", tiles: [DIEP], tileSize: 256, maxzoom: 16},
        reference: {type: "raster", tiles: [LABELS], tileSize: 256, maxzoom: 16}
      },
      layers: [
        {id: "bg", type: "background", paint: {"background-color": ink["paper-2"] || "#efe6d2"}},
        {id: "base", type: "raster", source: "base"},
        /* De lichte kaart komt pas op als de aquarel te ver is opgerekt. */
        {id: "diep", type: "raster", source: "diep", minzoom: 5,
         paint: {"raster-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 7.5, .88]}},
        {id: "reference", type: "raster", source: "reference", minzoom: 4,
         paint: {"raster-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0, 6, .4]}}
      ]
    },
    center: [8, 48],
    zoom: 1.2,
    minZoom: 0.6,
    maxZoom: 16,
    attributionControl: {compact: true}
  });
  window.__map = map;
  map.addControl(new maplibregl.NavigationControl({visualizePitch: false}), "bottom-right");

  map.on("style.load", function(){
    map.setProjection({type: "globe"});

    map.addSource("trips", {
      type: "geojson",
      data: {type: "FeatureCollection", features: features()},
      cluster: true,
      clusterRadius: 38,
      clusterMaxZoom: 8
    });

    zetIconen();

    /* Clusters: een stapeltje enveloppen met het aantal erop. */
    map.addLayer({
      id: "clusters", type: "symbol", source: "trips",
      filter: ["has", "point_count"],
      layout: {
        "icon-image": "envelop-stapel",
        "icon-allow-overlap": true,
        "icon-size": ["step", ["get", "point_count"], .85, 3, 1, 6, 1.15]
      }
    });
    map.addLayer({
      id: "cluster-count", type: "symbol", source: "trips",
      filter: ["has", "point_count"],
      layout: {"text-field": ["get", "point_count_abbreviated"], "text-size": 13,
               "text-offset": [0, .12],
               "text-font": ["Open Sans Bold"], "text-allow-overlap": true,
               "text-ignore-placement": true},
      paint: {"text-color": ink.key, "text-halo-color": "#fffcf3", "text-halo-width": 1.6}
    });

    /* Losse punten: een envelopje dat je open kunt maken.
       De titel staat eronder en niet op de envelop zelf: op een drukke
       aquarelondergrond leest een los woord met een papieren halo beter
       dan tekst die in een vlakje van veertig pixels moet passen. */
    map.addLayer({
      id: "dots", type: "symbol", source: "trips",
      filter: ["!", ["has", "point_count"]],
      layout: {
        "icon-image": ["get", "icoon"],
        /* Het icoon heeft bovenin ruimte voor de opstaande klep; die ruimte
           telt niet mee voor de plek op de kaart. */
        "icon-offset": [0, -6.5],
        "icon-allow-overlap": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 2, .72, 5, .95, 9, 1.1]
      }
    });
    map.addLayer({
      id: "labels", type: "symbol", source: "trips",
      filter: ["!", ["has", "point_count"]],
      minzoom: 3.2,
      layout: {"text-field": ["get", "title"], "text-size": 12, "text-offset": [0, 1.5],
               "text-anchor": "top", "text-font": ["Open Sans Bold"],
               "text-max-width": 11},
      paint: {"text-color": ink.key, "text-halo-color": ink.paper, "text-halo-width": 2.2}
    });

    map.on("click", "clusters", function(e){
      var f = e.features[0];
      map.getSource("trips").getClusterExpansionZoom(f.properties.cluster_id).then(function(z){
        zoomNaar(f.geometry.coordinates, z + .3);
      }).catch(function(){
        zoomNaar(f.geometry.coordinates, map.getZoom() + 2);
      });
    });
    map.on("click", "dots", function(e){ openTrip(e.features[0].properties.id); });
    /* De titel onder de envelop hoort bij dezelfde brief. */
    map.on("click", "labels", function(e){ openTrip(e.features[0].properties.id); });

    ["clusters", "dots", "labels"].forEach(function(l){
      map.on("mouseenter", l, function(){ map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", l, function(){ map.getCanvas().style.cursor = ""; });
    });

    refresh();
  });
}

function zoomNaar(center, zoom){
  if (stil()) map.jumpTo({center: center, zoom: zoom});
  else map.easeTo({center: center, zoom: zoom, duration: 900});
}

/* ---------- naar buiten ---------- */

return {
  init: function(json){
    leesInkten();
    misschienOpnieuw();
    leesFotoGeheugen();
    leesGelezen();
    trips = ((json || {}).trips || []).filter(function(t){
      var ok = typeof t.lat === "number" && typeof t.lon === "number";
      if (!ok) console.warn("overgeslagen, lat/lon is geen getal: " + t.id);
      return ok;
    });
    panel = document.getElementById("panel");
    /* Dicht is hij niet te bereiken met Tab of een schermlezer. */
    panel.inert = true;
    var close = document.getElementById("closeBtn");
    if (close) {
      /* Geen kruisje meer: de brief vouwt zich dicht. */
      close.textContent = "";
      close.classList.add("vouw");
      close.setAttribute("aria-label", "Vouw de brief dicht");
      close.setAttribute("title", "Vouw de brief dicht");
      close.addEventListener("click", vouwDicht);
      sluitKnop = close;
    }
    /* Escape moet altijd sluiten; de zaal vangt hem alleen als de zaal open
       staat, dus hier gewoon doorgaan. */
    document.addEventListener("keydown", function(e){
      if (e.key !== "Escape") return;
      if (window.Zaal && window.Zaal.isOpen && window.Zaal.isOpen()) return;
      if (tafelOpen) { vanTafel(); return; }
      vouwDicht();
    });
    panel.addEventListener("animationend", function(e){
      if (e.target === panel && !e.pseudoElement) panel.classList.remove("ontvouwt");
    });
    bouwMappen();
    maakPostmap();
    initMap();
    /* De knoppenlijst voor het toetsenbord hoort bij de kaart en staat erin,
       na de kaartknoppen; refresh vult hem. */
    toetsLijst = document.createElement("ul");
    toetsLijst.className = "toets-lijst";
    toetsLijst.setAttribute("aria-label", "Reizen op de kaart");
    document.getElementById("map").appendChild(toetsLijst);
  },

  /* Het verhaal is klaar: de bol komt op en draait naar Europa. */
  reveal: function(){
    var el = document.getElementById("map");
    if (el) el.classList.add("zichtbaar");
    var bar = document.getElementById("bar");
    if (bar) bar.hidden = false;
    var mp = document.getElementById("mappen");
    if (mp) mp.hidden = false;
    if (postMap) { postMap.hidden = false; vulPostmap(); }
    document.body.classList.add("bol");
    if (!map) return;
    if (stil()) map.jumpTo({center: [8, 48], zoom: 3});
    else map.easeTo({center: [8, 48], zoom: 3, duration: 1800});
  }
};

})();
