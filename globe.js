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
    if (fluister) fluister.textContent = "nu weet je alles";
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

function openTrip(id){
  var t = trips.filter(function(x){ return x.id === id; })[0];
  if (!t) return;

  /* Deze pin is geen kaartje maar een deur: je loopt de zaal binnen. */
  if (t.zaal && window.Zaal) { closePanel(); Zaal.open(); return; }

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
  print.appendChild(shot);
  var caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = t.place + (t.country ? ", " + t.country : "");
  print.appendChild(caption);
  photo.appendChild(print);

  var kleur = t.context === "prive" ? ink.magenta : (t.context === "extracurriculair" ? ink.gold : ink.cyan);
  var ph = document.createElement("div");
  ph.className = "p-ph";
  ph.style.background = "linear-gradient(135deg," + kleur + "," + ink.key + ")";
  ph.appendChild(document.createTextNode(t.title));
  var small = document.createElement("small");
  small.textContent = t.place + (t.country ? ", " + t.country : "");
  ph.appendChild(small);
  shot.appendChild(ph);

  /* Zodra photos/<id>.jpg (of .png) bestaat, vervangt die automatisch de placeholder. */
  tryPhoto(shot, ["photos/" + t.id + ".jpg", "photos/" + t.id + ".png",
                  "photos/" + t.id + ".jpeg", "photos/" + t.id + ".webp"], 0);

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

  ontvouw(t);

  var doel = {center: [t.lon, t.lat], zoom: Math.max(map.getZoom(), 4.5)};
  if (stil()) map.jumpTo(doel);
  else map.easeTo(Object.assign({duration: 1400}, doel));
}

/* De brief vertrekt bij de envelop op de kaart en vouwt zich in drie
   slagen open tot het paneel. Alles gaat via transform; met width of
   height hapert het, want dan moet de hele opmaak opnieuw worden gerekend. */
function ontvouw(t){
  panel.classList.remove("ontvouwt");
  if (stil()) { panel.classList.add("open"); return; }

  var p = map.project([t.lon, t.lat]);
  var vak = panel.getBoundingClientRect();
  var cx = vak.left + vak.width / 2;
  var cy = vak.top + vak.height / 2;
  /* Het paneel staat er al (buiten beeld), dus zijn maten kloppen. */
  panel.style.setProperty("--fx", Math.round(p.x - cx) + "px");
  panel.style.setProperty("--fy", Math.round(p.y - cy) + "px");

  klepOpen(p.x, p.y);

  panel.classList.add("open");
  void panel.offsetWidth;                  /* anders slaat de browser de animatie over */
  panel.classList.add("ontvouwt");
}

/* Het envelopje op de kaart gaat open en er vliegt een kaartje uit. */
function klepOpen(x, y){
  var laag = document.createElement("div");
  laag.className = "klep-laag";
  laag.style.left = x + "px";
  laag.style.top = y + "px";
  laag.innerHTML = '<span class="klep-bak"></span><span class="klep-flap"></span>' +
                   '<span class="klep-kaart"></span>';
  document.body.appendChild(laag);
  setTimeout(function(){ laag.remove(); }, 1100);
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

function tryPhoto(container, list, i){
  if (i >= list.length) return;
  var img = new Image();
  img.onload = function(){
    container.textContent = "";
    container.classList.remove("tall");
    if (img.naturalHeight > img.naturalWidth * 1.05) {
      container.classList.add("tall");
      var bg = document.createElement("div");
      bg.className = "blur";
      bg.style.backgroundImage = "url(\"" + img.src.replace(/"/g, "%22") + "\")";
      container.appendChild(bg);
    }
    container.appendChild(img);
  };
  img.onerror = function(){ tryPhoto(container, list, i + 1); };
  img.alt = "";
  img.src = list[i];
}

function closePanel(){ panel.classList.remove("ontvouwt"); panel.classList.remove("open"); }

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
