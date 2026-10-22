/* Suraksha — one-tap SOS: SMS with live location to all emergency contacts */
(function () {
  "use strict";

  var KEY = "suraksha:v1";
  var SOSFLAG = "suraksha:sos";
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var profile = null;   // {name, contacts:[{name, phone}]}
  var lastFix = null;   // {lat, lng, acc, t}
  var watchId = null, timerInt = null, wakeLock = null;
  var lastSentAt = 0, lastNudgeAt = 0;

  /* ---------- storage ---------- */
  function load() { try { profile = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { profile = null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) {} }

  /* ---------- views ---------- */
  function show(id) {
    ["setupView", "homeView", "sosView"].forEach(function (v) { $(v).classList.toggle("hidden", v !== id); });
    window.scrollTo(0, 0);
  }

  /* ---------- location ---------- */
  function mapsLink(f) { return "https://www.google.com/maps?q=" + f.lat.toFixed(6) + "," + f.lng.toFixed(6); }
  function setFix(p) {
    lastFix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0), t: Date.now() };
    return lastFix;
  }
  function getFix(cb) {
    if (!navigator.geolocation) { cb(lastFix); return; }
    navigator.geolocation.getCurrentPosition(
      function (p) { cb(setFix(p)); },
      function () { cb(lastFix); },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
    );
  }
  /* SOS ke liye pakki koshish: pehle GPS (high accuracy), fail ho to network location */
  function getFixFresh(cb) {
    if (!navigator.geolocation) { cb(null); return; }
    navigator.geolocation.getCurrentPosition(
      function (p) { cb(setFix(p)); },
      function () {
        navigator.geolocation.getCurrentPosition(
          function (p) { cb(setFix(p)); },
          function () { cb(lastFix); },
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
    );
  }
  function startWatch() {
    if (!navigator.geolocation || watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      function (p) {
        setFix(p);
        var el = $("gpsStatus");
        el.textContent = "📍 Location ready ✓ (±" + (lastFix.acc || "?") + " m)";
        el.classList.add("ok");
        $("liveLoc").textContent = "Lat " + lastFix.lat.toFixed(5) + ", Lng " + lastFix.lng.toFixed(5) + " (±" + lastFix.acc + " m)";
        $("liveMap").href = mapsLink(lastFix);
        try {
          var d = JSON.parse(sessionStorage.getItem(SOSFLAG) || "null");
          if (d && d.noLoc && !$("sosView").classList.contains("hidden")) {
            var ub = $("updateBtn");
            ub.classList.add("pulse");
            ub.textContent = "📍 Location mil gayi — ab sabko bhejo";
          }
        } catch (e) {}
      },
      function () {
        if (!$("sosView").classList.contains("hidden")) $("liveLoc").textContent = "Location update nahi ho rahi — GPS चालू रखो";
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }
  function warmGps() {
    getFix(function (f) {
      var el = $("gpsStatus");
      if (f) { el.textContent = "📍 Location ready ✓ (±" + (f.acc || "?") + " m)"; el.classList.add("ok"); }
      else { el.textContent = "📍 Location nahi mil rahi — phone ki Location/GPS चालू रखो"; el.classList.remove("ok"); }
    });
  }

  /* ---------- SMS ---------- */
  function allPhones() { return profile.contacts.map(function (c) { return c.phone; }).join(","); }
  function smsTo(phones, body) { return "sms:" + phones + "?body=" + encodeURIComponent(body); }
  function openSms(phones, body) { window.location.href = smsTo(phones, body); }
  function sosText(f) {
    var base = "SOS! Mujhe madad chahiye. - " + profile.name;
    return f ? base + ". Meri location: " + mapsLink(f) : base + ". Location nahi mil rahi, please turant call karo.";
  }
  function updateText(f) { return "Meri nayi location: " + mapsLink(f) + " - " + profile.name; }
  function safeText() { return "Main safe hoon, chinta mat karo. - " + profile.name; }
  function testText(f) {
    return "Test message: main " + profile.name + ", aap mere Suraksha emergency contact ho. Ye sirf test hai." +
      (f ? " Meri location: " + mapsLink(f) : "");
  }

  /* ---------- setup ---------- */
  function addRow(name, phone) {
    var rows = $("contactRows");
    if (rows.children.length >= 5) return;
    var div = document.createElement("div");
    div.className = "crow";
    div.innerHTML = '<input class="cname" type="text" placeholder="नाम (जैसे: Mummy)">' +
      '<input class="cphone" type="tel" inputmode="numeric" placeholder="10-digit mobile number">' +
      '<button class="cdel" type="button" aria-label="हटाओ">✕</button>';
    div.querySelector(".cname").value = name || "";
    div.querySelector(".cphone").value = phone || "";
    div.querySelector(".cdel").addEventListener("click", function () {
      if (rows.children.length > 1) div.remove();
    });
    rows.appendChild(div);
  }
  function cleanPhone(v) {
    var d = String(v).replace(/\D/g, "");
    if (d.length === 12 && d.indexOf("91") === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === "0") d = d.slice(1);
    return d;
  }
  function collectSetup() {
    var name = $("myName").value.trim();
    if (!name) return { err: "अपना नाम लिखो।" };
    var contacts = [], rows = $("contactRows").children;
    for (var i = 0; i < rows.length; i++) {
      var cn = rows[i].querySelector(".cname").value.trim();
      var cp = cleanPhone(rows[i].querySelector(".cphone").value);
      if (!cp && !cn) continue;
      if (!/^[6-9]\d{9}$/.test(cp)) return { err: "Contact " + (i + 1) + " का number सही नहीं है — 10-digit Indian mobile number लिखो।" };
      contacts.push({ name: cn || ("Contact " + (contacts.length + 1)), phone: cp });
    }
    if (!contacts.length) return { err: "कम से कम 1 emergency contact जोड़ो।" };
    return { profile: { name: name, contacts: contacts } };
  }
  function openSetup(prefill) {
    $("myName").value = prefill ? prefill.name : "";
    $("contactRows").innerHTML = "";
    if (prefill && prefill.contacts.length) prefill.contacts.forEach(function (c) { addRow(c.name, c.phone); });
    else addRow("", "");
    $("setupError").textContent = "";
    show("setupView");
  }

  /* ---------- home ---------- */
  function openHome() {
    var html = "";
    profile.contacts.forEach(function (c) {
      html += '<div class="chip"><span>' + esc(c.name) + '</span><span class="ph">' + esc(c.phone) + "</span></div>";
    });
    $("contactList").innerHTML = html;
    show("homeView");
    warmGps();
    startWatch();
  }

  /* ---------- SOS ---------- */
  function startSos() {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    var btn = $("sosBtn"), lbl = btn.querySelector(".sos-small"), old = lbl.textContent;
    btn.style.pointerEvents = "none";
    lbl.textContent = "📍 Location le rahe hain…";
    getFixFresh(function (f) {
      btn.style.pointerEvents = "";
      lbl.textContent = old;
      try {
        sessionStorage.setItem(SOSFLAG, JSON.stringify({ start: Date.now(), noLoc: f ? 0 : 1 }));
      } catch (e) {}
      lastSentAt = Date.now();
      openSms(allPhones(), sosText(f));
    });
  }
  function enterSosScreen() {
    var data = null;
    try { data = JSON.parse(sessionStorage.getItem(SOSFLAG) || "null"); } catch (e) {}
    if (!data) { openHome(); return; }
    show("sosView");
    var start = data.start || Date.now();
    clearInterval(timerInt);
    var tick = function () {
      var s = Math.floor((Date.now() - start) / 1000);
      var mm = String(Math.floor(s / 60)).padStart(2, "0"), ss = String(s % 60).padStart(2, "0");
      $("sosTimer").textContent = mm + ":" + ss;
      if (Date.now() - lastSentAt > 120000 && Date.now() - lastNudgeAt > 120000) {
        lastNudgeAt = Date.now();
        $("updateBtn").classList.add("pulse");
        if (navigator.vibrate) navigator.vibrate(150);
      }
    };
    tick();
    timerInt = setInterval(tick, 1000);

    var pc = "";
    profile.contacts.forEach(function (c) {
      pc += '<a href="#" data-phone="' + esc(c.phone) + '">सिर्फ ' + esc(c.name) + " को भेजो</a>";
    });
    $("perContact").innerHTML = pc;
    $("perContact").querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var ph = a.getAttribute("data-phone");
        getFix(function (f) { if (f) { lastSentAt = Date.now(); $("updateBtn").classList.remove("pulse"); openSms(ph, updateText(f)); } });
      });
    });

    startWatch();
    requestWake();
  }
  function stopSosInternals() {
    clearInterval(timerInt); timerInt = null;
    if (watchId !== null && navigator.geolocation) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }
  function sendUpdate() {
    getFix(function (f) {
      if (!f) { $("liveLoc").textContent = "Location nahi mil rahi — थोड़ा रुको और फिर दबाओ"; return; }
      lastSentAt = Date.now();
      $("updateBtn").classList.remove("pulse");
      $("updateBtn").textContent = "📍 नई location सबको भेजो";
      try {
        var d = JSON.parse(sessionStorage.getItem(SOSFLAG) || "null");
        if (d) { d.noLoc = 0; sessionStorage.setItem(SOSFLAG, JSON.stringify(d)); }
      } catch (e) {}
      openSms(allPhones(), updateText(f));
    });
  }
  function doSafe() {
    try { sessionStorage.removeItem(SOSFLAG); } catch (e) {}
    stopSosInternals();
    openHome();
    openSms(allPhones(), safeText());
  }
  function requestWake() {
    if (navigator.wakeLock && !wakeLock) {
      navigator.wakeLock.request("screen").then(function (wl) { wakeLock = wl; }).catch(function () {});
    }
  }

  /* ---------- wire up ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    load();
    if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(function () {}); }

    $("addContact").addEventListener("click", function () { addRow("", ""); });
    $("saveSetup").addEventListener("click", function () {
      var r = collectSetup();
      if (r.err) { $("setupError").textContent = r.err; return; }
      profile = r.profile; save();
      openHome();
    });
    $("editBtn").addEventListener("click", function () { openSetup(profile); });
    $("sosBtn").addEventListener("click", startSos);
    $("testBtn").addEventListener("click", function () {
      if (lastFix && Date.now() - lastFix.t < 60000) openSms(allPhones(), testText(lastFix));
      else getFix(function (f) { openSms(allPhones(), testText(f)); });
    });
    $("updateBtn").addEventListener("click", sendUpdate);
    $("safeBtn").addEventListener("click", doSafe);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && sessionStorage.getItem(SOSFLAG)) requestWake();
    });
    window.addEventListener("pageshow", function () {
      if (profile && sessionStorage.getItem(SOSFLAG)) enterSosScreen();
    });

    if (!profile) openSetup(null);
    else if (sessionStorage.getItem(SOSFLAG)) enterSosScreen();
    else openHome();
  });
})();
