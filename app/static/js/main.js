// main.js

// ================================
// 1. 기본 설정 & DOM 참조
// ================================

// three_scene.js / charts.js 에서 window에 올려둔 전역 함수 사용
const socket = io();

// 상태 표시
const statusEl = document.getElementById("socket-status");
const statusJsonEl = document.getElementById("status-json");
const deviceIdEl = document.getElementById("device-id-label");

// Joystick
const joystickCanvas = document.getElementById("joystick-canvas");
const joystickCtx = joystickCanvas ? joystickCanvas.getContext("2d") : null;
const joyXValEl = document.getElementById("joy-x-val");
const joyYValEl = document.getElementById("joy-y-val");

// Target plane
const targetCanvas = document.getElementById("target-canvas");
const targetCtx = targetCanvas ? targetCanvas.getContext("2d") : null;
const fieldSizeLabelEl = document.getElementById("field-size-label");
const ballXValEl = document.getElementById("ball-x-val");
const ballYValEl = document.getElementById("ball-y-val");
const tarXValEl = document.getElementById("tar-x-val");
const tarYValEl = document.getElementById("tar-y-val");

// Platform pose numeric
const platformRollEl = document.getElementById("platform-roll-value");
const platformPitchEl = document.getElementById("platform-pitch-value");

// PID UI
const kpXSlider = document.getElementById("kp-x-slider");
const kiXSlider = document.getElementById("ki-x-slider");
const kdXSlider = document.getElementById("kd-x-slider");
const kpYSlider = document.getElementById("kp-y-slider");
const kiYSlider = document.getElementById("ki-y-slider");
const kdYSlider = document.getElementById("kd-y-slider");
const kpXValue = document.getElementById("kp-x-value");
const kiXValue = document.getElementById("ki-x-value");
const kdXValue = document.getElementById("kd-x-value");
const kpYValue = document.getElementById("kp-y-value");
const kiYValue = document.getElementById("ki-y-value");
const kdYValue = document.getElementById("kd-y-value");
const targetX = document.getElementById("target-x");
const targetY = document.getElementById("target-y");
const pidApplyBtn = document.getElementById("pid-apply-btn");

// Target control buttons
const targetCenterBtn = document.getElementById("target-center-btn");
const targetUpBtn = document.getElementById("target-up-btn");
const targetDownBtn = document.getElementById("target-down-btn");
const targetLeftBtn = document.getElementById("target-left-btn");
const targetRightBtn = document.getElementById("target-right-btn");
const targetCenterPadBtn = document.getElementById("target-center-pad-btn");

// Target plane 실제 크기 (hello에서 초기화, 단위: mm)
let fieldWidth = null;
let fieldHeight = null;

// 방향키 한 번 클릭할 때 이동량 (단위: 실제 좌표)
const TARGET_STEP = 5.0;

// 캔버스가 차지할 최대 픽셀 크기
const TARGET_CANVAS_MAX_W = 250;
const TARGET_CANVAS_MAX_H = 250;

// ================================
// 2. 헬퍼 함수들
// ================================

function setStatus(text, cls) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = cls;
}

function drawJoystick(nx, ny) {
  if (!joystickCtx || !joystickCanvas) return;

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

  // -1~1 → 캔버스 좌표
  const innerW = w - 20;
  const innerH = h - 20;
  const mapX = (val) => 10 + ((val + 1) / 2) * innerW;
  const mapY = (val) => 10 + ((1 - (val + 1) / 2)) * innerH;

  const px = mapX(nx);
  const py = mapY(ny);

  joystickCtx.beginPath();
  joystickCtx.arc(px, py, 6, 0, Math.PI * 2);
  joystickCtx.fillStyle = "#e53935"; // 빨간색
  joystickCtx.fill();

  if (joyXValEl) joyXValEl.textContent = nx.toFixed(2);
  if (joyYValEl) joyYValEl.textContent = ny.toFixed(2);
}

