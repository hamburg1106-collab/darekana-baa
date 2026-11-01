"use strict";

/* だれかな？ばあ！
   くさむらをタップすると動物が「ばあ！」と出てくる、2歳向けの遊び画面。
   電車などで子どもに渡す前提なので、失敗・文字・外へのリンクは置かない。
   大人の操作は、はじめの画面と「右上を3秒長押し」のメニューだけ。
   流れ: start（はじめの画面）→ play → bye（みんなでまたね）→ sleep（夜・すけまるが寝る） */

// ---- 動物（act は出ているときに触ったときの絵。無い子は にっこりのまま跳ねる）
// size は横に広い子を小さめにして、くさむらからはみ出さないようにする ----
const ANIMALS = [
  { id: "dog", act: "bark" },
  { id: "squirrel", act: "nibble" },
  { id: "seal", act: "clap", size: 0.8 },
  { id: "cat", act: null },
  { id: "rabbit", act: "ear" },
  { id: "panda", act: "bamboo" },
  { id: "penguin", act: "flap" },
  { id: "elephant", act: null, size: 0.82 },
  { id: "lion", act: "roar", size: 0.92 },
];
// 好きな動物は2倍出やすくする
const FAVORITES = ["dog", "squirrel", "seal"];

const TIMERS = [0, 5, 10, 15, 20]; // 分。0はタイマーなし
const SUNSET_MS = 60 * 1000; // おしまいの1分前から夕方の色にしていく
const HINT_MS = 8000; // 触らない時間がこれだけ続いたら、くさむらから耳をのぞかせる
const UP_MS = 3000; // 出てきた動物がいる時間
const LONG_PRESS_MS = 3000;

const img = (name) => `img/${name}.webp`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// ---- 設定（大人が選ぶ。端末に覚えておく） ----
const settings = { sound: false, timer: 10 };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem("darekana-settings") || "{}"));
} catch {}
function saveSettings() {
  try {
    localStorage.setItem("darekana-settings", JSON.stringify(settings));
  } catch {}
}

// ---- 音（初期はなし。歪ませず、サイン波と雑音だけで作る） ----
const sound = {
  ctx: null,
  out: null,
  noise: null,
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      // iPhoneの消音スイッチがオンなら鳴らさない
      try {
        if (navigator.audioSession) navigator.audioSession.type = "ambient";
      } catch {}
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.4);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  play(name) {
    if (!settings.sound || !this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    SFX[name](this, this.ctx.currentTime + 0.01);
  },
  tone(f, t, dur, vol, f2) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  // 木琴のような音：基音＋すぐ消える高い倍音
  mallet(f, t, dur = 0.35, vol = 0.22) {
    this.tone(f, t, dur, vol);
    this.tone(f * 4, t, dur * 0.25, vol * 0.18);
  },
  // くさむらの がさがさ：雑音を帯域で絞ってこもらせる
  rustle(t, vol = 0.12) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(bp).connect(lp).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + 0.36);
  },
};

const SFX = {
  rustle: (s, t) => s.rustle(t),
  baa: (s, t) => {
    s.mallet(784, t);
    s.mallet(1047, t + 0.12, 0.45);
  },
  act: (s, t) => [1047, 1319, 1568].forEach((f, i) => s.mallet(f, t + i * 0.09, 0.3, 0.16)),
  pop: (s, t) => s.tone(700, t, 0.09, 0.12, 1300),
  // すけまるの鈴の「ちりん」
  bell: (s, t) => {
    s.tone(2093, t, 1.1, 0.08);
    s.tone(2101, t, 0.9, 0.05);
    s.tone(5420, t, 0.35, 0.02);
  },
  bye: (s, t) => [784, 659, 523].forEach((f, i) => s.mallet(f, t + i * 0.4, 0.7, 0.16)),
  twinkle: (s, t) => s.tone(1568 * rand(1, 1.5), t, 0.6, 0.04),
};

