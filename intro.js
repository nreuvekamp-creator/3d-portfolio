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
  var VOORBEELDEN = [
    {tekst: "een marathon gelopen in de vorm van een hartje", note: "op de kaart getekend", dx: -230, dy: -90,  r: "-7deg"},
    {tekst: "een half jaar studeren in Bergen", note: "Noorwegen", dx: 250, dy: 40, r: "6deg"},
    {tekst: "deze site", note: "ja, deze. dit is nummer drie", dx: -40, dy: 150, r: "-3deg"}
  ];

  var intro, lijnenBak, rol, voorbeeldBak, envBak;
  var timer = null, typTimer = null, klaar = false, opGang = false;
  var afgerond;

  var rustig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------
     Geluid. Drie standen: 0 uit, 1 typemachine, 2 typemachine en stem.
     Alles wordt ter plekke gemaakt met de Web Audio API; er zijn geen
     geluidsbestanden. Zonder geluid loopt het verhaal precies zo door.
     ------------------------------------------------------------ */

  var geluid = 0;
  var ac = null, mix = null, ruisBuf = null;

  function audioAan(){
    if (ac) { if (ac.state === "suspended") ac.resume(); return true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ac = new AC();
      mix = ac.createGain();
      mix.gain.value = 0.95;
      mix.connect(ac.destination);
      /* Een kwart seconde uitdovende ruis: de grondstof van elke tik. */
      var n = Math.floor(ac.sampleRate * 0.25);
      ruisBuf = ac.createBuffer(1, n, ac.sampleRate);
      var d = ruisBuf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      return true;
    } catch (e) { ac = null; return false; }
  }

  function ruispuls(t, freq, q, vol, duur, rate){
    var s = ac.createBufferSource();
    s.buffer = ruisBuf;
    s.playbackRate.value = rate;
    var bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duur);
    s.connect(bp); bp.connect(g); g.connect(mix);
    s.start(t); s.stop(t + duur + 0.03);
  }

  /* Een korte toon onder de ruis: de hamer die het papier raakt. */
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

  /* Vijf aanslagen die echt van elkaar verschillen: hard, dof, met
     nagalm van het mechaniek, licht, en eentje die net achterblijft.
     Elke toets krijgt er willekeurig een, nooit twee keer dezelfde
     achter elkaar. */
  var AANSLAGEN = [
    /* 0: hard, kort, hoog in het lint */
    function(t){
      ruispuls(t, 2700, 0.8, 0.52, 0.045, 1.25);
      toon(t, "triangle", 250, 82, 0.26, 0.055);
    },
    /* 1: dof, zwaar, alsof de toets te diep gaat */
    function(t){
      ruispuls(t, 820, 1.1, 0.46, 0.085, 0.5);
      toon(t, "sine", 145, 58, 0.30, 0.095);
    },
    /* 2: met nagalm van het mechaniek erachteraan */
    function(t){
      ruispuls(t, 1800, 0.7, 0.42, 0.05, 1.0);
      ruispuls(t + 0.035, 3300, 2.2, 0.20, 0.20, 0.3);
      toon(t, "triangle", 205, 70, 0.20, 0.07);
    },
    /* 3: licht, bijna een tikje op glas */
    function(t){
      ruispuls(t, 3600, 1.5, 0.34, 0.03, 1.5);
      toon(t, "square", 360, 150, 0.10, 0.03);
    },
    /* 4: blijft net achter; eerst het toetsje, dan pas de klap */
    function(t){
      ruispuls(t, 2100, 1.8, 0.14, 0.02, 1.6);
      ruispuls(t + 0.028, 1300, 0.9, 0.50, 0.07, 0.75);
      toon(t + 0.028, "triangle", 175, 62, 0.28, 0.085);
    }
  ];

  var vorigeAanslag = -1;
  /* Voor de test: welke aanslag klonk wanneer. */
  window.__tikLog = [];

  function tik(){
    var k = Math.floor(Math.random() * AANSLAGEN.length);
    if (k === vorigeAanslag) k = (k + 1 + Math.floor(Math.random() * (AANSLAGEN.length - 1))) % AANSLAGEN.length;
    vorigeAanslag = k;
    window.__tikLog.push(k);
    if (geluid < 1 || !ac) return;
    AANSLAGEN[k](ac.currentTime);
  }

  /* De spatiebalk: breed, zacht en laag, duidelijk geen letter. */
  function spatie(){
    if (geluid < 1 || !ac) return;
    var t = ac.currentTime;
    ruispuls(t, 480, 0.7, 0.26, 0.10, 0.35);
    toon(t, "sine", 96, 52, 0.14, 0.09);
  }

  /* Eind van de regel: het belletje en de wagen die terugschuift. */
  function retour(){
    if (geluid < 1 || !ac) return;
    var t = ac.currentTime;
    var o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(1720, t);
    var og = ac.createGain();
    og.gain.setValueAtTime(0.16, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(og); og.connect(mix);
    o.start(t); o.stop(t + 0.36);
    ruispuls(t + 0.09, 900, 0.7, 0.13, 0.22, 0.35);
    ruispuls(t + 0.26, 380, 1.4, 0.16, 0.07, 0.6);
  }

  /* ------------------------------------------------------------
     De stem. Voorlopig die van de browser, laag en langzaam gezet.
     Zodra er echte opnamen zijn, krijgt elke regel in SCRIPT een
     bestandsnaam in `stem` en vervangt `zeg()` de spraaksynthese
     door een audio-element.
     ------------------------------------------------------------ */

  function stemKeuze(){
    if (!window.speechSynthesis) return null;
    var lijst = speechSynthesis.getVoices() || [];
    var nl = lijst.filter(function(v){ return /^nl/i.test(v.lang); });
    /* Liefst een mannenstem; anders de eerste Nederlandse; anders wat er is. */
    var diep = nl.filter(function(v){ return /(man|male|xander|ruben|frank|daan)/i.test(v.name); });
    return diep[0] || nl[0] || lijst[0] || null;
  }

  function zeg(tekst){
    if (geluid < 2 || !tekst || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(tekst);
    var v = stemKeuze();
    if (v) u.voice = v;
    u.lang = (v && v.lang) || "nl-NL";
    u.pitch = 0.55;   /* zo laag als het mag: een verteller, geen assistent */
    u.rate = 0.86;
    u.volume = 0.95;
    speechSynthesis.speak(u);
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
    zeg(stap.tekst);

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
      veld.appendChild(document.createTextNode(ch));
      if (ch === " ") spatie(); else tik();
      schuifMee();
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
        el.innerHTML = '<span class="sheet"></span><span class="note"></span>';
        el.querySelector(".sheet").textContent = v.tekst;
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
    ruispuls(t, 260, 1.2, 0.22, 0.13, 0.5);
    ruispuls(t + 0.16, 2400, 2.0, 0.09, 0.30, 0.25);
    ruispuls(t + 0.55, 1200, 0.6, 0.10, 0.90, 0.2);
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
    if (window.speechSynthesis) speechSynthesis.cancel();
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

      /* Eén knop, drie standen: uit, alleen de typemachine, en de
         typemachine met de verteller erbij. Browsers laten geluid pas
         toe na een echt gebaar; deze klik is dat gebaar. */
      var STANDEN = ["geluid aan", "typemachine", "typemachine en stem"];
      var gknop = document.getElementById("geluidBtn");
      if (gknop) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC && !window.speechSynthesis) gknop.hidden = true;
        gknop.addEventListener("click", function(){
          var max = window.speechSynthesis ? 2 : 1;
          geluid = (geluid + 1) % (max + 1);
          if (geluid > 0 && !audioAan()) geluid = window.speechSynthesis ? 2 : 0;
          gknop.setAttribute("aria-pressed", geluid > 0 ? "true" : "false");
          gknop.textContent = STANDEN[geluid] || STANDEN[0];
          if (geluid < 2 && window.speechSynthesis) speechSynthesis.cancel();
          if (geluid > 0) tik();
        });
      }

      document.getElementById("skipBtn").addEventListener("click", eindig);
      houdVast(document.getElementById("skipRing"));

      setTimeout(function(){ speel(0); }, 700);
    },

    /* Zodat ik het verhaal in een test kan doorspoelen. */
    _eindig: function(){ eindig(); }
  };
})();
