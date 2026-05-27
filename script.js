/* ═══════════════════════════════════════════════════════════════════════
   8-BALL POOL — COMPLETE GAME ENGINE
   Modules: Audio | Physics | Renderer | Game Logic | UI | Input
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════
   § AUDIO MODULE
   Web Audio API — generates all sounds procedurally
   (no external files needed)
══════════════════════════════════════════════════════ */
const Audio = (() => {
  let ctx = null;
  let muted = false;
  let musicGain = null;
  let musicOsc = null;
  let musicStarted = false;

  // Lazy-init AudioContext on first user gesture
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Master gain
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.07;
    musicGain.connect(ctx.destination);
  }

  // ── Ambient background music (simple generative) ──
  function startMusic() {
    if (!ctx || musicStarted || muted) return;
    musicStarted = true;
    const notes = [130.8, 146.8, 164.8, 196, 220, 246.9];
    let step = 0;
    function playNote() {
      if (!musicStarted || muted) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[step % notes.length] * (Math.random() > .5 ? 2 : 1);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(.06, ctx.currentTime + .3);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.5);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 2.5);
      step++;
      setTimeout(playNote, 1200 + Math.random() * 800);
    }
    playNote();
  }

  function stopMusic() { musicStarted = false; }

  // ── Sound Effects ──────────────────────────────────

  // Cue strike — sharp thwack
  function playCueHit(power) {
    if (!ctx || muted) return;
    const vol = 0.15 + power * 0.55;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.04));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    // Low-pass to make it woody
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800 + power * 600;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  // Ball-ball collision — clack
  function playCollision(speed) {
    if (!ctx || muted) return;
    const vol = Math.min(0.6, speed * 0.015);
    if (vol < 0.03) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200 + speed * 15, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.08);
  }

  // Ball pocketed — satisfying thunk + swoosh
  function playPocket() {
    if (!ctx || muted) return;
    // Thunk
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.06));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    // Swoosh
    const osc = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc.frequency.setValueAtTime(600, ctx.currentTime + 0.05);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.25);
    g2.gain.setValueAtTime(0.15, ctx.currentTime + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(g2);
    g2.connect(ctx.destination);
    osc.start(ctx.currentTime + 0.05);
    osc.stop(ctx.currentTime + 0.3);
  }

  // Cushion bounce
  function playRail() {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.12);
  }

  // Win fanfare
  function playWin() {
    if (!ctx || muted) return;
    const melody = [523.25, 659.25, 783.99, 1046.5];
    melody.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.18;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.5);
    });
  }

  function toggleMute() {
    muted = !muted;
    if (muted) stopMusic();
    else { startMusic(); }
    return muted;
  }

  function isMuted() { return muted; }

  return { init, startMusic, stopMusic, playCueHit, playCollision, playPocket, playRail, toggleMute, isMuted };
})();


/* ══════════════════════════════════════════════════════
   § CONSTANTS & CONFIGURATION
══════════════════════════════════════════════════════ */
const CFG = {
  BALL_RADIUS: 14,        // px (will scale with canvas)
  FRICTION:    0.985,     // rolling friction per frame
  MIN_SPEED:   0.08,      // speed below which ball stops
  MAX_SHOT_POWER: 22,     // max initial velocity magnitude
  CUE_DRAG_SCALE: 0.18,   // maps drag distance → power
  POCKET_RADIUS: 19,      // px
  RAIL_BOUNCE:  0.72,     // energy kept on rail bounce
  BALL_BOUNCE:  0.88,     // energy kept on ball collision
};

// Ball colours — classic pool set
const BALL_COLORS = {
  1:  { solid: true,  color: '#f5d800', stripe: null },
  2:  { solid: true,  color: '#1a44c2', stripe: null },
  3:  { solid: true,  color: '#d42020', stripe: null },
  4:  { solid: true,  color: '#6b1fa0', stripe: null },
  5:  { solid: true,  color: '#e87020', stripe: null },
  6:  { solid: true,  color: '#1a8c3a', stripe: null },
  7:  { solid: true,  color: '#8b1a1a', stripe: null },
  8:  { solid: true,  color: '#111111', stripe: null },
  9:  { solid: false, color: '#f5d800', stripe: true },
  10: { solid: false, color: '#1a44c2', stripe: true },
  11: { solid: false, color: '#d42020', stripe: true },
  12: { solid: false, color: '#6b1fa0', stripe: true },
  13: { solid: false, color: '#e87020', stripe: true },
  14: { solid: false, color: '#1a8c3a', stripe: true },
  15: { solid: false, color: '#8b1a1a', stripe: true },
};