// ---- 画面の部品 ----
const stage = document.getElementById("stage");
const suke = document.getElementById("suke");
const sunset = document.getElementById("sunset");
const night = document.getElementById("night");
const sky = document.getElementById("sky");

// くさむら：輪郭つきの円を重ねて、外側の線だけ残す
const BUSH_CIRCLES = [[40, 84, 40], [76, 54, 44], [126, 50, 46], [162, 82, 38], [100, 86, 38]];
const circles = (attrs) => BUSH_CIRCLES.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" ${attrs}/>`).join("");
const flower = (x, y) =>
  `<circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="#5e6444" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="2" fill="#f2c14e"/>`;
const BUSH_SVG = `<svg class="bush" viewBox="0 0 200 124" preserveAspectRatio="none">
  <ellipse cx="100" cy="122" rx="98" ry="7" fill="rgba(70,80,40,.25)"/>
  <g stroke="#5e6444" stroke-width="7" fill="#5e6444">${circles("")}<rect x="22" y="84" width="156" height="38"/></g>
  <g fill="#a3bd6e">${circles("")}<rect x="22" y="84" width="156" height="36"/></g>
  <ellipse cx="100" cy="110" rx="80" ry="13" fill="#8fab5c"/>
  <ellipse cx="72" cy="40" rx="15" ry="8" fill="#bcd38c" transform="rotate(-20 72 40)"/>
  <ellipse cx="124" cy="34" rx="17" ry="9" fill="#bcd38c" transform="rotate(-8 124 34)"/>
  <ellipse cx="36" cy="70" rx="10" ry="6" fill="#bcd38c" transform="rotate(-30 36 70)"/>
  ${flower(58, 94)}${flower(146, 72)}${flower(110, 104)}
</svg>`;

function makeSpot() {
  const el = document.createElement("div");
  el.className = "spot";
  el.innerHTML = `<div class="clip"><img class="animal" alt="" draggable="false" src="${img("dog_normal")}"></div>${BUSH_SVG}`;
  stage.insertBefore(el, suke);
  return {
    el,
    clip: el.querySelector(".clip"),
    animal: el.querySelector(".animal"),
    bush: el.querySelector(".bush"),
    state: "idle", // idle / hint / busy / up
    who: null,
    pending: null, // 耳をのぞかせた子。次に触ったらその子が出る
    token: 0, // 動きの途中で別の動きが始まったら、古い方を止めるための番号
    timer: 0,
    g: null,
  };
}
const spots = [makeSpot(), makeSpot(), makeSpot()];

const stars = Array.from({ length: 22 }, () => {
  const st = document.createElement("div");
  st.className = "star";
  const size = rand(2, 5);
  Object.assign(st.style, { left: `${rand(3, 97)}%`, top: `${rand(3, 45)}%`, width: `${size}px`, height: `${size}px` });
  sky.appendChild(st);
  return st;
});
const moon = document.createElement("div");
moon.className = "moon";
sky.appendChild(moon);

// ---- 配置（縦持ち・横持ちどちらでも） ----
let W = 0;
let H = 0;

// 動物の高さの位置。clip の下端（くさむらの高さの半分）を0とする
function ys(s) {
  const { ah, bh } = s.g;
  return { hidden: ah + 10, hint: ah * 0.78 - bh * 0.5, peek: ah * 0.7 - bh * 0.5, up: ah * 0.22 - bh * 0.5 };
}
const at = (y, extra = "") => `translate(-50%, ${y}px)${extra}`;
const tf = (s, state) => at(ys(s)[state]);

