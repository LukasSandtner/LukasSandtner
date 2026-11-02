/* ==========================================================
   LUKÁŠ SANDTNER  //  RETRO ARCADE RÉSUMÉ  //  script.js
   ========================================================== */
(() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad = (n, l) => String(Math.max(0, Math.round(n))).padStart(l, "0");

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ----------------------------------------------------------
     STATE
     ---------------------------------------------------------- */
  const state = {
    visited: new Set(),
    coins: 0,
    coinsMax: 0,
    score: 0,
    shown: 0,
    bonus: 0,
    progress: 0,
    allCoinsAwarded: false,
  };

  /* ----------------------------------------------------------
     SPRITES (pixel art rendered to inline SVG)
     1 = currentColor, 2 = var(--sprite2)
     ---------------------------------------------------------- */
  const SPRITES = {
    invader: [
      "00100000100",
      "00010001000",
      "00111111100",
      "01101110110",
      "11111111111",
      "10111111101",
      "10100000101",
      "00011011000",
    ],
    ghost: [
      "0001111000",
      "0111111110",
      "1111111111",
      "1122112211",
      "1122112211",
      "1111111111",
      "1111111111",
      "1110110111",
    ],
    heart: ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"],
    ship: [
      "00000100000",
      "00001110000",
      "00001110000",
      "01111111110",
      "11111111111",
      "11111111111",
      "11100100111",
      "11000000011",
    ],
    coin: [
      "00111100",
      "01122110",
      "11222211",
      "11222211",
      "11222211",
      "11222211",
      "01122110",
      "00111100",
    ],
    star: [
      "000010000",
      "000111000",
      "000111000",
      "111111111",
      "011111110",
      "001111100",
      "001101100",
      "011000110",
    ],
    trophy: [
      "11111111111",
      "10111111101",
      "10111211101",
      "01111211110",
      "00111111100",
      "00011111000",
      "00001110000",
      "00001110000",
      "00011111000",
      "00111111100",
    ],
  };

  function spriteSVG(name, px) {
    const map = SPRITES[name];
    if (!map) return "";
    const h = map.length;
    const w = map[0].length;
    let rects = "";
    map.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c === "1")
          rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
        else if (c === "2")
          rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="var(--sprite2, currentColor)"/>`;
      });
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" fill="currentColor" aria-hidden="true">${rects}</svg>`;
  }

  function renderSprites(root = document) {
    $$("[data-sprite]", root).forEach((el) => {
      if (el.dataset.done) return;
      el.innerHTML = spriteSVG(el.dataset.sprite, +el.dataset.px || 4);
      el.dataset.done = "1";
    });
  }

  /* ----------------------------------------------------------
     SOUND (WebAudio beeps, off by default)
     ---------------------------------------------------------- */
  let audio = null;
  let soundOn = true;

  // iOS mutes Web Audio while the ring switch is on silent, unless a media element is playing
  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
      const el = document.createElement("audio");
      el.setAttribute("playsinline", "");
      el.src =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      el.loop = true;
      const pr = el.play();
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) {
      /* audio unavailable */
    }
  }

  function beep(freq = 440, dur = 0.08, type = "square", vol = 0.08, to = 0) {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const t = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(audio.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) {
      /* audio unavailable */
    }
  }
  const sfx = {
    coin() {
      beep(988, 0.07);
      setTimeout(() => beep(1319, 0.22), 70);
    },
    unlock() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => beep(f, 0.09, "square", 0.035), i * 70),
      );
    },
    blip() {
      beep(660, 0.03, "square", 0.02);
    },
    select() {
      beep(330, 0.06, "square", 0.04, 660);
    },
    power() {
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) =>
        setTimeout(() => beep(f, 0.1, "triangle", 0.05), i * 60),
      );
    },
  };

  /* ----------------------------------------------------------
     TOASTS
     ---------------------------------------------------------- */
  const toastBox = $("#toasts");
  function toast(title, text) {
    if (!toastBox) return;
    const maxToasts = innerWidth < 560 ? 1 : 3;
    while (toastBox.children.length >= maxToasts) toastBox.firstElementChild.remove();
    const el = document.createElement("div");
    el.className = "toast";
    const b = document.createElement("b");
    b.textContent = title;
    const s = document.createElement("span");
    s.textContent = text;
    el.append(b, s);
    toastBox.append(el);
    setTimeout(() => el.remove(), 3900);
  }

  function floater(x, y, text) {
    const el = document.createElement("div");
    el.className = "floater";
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.append(el);
    setTimeout(() => el.remove(), 950);
  }

  /* ----------------------------------------------------------
     BOOT SEQUENCE
     ---------------------------------------------------------- */
  const boot = $("#boot");
  const bootText = $("#bootText");
  let bootDone = false;
  let bootTimer = null;

  const BOOT_LINES = [
    "LS-BIOS v1.0   (C) 1984 SANDTNER SYSTEMS",
    "CPU: 6502 @ 1.79 MHz ............. OK",
    "RAM: 640K ........................ OK",
    "LOADING PROFILE.DAT .............. OK",
    "MOUNTING /dev/skills ............. OK",
    "CALIBRATING CRT .................. OK",
    "",
    "WELCOME, PLAYER 1_",
  ];

  function finishBoot() {
    if (bootDone) return;
    bootDone = true;
    clearTimeout(bootTimer);
    try {
      sessionStorage.setItem("ls-booted", "1");
    } catch (e) {
      /* storage blocked */
    }
    boot.classList.add("is-done");
    document.body.classList.remove("is-booting");
    setTimeout(() => boot.remove(), 700);
    startTyped();
    setTimeout(() => toast(tr("joined_t"), tr("joined")), 700);
    removeEventListener("keydown", finishBoot);
  }

  function runBoot() {
    let seen = false;
    try {
      seen = sessionStorage.getItem("ls-booted") === "1";
    } catch (e) {
      /* ignore */
    }
    if (reduce || seen) {
      boot.remove();
      bootDone = true;
      startTyped();
      return;
    }
    document.body.classList.add("is-booting");
    addEventListener("keydown", finishBoot);
    boot.addEventListener("click", finishBoot);

    let line = 0;
    let ch = 0;
    let out = "";
    const step = () => {
      if (bootDone) return;
      if (line >= BOOT_LINES.length) {
        bootTimer = setTimeout(finishBoot, 650);
        return;
      }
      const cur = BOOT_LINES[line];
      if (ch < cur.length) {
        out += cur[ch++];
        bootText.textContent = out;
        bootTimer = setTimeout(step, 9);
      } else {
        out += "\n";
        line++;
        ch = 0;
        bootText.textContent = out;
        bootTimer = setTimeout(step, 110);
      }
    };
    step();
  }

  /* ----------------------------------------------------------
     TYPEWRITER (hero roles)
     ---------------------------------------------------------- */
  const ROLES_ALL = {
    en: [
      "Information Technology Student",
      "Java · SQL · Javascript · C",
      "IT Enthusiast",
      "Networking Rookie",
      "Fluent in English (B2)",
    ],
    cs: [
      "Student informačních technologií",
      "Java · SQL · Javascript · C",
      "IT nadšenec",
      "Začátečník v sítích",
      "Anglicky na úrovni B2",
    ],
  };
  const roles = () => ROLES_ALL[lang];
  const typedEl = $("#typed");
  let typedStarted = false;

  function startTyped() {
    if (typedStarted || !typedEl) return;
    typedStarted = true;
    let r = 0;
    let c = 0;
    let del = false;
    let typedLang = lang;
    const tick = () => {
      if (typedLang !== lang) {
        typedLang = lang;
        r = 0;
        c = 0;
        del = false;
      }
      const word = roles()[r];
      if (!del) {
        c++;
        typedEl.textContent = word.slice(0, c);
        if (c === word.length) {
          del = true;
          return setTimeout(tick, 1700);
        }
        return setTimeout(tick, 55 + Math.random() * 40);
      }
      c--;
      typedEl.textContent = word.slice(0, c);
      if (c === 0) {
        del = false;
        r = (r + 1) % roles().length;
        return setTimeout(tick, 350);
      }
      return setTimeout(tick, 22);
    };
    tick();
  }

  /* ----------------------------------------------------------
     BACKGROUND CANVAS (stars, striped sun, perspective grid)
     ---------------------------------------------------------- */
  const cv = $("#bg");
  const ctx = cv.getContext("2d");
  let W = 0;
  let H = 0;
  let stars = [];
  let sunImg = null;
  let sunR = 0;

  let base = null;
  const PAD = 80;

  function buildSun() {
    sunR = Math.round(Math.min(W, H) * 0.24);
    const size = sunR * 2 + PAD * 2;
    sunImg = document.createElement("canvas");
    sunImg.width = sunImg.height = size;
    const s = sunImg.getContext("2d");
    // glow baked once (shadowBlur per frame is too slow)
    const body = document.createElement("canvas");
    body.width = body.height = sunR * 2;
    const bc = body.getContext("2d");
    const g = bc.createLinearGradient(0, 0, 0, sunR * 2);
    g.addColorStop(0, "#ffe600");
    g.addColorStop(0.45, "#ff8a00");
    g.addColorStop(0.75, "#ff2e97");
    g.addColorStop(1, "#9d4dff");
    bc.fillStyle = g;
    bc.beginPath();
    bc.arc(sunR, sunR, sunR, 0, Math.PI * 2);
    bc.fill();
    bc.globalCompositeOperation = "destination-out";
    // stripes get thicker towards the bottom
    let y = sunR * 1.05;
    let th = sunR * 0.035;
    while (y < sunR * 2) {
      bc.fillRect(0, y, sunR * 2, th);
      y += th * 3.2;
      th *= 1.35;
    }
    s.shadowColor = "rgba(255,46,151,.85)";
    s.shadowBlur = 50;
    s.drawImage(body, PAD, PAD);
  }

  function buildBase(dpr) {
    const hor = H * 0.6;
    base = document.createElement("canvas");
    base.width = W * dpr;
    base.height = H * dpr;
    const b = base.getContext("2d");
    b.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sky = b.createLinearGradient(0, 0, 0, hor);
    sky.addColorStop(0, "#04020a");
    sky.addColorStop(0.65, "#160a38");
    sky.addColorStop(1, "#4a1260");
    b.fillStyle = sky;
    b.fillRect(0, 0, W, H);

    const gr = b.createLinearGradient(0, hor, 0, H);
    gr.addColorStop(0, "#2a0a45");
    gr.addColorStop(1, "#07050f");
    b.fillStyle = gr;
    b.fillRect(0, hor, W, H - hor);

    const glow = b.createLinearGradient(0, hor - 6, 0, hor + 26);
    glow.addColorStop(0, "rgba(0,240,255,0)");
    glow.addColorStop(0.25, "rgba(0,240,255,.85)");
    glow.addColorStop(1, "rgba(0,240,255,0)");
    b.fillStyle = glow;
    b.fillRect(0, hor - 6, W, 32);

    b.lineWidth = 1.5;
    b.strokeStyle = "rgba(0,240,255,.4)";
    b.beginPath();
    for (let k = -16; k <= 16; k++) {
      b.moveTo(W / 2 + k * 6, hor);
      b.lineTo(W / 2 + k * W * 0.11, H);
    }
    b.stroke();

    // dim so text stays readable
    b.fillStyle = "rgba(7,5,15,.38)";
    b.fillRect(0, 0, W, H);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = innerWidth;
    H = innerHeight;
    if (W < 2 || H < 2) return;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((W * H) / 9000) }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      z: Math.random() * 0.9 + 0.1,
      p: Math.random() * 6.28,
    }));
    buildSun();
    buildBase(dpr);
    measureMarquee();
  }

  function drawBg(t) {
    if (!base || !sunImg) return;
    const hor = H * 0.6;
    const sy = window.scrollY;

    ctx.drawImage(base, 0, 0, W, H);

    // stars (parallax with scroll)
    for (const s of stars) {
      const y = (((s.y - sy * s.z * 0.28) % hor) + hor) % hor;
      const a = (0.3 + 0.6 * Math.abs(Math.sin(t * 0.0012 * s.z + s.p))) * s.z;
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      const sz = s.z > 0.75 ? 3 : 2;
      ctx.fillRect(s.x | 0, y | 0, sz, sz);
    }

    // sun sinks while scrolling
    const sink = Math.min(sy * 0.18, sunR * 1.1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, hor);
    ctx.clip();
    ctx.globalAlpha = 0.8;
    ctx.drawImage(sunImg, W / 2 - sunR - PAD, hor - sunR * 1.55 - PAD + sink);
    ctx.restore();

    // grid: horizontal lines moving toward viewer
    const off = (t * 0.00018 + sy * 0.0007) % 1;
    const rows = 16;
    ctx.lineWidth = 2;
    for (let i = 0; i < rows; i++) {
      const f = (i + off) / rows;
      const y = hor + (H - hor) * f * f;
      ctx.strokeStyle = `rgba(255,46,151,${(0.12 + f * 0.6).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  /* ----------------------------------------------------------
     MARQUEE (moves with time + scroll)
     ---------------------------------------------------------- */
  const marquee = $(".marquee__track");
  const MARQ = [
    "★ HIGH SCORE",
    "IT STUDENT",
    "JAVA",
    "SQL",
    "C#",
    "C++",
    "FCE B2",
    "UNIVERSITY OF PARDUBICE",
    "LEVEL UP",
    "INSERT COIN",
    "PLAYER 1",
  ];
  let marqUnit = 1;

  function buildMarquee() {
    if (!marquee) return;
    const txt = MARQ.join("   ✦   ") + "   ✦   ";
    marquee.innerHTML = "";
    for (let i = 0; i < 8; i++) {
      const s = document.createElement("span");
      s.textContent = txt;
      marquee.append(s);
    }
  }
  function measureMarquee() {
    if (marquee && marquee.firstElementChild)
      marqUnit = marquee.firstElementChild.getBoundingClientRect().width || 1;
  }
  function tickMarquee(t) {
    if (!marquee) return;
    const dir = +marquee.dataset.dir || -1;
    const x = (t * 0.04 + window.scrollY * 0.6) % marqUnit;
    marquee.style.transform = `translate3d(${dir < 0 ? -x : x - marqUnit}px,0,0)`;
  }

  /* ----------------------------------------------------------
     SCORE / HUD / SCROLL
     ---------------------------------------------------------- */
  const scoreEl = $("#score");
  const coinsEl = $("#coins");
  const coinsMaxEl = $("#coinsMax");
  const barEl = $("#bar");
  const toTop = $("#toTop");
  const heroInner = $("#heroInner");
  const timelines = $$(".timeline");

  function computeScore() {
    state.score =
      state.progress * 30000 +
      state.visited.size * 1000 +
      state.coins * 500 +
      state.bonus;
  }

  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    state.progress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    barEl.style.transform = `scaleX(${state.progress})`;
    toTop.classList.toggle("is-on", window.scrollY > 700);

    // timeline fill
    for (const tl of timelines) {
      const r = tl.getBoundingClientRect();
      const p = clamp((innerHeight * 0.65 - r.top) / r.height, 0, 1);
      tl.style.setProperty("--p", p.toFixed(3));
    }

    // hero parallax
    if (!reduce && heroInner) {
      const y = window.scrollY;
      if (y < innerHeight * 1.2) {
        heroInner.style.transform = `translate3d(0, ${y * 0.25}px, 0)`;
        heroInner.style.opacity = String(
          clamp(1 - y / (innerHeight * 0.85), 0, 1),
        );
      }
    }
    computeScore();
  }

  /* ----------------------------------------------------------
     MAIN LOOP
     ---------------------------------------------------------- */
  function loop(t) {
    drawBg(t);
    tickMarquee(t);
    state.shown += (state.score - state.shown) * 0.12;
    scoreEl.textContent = pad(state.shown, 6);
    requestAnimationFrame(loop);
  }

  /* ----------------------------------------------------------
     TEXT SCRAMBLE
     ---------------------------------------------------------- */
  const GLYPHS = "█▓▒░#$%&*<>/\\|+=?01";
  function scramble(el) {
    if (reduce || el.dataset.scrambled) return;
    el.dataset.scrambled = "1";
    const final = el.textContent;
    el.setAttribute("aria-label", final);
    const start = performance.now();
    const dur = 800;
    const frame = (now) => {
      const p = clamp((now - start) / dur, 0, 1);
      const reveal = Math.floor(final.length * p);
      let out = "";
      for (let i = 0; i < final.length; i++) {
        const ch = final[i];
        out +=
          i < reveal || ch === " "
            ? ch
            : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = final;
    };
    requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------
     STAT BARS + COUNTERS
     ---------------------------------------------------------- */
  const SEGS = 10;
  function prepareStats() {
    $$(".stat").forEach((li) => {
      const bar = $(".stat__bar", li);
      for (let i = 0; i < SEGS; i++) bar.append(document.createElement("i"));
    });
  }

  function fillStat(li) {
    const lvl = +li.dataset.level || 0;
    const segs = $$(".stat__bar i", li);
    const val = $(".stat__val", li);
    let i = 0;
    const next = () => {
      if (i < lvl) {
        const seg = segs[i];
        seg.classList.add("on");
        if (i >= 8) seg.classList.add("hot");
        else if (i >= 5) seg.classList.add("warm");
        if (i % 2 === 0) beep(300 + i * 60, 0.03, "square", 0.012);
        i++;
        setTimeout(next, 75);
      } else {
        val.textContent = statLabel(li);
      }
    };
    next();
  }

  function countUp(el) {
    const target = +el.dataset.count || 0;
    if (target === 0) {
      el.textContent = target;
      return;
    }
    let n = 0;
    const iv = setInterval(() => {
      n++;
      el.textContent = n;
      beep(500 + n * 80, 0.03, "square", 0.015);
      if (n >= target) clearInterval(iv);
    }, 220);
  }

  /* ----------------------------------------------------------
     OBSERVERS
     ---------------------------------------------------------- */
  function setupObservers() {
    // generic reveal
    const reveal = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target;
          el.classList.add("is-in");
          const h2 = $("h2[data-scramble]", el);
          if (h2) scramble(h2);
          reveal.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    $$("[data-reveal]").forEach((el) => reveal.observe(el));

    // chips pop in one by one
    const chips = $("#chips");
    if (chips) {
      $$("li", chips).forEach((li, i) => li.style.setProperty("--d", i));
      new IntersectionObserver(
        (en, ob) => {
          if (en[0].isIntersecting) {
            chips.classList.add("is-in");
            ob.disconnect();
          }
        },
        { threshold: 0.15 },
      ).observe(chips);
    }

    // stat bars
    const stats = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          fillStat(e.target);
          stats.unobserve(e.target);
        });
      },
      { threshold: 0.6 },
    );
    $$(".stat").forEach((el) => stats.observe(el));

    // counters
    const counters = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          countUp(e.target);
          counters.unobserve(e.target);
        });
      },
      { threshold: 0.8 },
    );
    $$("[data-count]").forEach((el) => counters.observe(el));

    // section tracking: nav highlight + stage unlock
    const links = $$("[data-nav]");
    const sections = $$("main .stage");
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const id = e.target.id;
          links.forEach((a) =>
            a.classList.toggle("is-active", a.dataset.nav === id),
          );
          if (id !== "hero" && !state.visited.has(id)) {
            state.visited.add(id);
            toast(
              tr("unlocked"),
              `${SECTION_TITLE[lang][id] || e.target.dataset.title || id}  +1000`,
            );
            sfx.unlock();
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((s) => spy.observe(s));

    // countdown only runs while visible
    const cd = $("#countdown");
    const contact = $("#contact");
    if (cd && contact) {
      let n = 9;
      let iv = null;
      new IntersectionObserver(
        (en) => {
          if (en[0].isIntersecting && !iv) {
            iv = setInterval(() => {
              n = n <= 0 ? 9 : n - 1;
              cd.textContent = n;
              beep(n === 9 ? 880 : 440, 0.05, "square", 0.02);
            }, 1000);
          } else if (!en[0].isIntersecting && iv) {
            clearInterval(iv);
            iv = null;
          }
        },
        { threshold: 0.2 },
      ).observe(contact);
    }
  }

  /* ----------------------------------------------------------
     TILT CARDS
     ---------------------------------------------------------- */
  function setupTilt() {
    if (reduce || !finePointer) return;
    $$(".tilt").forEach((el) => {
      let leaveTimer = null;
      el.addEventListener("mouseenter", () => {
        clearTimeout(leaveTimer);
        el.classList.add("tilting");
      });
      el.addEventListener("mousemove", (ev) => {
        const r = el.getBoundingClientRect();
        const px = (ev.clientX - r.left) / r.width - 0.5;
        const py = (ev.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateY(${(px * 7).toFixed(2)}deg) rotateX(${(-py * 7).toFixed(2)}deg) translateZ(0)`;
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "";
        leaveTimer = setTimeout(() => el.classList.remove("tilting"), 260);
      });
    });
  }

  /* ----------------------------------------------------------
     COLLECTIBLE COINS
     ---------------------------------------------------------- */
  function collectCoin(btn, ev) {
    if (btn.classList.contains("is-taken")) return;
    btn.classList.add("is-taken");
    state.coins++;
    if (btn.dataset.fact) factCoinTaken = true;
    coinsEl.textContent = pad(state.coins, 2);
    floater(ev.clientX, ev.clientY, "+500");
    sfx.coin();
    setTimeout(() => btn.remove(), 520);
    if (state.coins === state.coinsMax && !state.allCoinsAwarded) {
      state.allCoinsAwarded = true;
      state.bonus += 5000;
      toast(tr("coins_t"), tr("coins"));
      sfx.power();
    }
  }

  function placeCoins() {
    const stages = $$("main .stage");
    stages.forEach((st, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "coin";
      btn.setAttribute("aria-label", tr("coin_aria"));
      btn.dataset.sprite = "coin";
      btn.dataset.px = "4";
      if (innerWidth < 900) {
        const side = Math.random() < 0.5 ? 8 + Math.random() * 22 : 68 + Math.random() * 22;
        btn.style.left = side + "%";
        btn.style.top = "calc(100% - 2.9rem)";
      } else {
        const left = i % 2 === 0 ? 1 + Math.random() * 5 : 92 + Math.random() * 4;
        btn.style.left = left + "%";
        btn.style.top = 14 + Math.random() * 68 + "%";
      }
      state.coinsMax++;
      // the last coin (contact section) is hidden in the 10th fun fact instead
      if (i === stages.length - 1) return;
      st.append(btn);
      btn.addEventListener("click", (ev) => collectCoin(btn, ev));
    });
    coinsEl.textContent = pad(0, 2);
    coinsMaxEl.textContent = pad(state.coinsMax, 2);
  }

  /* ----------------------------------------------------------
     CURSOR TRAIL
     ---------------------------------------------------------- */
  function setupTrail() {
    if (reduce || !finePointer) return;
    let last = 0;
    addEventListener(
      "mousemove",
      (ev) => {
        const now = performance.now();
        if (now - last < 45) return;
        last = now;
        const d = document.createElement("div");
        d.className = "trail";
        d.style.left = ev.clientX - 4 + "px";
        d.style.top = ev.clientY - 4 + "px";
        document.body.append(d);
        setTimeout(() => d.remove(), 620);
      },
      { passive: true },
    );
  }

  /* ----------------------------------------------------------
     HERO MOUSE PARALLAX (sprites)
     ---------------------------------------------------------- */
  function setupHeroMouse() {
    if (reduce || !finePointer) return;
    const layer = $(".hero__sprites");
    if (!layer) return;
    addEventListener(
      "mousemove",
      (ev) => {
        if (window.scrollY > innerHeight) return;
        const x = ev.clientX / innerWidth - 0.5;
        const y = ev.clientY / innerHeight - 0.5;
        layer.style.transform = `translate3d(${(-x * 40).toFixed(1)}px, ${(-y * 30).toFixed(1)}px, 0)`;
      },
      { passive: true },
    );
  }

  /* ----------------------------------------------------------
     NAV / BURGER / BUTTONS
     ---------------------------------------------------------- */
  function setupUI() {
    const burger = $("#burger");
    const nav = $("#nav");
    const closeNav = () => {
      nav.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
    };
    burger.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(open));
      sfx.select();
    });
    $$("a", nav).forEach((a) =>
      a.addEventListener("click", () => {
        closeNav();
        sfx.select();
      }),
    );
    $$("a", nav).forEach((a) => a.addEventListener("mouseenter", sfx.blip));

    // sound toggle
    const snd = $("#sound");
    snd.addEventListener("click", () => {
      soundOn = !soundOn;
      snd.setAttribute("aria-pressed", String(soundOn));
      snd.textContent = soundOn ? tr("snd_on") : tr("snd_off");
      if (soundOn) {
        unlockAudio();
        sfx.power();
      }
    });

    // buttons
    $$(".btn").forEach((b) => b.addEventListener("click", () => sfx.select()));

    // back to top
    toTop.addEventListener("click", () => {
      sfx.power();
      toTop.classList.add("fly");
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      setTimeout(() => toTop.classList.remove("fly"), 750);
    });

    // contact
    const copy = $("#copyMail");
    copy.addEventListener("click", async () => {
      const mail = $("#mail").textContent.trim();
      try {
        await navigator.clipboard.writeText(mail);
        toast(tr("copied"), mail);
      } catch (e) {
        toast(tr("mail"), mail);
      }
      sfx.coin();
      const cnt = $("#countdown");
      cnt.classList.remove("coin-pop");
      void cnt.offsetWidth;
      cnt.classList.add("coin-pop");
    });
    $("#coinBtn").addEventListener("click", () => sfx.coin());

    $("#year").textContent = new Date().getFullYear();
  }

  /* ----------------------------------------------------------
     KONAMI CODE
     ---------------------------------------------------------- */
  function setupKonami() {
    const seq = [
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "b",
      "a",
    ];
    let pos = 0;
    addEventListener("keydown", (ev) => {
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      pos = k === seq[pos] ? pos + 1 : k === seq[0] ? 1 : 0;
      if (pos === seq.length) {
        pos = 0;
        const on = document.body.classList.toggle("konami");
        state.bonus += on ? 10000 : 0;
        toast(
          on ? tr("cheat_on_t") : tr("cheat_off_t"),
          on ? tr("cheat_on") : tr("cheat_off"),
        );
        sfx.power();
      }
    });
  }

  /* ----------------------------------------------------------
     I18N  (EN <-> CS)
     English lives in the HTML. Czech strings are keyed by data-i18n.
     ---------------------------------------------------------- */
  const CS = {
    "boot.skip": "[ STISKNI LIBOVOU KLÁVESU PRO PŘESKOČENÍ ]",
    "nav.profile": "PROFIL",
    "nav.stats": "STATISTIKY",
    "nav.quests": "QUESTY",
    "nav.training": "STUDIUM",
    "nav.awards": "ÚSPĚCHY",
    "nav.loot": "LOOT",
    "nav.contact": "KONTAKT",
    "hud.score": "SKÓRE",
    "hud.coins": "MINCE",
    "hero.eyebrow": "&gt; HRÁČ 1 PŘIPRAVEN_",
    "hero.lead":
      "Student informačních technologií na Univerzitě Pardubice. Sbírám dovednosti, certifikáty a chyby od roku 2020.",
    "hero.start": "▶ STISKNI START",
    "hero.coin": "VHOĎ MINCI",
    "hero.scroll": "POSUŇ<br />▼",
    "k.1": "LEVEL 01",
    "k.2": "LEVEL 02",
    "k.3": "LEVEL 03",
    "k.4": "LEVEL 04",
    "k.5": "LEVEL 05",
    "k.6": "LEVEL 06",
    "k.final": "POSLEDNÍ LEVEL",
    "h.profile": "PROFIL HRÁČE",
    "h.stats": "STATISTIKY POSTAVY",
    "h.quests": "QUEST LOG",
    "h.training": "CVIČIŠTĚ",
    "h.awards": "ÚSPĚCHY",
    "h.loot": "VEDLEJŠÍ QUESTY",
    "h.contact": "VHOĎ MINCI",
    "sub.quests": "Pracovní zkušenosti a stáže",
    "sub.training": "Vzdělání",
    "sub.awards": "Odemčeno",
    "sub.loot": "Zájmy a to, co se právě učím",
    "sub.contact": "Pojďme spojit síly. Hledá se hráč 2.",
    "p.1":
      'Pracovitý student <b class="c-cyan">Univerzity Pardubice</b>, Fakulty elektrotechniky a informatiky (FEI). IT nadšenec, zdatný v práci s kancelářskými programy a operačními systémy UNIX nebo Windows.',
    "p.2":
      'Začátečník v počítačových sítích. Znalost programování v jazycích <b class="c-yellow">Java</b>, <b class="c-yellow">SQL</b>, <b class="c-yellow">Javascript</b> a <b class="c-yellow">C</b>.',
    "p.3":
      "Dobré jméno díky dosahování cílů včas a v rámci stanovených požadavků. Motivovaný přístup a schopnost navazovat pevné a produktivní vztahy s kolegy. Ochota naučit se používat nové programy.",
    "c.card": "KARTA HRÁČE",
    "dt.name": "JMÉNO",
    "dt.class": "TŘÍDA",
    "dt.guild": "CECH",
    "dt.base": "ZÁKLADNA",
    "dt.main": "HLAVNÍ QUEST",
    "dd.class": "IT student",
    "dd.guild": "Univerzita Pardubice, FEI",
    "v.base": "Kolín, Česko",
    "dd.main": "Level up v kódu",
    "cnt.years": "LET STUDIA IT",
    "cnt.code": "PROGRAMOVACÍCH JAZYKŮ",
    "cnt.intern": "STÁŽE",
    "cnt.spoken": "MLUVENÉ JAZYKY",
    "c.code": "DOVEDNOSTI V KÓDU",
    "c.soft": "SOFT SKILLS",
    "c.lang": "JAZYKY",
    "c.inv": "CO UMÍM / INVENTÁŘ",
    "s.net": "SÍTĚ",
    "s.ds": "DATOVÉ STRUKTURY",
    "s.cyber": "KYBER-BEZPEČNOST",
    "s.cs": "ČEŠTINA",
    "s.en": "ANGLIČTINA",
    "s.ru": "RUŠTINA",
    "s.de": "NĚMČINA",
    "s.comp": "Kompilátory / Interprety",
    "perk.1": "Administrativní dovednosti",
    "perk.2": "Orientace na detail",
    "perk.3": "Vysoká efektivita",
    "perk.4": "Time management",
    "perk.5": "Práce v mezinárodním týmu",
    "perk.6": "Inovativní přístupy",
    "d.now": "{from} - SOUČASNOST",
    "d.4w": "2023 · 4 týdny",
    "d.3w": "2021 · 3 týdny",
    "q.pilot.h": "Zaměstnanec PILOT TEAM",
    "q.pilot.1": "Automatizace administrativních procesů.",
    "q.pilot.2":
      "Programování a údržba softwarových aplikací pro administrativní a logistická oddělení.",
    "q.pilot.3":
      "Spolupráce s mezioborovými týmy na identifikaci a zavádění zlepšení procesů.",
    "q.pilot.4":
      "Příprava reportů a dokumentace pro revizi managementem se zahraničními kolegy z Japonska a Francie.",
    "t.empint": "ZAMĚSTNÁNÍ + STÁŽ",
    "t.emp": "ZAMĚSTNÁNÍ",
    "t.int": "STÁŽ",
    "q.tech.h": "Zaměstnanec technického úseku",
    "q.tech.1": "Archivace technické dokumentace.",
    "q.tech.2":
      "Zabezpečování objektu, pravidelné kontroly požární a pohybové signalizace.",
    "q.tech.3": "Koordinace revizí s odbornými firmami.",
    "q.tech.4": "Administrace dodávek zboží a jiných služeb.",
    "q.serv.h": "Servisní technik",
    "q.serv.1": "Praxe v řešení problémů se spotřební elektronikou.",
    "q.serv.2": "Hardwarové i softwarové zkušenosti.",
    "q.serv.3": "Zisk znalostí v ekologii a ekonomice podniku.",
    "q.off.h": "Office worker",
    "q.off.1": "Stavba PC a navržení síťové topologie v kanceláři.",
    "q.off.2": "Evidence v Microsoft Excel.",
    "q.off.3": "Telefonická podpora pro zájemce o služby.",
    "q.mt.h": "Zaměstnanec MT Restaurant",
    "e.1.h":
      "Bakalářský studijní program, Fakulta elektrotechniky a informatiky, Univerzita Pardubice",
    "e.1.place": "Informační technologie | ?????",
    "e.1.p":
      'Studium probíhá, <b class="c-yellow">prospěchové stipendium</b>. Dosud byly všechny předměty dokončeny <b class="c-yellow">bez známky horší než D</b>.',
    "e.2.h":
      "Vyšší odborná škola, Střední průmyslová škola a Jazyková škola s právem státní jazykové zkoušky",
    "e.2.place": "Informační technologie | 18-20-M/01",
    "e.2.p":
      'Absolvoval <b class="c-yellow">s vyznamenáním</b>. Maturitní projekt, CMS webová aplikace s MVC architekturou, obhájen na <b class="c-yellow">výbornou</b>.',
    "t.honors": "S VYZNAMENÁNÍM",
    "t.cms": "CMS WEBOVÁ APLIKACE",
    "a.site.p":
      'Propagace mojí SPŠ a energetiky ČR v zahraničí. Tvorba prezentací v PowerPointu. Týmová prezentace v angličtině v <b class="c-cyan">Polsku</b> a na <b class="c-cyan">Kypru</b>.',
    "t.intl": "MEZINÁRODNÍ",
    "a.cisco.p":
      'Certifikát <b class="c-cyan">CISCO Networking Academy</b> se známkou <b class="c-cyan">A</b>, vystavený: Lynn Bloomer, Cisco Networking Academy Director.',
    "t.cisco": "CISCO · STUDENTSKÁ ÚROVEŇ",
    "a.fce.p":
      'Certifikát na úrovni <b class="c-cyan">B2</b> se známkou <b class="c-cyan">C</b>, od Cambridge Assessment English (součást Univerzity Cambridge).',
    "loot.1": "Cestování",
    "loot.2": "Vědomostní olympiády",
    "loot.3": "Nadační běhy",
    "loot.4": "Řízení mého JDM auta",
    "loot.5": "Láska k mé přítelkyni",
    "loot.6": "Historie",
    "loot.7": "Fotografie",
    "loot.8": "Kryptoměny",
    "loot.9": "Akcionář",
    "loot.10": "Dárce plazmy",
    "c.loading": "NAČÍTÁM...",
    "cab.continue": "POKRAČOVAT?",
    "cab.coin": "VHOĎ MINCI",
    "cab.mail": "● VHOĎ MINCI / NAPSAT E-MAIL",
    "cab.copy": "KOPÍROVAT E-MAIL",
    "k.base": "ZÁKLADNA",
    "foot.1":
      '© <span id="year">2026</span> LUKÁŠ SANDTNER · VYTVOŘENO V HTML, CSS A JS · HOSTOVÁNO NA GITHUB PAGES',
    "foot.2": "PSST... ZKUS KONAMI KÓD: ↑ ↑ ↓ ↓ ← → ← → B A",
    "aria.lang": "Přepnout jazyk na angličtinu",
    "aria.top": "Zpět nahoru",
    "aria.menu": "Přepnout menu",
    "aria.nav": "Hlavní navigace",
    "aria.facts": "Zajímavosti ze světa sci-fi a fantasy",
    "aria.prev": "Předchozí zajímavost",
    "aria.next": "Další zajímavost",
  };

  const EN_ARIA = { "aria.lang": "Switch language to Czech" };

  // strings used from JS
  const STR = {
    en: {
      snd_on: "SND ON",
      snd_off: "SND OFF",
      joined_t: "PLAYER 1 JOINED",
      joined: "Scroll to explore. Collect the coins!",
      unlocked: "STAGE UNLOCKED",
      coins_t: "ALL COINS COLLECTED",
      coins: "Completionist. +5000 bonus",
      cheat_on_t: "CHEAT ACTIVATED",
      cheat_on: "Rainbow mode. +10000",
      cheat_off_t: "CHEAT OFF",
      cheat_off: "Back to normal.",
      copied: "COPIED",
      mail: "E-MAIL",
      coin_aria: "Collect coin",
      lang_t: "LANGUAGE",
      lang_on: "English",
      meta: "Résumé of Lukáš Sandtner, Information Technology student at the University of Pardubice. Java, SQL, Javascript, C, networking.",
      lv: "LV",
    },
    cs: {
      snd_on: "ZVUK ZAP",
      snd_off: "ZVUK VYP",
      joined_t: "HRÁČ 1 SE PŘIPOJIL",
      joined: "Scrolluj a prozkoumej stránku. Sbírej mince!",
      unlocked: "LEVEL ODEMČEN",
      coins_t: "VŠECHNY MINCE SEBRÁNY",
      coins: "Kompletista. Bonus +5000",
      cheat_on_t: "CHEAT AKTIVOVÁN",
      cheat_on: "Duhový režim. +10000",
      cheat_off_t: "CHEAT VYPNUT",
      cheat_off: "Zpět do normálu.",
      copied: "ZKOPÍROVÁNO",
      mail: "E-MAIL",
      coin_aria: "Sebrat minci",
      lang_t: "JAZYK",
      lang_on: "Čeština",
      meta: "Životopis Lukáše Sandtnera, studenta informačních technologií na Univerzitě Pardubice. Java, SQL, Javascript, C, počítačové sítě.",
      lv: "ÚR.",
    },
  };
  const SECTION_TITLE = {
    en: {
      profile: "Player profile",
      stats: "Character stats",
      quests: "Quest log",
      training: "Training grounds",
      awards: "Achievements",
      loot: "Side quests",
      contact: "Contact",
    },
    cs: {
      profile: "Profil hráče",
      stats: "Statistiky postavy",
      quests: "Quest log",
      training: "Cvičiště",
      awards: "Úspěchy",
      loot: "Vedlejší questy",
      contact: "Kontakt",
    },
  };
  const STAT_LABEL_CS = {
    NATIVE: "RODILÝ",
    EXCELLENT: "VYNIKAJÍCÍ",
    BASIC: "ZÁKLADNÍ",
    BEGINNER: "ZAČÁTEČNÍK",
    "IN PROGRESS": "PROBÍHÁ",
  };

  const FACTS = [
    {
      src: "DUNE",
      en: "In the world of Dune, AI is banned after the Butlerian Jihad, so humans train their minds to extreme levels. Mentats, for example, work as living computers.",
      cs: "Ve světě Duny je AI zakázaná po Butleriánském džihádu, a tak lidé trénují svou mysl do extrémních úrovní. Mentati například fungují jako živé počítače.",
    },
    {
      src: "R.U.R.",
      en: 'The word "robot" comes from Karel Čapek\'s 1920 play R.U.R. His brother Josef suggested it, based on the Czech word "robota", which means forced labour.',
      cs: "Slovo „robot“ pochází z divadelní hry R.U.R. Karla Čapka z roku 1920. Navrhl ho jeho bratr Josef a vychází z českého slova „robota“, tedy nucená práce.",
    },
    {
      src: "ASIMOV",
      en: 'Isaac Asimov coined the word "robotics" and stated his famous Three Laws of Robotics in the 1942 story "Runaround". They are still the unofficial starting point of every AI ethics debate.',
      cs: "Isaac Asimov vymyslel slovo „robotika“ a své slavné Tři zákony robotiky formuloval v povídce „Runaround“ z roku 1942. Dodnes jsou neoficiálním začátkem každé debaty o etice AI.",
    },
    {
      src: "STAR WARS",
      en: 'Han Solo brags that the Millennium Falcon made the Kessel Run in "less than twelve parsecs". A parsec is a unit of distance, not time, which makes it the most famous unit mix-up in sci-fi.',
      cs: "Han Solo se chlubí, že Millennium Falcon zvládl Kessel Run za „méně než dvanáct parseků“. Parsek je jednotka vzdálenosti, ne času, takže jde o nejslavnější záměnu jednotek ve sci-fi.",
    },
    {
      src: "HITCHHIKER'S GUIDE",
      en: "In The Hitchhiker's Guide to the Galaxy the answer to everything is 42. In ASCII, 42 is the asterisk, the wildcard that matches everything. Douglas Adams picked the number as an ordinary one, so the link is a pure coincidence.",
      cs: "V Stopařově průvodci po Galaxii je odpovědí na všechno číslo 42. V ASCII je 42 hvězdička, zástupný znak, který se shoduje se vším. Douglas Adams číslo zvolil jako obyčejné, takže ta souvislost je čistá náhoda.",
    },
    {
      src: "TOLKIEN",
      en: "J.R.R. Tolkien said that his stories were made mainly to give his invented Elvish languages a world to live in. Language first, story second. A very compiler-first way of thinking.",
      cs: "J. R. R. Tolkien tvrdil, že své příběhy vytvořil hlavně proto, aby jeho vymyšlené elfské jazyky měly svět, ve kterém mohou žít. Nejdřív jazyk, potom příběh. Velmi „compiler-first“ přístup.",
    },
    {
      src: "THE MATRIX",
      en: "The falling green code in The Matrix is made of mirrored Japanese characters and, according to designer Simon Whiteley, includes sushi recipes from his wife's cookbook.",
      cs: "Padající zelený kód v Matrixu je složený ze zrcadlově převrácených japonských znaků a podle návrháře Simona Whiteleyho obsahuje i recepty na suši z kuchařky jeho ženy.",
    },
    {
      src: "TRON",
      en: "Tron (1982) reportedly missed an Oscar nomination for visual effects because the Academy felt that using computers was cheating.",
      cs: "Tron (1982) podle všeho nedostal nominaci na Oscara za vizuální efekty, protože Akademie považovala použití počítačů za podvádění.",
    },
    {
      src: "NEUROMANCER",
      en: 'William Gibson coined the word "cyberspace" in 1982 and wrote Neuromancer on a manual typewriter, with hardly any hands-on computer experience.',
      cs: "William Gibson vymyslel slovo „kyberprostor“ v roce 1982 a Neuromancera napsal na mechanický psací stroj, téměř bez praktických zkušeností s počítači.",
    },
    {
      src: "DISCWORLD",
      en: 'In Terry Pratchett\'s Discworld the computer Hex runs on an anthill full of ants, and its classic error message is "+++ Out of Cheese Error. Redo From Start +++".',
      cs: "V Zeměploše Terryho Pratchetta běží počítač Hex na mraveništi plném mravenců a jeho klasická chybová hláška zní „+++ Out of Cheese Error. Redo From Start +++“.",
    },
  ];

  let lang = "en";
  try {
    lang = localStorage.getItem("ls-lang") === "cs" ? "cs" : "en";
  } catch (e) {
    /* ignore */
  }

  const tr = (k) => (STR[lang] && STR[lang][k]) || STR.en[k] || k;

  function statLabel(li) {
    const lbl = li.dataset.label;
    if (!lbl) return `${tr("lv")} ${li.dataset.level}`;
    return lang === "cs" ? STAT_LABEL_CS[lbl] || lbl : lbl;
  }

  function applyLang(next, silent) {
    lang = next;
    try {
      localStorage.setItem("ls-lang", lang);
    } catch (e) {
      /* ignore */
    }
    document.documentElement.lang = lang;

    $$("[data-i18n]").forEach((el) => {
      if (el._en === undefined) el._en = el.innerHTML;
      const key = el.dataset.i18n;
      let txt = el._en;
      if (lang === "cs" && CS[key] !== undefined) {
        txt = CS[key];
        // dates like "2025 - NOW" keep their own first year
        if (txt.includes("{from}"))
          txt = txt.replace("{from}", (el._en.match(/\d{4}/) || [""])[0]);
      }
      el.innerHTML = txt;
      if (el.hasAttribute("data-scramble")) el.removeAttribute("aria-label");
    });
    $$("[data-i18n-aria]").forEach((el) => {
      const key = el.dataset.i18nAria;
      if (el._enAria === undefined) el._enAria = el.getAttribute("aria-label");
      el.setAttribute(
        "aria-label",
        lang === "cs" && CS[key] ? CS[key] : el._enAria,
      );
    });

    // footer translation recreates the year span
    const yr = $("#year");
    if (yr) yr.textContent = new Date().getFullYear();

    // lang switch button
    const lb = $("#lang");
    if (lb) {
      $$("span", lb).forEach((sp) =>
        sp.classList.toggle("on", sp.textContent.trim().toLowerCase() === lang),
      );
      lb.setAttribute(
        "aria-label",
        lang === "cs" ? CS["aria.lang"] : EN_ARIA["aria.lang"],
      );
    }
    const snd = $("#sound");
    if (snd) snd.textContent = soundOn ? tr("snd_on") : tr("snd_off");
    $$(".coin").forEach((c) => c.setAttribute("aria-label", tr("coin_aria")));
    $$(".stat").forEach((li) => {
      const v = $(".stat__val", li);
      if (v && v.textContent) v.textContent = statLabel(li);
    });
    const meta = $('meta[name="description"]');
    if (meta) meta.setAttribute("content", tr("meta"));

    renderFacts();
    if (!silent) {
      toast(tr("lang_t"), tr("lang_on"));
      sfx.select();
    }
  }

  /* ----------------------------------------------------------
     DUNE FACT CAROUSEL (rotates every 10 s)
     ---------------------------------------------------------- */
  const FACT_MS = 10000;
  let factIdx = 0;
  let factElapsed = 0;
  let factPaused = false;
  let factVisible = false;
  let factCoinTaken = false;

  function renderFacts() {
    const stage = $("#factStage");
    const dots = $("#factDots");
    if (!stage) return;
    // all slides stacked in one grid cell, so the box is always as tall as the longest one
    stage.innerHTML = "";
    FACTS.forEach((f, i) => {
      const p = document.createElement("p");
      p.className = "fact" + (i === factIdx ? " is-active" : "");
      p.textContent = f[lang];
      p.setAttribute("aria-hidden", i === factIdx ? "false" : "true");
      if (i === FACTS.length - 1 && !factCoinTaken) {
        p.classList.add("fact--coin");
        const coin = document.createElement("button");
        coin.type = "button";
        coin.className = "coin";
        coin.dataset.sprite = "coin";
        coin.dataset.px = "4";
        coin.dataset.fact = "1";
        coin.setAttribute("aria-label", tr("coin_aria"));
        coin.addEventListener("click", (ev) => collectCoin(coin, ev));
        p.append(coin);
      }
      stage.append(p);
    });
    renderSprites(stage);
    if (dots && dots.children.length !== FACTS.length) {
      dots.innerHTML = "";
      FACTS.forEach((_, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("aria-label", String(i + 1));
        b.addEventListener("click", () => showFact(i));
        dots.append(b);
      });
    }
    updateFactMeta();
  }

  function updateFactMeta() {
    const no = $("#factNo");
    if (no) no.textContent = `${pad(factIdx + 1, 2)}/${pad(FACTS.length, 2)}`;
    const src = $("#factSrc");
    if (src) src.textContent = FACTS[factIdx].src;
    $$("#factDots button").forEach((b, i) =>
      b.classList.toggle("on", i === factIdx),
    );
  }

  function showFact(i, quiet) {
    const stage = $("#factStage");
    if (!stage) return;
    factIdx = (i + FACTS.length) % FACTS.length;
    factElapsed = 0;
    const bar = $("#factBar");
    if (bar) bar.style.transform = "scaleX(0)";
    $$(".fact", stage).forEach((p, n) => {
      const on = n === factIdx;
      if (on && !p.classList.contains("is-active")) {
        p.classList.add("is-active");
      } else if (!on) {
        p.classList.remove("is-active");
      }
      p.setAttribute("aria-hidden", on ? "false" : "true");
    });
    updateFactMeta();
    if (!quiet) sfx.blip();
  }

  function setupFacts() {
    const box = $("#facts");
    if (!box) return;
    const bar = $("#factBar");
    $("#factPrev").addEventListener("click", () => showFact(factIdx - 1));
    $("#factNext").addEventListener("click", () => showFact(factIdx + 1));
    box.addEventListener("mouseenter", () => {
      factPaused = true;
    });
    box.addEventListener("mouseleave", () => {
      factPaused = false;
    });
    box.addEventListener("focusin", () => {
      factPaused = true;
    });
    box.addEventListener("focusout", () => {
      factPaused = false;
    });
    new IntersectionObserver(
      (en) => {
        factVisible = en[0].isIntersecting;
      },
      { threshold: 0.3 },
    ).observe(box);

    setInterval(() => {
      if (factPaused || !factVisible || document.hidden) return;
      factElapsed += 100;
      if (bar)
        bar.style.transform = `scaleX(${Math.min(factElapsed / FACT_MS, 1)})`;
      if (factElapsed >= FACT_MS) showFact(factIdx + 1, true);
    }, 100);
  }

  function setupLang() {
    const lb = $("#lang");
    if (lb)
      lb.addEventListener("click", () =>
        applyLang(lang === "en" ? "cs" : "en"),
      );
    renderFacts();
    applyLang(lang, true);
  }

  /* ----------------------------------------------------------
     INIT
     ---------------------------------------------------------- */
  buildMarquee();
  renderSprites();
  prepareStats();
  placeCoins();
  renderSprites(); // coins added above
  setupUI();
  setupObservers();
  setupFacts();
  setupLang();
  setupTilt();
  setupTrail();
  setupHeroMouse();
  setupKonami();

  resize();
  onScroll();
  addEventListener("resize", resize);
  addEventListener("scroll", onScroll, { passive: true });
  if (document.fonts && document.fonts.ready)
    document.fonts.ready.then(measureMarquee);
  addEventListener("load", measureMarquee);

  runBoot();

  requestAnimationFrame(loop);
})();
