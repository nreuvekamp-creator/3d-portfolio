/* ============================================================
   Het verhaal.

   Vijf scenes. De brief wordt getypt, letter voor letter, met een
   tik erbij. De bezoeker hoeft niets te doen, maar mag alles
   onderbreken: knop, Escape, of de spatiebalk drie seconden
   vasthouden. Aan het eind opent hij zelf de doos.

   De tekst staat hieronder in SCRIPT. Dat is het enige wat je hoeft
   aan te passen als het verhaal verandert; de rest regelt zichzelf.
   Elke regel kan later een geluidsfragment krijgen via het veld
   `stem`, zonder dat er iets anders verandert.
   ============================================================ */

window.Intro = (function(){
  "use strict";

  /* --------------------------------------------------------
     Het script. `wacht` is hoe lang de regel blijft staan NADAT
     hij is uitgetypt, in milliseconden. Het typen zelf kost tijd
     en die komt er dus bovenop.
     -------------------------------------------------------- */

  var SCRIPT = [
    {scene: "leegte", tekst: "Hi, ik ben Niels.", stem: null, wacht: 900},
    {tekst: "Welkom op mijn plekje op het internet.", stem: null, wacht: 900},
    {tekst: "Het is hier groot, en toch ben je op de juiste plek beland.", klasse: "small", stem: null, wacht: 1100},

    {scene: "breed", tekst: "Mijn interesses lopen alle kanten op.", stem: null, wacht: 900},
    {voorbeelden: true, wacht: 4280},

    {scene: "kist", tekst: "Dat komt omdat ik iemand van ideeën ben.", stem: null, wacht: 900},
    {tekst: "Mijn hoofd ontploft er soms van.", stem: null, wacht: 900},
    {tekst: "Dus ik verzamel ze.", klasse: "hand", stem: null, wacht: 800},
    {tekst: "In een doos.", stem: null, wacht: 1200},

    {scene: "open", tekst: "", wacht: 1200},
    {tekst: "Elk idee kwam ergens vandaan.", stem: null, wacht: 900},
    {tekst: "Dus elk idee heeft een plek op de wereld.", stem: null, wacht: 1300},

    {scene: "wacht", tekst: "Kom maar kijken.", klasse: "hand", stem: null, wacht: 999999}
  ];

  /* Aanslagtempo: ongeveer 22 aanslagen per seconde, met wat spel erin. */
  var TEMPO = 45;

  /* De drie dingen die langsvliegen. De derde is de grap: dit is het. */
  /* De drie kaarten die op het bureau blijven liggen. Dit zijn de cases die
     een bezoeker als eerste ziet, dus ze hebben alle drie een foto.
     `foto` is een pad; laat het weg en de kaart toont alleen tekst. */
  var VOORBEELDEN = [
    {tekst: "een marathon gelopen in de vorm van een hartje",
     note: "op de kaart getekend", foto: "photos/strava-hart.jpg", r: "-7deg"},
    {tekst: "een hackathon gewonnen in de haven van Antwerpen",
     note: "slim stapelen, voor CLdN", foto: "photos/antwerpen.jpg", r: "6deg"},
    {tekst: "een reclame gemaakt die in de bioscoop draaide",
     note: "stage bij BTC Direct", foto: "photos/btc-direct.jpg", r: "-3deg"}
  ];

  var intro, lijnenBak, rol, voorbeeldBak, envBak;
  var timer = null, typTimer = null, klaar = false, opGang = false;
  var afgerond;

  var rustig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------
     Geluid. Twee standen: 0 uit, 1 aan. Aan betekent de typemachine;
     die is geen aparte stand meer maar gewoon wat je hoort.
     Alles wordt ter plekke gemaakt met de Web Audio API; er zijn geen
     geluidsbestanden. Zonder geluid loopt het verhaal precies zo door.
     ------------------------------------------------------------ */

  /* Standaard staat het geluid aan. Wie het uitzet, houdt het uit: de
     keuze wordt onthouden. */
  var geluid = 1;
  var ac = null, mix = null, ruisBuf = null;
  var wachtOpGebaar = false;

  /* Vooruit plannen. De tik wordt op de audioklok gezet en de letter
     verschijnt op precies hetzelfde geplande moment, zodat ze niet uit
     elkaar kunnen lopen. */
  var LOOK = 0.08;

  function bewaar(v){
    try { localStorage.setItem("intro-geluid", String(v)); } catch (e) {}
  }
  function gelezen(){
    try {
      var v = localStorage.getItem("intro-geluid");
      if (v === null) return null;
      var n = parseInt(v, 10);
      /* Een oude stand 2 (met verteller) leest nu gewoon als aan. */
      if (n === 0) return 0;
      if (n === 1 || n === 2) return 1;
      return null;
    } catch (e) { return null; }
  }

  function audioAan(){
    if (ac) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ac = new AC();
      /* Een hoogdoorlaat over alles heen: de lage bons eruit, alleen de tik. */
      var hp = ac.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 1400; hp.Q.value = 0.6;
      mix = ac.createGain();
      mix.gain.value = 0.22;          /* achtergrond, geen voorgrond */
      mix.connect(hp); hp.connect(ac.destination);
      /* Een tiende seconde snel uitdovende ruis: de grondstof van elke tik. */
      var n = Math.floor(ac.sampleRate * 0.12);
      ruisBuf = ac.createBuffer(1, n, ac.sampleRate);
      var d = ruisBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      return true;
    } catch (e) { ac = null; return false; }
  }

  /* Probeer te starten. Lukt dat niet (de browser wacht op een gebaar),
     dan hervatten we bij de eerste de beste aanraking. Nooit een fout. */
  function probeerStarten(){
    if (!audioAan()) return;
    var poging = null;
    try { poging = ac.resume(); } catch (e) { poging = null; }
    if (poging && poging.then) poging.then(gelukt, function(){ wachtenOpGebaar(); });
    setTimeout(function(){ if (ac && ac.state !== "running") wachtenOpGebaar(); else gelukt(); }, 120);
  }

  function gelukt(){
    if (!ac || ac.state !== "running") return;
    wachtOpGebaar = false;
    if (intro) intro.classList.remove("stil");
  }

  function wachtenOpGebaar(){
    if (wachtOpGebaar || !ac || ac.state === "running") return;
    wachtOpGebaar = true;
    if (intro && geluid > 0) intro.classList.add("stil");
    var soorten = ["pointerdown", "keydown", "wheel", "touchstart", "click"];
    function wek(){
      soorten.forEach(function(s){ window.removeEventListener(s, wek, true); });
      if (!ac) return;
      var p = null;
      try { p = ac.resume(); } catch (e) { p = null; }
      if (p && p.then) p.then(gelukt, function(){});
      setTimeout(gelukt, 60);
      wachtOpGebaar = false;
      if (intro) intro.classList.remove("stil");
    }
    soorten.forEach(function(s){ window.addEventListener(s, wek, true); });
  }

  function ruispuls(t, freq, q, vol, duur, rate){
    var s = ac.createBufferSource();
    s.buffer = ruisBuf;
    s.playbackRate.value = rate;
    var bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.0012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duur);
    s.connect(bp); bp.connect(g); g.connect(mix);
    s.start(t); s.stop(t + duur + 0.02);
  }

  /* Een heel kort, hoog tikje: de letterhamer die het papier raakt. */
  function toon(t, type, van, naar, vol, duur){
    var o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(van, t);
    o.frequency.exponentialRampToValueAtTime(naar, t + duur);
    var g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duur);
    o.connect(g); g.connect(mix);
    o.start(t); o.stop(t + duur + 0.02);
  }

  /* Vijf aanslagen, alle vijf droog en hoog: het verschil zit in de
     scherpte, niet in de zwaarte. Nooit twee keer dezelfde achter elkaar. */
  var AANSLAGEN = [
    /* 0: scherp en droog */
    function(t){
      ruispuls(t, 5200, 1.0, 0.36, 0.016, 2.2);
      toon(t, "triangle", 2600, 1100, 0.05, 0.010);
    },
    /* 1: net iets voller, nog steeds kort */
    function(t){
      ruispuls(t, 4200, 0.9, 0.32, 0.021, 2.0);
      toon(t, "square", 1900, 850, 0.04, 0.009);
    },
    /* 2: een piepklein naschokje van het mechaniek */
    function(t){
      ruispuls(t, 6200, 1.3, 0.28, 0.013, 2.6);
      ruispuls(t + 0.016, 7200, 3.0, 0.10, 0.018, 1.2);
    },
    /* 3: iets lager, maar zonder bons */
    function(t){
      ruispuls(t, 3400, 1.1, 0.28, 0.022, 1.8);
      toon(t, "triangle", 1600, 800, 0.04, 0.009);
    },
    /* 4: het toetsje eerst, dan meteen de aanslag */
    function(t){
      ruispuls(t, 5800, 1.6, 0.13, 0.009, 2.4);
      ruispuls(t + 0.011, 4600, 1.0, 0.32, 0.016, 2.0);
    }
  ];

  var vorigeAanslag = -1;

  /* Voor de test: per aanslag het geplande moment en het moment waarop
     de letter echt in de DOM kwam. */
  window.__sync = [];
  window.__tikken = 0;    /* aantal echt ingeplande aanslagen */
  window.__spaties = 0;

  /* Eén tik, gepland op de audioklok, op het meegegeven moment. */
  function tik(t){
    var k = Math.floor(Math.random() * AANSLAGEN.length);
    if (k === vorigeAanslag) k = (k + 1 + Math.floor(Math.random() * (AANSLAGEN.length - 1))) % AANSLAGEN.length;
    vorigeAanslag = k;
    if (geluid < 1 || !ac) return;
    window.__tikken++;
    AANSLAGEN[k](t);
  }

  /* De spatiebalk: breder en zachter, duidelijk geen letter. */
  function spatie(t){
    if (geluid < 1 || !ac) return;
    window.__spaties++;
    ruispuls(t, 1700, 0.6, 0.14, 0.030, 1.1);
  }

  /* Eind van de regel: het belletje en de wagen die terugschuift. */
  function retour(){
    if (geluid < 1 || !ac) return;
    var t = ac.currentTime;
    var o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(1720, t);
    var og = ac.createGain();
    og.gain.setValueAtTime(0.07, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(og); og.connect(mix);
    o.start(t); o.stop(t + 0.36);
    ruispuls(t + 0.09, 2200, 0.9, 0.07, 0.09, 1.0);
    ruispuls(t + 0.26, 3000, 1.4, 0.08, 0.04, 1.4);
  }

  /* --------------------------------------------------------
     Regels typen
     -------------------------------------------------------- */

  /* De regels blijven staan en stapelen zich op, zoals op een echte
     brief. Het vel groeit mee tot het niet verder kan; daarna schuift
     de rol omhoog zodat de laatste regel altijd onderaan zichtbaar is.
     Oudere regels worden lichter, maar blijven leesbaar. */
  function schuifMee(){
    if (!rol || !lijnenBak) return;
    var over = rol.scrollHeight - lijnenBak.clientHeight;
    rol.style.transform = "translateY(" + (over > 0 ? -Math.round(over) : 0) + "px)";
  }

  function verflauw(){
    var regels = rol.querySelectorAll(".line");
    var TRAP = [1, 0.82, 0.68, 0.58];
    for (var i = 0; i < regels.length; i++) {
      var terug = regels.length - 1 - i;
      regels[i].style.opacity = TRAP[Math.min(terug, TRAP.length - 1)];
    }
  }

  function toonRegel(stap, gedaan){
    if (!stap.tekst) { gedaan(); return; }

    var el = document.createElement("span");
    el.className = "line in" + (stap.klasse ? " " + stap.klasse : "");
    var veld = document.createElement("span");
    veld.className = "tekst";
    el.appendChild(veld);
    rol.appendChild(el);
    verflauw();
    schuifMee();

    var j = 0;
    function volgende(){
      if (klaar) return;
      if (j >= stap.tekst.length) {
        retour();
        el.classList.add("af");
        gedaan();
        return;
      }
      var ch = stap.tekst.charAt(j++);

      /* Eerst plannen, dan pas plaatsen: de tik wordt op de audioklok
         gezet op t, en de letter verschijnt op datzelfde moment. Zo kan
         er geen verschuiving ontstaan tussen wat je ziet en wat je hoort. */
      var mag = (geluid > 0 && ac && ac.state === "running");
      var vertraag = mag ? LOOK * 1000 : 0;
      var gepland = performance.now() + vertraag;
      if (mag) {
        var t = ac.currentTime + LOOK;
        if (ch === " ") spatie(t); else tik(t);
      }

      setTimeout(function(){
        if (klaar) return;
        veld.appendChild(document.createTextNode(ch));
        window.__sync.push({ch: ch, gepland: gepland, dom: performance.now()});
        schuifMee();
      }, vertraag);

      var d = TEMPO + (Math.random() - 0.5) * 16;
      if (ch === " ") d *= 0.8;
      if (ch === "," || ch === ";" || ch === ":") d += 170;
      if (ch === ".") d += 200;
      typTimer = setTimeout(volgende, d);
    }
    volgende();
  }

  function opruimen(el, na){
    setTimeout(function(){ if (el.parentNode) el.remove(); }, na);
  }

  /* --------------------------------------------------------
     De drie voorbeelden
     -------------------------------------------------------- */

  /* De drie kaarten komen van ver naar voren en komen tot rust op hun
     eigen plek: eentje links, twee rechts. Ze blijven daarna liggen,
     zodat je ze rustig kunt bekijken. Een klik licht er eentje uit;
     inhoud komt later. De plek volgt uit de volgorde in VOORBEELDEN,
     dus drie regels wijzigen is genoeg. */

  function vliegVoorbeelden(){
    VOORBEELDEN.forEach(function(v, i){
      setTimeout(function(){
        if (klaar) return;
        var el = document.createElement("button");
        el.className = "ex plek-" + (i + 1);
        el.type = "button";
        el.style.setProperty("--r", v.r);
        el.innerHTML = '<span class="sheet"><span class="beeld"></span><span class="bij"></span></span><span class="note"></span>';
        el.querySelector(".bij").textContent = v.tekst;
        if (v.foto) {
          var img = new Image();
          img.alt = "";
          img.onload = function(){ el.querySelector(".beeld").appendChild(img); el.classList.add("met-foto"); };
          img.src = v.foto;
        }
        el.querySelector(".note").textContent = v.note;
        el.setAttribute("aria-label", v.tekst + ", " + v.note);
        el.addEventListener("click", function(){ el.classList.toggle("op"); });
        voorbeeldBak.appendChild(el);
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){ el.classList.add("lig"); });
        });
      }, i * 900);
    });
  }

  /* --------------------------------------------------------
     De enveloppen uit de kist
     -------------------------------------------------------- */

  function zwermEnveloppen(aantal){
    for (var i = 0; i < aantal; i++) {
      var el = document.createElement("div");
      el.className = "env";
      var hoek = (i / aantal) * Math.PI * 2 + Math.random() * 0.5;
      var ver = 260 + Math.random() * 420;
      el.style.setProperty("--ex", (Math.cos(hoek) * ver).toFixed(0) + "px");
      el.style.setProperty("--ey", (Math.sin(hoek) * ver * 0.62 - 60).toFixed(0) + "px");
      el.style.setProperty("--ez", (300 + Math.random() * 500).toFixed(0) + "px");
      el.style.setProperty("--es", (0.9 + Math.random() * 0.9).toFixed(2));
      el.style.setProperty("--er", ((Math.random() - 0.5) * 460).toFixed(0) + "deg");
      el.style.setProperty("--dur", (2.6 + Math.random() * 1.6).toFixed(2) + "s");
      el.style.setProperty("--del", (Math.random() * 1.1).toFixed(2) + "s");
      envBak.appendChild(el);
      (function(e){ requestAnimationFrame(function(){ e.classList.add("uit"); }); })(el);
      opruimen(el, 6200);
    }
  }

  /* Het geluid van een deksel dat opengaat: hout, scharnier, en de zwerm. */
  function doosGeluid(){
    if (geluid < 1 || !ac) return;
    var t = ac.currentTime;
    ruispuls(t, 1600, 1.2, 0.18, 0.09, 1.0);
    ruispuls(t + 0.16, 2400, 2.0, 0.08, 0.22, 0.7);
    ruispuls(t + 0.55, 3000, 0.6, 0.07, 0.50, 0.5);
  }

  /* --------------------------------------------------------
     De sequentie
     -------------------------------------------------------- */

  function scene(naam){
    if (naam === "leegte") intro.classList.add("me-in");
    if (naam === "kist")   intro.classList.add("kist");
    /* De kist komt naar voren, maar blijft dicht: die doet de bezoeker zelf. */
    if (naam === "open")   intro.classList.add("open");
    if (naam === "wacht"){
      intro.classList.add("wacht");
      var k = document.getElementById("chest");
      if (k) { k.disabled = false; k.addEventListener("click", openDoos);  }
    }
  }

  /* De klik op de kist: deksel open, gloed eruit, enveloppen naar buiten,
     en pas als die op gang zijn eindigt het verhaal. */
  function openDoos(){
    if (klaar || intro.classList.contains("goud")) return;
    intro.classList.add("goud");
    doosGeluid();
    setTimeout(function(){ if (!klaar) zwermEnveloppen(22); }, 380);
    setTimeout(eindig, 1700);
  }

  function speel(i){
    if (klaar || i >= SCRIPT.length) return;
    var stap = SCRIPT[i];
    if (stap.scene) scene(stap.scene);
    if (stap.voorbeelden) {
      vliegVoorbeelden();
      timer = setTimeout(function(){ speel(i + 1); }, stap.wacht);
      return;
    }
    toonRegel(stap, function(){
      timer = setTimeout(function(){ speel(i + 1); }, stap.wacht);
    });
  }

  /* --------------------------------------------------------
     Einde en overslaan
     -------------------------------------------------------- */

  function eindig(){
    if (klaar) return;
    klaar = true;
    clearTimeout(timer);
    clearTimeout(typTimer);
    intro.classList.add("gone");
    /* Pas na de uitfade echt uit de weg halen, anders knippert het. */
    setTimeout(function(){ intro.hidden = true; }, 1700);
    if (typeof afgerond === "function") afgerond();
  }

  /* De spatiebalk drie seconden vasthouden vult het ringetje. */
  function houdVast(ring){
    var DUUR = 3000, start = 0, bezig = false, raf = null;
    var OMTREK = 119.4;

    function tikRing(){
      var door = Math.min((performance.now() - start) / DUUR, 1);
      ring.querySelector(".fill").style.strokeDashoffset = (OMTREK * (1 - door)).toFixed(1);
      if (door >= 1) { los(); eindig(); return; }
      raf = requestAnimationFrame(tikRing);
    }
    function pak(){
      if (bezig || klaar) return;
      bezig = true; start = performance.now();
      ring.classList.add("bezig");
      raf = requestAnimationFrame(tikRing);
    }
    function los(){
      bezig = false;
      cancelAnimationFrame(raf);
      ring.classList.remove("bezig");
      ring.querySelector(".fill").style.strokeDashoffset = OMTREK;
    }

    window.addEventListener("keydown", function(e){
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        /* De overslaanknop bestaat pas zodra je de spatiebalk aanraakt. */
        intro.classList.add("spatie");
        pak();
      }
      if (e.key === "Escape") eindig();
    });
    window.addEventListener("keyup", function(e){ if (e.code === "Space") los(); });
    window.addEventListener("blur", los);
  }

  /* --------------------------------------------------------
     Naar buiten
     -------------------------------------------------------- */

  return {
    start: function(data, gereed){
      afgerond = gereed;
      intro = document.getElementById("intro");
      if (!intro) { if (gereed) gereed(); return; }

      /* Wie minder beweging wil, gaat meteen naar de bol. */
      if (rustig) { intro.hidden = true; if (gereed) gereed(); return; }
      if (opGang) return;
      opGang = true;

      lijnenBak = document.getElementById("lines");
      rol = document.createElement("div");
      rol.className = "rol";
      lijnenBak.appendChild(rol);
      voorbeeldBak = document.getElementById("examples");
      envBak = document.getElementById("envelopes");

      var foto = (data && data.profile && data.profile.photo) || "photos/niels.png";
      var img = document.getElementById("meImg");
      if (img) { img.src = foto; img.alt = (data.profile && data.profile.name) || ""; }

      /* Eén knop, twee standen: geluid aan (de typemachine) of uit.
         Browsers laten geluid pas toe na een echt gebaar; deze klik is
         dat gebaar. */
      var STANDEN = ["geluid uit", "geluid aan"];
      var gknop = document.getElementById("geluidBtn");
      var bewaard = gelezen();
      geluid = (bewaard === null) ? 1 : bewaard;

      function toonStand(){
        if (!gknop) return;
        gknop.setAttribute("aria-pressed", geluid > 0 ? "true" : "false");
        gknop.textContent = STANDEN[geluid] || STANDEN[0];
      }

      if (gknop) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { gknop.hidden = true; geluid = 0; }
        toonStand();
        gknop.addEventListener("click", function(){
          geluid = geluid > 0 ? 0 : 1;
          if (geluid > 0 && !audioAan()) geluid = 0;
          if (geluid > 0) probeerStarten();
          else { intro.classList.remove("stil"); if (ac) { try { ac.suspend(); } catch (e) {} } }
          bewaar(geluid);
          toonStand();
        });
      }

      /* Standaard aan: meteen proberen, en anders bij de eerste aanraking. */
      if (geluid > 0) probeerStarten();

      document.getElementById("skipBtn").addEventListener("click", eindig);
      houdVast(document.getElementById("skipRing"));

      setTimeout(function(){ speel(0); }, 700);
    },

    /* Zodat ik het verhaal in een test kan doorspoelen. */
    _eindig: function(){ eindig(); },

    /* Alleen voor de test: de stand van de audioklok. */
    _audio: function(){ return ac ? ac.state : null; }
  };
})();
