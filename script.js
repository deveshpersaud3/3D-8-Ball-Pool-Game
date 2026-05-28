/* ═══════════════════════════════════════════════════════════════════════════
   MIDNIGHT BILLIARDS — script.js
   Full 8-Ball Pool Game Engine
   Modules: Config → State → Audio → Renderer → Physics → AI → Input → UI
═══════════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   § 1. CONFIGURATION & CONSTANTS
══════════════════════════════════════════════════════════════ */
const CFG = {
  // Table geometry (canvas units)
  TABLE_W:      900,
  TABLE_H:      500,
  CUSHION:      36,        // cushion/rail width in px
  POCKET_R:     22,        // pocket hole radius
  BALL_R:       13,        // ball radius
  // Physics
  FRICTION:     0.988,     // per-frame velocity multiplier (rolling friction)
  MIN_SPEED:    0.18,      // below this speed, ball is considered stopped
  MAX_POWER:    22,        // max cue shot impulse
  RESTITUTION:  0.93,      // ball-ball bounce factor
  WALL_REST:    0.78,      // ball-wall bounce factor
  // AI
  AI_THINK_MS:  900,       // ms before AI shoots
  AI_ACCURACY:  0.94,      // 0–1, how accurate the aim is
  // Rendering
  GUIDE_DOTS:   14,        // number of aim guide dots
  GUIDE_LEN:    320,       // length of aim guideline
  CUE_LEN:      200,       // cue stick draw length on screen
};

// Playfield inner rect (inside cushions)
const FIELD = {
  get x()  { return CFG.CUSHION; },
  get y()  { return CFG.CUSHION; },
  get w()  { return CFG.TABLE_W - CFG.CUSHION * 2; },
  get h()  { return CFG.TABLE_H - CFG.CUSHION * 2; },
  get x2() { return CFG.TABLE_W - CFG.CUSHION; },
  get y2() { return CFG.TABLE_H - CFG.CUSHION; },
};

// 6 pocket positions [x, y] in canvas coords
function buildPockets() {
  const r = CFG.POCKET_R;
  const cx = CFG.CUSHION, cy = CFG.CUSHION;
  const fw = FIELD.w, fh = FIELD.h;
  return [
    { x: cx,             y: cy              }, // top-left
    { x: cx + fw / 2,    y: cy - 4          }, // top-mid
    { x: cx + fw,        y: cy              }, // top-right
    { x: cx,             y: cy + fh         }, // bot-left
    { x: cx + fw / 2,    y: cy + fh + 4     }, // bot-mid
    { x: cx + fw,        y: cy + fh         }, // bot-right
  ];
}

// Ball colors (index 0 = cue ball, 1-7 solids, 8 = 8-ball, 9-15 stripes)
const BALL_COLORS = [
  '#F5F5F0', // 0  cue
  '#F5C518', // 1  yellow solid
  '#1A6FBF', // 2  blue solid
  '#C0392B', // 3  red solid
  '#8E44AD', // 4  purple solid
  '#E67E22', // 5  orange solid
  '#27AE60', // 6  green solid
  '#8B1A1A', // 7  maroon solid
  '#1a1a1a', // 8  eight ball
  '#F5C518', // 9  yellow stripe
  '#1A6FBF', // 10 blue stripe
  '#C0392B', // 11 red stripe
  '#8E44AD', // 12 purple stripe
  '#E67E22', // 13 orange stripe
  '#27AE60', // 14 green stripe
  '#8B1A1A', // 15 maroon stripe
];

/* ══════════════════════════════════════════════════════════════
   § 2. GAME STATE
══════════════════════════════════════════════════════════════ */
const State = {
  // Screen management
  screen: 'start',  // 'start' | 'game' | 'gameover'
  vsAI: false,

  // Ball array: { id, x, y, vx, vy, pocketed, number }
  balls: [],

  // Turn management
  currentPlayer: 0,       // 0 or 1
  playerTypes: [null, null], // 'solid' | 'stripe' | null per player
  typesAssigned: false,
  firstBallSunk: false,

  // Shot state
  shooting: false,      // mouse is held down for shot
  aimAngle: 0,
  power: 0,
  ballsMoving: false,
  awaitingCueBall: false, // scratch — place cue ball
  ballInHandFull: false,  // true = can place cue ball ANYWHERE on table

  // Aiming drag
  dragStart: null,      // { x, y } in canvas coords
  dragCurrent: null,

  // Sound
  soundOn: true,

  // Pocket flash visual
  pocketFlash: [],    // [{ x, y, t }]

  // AI
  aiThinking: false,
  aiTimer: null,
  aiDifficulty: 'medium',

  // Which balls were pocketed this turn
  pocketedThisTurn: [],

  // Track the first ball the cue ball contacts each shot (for foul detection)
  // null = no contact yet this shot, 0 = hit cue only (miss), otherwise ball id
  firstContactId: null,
  cueHitSomething: false,   // did cue ball touch ANY other ball this shot?

  // Win/lose
  winner: null,     // 0 | 1
  winReason: '',
};

/* ══════════════════════════════════════════════════════════════
   § 3. AUDIO ENGINE
   All sounds generated via Web Audio API — no external files needed
══════════════════════════════════════════════════════════════ */
const Audio = (() => {
  let ctx = null;
  let bgGain = null;
  let bgNode = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  /* ── Utility: play a buffer ───────────────────────────────── */
  function playBuffer(buf, vol = 1.0, when = 0) {
    if (!State.soundOn) return;
    const c = getCtx();
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buf;
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(c.destination);
    src.start(c.currentTime + when);
  }

  /* ── Build noise buffer ───────────────────────────────────── */
  function makeNoise(duration, sampleRate = 44100) {
    const c = getCtx();
    const frames = Math.ceil(duration * sampleRate);
    const buf = c.createBuffer(1, frames, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1);
    return buf;
  }

  /* ── Cue stick hit sound ──────────────────────────────────── */
  function hitCue(power) {
    if (!State.soundOn) return;
    const c = getCtx();
    const now = c.currentTime;
    const vol = 0.3 + power * 0.7;

    // Sharp transient click
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
    g.gain.setValueAtTime(vol * 0.6, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(g); g.connect(c.destination);
    osc.start(now); osc.stop(now + 0.15);

    // Clack noise burst
    const nBuf = makeNoise(0.06);
    const ng = c.createGain();
    const nf = c.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 2000;
    ng.gain.setValueAtTime(vol * 0.4, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    const ns = c.createBufferSource();
    ns.buffer = nBuf;
    ns.connect(nf); nf.connect(ng); ng.connect(c.destination);
    ns.start(now);
  }

  /* ── Ball-ball collision ──────────────────────────────────── */
  function hitBall(speed) {
    if (!State.soundOn) return;
    const c = getCtx();
    const now = c.currentTime;
    const vol = Math.min(1, speed / 8) * 0.5;

    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200 + speed * 40, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(g); g.connect(c.destination);
    osc.start(now); osc.stop(now + 0.08);
  }

  /* ── Cushion hit ──────────────────────────────────────────── */
  function hitWall(speed) {
    if (!State.soundOn) return;
    const c = getCtx();
    const now = c.currentTime;
    const vol = Math.min(1, speed / 6) * 0.35;

    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g); g.connect(c.destination);
    osc.start(now); osc.stop(now + 0.22);
  }

  /* ── Pocket sound ─────────────────────────────────────────── */
  function pocket() {
    if (!State.soundOn) return;
    const c = getCtx();
    const now = c.currentTime;

    // Thud
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, now);
    o.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    g.gain.setValueAtTime(0.6, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    o.connect(g); g.connect(c.destination);
    o.start(now); o.stop(now + 0.36);

    // Rumble
    const nBuf = makeNoise(0.25);
    const ng = c.createGain();
    const nf = c.createBiquadFilter();
    nf.type = 'lowpass'; nf.frequency.value = 300;
    ng.gain.setValueAtTime(0.3, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    const ns = c.createBufferSource();
    ns.buffer = nBuf;
    ns.connect(nf); nf.connect(ng); ng.connect(c.destination);
    ns.start(now);
  }

  /* ── Background ambient music ─────────────────────────────── */
  function startBGM() {
    if (!State.soundOn) return;
    if (bgNode) return;
    const c = getCtx();

    // Smooth jazz-ish drone using layered oscillators
    bgGain = c.createGain();
    bgGain.gain.value = 0.04;
    bgGain.connect(c.destination);

    const freqs = [65.4, 98, 130.8, 196, 261.6];
    freqs.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.3 / (i + 1);
      // Slow vibrato
      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      lfo.frequency.value = 0.2 + i * 0.05;
      lfoGain.gain.value = 0.4;
      lfo.connect(lfoGain);
      lfoGain.connect(o.frequency);
      lfo.start();
      o.connect(g); g.connect(bgGain);
      o.start();
    });
    bgNode = bgGain;
  }

  function stopBGM() {
    if (bgGain) { bgGain.gain.value = 0; bgNode = null; }
  }

  function toggleSound() {
    State.soundOn = !State.soundOn;
    if (State.soundOn) startBGM(); else stopBGM();
    return State.soundOn;
  }

  return { hitCue, hitBall, hitWall, pocket, startBGM, stopBGM, toggleSound, getCtx };
})();