/* ══════════════════════════════════════════════════════
   § MATH UTILITIES
══════════════════════════════════════════════════════ */
const Vec = {
  add:  (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub:  (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  scale:(v, s) => ({ x: v.x * s,   y: v.y * s }),
  dot:  (a, b) => a.x * b.x + a.y * b.y,
  len:  (v)    => Math.sqrt(v.x * v.x + v.y * v.y),
  norm: (v)    => { const l = Vec.len(v); return l ? Vec.scale(v, 1/l) : {x:0,y:0}; },
  dist: (a, b) => Vec.len(Vec.sub(a, b)),
};


/* ══════════════════════════════════════════════════════
   § PHYSICS ENGINE
   Handles: ball movement, collisions, pocketing
══════════════════════════════════════════════════════ */
const Physics = (() => {
  // Called once per frame — updates all ball positions
  function step(balls, table) {
    const pocketed = [];

    balls.forEach(ball => {
      if (ball.pocketed) return;

      // Apply velocity
      ball.x += ball.vx;
      ball.y += ball.vy;

      // Spin/angular momentum (visual only)
      ball.spin += Vec.len({ x: ball.vx, y: ball.vy }) * 0.08;

      // Apply friction
      ball.vx *= CFG.FRICTION;
      ball.vy *= CFG.FRICTION;

      // Stop micro-drift
      if (Math.abs(ball.vx) < CFG.MIN_SPEED) ball.vx = 0;
      if (Math.abs(ball.vy) < CFG.MIN_SPEED) ball.vy = 0;

      // Rail collisions
      const r = CFG.BALL_RADIUS;
      if (ball.x - r < table.left) {
        ball.x = table.left + r;
        ball.vx = Math.abs(ball.vx) * CFG.RAIL_BOUNCE;
        Audio.playRail();
      }
      if (ball.x + r > table.right) {
        ball.x = table.right - r;
        ball.vx = -Math.abs(ball.vx) * CFG.RAIL_BOUNCE;
        Audio.playRail();
      }
      if (ball.y - r < table.top) {
        ball.y = table.top + r;
        ball.vy = Math.abs(ball.vy) * CFG.RAIL_BOUNCE;
        Audio.playRail();
      }
      if (ball.y + r > table.bottom) {
        ball.y = table.bottom - r;
        ball.vy = -Math.abs(ball.vy) * CFG.RAIL_BOUNCE;
        Audio.playRail();
      }
    });

    // Ball-ball collisions (O(n²) — fine for 16 balls)
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        if (a.pocketed || b.pocketed) continue;
        resolveCollision(a, b);
      }
    }

    // Pocket detection
    table.pockets.forEach(pocket => {
      balls.forEach(ball => {
        if (ball.pocketed) return;
        if (Vec.dist(ball, pocket) < CFG.POCKET_RADIUS) {
          ball.pocketed = true;
          ball.vx = 0; ball.vy = 0;
          pocketed.push(ball);
          Audio.playPocket();
        }
      });
    });

    return pocketed;
  }

  // Elastic collision between two balls
  function resolveCollision(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = CFG.BALL_RADIUS * 2;

    if (dist >= minDist || dist === 0) return;

    // Separate overlapping balls
    const overlap = (minDist - dist) / 2;
    const nx = dx / dist;
    const ny = dy / dist;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;

    // Exchange velocity components along collision normal
    const dvx = b.vx - a.vx;
    const dvy = b.vy - a.vy;
    const dot = dvx * nx + dvy * ny;
    if (dot > 0) return; // Already separating

    const impulse = dot * CFG.BALL_BOUNCE;
    a.vx += impulse * nx;
    a.vy += impulse * ny;
    b.vx -= impulse * nx;
    b.vy -= impulse * ny;

    const speed = Vec.len({ x: dvx, y: dvy });
    Audio.playCollision(speed);
  }

  // Check if all balls have stopped moving
  function isAtRest(balls) {
    return balls.every(b => b.pocketed || (Math.abs(b.vx) < CFG.MIN_SPEED && Math.abs(b.vy) < CFG.MIN_SPEED));
  }

  return { step, isAtRest };
})();


