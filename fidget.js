/* ============================================================
   De friemellaag.

   Het idee: je kunt met je handen spelen terwijl je echt luistert.
   Deze laag reageert altijd, ook als het verhaal gewoon doorloopt,
   en hij houdt nooit het verhaal tegen.

   - muis bewegen  -> de bloesem merkt je op en wijkt uit
   - klikken       -> er dwarrelt bloesem bij
   - blijven klikken -> het wordt voller
   ============================================================ */

window.Fidget = (function(){
  "use strict";

  var INKTEN = ["--cyan", "--magenta", "--yellow"];
  var MAX_BLAADJES = 54;     /* bloesem mag rijk zijn */
  var MAX_EXTRA   = 130;    /* wat je er zelf bij klikt */

  var laag, aan = false, blaadjes = [];
  var muisX = 0.5, muisY = 0.5, doelX = 0.5, doelY = 0.5;
  var klikken = 0, laatsteKlik = 0;
  var rustigAan = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function inkt(){
    var v = INKTEN[(Math.random() * INKTEN.length) | 0];
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  /* ---------- blaadjes ---------- */

  function maakBlaadje(){
    var el = document.createElement("div");
    el.className = "petal";
    el.style.background = inkt();
    laag.appendChild(el);
    return {
      el: el,
      x: Math.random() * window.innerWidth,
      y: -30 - Math.random() * window.innerHeight,
      vy: 0.22 + Math.random() * 0.5,
      vx: 0,
      draai: Math.random() * 360,
      dDraai: (Math.random() - 0.5) * 1.1,
      zwaai: 0.4 + Math.random() * 1.2,
      fase: Math.random() * Math.PI * 2,
      maat: 0.45 + Math.random() * 0.85
    };
  }

  /* Een blaadje dat uit een klik ontstaat, begint bij je vinger. */
  function strooiBlaadje(x, y){
    var b = maakBlaadje();
    b.x = x + (Math.random() - 0.5) * 60;
    b.y = y + (Math.random() - 0.5) * 40;
    b.vy = 0.3 + Math.random() * 0.7;
    b.maat = 0.5 + Math.random() * 1.0;
    b.el.style.opacity = "0";
    b.el.style.transition = "opacity .6s linear";
    requestAnimationFrame(function(){ b.el.style.opacity = ""; });
    blaadjes.push(b);
  }

  function beweegBlaadjes(t){
    for (var i = 0; i < blaadjes.length; i++) {
      var b = blaadjes[i];
      b.fase += 0.012;
      /* De muis duwt de blaadjes opzij, alsof je langs ze heen loopt. */
      var duw = (muisX - 0.5) * 1.6;
      b.vx = Math.sin(b.fase) * b.zwaai + duw;
      b.x += b.vx;
      b.y += b.vy;
      b.draai += b.dDraai;

      if (b.y > window.innerHeight + 40) { b.y = -30; b.x = Math.random() * window.innerWidth; }
      if (b.x < -40) b.x = window.innerWidth + 30;
      if (b.x > window.innerWidth + 40) b.x = -30;

      b.el.style.transform =
        "translate(" + b.x.toFixed(1) + "px," + b.y.toFixed(1) + "px)" +
        " rotate(" + b.draai.toFixed(1) + "deg) scale(" + b.maat.toFixed(2) + ")";
    }
  }

  /* ---------- klikken ---------- */

  /* Een klik laat geen inkt meer achter; er dwarrelt alleen bloesem bij.
     De vlekken bleven staan en dat vond hij niet mooi. */
  function bijKlik(x, y){
    if (!aan) return;
    var nu = Date.now();
    if (nu - laatsteKlik < 900) klikken++; else klikken = 1;
    laatsteKlik = nu;

    var bloei = Math.min(4 + klikken, 12);
    for (var j = 0; j < bloei && blaadjes.length < MAX_EXTRA; j++) strooiBlaadje(x, y);
  }

  /* ---------- het papier laten deinen ---------- */

  function beweegPapier(){
    muisX += (doelX - muisX) * 0.055;
    muisY += (doelY - muisY) * 0.055;
    document.documentElement.style.setProperty("--mx", muisX.toFixed(4));
    document.documentElement.style.setProperty("--my", muisY.toFixed(4));
    /* Een paar pixels verschuiving in de korrel: genoeg om te voelen, te weinig om te zien. */
    var g = document.querySelector(".paper-grain");
    if (g) g.style.transform = "translate(" + ((muisX - .5) * -10).toFixed(1) + "px," +
                                              ((muisY - .5) * -10).toFixed(1) + "px)";
  }

  /* ---------- lus ---------- */

  function tik(t){
    if (!aan) return;
    beweegPapier();
    beweegBlaadjes(t);
    requestAnimationFrame(tik);
  }

  /* ---------- naar buiten ---------- */

  return {
    start: function(){
      if (rustigAan || aan) return;
      laag = document.getElementById("fidget");
      if (!laag) return;
      aan = true;
      for (var i = 0; i < MAX_BLAADJES; i++) blaadjes.push(maakBlaadje());

      window.addEventListener("pointermove", function(e){
        doelX = e.clientX / window.innerWidth;
        doelY = e.clientY / window.innerHeight;
      }, {passive: true});

      window.addEventListener("pointerdown", function(e){
        bijKlik(e.clientX, e.clientY);
      }, {passive: true});

      requestAnimationFrame(tik);
    },

    /* Bij de bol gaat alles weg: bloesem en inkt horen bij het verhaal, niet bij de kaart. */
    kalmeer: function(){
      aan = false;
      var weg = blaadjes.splice(0);
      weg.forEach(function(b){
        b.el.style.transition = "opacity 1.2s linear";
        b.el.style.opacity = "0";
        setTimeout(function(){ b.el.remove(); }, 1300);
      });
      /* Laatste veegbeurt: wat de klik van zojuist nog achterliet, gaat ook mee. */
      setTimeout(function(){ if (laag) laag.textContent = ""; }, 1400);
    },

    stop: function(){ aan = false; }
  };
})();