/* ══════════════════════════════════════════════════════════════
   § 4. BALL SETUP
══════════════════════════════════════════════════════════════ */

/** Creates a ball object */
function makeBall(id, x, y) {
  return { id, x, y, vx: 0, vy: 0, pocketed: false, spin: 0 };
}

/** Standard rack positions for 15 balls in triangle formation */
function rackBalls() {
  const R = CFG.BALL_R;
  const balls = [];

  // Cue ball
  balls.push(makeBall(0, FIELD.x + FIELD.w * 0.25, FIELD.y + FIELD.h / 2));

  // Rack tip at the foot spot
  const rackX = FIELD.x + FIELD.w * 0.73;
  const rackY = FIELD.y + FIELD.h / 2;
  const rowSpacingX = R * 2 * Math.cos(Math.PI / 6);   // ~√3 * R
  const rowSpacingY = R * 2;

  // Ball arrangement (indices into BALL_COLORS) — 8 must be center of triangle
  // Standard rack: 8 in center, alternating solids/stripes on corners
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  let ballIdx = 0;

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const bx = rackX + row * rowSpacingX;
      const by = rackY + (col - row / 2) * rowSpacingY;
      balls.push(makeBall(order[ballIdx], bx, by));
      ballIdx++;
    }
  }
  return balls;
}

/* ══════════════════════════════════════════════════════════════
   § 5. PHYSICS ENGINE
══════════════════════════════════════════════════════════════ */
const Physics = (() => {

  const POCKETS = buildPockets();

  /** Move all balls one frame, apply friction, check walls & pockets */
  function step(balls, dt = 1) {
    let anyMoving = false;
    const pocketedNow = [];

    // Move each ball
    balls.forEach(ball => {
      if (ball.pocketed) return;
      if (Math.abs(ball.vx) < CFG.MIN_SPEED && Math.abs(ball.vy) < CFG.MIN_SPEED) {
        ball.vx = 0; ball.vy = 0;
        return;
      }
      anyMoving = true;

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.spin += (ball.vx * 0.01); // visual spin

      // Friction
      ball.vx *= CFG.FRICTION;
      ball.vy *= CFG.FRICTION;
    });

    // Ball-wall collisions
    balls.forEach(ball => {
      if (ball.pocketed) return;
      wallCollide(ball);
    });

    // Ball-ball collisions (n² for simplicity — 15 balls is fine)
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        if (balls[i].pocketed || balls[j].pocketed) continue;
        ballCollide(balls[i], balls[j]);
      }
    }

    // Pocket detection
    balls.forEach(ball => {
      if (ball.pocketed) return;
      POCKETS.forEach(p => {
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CFG.POCKET_R + CFG.BALL_R * 0.5) {
          ball.pocketed = true;
          ball.vx = 0; ball.vy = 0;
          pocketedNow.push({ ball, pocket: p });
          Audio.pocket();
          State.pocketFlash.push({ x: p.x, y: p.y, t: 1.0 });
        }
      });
    });

    return { anyMoving, pocketedNow };
  }

  /** Reflect ball off table cushions */
  function wallCollide(ball) {
    const R = CFG.BALL_R;
    let hit = false;

    if (ball.x - R < FIELD.x) {
      ball.x = FIELD.x + R;
      ball.vx = Math.abs(ball.vx) * CFG.WALL_REST;
      hit = true;
    } else if (ball.x + R > FIELD.x2) {
      ball.x = FIELD.x2 - R;
      ball.vx = -Math.abs(ball.vx) * CFG.WALL_REST;
      hit = true;
    }
    if (ball.y - R < FIELD.y) {
      ball.y = FIELD.y + R;
      ball.vy = Math.abs(ball.vy) * CFG.WALL_REST;
      hit = true;
    } else if (ball.y + R > FIELD.y2) {
      ball.y = FIELD.y2 - R;
      ball.vy = -Math.abs(ball.vy) * CFG.WALL_REST;
      hit = true;
    }
    if (hit) {
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (speed > 0.5) Audio.hitWall(speed);
    }
  }

  /** Elastic collision between two balls */
  function ballCollide(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = CFG.BALL_R * 2;

    if (dist >= minDist || dist < 0.001) return;

    // Track first contact for foul detection
    // One of a/b must be the cue ball (id === 0)
    if (a.id === 0 && !State.cueHitSomething) {
      State.cueHitSomething = true;
      State.firstContactId = b.id;
    } else if (b.id === 0 && !State.cueHitSomething) {
      State.cueHitSomething = true;
      State.firstContactId = a.id;
    }

    // Normalize
    const nx = dx / dist;
    const ny = dy / dist;

    // Overlap resolution
    const overlap = (minDist - dist) / 2;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;

    // Relative velocity along normal
    const dvx = b.vx - a.vx;
    const dvy = b.vy - a.vy;
    const dot = dvx * nx + dvy * ny;

    if (dot >= 0) return; // Already separating

    const impulse = dot * CFG.RESTITUTION;
    a.vx += impulse * nx;
    a.vy += impulse * ny;
    b.vx -= impulse * nx;
    b.vy -= impulse * ny;

    const speed = Math.abs(dot);
    if (speed > 0.3) Audio.hitBall(speed);
  }

  /** Shoot the cue ball with given angle and power */
  function shootCue(angle, power) {
    const cue = State.balls.find(b => b.id === 0);
    if (!cue) return;
    // Reset per-shot contact tracking
    State.firstContactId = null;
    State.cueHitSomething = false;
    const force = power * CFG.MAX_POWER;
    cue.vx = Math.cos(angle) * force;
    cue.vy = Math.sin(angle) * force;
    Audio.hitCue(power);
  }

  /** Get all movable balls' velocity sum — tells us if still rolling */
  function anyMoving(balls) {
    return balls.some(b => !b.pocketed &&
      (Math.abs(b.vx) > CFG.MIN_SPEED || Math.abs(b.vy) > CFG.MIN_SPEED));
  }

  return { step, shootCue, anyMoving, POCKETS };
})();

