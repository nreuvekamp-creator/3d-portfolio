/* ============================================================
   De zaal. Een museumzaal van CSS 3D: vier wanden, vloer, plafond.
   Alle markup wordt hier gemaakt, index.html blijft ongemoeid.
   ============================================================ */

window.Zaal = (function(){

  var W = 2200;          /* breedte en diepte van de zaal in px */
  var H = 820;           /* hoogte */
  var PER_WALL = 8;
  var EXTS = ["jpg","png","jpeg","webp"];

  var root = null, stage = null, room = null, readEl = null;
  var warp = null, portalBtn = null;
  var arts = [];
  var closeCbs = [];
  var flat = false;
  var open = false;
  var porting = false;
  var portTimers = [];

  var PORTAL_YAW = 180;   /* de wand waar de doorgang in staat */

  var yaw = 0, pitch = 0, dist = 0;
  var yawTarget = 0, pitchTarget = 0, distTarget = 0;
  var raf = null;

  function el(tag, cls, text){
    var n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = text;
    return n;
  }

  function jaar(d){
    if(!d) return "";
    return String(d).slice(0,4);
  }

  /* Probeert de extensies op volgorde; de eerste die laadt wint. */
  function vindFoto(id, cb){
    var i = 0;
    (function poging(){
      if(i >= EXTS.length){ cb(null); return; }
      var src = "photos/" + id + "." + EXTS[i++];
      var img = new Image();
      img.onload = function(){ cb(src); };
      img.onerror = poging;
      img.src = src;
    })();
  }

  function maakWerk(item, index){
    var btn = el("button", "z-art");
    btn.type = "button";
    btn.setAttribute("aria-label", item.title + ", " + (item.place || "") );

    var frame = el("div", "z-frame");
    var mat = el("div", "z-mat");
    var plate = el("div", "z-plate");

    var titelVlak = el("span", null, item.title);
    plate.classList.add("is-blank");
    plate.appendChild(titelVlak);

    vindFoto(item.id, function(src){
      if(!src) return;
      var img = new Image();
      img.alt = "";
      img.src = src;
      plate.classList.remove("is-blank");
      plate.textContent = "";
      plate.appendChild(img);
      item._foto = src;
    });

    mat.appendChild(plate);
    frame.appendChild(mat);

    var plaque = el("div", "z-plaque");
    plaque.appendChild(el("span", "z-t", item.title));
    var meta = [jaar(item.date), item.place].filter(Boolean).join("; ");
    plaque.appendChild(el("span", "z-m", meta));
    frame.appendChild(plaque);

    btn.appendChild(frame);
    btn._item = item;
    btn._index = index;

    btn.addEventListener("click", function(){ toon(index); });
    btn.addEventListener("focus", function(){
      if(!flat) richt(index, true);
    });
    return btn;
  }

  /* De doorgang: een deurpost van inkt met een aquarelvlak erin
     dat langzaam draait, alsof er een andere wereld doorheen schijnt. */
  function maakPortal(){
    var btn = el("button", "z-portal");
    btn.type = "button";
    btn.setAttribute("aria-label", "Stap door de doorgang, terug naar de wereldbol");

    var post = el("span", "z-portal-post");
    var eye = el("span", "z-portal-eye");
    eye.appendChild(el("span", "z-portal-wash"));
    eye.appendChild(el("span", "z-portal-swirl"));
    eye.appendChild(el("span", "z-portal-scheur"));
    eye.appendChild(el("span", "z-portal-haze"));
    post.appendChild(eye);
    btn.appendChild(post);

    var plaq = el("span", "z-portal-plaque");
    plaq.appendChild(el("span", "label", "doorgang"));
    plaq.appendChild(el("span", "z-portal-naam", "terug naar de wereld"));
    btn.appendChild(plaq);

    btn.addEventListener("click", stapDoor);
    portalBtn = btn;
    return btn;
  }

  function wisTimers(){
    portTimers.forEach(clearTimeout);
    portTimers = [];
  }

  /* Erdoorheen: camera naar de opening, de opening vult het scherm,
     daarna pas de gewone sluitroutine. */
  function stapDoor(){
    if(!open || porting) return;
    if(flat){ api.close(); return; }

    porting = true;
    root.classList.add("is-porting");
    if(readEl.classList.contains("is-open")) sluitLezer();

    var y = PORTAL_YAW;
    while(y - yawTarget > 180) y -= 360;
    while(y - yawTarget < -180) y += 360;
    yawTarget = y;
    pitchTarget = 0;
    distTarget = 420;
    loop();

    portTimers.push(setTimeout(function(){
      distTarget = 2100;          /* de laatste stap door de opening */
      loop();
      warp.classList.add("is-flying");
    }, 460));

    portTimers.push(setTimeout(function(){
      api.close();
    }, 1240));
  }

  function bouwZaal(items){
    var faces = [
      {cls:"z-wall", tf:"translateZ(" + (-W/2) + "px)", yaw:0},
      {cls:"z-wall", tf:"translateX(" + (W/2) + "px) rotateY(-90deg)", yaw:90},
      /* De achterwand hangt niet vol; daar staat de doorgang. */
      {cls:"z-wall z-wall--portal", tf:"translateZ(" + (W/2) + "px) rotateY(180deg)", yaw:180, portal:true},
      {cls:"z-wall", tf:"translateX(" + (-W/2) + "px) rotateY(90deg)", yaw:270}
    ];

    var perWall = Math.max(1, Math.ceil(items.length / 3));
    if(perWall > PER_WALL) perWall = perWall;

    var idx = 0;
    faces.forEach(function(f){
      var wall = el("div", "z-face " + f.cls);
      wall.style.transform = f.tf;
      room.appendChild(wall);

      if(f.portal){ wall.appendChild(maakPortal()); return; }

      var deel = items.slice(idx, idx + perWall);
      deel.forEach(function(item, i){
        var u = ((i + 0.5) / deel.length - 0.5) * W;      /* zijwaartse plek op de wand */
        var node = maakWerk(item, idx + i);
        node.style.width = Math.min(260, (W / deel.length) - 26) + "px";
        node.style.left = (W/2 + u) + "px";
        node.style.top = "200px";
        node.style.transform = "translateX(-50%) translateZ(14px)";
        wall.appendChild(node);

        arts.push({
          node: node,
          item: item,
          yaw: f.yaw + (Math.atan2(u, W/2) * 180 / Math.PI)
        });
      });
      idx += perWall;
    });

    var floor = el("div", "z-face z-floor");
    floor.style.transform = "translateY(" + (H/2) + "px) rotateX(90deg)";
    room.appendChild(floor);

    var ceil = el("div", "z-face z-ceil");
    ceil.style.transform = "translateY(" + (-H/2) + "px) rotateX(-90deg)";
    room.appendChild(ceil);
  }

  function bouwPlat(items){
    var grid = el("div", "z-grid");
    items.forEach(function(item, i){
      var node = maakWerk(item, i);
      grid.appendChild(node);
      arts.push({node:node, item:item, yaw:0});
    });
    grid.appendChild(maakPortal());
    root.appendChild(grid);
  }

  /* ---------------------------------------------------------- */

  function pas(){
    room.style.setProperty("--z-yaw", yaw.toFixed(2) + "deg");
    room.style.setProperty("--z-pitch", pitch.toFixed(2) + "deg");
    room.style.setProperty("--z-dist", dist.toFixed(1) + "px");
  }

  function anim(){
    raf = null;
    var dy = yawTarget - yaw, dp = pitchTarget - pitch, dd = distTarget - dist;
    yaw += dy * 0.14; pitch += dp * 0.14; dist += dd * 0.14;
    pas();
    if(Math.abs(dy) + Math.abs(dp) + Math.abs(dd) > 0.05) raf = requestAnimationFrame(anim);
  }
  function loop(){ if(!raf && !flat) raf = requestAnimationFrame(anim); }

  function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }

  function richt(index, zacht){
    var a = arts[index];
    if(!a) return;
    var y = a.yaw;
    /* kies de kortste draai naar dat werk */
    while(y - yawTarget > 180) y -= 360;
    while(y - yawTarget < -180) y += 360;
    yawTarget = y;
    pitchTarget = 0;
    distTarget = zacht ? Math.max(distTarget, 150) : 760;
    loop();
  }

  function toon(index){
    var a = arts[index];
    if(!a) return;
    if(!flat) richt(index, false);
    vulLezer(a.item);
    readEl.classList.add("is-open");
    root.classList.add("has-read");
    readEl.setAttribute("aria-hidden", "false");
    readEl.querySelector(".z-close").focus();
  }

  function vulLezer(item){
    var b = readEl.querySelector(".z-rbody");
    b.textContent = "";

    var meta = [jaar(item.date), item.place, item.country].filter(Boolean).join("; ");
    b.appendChild(el("p", "z-rmeta", meta));
    b.appendChild(el("h3", null, item.title));

    if(item._foto){
      var fig = el("figure", "z-rfig");
      var img = new Image();
      img.src = item._foto; img.alt = "";
      fig.appendChild(img);
      b.appendChild(fig);
    }
    if(item.summary) b.appendChild(el("p", "z-rsum", item.summary));
    if(item.body){
      String(item.body).split(/\n\s*\n/).forEach(function(p){
        if(p.trim()) b.appendChild(el("p", null, p.trim()));
      });
    }
    if(item.tags && item.tags.length){
      var t = el("div", "z-rtags");
      item.tags.forEach(function(tag){ t.appendChild(el("span", null, tag)); });
      b.appendChild(t);
    }
  }

  function sluitLezer(){
    readEl.classList.remove("is-open");
    root.classList.remove("has-read");
    readEl.setAttribute("aria-hidden", "true");
    if(!flat){ distTarget = 120; loop(); }
  }

  /* ---------------------------------------------------------- */

  function bind(){
    var dragging = false, px = 0, py = 0, moved = 0;

    function start(x, y){ dragging = true; px = x; py = y; moved = 0; stage.classList.add("is-dragging"); }
    function move(x, y){
      if(!dragging) return;
      var dx = x - px, dy = y - py;
      px = x; py = y; moved += Math.abs(dx) + Math.abs(dy);
      yawTarget -= dx * 0.16;
      pitchTarget = clamp(pitchTarget + dy * 0.09, -22, 22);
      loop();
    }
    function end(){ dragging = false; stage.classList.remove("is-dragging"); }

    stage.addEventListener("pointerdown", function(e){
      start(e.clientX, e.clientY);
      /* Begint de druk op een knop, dan geen pointer capture: anders
         landt de klik op het toneel en nooit op de knop zelf. */
      var opKnop = e.target && e.target.closest && e.target.closest("button");
      if(!opKnop) stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener("pointermove", function(e){ move(e.clientX, e.clientY); });
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);

    stage.addEventListener("wheel", function(e){
      e.preventDefault();
      distTarget = clamp(distTarget - e.deltaY * 0.7, -260, 820);
      loop();
    }, {passive:false});

    /* Knijpen met twee vingers. */
    var pinch = 0;
    stage.addEventListener("touchmove", function(e){
      if(e.touches.length !== 2) return;
      e.preventDefault();
      var d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY);
      if(pinch) { distTarget = clamp(distTarget + (d - pinch) * 2.2, -260, 820); loop(); }
      pinch = d;
    }, {passive:false});
    stage.addEventListener("touchend", function(){ pinch = 0; });

    document.addEventListener("keydown", function(e){
      if(!open) return;
      if(e.key === "Escape"){
        if(readEl.classList.contains("is-open")) sluitLezer();
        else api.close();
        return;
      }
      if(flat) return;
      var step = 6;
      if(e.key === "ArrowLeft"){ yawTarget -= step; loop(); e.preventDefault(); }
      if(e.key === "ArrowRight"){ yawTarget += step; loop(); e.preventDefault(); }
      if(e.key === "ArrowUp"){ pitchTarget = clamp(pitchTarget - 4, -22, 22); loop(); e.preventDefault(); }
      if(e.key === "ArrowDown"){ pitchTarget = clamp(pitchTarget + 4, -22, 22); loop(); e.preventDefault(); }
    });
  }

  /* ---------------------------------------------------------- */

  var api = {
    init: function(data){
      if(root) return api;
      var items = ((data && data.trips) || []).filter(function(t){
        return t && t.context !== "prive";
      });

      flat = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      root = el("div", null);
      root.id = "zaal";
      root.hidden = true;
      root.setAttribute("role", "region");
      root.setAttribute("aria-label", "De zaal zonder plek");
      root.dataset.mode = flat ? "flat" : "room";

      stage = el("div", "z-stage");
      room = el("div", "z-room");
      stage.appendChild(room);
      root.appendChild(stage);

      if(flat) bouwPlat(items); else bouwZaal(items);

      var ui = el("div", "z-ui");
      var titel = el("div", "z-title");
      titel.appendChild(el("span", "label", "zaal van de ideeën"));
      titel.appendChild(el("strong", null, "Alles komt hier samen"));
      titel.appendChild(el("span", "hand", "ook wat al een plek op de wereld had"));
      ui.appendChild(titel);

      /* Bescheiden uitgang voor wie de doorgang niet vindt; met Tab bereikbaar. */
      var back = el("button", "z-back", "terug");
      back.type = "button";
      back.setAttribute("aria-label", "Sluit de zaal en ga terug naar de wereldbol");
      back.addEventListener("click", function(){ api.close(); });
      ui.appendChild(back);

      ui.appendChild(el("p", "z-hint", flat
        ? "Kies een werk om het verhaal te lezen; onderaan staat de doorgang terug"
        : "Sleep om rond te kijken, scroll om in te zoomen; achter je staat de doorgang terug"));
      root.appendChild(ui);

      readEl = el("aside", "z-read");
      readEl.setAttribute("aria-hidden", "true");
      var cl = el("button", "z-close", "×");
      cl.type = "button";
      cl.setAttribute("aria-label", "Sluit het leesvenster");
      cl.addEventListener("click", sluitLezer);
      readEl.appendChild(cl);
      readEl.appendChild(el("div", "z-rbody"));
      root.appendChild(readEl);

      /* Het vlak dat bij het doorstappen het scherm vult. */
      warp = el("div", "z-warp");
      warp.setAttribute("aria-hidden", "true");
      warp.appendChild(el("span", "z-warp-veld"));
      root.appendChild(warp);

      root.style.setProperty("--z-w", W + "px");
      root.style.setProperty("--z-h", H + "px");
      document.body.appendChild(root);

      pas();
      bind();
      window.__zaal = api;
      return api;
    },

    open: function(){
      if(!root || open) return;
      open = true;
      root.hidden = false;
      yaw = 0; pitch = 0; dist = -140;
      yawTarget = 0; pitchTarget = 0; distTarget = 120;
      pas();
      requestAnimationFrame(function(){
        root.classList.add("is-open");
        loop();
      });
    },

    close: function(){
      if(!root || !open) return;
      open = false;
      wisTimers();
      porting = false;
      sluitLezer();
      root.classList.remove("is-open");
      root.classList.remove("is-porting");
      if(warp) warp.classList.remove("is-flying");
      setTimeout(function(){ if(!open) root.hidden = true; }, flat ? 0 : 500);
      closeCbs.forEach(function(fn){ try{ fn(); }catch(err){} });
    },

    onClose: function(fn){ if(typeof fn === "function") closeCbs.push(fn); }
  };

  return api;
})();
