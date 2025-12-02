// main.js

// three_scene.js / charts.js 에서 window에 올려둔 전역 함수 사용
const socket = io();
const statusEl = document.getElementById("socket-status");
const statusJsonEl = document.getElementById("status-json");
const joystickCanvas = document.getElementById("joystick-canvas");
const joystickCtx = joystickCanvas.getContext("2d");

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls;
}

function drawJoystick(nx, ny, ballX, ballY) {
  if (!joystickCtx) return;

  const w = joystickCanvas.width;
  const h = joystickCanvas.height;

  joystickCtx.clearRect(0, 0, w, h);

  // 외곽 박스
  joystickCtx.strokeStyle = "#999";
  joystickCtx.lineWidth = 2;
  joystickCtx.strokeRect(10, 10, w - 20, h - 20);

  // 중심선
  const cx = w / 2;
  const cy = h / 2;
  joystickCtx.beginPath();
  joystickCtx.moveTo(cx, 10);
  joystickCtx.lineTo(cx, h - 10);
  joystickCtx.moveTo(10, cy);
  joystickCtx.lineTo(w - 10, cy);
  joystickCtx.strokeStyle = "#ccc";
  joystickCtx.lineWidth = 1;
  joystickCtx.stroke();

  // -1~1 → 캔버스 좌표 변환 함수
  const innerW = w - 20;
  const innerH = h - 20;
  const mapX = (val) => 10 + ((val + 1) / 2) * innerW;
  const mapY = (val) => 10 + ((1 - (val + 1) / 2)) * innerH;

  // 조이스틱 위치 (빨간 점)
  const jx = mapX(nx);
  const jy = mapY(ny);
  joystickCtx.beginPath();
  joystickCtx.arc(jx, jy, 6, 0, Math.PI * 2);
  joystickCtx.fillStyle = "#e53935"; // 빨간색
  joystickCtx.fill();

  // 공(real_pose) 위치 (초록색 원)
  if (typeof ballX === "number" && typeof ballY === "number") {
    const bx = mapX(ballX);
    const by = mapY(ballY);

    joystickCtx.beginPath();
    joystickCtx.arc(bx, by, 6, 0, Math.PI * 2);
    joystickCtx.strokeStyle = "#2e7d32"; // 초록색 선
    joystickCtx.lineWidth = 2;
    joystickCtx.stroke();
    joystickCtx.fillStyle = "rgba(46, 125, 50, 0.3)";
    joystickCtx.fill();
  }
}

// Socket.IO 이벤트
socket.on("connect", () => {
  console.log("Socket connected:", socket.id);
  setStatus("Connected", "status-connected");
});

socket.on("disconnect", () => {
  console.log("Socket disconnected");
  setStatus("Disconnected", "status-disconnected");
});

// MQTT status 수신 → 시각화
socket.on("status_update", (data) => {
  console.log("MQTT status:", data);

  if (statusJsonEl) {
    statusJsonEl.textContent = JSON.stringify(data, null, 2);
  }

  // platform_pose
  const pose = data.platform_pose || {};
  const roll = Number(pose.roll) || 0;
  const pitch = Number(pose.pitch) || 0;
  if (window.updatePlatformPose) {
    window.updatePlatformPose(roll, pitch);
  }

  // joystick
  const joy = data.joystick_val || {};
  const jx = Number(joy.x) || 0;
  const jy = Number(joy.y) || 0;

  // real_pose (공)
  const real = data.real_pose || {};
  const bx = Number(real.x);
  const by = Number(real.y);

  drawJoystick(jx, jy, bx, by);

  // error
  const err = data.error || {};
  const ex = Number(err.x) || 0;
  const ey = Number(err.y) || 0;

  // time: status에서 넘어오는 값 (초 단위라고 가정)
  let t = Number(data.time);
  if (!t || Number.isNaN(t)) {
    // 만약 time이 없다면, fallback으로 현재 시각(초) 사용
    t = Date.now() / 1000;
  }

  if (window.addErrorPoint) {
    window.addErrorPoint(t, ex, ey);
  }
});


// 초기화
window.addEventListener("DOMContentLoaded", () => {
  if (window.initPlatformScene) {
    window.initPlatformScene();
  }

  const chartCanvas = document.getElementById("error-chart");
  if (chartCanvas && window.initErrorChart) {
    const ctx = chartCanvas.getContext("2d");
    window.initErrorChart(ctx);
  }

  // 초깃값: 조이스틱 (0,0), 공 (0,0)
  drawJoystick(0, 0, 0, 0);
});

// ===== PID UI =====

// 슬라이더 요소
const kpSlider = document.getElementById("kp-slider");
const kiSlider = document.getElementById("ki-slider");
const kdSlider = document.getElementById("kd-slider");

const kpValue = document.getElementById("kp-value");
const kiValue = document.getElementById("ki-value");
const kdValue = document.getElementById("kd-value");

const targetX = document.getElementById("target-x");
const targetY = document.getElementById("target-y");
const pidApplyBtn = document.getElementById("pid-apply-btn");

// 슬라이더 값 표시 업데이트
kpSlider.addEventListener("input", () => kpValue.textContent = Number(kpSlider.value).toFixed(2));
kiSlider.addEventListener("input", () => kiValue.textContent = Number(kiSlider.value).toFixed(2));
kdSlider.addEventListener("input", () => kdValue.textContent = Number(kdSlider.value).toFixed(2));

// Apply 버튼 → SocketIO send
pidApplyBtn.addEventListener("click", () => {
  const payload = {
    PID_const: {
      Kp: Number(kpSlider.value),
      Ki: Number(kiSlider.value),
      Kd: Number(kdSlider.value),
    },
    time: Date.now() / 1000,        // 서버 시간 보낼 때
    ctr_mode: "manual",
    target_pose: {
      x: Number(targetX.value),
      y: Number(targetY.value),
    }
  };

  console.log("PID APPLY:", payload);
  socket.emit("set_pid", payload);
});
