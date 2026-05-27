// ======================================
// 3D 8 BALL POOL GAME
// ======================================

// ---------- SCENE SETUP ----------

const canvas = document.getElementById("gameCanvas");

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.set(0, 18, 24);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// ---------- LIGHTING ----------

const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambientLight);

const spotlight = new THREE.SpotLight(0xffffff, 2.4);
spotlight.position.set(0, 25, 0);
spotlight.castShadow = true;

spotlight.shadow.mapSize.width = 2048;
spotlight.shadow.mapSize.height = 2048;

scene.add(spotlight);

// ---------- TABLE ----------

const tableGroup = new THREE.Group();
scene.add(tableGroup);

const TABLE_W = 20;
const TABLE_H = 10;

// cloth
const tableGeo = new THREE.BoxGeometry(TABLE_W, 1, TABLE_H);

const tableMat = new THREE.MeshStandardMaterial({
  color: 0x0c6d39,
  roughness: 0.65,
  metalness: 0.1
});

const table = new THREE.Mesh(tableGeo, tableMat);

table.receiveShadow = true;
table.position.y = -0.5;

tableGroup.add(table);

// wood border
const borderGeo = new THREE.BoxGeometry(TABLE_W + 2, 1.6, TABLE_H + 2);

const borderMat = new THREE.MeshStandardMaterial({
  color: 0x4e2f12,
  roughness: 0.5,
  metalness: 0.2
});

const border = new THREE.Mesh(borderGeo, borderMat);

border.position.y = -0.9;
border.receiveShadow = true;

tableGroup.add(border);

// ---------- POCKETS ----------

const pockets = [
  [-10, -5],
  [10, -5],
  [-10, 5],
  [10, 5],
  [0, -5],
  [0, 5]
];

// ---------- BALLS ----------

const BALL_RADIUS = 0.36;

const balls = [];

const ballColors = [
  0xffffff,
  0xf9d71c,
  0x0046ff,
  0xff0000,
  0x7f00ff,
  0xff6600,
  0x009933,
  0x800000,
  0x000000
];

function createBall(number, x, z) {

  const geometry = new THREE.SphereGeometry(BALL_RADIUS, 48, 48);

  const material = new THREE.MeshStandardMaterial({
    color: ballColors[number] || 0xffffff,
    roughness: 0.15,
    metalness: 0.4
  });

  const ball = new THREE.Mesh(geometry, material);

  ball.castShadow = true;

  ball.position.set(x, BALL_RADIUS, z);

  scene.add(ball);

  ball.userData = {
    number,
    velocity: new THREE.Vector3(),
    pocketed: false,
    isCue: number === 0
  };

  balls.push(ball);

  return ball;
}

// cue ball
const cueBall = createBall(0, -6, 0);

// triangle rack
let index = 1;

for (let row = 0; row < 5; row++) {

  for (let col = 0; col <= row; col++) {

    createBall(
      index,
      5 + row * 0.7,
      (col - row / 2) * 0.8
    );

    index++;

    if (index > 8) break;
  }

  if (index > 8) break;
}

// ---------- AIM LINE ----------

const lineMaterial = new THREE.LineBasicMaterial({
  color: 0xffffff
});

const lineGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(),
  new THREE.Vector3()
]);

const aimLine = new THREE.Line(lineGeometry, lineMaterial);

scene.add(aimLine);

// ---------- GAME STATE ----------

let currentPlayer = 1;

let dragging = false;

let dragStart = new THREE.Vector2();
let dragEnd = new THREE.Vector2();

let canShoot = true;

let soundEnabled = true;

const powerBar = document.getElementById("powerBar");
const turnText = document.getElementById("turnText");
const ballTypeText = document.getElementById("ballTypeText");

// ---------- AUDIO ----------

const hitSound = new Audio(
  "https://assets.mixkit.co/active_storage/sfx/212/212-preview.mp3"
);

const pocketSound = new Audio(
  "https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3"
);

const collideSound = new Audio(
  "https://assets.mixkit.co/active_storage/sfx/2073/2073-preview.mp3"
);

const bgMusic = new Audio(
  "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3"
);

bgMusic.loop = true;
bgMusic.volume = 0.25;

// ---------- START ----------

document.getElementById("startBtn").onclick = () => {

  document.getElementById("startScreen").classList.remove("active");

  bgMusic.play();
};

document.getElementById("soundBtn").onclick = () => {

  soundEnabled = !soundEnabled;

  document.getElementById("soundBtn").innerText =
    soundEnabled ? "🔊 SOUND: ON" : "🔇 SOUND: OFF";

  bgMusic.muted = !soundEnabled;
};

// ---------- CONTROLS ----------

window.addEventListener("mousedown", e => {

  if (!canShoot) return;

  dragging = true;

  dragStart.set(e.clientX, e.clientY);
});