function resizeTargetCanvas() {
  if (!targetCanvas || !fieldWidth || !fieldHeight) return;

  const scale = Math.min(
    TARGET_CANVAS_MAX_W / fieldWidth,
    TARGET_CANVAS_MAX_H / fieldHeight
  );

  const newW = Math.round(fieldWidth * scale);
  const newH = Math.round(fieldHeight * scale);

  targetCanvas.width = newW;
  targetCanvas.height = newH;
  targetCanvas.style.width = newW + "px";
  targetCanvas.style.height = newH + "px";

  drawTargetPlane(0, 0);
}

function drawTargetPlane(ballX, ballY, tarX, tarY) {
  if (!targetCtx || !targetCanvas) return;

  const w = targetCanvas.width;
  const h = targetCanvas.height;

  targetCtx.clearRect(0, 0, w, h);

  if (!fieldWidth || !fieldHeight) {
    targetCtx.fillStyle = "#999";
    targetCtx.font = "12px sans-serif";
    targetCtx.fillText("waiting for field_size from hello...", 10, 20);
    return;
  }

  const margin = 10;
  const innerW = w - margin * 2;
  const innerH = h - margin * 2;

  // 바깥 경계
  targetCtx.strokeStyle = "#999";
  targetCtx.lineWidth = 2;
  targetCtx.strokeRect(margin, margin, innerW, innerH);

  // 중심선 (0,0)
  const cx = margin + innerW / 2;
  const cy = margin + innerH / 2;
  targetCtx.beginPath();
  targetCtx.moveTo(cx, margin);
  targetCtx.lineTo(cx, margin + innerH);
  targetCtx.moveTo(margin, cy);
  targetCtx.lineTo(margin + innerW, cy);
  targetCtx.strokeStyle = "#ccc";
  targetCtx.lineWidth = 1;
  targetCtx.stroke();

  // 좌표 변환 함수
  const toCanvas = (x, y) => {
    const nx = x / fieldWidth + 0.5;      // 0~1
    const ny = -y / fieldHeight + 0.5;    // 0~1 (y는 반전)
    const px = margin + nx * innerW;
    const py = margin + ny * innerH;
    return { px, py };
  };

  // ------------------------------
  // 1) real_pose (초록색 원)
  // ------------------------------
  if (typeof ballX === "number" && typeof ballY === "number") {
    const b = toCanvas(ballX, ballY);
    targetCtx.beginPath();
    targetCtx.arc(b.px, b.py, 6, 0, Math.PI * 2);
    targetCtx.fillStyle = "#d32f2f";
    targetCtx.fill();

    if (ballXValEl) ballXValEl.textContent = ballX.toFixed(2);
    if (ballYValEl) ballYValEl.textContent = ballY.toFixed(2);
  }

  // ------------------------------
  // 2) target_pose (빨간 X 표시)
  // ------------------------------
  if (typeof tarX === "number" && typeof tarY === "number") {
    const b = toCanvas(tarX, tarY);
    targetCtx.beginPath();
    targetCtx.arc(b.px, b.py, 10, 0, Math.PI * 2);
    targetCtx.strokeStyle = "#2e7d32";
    targetCtx.lineWidth = 2;
    targetCtx.stroke();
    targetCtx.fillStyle = "rgba(46, 125, 50, 0.3)";
    targetCtx.fill();

    if (tarXValEl) ballXValEl.textContent = ballX.toFixed(2);
    if (tarYValEl) ballYValEl.textContent = ballY.toFixed(2);
  }
}

function clampTarget(x, y) {
  if (fieldWidth) {
    const halfW = fieldWidth / 2;
    x = Math.max(-halfW, Math.min(halfW, x));
  }
  if (fieldHeight) {
    const halfH = fieldHeight / 2;
    y = Math.max(-halfH, Math.min(halfH, y));
  }
  return { x, y };
}

function setTarget(x, y) {
  if (!targetX || !targetY) return;
  const c = clampTarget(x, y);
  targetX.value = c.x.toFixed(2);
  targetY.value = c.y.toFixed(2);
}

