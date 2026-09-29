/* ============================================================
   globe.js - de wereldbol op aquarelpapier.
   window.Globe: init(data), reveal(), flyTo(id)
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

var data, trips, map, panel, ink = {}, revealWacht = false;
var active = {context:{}, study:{}, world:{}};
var tafel = null, tafelOpen = false;

function stil(){
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
}

/* De inkten staan in style.css; hier alleen uitlezen. */
function leesInkten(){
  var cs = getComputedStyle(document.documentElement);
  ["cyan","magenta","yellow","key","paper","paper-2","ink","ink-soft","ink-faint","gold"].forEach(function(n){
    ink[n] = (cs.getPropertyValue("--" + n) || "").trim();
  });
}

function esc(s){ return String(s == null ? "" : s); }

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
    if (active.context.prive) return;      /* eenmalig: hij gaat niet meer dicht */
    active.context.prive = true;
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

/* Per groep: niets aan = alles door, behalve dat 'prive' altijd expliciet aan moet. */
function groupPass(group, value){
  var on = Object.keys(active[group]).filter(function(k){
    /* 'prive' is een aan/uit-schakelaar, geen filter: hij voegt toe, hij beperkt niet. */
    return active[group][k] && !(group === "context" && k === "prive");
  });
  if (!on.length) return true;
  return on.indexOf(value) !== -1;
}

function visible(t){
  if (t.context === "prive" && !active.context.prive) return false;
  if (!groupPass("context", t.context)) return false;
  if (!groupPass("study", t.study)) return false;
  if (!groupPass("world", t.abroad ? "abroad" : "home")) return false;
  return true;
}

function features(){
  return trips.filter(visible).map(function(t){
    return {
      type: "Feature",
      geometry: {type: "Point", coordinates: [t.lon, t.lat]},
      properties: {id: t.id, title: t.title, todo: t.todo ? 1 : 0, context: t.context}
    };
  });
}

