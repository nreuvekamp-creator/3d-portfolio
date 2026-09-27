/* ============================================================
   Het verhaal.

   Vijf scenes die zichzelf afspelen. De bezoeker hoeft niets te doen,
   maar mag alles onderbreken: knop, Escape, of de spatiebalk drie
   seconden vasthouden.

   De tekst staat hieronder in SCRIPT. Dat is het enige wat je hoeft
   aan te passen als het verhaal verandert; de rest regelt zichzelf.
   Elke regel kan later een geluidsfragment krijgen via het veld
   `stem`, zonder dat er iets anders verandert.
   ============================================================ */

window.Intro = (function(){
  "use strict";

  /* --------------------------------------------------------
     Het script. `wacht` is hoe lang de regel blijft staan
     voordat de volgende komt, in milliseconden.
     -------------------------------------------------------- */

  var SCRIPT = [
    {scene: "leegte", tekst: "Hi, ik ben Niels.", wacht: 1900},
    {tekst: "Welkom op mijn plekje op het internet.", wacht: 2300},
    {tekst: "Het is hier groot, en toch ben je op de juiste plek beland.", klasse: "small", wacht: 2100},

    {scene: "breed", tekst: "Mijn interesses lopen alle kanten op.", wacht: 2100},
    {voorbeelden: true, wacht: 3600},

    {scene: "kist", tekst: "Dat komt omdat ik iemand van ideeën ben.", wacht: 2200},
    {tekst: "Mijn hoofd ontploft er soms van.", wacht: 2100},
    {tekst: "Dus ik verzamel ze.", klasse: "hand", wacht: 1900},
    {tekst: "In een doos.", wacht: 2100},

    {scene: "open", tekst: "", wacht: 1200},
    {tekst: "Elk idee kwam ergens vandaan.", wacht: 2200},
    {tekst: "Dus elk idee heeft een plek op de wereld.", wacht: 2600},

    {scene: "land", tekst: "", wacht: 800}
  ];

  /* De drie dingen die langsvliegen. De derde is de grap: dit is het. */
  var VOORBEELDEN = [
    {tekst: "een marathon gelopen in de vorm van een hartje", note: "op de kaart getekend", dx: -230, dy: -90,  r: "-7deg"},
    {tekst: "een half jaar studeren in Bergen", note: "Noorwegen", dx: 250, dy: 40, r: "6deg"},
    {tekst: "deze site", note: "ja, deze. dit is nummer drie", dx: -40, dy: 150, r: "-3deg"}
  ];

  var intro, lijnenBak, voorbeeldBak, envBak;
  var timer = null, klaar = false, opGang = false;
  var afgerond;

  var rustig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* --------------------------------------------------------
     Regels tonen
     -------------------------------------------------------- */

  function toonRegel(stap){
    /* Wat er staat, verdwijnt naar voren toe. */
    var oud = lijnenBak.querySelectorAll(".line.in");
    for (var i = 0; i < oud.length; i++) {
      oud[i].classList.remove("in");
      oud[i].classList.add("out");
      opruimen(oud[i], 1600);
    }
    if (!stap.tekst) return;

    var el = document.createElement("span");
    el.className = "line" + (stap.klasse ? " " + stap.klasse : "");
    el.textContent = stap.tekst;
    lijnenBak.appendChild(el);
    /* Twee frames wachten zodat de begintoestand echt wordt getekend. */
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){ el.classList.add("in"); });
    });
  }

  function opruimen(el, na){
    setTimeout(function(){ if (el.parentNode) el.remove(); }, na);
  }

  /* --------------------------------------------------------
     De drie voorbeelden
     -------------------------------------------------------- */

  function vliegVoorbeelden(){
    VOORBEELDEN.forEach(function(v, i){
      setTimeout(function(){
        if (klaar) return;
        var el = document.createElement("div");
        el.className = "ex";
        el.style.setProperty("--dx", v.dx + "px");
        el.style.setProperty("--dy", v.dy + "px");
        el.style.setProperty("--r", v.r);
        el.innerHTML = '<div class="sheet"></div><div class="note"></div>';
        el.querySelector(".sheet").textContent = v.tekst;
        el.querySelector(".note").textContent = v.note;
        voorbeeldBak.appendChild(el);
        requestAnimationFrame(function(){ el.classList.add("fly"); });
        opruimen(el, 3800);
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
      el.style.setProperty("--del", (Math.random() * 1.5).toFixed(2) + "s");
      envBak.appendChild(el);
      (function(e){ requestAnimationFrame(function(){ e.classList.add("uit"); }); })(el);
      opruimen(el, 6200);
    }
  }

  /* --------------------------------------------------------
     De sequentie
     -------------------------------------------------------- */

  function scene(naam){
    if (naam === "leegte") intro.classList.add("me-in");
    if (naam === "kist")   intro.classList.add("kist");
    if (naam === "open"){
      intro.classList.add("open", "goud");
      zwermEnveloppen(22);
    }
    if (naam === "land") eindig();
  }

  function speel(i){
    if (klaar || i >= SCRIPT.length) return;
    var stap = SCRIPT[i];
    if (stap.scene) scene(stap.scene);
    if (stap.voorbeelden) vliegVoorbeelden(); else toonRegel(stap);
    timer = setTimeout(function(){ speel(i + 1); }, stap.wacht);
  }

  /* --------------------------------------------------------
     Einde en overslaan
     -------------------------------------------------------- */

  function eindig(){
    if (klaar) return;
    klaar = true;
    clearTimeout(timer);
    intro.classList.add("gone");
    /* Pas na de uitfade echt uit de weg halen, anders knippert het. */
    setTimeout(function(){ intro.hidden = true; }, 1700);
    if (typeof afgerond === "function") afgerond();
  }

  /* De spatiebalk drie seconden vasthouden vult het ringetje. */
  function houdVast(ring){
    var DUUR = 3000, start = 0, bezig = false, raf = null;
    var OMTREK = 119.4;

    function tik(){
      var door = Math.min((performance.now() - start) / DUUR, 1);
      ring.querySelector(".fill").style.strokeDashoffset = (OMTREK * (1 - door)).toFixed(1);
      if (door >= 1) { los(); eindig(); return; }
      raf = requestAnimationFrame(tik);
    }
    function pak(){
      if (bezig || klaar) return;
      bezig = true; start = performance.now();
      ring.classList.add("bezig");
      raf = requestAnimationFrame(tik);
    }
    function los(){
      bezig = false;
      cancelAnimationFrame(raf);
      ring.classList.remove("bezig");
      ring.querySelector(".fill").style.strokeDashoffset = OMTREK;
    }

    window.addEventListener("keydown", function(e){
      if (e.code === "Space" && !e.repeat) { e.preventDefault(); pak(); }
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
      voorbeeldBak = document.getElementById("examples");
      envBak = document.getElementById("envelopes");

      var foto = (data && data.profile && data.profile.photo) || "photos/niels.png";
      var img = document.getElementById("meImg");
      if (img) { img.src = foto; img.alt = (data.profile && data.profile.name) || ""; }

      document.getElementById("skipBtn").addEventListener("click", eindig);
      houdVast(document.getElementById("skipRing"));

      setTimeout(function(){ speel(0); }, 700);
    },

    /* Zodat ik het verhaal in een test kan doorspoelen. */
    _eindig: function(){ eindig(); }
  };
})();