function layout() {
  W = innerWidth;
  H = innerHeight;
  const portrait = W / H < 1.1;
  const pos = portrait
    ? [[0.27, 0.71], [0.74, 0.71], [0.56, 0.885]]
    : [[0.34, 0.8], [0.84, 0.8], [0.6, 0.88]];
  const bw = portrait ? Math.min(W * 0.46, H * 0.25) : Math.min(W * 0.22, H * 0.4);
  const bh = bw * 0.62;
  const ah = bw * 0.92;
  const clipH = ah * 1.6 + bh * 0.5; // 跳ねても頭が切れない高さ
  spots.forEach((s, k) => {
    const [px, py] = pos[k];
    const cx = W * px;
    const bushTop = H * py - bh / 2;
    s.g = { bw, bh, ah };
    Object.assign(s.el.style, {
      left: `${cx - bw}px`,
      top: `${bushTop + bh * 0.5 - clipH}px`,
      width: `${bw * 2}px`,
      height: `${clipH + bh * 0.5}px`,
      zIndex: String(Math.round(py * 100)),
    });
    s.clip.style.height = `${clipH}px`;
    Object.assign(s.bush.style, { left: `${bw / 2}px`, width: `${bw}px`, height: `${bh}px` });
    s.animal.style.height = `${ah * ((s.who && s.who.size) || 1)}px`;
    s.animal.style.transform = tf(s, s.state === "up" ? "up" : "hidden");
  });
  const sz = portrait ? Math.min(W * 0.34, H * 0.17) : Math.min(H * 0.34, W * 0.17);
  Object.assign(suke.style, { width: `${sz}px`, left: `${-sz * 0.06}px`, bottom: `${-sz * 0.16}px` });
  const m = Math.min(W, H) * 0.14;
  Object.assign(moon.style, { width: `${m}px`, height: `${m}px`, left: `${W * 0.68}px`, top: `${H * 0.1}px` });
}
addEventListener("resize", layout);
layout();

// ---- 動きの道具 ----
// 最後の形を style に書き戻してからアニメーションを外す（次の動きがそこから始まる）
function move(el, frames, ms, easing = "ease-out") {
  const a = el.animate(frames, { duration: ms, easing, fill: "forwards" });
  return a.finished.then(
    () => {
      try {
        a.commitStyles();
      } catch {}
      a.cancel();
    },
    () => {}
  );
}
function stopAnims(el) {
  el.getAnimations().forEach((a) => {
    try {
      a.commitStyles();
    } catch {}
    a.cancel();
  });
}

function setAnimal(s, who, pose = "normal") {
  s.animal.style.height = `${s.g.ah * (who.size || 1)}px`;
  s.animal.src = img(`${who.id}_${pose}`);
}

function rustle(s, soft) {
  const d = soft ? 2 : 4;
  s.bush.animate(
    [
      { transform: "rotate(0)" },
      { transform: `rotate(${-d}deg) scaleY(.95)` },
      { transform: `rotate(${d}deg)` },
      { transform: `rotate(${-d / 2}deg)` },
      { transform: "rotate(0)" },
    ],
    { duration: soft ? 600 : 380, easing: "ease-in-out" }
  );
  sound.play("rustle");
}

let bag = [];
let lastAnimal = null;
function nextAnimal() {
  const out = new Set(spots.flatMap((s) => [s.state !== "idle" && s.who ? s.who.id : null, s.pending && s.pending.id]));
  if (!bag.length) bag = shuffle([...ANIMALS, ...ANIMALS.filter((a) => FAVORITES.includes(a.id))]);
  let k = bag.findIndex((a) => a.id !== lastAnimal && !out.has(a.id));
  if (k < 0) k = 0;
  const [a] = bag.splice(k, 1);
  lastAnimal = a.id;
  return a;
}

// ---- すけまる ----
let face = "normal";
let faceTimer = 0;
let sukeBusy = false;
let breathe = null;

function setFace(f, ms) {
  face = f;
  suke.src = img(`suke_${f}`);
  clearTimeout(faceTimer);
  if (ms) faceTimer = setTimeout(() => setFace(phase === "sleep" ? "blink" : "normal"), ms);
}

(function blinkLoop() {
  setTimeout(() => {
    if (face === "normal") {
      suke.src = img("suke_blink");
      setTimeout(() => {
        if (face === "normal") suke.src = img("suke_normal");
      }, 140);
    }
    blinkLoop();
  }, rand(2500, 5000));
})();