/* ══════════════════════════════════════════════════════════════
   § 6. RENDERER
══════════════════════════════════════════════════════════════ */
const Renderer = (() => {
  let canvas, ctx;
  let offscreen, offCtx; // for table background caching

  const POCKETS = buildPockets();

  function init(canvasEl) {
    canvas = canvasEl;
    canvas.width  = CFG.TABLE_W;
    canvas.height = CFG.TABLE_H;
    ctx = canvas.getContext('2d');
    buildOffscreenTable();
  }

  /* ── Pre-render the static table into an offscreen canvas ── */
  function buildOffscreenTable() {
    offscreen = document.createElement('canvas');
    offscreen.width  = CFG.TABLE_W;
    offscreen.height = CFG.TABLE_H;
    offCtx = offscreen.getContext('2d');
    drawStaticTable(offCtx);
  }

  function drawStaticTable(c) {
    // ── Outer wood frame ──────────────────────────────────────
    const woodGrad = c.createLinearGradient(0, 0, CFG.TABLE_W, CFG.TABLE_H);
    woodGrad.addColorStop(0,   '#5a3a18');
    woodGrad.addColorStop(0.3, '#7a4e22');
    woodGrad.addColorStop(0.5, '#8a5a28');
    woodGrad.addColorStop(0.7, '#7a4e22');
    woodGrad.addColorStop(1,   '#4a2e10');
    c.fillStyle = woodGrad;
    c.beginPath();
    c.roundRect(0, 0, CFG.TABLE_W, CFG.TABLE_H, 18);
    c.fill();

    // Wood grain lines
    c.save();
    c.globalAlpha = 0.06;
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * CFG.TABLE_W;
      c.strokeStyle = '#000';
      c.lineWidth = Math.random() * 2;
      c.beginPath();
      c.moveTo(x, 0); c.lineTo(x + 20, CFG.TABLE_H);
      c.stroke();
    }
    c.restore();

    // Wood highlight (top edge reflection)
    const hlGrad = c.createLinearGradient(0, 0, 0, CFG.CUSHION);
    hlGrad.addColorStop(0, 'rgba(255,220,120,0.18)');
    hlGrad.addColorStop(1, 'rgba(255,220,120,0)');
    c.fillStyle = hlGrad;
    c.fillRect(0, 0, CFG.TABLE_W, CFG.CUSHION);

    // ── Felt surface ──────────────────────────────────────────
    const feltGrad = c.createRadialGradient(
      CFG.TABLE_W / 2, CFG.TABLE_H / 2, 0,
      CFG.TABLE_W / 2, CFG.TABLE_H / 2, Math.max(CFG.TABLE_W, CFG.TABLE_H) * 0.65
    );
    feltGrad.addColorStop(0,   '#256038');
    feltGrad.addColorStop(0.5, '#1e5030');
    feltGrad.addColorStop(1,   '#163d24');
    c.fillStyle = feltGrad;
    c.fillRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);

    // Felt texture (subtle grid)
    c.save();
    c.globalAlpha = 0.035;
    c.strokeStyle = '#000';
    c.lineWidth = 1;
    for (let x = FIELD.x; x < FIELD.x2; x += 8) {
      c.beginPath(); c.moveTo(x, FIELD.y); c.lineTo(x, FIELD.y2); c.stroke();
    }
    for (let y = FIELD.y; y < FIELD.y2; y += 8) {
      c.beginPath(); c.moveTo(FIELD.x, y); c.lineTo(FIELD.x2, y); c.stroke();
    }
    c.restore();

    // Overhead light bloom on felt
    const lightBloom = c.createRadialGradient(
      CFG.TABLE_W / 2, CFG.TABLE_H / 2, 0,
      CFG.TABLE_W / 2, CFG.TABLE_H / 2, CFG.TABLE_W * 0.4
    );
    lightBloom.addColorStop(0,   'rgba(255,255,220,0.08)');
    lightBloom.addColorStop(0.5, 'rgba(255,255,220,0.02)');
    lightBloom.addColorStop(1,   'rgba(0,0,0,0)');
    c.fillStyle = lightBloom;
    c.fillRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);

    // ── Cushion rails ──────────────────────────────────────────
    drawCushions(c);

    // ── Center line (decorative) ───────────────────────────────
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.06)';
    c.lineWidth = 1;
    c.setLineDash([4, 8]);
    c.beginPath();
    c.moveTo(CFG.TABLE_W / 2, FIELD.y);
    c.lineTo(CFG.TABLE_W / 2, FIELD.y2);
    c.stroke();
    c.setLineDash([]);
    c.restore();

    // Head string (baulk line)
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(FIELD.x + FIELD.w * 0.25, FIELD.y + 4);
    c.lineTo(FIELD.x + FIELD.w * 0.25, FIELD.y2 - 4);
    c.stroke();
    c.restore();

    // Foot spot
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.arc(FIELD.x + FIELD.w * 0.73, FIELD.y + FIELD.h / 2, 3, 0, Math.PI * 2);
    c.fill();

    // Head spot
    c.beginPath();
    c.arc(FIELD.x + FIELD.w * 0.25, FIELD.y + FIELD.h / 2, 3, 0, Math.PI * 2);
    c.fill();

    // ── Pocket holes ───────────────────────────────────────────
    drawPockets(c);
  }

  function drawCushions(c) {
    const cs = CFG.CUSHION;
    // Each rail segment as a trapezoid with gradient
    const railParts = [
      // top
      { points: [[cs,0],[CFG.TABLE_W-cs,0],[CFG.TABLE_W-cs,cs],[cs,cs]], vertical: true },
      // bottom
      { points: [[cs,CFG.TABLE_H-cs],[CFG.TABLE_W-cs,CFG.TABLE_H-cs],[CFG.TABLE_W-cs,CFG.TABLE_H],[cs,CFG.TABLE_H]], vertical: true },
      // left
      { points: [[0,cs],[cs,cs],[cs,CFG.TABLE_H-cs],[0,CFG.TABLE_H-cs]], vertical: false },
      // right
      { points: [[CFG.TABLE_W-cs,cs],[CFG.TABLE_W,cs],[CFG.TABLE_W,CFG.TABLE_H-cs],[CFG.TABLE_W-cs,CFG.TABLE_H-cs]], vertical: false },
    ];

    railParts.forEach(({ points, vertical }) => {
      const grad = vertical
        ? c.createLinearGradient(0, points[0][1], 0, points[2][1])
        : c.createLinearGradient(points[0][0], 0, points[1][0], 0);
      grad.addColorStop(0,   '#2a6040');
      grad.addColorStop(0.4, '#1e5030');
      grad.addColorStop(1,   '#163a22');
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(points[0][0], points[0][1]);
      points.slice(1).forEach(([x, y]) => c.lineTo(x, y));
      c.closePath();
      c.fill();

      // Rail highlight
      c.save();
      c.globalAlpha = 0.12;
      c.strokeStyle = '#7fff90';
      c.lineWidth = 1;
      c.stroke();
      c.restore();
    });
  }

  function drawPockets(c) {
    POCKETS.forEach(p => {
      // Dark hole
      const holeGrad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, CFG.POCKET_R);
      holeGrad.addColorStop(0,   '#050505');
      holeGrad.addColorStop(0.7, '#0a0a0a');
      holeGrad.addColorStop(1,   '#1a1a1a');
      c.fillStyle = holeGrad;
      c.beginPath();
      c.arc(p.x, p.y, CFG.POCKET_R, 0, Math.PI * 2);
      c.fill();

      // Pocket ring
      c.strokeStyle = '#7a5010';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(p.x, p.y, CFG.POCKET_R, 0, Math.PI * 2);
      c.stroke();

      // Inner glow ring
      c.strokeStyle = 'rgba(255,180,50,0.15)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(p.x, p.y, CFG.POCKET_R - 2, 0, Math.PI * 2);
      c.stroke();
    });
  }

  /* ── Draw a single pool ball with gloss effect ────────────── */
  function drawBall(c, ball) {
    if (ball.pocketed) return;

    const { x, y, id } = ball;
    const R = CFG.BALL_R;
    const color = BALL_COLORS[id] || '#888';
    const isStripe = id >= 9 && id <= 15;
    const is8Ball = id === 8;

    c.save();
    c.translate(x, y);
    c.rotate(ball.spin || 0);

    // Drop shadow
    c.save();
    const shadowGrad = c.createRadialGradient(3, 5, 0, 3, 5, R * 1.4);
    shadowGrad.addColorStop(0,   'rgba(0,0,0,0.5)');
    shadowGrad.addColorStop(1,   'rgba(0,0,0,0)');
    c.fillStyle = shadowGrad;
    c.beginPath();
    c.ellipse(3, 5, R * 1.2, R * 0.7, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    // Base ball color
    const baseGrad = c.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R);
    if (is8Ball) {
      baseGrad.addColorStop(0, '#3a3a3a');
      baseGrad.addColorStop(1, '#050505');
    } else {
      baseGrad.addColorStop(0, lightenColor(color, 40));
      baseGrad.addColorStop(0.6, color);
      baseGrad.addColorStop(1, darkenColor(color, 60));
    }
    c.fillStyle = baseGrad;
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.fill();

    // Stripe band for 9-15
    if (isStripe) {
      c.save();
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.clip();
      // White background stripe
      c.fillStyle = '#F5F5F0';
      c.fillRect(-R, -R * 0.55, R * 2, R * 1.1);
      // Color stripe on top of white
      const stripeGrad = c.createLinearGradient(0, -R * 0.45, 0, R * 0.45);
      stripeGrad.addColorStop(0, lightenColor(color, 20));
      stripeGrad.addColorStop(0.5, color);
      stripeGrad.addColorStop(1, darkenColor(color, 30));
      c.fillStyle = stripeGrad;
      c.fillRect(-R, -R * 0.45, R * 2, R * 0.9);
      c.restore();
    }

    // White number circle
    if (id !== 0) {
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.beginPath();
      c.arc(0, 0, R * 0.38, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#111';
      c.font = `bold ${R * 0.55}px Rajdhani, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(id, 0, 1);
    }

    // Glossy highlight (top-left)
    const gloss = c.createRadialGradient(-R * 0.35, -R * 0.38, 0, -R * 0.2, -R * 0.2, R * 0.7);
    gloss.addColorStop(0,   'rgba(255,255,255,0.65)');
    gloss.addColorStop(0.25,'rgba(255,255,255,0.18)');
    gloss.addColorStop(1,   'rgba(255,255,255,0)');
    c.fillStyle = gloss;
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.fill();

    // Small specular dot
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath();
    c.arc(-R * 0.32, -R * 0.35, R * 0.12, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  /* ── Draw aim guideline ───────────────────────────────────── */
  function drawAimGuide(c, cueBall, angle) {
    if (!cueBall || cueBall.pocketed) return;

    const R = CFG.BALL_R;
    // Trace ray from cue ball
    let rx = cueBall.x, ry = cueBall.y;
    const dx = Math.cos(angle), dy = Math.sin(angle);

    // Find first collision point (simplified ray-march)
    let hitBall = null;
    let hitDist = CFG.GUIDE_LEN;
    const step = 3;

    // Check intersection with each ball
    State.balls.forEach(b => {
      if (b.pocketed || b.id === 0) return;
      // Ray-circle intersection
      const bx = b.x - cueBall.x;
      const by = b.y - cueBall.y;
      const tca = bx * dx + by * dy;
      if (tca < 0) return;
      const d2 = bx * bx + by * by - tca * tca;
      const minDist2 = (R * 2) * (R * 2);
      if (d2 > minDist2) return;
      const thc = Math.sqrt(minDist2 - d2);
      const t = tca - thc;
      if (t > 0 && t < hitDist) {
        hitDist = t;
        hitBall = b;
      }
    });

    // Wall check
    [
      // left wall
      { nx: 1, ny: 0, d: FIELD.x + R - cueBall.x },
      // right wall
      { nx: -1, ny: 0, d: cueBall.x - (FIELD.x2 - R) },
      // top wall
      { nx: 0, ny: 1, d: FIELD.y + R - cueBall.y },
      // bottom wall
      { nx: 0, ny: -1, d: cueBall.y - (FIELD.y2 - R) },
    ].forEach(wall => {
      const denom = -(dx * wall.nx + dy * wall.ny);
      if (denom <= 0) return;
      const t = wall.d / denom;
      if (t > 0 && t < hitDist) hitDist = t;
    });

    // Draw dashed aim line
    const endX = cueBall.x + dx * hitDist;
    const endY = cueBall.y + dy * hitDist;

    c.save();
    c.globalAlpha = 0.85;
    c.strokeStyle = 'rgba(249,213,114,0.95)';
    c.lineWidth = 3;
    c.setLineDash([8, 10]);
    c.beginPath();
    c.moveTo(cueBall.x, cueBall.y);
    c.lineTo(endX, endY);
    c.stroke();

    c.strokeStyle = 'rgba(249,213,114,0.55)';
    c.lineWidth = 1.5;
    c.setLineDash([2, 6]);
    c.beginPath();
    c.moveTo(cueBall.x, cueBall.y);
    c.lineTo(endX, endY);
    c.stroke();

    // Ghost cue ball at impact point
    c.globalAlpha = 0.5;
    c.setLineDash([]);
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(endX, endY, R, 0, Math.PI * 2);
    c.stroke();

    // If hitting a ball, show deflection line and predicted travel path
    if (hitBall) {
      const impAngle = Math.atan2(hitBall.y - endY, hitBall.x - endX);
      const deflectStartX = endX + Math.cos(impAngle) * R;
      const deflectStartY = endY + Math.sin(impAngle) * R;
      const deflectLen = 180;
      const deflectEndX = deflectStartX + Math.cos(impAngle) * deflectLen;
      const deflectEndY = deflectStartY + Math.sin(impAngle) * deflectLen;

      // Predicted ball path from object ball
      c.globalAlpha = 0.45;
      c.strokeStyle = 'rgba(255, 175, 60, 0.95)';
      c.lineWidth = 2.5;
      c.setLineDash([8, 6]);
      c.beginPath();
      c.moveTo(deflectStartX, deflectStartY);
      c.lineTo(deflectEndX, deflectEndY);
      c.stroke();

      // Add a softer highlight line behind it
      c.globalAlpha = 0.32;
      c.strokeStyle = 'rgba(255, 215, 110, 0.65)';
      c.lineWidth = 1.2;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(deflectStartX, deflectStartY);
      c.lineTo(deflectEndX, deflectEndY);
      c.stroke();

      // Ghost target ball
      c.globalAlpha = 0.2;
      c.setLineDash([]);
      c.fillStyle = BALL_COLORS[hitBall.id];
      c.beginPath();
      c.arc(deflectStartX, deflectStartY, R, 0, Math.PI * 2);
      c.fill();
    }

    c.restore();
  }

  /* ── Draw cue stick ───────────────────────────────────────── */
  function drawCue(c, cueBall, angle, power) {
    if (!cueBall || cueBall.pocketed) return;

    const R = CFG.BALL_R;
    const pullback = power * 35 + 5; // how far the cue is pulled back
    const cueLen = CFG.CUE_LEN;

    // Start of cue tip (at ball + small gap)
    const tipGap = R + 4 + pullback;
    const tipX = cueBall.x - Math.cos(angle) * tipGap;
    const tipY = cueBall.y - Math.sin(angle) * tipGap;

    // End of cue (butt)
    const buttX = cueBall.x - Math.cos(angle) * (tipGap + cueLen);
    const buttY = cueBall.y - Math.sin(angle) * (tipGap + cueLen);

    c.save();

    // Cue shadow
    c.globalAlpha = 0.25;
    c.strokeStyle = '#000';
    c.lineWidth = 11;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(tipX + 2, tipY + 3);
    c.lineTo(buttX + 2, buttY + 3);
    c.stroke();

    c.globalAlpha = 1;

    // Cue body gradient (tip to butt: thin to thick, light to dark wood)
    const cueGrad = c.createLinearGradient(tipX, tipY, buttX, buttY);
    cueGrad.addColorStop(0,    '#e8d09a'); // tip — light
    cueGrad.addColorStop(0.12, '#c4a85a'); // shaft
    cueGrad.addColorStop(0.45, '#8a5a20'); // middle
    cueGrad.addColorStop(0.7,  '#6a3a10'); // wrap area
    cueGrad.addColorStop(0.85, '#4a2208'); // butt
    cueGrad.addColorStop(1,    '#2a1208');

    // Draw the cue as tapered line
    c.lineCap = 'round';
    // Thin part (shaft)
    c.strokeStyle = cueGrad;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(tipX, tipY);
    c.lineTo(tipX + (buttX - tipX) * 0.5, tipY + (buttY - tipY) * 0.5);
    c.stroke();

    // Thick part (butt)
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(tipX + (buttX - tipX) * 0.5, tipY + (buttY - tipY) * 0.5);
    c.lineTo(buttX, buttY);
    c.stroke();

    // Cue highlight
    c.globalAlpha = 0.25;
    c.strokeStyle = 'rgba(255,240,180,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(tipX - Math.sin(angle) * 1, tipY + Math.cos(angle) * 1);
    c.lineTo(buttX - Math.sin(angle) * 2, buttY + Math.cos(angle) * 2);
    c.stroke();

    // Blue chalk tip
    c.globalAlpha = 1;
    c.fillStyle = '#4a90c8';
    c.beginPath();
    c.arc(tipX, tipY, 3, 0, Math.PI * 2);
    c.fill();

    c.restore();
  }

  /* ── Pocket flash effect ──────────────────────────────────── */
  function drawPocketFlashes(c) {
    State.pocketFlash = State.pocketFlash.filter(f => f.t > 0);
    State.pocketFlash.forEach(f => {
      c.save();
      c.globalAlpha = f.t * 0.6;
      c.fillStyle = `rgba(201,168,76,${f.t})`;
      c.beginPath();
      c.arc(f.x, f.y, CFG.POCKET_R * (2 - f.t), 0, Math.PI * 2);
      c.fill();
      c.restore();
      f.t -= 0.03;
    });
  }

  /* ── Place cue ball indicator ─────────────────────────────── */
  function drawCueBallPlacement(c, mx, my) {
    if (!State.awaitingCueBall) return;
    const R = CFG.BALL_R;
    const valid = isValidCuePlacement(mx, my);
    c.save();
    c.globalAlpha = 0.6;
    c.strokeStyle = valid ? '#2ecc71' : '#e74c3c';
    c.lineWidth = 2;
    c.setLineDash([4, 4]);
    c.beginPath();
    c.arc(mx, my, R, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  /* ── Main render call ─────────────────────────────────────── */
  function render(state, mousePos) {
    if (!ctx) return;
    // Clear
    ctx.clearRect(0, 0, CFG.TABLE_W, CFG.TABLE_H);
    // Draw cached table
    ctx.drawImage(offscreen, 0, 0);

    // Pocket flashes
    drawPocketFlashes(ctx);

    const cueBall = state.balls.find(b => b.id === 0);

    // Aim guide (only when mouse held and not moving)
    if (!state.ballsMoving && !state.awaitingCueBall && state.dragStart && state.dragCurrent && cueBall && !cueBall.pocketed) {
      drawAimGuide(ctx, cueBall, state.aimAngle);
      drawCue(ctx, cueBall, state.aimAngle, state.power);
    } else if (!state.ballsMoving && !state.awaitingCueBall && !state.aiThinking && cueBall && !cueBall.pocketed && mousePos) {
      // Show idle cue following mouse when not dragging
      const angle = Math.atan2(mousePos.y - cueBall.y, mousePos.x - cueBall.x) + Math.PI;
      drawAimGuide(ctx, cueBall, angle + Math.PI);
      drawCue(ctx, cueBall, angle + Math.PI, 0.05);
    }

    // Cue ball placement
    if (state.awaitingCueBall && mousePos) {
      drawCueBallPlacement(ctx, mousePos.x, mousePos.y);
    }

    // Balls (draw non-cue first, then cue on top)
    state.balls.forEach(b => { if (b.id !== 0) drawBall(ctx, b); });
    const cb = state.balls.find(b => b.id === 0);
    if (cb) drawBall(ctx, cb);
  }

  /* ── Color helpers ─────────────────────────────────────────── */
  function lightenColor(hex, amount) {
    return adjustColor(hex, amount);
  }
  function darkenColor(hex, amount) {
    return adjustColor(hex, -amount);
  }
  function adjustColor(hex, amount) {
    const r = Math.min(255, Math.max(0, parseInt(hex.slice(1, 3), 16) + amount));
    const g = Math.min(255, Math.max(0, parseInt(hex.slice(3, 5), 16) + amount));
    const b = Math.min(255, Math.max(0, parseInt(hex.slice(5, 7), 16) + amount));
    return `rgb(${r},${g},${b})`;
  }

  function getCanvas() { return canvas; }
  function getCtx() { return ctx; }

  return { init, render, getCanvas, getCtx };
})();

/* ══════════════════════════════════════════════════════════════
   § 7. GAME RULES ENGINE
══════════════════════════════════════════════════════════════ */
const Rules = (() => {

  /** Evaluate what happened after balls stopped rolling */
  function evaluate(pocketedThisTurn) {
    const cp = State.currentPlayer;
    const op = 1 - cp;

    let foul = false;
    let foulReason = '';
    let switchTurn = true;      // default: turn passes unless player pockets correct ball
    let ballInHand = false;     // opponent gets to place cue ball anywhere

    const cuePocketed   = pocketedThisTurn.some(p => p.ball.id === 0);
    const eightPocketed = pocketedThisTurn.some(p => p.ball.id === 8);
    const otherPocketed = pocketedThisTurn.filter(p => p.ball.id !== 0 && p.ball.id !== 8);

    // Snapshot first-contact info then clear it for next shot
    const firstContact     = State.firstContactId;   // id of ball cue hit first, or null
    const hitAnything      = State.cueHitSomething;
    State.firstContactId   = null;
    State.cueHitSomething  = false;

    // ── Determine current player's assigned type ───────────────
    // (null if not yet assigned — the OPEN TABLE state)
    const cpType = State.playerTypes[cp]; // 'solid' | 'stripe' | null
    const opType = State.playerTypes[op];

    // Helper: is a ball id one of cpType's balls?
    function isCpBall(id) {
      if (!cpType) return id >= 1 && id <= 15 && id !== 8; // open table: any non-8
      return cpType === 'solid' ? (id >= 1 && id <= 7) : (id >= 9 && id <= 15);
    }
    function isOpBall(id) {
      if (!opType) return false;
      return opType === 'solid' ? (id >= 1 && id <= 7) : (id >= 9 && id <= 15);
    }

    // ── OPEN BREAK: 8-ball pocketed on break → re-rack, no loss ─
    // On the very first shot (no types assigned yet, rack just broken):
    if (eightPocketed && !State.typesAssigned && pocketedThisTurn.length >= 1) {
      // Return 8-ball to table (spot it at foot spot) and continue break rules
      const eight = pocketedThisTurn.find(p => p.ball.id === 8).ball;
      eight.pocketed = false;
      eight.x = FIELD.x + FIELD.w * 0.73;
      eight.y = FIELD.y + FIELD.h / 2;
      eight.vx = 0; eight.vy = 0;
      // Remove 8 from pocketedThisTurn for further evaluation
      pocketedThisTurn = pocketedThisTurn.filter(p => p.ball.id !== 8);
      showFoulMessage('8-ball respotted — open table continues');
      // Fall through to handle any other balls pocketed on the break
    }

    // ── 8-ball pocketed (not on break) ────────────────────────
    // Re-check after possible re-spot above
    const eightNowPocketed = pocketedThisTurn.some(p => p.ball.id === 8);
    if (eightNowPocketed) {
      const cpBallsLeft = getBallsOnTable(cp);
      if (cpBallsLeft.length === 0 && !cuePocketed) {
        // Legal win — cleared all own balls then pocketed 8
        endGame(cp, 'Pocketed the 8-ball to win! 🎱');
      } else {
        // Loss: pocketed 8 early, or scratched while pocketing 8
        const reason = cuePocketed
          ? 'Scratched on the 8-ball — opponent wins!'
          : 'Pocketed the 8-ball too early — opponent wins!';
        endGame(op, reason);
      }
      return;
    }

    // ── Foul: cue ball pocketed (scratch) ─────────────────────
    if (cuePocketed) {
      foul = true;
      ballInHand = true;
      foulReason = '⚠ Scratch! Ball in hand for opponent.';
    }

    // ── Foul: cue ball missed everything ──────────────────────
    if (!foul && !hitAnything) {
      foul = true;
      ballInHand = true;
      foulReason = '⚠ Foul! Cue ball missed — ball in hand.';
    }

    // ── Foul: hit the wrong ball first ────────────────────────
    // On open table: hitting the 8-ball first is a foul (must hit 1-7 or 9-15 first)
    // Once types are assigned: must hit own type first
    if (!foul && hitAnything && firstContact !== null) {
      if (!State.typesAssigned) {
        // Open table — hitting 8-ball first is a foul
        if (firstContact === 8) {
          foul = true;
          ballInHand = true;
          foulReason = '⚠ Foul! Hit the 8-ball first on open table — ball in hand.';
        }
      } else {
        // Types assigned — must hit own ball first
        if (!isCpBall(firstContact) && firstContact !== 8) {
          foul = true;
          ballInHand = true;
          foulReason = `⚠ Foul! Hit opponent's ball first — ball in hand.`;
        } else if (firstContact === 8 && getBallsOnTable(cp).length > 0) {
          // Hit 8-ball first when you still have your own balls left
          foul = true;
          ballInHand = true;
          foulReason = '⚠ Foul! Hit the 8-ball first — ball in hand.';
        }
      }
    }

    // ── Foul: pocketed opponent's ball ────────────────────────
    if (!foul && State.typesAssigned) {
      const wrongPocketed = otherPocketed.filter(p => isOpBall(p.ball.id));
      if (wrongPocketed.length > 0) {
        foul = true;
        ballInHand = true;
        foulReason = `⚠ Foul! Pocketed opponent's ball — ball in hand.`;
        // Opponent's balls stay pocketed in their favor — no respotting needed
      }
    }

    // ── Assign ball types on first legal pocket (open table) ──
    // Only assign if no foul, table is open, and a non-8 ball was pocketed
    if (!foul && !State.typesAssigned && otherPocketed.length > 0) {
      const firstId  = otherPocketed[0].ball.id;
      const cpAssign = firstId <= 7 ? 'solid' : 'stripe';
      const opAssign = cpAssign === 'solid' ? 'stripe' : 'solid';
      State.playerTypes[cp] = cpAssign;
      State.playerTypes[op] = opAssign;
      State.typesAssigned = true;
      updateBallTypeUI();
    }

    // ── Continue turn if pocketed correct ball (no foul) ──────
    if (!foul && !cuePocketed && State.typesAssigned && otherPocketed.length > 0) {
      const correctCount = otherPocketed.filter(p => isCpBall(p.ball.id)).length;
      if (correctCount > 0) {
        switchTurn = false; // player gets to shoot again
      }
    }

    // ── On open table, pocketing any ball (no foul) = continue turn
    if (!foul && !cuePocketed && !State.typesAssigned && otherPocketed.length > 0) {
      switchTurn = false;
    }

    // ── Apply foul / turn switch ───────────────────────────────
    if (foul) {
      switchTurn = true; // always switch on foul
    }

    if (switchTurn) {
      State.currentPlayer = op;
    }

    // ── Ball in hand: opponent places cue ball anywhere ────────
    if (foul && ballInHand) {
      State.awaitingCueBall = true;
      State.ballInHandFull  = true;  // can place anywhere (not just behind head string)
      // Restore cue ball to table if it was pocketed
      const cueBall = State.balls.find(b => b.id === 0);
      if (cueBall && cueBall.pocketed) {
        cueBall.pocketed = false;
        cueBall.x = FIELD.x + FIELD.w * 0.25;
        cueBall.y = FIELD.y + FIELD.h / 2;
        cueBall.vx = 0; cueBall.vy = 0;
      }
      updateStatusMsg(`Ball in hand! ${switchTurn ? (State.vsAI && State.currentPlayer === 1 ? 'AI' : `Player ${State.currentPlayer + 1}`) : `Player ${cp + 1}`} — click anywhere to place cue ball.`);
    }

    showFoulMessage(foul ? foulReason : '');
    updateTurnUI();
    updateHUDBallsDisplay();
    State.pocketedThisTurn = [];

    // Trigger AI if it's now AI's turn (AI will handle ball-in-hand placement itself)
    if (State.vsAI && State.currentPlayer === 1) {
      scheduleAIShot();
    }
  }

  /** Get balls belonging to a player still on table */
  function getBallsOnTable(playerIdx) {
    const type = State.playerTypes[playerIdx];
    if (!type) return [];
    return State.balls.filter(b => {
      if (b.pocketed) return false;
      if (type === 'solid')  return b.id >= 1 && b.id <= 7;
      if (type === 'stripe') return b.id >= 9 && b.id <= 15;
      return false;
    });
  }

  function endGame(winner, reason) {
    State.winner = winner;
    State.winReason = reason;
    State.screen = 'gameover';
    showGameOver(winner, reason);
  }

  return { evaluate, getBallsOnTable };
})();