function adjustTarget(dx, dy) {
  if (!targetX || !targetY) return;

  let x = parseFloat(targetX.value);
  let y = parseFloat(targetY.value);

  if (Number.isNaN(x)) x = 0;
  if (Number.isNaN(y)) y = 0;

  x += dx;
  y += dy;

  setTarget(x, y);
}

// ================================
// 3. Socket.IO 이벤트
// ================================

socket.on("connect", () => {
  console.log("Socket connected:", socket.id);
  setStatus("Connected", "status-connected");
});

socket.on("disconnect", () => {
  console.log("Socket disconnected");
  setStatus("Disconnected", "status-disconnected");
});

// ESP hello → 웹 초기화

socket.on("device_hello", (data) => {
  console.log("DEVICE HELLO:", data);

  const pid = data.pid_const || {};
  const pose = data.platform_pose || {};
  const field = data.field_size || {};

  // PID 슬라이더 초기값
  if (kpXSlider && typeof pid.kp_x !== "undefined") {
    kpXSlider.value = pid.kp_x;
    kpXValue.textContent = Number(pid.kp_x).toFixed(2);
  }
  if (kiXSlider && typeof pid.ki_x !== "undefined") {
    kiXSlider.value = pid.ki_x;
    kiXValue.textContent = Number(pid.ki_x).toFixed(2);
  }
  if (kdXSlider && typeof pid.kd_x !== "undefined") {
    kdXSlider.value = pid.kd_x;
    kdXValue.textContent = Number(pid.kd_x).toFixed(2);
  }

  if (kpYSlider && typeof pid.kp_y !== "undefined") {
    kpYSlider.value = pid.kp_y;
    kpYValue.textContent = Number(pid.kp_y).toFixed(2);
  }
  if (kiYSlider && typeof pid.ki_y !== "undefined") {
    kiYSlider.value = pid.ki_y;
    kiYValue.textContent = Number(pid.ki_y).toFixed(2);
  }
  if (kdYSlider && typeof pid.kd_y !== "undefined") {
    kdYSlider.value = pid.kd_y;
    kdYValue.textContent = Number(pid.kd_y).toFixed(2);
  }

  // 초기 platform pose
  const roll = Number(pose.roll) || 0;
  const pitch = Number(pose.pitch) || 0;
  if (window.updatePlatformPose) {
    window.updatePlatformPose(roll, pitch);
  }
  if (platformRollEl) platformRollEl.textContent = roll.toFixed(2);
  if (platformPitchEl) platformPitchEl.textContent = pitch.toFixed(2);

  // field_size 저장
  if (typeof field.width === "number" && typeof field.height === "number") {
    fieldWidth = field.width;
    fieldHeight = field.height;

    if (fieldSizeLabelEl) {
      fieldSizeLabelEl.textContent =
        `${fieldWidth.toFixed(0)} × ${fieldHeight.toFixed(0)}`;
    }
    resizeTargetCanvas();
  }

  // device_id 표시
  if (deviceIdEl && data.device_id) {
    let text = `Device: ${data.device_id}`;
    if (data.firmware) {
      text += ` (fw ${data.firmware})`;
    }
    deviceIdEl.textContent = text;
  }
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
  if (platformRollEl) platformRollEl.textContent = roll.toFixed(2);
  if (platformPitchEl) platformPitchEl.textContent = pitch.toFixed(2);

  // joystick 값
  const joy = data.joystick_val || {};
  const jx = Number(joy.x) || 0;
  const jy = Number(joy.y) || 0;
  drawJoystick(jx, jy);

  // ball real_pose → target plane
  const real = data.real_pose || {};
  const bx = Number(real.x) || 0;
  const by = Number(real.y) || 0;

  // ball target_pose → target plane
  const tar = data.target_pose || {};
  const tx = Number(tar.x) || 0;
  const ty = Number(tar.y) || 0;
  drawTargetPlane(bx, by, tx, ty);

  // error
  const err = data.error || {};
  const ex = Number(err.x) || 0;
  const ey = Number(err.y) || 0;

  // time (그래프용, 일단 클라이언트 시간 기준)
  const t = Date.now() / 1000;

  if (window.addErrorPoint) {
    window.addErrorPoint(t, ex, ey);
  }
});