window.addEventListener("mousemove", e => {

  if (!dragging) return;

  dragEnd.set(e.clientX, e.clientY);

  const dx = dragEnd.x - dragStart.x;
  const dy = dragEnd.y - dragStart.y;

  const power = Math.min(Math.sqrt(dx * dx + dy * dy) / 8, 100);

  powerBar.style.width = power + "%";

  // aim line
  const direction = new THREE.Vector3(
    -dx * 0.03,
    0,
    -dy * 0.03
  );

  const points = [
    cueBall.position.clone(),
    cueBall.position.clone().add(direction)
  ];

  aimLine.geometry.setFromPoints(points);

  // camera zoom while aiming
  camera.position.lerp(
    new THREE.Vector3(0, 14, 18),
    0.04
  );
});

window.addEventListener("mouseup", e => {

  if (!dragging) return;

  dragging = false;

  const dx = dragEnd.x - dragStart.x;
  const dy = dragEnd.y - dragStart.y;

  const power = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.015, 3.2);

  cueBall.userData.velocity.set(
    -dx * 0.02 * power,
    0,
    -dy * 0.02 * power
  );

  if (soundEnabled) {
    hitSound.currentTime = 0;
    hitSound.play();
  }

  canShoot = false;

  powerBar.style.width = "0%";

  aimLine.geometry.setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3()
  ]);
});

// ---------- PHYSICS ----------

function updatePhysics() {

  let moving = false;

  balls.forEach(ball => {

    if (ball.userData.pocketed) return;

    // movement
    ball.position.add(ball.userData.velocity);

    // friction
    ball.userData.velocity.multiplyScalar(0.985);

    // stop tiny movement
    if (ball.userData.velocity.length() < 0.002) {
      ball.userData.velocity.set(0, 0, 0);
    }

    if (ball.userData.velocity.length() > 0) {
      moving = true;
    }

    // spin rotation
    ball.rotation.z += ball.userData.velocity.x * 2;
    ball.rotation.x += ball.userData.velocity.z * 2;

    // walls
    if (
      ball.position.x > 9.3 ||
      ball.position.x < -9.3
    ) {
      ball.userData.velocity.x *= -1;
    }

    if (
      ball.position.z > 4.3 ||
      ball.position.z < -4.3
    ) {
      ball.userData.velocity.z *= -1;
    }

    // pockets
    pockets.forEach(pocket => {

      const dist = Math.hypot(
        ball.position.x - pocket[0],
        ball.position.z - pocket[1]
      );

      if (dist < 0.55) {

        ball.userData.pocketed = true;

        ball.visible = false;

        if (soundEnabled) {
          pocketSound.currentTime = 0;
          pocketSound.play();
        }

        // scratch
        if (ball.userData.isCue) {

          setTimeout(() => {

            cueBall.visible = true;

            cueBall.position.set(-6, BALL_RADIUS, 0);

            cueBall.userData.velocity.set(0,0,0);

            cueBall.userData.pocketed = false;

          }, 1200);
        }

        // 8 ball logic
        if (ball.userData.number === 8) {

          document.getElementById("gameOver").classList.add("active");

          document.getElementById("winnerText").innerText =
            `Player ${currentPlayer} Wins!`;
        }
      }
    });
  });

  // collisions
  for (let i = 0; i < balls.length; i++) {

    for (let j = i + 1; j < balls.length; j++) {

      const a = balls[i];
      const b = balls[j];

      if (
        a.userData.pocketed ||
        b.userData.pocketed
      ) continue;

      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;

      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < BALL_RADIUS * 2) {

        const angle = Math.atan2(dz, dx);

        const targetX =
          a.position.x + Math.cos(angle) * BALL_RADIUS * 2;

        const targetZ =
          a.position.z + Math.sin(angle) * BALL_RADIUS * 2;

        const ax = (targetX - b.position.x) * 0.09;
        const az = (targetZ - b.position.z) * 0.09;

        a.userData.velocity.x -= ax;
        a.userData.velocity.z -= az;

        b.userData.velocity.x += ax;
        b.userData.velocity.z += az;

        if (soundEnabled) {
          collideSound.currentTime = 0;
          collideSound.play();
        }
      }
    }
  }

  // turn switch
  if (!moving && !canShoot) {

    canShoot = true;

    currentPlayer = currentPlayer === 1 ? 2 : 1;

    turnText.innerText = `Player ${currentPlayer} Turn`;

    // reset camera
    camera.position.lerp(
      new THREE.Vector3(0, 18, 24),
      1
    );
  }
}

// ---------- ANIMATION LOOP ----------

function animate() {

  requestAnimationFrame(animate);

  updatePhysics();

  renderer.render(scene, camera);
}

animate();

// ---------- RESIZE ----------

window.addEventListener("resize", () => {

  camera.aspect = window.innerWidth / window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});