/* ══════════════════════════════════════════════════════════════
   § 8. AI OPPONENT
══════════════════════════════════════════════════════════════ */
const AI = (() => {

  function scheduleShot() {
    if (State.aiTimer) clearTimeout(State.aiTimer);
    State.aiThinking = true;
    updateStatusMsg('🤖 AI is thinking...');

    State.aiTimer = setTimeout(() => {
      // If AI has ball in hand, place it at a sensible position first
      if (State.awaitingCueBall) {
        placeAICueBall();
        State.aiThinking = false;
        // Now schedule the actual shot
        State.aiTimer = setTimeout(() => {
          State.aiThinking = true;
          takeShot();
          State.aiThinking = false;
        }, 600);
        return;
      }
      takeShot();
      State.aiThinking = false;
    }, CFG.AI_THINK_MS + Math.random() * 400);
  }

  /** AI places the cue ball at a reasonable spot when it has ball-in-hand */
  function placeAICueBall() {
    // Smarter placement: compute approach-line positions for possible target balls
    const aiType = State.playerTypes[1];
    let targets = [];
    if (!State.typesAssigned) {
      targets = State.balls.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8);
    } else if (aiType === 'solid') {
      targets = State.balls.filter(b => !b.pocketed && b.id >= 1 && b.id <= 7);
    } else {
      targets = State.balls.filter(b => !b.pocketed && b.id >= 9 && b.id <= 15);
    }

    // If no targets, allow cue placement near head area
    if (targets.length === 0) {
      for (let tries = 0; tries < 100; tries++) {
        const x = FIELD.x + 20 + Math.random() * (FIELD.w - 40);
        const y = FIELD.y + 20 + Math.random() * (FIELD.h - 40);
        if (isValidCuePlacement(x, y)) {
          const cue = State.balls.find(b => b.id === 0);
          if (cue) { cue.x = x; cue.y = y; cue.pocketed = false; cue.vx = 0; cue.vy = 0; }
          State.awaitingCueBall = false; State.ballInHandFull = false; return;
        }
      }
    }

    const POCKETS = Physics.POCKETS;
    const candidates = [];

    targets.forEach(ball => {
      POCKETS.forEach(pocket => {
        // approach vector from ball to pocket
        const vx = pocket.x - ball.x;
        const vy = pocket.y - ball.y;
        const vlen = Math.hypot(vx, vy);
        if (vlen < 1) return;
        const ux = vx / vlen, uy = vy / vlen;
        // desired cue position slightly behind the object ball along approach line
        const gap = CFG.BALL_R * 2 + 6;
        const cx = ball.x - ux * gap;
        const cy = ball.y - uy * gap;
        if (!isValidCuePlacement(cx, cy)) return;

        // Quick obstruction check: ensure line from cue pos to ball centre isn't blocked
        let blocked = false;
        State.balls.forEach(ob => {
          if (ob.pocketed || ob.id === 0 || ob.id === ball.id) return;
          const d = pointToSegmentDistance(ob.x, ob.y, cx, cy, ball.x, ball.y);
          if (d < CFG.BALL_R * 1.9) blocked = true;
        });
        if (blocked) return;

        // Score: distance from head area (prefer near head for easier break-ins) + ball-to-pocket closeness
        const score = Math.hypot(cx - (FIELD.x + FIELD.w * 0.25), cy - (FIELD.y + FIELD.h / 2)) + (Math.hypot(ball.x - pocket.x, ball.y - pocket.y) * 0.6);
        candidates.push({ x: cx, y: cy, score });
      });
    });

    if (candidates.length > 0) {
      // Sort by score ascending
      candidates.sort((a, b) => a.score - b.score);
      let pick = null;
      if (State.aiDifficulty === 'hard') pick = candidates[0];
      else if (State.aiDifficulty === 'medium') pick = candidates[Math.min(2, Math.floor(Math.random() * Math.min(3, candidates.length)))];
      else pick = candidates[Math.floor(Math.random() * candidates.length)];

      if (pick) {
        const cue = State.balls.find(b => b.id === 0);
        if (cue) { cue.x = pick.x; cue.y = pick.y; cue.pocketed = false; cue.vx = 0; cue.vy = 0; }
        State.awaitingCueBall = false; State.ballInHandFull = false; return;
      }
    }

    // Fallback to random valid placement
    for (let tries = 0; tries < 200; tries++) {
      const x = FIELD.x + 20 + Math.random() * (FIELD.w - 40);
      const y = FIELD.y + 20 + Math.random() * (FIELD.h - 40);
      if (isValidCuePlacement(x, y)) {
        const cue = State.balls.find(b => b.id === 0);
        if (cue) { cue.x = x; cue.y = y; cue.pocketed = false; cue.vx = 0; cue.vy = 0; }
        State.awaitingCueBall = false; State.ballInHandFull = false; return;
      }
    }
  }

  function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projx = x1 + t * (x2 - x1);
    const projy = y1 + t * (y2 - y1);
    return Math.hypot(px - projx, py - projy);
  }

  function takeShot() {
    const cueBall = State.balls.find(b => b.id === 0);
    if (!cueBall || cueBall.pocketed) return;

    // Find the best target ball for the AI
    const target = findBestTarget(cueBall);
    if (!target) {
      // No clear shot, play defensive (aim randomly-ish)
      const angle = Math.random() * Math.PI * 2;
      const power = 0.3 + Math.random() * 0.3;
      Physics.shootCue(angle, power);
      endAITurn();
      return;
    }

    // Angle from cue to target
    let angle = Math.atan2(target.y - cueBall.y, target.x - cueBall.x);
    // Add inaccuracy
    const err = (1 - CFG.AI_ACCURACY) * (Math.random() - 0.5) * 0.4;
    angle += err;

    const power = 0.45 + Math.random() * 0.35;
    Physics.shootCue(angle, power);
    endAITurn();
  }

  function findBestTarget(cueBall) {
    const aiType = State.playerTypes[1];
    let candidates = [];

    if (!State.typesAssigned) {
      // Pick any non-8 ball closest to a pocket
      candidates = State.balls.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8);
    } else if (aiType === 'solid') {
      candidates = State.balls.filter(b => !b.pocketed && b.id >= 1 && b.id <= 7);
    } else {
      candidates = State.balls.filter(b => !b.pocketed && b.id >= 9 && b.id <= 15);
    }

    // Also consider the 8-ball if all our balls are cleared
    const myBallsLeft = Rules.getBallsOnTable(1).length;
    if (myBallsLeft === 0) {
      const eight = State.balls.find(b => b.id === 8 && !b.pocketed);
      if (eight) candidates = [eight];
    }

    if (candidates.length === 0) return null;

    // Score each candidate by (proximity to pocket + shot angle clarity)
    const POCKETS = Physics.POCKETS;
    let best = null;
    let bestScore = Infinity;

    candidates.forEach(ball => {
      // Find best pocket for this ball
      POCKETS.forEach(pocket => {
        const ballToPocket = Math.hypot(ball.x - pocket.x, ball.y - pocket.y);
        const cueToball = Math.hypot(ball.x - cueBall.x, ball.y - cueBall.y);
        const score = ballToPocket + cueToball * 0.4;
        if (score < bestScore) {
          bestScore = score;
          best = ball;
        }
      });
    });

    return best;
  }

  function endAITurn() {
    // Turn switching handled by Rules after balls stop
  }

  return { scheduleShot };
})();