// ================================
// 4. DOMContentLoaded: 초기화 & 이벤트 등록
// ================================

window.addEventListener("DOMContentLoaded", () => {
  // 3D scene / 에러 그래프 초기화
  if (window.initPlatformScene) {
    window.initPlatformScene();
  }

  const chartCanvas = document.getElementById("error-chart");
  if (chartCanvas && window.initErrorChart) {
    const ctx = chartCanvas.getContext("2d");
    window.initErrorChart(ctx);
  }

  // Target canvas 기본 크기 설정
  if (targetCanvas) {
    targetCanvas.width = TARGET_CANVAS_MAX_W;
    targetCanvas.height = TARGET_CANVAS_MAX_H;
    targetCanvas.style.width = TARGET_CANVAS_MAX_W + "px";
    targetCanvas.style.height = TARGET_CANVAS_MAX_H + "px";
  }

  // 초기 그림
  drawJoystick(0, 0);
  drawTargetPlane(0, 0);

  // ===== PID 슬라이더 이벤트 =====
  kpXSlider.addEventListener("input", () => kpXValue.textContent = Number(kpXSlider.value).toFixed(2));
  kiXSlider.addEventListener("input", () => kiXValue.textContent = Number(kiXSlider.value).toFixed(2));
  kdXSlider.addEventListener("input", () => kdXValue.textContent = Number(kdXSlider.value).toFixed(2));

  kpYSlider.addEventListener("input", () => kpYValue.textContent = Number(kpYSlider.value).toFixed(2));
  kiYSlider.addEventListener("input", () => kiYValue.textContent = Number(kiYSlider.value).toFixed(2));
  kdYSlider.addEventListener("input", () => kdYValue.textContent = Number(kdYSlider.value).toFixed(2));

  // Apply 버튼 → SocketIO send
  if (pidApplyBtn) {
    pidApplyBtn.addEventListener("click", () => {
      if (!kpXSlider || !kiXSlider || !kdXSlider || !kpYSlider || !kiYSlider || !kdYSlider || !targetX || !targetY) return;
      const payload = {
        pid_const: {
          kp_x: Number(kpXSlider.value),
          ki_x: Number(kiXSlider.value),
          kd_x: Number(kdXSlider.value),

          kp_y: Number(kpYSlider.value),
          ki_y: Number(kiYSlider.value),
          kd_y: Number(kdYSlider.value),
        },

        time: Date.now() / 1000,
        ctr_mode: "manual",

        target_pose: {
          x: Number(targetX.value),
          y: Number(targetY.value),
        }
      };
      console.log("PID APPLY:", payload);
      socket.emit("set_pid", payload);
    });
  }

  // ===== Target 방향키 / Center 버튼 =====
  if (targetCenterBtn) {
    targetCenterBtn.addEventListener("click", () => setTarget(0, 0));
  }
  if (targetCenterPadBtn) {
    targetCenterPadBtn.addEventListener("click", () => setTarget(0, 0));
  }
  if (targetUpBtn) {
    targetUpBtn.addEventListener("click", () => adjustTarget(0, TARGET_STEP));
  }
  if (targetDownBtn) {
    targetDownBtn.addEventListener("click", () => adjustTarget(0, -TARGET_STEP));
  }
  if (targetLeftBtn) {
    targetLeftBtn.addEventListener("click", () => adjustTarget(-TARGET_STEP, 0));
  }
  if (targetRightBtn) {
    targetRightBtn.addEventListener("click", () => adjustTarget(TARGET_STEP, 0));
  }
});
