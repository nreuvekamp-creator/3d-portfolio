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

function stil(){
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
}

/* De inkten staan in style.css; hier alleen uitlezen. */
function leesInkten(){
  var cs = getComputedStyle(document.documentElement);
  ["cyan","magenta","yellow","key","paper","paper-2","ink","ink-soft","gold"].forEach(function(n){
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

  panel.classList.add("open");
  var doel = {center: [t.lon, t.lat], zoom: Math.max(map.getZoom(), 4.5)};
  if (stil()) map.jumpTo(doel);
  else map.easeTo(Object.assign({duration: 1400}, doel));
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

function closePanel(){ panel.classList.remove("open"); }

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

    /* Clusters: een gestempelde cirkel met het aantal erin. */
    map.addLayer({
      id: "clusters", type: "circle", source: "trips",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": ink.yellow,
        "circle-opacity": .95,
        "circle-radius": ["step", ["get", "point_count"], 16, 3, 21, 6, 26],
        "circle-stroke-width": 2.5,
        "circle-stroke-color": ink.key
      }
    });
    map.addLayer({
      id: "cluster-count", type: "symbol", source: "trips",
      filter: ["has", "point_count"],
      layout: {"text-field": ["get", "point_count_abbreviated"], "text-size": 13,
               "text-font": ["Open Sans Bold"], "text-allow-overlap": true},
      paint: {"text-color": ink.key}
    });

    /* Losse punten: een inktstip met een papieren rand eromheen. */
    map.addLayer({
      id: "glow", type: "circle", source: "trips",
      filter: ["!", ["has", "point_count"]],
      paint: {"circle-color": ink.paper, "circle-radius": 13, "circle-opacity": .55}
    });
    map.addLayer({
      id: "dots", type: "circle", source: "trips",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["case", ["==", ["get", "context"], "prive"], ink.magenta, ink.cyan],
        "circle-radius": 7,
        "circle-stroke-width": 2.5,
        "circle-stroke-color": ink.key,
        "circle-stroke-opacity": ["case", ["==", ["get", "todo"], 1], .4, 1]
      }
    });
    map.addLayer({
      id: "labels", type: "symbol", source: "trips",
      filter: ["!", ["has", "point_count"]],
      minzoom: 3.2,
      layout: {"text-field": ["get", "title"], "text-size": 12, "text-offset": [0, 1.4],
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

    ["clusters", "dots", "glow"].forEach(function(l){
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
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") closePanel(); });
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