/* expose for Rules */
function scheduleAIShot() { AI.scheduleShot(); }

/* ══════════════════════════════════════════════════════════════
   § 9. INPUT HANDLING
══════════════════════════════════════════════════════════════ */
const Input = (() => {
  let canvas;
  let mousePos = { x: 0, y: 0 };

  function init(canvasEl) {
    canvas = canvasEl;

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    // Touch support
    canvas.addEventListener('touchstart', e => { e.preventDefault(); onMouseDown(touchToMouse(e)); }, { passive: false });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); onMouseMove(touchToMouse(e)); }, { passive: false });
    canvas.addEventListener('touchend',   e => { e.preventDefault(); onMouseUp(touchToMouse(e)); }, { passive: false });
  }

  function touchToMouse(e) {
    const t = e.touches[0] || e.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY };
  }

  /** Convert screen coordinates to canvas coordinates */
  function toCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (CFG.TABLE_W / rect.width),
      y: (clientY - rect.top)  * (CFG.TABLE_H / rect.height),
    };
  }

  function onMouseDown(e) {
    if (State.screen !== 'game') return;
    if (State.ballsMoving || State.aiThinking) return;

    const pos = toCanvas(e.clientX, e.clientY);

    // Cue ball placement after scratch
    if (State.awaitingCueBall) {
      // If it's AI's ball-in-hand, don't let the human place it
      if (State.vsAI && State.currentPlayer === 1) return;
      placeCueBall(pos.x, pos.y);
      return;
    }

    if (State.vsAI && State.currentPlayer === 1) return; // Not player's turn

    const cueBall = State.balls.find(b => b.id === 0);
    if (!cueBall || cueBall.pocketed) return;

    State.dragStart   = { x: pos.x, y: pos.y };
    State.dragCurrent = { x: pos.x, y: pos.y };
    State.shooting    = true;

    // Zoom in on canvas while aiming
    canvas.classList.add('aiming');
    updateAimState(pos);
  }

  function onMouseMove(e) {
    const pos = toCanvas(e.clientX, e.clientY);
    mousePos = pos;

    if (!State.shooting) return;
    State.dragCurrent = pos;
    updateAimState(pos);
  }

  function onMouseLeave() {
    // Keep aiming state
  }

  function onMouseUp(e) {
    if (!State.shooting) return;
    canvas.classList.remove('aiming');

    const pos = toCanvas(e.clientX, e.clientY);
    State.dragCurrent = pos;
    updateAimState(pos);

    if (State.power > 0.01) {
      shoot();
    }

    State.shooting    = false;
    State.dragStart   = null;
    State.dragCurrent = null;
    State.power       = 0;
    updatePowerBar(0);
  }

  function updateAimState(currentPos) {
    const cueBall = State.balls.find(b => b.id === 0);
    if (!cueBall) return;

    // The drag direction defines aim: drag AWAY from cue ball = aiming that direction
    // Angle: from current mouse pos to cue ball (we shoot the cue in that direction)
    const angle = Math.atan2(cueBall.y - currentPos.y, cueBall.x - currentPos.x) + Math.PI;
    State.aimAngle = angle;

    // Power = distance dragged, normalized
    if (State.dragStart) {
      const dist = Math.hypot(currentPos.x - State.dragStart.x, currentPos.y - State.dragStart.y);
      State.power = Math.min(1, dist / 120);
      updatePowerBar(State.power);
    }
  }

  function shoot() {
    if (State.vsAI && State.currentPlayer === 1) return;
    Physics.shootCue(State.aimAngle, State.power);
    State.shooting = false;
  }

  function placeCueBall(x, y) {
    if (!isValidCuePlacement(x, y)) return;
    const cue = State.balls.find(b => b.id === 0);
    if (cue) {
      cue.x = x; cue.y = y;
      cue.pocketed = false;
      cue.vx = 0; cue.vy = 0;
    }
    State.awaitingCueBall = false;
    State.ballInHandFull  = false;
    const pName = State.currentPlayer === 0 ? 'Player 1' : (State.vsAI ? 'AI' : 'Player 2');
    updateStatusMsg(`${pName}'s turn — ball placed, take your shot!`);

    if (State.vsAI && State.currentPlayer === 1) scheduleAIShot();
  }

  function getMousePos() { return mousePos; }

  return { init, getMousePos };
})();