/* ══════════════════════════════════════════════════════
   § RENDERER
   Canvas 2D drawing — table, balls, cue, guidelines
══════════════════════════════════════════════════════ */
const Renderer = (() => {

  let canvas, ctx;
  // Camera zoom state for aiming effect
  const cam = { zoom: 1, targetZoom: 1, ox: 0, oy: 0, targetOx: 0, targetOy: 0 };

  function init(c) {
    canvas = c;
    ctx = c.getContext('2d');
  }

  // ── Camera helpers ─────────────────────────────────
  function updateCamera(aimActive, cueBall) {
    cam.targetZoom = aimActive ? 1.18 : 1;
    cam.targetOx   = aimActive ? cueBall.x * (cam.targetZoom - 1) * -0.5 : 0;
    cam.targetOy   = aimActive ? cueBall.y * (cam.targetZoom - 1) * -0.5 : 0;
    cam.zoom += (cam.targetZoom - cam.zoom) * 0.07;
    cam.ox   += (cam.targetOx   - cam.ox)   * 0.07;
    cam.oy   += (cam.targetOy   - cam.oy)   * 0.07;
  }

  // ── Main draw call ─────────────────────────────────
  function draw(state) {
    const { table, balls, aim, cueState } = state;
    const W = canvas.width, H = canvas.height;

    updateCamera(aim.dragging, balls[0]);

    ctx.clearRect(0, 0, W, H);

    // Apply camera transform
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-W / 2 + cam.ox, -H / 2 + cam.oy);

    drawRoom(W, H);
    drawTable(table);
    drawGuidelines(balls, aim, table);
    drawBalls(balls);
    if (aim.dragging || cueState.visible) drawCue(balls[0], aim, cueState);

    ctx.restore();
  }

  // ── Room / background ──────────────────────────────
  function drawRoom(W, H) {
    const grd = ctx.createRadialGradient(W/2, H/2, H*0.1, W/2, H*0.4, H*0.85);
    grd.addColorStop(0, '#1a1f14');
    grd.addColorStop(0.5, '#0e1008');
    grd.addColorStop(1, '#05060a');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // Overhead light halo
    const light = ctx.createRadialGradient(W/2, H*0.35, 10, W/2, H*0.35, H*0.55);
    light.addColorStop(0, 'rgba(255,240,200,.09)');
    light.addColorStop(1, 'transparent');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Table ──────────────────────────────────────────
  function drawTable(table) {
    const { left, top, right, bottom, railW } = table;
    const rl = left - railW, rt = top - railW;
    const rw = (right - left) + railW * 2;
    const rh = (bottom - top) + railW * 2;
    const radius = railW * 0.9;

    // Outer wood shadow
    ctx.shadowColor = 'rgba(0,0,0,.8)';
    ctx.shadowBlur = 40;

    // Wood rail body
    const woodGrad = ctx.createLinearGradient(rl, rt, rl + rw, rt + rh);
    woodGrad.addColorStop(0, '#6b3c18');
    woodGrad.addColorStop(0.3, '#8a4f22');
    woodGrad.addColorStop(0.7, '#5c3317');
    woodGrad.addColorStop(1, '#3d2010');
    roundRect(rl, rt, rw, rh, radius, woodGrad);

    ctx.shadowBlur = 0;

    // Wood grain lines
    ctx.save();
    ctx.beginPath();
    roundRectPath(rl, rt, rw, rh, radius);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.moveTo(rl + i * (rw / 20), rt);
      ctx.lineTo(rl + i * (rw / 20) + rh * 0.1, rt + rh);
      ctx.stroke();
    }
    // Highlight on top edge
    ctx.strokeStyle = 'rgba(255,200,120,.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rl + radius, rt + 2);
    ctx.lineTo(rl + rw - radius, rt + 2);
    ctx.stroke();
    ctx.restore();

    // Felt surface
    const feltGrad = ctx.createRadialGradient(
      (left + right) / 2, (top + bottom) / 2, 20,
      (left + right) / 2, (top + bottom) / 2, (right - left) * 0.7
    );
    feltGrad.addColorStop(0, '#1f8040');
    feltGrad.addColorStop(0.6, '#1a6b3c');
    feltGrad.addColorStop(1, '#134f2d');
    ctx.fillStyle = feltGrad;
    ctx.fillRect(left, top, right - left, bottom - top);

    // Felt texture (subtle noise pattern)
    ctx.save();
    ctx.globalAlpha = 0.04;
    for (let y = top; y < bottom; y += 4) {
      for (let x = left; x < right; x += 4) {
        if (Math.random() > .5) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Center line & spot
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo((left + right) / 2, top + 10);
    ctx.lineTo((left + right) / 2, bottom - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath();
    ctx.arc((left + right) / 2, (top + bottom) / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // "D" baulk line & semicircle
    const baulkX = left + (right - left) * 0.22;
    const dRadius = (bottom - top) * 0.14;
    ctx.strokeStyle = 'rgba(255,255,255,.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(baulkX, top + 8);
    ctx.lineTo(baulkX, bottom - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(baulkX, (top + bottom) / 2, dRadius, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pockets
    table.pockets.forEach(p => drawPocket(p));
  }

  // Single pocket
  function drawPocket(p) {
    // Outer dark ring
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(p.x, p.y, CFG.POCKET_RADIUS + 4, 0, Math.PI * 2);
    ctx.fill();

    // Inner void
    const pg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, CFG.POCKET_RADIUS);
    pg.addColorStop(0, '#000');
    pg.addColorStop(0.7, '#0a0a0a');
    pg.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(p.x, p.y, CFG.POCKET_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Rim highlight
    ctx.strokeStyle = 'rgba(255,200,100,.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, CFG.POCKET_RADIUS + 1, Math.PI, Math.PI * 1.7);
    ctx.stroke();
  }

  // ── Aim guidelines ─────────────────────────────────
  function drawGuidelines(balls, aim, table) {
    if (!aim.dragging && !aim.showLine) return;
    const cue = balls[0];
    if (!cue || cue.pocketed) return;

    const angle = aim.angle;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    // Trace the cue ball path up to 2 reflections
    let x = cue.x, y = cue.y;
    let vx = dx, vy = dy;
    const { left, top, right, bottom } = table;
    const r = CFG.BALL_RADIUS;

    // Check first ball hit
    let hitBall = null;
    let hitT = Infinity;
    balls.forEach(b => {
      if (b === cue || b.pocketed) return;
      const t = rayCircleIntersect(x, y, vx, vy, b.x, b.y, r * 2);
      if (t !== null && t > 0 && t < hitT) {
        hitT = t;
        hitBall = b;
      }
    });

    // Draw dotted guideline to first obstacle or wall
    const maxLen = Math.hypot(right - left, bottom - top);
    const endT = Math.min(hitT, maxLen);

    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(0,220,180,.4)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + vx * endT, y + vy * endT);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Deflected ball path (ghost ball)
    if (hitBall) {
      const hx = x + vx * hitT;
      const hy = y + vy * hitT;

      // Ghost circle at impact point
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Direction arrow on target ball
      const nx = (hitBall.x - hx) / (r * 2);
      const ny = (hitBall.y - hy) / (r * 2);
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(255,200,80,.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hitBall.x, hitBall.y);
      ctx.lineTo(hitBall.x + nx * 60, hitBall.y + ny * 60);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // Ray-circle intersection helper
  function rayCircleIntersect(ox, oy, dx, dy, cx, cy, r) {
    const fx = ox - cx, fy = oy - cy;
    const a = dx*dx + dy*dy;
    const b = 2 * (fx*dx + fy*dy);
    const c = fx*fx + fy*fy - r*r;
    const disc = b*b - 4*a*c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t > 1 ? t : null;
  }

  // ── Balls ──────────────────────────────────────────
  function drawBalls(balls) {
    // Draw shadows first
    balls.forEach(ball => {
      if (ball.pocketed) return;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath();
      ctx.ellipse(ball.x + 3, ball.y + 4, CFG.BALL_RADIUS, CFG.BALL_RADIUS * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw each ball
    balls.forEach(ball => {
      if (ball.pocketed) return;
      drawBall(ball);
    });
  }

  // Draw a single ball with glossy 3D effect
  function drawBall(ball) {
    const r = CFG.BALL_RADIUS;
    const { x, y, number } = ball;

    ctx.save();
    ctx.translate(x, y);

    if (number === 0) {
      // ── Cue ball ──
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.45, '#f0ece4');
      grad.addColorStop(1, '#c8c0b4');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const info = BALL_COLORS[number];
      const color = info.color;

      if (info.solid) {
        // ── Solid ball ──
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r);
        grad.addColorStop(0, lightenColor(color, 60));
        grad.addColorStop(0.4, color);
        grad.addColorStop(1, darkenColor(color, 50));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // ── Stripe ball — white base + colour stripe ──
        const base = ctx.createRadialGradient(-r*0.3, -r*0.35, r*0.05, 0, 0, r);
        base.addColorStop(0, '#fff');
        base.addColorStop(0.5, '#f0ece4');
        base.addColorStop(1, '#c0b8b0');
        ctx.fillStyle = base;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Stripe clip
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();
        const sg = ctx.createLinearGradient(0, -r * 0.45, 0, r * 0.45);
        sg.addColorStop(0, lightenColor(color, 40));
        sg.addColorStop(0.5, color);
        sg.addColorStop(1, darkenColor(color, 30));
        ctx.fillStyle = sg;
        ctx.fillRect(-r, -r * 0.45, r * 2, r * 0.9);
        ctx.restore();
      }

      // Number label
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fill();
      ctx.fillStyle = number === 8 ? '#fff' : '#1a1a1a';
      ctx.font = `bold ${r * 0.5}px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(number, 0, 0.5);
      ctx.restore();
    }

    // Gloss highlight
    const gloss = ctx.createRadialGradient(-r * 0.3, -r * 0.42, 0, -r * 0.1, -r * 0.25, r * 0.65);
    gloss.addColorStop(0, 'rgba(255,255,255,.55)');
    gloss.addColorStop(0.5, 'rgba(255,255,255,.1)');
    gloss.addColorStop(1, 'transparent');
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Cue Stick ──────────────────────────────────────
  function drawCue(cueBall, aim, cueState) {
    if (!cueBall || cueBall.pocketed) return;

    const angle = aim.angle;
    const power = aim.power; // 0..1

    // Offset cue from ball based on drag distance (pull-back animation)
    const pullback = 10 + power * 60;
    const tipX = cueBall.x - Math.cos(angle) * (CFG.BALL_RADIUS + 4 + pullback * 0.1);
    const tipY = cueBall.y - Math.sin(angle) * (CFG.BALL_RADIUS + 4 + pullback * 0.1);
    const cueLen = 240;
    const tailX = tipX - Math.cos(angle) * cueLen;
    const tailY = tipY - Math.sin(angle) * cueLen;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;

    // Cue body gradient (tapered stick)
    const grad = ctx.createLinearGradient(tipX, tipY, tailX, tailY);
    grad.addColorStop(0,   '#f0d090');  // tip — lighter maple
    grad.addColorStop(0.3, '#c8922a');  // shaft
    grad.addColorStop(0.7, '#7a4520');  // butt
    grad.addColorStop(1,   '#3d2010');  // grip

    ctx.lineCap = 'round';

    // Taper: draw as thin-to-thick using multiple segments
    for (let i = 0; i <= 20; i++) {
      const t0 = i / 20;
      const t1 = (i + 1) / 20;
      const w = 1.5 + t0 * 6.5;
      ctx.strokeStyle = grad;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(tipX + (tailX - tipX) * t0, tipY + (tailY - tipY) * t0);
      ctx.lineTo(tipX + (tailX - tipX) * t1, tipY + (tailY - tipY) * t1);
      ctx.stroke();
    }

    // Ferrule (white ring near tip)
    ctx.fillStyle = '#e8e0d0';
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#bbb';
    ctx.shadowBlur = 0;
    const ferX = tipX + Math.cos(angle) * (-1) * (-20);
    const ferY = tipY + Math.sin(angle) * (-1) * (-20);
    ctx.save();
    ctx.translate(tipX - Math.cos(angle) * 18, tipY - Math.sin(angle) * 18);
    ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.rect(-2, -3, 4, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Wrap bands on butt
    [0.72, 0.76, 0.80].forEach(t => {
      const bx = tipX + (tailX - tipX) * t;
      const by = tipY + (tailY - tipY) * t;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(angle + Math.PI / 2);
      ctx.strokeStyle = 'rgba(0,0,0,.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(5, 0);
      ctx.stroke();
      ctx.restore();
    });

    ctx.restore();
  }

  // ── Colour utilities ───────────────────────────────
  function lightenColor(hex, amt) {
    const r = Math.min(255, parseInt(hex.slice(1,3),16) + amt);
    const g = Math.min(255, parseInt(hex.slice(3,5),16) + amt);
    const b = Math.min(255, parseInt(hex.slice(5,7),16) + amt);
    return `rgb(${r},${g},${b})`;
  }
  function darkenColor(hex, amt) {
    const r = Math.max(0, parseInt(hex.slice(1,3),16) - amt);
    const g = Math.max(0, parseInt(hex.slice(3,5),16) - amt);
    const b = Math.max(0, parseInt(hex.slice(5,7),16) - amt);
    return `rgb(${r},${g},${b})`;
  }

  // ── roundRect helpers ──────────────────────────────
  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  function roundRect(x, y, w, h, r, fill) {
    roundRectPath(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  return { init, draw, resize };
})();


/* ══════════════════════════════════════════════════════
   § GAME STATE & LOGIC
   Manages turns, rules, win/lose, ball rack
══════════════════════════════════════════════════════ */
const Game = (() => {

  let state = {};

  // ── Table geometry (recalculated on resize) ────────
  function makeTable(W, H) {
    const railW = Math.min(W, H) * 0.045;
    // Table is 2:1 ratio, centred, with slight downward offset
    const tW = Math.min(W * 0.82, H * 1.6);
    const tH = tW * 0.5;
    const left   = (W - tW) / 2;
    const top    = (H - tH) / 2 + H * 0.02;
    const right  = left + tW;
    const bottom = top  + tH;
    const mx = (left + right) / 2;
    const my = (top + bottom) / 2;

    const pockets = [
      { x: left,  y: top    },
      { x: mx,    y: top    },
      { x: right, y: top    },
      { x: left,  y: bottom },
      { x: mx,    y: bottom },
      { x: right, y: bottom },
    ];

    return { left, top, right, bottom, railW, pockets, tW, tH };
  }

  // ── Ball factory ───────────────────────────────────
  function makeBall(number, x, y) {
    return { number, x, y, vx: 0, vy: 0, pocketed: false, spin: 0 };
  }

  // ── Standard triangle rack ─────────────────────────
  function rackBalls(table) {
    const r = CFG.BALL_RADIUS;
    const { left, right, top, bottom } = table;
    // Foot spot: 3/4 down the table
    const footX = left + (right - left) * 0.75;
    const footY = (top + bottom) / 2;
    const spacing = r * 2 + 0.3;

    // Standard 8-ball rack order
    const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    // Ensure 8 is in middle (row 2, pos 1)  and corners are one solid + one stripe
    const rackOrder = [1, 9, 7, 12, 4, 14, 2, 8, 10, 6, 15, 3, 11, 13, 5];

    const positions = [];
    let idx = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        positions.push({
          x: footX + row * spacing * Math.cos(0) - col * spacing * 0.5 * 2 / 2,
          y: footY + col * spacing - row * spacing * 0.5,
        });
      }
    }

    // Re-derive: standard triangle
    const balls = [];
    let ballIdx = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const bx = footX + row * spacing;
        const by = footY + (col - row / 2) * spacing;
        balls.push(makeBall(rackOrder[ballIdx++], bx, by));
      }
    }
    return balls;
  }

  // ── Initialise / reset game ────────────────────────
  function init(canvas) {
    const W = canvas.width, H = canvas.height;
    const table = makeTable(W, H);
    const { left, right, top, bottom } = table;

    // Cue ball starts on the left quarter
    const cueBallX = left + (right - left) * 0.22;
    const cueBallY = (top + bottom) / 2;
    const cueBall = makeBall(0, cueBallX, cueBallY);

    const objectBalls = rackBalls(table);
    const balls = [cueBall, ...objectBalls];

    state = {
      table,
      balls,
      currentPlayer: 0,           // 0 or 1
      playerTypes: [null, null],   // 'solid' | 'stripe' | null
      playerScores: [0, 0],
      pottedThisTurn: [],
      shooting: false,             // true while balls are moving
      gameOver: false,
      winner: -1,
      winReason: '',
      foulPending: false,
      scratchPending: false,
      aim: {
        dragging: false,
        angle: 0,
        power: 0,
        startX: 0,
        startY: 0,
        showLine: false,
      },
      cueState: { visible: true },
    };

    return state;
  }

  // ── Recalculate table on window resize ────────────
  function resize(canvas) {
    if (!state.table) return;
    const W = canvas.width, H = canvas.height;
    const oldT = state.table;
    const newT = makeTable(W, H);
    // Remap ball positions proportionally
    const sx = (newT.right - newT.left) / (oldT.right - oldT.left);
    const sy = (newT.bottom - newT.top) / (oldT.bottom - oldT.top);
    state.balls.forEach(b => {
      b.x = newT.left + (b.x - oldT.left) * sx;
      b.y = newT.top  + (b.y - oldT.top)  * sy;
    });
    state.table = newT;
  }

  // ── Shoot the cue ball ─────────────────────────────
  function shoot(angle, power) {
    const cue = state.balls[0];
    if (!cue || cue.pocketed || state.shooting || state.gameOver) return;
    const speed = power * CFG.MAX_SHOT_POWER;
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
    state.shooting = true;
    state.pottedThisTurn = [];
    state.foulPending = false;
    state.scratchPending = false;
    Audio.playCueHit(power);
  }

  // ── Per-frame physics update ───────────────────────
  function update() {
    if (!state.shooting) return;

    const pocketed = Physics.step(state.balls, state.table);

    // Handle balls potted this frame
    pocketed.forEach(ball => {
      if (ball.number === 0) {
        // Cue ball scratched
        state.scratchPending = true;
      } else {
        state.pottedThisTurn.push(ball);
      }
    });

    // Check if all balls at rest
    if (Physics.isAtRest(state.balls)) {
      state.shooting = false;
      endTurn();
    }
  }

  // ── End of turn logic ──────────────────────────────
  function endTurn() {
    const cur = state.currentPlayer;
    const other = 1 - cur;
    const potted = state.pottedThisTurn;
    let foul = false;
    let changeTurn = true;

    // === Scratch (cue ball pocketed) ===
    if (state.scratchPending) {
      foul = true;
      // Respawn cue ball in D area
      respawnCueBall();
    }

    // === 8-ball rules ===
    const eight = potted.find(b => b.number === 8);
    if (eight) {
      const { playerTypes } = state;
      const myType = playerTypes[cur];
      // Player must have cleared all their balls to legally pot the 8
      const myBalls = state.balls.filter(b => !b.pocketed && b.number !== 8 && b.number !== 0);
      const mySolids = myBalls.filter(b => BALL_COLORS[b.number].solid);
      const myStripes = myBalls.filter(b => !BALL_COLORS[b.number].solid);

      const myGroupCleared =
        (myType === 'solid'  && mySolids.length === 0) ||
        (myType === 'stripe' && myStripes.length === 0) ||
        myType === null;

      if (myGroupCleared && !foul) {
        endGame(cur, 'Sank the 8-ball!');
      } else {
        endGame(other, foul ? 'Opponent scratched on the 8-ball!' : 'Potted 8-ball early!');
      }
      return;
    }

    // === Assign ball types on first legal pot ===
    const legalPotted = potted.filter(b => b.number !== 0 && b.number !== 8);
    if (state.playerTypes[0] === null && legalPotted.length > 0 && !foul) {
      const firstType = BALL_COLORS[legalPotted[0].number].solid ? 'solid' : 'stripe';
      state.playerTypes[cur]   = firstType;
      state.playerTypes[other] = firstType === 'solid' ? 'stripe' : 'solid';
    }

    // === Score potted balls ===
    legalPotted.forEach(ball => {
      const type = BALL_COLORS[ball.number].solid ? 'solid' : 'stripe';
      const owner = state.playerTypes[0] === type ? 0 : 1;
      if (owner === cur && !foul) {
        state.playerScores[cur]++;
      }
    });

    // === Continue turn if potted own balls (no foul) ===
    if (!foul && legalPotted.length > 0) {
      // Check if potted correct type or if types not yet assigned
      const cur_type = state.playerTypes[cur];
      const pottedCorrect = legalPotted.some(b => {
        const bt = BALL_COLORS[b.number].solid ? 'solid' : 'stripe';
        return cur_type === null || bt === cur_type;
      });
      if (pottedCorrect) changeTurn = false;
    }

    if (foul) {
      state.foulPending = true;
      changeTurn = true;
    }

    if (changeTurn) {
      state.currentPlayer = other;
    }

    // Respawn cue if it was pocketed
    if (state.scratchPending) {
      state.scratchPending = false;
    }
  }

  // ── Respawn cue ball (after scratch) ──────────────
  function respawnCueBall() {
    const { left, right, top, bottom } = state.table;
    const cue = state.balls[0];
    cue.pocketed = false;
    cue.vx = 0; cue.vy = 0;
    // Place in baulk area (D)
    cue.x = left + (right - left) * 0.22 + (Math.random() - .5) * 40;
    cue.y = (top + bottom) / 2 + (Math.random() - .5) * 30;
    // Make sure not overlapping any ball
    state.balls.forEach(b => {
      if (b === cue || b.pocketed) return;
      while (Vec.dist(cue, b) < CFG.BALL_RADIUS * 2.2) {
        cue.x += 5;
      }
    });
  }

  // ── End game ───────────────────────────────────────
  function endGame(winner, reason) {
    state.gameOver = true;
    state.winner = winner;
    state.winReason = reason;
    Audio.playWin();
  }

  function getState() { return state; }

  return { init, resize, shoot, update, getState, respawnCueBall };
})();


/* ══════════════════════════════════════════════════════
   § UI MODULE
   Updates DOM elements from game state
══════════════════════════════════════════════════════ */
const UI = (() => {
  const $ = id => document.getElementById(id);

  const els = {
    startScreen:    $('startScreen'),
    gameOverScreen: $('gameOverScreen'),
    gameUI:         $('gameUI'),
    startBtn:       $('startBtn'),
    howToBtn:       $('howToBtn'),
    howtoPanel:     $('howtoPanel'),
    playAgainBtn:   $('playAgainBtn'),
    mainMenuBtn:    $('mainMenuBtn'),
    soundToggleStart: $('soundToggleStart'),
    soundToggleGame:  $('soundToggleGame'),
    p1Panel:    $('p1Panel'),
    p2Panel:    $('p2Panel'),
    p1Type:     $('p1Type'),
    p2Type:     $('p2Type'),
    p1Rack:     $('p1Rack'),
    p2Rack:     $('p2Rack'),
    p1Score:    $('p1Score'),
    p2Score:    $('p2Score'),
    turnIndicator: $('turnIndicator'),
    foulMsg:       $('foulMsg'),
    powerWrap:     $('powerWrap'),
    powerFill:     $('powerFill'),
    winnerTitle:   $('winnerTitle'),
    winnerReason:  $('winnerReason'),
    finalScores:   $('finalScores'),
    shootHint:     $('shootHint'),
  };

  function showScreen(name) {
    ['startScreen','gameOverScreen'].forEach(id => {
      const el = $(id);
      el.classList.remove('active');
    });
    if (name) $(name).classList.add('active');
    els.gameUI.classList.toggle('hidden', name !== null);
  }

  function showGame() {
    els.startScreen.classList.remove('active');
    els.gameOverScreen.classList.remove('active');
    els.gameUI.classList.remove('hidden');
  }

  // ── Ball rack display ──────────────────────────────
  function makeRackBalls(playerIdx, state) {
    const { playerTypes, balls } = state;
    const type = playerTypes[playerIdx];
    const rack = playerIdx === 0 ? els.p1Rack : els.p2Rack;
    rack.innerHTML = '';

    if (!type) return;

    // Get all balls of player's type
    const myNumbers = Object.entries(BALL_COLORS)
      .filter(([n, info]) => {
        return type === 'solid' ? info.solid : !info.solid;
      })
      .map(([n]) => parseInt(n));

    myNumbers.forEach(num => {
      const div = document.createElement('div');
      div.className = 'rack-ball';
      div.style.background = BALL_COLORS[num].color;
      const ball = balls.find(b => b.number === num);
      if (ball && ball.pocketed) div.classList.add('potted');
      rack.appendChild(div);
    });
  }

  // ── Update HUD ─────────────────────────────────────
  function update(state) {
    if (!state || state.gameOver) return;

    const { currentPlayer, playerTypes, playerScores, foulPending, aim, shooting } = state;

    // Active player highlight
    els.p1Panel.classList.toggle('active', currentPlayer === 0 && !shooting);
    els.p2Panel.classList.toggle('active', currentPlayer === 1 && !shooting);

    // Turn label
    const names = ['PLAYER 1', 'PLAYER 2'];
    els.turnIndicator.textContent = shooting
      ? '...'
      : `${names[currentPlayer]}'S TURN`;

    // Foul message
    if (foulPending) {
      els.foulMsg.textContent = '⚠ FOUL — FREE PLACEMENT';
      setTimeout(() => { els.foulMsg.textContent = ''; }, 3000);
      state.foulPending = false;
    }

    // Types
    const typeLabel = t => t === 'solid' ? '● SOLIDS' : t === 'stripe' ? '◑ STRIPES' : '—';
    els.p1Type.textContent = typeLabel(playerTypes[0]);
    els.p2Type.textContent = typeLabel(playerTypes[1]);

    // Scores
    els.p1Score.textContent = playerScores[0];
    els.p2Score.textContent = playerScores[1];

    // Racks
    makeRackBalls(0, state);
    makeRackBalls(1, state);

    // Power bar
    const showPower = aim.dragging;
    els.powerWrap.classList.toggle('visible', showPower);
    if (showPower) {
      const pct = Math.round(aim.power * 100);
      els.powerFill.style.height = pct + '%';
      const hue = 120 - aim.power * 120;
      els.powerFill.style.background = `hsl(${hue},90%,55%)`;
    }
  }

  function showGameOver(state) {
    const names = ['Player 1', 'Player 2'];
    els.winnerTitle.textContent = `${names[state.winner].toUpperCase()} WINS!`;
    els.winnerReason.textContent = state.winReason;
    els.finalScores.innerHTML =
      `<span>P1: ${state.playerScores[0]} balls</span>` +
      `<span>P2: ${state.playerScores[1]} balls</span>`;
    showScreen('gameOverScreen');
  }

  function updateSoundButton(muted) {
    const label = muted ? '🔇 SOUND OFF' : '🔊 SOUND ON';
    els.soundToggleStart.innerHTML = `<span>${muted ? '🔇' : '🔊'}</span><span class="sound-label">${muted ? 'SOUND OFF' : 'SOUND ON'}</span>`;
    els.soundToggleGame.textContent = muted ? '🔇' : '🔊';
    els.soundToggleStart.classList.toggle('muted', muted);
    els.soundToggleGame.classList.toggle('muted', muted);
  }

  return { els, showScreen, showGame, update, showGameOver, updateSoundButton };
})();


/* ══════════════════════════════════════════════════════
   § INPUT MODULE
   Mouse / touch handling for aim & shoot
══════════════════════════════════════════════════════ */
const Input = (() => {

  let canvas;
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;

  function init(c) {
    canvas = c;
    canvas.addEventListener('mousedown',  onDown);
    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('mouseup',    onUp);
    canvas.addEventListener('touchstart', e => onDown(e.touches[0]), { passive: true });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchend',   e => onUp(e.changedTouches[0]));
  }

  // Convert page coords → canvas coords
  function toCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  function onDown(e) {
    const state = Game.getState();
    if (!state || state.shooting || state.gameOver) return;
    const cue = state.balls[0];
    if (!cue || cue.pocketed) return;

    const pos = toCanvas(e);
    isDragging = true;
    dragStartX = pos.x;
    dragStartY = pos.y;

    // Initial angle from cue ball to click position
    state.aim.angle    = Math.atan2(pos.y - cue.y, pos.x - cue.x) + Math.PI;
    state.aim.dragging = true;
    state.aim.power    = 0;
    state.aim.showLine = true;
  }

  function onMove(e) {
    if (!isDragging) return;
    const state = Game.getState();
    if (!state) return;
    const cue = state.balls[0];
    const pos = toCanvas(e);

    // Angle: from cue ball toward initial click, then use drag displacement for power
    const angle = Math.atan2(dragStartY - cue.y, dragStartX - cue.x);
    state.aim.angle = angle;

    // Power based on drag distance away from start
    const dragDist = Math.hypot(pos.x - dragStartX, pos.y - dragStartY);
    state.aim.power = Math.min(1, dragDist * CFG.CUE_DRAG_SCALE / 80);
  }

  function onUp(e) {
    if (!isDragging) return;
    isDragging = false;
    const state = Game.getState();
    if (!state) return;
    if (state.aim.dragging && state.aim.power > 0.02) {
      Game.shoot(state.aim.angle, state.aim.power);
    }
    state.aim.dragging = false;
    state.aim.power    = 0;
    state.aim.showLine = false;
  }

  return { init };
})();


/* ══════════════════════════════════════════════════════
   § MAIN LOOP & BOOTSTRAP
══════════════════════════════════════════════════════ */
(function main() {
  const canvas = document.getElementById('poolCanvas');

  // ── Resize handler ─────────────────────────────────
  function resize() {
    Renderer.resize();
    if (Game.getState() && Game.getState().table) {
      Game.resize(canvas);
    }
  }

  Renderer.init(canvas);
  Input.init(canvas);
  resize();
  window.addEventListener('resize', resize);

  // ── Sound toggle buttons ───────────────────────────
  UI.els.soundToggleStart.addEventListener('click', () => {
    Audio.init();
    const muted = Audio.toggleMute();
    UI.updateSoundButton(muted);
  });
  UI.els.soundToggleGame.addEventListener('click', () => {
    const muted = Audio.toggleMute();
    UI.updateSoundButton(muted);
  });

  // ── Start button ───────────────────────────────────
  UI.els.startBtn.addEventListener('click', () => {
    Audio.init();
    Audio.startMusic();
    Game.init(canvas);
    UI.showGame();
  });

  // ── How to play toggle ─────────────────────────────
  UI.els.howToBtn.addEventListener('click', () => {
    UI.els.howtoPanel.classList.toggle('show');
    UI.els.howToBtn.textContent = UI.els.howtoPanel.classList.contains('show') ? 'HIDE HELP' : 'HOW TO PLAY';
  });

  // ── Play again ─────────────────────────────────────
  UI.els.playAgainBtn.addEventListener('click', () => {
    Game.init(canvas);
    UI.showGame();
  });

  // ── Main menu ──────────────────────────────────────
  UI.els.mainMenuBtn.addEventListener('click', () => {
    UI.showScreen('startScreen');
    Audio.stopMusic();
  });

  // ── Show start screen ──────────────────────────────
  UI.showScreen('startScreen');

  // ── Game Loop ──────────────────────────────────────
  function loop() {
    const state = Game.getState();

    if (state) {
      // Run physics + logic if game is in progress
      if (!state.gameOver) {
        Game.update();
        UI.update(state);
      }

      // Detect transition to game over (first time)
      if (state.gameOver && !state._shownOver) {
        state._shownOver = true;
        setTimeout(() => UI.showGameOver(state), 900);
      }

      Renderer.draw(state);
    } else {
      // Idle — draw dark background before game starts
      const ctx2d = canvas.getContext('2d');
      ctx2d.fillStyle = '#08090c';
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

})();