async function sukeBaa() {
  if (sukeBusy) return;
  sukeBusy = true;
  sound.play("bell");
  setFace("surprised");
  suke.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.08, .92)", offset: 0.3 },
      { transform: "translateY(-12%) scale(.97, 1.05)", offset: 0.6 },
      { transform: "scale(1)" },
    ],
    { duration: 600, easing: "ease-out" }
  );
  await sleep(250);
  if (phase === "play") setFace("baa", 900);
  await sleep(900);
  sukeBusy = false;
}

// ---- くさむらの動物 ----
async function reveal(s) {
  const t = ++s.token;
  stopAnims(s.animal);
  clearTimeout(s.timer);
  s.state = "busy";
  const who = s.pending || nextAnimal();
  s.pending = null;
  s.who = who;
  setAnimal(s, who);
  rustle(s);
  // 「ん？」と少しのぞいてから
  await move(s.animal, [{ transform: tf(s, "peek") }], 260);
  await sleep(380);
  if (t !== s.token) return;
  // 「ばあ！」
  setAnimal(s, who, "happy");
  sound.play("baa");
  if (!sukeBusy) setFace("happy", 1200);
  await move(s.animal, [{ transform: tf(s, "up") }], 420, "cubic-bezier(.3,1.7,.5,1)");
  if (t !== s.token) return;
  s.state = "up";
  s.timer = setTimeout(() => hide(s), UP_MS);
}

async function act(s) {
  const t = ++s.token;
  clearTimeout(s.timer);
  s.state = "busy";
  setAnimal(s, s.who, s.who.act || "happy");
  sound.play("act");
  const y = ys(s).up;
  const j = s.g.ah * 0.16;
  await move(
    s.animal,
    [
      { transform: at(y) },
      { transform: at(y, " scale(1.06, .94)"), offset: 0.15 },
      { transform: at(y - j, " scale(.97, 1.04)"), offset: 0.5 },
      { transform: at(y, " scale(1.05, .95)"), offset: 0.82 },
      { transform: at(y) },
    ],
    560,
    "ease-in-out"
  );
  await sleep(450);
  if (t !== s.token) return;
  setAnimal(s, s.who, "happy");
  s.state = "up";
  s.timer = setTimeout(() => hide(s), UP_MS);
}

async function hide(s) {
  if (s.state !== "up") return;
  const t = ++s.token;
  s.state = "busy";
  setAnimal(s, s.who);
  await move(s.animal, [{ transform: tf(s, "hidden") }], 380, "ease-in");
  if (t !== s.token) return;
  s.state = "idle";
}

// しばらく触られないと、くさむらから耳だけのぞかせて誘う
async function hint(s) {
  const t = ++s.token;
  s.state = "hint";
  s.pending = s.pending || nextAnimal();
  setAnimal(s, s.pending);
  rustle(s, true);
  await move(s.animal, [{ transform: tf(s, "hint") }], 450);
  await sleep(1000);
  if (t !== s.token) return;
  await move(s.animal, [{ transform: tf(s, "hidden") }], 450, "ease-in");
  if (t !== s.token) return;
  s.state = "idle";
}

function tapSpot(s) {
  if (s.state === "idle" || s.state === "hint") reveal(s);
  else if (s.state === "up") act(s);
}

// ---- シャボン玉（何もないところを触ったとき） ----
const bubbles = [];