/* ══════════════════════════════════════════════════════════════
   § 10. GAME LOOP
══════════════════════════════════════════════════════════════ */
const GameLoop = (() => {
  let rafId = null;
  let lastTime = 0;
  let pocketedAccum = []; // accumulated pocketed balls while rolling

  function start() {
    if (rafId) cancelAnimationFrame(rafId);
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);

    const dt = Math.min((now - lastTime) / 16.67, 3); // cap delta time
    lastTime = now;

    if (State.screen !== 'game') return;

    // Physics step (skip when awaiting cue placement)
    const wasMoving = State.ballsMoving;

    if (State.ballsMoving) {
      const result = Physics.step(State.balls, dt);
      pocketedAccum.push(...result.pocketedNow);

      if (!Physics.anyMoving(State.balls)) {
        State.ballsMoving = false;
        // Evaluate the turn result
        Rules.evaluate(pocketedAccum);
        pocketedAccum = [];
      }
    } else {
      // Check if a shot was just fired (velocity present)
      if (Physics.anyMoving(State.balls)) {
        State.ballsMoving = true;
        pocketedAccum = [];
      }
    }

    // Update status message
    if (!State.ballsMoving && !State.awaitingCueBall && !State.aiThinking) {
      const p = State.currentPlayer === 0 ? 'Player 1' : (State.vsAI ? 'AI' : 'Player 2');
      updateStatusMsg(`${p}'s turn — aim and shoot!`);
    }

    // Render
    Renderer.render(State, State.ballsMoving ? null : Input.getMousePos());
  }

  return { start, stop };
})();

