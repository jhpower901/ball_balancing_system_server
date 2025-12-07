# 🏐 ESP32 Ball Balancer – Web Dashboard & Control Server

**Flask + Socket.IO + MQTT + Three.js + ESP32-S3 Touch Ball Balancer 시스템**

---

## 📌 프로젝트 개요

ESP32-S3 기반 **볼 밸런싱 로봇(Ball Balancer)** 의 실시간 제어 및 시각화를 위해 제작된

**웹 대시보드 + MQTT 서버 시스템**입니다.

웹 인터페이스에서는 다음 기능을 제공합니다:

- 실시간 **3D Platform Pose (roll/pitch)** 시각화
- **Target Plane (ball position + target position)** 표시
- **Joystick 입력값** 모니터링
- **PID 제어값(X/Y축 각각) 실시간 조정**
- **Target circular trajectory mode** (반경/속도 입력 → 원형 궤적 자동 제어)
- ESP32 최초 부팅 시 전송되는 **hello 패킷 기반 자동 초기화**

MQTT를 통해 ESP32와 통신하며, Flask-SocketIO를 이용하여 웹 브라우저에 실시간 전송합니다.

---

## 🚀 주요 기능

### ✔️ 1. 실시간 대시보드

- ESP32 → MQTT → Flask → SocketIO → Web UI
- 플랫폼의 roll/pitch 값이 Three.js 3D 모델에 반영
- Target Plane(필드) 위에 **ball_pose(빨강)**, **target_pose(초록)** 표시
- 실시간 Error 그래프(Chart.js)

### ✔️ 2. PID 제어 설정 (X축, Y축 개별 지원)

ESP32 펌웨어의 PID 상수를 원격으로 조정 가능:

```
kp_x, ki_x, kd_x
kp_y, ki_y, kd_y

```

설정 후 “Apply” 클릭 시 ESP32로 다음과 같은 MQTT cmd 발행:

```json
{
  "pid_const": {
    "kp_x": 0.55,
    "ki_x": 0.05,
    "kd_x": 0.275,
    "kp_y": 0.35,
    "ki_y": 0.05,
    "kd_y": 0.16
  },
  "ctr_mode": "mqtt",
  "target_pose": { "x": 0, "y": 0 }
}

```

### ✔️ 3. Target Position 제어

- 버튼 ↑ ↓ ← → 조작
- “Center” 버튼으로 (0,0) 복귀
- Target Plane UI에서 현재 target을 시각적으로 확인 가능

### ✔️ 4. Circle Mode (원형 궤적 생성)

입력:

- **반지름 R**
- **속도 Speed (rev/sec)**

자동으로 원형 궤적을 계산하여 target_pose로 지속 발행:

```json
{
  "ctr_mode": "manual",
  "target_pose": { "x": R*cos(ωt), "y": R*sin(ωt) }
}
```

Target Plane에 **회색 원(궤적)** + 현재 target 위치도 표시됨.

### ✔️ 5. ESP32 Hello 패킷 기반 자동 초기화

ESP32가 부팅되면 아래 JSON을 발행:

```json
{
  "device_id": "esp32-ball-1",
  "firmware": "1.0.0",
  "pid_const": {
    "kp_x": 0.55,
    "ki_x": 0.05,
    "kd_x": 0.275,
    "kp_y": 0.35,
    "ki_y": 0.05,
    "kd_y": 0.16
  },
  "platform_pose": { "roll": 0, "pitch": 0 },
  "field_size": { "width": 260, "height": 200 }
}
```

웹은 이를 기반으로:

- PID 슬라이더 초기화
- field_size 기반 Target Plane 캔버스 자동 리사이즈
- 장치 정보(Device ID, Firmware)를 상단에 표시

---

## 📡 시스템 아키텍처

```
ESP32 ──(MQTT pub/sub)──> Flask Server ──(Socket.IO)──> Web Dashboard
   ↑                                     ↓
   └────────── 실시간 PID 제어 / Target Pose 명령 ──────────┘
```

---

## 📁 프로젝트 구조

```
ballbalancer-server/
│
├── app/
│   ├── __init__.py
│   ├── mqtt_client.py
│   ├── socketio_namespace.py
│   ├── views.py
│   └── static/
│       ├── js/
│       │   ├── main.js
│       │   ├── three_scene.js
│       │   └── charts.js
│       └── css/
│           └── main.css
│
├── templates/
│   └── index.html
│
├── manage.py
└── README.md
```

---

## 🛠️ 설치 및 실행

### 1. Python 환경 구성

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. 개발 서버 실행

```bash
python manage.py
```

### 3. 서비스용 Gunicorn + gevent 실행 (예: Ubuntu)

```bash
gunicorn -k geventwebsocket.gunicorn.workers.GeventWebSocketWorker \
    -w 1 manage:app -b 0.0.0.0:5000

```

---

## 🔧 ESP32 펌웨어 설명

- TouchScreen 기반 볼 좌표값 → 필터링 → PID 제어 → 서보 출력
- MQTT 통신 (WiFi + PubSubClient)
- 20ms 주기(50Hz)로 status 발행
- 멀티코어 구조
    - Core0 → MQTT 통신
    - Core1 → PID 제어/센싱
- JSON 기반 통신 구조 유지

---

## 📝 MQTT Topic 정의

| Topic | Direction | Description |
| --- | --- | --- |
| `ballbalancer/hello` | ESP32 → Server | 초기 정보(Device ID, PID, field_size 등) |
| `ballbalancer/status` | ESP32 → Server | 실시간 상태 데이터 |
| `ballbalancer/cmd` | Server → ESP32 | PID/TargetPose 제어 명령 |