function blow(x, y) {
  if (bubbles.length >= 14) pop(bubbles[0], true);
  const size = rand(44, 76) * Math.min(1.4, Math.max(0.8, Math.min(W, H) / 400));
  const b = document.createElement("div");
  b.className = "bubble";
  Object.assign(b.style, { width: `${size}px`, height: `${size}px`, left: `${x - size / 2}px`, top: `${y - size / 2}px` });
  stage.appendChild(b);
  bubbles.push(b);
  const rise = rand(160, 280);
  const sway = rand(16, 30) * (Math.random() < 0.5 ? -1 : 1);
  b.anim = b.animate(
    [
      { transform: "translate(0, 0) scale(.3)", opacity: 0 },
      { transform: `translate(${sway * 0.3}px, -20px) scale(1)`, opacity: 1, offset: 0.08 },
      { transform: `translate(${sway}px, ${-rise * 0.4}px) scale(1)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${-sway * 0.4}px, ${-rise * 0.75}px) scale(1.02)`, opacity: 1, offset: 0.75 },
      { transform: `translate(${sway * 0.5}px, ${-rise}px) scale(1.05)`, opacity: 0 },
    ],
    { duration: rand(4200, 6000), easing: "linear", fill: "forwards" }
  );
  b.anim.finished.then(() => drop(b), () => {});
}

function drop(b) {
  const k = bubbles.indexOf(b);
  if (k >= 0) bubbles.splice(k, 1);
  b.remove();
}

function pop(b, quiet) {
  if (b.popped) return;
  b.popped = true;
  try {
    b.anim.commitStyles();
  } catch {}
  b.anim.cancel();
  if (!quiet) sound.play("pop");
  const cur = getComputedStyle(b).transform;
  const base = cur === "none" ? "" : cur;
  b.animate(
    [
      { transform: `${base} scale(1)`, opacity: 1 },
      { transform: `${base} scale(1.5)`, opacity: 0 },
    ],
    { duration: 180, fill: "forwards" }
  ).finished.then(() => drop(b), () => drop(b));
}

// 夜に触ったときの小さな星
function twinkle(x, y) {
  const st = document.createElement("div");
  st.className = "star";
  Object.assign(st.style, { left: `${x - 4}px`, top: `${y - 4}px`, width: "8px", height: "8px" });
  sky.appendChild(st);
  sound.play("twinkle");
  st.animate(
    [
      { opacity: 0, transform: "scale(.4)" },
      { opacity: 0.9, transform: "scale(1)", offset: 0.3 },
      { opacity: 0, transform: "scale(.6)" },
    ],
    { duration: 1400, easing: "ease-out" }
  ).finished.then(() => st.remove(), () => st.remove());
}

// ---- 進行 ----
let phase = "start";
let left = 0; // おしまいまでの残り（ミリ秒）
let lastInput = Date.now();
let lastHint = 0;
let byeToken = 0;
let menuOpen = false;

stage.addEventListener("pointerdown", (e) => {
  if (phase === "start") return;
  lastInput = Date.now();
  if (phase === "sleep") return twinkle(e.clientX, e.clientY);
  if (phase !== "play") return;
  const t = e.target;
  const b = t.closest(".bubble");
  if (b) return pop(b);
  if (t === suke) return sukeBaa();
  const sp = t.closest(".spot");
  if (sp) return tapSpot(spots.find((s) => s.el === sp));
  blow(e.clientX, e.clientY);
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;
  if (phase !== "play" || menuOpen || document.hidden) return;
  if (settings.timer) {
    left -= dt;
    sunset.style.opacity = String(Math.min(1, Math.max(0, 1 - left / SUNSET_MS)) * 0.8);
    if (left <= 0) return goodbye();
  }
  if (now - Math.max(lastInput, lastHint) > HINT_MS) {
    const idle = spots.filter((s) => s.state === "idle");
    if (idle.length) {
      lastHint = now;
      hint(idle[Math.floor(Math.random() * idle.length)]);
    }
  }
}, 500);

function restart() {
  byeToken++;
  spots.forEach((s) => {
    s.token++;
    clearTimeout(s.timer);
    stopAnims(s.animal);
    s.state = "idle";
    s.pending = null;
    s.animal.style.transform = tf(s, "hidden");
  });
  bubbles.slice().forEach((b) => {
    b.anim.cancel();
    drop(b);
  });
  stars.forEach((st) => st.getAnimations().forEach((a) => a.cancel()));
  if (breathe) breathe.cancel();
  breathe = null;
  sunset.style.opacity = "0";
  night.style.opacity = "0";
  moon.style.opacity = "0";
  setFace("normal");
  left = settings.timer * 60 * 1000;
  phase = "play";
  lastInput = Date.now();
  keepAwake();
}