/* ══════════════════════════════════════════════════════════════
   § 11. UI HELPERS
══════════════════════════════════════════════════════════════ */

function updatePowerBar(power) {
  const fill = document.getElementById('powerFill');
  if (fill) fill.style.width = (power * 100) + '%';
}

function updateTurnUI() {
  const ti = document.getElementById('turnIndicator');
  const p1 = document.getElementById('p1Panel');
  const p2 = document.getElementById('p2Panel');
  if (!ti) return;

  const isP1 = State.currentPlayer === 0;
  const name = isP1 ? 'Player 1' : (State.vsAI ? 'AI 🤖' : 'Player 2');
  ti.textContent = `${name}'s Turn`;
  ti.classList.toggle('active', true);

  p1.classList.toggle('active', isP1);
  p2.classList.toggle('active', !isP1);
}

function updateBallTypeUI() {
  const p1t = document.getElementById('p1Type');
  const p2t = document.getElementById('p2Type');
  if (p1t) p1t.textContent = State.playerTypes[0] ? State.playerTypes[0].toUpperCase() : '—';
  if (p2t) p2t.textContent = State.playerTypes[1] ? State.playerTypes[1].toUpperCase() : '—';
  renderHUDBalls();
}

function renderHUDBalls() {
  // Show pocketed balls for each player
  const p1Rack = document.getElementById('p1Balls');
  const p2Rack = document.getElementById('p2BallsRight');
  if (!p1Rack || !p2Rack) return;

  function miniBar(containerEl, playerIdx) {
    containerEl.innerHTML = '';
    const type = State.playerTypes[playerIdx];
    if (!type) return;
    const pocketed = State.balls.filter(b => b.pocketed &&
      (type === 'solid' ? (b.id >= 1 && b.id <= 7) : (b.id >= 9 && b.id <= 15))
    );
    pocketed.forEach(b => {
      const d = document.createElement('div');
      d.className = 'mini-ball';
      d.style.background = BALL_COLORS[b.id];
      containerEl.appendChild(d);
    });
  }

  miniBar(p1Rack, 0);
  miniBar(p2Rack, 1);
}

