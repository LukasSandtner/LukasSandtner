/* ==========================================================
   LUKÁŠ SANDTNER  //  RETRO ARCADE RÉSUMÉ  //  script.js
   ========================================================== */
(() => {
  'use strict';

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad = (n, l) => String(Math.max(0, Math.round(n))).padStart(l, '0');

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

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
      '00100000100',
      '00010001000',
      '00111111100',
      '01101110110',
      '11111111111',
      '10111111101',
      '10100000101',
      '00011011000',
    ],
    ghost: [
      '0001111000',
      '0111111110',
      '1111111111',
      '1122112211',
      '1122112211',
      '1111111111',
      '1111111111',
      '1110110111',
    ],
    heart: [
      '0110110',
      '1111111',
      '1111111',
      '0111110',
      '0011100',
      '0001000',
    ],
    ship: [
      '00000100000',
      '00001110000',
      '00001110000',
      '01111111110',
      '11111111111',
      '11111111111',
      '11100100111',
      '11000000011',
    ],
    coin: [
      '00111100',
      '01122110',
      '11222211',
      '11222211',
      '11222211',
      '11222211',
      '01122110',
      '00111100',
    ],
    star: [
      '000010000',
      '000111000',
      '000111000',
      '111111111',
      '011111110',
      '001111100',
      '001101100',
      '011000110',
    ],
    trophy: [
      '11111111111',
      '10111111101',
      '10111211101',
      '01111211110',
      '00111111100',
      '00011111000',
      '00001110000',
      '00001110000',
      '00011111000',
      '00111111100',
    ],
  };

  function spriteSVG(name, px) {
    const map = SPRITES[name];
    if (!map) return '';
    const h = map.length;
    const w = map[0].length;
    let rects = '';
    map.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c === '1') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
        else if (c === '2') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="var(--sprite2, currentColor)"/>`;
      });
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" fill="currentColor" aria-hidden="true">${rects}</svg>`;
  }

  function renderSprites(root = document) {
    $$('[data-sprite]', root).forEach((el) => {
      if (el.dataset.done) return;
      el.innerHTML = spriteSVG(el.dataset.sprite, +el.dataset.px || 4);
      el.dataset.done = '1';
    });
  }

  /* ----------------------------------------------------------
     SOUND (WebAudio beeps, off by default)
     ---------------------------------------------------------- */
  let audio = null;
  let soundOn = false;

  function beep(freq = 440, dur = 0.08, type = 'square', vol = 0.04, to = 0) {
    if (!soundOn) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
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
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    coin() { beep(988, 0.07); setTimeout(() => beep(1319, 0.22), 70); },
    unlock() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.09, 'square', 0.035), i * 70)); },
    blip() { beep(660, 0.03, 'square', 0.02); },
    select() { beep(330, 0.06, 'square', 0.04, 660); },
    power() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => beep(f, 0.1, 'triangle', 0.05), i * 60)); },
  };

  /* ----------------------------------------------------------
     TOASTS
     ---------------------------------------------------------- */
  const toastBox = $('#toasts');
  function toast(title, text) {
    if (!toastBox) return;
    while (toastBox.children.length >= 3) toastBox.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    const b = document.createElement('b');
    b.textContent = title;
    const s = document.createElement('span');
    s.textContent = text;
    el.append(b, s);
    toastBox.append(el);
    setTimeout(() => el.remove(), 3900);
  }

  function floater(x, y, text) {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.append(el);
    setTimeout(() => el.remove(), 950);
  }

  /* ----------------------------------------------------------
     BOOT SEQUENCE
     ---------------------------------------------------------- */
  const boot = $('#boot');
  const bootText = $('#bootText');
  let bootDone = false;
  let bootTimer = null;

  const BOOT_LINES = [
    'LS-BIOS v1.0   (C) 1984 SANDTNER SYSTEMS',
    'CPU: 6502 @ 1.79 MHz ............. OK',
    'RAM: 640K ........................ OK',
    'LOADING PROFILE.DAT .............. OK',
    'MOUNTING /dev/skills ............. OK',
    'CALIBRATING CRT .................. OK',
    '',
    'WELCOME, PLAYER 1_',
  ];

  function finishBoot() {
    if (bootDone) return;
    bootDone = true;
    clearTimeout(bootTimer);
    try { sessionStorage.setItem('ls-booted', '1'); } catch (e) { /* storage blocked */ }
    boot.classList.add('is-done');
    document.body.classList.remove('is-booting');
    setTimeout(() => boot.remove(), 700);
    startTyped();
    setTimeout(() => toast('PLAYER 1 JOINED', 'Scroll to explore. Collect the coins!'), 700);
    removeEventListener('keydown', finishBoot);
  }

  function runBoot() {
    let seen = false;
    try { seen = sessionStorage.getItem('ls-booted') === '1'; } catch (e) { /* ignore */ }
    if (reduce || seen) {
      boot.remove();
      bootDone = true;
      startTyped();
      return;
    }
    document.body.classList.add('is-booting');
    addEventListener('keydown', finishBoot);
    boot.addEventListener('click', finishBoot);

    let line = 0;
    let ch = 0;
    let out = '';
    const step = () => {
      if (bootDone) return;
      if (line >= BOOT_LINES.length) { bootTimer = setTimeout(finishBoot, 650); return; }
      const cur = BOOT_LINES[line];
      if (ch < cur.length) {
        out += cur[ch++];
        bootText.textContent = out;
        bootTimer = setTimeout(step, 9);
      } else {
        out += '\n';
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
  const ROLES = [
    'Information Technology Student',
    'Java · SQL · C# · C++',
    'IT Enthusiast',
    'Networking Rookie',
    'Fluent in English (B2)',
  ];
  const typedEl = $('#typed');
  let typedStarted = false;

  function startTyped() {
    if (typedStarted || !typedEl) return;
    typedStarted = true;
    if (reduce) { typedEl.textContent = ROLES[0]; return; }
    let r = 0;
    let c = 0;
    let del = false;
    const tick = () => {
      const word = ROLES[r];
      if (!del) {
        c++;
        typedEl.textContent = word.slice(0, c);
        if (c === word.length) { del = true; return setTimeout(tick, 1700); }
        return setTimeout(tick, 55 + Math.random() * 40);
      }
      c--;
      typedEl.textContent = word.slice(0, c);
      if (c === 0) { del = false; r = (r + 1) % ROLES.length; return setTimeout(tick, 350); }
      return setTimeout(tick, 22);
    };
    tick();
  }

  /* ----------------------------------------------------------
     BACKGROUND CANVAS (stars, striped sun, perspective grid)
     ---------------------------------------------------------- */
  const cv = $('#bg');
  const ctx = cv.getContext('2d');
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
    sunImg = document.createElement('canvas');
    sunImg.width = sunImg.height = size;
    const s = sunImg.getContext('2d');
    // glow baked once (shadowBlur per frame is too slow)
    const body = document.createElement('canvas');
    body.width = body.height = sunR * 2;
    const bc = body.getContext('2d');
    const g = bc.createLinearGradient(0, 0, 0, sunR * 2);
    g.addColorStop(0, '#ffe600');
    g.addColorStop(0.45, '#ff8a00');
    g.addColorStop(0.75, '#ff2e97');
    g.addColorStop(1, '#9d4dff');
    bc.fillStyle = g;
    bc.beginPath();
    bc.arc(sunR, sunR, sunR, 0, Math.PI * 2);
    bc.fill();
    bc.globalCompositeOperation = 'destination-out';
    // stripes get thicker towards the bottom
    let y = sunR * 1.05;
    let th = sunR * 0.035;
    while (y < sunR * 2) {
      bc.fillRect(0, y, sunR * 2, th);
      y += th * 3.2;
      th *= 1.35;
    }
    s.shadowColor = 'rgba(255,46,151,.85)';
    s.shadowBlur = 50;
    s.drawImage(body, PAD, PAD);
  }

  function buildBase(dpr) {
    const hor = H * 0.6;
    base = document.createElement('canvas');
    base.width = W * dpr;
    base.height = H * dpr;
    const b = base.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sky = b.createLinearGradient(0, 0, 0, hor);
    sky.addColorStop(0, '#04020a');
    sky.addColorStop(0.65, '#160a38');
    sky.addColorStop(1, '#4a1260');
    b.fillStyle = sky;
    b.fillRect(0, 0, W, H);

    const gr = b.createLinearGradient(0, hor, 0, H);
    gr.addColorStop(0, '#2a0a45');
    gr.addColorStop(1, '#07050f');
    b.fillStyle = gr;
    b.fillRect(0, hor, W, H - hor);

    const glow = b.createLinearGradient(0, hor - 6, 0, hor + 26);
    glow.addColorStop(0, 'rgba(0,240,255,0)');
    glow.addColorStop(0.25, 'rgba(0,240,255,.85)');
    glow.addColorStop(1, 'rgba(0,240,255,0)');
    b.fillStyle = glow;
    b.fillRect(0, hor - 6, W, 32);

    b.lineWidth = 1.5;
    b.strokeStyle = 'rgba(0,240,255,.4)';
    b.beginPath();
    for (let k = -16; k <= 16; k++) {
      b.moveTo(W / 2 + k * 6, hor);
      b.lineTo(W / 2 + k * W * 0.11, H);
    }
    b.stroke();

    // dim so text stays readable
    b.fillStyle = 'rgba(7,5,15,.38)';
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
    if (reduce) drawBg(0);
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
  const marquee = $('.marquee__track');
  const MARQ = ['★ HIGH SCORE', 'IT STUDENT', 'JAVA', 'SQL', 'C#', 'C++', 'FCE B2', 'UNIVERSITY OF PARDUBICE', 'LEVEL UP', 'INSERT COIN', 'PLAYER 1'];
  let marqUnit = 1;

  function buildMarquee() {
    if (!marquee) return;
    const txt = MARQ.join('   ✦   ') + '   ✦   ';
    marquee.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('span');
      s.textContent = txt;
      marquee.append(s);
    }
  }
  function measureMarquee() {
    if (marquee && marquee.firstElementChild) marqUnit = marquee.firstElementChild.getBoundingClientRect().width || 1;
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
  const scoreEl = $('#score');
  const coinsEl = $('#coins');
  const coinsMaxEl = $('#coinsMax');
  const barEl = $('#bar');
  const toTop = $('#toTop');
  const heroInner = $('#heroInner');
  const timelines = $$('.timeline');

  function computeScore() {
    state.score = state.progress * 30000 + state.visited.size * 1000 + state.coins * 500 + state.bonus;
  }

  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    state.progress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    barEl.style.transform = `scaleX(${state.progress})`;
    toTop.classList.toggle('is-on', window.scrollY > 700);

    // timeline fill
    for (const tl of timelines) {
      const r = tl.getBoundingClientRect();
      const p = clamp((innerHeight * 0.65 - r.top) / r.height, 0, 1);
      tl.style.setProperty('--p', p.toFixed(3));
    }

    // hero parallax
    if (!reduce && heroInner) {
      const y = window.scrollY;
      if (y < innerHeight * 1.2) {
        heroInner.style.transform = `translate3d(0, ${y * 0.25}px, 0)`;
        heroInner.style.opacity = String(clamp(1 - y / (innerHeight * 0.85), 0, 1));
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
  const GLYPHS = '█▓▒░#$%&*<>/\\|+=?01';
  function scramble(el) {
    if (reduce || el.dataset.scrambled) return;
    el.dataset.scrambled = '1';
    const final = el.textContent;
    el.setAttribute('aria-label', final);
    const start = performance.now();
    const dur = 800;
    const frame = (now) => {
      const p = clamp((now - start) / dur, 0, 1);
      const reveal = Math.floor(final.length * p);
      let out = '';
      for (let i = 0; i < final.length; i++) {
        const ch = final[i];
        out += i < reveal || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
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
    $$('.stat').forEach((li) => {
      const bar = $('.stat__bar', li);
      for (let i = 0; i < SEGS; i++) bar.append(document.createElement('i'));
    });
  }

  function fillStat(li) {
    const lvl = +li.dataset.level || 0;
    const segs = $$('.stat__bar i', li);
    const val = $('.stat__val', li);
    let i = 0;
    const next = () => {
      if (i < lvl) {
        const seg = segs[i];
        seg.classList.add('on');
        if (i >= 8) seg.classList.add('hot');
        else if (i >= 5) seg.classList.add('warm');
        if (i % 2 === 0) beep(300 + i * 60, 0.03, 'square', 0.012);
        i++;
        setTimeout(next, reduce ? 0 : 75);
      } else {
        val.textContent = li.dataset.label || `LV ${lvl}`;
      }
    };
    next();
  }

  function countUp(el) {
    const target = +el.dataset.count || 0;
    if (reduce || target === 0) { el.textContent = target; return; }
    let n = 0;
    const iv = setInterval(() => {
      n++;
      el.textContent = n;
      beep(500 + n * 80, 0.03, 'square', 0.015);
      if (n >= target) clearInterval(iv);
    }, 220);
  }

  /* ----------------------------------------------------------
     OBSERVERS
     ---------------------------------------------------------- */
  function setupObservers() {
    // generic reveal
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        el.classList.add('is-in');
        const h2 = $('h2[data-scramble]', el);
        if (h2) scramble(h2);
        reveal.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-reveal]').forEach((el) => reveal.observe(el));

    // chips pop in one by one
    const chips = $('#chips');
    if (chips) {
      $$('li', chips).forEach((li, i) => li.style.setProperty('--d', i));
      new IntersectionObserver((en, ob) => {
        if (en[0].isIntersecting) { chips.classList.add('is-in'); ob.disconnect(); }
      }, { threshold: 0.15 }).observe(chips);
    }

    // stat bars
    const stats = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        fillStat(e.target);
        stats.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    $$('.stat').forEach((el) => stats.observe(el));

    // counters
    const counters = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        countUp(e.target);
        counters.unobserve(e.target);
      });
    }, { threshold: 0.8 });
    $$('[data-count]').forEach((el) => counters.observe(el));

    // section tracking: nav highlight + stage unlock
    const links = $$('[data-nav]');
    const sections = $$('main .stage');
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const id = e.target.id;
        links.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === id));
        if (id !== 'hero' && !state.visited.has(id)) {
          state.visited.add(id);
          toast('STAGE UNLOCKED', `${e.target.dataset.title || id}  +1000`);
          sfx.unlock();
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));

    // countdown only runs while visible
    const cd = $('#countdown');
    const contact = $('#contact');
    if (cd && contact) {
      let n = 9;
      let iv = null;
      new IntersectionObserver((en) => {
        if (en[0].isIntersecting && !iv && !reduce) {
          iv = setInterval(() => {
            n = n <= 0 ? 9 : n - 1;
            cd.textContent = n;
            beep(n === 9 ? 880 : 440, 0.05, 'square', 0.02);
          }, 1000);
        } else if (!en[0].isIntersecting && iv) {
          clearInterval(iv);
          iv = null;
        }
      }, { threshold: 0.2 }).observe(contact);
    }
  }

  /* ----------------------------------------------------------
     TILT CARDS
     ---------------------------------------------------------- */
  function setupTilt() {
    if (reduce || !finePointer) return;
    $$('.tilt').forEach((el) => {
      let leaveTimer = null;
      el.addEventListener('mouseenter', () => {
        clearTimeout(leaveTimer);
        el.classList.add('tilting');
      });
      el.addEventListener('mousemove', (ev) => {
        const r = el.getBoundingClientRect();
        const px = (ev.clientX - r.left) / r.width - 0.5;
        const py = (ev.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateY(${(px * 7).toFixed(2)}deg) rotateX(${(-py * 7).toFixed(2)}deg) translateZ(0)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
        leaveTimer = setTimeout(() => el.classList.remove('tilting'), 260);
      });
    });
  }

  /* ----------------------------------------------------------
     COLLECTIBLE COINS
     ---------------------------------------------------------- */
  function placeCoins() {
    const stages = $$('main .stage');
    stages.forEach((st, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'coin';
      btn.setAttribute('aria-label', 'Collect coin');
      btn.dataset.sprite = 'coin';
      btn.dataset.px = '4';
      const left = i % 2 === 0 ? 1 + Math.random() * 5 : 92 + Math.random() * 4;
      const top = 14 + Math.random() * 68;
      btn.style.left = left + '%';
      btn.style.top = top + '%';
      st.append(btn);
      state.coinsMax++;
      btn.addEventListener('click', (ev) => {
        if (btn.classList.contains('is-taken')) return;
        btn.classList.add('is-taken');
        state.coins++;
        coinsEl.textContent = pad(state.coins, 2);
        floater(ev.clientX, ev.clientY, '+500');
        sfx.coin();
        setTimeout(() => btn.remove(), 520);
        if (state.coins === state.coinsMax && !state.allCoinsAwarded) {
          state.allCoinsAwarded = true;
          state.bonus += 5000;
          toast('ALL COINS COLLECTED', 'Completionist. +5000 bonus');
          sfx.power();
        }
      });
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
    addEventListener('mousemove', (ev) => {
      const now = performance.now();
      if (now - last < 45) return;
      last = now;
      const d = document.createElement('div');
      d.className = 'trail';
      d.style.left = ev.clientX - 4 + 'px';
      d.style.top = ev.clientY - 4 + 'px';
      document.body.append(d);
      setTimeout(() => d.remove(), 620);
    }, { passive: true });
  }

  /* ----------------------------------------------------------
     HERO MOUSE PARALLAX (sprites)
     ---------------------------------------------------------- */
  function setupHeroMouse() {
    if (reduce || !finePointer) return;
    const layer = $('.hero__sprites');
    if (!layer) return;
    addEventListener('mousemove', (ev) => {
      if (window.scrollY > innerHeight) return;
      const x = ev.clientX / innerWidth - 0.5;
      const y = ev.clientY / innerHeight - 0.5;
      layer.style.transform = `translate3d(${(-x * 40).toFixed(1)}px, ${(-y * 30).toFixed(1)}px, 0)`;
    }, { passive: true });
  }

  /* ----------------------------------------------------------
     NAV / BURGER / BUTTONS
     ---------------------------------------------------------- */
  function setupUI() {
    const burger = $('#burger');
    const nav = $('#nav');
    const closeNav = () => {
      nav.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    };
    burger.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      sfx.select();
    });
    $$('a', nav).forEach((a) => a.addEventListener('click', () => { closeNav(); sfx.select(); }));
    $$('a', nav).forEach((a) => a.addEventListener('mouseenter', sfx.blip));

    // sound toggle
    const snd = $('#sound');
    snd.addEventListener('click', () => {
      soundOn = !soundOn;
      snd.setAttribute('aria-pressed', String(soundOn));
      snd.textContent = soundOn ? 'SND ON' : 'SND OFF';
      if (soundOn) sfx.power();
    });

    // buttons
    $$('.btn').forEach((b) => b.addEventListener('click', () => sfx.select()));

    // back to top
    toTop.addEventListener('click', () => {
      sfx.power();
      toTop.classList.add('fly');
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      setTimeout(() => toTop.classList.remove('fly'), 750);
    });

    // contact
    const copy = $('#copyMail');
    copy.addEventListener('click', async () => {
      const mail = $('#mail').textContent.trim();
      try {
        await navigator.clipboard.writeText(mail);
        toast('COPIED', mail);
      } catch (e) {
        toast('E-MAIL', mail);
      }
      sfx.coin();
      const cnt = $('#countdown');
      cnt.classList.remove('coin-pop');
      void cnt.offsetWidth;
      cnt.classList.add('coin-pop');
    });
    $('#coinBtn').addEventListener('click', () => sfx.coin());

    $('#year').textContent = new Date().getFullYear();
  }

  /* ----------------------------------------------------------
     KONAMI CODE
     ---------------------------------------------------------- */
  function setupKonami() {
    const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let pos = 0;
    addEventListener('keydown', (ev) => {
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      pos = k === seq[pos] ? pos + 1 : (k === seq[0] ? 1 : 0);
      if (pos === seq.length) {
        pos = 0;
        const on = document.body.classList.toggle('konami');
        state.bonus += on ? 10000 : 0;
        toast(on ? 'CHEAT ACTIVATED' : 'CHEAT OFF', on ? 'Rainbow mode. +10000' : 'Back to normal.');
        sfx.power();
      }
    });
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
  setupTilt();
  setupTrail();
  setupHeroMouse();
  setupKonami();

  resize();
  onScroll();
  addEventListener('resize', resize);
  addEventListener('scroll', onScroll, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureMarquee);
  addEventListener('load', measureMarquee);

  runBoot();

  if (reduce) {
    addEventListener('scroll', () => drawBg(0), { passive: true });
    state.shown = state.score;
    scoreEl.textContent = pad(state.score, 6);
    addEventListener('scroll', () => { scoreEl.textContent = pad(state.score, 6); }, { passive: true });
  } else {
    requestAnimationFrame(loop);
  }
})();