// おしまい：みんなで出てきて「またね」→ くさむらに帰る → 夜になって すけまるが寝る
async function goodbye() {
  if (phase !== "play") return;
  phase = "bye";
  const t = ++byeToken;
  bubbles.slice().forEach((b) => pop(b, true));
  sunset.style.opacity = "0.8";
  setFace("happy");
  spots.forEach((s) => {
    s.token++;
    clearTimeout(s.timer);
    stopAnims(s.animal);
    s.state = "busy";
    s.pending = null;
  });
  await Promise.all(spots.map((s) => move(s.animal, [{ transform: tf(s, "hidden") }], 300, "ease-in")));
  await sleep(400);
  if (t !== byeToken) return;

  const friends = shuffle([...ANIMALS]).slice(0, spots.length);
  sound.play("bye");
  await Promise.all(
    spots.map(async (s, k) => {
      s.who = friends[k];
      await sleep(k * 250);
      setAnimal(s, s.who, "happy");
      rustle(s, true);
      await move(s.animal, [{ transform: tf(s, "up") }], 500, "cubic-bezier(.3,1.5,.5,1)");
      const y = ys(s).up;
      await move(s.animal, [0, -7, 7, -7, 7, 0].map((d) => ({ transform: at(y, ` rotate(${d}deg)`) })), 2000, "ease-in-out");
    })
  );
  if (t !== byeToken) return;
  await sleep(300);
  for (const s of spots) {
    setAnimal(s, s.who);
    move(s.animal, [{ transform: tf(s, "hidden") }], 700, "ease-in");
    await sleep(450);
    if (t !== byeToken) return;
  }
  await sleep(700);
  if (t !== byeToken) return;
  spots.forEach((s) => (s.state = "idle"));

  phase = "sleep";
  night.style.opacity = "0.6";
  moon.style.opacity = "1";
  stars.forEach((st) =>
    st.animate([{ opacity: 0 }, { opacity: rand(0.5, 1) }], {
      duration: rand(1500, 3000),
      delay: rand(0, 4000),
      iterations: Infinity,
      direction: "alternate",
      easing: "ease-in-out",
      fill: "backwards",
    })
  );
  setFace("blink");
  breathe = suke.animate([{ transform: "scale(1)" }, { transform: "scale(1.03, .98)" }], {
    duration: 3200,
    iterations: Infinity,
    direction: "alternate",
    easing: "ease-in-out",
  });
  // 夜になったら画面が自動で消えてよい（返してもらいやすくする）
  letSleep();
}

// ---- 画面をつけっぱなしにする ----
let wakeLock = null;
async function keepAwake() {
  try {
    if ("wakeLock" in navigator && !wakeLock && !document.hidden) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    }
  } catch {}
}
function letSleep() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && (phase === "play" || phase === "bye")) keepAwake();
});

// ---- 子どもの操作で画面から出ないようにする ----
const inPanel = (e) => e.target.closest && e.target.closest(".panel");
["touchstart", "touchmove"].forEach((ev) =>
  document.addEventListener(
    ev,
    (e) => {
      if (!inPanel(e)) e.preventDefault();
    },
    { passive: false }
  )
);
["gesturestart", "gesturechange", "contextmenu", "dblclick"].forEach((ev) =>
  document.addEventListener(ev, (e) => e.preventDefault())
);

// Androidの「戻る」で閉じないよう、戻られたら1つ進め直す
let backTrapped = false;
function trapBack() {
  if (backTrapped) return;
  backTrapped = true;
  history.pushState({ darekana: 1 }, "");
  addEventListener("popstate", () => {
    if (phase !== "start") history.pushState({ darekana: 1 }, "");
  });
}

function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
}

// ---- 大人向けの画面 ----
const startPanel = document.getElementById("start");
const menuPanel = document.getElementById("menu");
const howtoPanel = document.getElementById("howto");