// Alias used by Rules engine
function updateHUDBallsDisplay() { renderHUDBalls(); }

function showFoulMessage(msg) {
  const el = document.getElementById('foulMsg');
  if (!el) return;
  el.textContent = msg;
  if (msg) setTimeout(() => { el.textContent = ''; }, 3000);
}

function updateStatusMsg(msg) {
  const el = document.getElementById('statusMsg');
  if (el) el.textContent = msg;
}

function showGameOver(winner, reason) {
  document.getElementById('winnerText').textContent =
    `${winner === 0 ? 'Player 1' : (State.vsAI ? 'AI' : 'Player 2')} Wins! 🎱`;
  document.getElementById('gameOverSub').textContent = reason;
  setScreen('gameover');
}

function setScreen(name) {
  State.screen = name;
  document.getElementById('startScreen').classList.toggle('active', name === 'start');
  document.getElementById('gameScreen').classList.toggle('active', name === 'game');
  document.getElementById('gameOverScreen').classList.toggle('active', name === 'gameover');
}

function isValidCuePlacement(x, y) {
  const R = CFG.BALL_R;
  // Must be within the playfield (inside the cushions)
  if (x - R < FIELD.x || x + R > FIELD.x2) return false;
  if (y - R < FIELD.y || y + R > FIELD.y2) return false;
  // Must not overlap any other live ball
  return State.balls.every(b => {
    if (b.pocketed || b.id === 0) return true;
    return Math.hypot(x - b.x, y - b.y) > R * 2.2;
  });
}

/* ══════════════════════════════════════════════════════════════
   § 12. GAME INITIALIZATION
══════════════════════════════════════════════════════════════ */
function initGame(vsAI) {
  State.vsAI = vsAI;
  State.balls = rackBalls();
  State.currentPlayer = 0;
  State.playerTypes = [null, null];
  State.typesAssigned = false;
  State.ballsMoving = false;
  State.shooting = false;
  State.awaitingCueBall = false;
  State.ballInHandFull = false;
  State.winner = null;
  State.winReason = '';
  State.pocketedThisTurn = [];
  State.pocketFlash = [];
  State.aiThinking = false;
  State.firstContactId = null;
  State.cueHitSomething = false;
  if (State.aiTimer) clearTimeout(State.aiTimer);

  // Set AI difficulty from UI (start screen select)
  const diffEl = document.getElementById('aiDifficulty');
  const diff = diffEl ? diffEl.value : 'medium';
  State.aiDifficulty = diff;
  // Difficulty presets
  if (diff === 'easy') {
    CFG.AI_ACCURACY = 0.80;
    CFG.AI_THINK_MS = 1400;
  } else if (diff === 'hard') {
    CFG.AI_ACCURACY = 0.985;
    CFG.AI_THINK_MS = 450;
  } else {
    CFG.AI_ACCURACY = 0.94;
    CFG.AI_THINK_MS = 900;
  }

  // Update player 2 name
  document.getElementById('p2Name').textContent = vsAI ? '🤖 AI' : 'Player 2';

  updateTurnUI();
  updateBallTypeUI();
  showFoulMessage('');
  updateStatusMsg('Player 1 breaks!');

  setScreen('game');
  GameLoop.start();
  Audio.startBGM();
}

/* ══════════════════════════════════════════════════════════════
   § 13. BOOTSTRAP — runs on DOMContentLoaded
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // Init renderer on canvas
  const canvas = document.getElementById('poolCanvas');
  Renderer.init(canvas);
  Input.init(canvas);

  // ── Start Screen buttons ──────────────────────────────────
  document.getElementById('btn2Player').addEventListener('click', () => initGame(false));
  document.getElementById('btnVsAI').addEventListener('click',    () => initGame(true));

  document.getElementById('soundToggle').addEventListener('click', function() {
    const on = Audio.toggleSound();
    this.textContent = on ? '🔊 Sound ON' : '🔇 Sound OFF';
    // Trigger AudioContext on user gesture
    Audio.getCtx();
  });

  // ── Game screen buttons ───────────────────────────────────
  document.getElementById('btnMenu').addEventListener('click', () => {
    GameLoop.stop();
    Audio.stopBGM();
    setScreen('start');
  });

  document.getElementById('btnSoundGame').addEventListener('click', function() {
    const on = Audio.toggleSound();
    this.textContent = on ? '🔊' : '🔇';
  });

  // ── Game Over buttons ─────────────────────────────────────
  document.getElementById('btnPlayAgain').addEventListener('click', () => initGame(State.vsAI));
  document.getElementById('btnMainMenu').addEventListener('click', () => {
    GameLoop.stop();
    Audio.stopBGM();
    setScreen('start');
  });

  // Start on the start screen
  setScreen('start');
});