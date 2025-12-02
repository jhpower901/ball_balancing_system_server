// main.js

// three_scene.js / charts.js 에서 window에 올려둔 전역 함수 사용
const socket = io();

// 상태 표시
const statusEl = document.getElementById("socket-status");
const statusJsonEl = document.getElementById("status-json");
const deviceIdEl = document.getElementById("device-id-label");

// Joystick
const joystickCanvas = document.getElementById("joystick-canvas");
const joystickCtx = joystickCanvas.getContext("2d");
const joyXValEl = document.getElementById("joy-x-val");
const joyYValEl = document.getElementById("joy-y-val");

// Target plane
const targetCanvas = document.getElementById("target-canvas");
const targetCtx = targetCanvas.getContext("2d");
const fieldSizeLabelEl = document.getElementById("field-size-label");
const ballXValEl = document.getElementById("ball-x-val");
const ballYValEl = document.getElementById("ball-y-val");

// Platform pose numeric
const platformRollEl = document.getElementById("platform-roll-value");
const platformPitchEl = document.getElementById("platform-pitch-value");

// PID UI (이미 있던 부분)
const kpSlider = document.getElementById("kp-slider");
const kiSlider = document.getElementById("ki-slider");
const kdSlider = document.getElementById("kd-slider");
const kpValue = document.getElementById("kp-value");
const kiValue = document.getElementById("ki-value");
const kdValue = document.getElementById("kd-value");
const targetX = document.getElementById("target-x");
const targetY = document.getElementById("target-y");
const pidApplyBtn = document.getElementById("pid-apply-btn");

// Target plane 실제 크기 (hello에서 초기화, 단위: mm)
let fieldWidth = null;
let fieldHeight = null;

// 캔버스가 차지할 최대 픽셀 크기(원하는 값으로 조절)
const TARGET_CANVAS_MAX_W = 250;
const TARGET_CANVAS_MAX_H = 250;

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls;
}

function drawJoystick(nx, ny) {
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

  // 숫자 표시
  if (joyXValEl) joyXValEl.textContent = nx.toFixed(2);
  if (joyYValEl) joyYValEl.textContent = ny.toFixed(2);
}

function resizeTargetCanvas() {
  if (!targetCanvas || !fieldWidth || !fieldHeight) return;

  // 필드 비율에 맞춰 캔버스 크기 결정
  const scale = Math.min(
    TARGET_CANVAS_MAX_W / fieldWidth,
    TARGET_CANVAS_MAX_H / fieldHeight
  );

  const newW = Math.round(fieldWidth * scale);
  const newH = Math.round(fieldHeight * scale);

  // 실제 캔버스 크기(px)
  targetCanvas.width = newW;
  targetCanvas.height = newH;

  // CSS 크기도 맞춰주기 (카드 안에서 보기 좋게)
  targetCanvas.style.width = newW + "px";
  targetCanvas.style.height = newH + "px";

  // 크기 바뀌었으니 다시 그려주기
  drawTargetPlane(0, 0);
}


function drawTargetPlane(ballX, ballY) {
  if (!targetCtx) return;

  const w = targetCanvas.width;
  const h = targetCanvas.height;

  targetCtx.clearRect(0, 0, w, h);

  // 필드 크기가 없으면 아직 초기화 안 된 상태
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

  // 실제 좌표 -> 캔버스 좌표
  // ballX, ballY ∈ [-fieldWidth/2, fieldWidth/2], [-fieldHeight/2, fieldHeight/2]
  const normX = ballX / fieldWidth + 0.5;   // 0~1
  const normY = -ballY / fieldHeight + 0.5; // 위/아래 반전

  const px = margin + normX * innerW;
  const py = margin + normY * innerH;

  targetCtx.beginPath();
  targetCtx.arc(px, py, 6, 0, Math.PI * 2);
  targetCtx.strokeStyle = "#2e7d32"; // 초록색
  targetCtx.lineWidth = 2;
  targetCtx.stroke();
  targetCtx.fillStyle = "rgba(46, 125, 50, 0.3)";
  targetCtx.fill();

  // 숫자 표시
  if (ballXValEl) ballXValEl.textContent = ballX.toFixed(2);
  if (ballYValEl) ballYValEl.textContent = ballY.toFixed(2);
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


// ESP hello → 웹 초기화
socket.on("device_hello", (data) => {
  console.log("DEVICE HELLO:", data);

  const pid = data.PID_const || {};
  const pose = data.platform_pose || {};
  const field = data.field_size || {};  // {width, height} 예상

  // PID 슬라이더 초기값
  if (kpSlider && typeof pid.Kp !== "undefined") {
    kpSlider.value = pid.Kp;
    kpValue.textContent = Number(pid.Kp).toFixed(2);
  }
  if (kiSlider && typeof pid.Ki !== "undefined") {
    kiSlider.value = pid.Ki;
    kiValue.textContent = Number(pid.Ki).toFixed(2);
  }
  if (kdSlider && typeof pid.Kd !== "undefined") {
    kdSlider.value = pid.Kd;
    kdValue.textContent = Number(pid.Kd).toFixed(2);
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
      fieldSizeLabelEl.textContent = `${fieldWidth.toFixed(0)} × ${fieldHeight.toFixed(0)}`;
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
  drawTargetPlane(bx, by);

  // error
  const err = data.error || {};
  const ex = Number(err.x) || 0;
  const ey = Number(err.y) || 0;

  // time
  let t= Date.now() / 1000;

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

  if (targetCanvas) {
    targetCanvas.width = TARGET_CANVAS_MAX_W;
    targetCanvas.height = TARGET_CANVAS_MAX_H;
    targetCanvas.style.width = TARGET_CANVAS_MAX_W + "px";
    targetCanvas.style.height = TARGET_CANVAS_MAX_H + "px";
  }

  // 초기 joystick / target plane는 원점 기준
  drawJoystick(0, 0);
  drawTargetPlane(0, 0);
});

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