function refresh(){
  var feats = features();
  var src = map && map.getSource("trips");
  if (src) src.setData({type: "FeatureCollection", features: feats});
  var c = document.getElementById("count");
  if (c) c.textContent = feats.length + (feats.length === 1 ? " plek" : " plekken");
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

/* Een dichtgevouwen envelopje: papier, twee flapnaden, een klep en een
   postzegeltje in de kleur van de context. */
function tekenEnvelop(zegel, flauw){
  var w = 40, h = 27, m = 3;      /* m = marge voor de slagschaduw */
  var vel = nieuwVel(w + m * 2, h + m * 2);
  var g = vel.g;
  var x = m, y = m, bw = w, bh = h;

  g.save();
  g.shadowColor = "rgba(70,55,35,.38)";
  g.shadowBlur = 4; g.shadowOffsetY = 2;
  g.fillStyle = "#fdf8ec";
  g.fillRect(x, y, bw, bh);
  g.restore();

  g.globalAlpha = flauw ? .55 : 1;

  /* De twee zijflappen en de onderflap, als lichte vouwen. */
  g.strokeStyle = "rgba(60,45,26,.26)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y + bh); g.lineTo(x + bw / 2, y + bh * .46); g.lineTo(x + bw, y + bh);
  g.stroke();

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

  /* Het postzegeltje linksboven, in de inkt van de context. */
  var zw = 9, zh = 7, zx = x + 3.5, zy = y + 3;
  g.fillStyle = zegel;
  g.fillRect(zx, zy, zw, zh);
  g.strokeStyle = "rgba(253,248,236,.9)";
  g.lineWidth = 1.1;
  g.strokeRect(zx - .4, zy - .4, zw + .8, zh + .8);

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
  if (!map.hasImage("envelop-studie"))
    map.addImage("envelop-studie", tekenEnvelop(ink.cyan, false), {pixelRatio: PR});
  if (!map.hasImage("envelop-prive"))
    map.addImage("envelop-prive", tekenEnvelop(ink.magenta, false), {pixelRatio: PR});
  if (!map.hasImage("envelop-extra"))
    map.addImage("envelop-extra", tekenEnvelop(ink.gold, false), {pixelRatio: PR});
  if (!map.hasImage("envelop-todo"))
    map.addImage("envelop-todo", tekenEnvelop(ink["ink-faint"] || "#a2927f", true), {pixelRatio: PR});
  if (!map.hasImage("envelop-stapel"))
    map.addImage("envelop-stapel", tekenStapel(), {pixelRatio: PR});
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
    panel.classList.remove("ontvouwt");
    panel.classList.add("open");
    beurt.mag = true;
    if (beurt.geladen) plaatsFoto(beurt);
    map.jumpTo(doel);
    return;
  }

  panel.classList.remove("open", "ontvouwt");
  var p = map.project([t.lon, t.lat]);

  /* De volgorde: (a) het envelopje groeit en komt naar je toe,
     (b) de klep klapt open, (c) de kaart schuift eruit,
     (d) de kaart vouwt open tot de brief, (e) de foto komt aanvliegen. */
  document.body.classList.add("bezig");
  speelEnvelop(p);
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
  later(function(){ kaartRust(false); }, 2420);
  later(function(){ document.body.classList.remove("bezig"); }, 3420);
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
  document.getElementById("pSum").textContent = esc(t.summary);

  var txt = document.getElementById("pText");
  txt.textContent = "";
  if (!t.todo) {
    esc(t.body).split(/\n\s*\n/).forEach(function(par){
      var sp = document.createElement("span");
      sp.className = "par";
      sp.textContent = par;
      txt.appendChild(sp);
    });
  }

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

/* Eerst kijken of photos/<id>.<ext> bestaat. Bestaat hij niet, dan komt er
   ook geen lijst in de brief; er valt dan niets te vergroten. */
function zoekFoto(t, klaar){
  var lijst = ["photos/" + t.id + ".jpg", "photos/" + t.id + ".png",
               "photos/" + t.id + ".jpeg", "photos/" + t.id + ".webp"];
  (function probeer(i){
    if (i >= lijst.length) { klaar(null); return; }
    var img = new Image();
    img.alt = "";
    img.onload = function(){ klaar(img); };
    img.onerror = function(){ probeer(i + 1); };
    img.src = lijst[i];
  })(0);
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
   kantelt, en een kaart die er daarna uit schuift. */
function speelEnvelop(p){
  var laag = document.createElement("div");
  laag.className = "env3d";
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
  var vak = panel.getBoundingClientRect();
  panel.style.setProperty("--fx", Math.round(p.x - vak.right) + "px");
  panel.style.setProperty("--fy", Math.round(p.y - (vak.top + vak.height / 2)) + "px");
  panel.style.setProperty("--gx", Math.round(p.x - (vak.left + vak.width / 2)) + "px");
  panel.style.setProperty("--gy", Math.round(p.y - vak.bottom) + "px");

  panel.classList.add("open");
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

function closePanel(){
  stopTimers();
  kaartRust(false);
  document.body.classList.remove("bezig");
  ruimEnvelopOp();
  huidig = null;
  panel.classList.remove("ontvouwt");
  panel.classList.remove("open");
}

/* ---------- de kaart ---------- */

function initMap(){
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      /* Zonder glyphs falen de tekstlagen stil. */
      glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
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
        "icon-image": ["case",
          ["==", ["get", "todo"], 1], "envelop-todo",
          ["==", ["get", "context"], "prive"], "envelop-prive",
          ["==", ["get", "context"], "extracurriculair"], "envelop-extra",
          "envelop-studie"],
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
    data = json || {};
    trips = (data.trips || []).filter(function(t){
      return typeof t.lat === "number" && typeof t.lon === "number";
    });
    panel = document.getElementById("panel");
    var close = document.getElementById("closeBtn");
    if (close) close.addEventListener("click", closePanel);
    document.addEventListener("keydown", function(e){
      if (e.key !== "Escape") return;
      if (tafelOpen) vanTafel(); else closePanel();
    });
    panel.addEventListener("animationend", function(e){
      if (e.target === panel && !e.pseudoElement) panel.classList.remove("ontvouwt");
    });
    bouwMappen();
    initMap();
    if (revealWacht) { revealWacht = false; Globe.reveal(); }
  },

  /* Het verhaal is klaar: de bol komt op en draait naar Europa. */
  reveal: function(){
    var el = document.getElementById("map");
    if (el) el.classList.add("zichtbaar");
    var bar = document.getElementById("bar");
    if (bar) bar.hidden = false;
    var mp = document.getElementById("mappen");
    if (mp) mp.hidden = false;
    document.body.classList.add("bol");
    if (!map) { revealWacht = true; return; }
    if (stil()) map.jumpTo({center: [8, 48], zoom: 3});
    else map.easeTo({center: [8, 48], zoom: 3, duration: 1800});
  },

  flyTo: function(id){
    var t = trips && trips.filter(function(x){ return x.id === id; })[0];
    if (!t || !map) return;
    zoomNaar([t.lon, t.lat], Math.max(map.getZoom(), 4.5));
  }
};

})();
