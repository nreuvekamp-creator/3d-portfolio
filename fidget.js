/* ============================================================
   De friemellaag.

   Het idee: je kunt met je handen spelen terwijl je echt luistert.
   Deze laag reageert altijd, ook als het verhaal gewoon doorloopt,
   en hij houdt nooit het verhaal tegen.

   - muis bewegen  -> blaadjes drijven mee, het papier deint zacht
   - klikken       -> er valt een inktvlek die blijft liggen
   - blijven klikken -> het wordt drukker, het spoor van je ongeduld
   ============================================================ */

window.Fidget = (function(){
  "use strict";

  var INKTEN = ["--cyan", "--magenta", "--yellow"];
  var MAX_VLEKKEN = 60;     /* daarna ruimen we de oudste op */
  var MAX_BLAADJES = 26;

  var laag, aan = false, blaadjes = [], vlekken = [];
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

  /* ---------- inktvlekken ---------- */

  function laatVlekVallen(x, y){
    var nu = Date.now();
    /* Snel achter elkaar klikken maakt het drukker, niet netter. */
    if (nu - laatsteKlik < 900) klikken++; else klikken = 1;
    laatsteKlik = nu;

    var aantal = Math.min(1 + Math.floor(klikken / 3), 4);
    for (var i = 0; i < aantal; i++) zetVlek(x, y, i);

    /* Oudste opruimen zodat het nooit echt vol loopt. */
    while (vlekken.length > MAX_VLEKKEN) {
      var oud = vlekken.shift();
      oud.style.transition = "opacity .9s linear";
      oud.style.opacity = "0";
      setTimeout(function(e){ return function(){ e.remove(); }; }(oud), 950);
    }
  }

  function zetVlek(x, y, i){
    var el = document.createElement("div");
    el.className = "blot";
    var maat = 9 + Math.random() * (i ? 12 : 26);
    var sprong = i ? (Math.random() - 0.5) * 70 : 0;
    var sprongY = i ? (Math.random() - 0.5) * 70 : 0;
    el.style.cssText =
      "left:" + (x + sprong - maat / 2) + "px;" +
      "top:" + (y + sprongY - maat / 2) + "px;" +
      "width:" + maat + "px;height:" + maat + "px;" +
      "background:" + inkt() + ";" +
      "transform:scale(.1) rotate(" + (Math.random() * 360) + "deg)";
    laag.appendChild(el);
    vlekken.push(el);

    /* Twee frames wachten zodat de browser de starttoestand echt ziet. */
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        el.style.transition = "transform .55s " + "cubic-bezier(.16,1,.3,1)" + ",opacity .4s linear";
        el.style.transform = "scale(1) rotate(" + (Math.random() * 360) + "deg)";
        el.style.opacity = (0.16 + Math.random() * 0.2).toFixed(2);
      });
    });
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
        laatVlekVallen(e.clientX, e.clientY);
      }, {passive: true});

      requestAnimationFrame(tik);
    },

    /* Minder blaadjes zodra de bol er is: daar moet de aandacht heen. */
    kalmeer: function(){
      var weg = blaadjes.splice(10);
      weg.forEach(function(b){
        b.el.style.transition = "opacity 1.2s linear";
        b.el.style.opacity = "0";
        setTimeout(function(){ b.el.remove(); }, 1300);
      });
    },

    stop: function(){ aan = false; }
  };
})();
