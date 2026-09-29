/* ============================================================
   De friemellaag.

   Het idee: je kunt met je handen spelen terwijl je echt luistert.
   Deze laag reageert altijd, ook als het verhaal gewoon doorloopt,
   en hij houdt nooit het verhaal tegen.

   - muis bewegen  -> je hand maakt een vlaag; alleen de bloesem vlak om je
                      vinger waait mee, de rest drijft ongestoord door
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
  /* De wind. Niet waar je muis STAAT bepaalt de richting, maar waar hij
     NAARTOE beweegt: achter je hand ontstaat een zog dat de blaadjes meetrekt.
     windX en windY zijn pixels per frame; ze doven vanzelf uit. */
  var windX = 0, windY = 0, vorigeX = null, vorigeY = null;
  /* De vlaag reikt niet verder dan dit, in pixels. Daarbuiten merkt een
     blaadje niets van je hand; alleen wat vlak langs je vinger drijft waait mee. */
  var BEREIK = 210;
  var handX = -9999, handY = -9999;
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
    /* De vlaag zakt elk frame een beetje in, zoals echte wind. */
    windX *= 0.94;
    windY *= 0.94;
    if (Math.abs(windX) < 0.01) windX = 0;
    if (Math.abs(windY) < 0.01) windY = 0;

    for (var i = 0; i < blaadjes.length; i++) {
      var b = blaadjes[i];
      b.fase += 0.012;
      /* Hoe dichter bij je hand, hoe harder de vlaag. Buiten het bereik nul. */
      var ax = b.x - handX, ay = b.y - handY;
      var afstand = Math.sqrt(ax * ax + ay * ay);
      var nabij = 0;
      if (afstand < BEREIK) {
        var v = 1 - afstand / BEREIK;
        nabij = v * v * (3 - 2 * v);   /* zachte rand, geen harde cirkel */
      }

      /* Licht blad vangt meer wind dan zwaar blad. */
      var vangst = (1.35 - b.maat * 0.5) * nabij;
      b.vx = Math.sin(b.fase) * b.zwaai + windX * vangst;
      b.x += b.vx;
      b.y += b.vy + windY * vangst * 0.7;
      b.draai += b.dDraai + windX * vangst * 0.9;

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
        handX = e.clientX;
        handY = e.clientY;

        /* Snelheid van de hand wordt windkracht, met een plafond zodat een
           ruk met de muis de blaadjes niet het scherm uit slingert. */
        if (vorigeX !== null) {
          var dx = e.clientX - vorigeX;
          var dy = e.clientY - vorigeY;
          windX += Math.max(-26, Math.min(26, dx)) * 0.055;
          windY += Math.max(-26, Math.min(26, dy)) * 0.030;
          windX = Math.max(-5.5, Math.min(5.5, windX));
          windY = Math.max(-3.5, Math.min(3.5, windY));
        }
        vorigeX = e.clientX;
        vorigeY = e.clientY;
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