function renderSettings() {
  const seg = (key, options) =>
    `<div class="seg" data-key="${key}">${options
      .map(([v, label]) => `<button data-v="${v}" class="${settings[key] === v ? "on" : ""}">${label}</button>`)
      .join("")}</div>`;
  document.querySelectorAll(".settings").forEach((box) => {
    box.innerHTML = `
      <div class="setting"><div class="label">おと（電車では「なし」がおすすめ）</div>${seg("sound", [[false, "なし"], [true, "あり"]])}</div>
      <div class="setting"><div class="label">おしまいタイマー</div>${seg("timer", TIMERS.map((m) => [m, m ? `${m}分` : "なし"]))}</div>`;
  });
  const remain = document.getElementById("remain");
  if (phase === "sleep" || phase === "bye") remain.textContent = "おやすみ中です";
  else if (!settings.timer) remain.textContent = "タイマーなし";
  else remain.textContent = `おしまいまで あと${Math.max(1, Math.ceil(left / 60000))}分`;
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".seg button");
  if (!btn) return;
  const key = btn.parentElement.dataset.key;
  const v = JSON.parse(btn.dataset.v);
  settings[key] = v;
  saveSettings();
  if (key === "sound" && v) {
    sound.unlock();
    sound.play("baa");
  }
  if (key === "timer" && phase === "play") {
    left = v * 60 * 1000;
    sunset.style.opacity = "0";
  }
  renderSettings();
});

document.getElementById("play").addEventListener("click", () => {
  sound.unlock();
  goFullscreen();
  trapBack();
  startPanel.classList.add("hidden");
  restart();
});

function openMenu() {
  menuOpen = true;
  renderSettings();
  menuPanel.classList.remove("hidden");
}
function closeMenu() {
  menuOpen = false;
  menuPanel.classList.add("hidden");
  lastInput = Date.now();
}
document.getElementById("menu-close").addEventListener("click", closeMenu);
document.getElementById("restart").addEventListener("click", () => {
  closeMenu();
  restart();
});
document.getElementById("bye-now").addEventListener("click", () => {
  closeMenu();
  goodbye();
});
document.querySelectorAll(".howto-open").forEach((b) => b.addEventListener("click", () => howtoPanel.classList.remove("hidden")));
document.getElementById("howto-close").addEventListener("click", () => howtoPanel.classList.add("hidden"));

// 右上のすみを3秒長押しでメニュー。0.6秒たってから進み具合の輪を見せる
const corner = document.getElementById("corner");
let pressRaf = 0;
function endPress() {
  cancelAnimationFrame(pressRaf);
  corner.classList.remove("pressing");
  corner.style.setProperty("--p", "0");
}
corner.addEventListener("pointerdown", (e) => {
  if (phase === "start") return;
  if (phase === "play") blow(e.clientX, e.clientY);
  try {
    corner.setPointerCapture(e.pointerId);
  } catch {}
  const start = performance.now();
  const step = (now) => {
    const held = now - start;
    if (held > 600) corner.classList.add("pressing");
    corner.style.setProperty("--p", String(Math.max(0, (held - 600) / (LONG_PRESS_MS - 600))));
    if (held >= LONG_PRESS_MS) {
      endPress();
      openMenu();
      return;
    }
    pressRaf = requestAnimationFrame(step);
  };
  pressRaf = requestAnimationFrame(step);
});
["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => corner.addEventListener(ev, endPress));

// ---- 起動 ----
renderSettings();
// 絵を先に読み込んでおき、出てくる瞬間に絵が欠けないようにする
const preloaded = [];
ANIMALS.forEach((a) =>
  ["normal", "happy", a.act].filter(Boolean).forEach((p) => {
    const im = new Image();
    im.src = img(`${a.id}_${p}`);
    preloaded.push(im);
  })
);
["normal", "happy", "blink", "baa", "surprised"].forEach((f) => {
  const im = new Image();
  im.src = img(`suke_${f}`);
  preloaded.push(im);
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
