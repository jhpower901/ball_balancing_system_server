import paho.mqtt.client as mqtt
import time
import json
import threading
from pynput import keyboard
import math

# --- 설정 변수 ---
MQTT_BROKER = "anzam.kr"
MQTT_TOPIC = "ballbalancer/status"
SIMULATION_FREQUENCY = 20  # Hz
LOOP_DELAY = 1 / SIMULATION_FREQUENCY  # 초당 루프 딜레이
G = 9.81  # 중력 가속도 (m/s^2)
PLATFORM_MAX_ANGLE = 15  # 최대 Roll/Pitch 각도 (도)
TIME_SCALE = 0.1  # 시뮬레이션 시간을 실제 시간보다 느리게/빠르게 조절하는 스케일


# --- 전역 상태 변수 ---
class SimulatorState:
    def __init__(self):
        # 플랫폼 자세 (Roll, Pitch) - 스튜어트 플랫폼 제어 출력이라 가정 (단위: 도)
        self.roll = 5.0
        self.pitch = 3.0

        # 조이스틱 입력 (목표 속도/힘) (단위: -1.0 ~ 1.0)
        self.joystick_x = 0.0
        self.joystick_y = 0.0

        # 실제 공의 상태 (단위: 미터)
        self.real_x = 0.0
        self.real_y = 0.0
        self.vel_x = 0.0
        self.vel_y = 0.0

        # 목표 위치 (joystick_val의 누적 합) (단위: 임의의 위치 스케일)
        self.target_x = 0.0
        self.target_y = 0.0

        # 시뮬레이션 시간
        self.current_time = 0.0


state = SimulatorState()

# --- MQTT 설정 ---
client = mqtt.Client()


def on_connect(client, userdata, flags, rc):
    print(f"MQTT 브로커 연결: {MQTT_BROKER}, 결과 코드: {rc}")
    if rc == 0:
        print("연결 성공")
    else:
        print("연결 실패")


client.on_connect = on_connect

try:
    client.connect(MQTT_BROKER, 1883, 60)
    client.loop_start()  # 백그라운드 스레드에서 MQTT 통신 시작
except Exception as e:
    print(f"MQTT 연결 실패: {e}")


# --- 물리 시뮬레이션 함수 ---
def update_simulation(dt):
    global state

    # 1. 시뮬레이션 시간 업데이트
    state.current_time += dt

    # 2. Joystick 값 누적을 통한 목표 위치 업데이트 (요청사항 반영)
    # 목표 위치는 목표를 나타낼 뿐, 공의 실제 움직임을 직접 제어하지는 않음.
    accumulation_rate = 0.05  # 누적 속도 스케일
    state.target_x += state.joystick_x * accumulation_rate * dt
    state.target_y += state.joystick_y * accumulation_rate * dt

    # 3. 플랫폼 자세 제어 (단순 예시: 목표 위치와의 차이를 줄이는 PID와 유사한 제어 로직이라 가정)
    kp_pitch = 0.5
    kp_roll = 0.5

    # Error 계산
    error_x = state.target_x - state.real_x
    error_y = state.target_y - state.real_y

    # 목표 위치 Error를 줄이는 방향으로 platform_pose를 결정 (공을 중앙으로 굴리려는 제어라고 가정)
    # y축 Error는 Pitch (x축 회전)에, x축 Error는 Roll (y축 회전)에 영향을 줌
    state.pitch = -error_y * kp_pitch * (180 / math.pi)  # Error와 반대로 기울여야 함
    state.roll = error_x * kp_roll * (180 / math.pi)

    # 최대 각도 제한
    state.pitch = max(-PLATFORM_MAX_ANGLE, min(PLATFORM_MAX_ANGLE, state.pitch))
    state.roll = max(-PLATFORM_MAX_ANGLE, min(PLATFORM_MAX_ANGLE, state.roll))

    # 4. 공의 운동 (경사면 운동 공식)


    # 각도를 라디안으로 변환
    roll_rad = math.radians(state.roll)
    pitch_rad = math.radians(state.pitch)

    # 경사면에서의 가속도 (x, y축)
    # Ax = G * sin(roll) * cos(pitch)  <- 근사치: G * sin(roll)
    # Ay = G * sin(pitch) * cos(roll)  <- 근사치: G * sin(pitch)

    # 간단한 근사치 사용 (작은 각도 가정)
    accel_x = G * math.sin(roll_rad)
    accel_y = G * math.sin(pitch_rad)

    # 속도 업데이트: v = v0 + a*t
    state.vel_x += accel_x * dt
    state.vel_y += accel_y * dt

    # 감쇠(마찰) 적용 (선택 사항)
    state.vel_x *= 0.99
    state.vel_y *= 0.99

    # 위치 업데이트: p = p0 + v*t
    state.real_x += state.vel_x * dt
    state.real_y += state.vel_y * dt

    # 5. 시뮬레이션 경계 조건 (평면 이탈 방지)
    MAX_POS = 0.5  # 평면의 절반 크기 (예: -0.5m ~ 0.5m)
    if abs(state.real_x) > MAX_POS:
        state.real_x = MAX_POS if state.real_x > 0 else -MAX_POS
        state.vel_x = 0  # 경계에 닿으면 속도 0
    if abs(state.real_y) > MAX_POS:
        state.real_y = MAX_POS if state.real_y > 0 else -MAX_POS
        state.vel_y = 0  # 경계에 닿으면 속도 0

    # 최종 Error 계산 (real_pose와 target_pose의 차이)
    return error_x, error_y


# --- 데이터 전송 함수 ---
def publish_data():
    global state

    # 시뮬레이션 업데이트
    dt = LOOP_DELAY * TIME_SCALE  # 시뮬레이션 시간 간격
    error_x, error_y = update_simulation(dt)

    # 전송할 데이터 구조
    data = {
        "platform_pose": {
            "roll": round(state.roll, 2),
            "pitch": round(state.pitch, 2)
        },
        "joystick_val": {
            "x": round(state.joystick_x, 2),
            "y": round(state.joystick_y, 2)
        },
        # 실제 공의 위치
        "real_pose": {
            "x": round(state.real_x, 4),
            "y": round(state.real_y, 4)
        },
        # 실제 위치와 목표 위치의 오차
        "error": {
            "x": round(error_x, 4),
            "y": round(error_y, 4)
        },
        "time": state.current_time
    }

    payload = json.dumps(data)

    # MQTT 전송
    result, mid = client.publish(MQTT_TOPIC, payload, qos=1)
    if result == mqtt.MQTT_ERR_SUCCESS:
        # print(f"[{state.current_time:.2f}s] Data Published: {payload}")
        pass
    else:
        print(f"MQTT 퍼블리싱 실패: {result}")


# --- 키보드 제어 핸들러 ---
JOYSTICK_STEP = 0.1
JOYSTICK_LIMIT = 1.0


def on_press(key):
    global state
    try:
        if key == keyboard.Key.up:
            state.joystick_y = min(JOYSTICK_LIMIT, state.joystick_y + JOYSTICK_STEP)
        elif key == keyboard.Key.down:
            state.joystick_y = max(-JOYSTICK_LIMIT, state.joystick_y - JOYSTICK_STEP)
        elif key == keyboard.Key.left:
            state.joystick_x = max(-JOYSTICK_LIMIT, state.joystick_x - JOYSTICK_STEP)
        elif key == keyboard.Key.right:
            state.joystick_x = min(JOYSTICK_LIMIT, state.joystick_x + JOYSTICK_STEP)
        elif key == keyboard.Key.space:
            # 스페이스바를 누르면 조이스틱 값 초기화 및 공 정지
            state.joystick_x = 0.0
            state.joystick_y = 0.0
            state.vel_x = 0.0
            state.vel_y = 0.0
            state.target_x = 0.0
            state.target_y = 0.0
            state.real_x = 0.0
            state.real_y = 0.0
            print("\n--- 시뮬레이션 상태 초기화 ---")

    except AttributeError:
        pass


def on_release(key):
    # 키에서 손을 떼면 해당 축 조이스틱 값을 0으로 설정
    global state
    if key == keyboard.Key.up or key == keyboard.Key.down:
        state.joystick_y = 0.0
    elif key == keyboard.Key.left or key == keyboard.Key.right:
        state.joystick_x = 0.0


# 키보드 리스너 스레드 시작
listener = keyboard.Listener(on_press=on_press, on_release=on_release)
listener.start()


# --- 메인 루프 ---
def main_loop():
    print(f"--- 시뮬레이터 시작 (MQTT 브로커: {MQTT_BROKER}, 주기: {SIMULATION_FREQUENCY}Hz) ---")
    print("키보드 방향키: joystick_val 제어")
    print("SPACE: 상태 초기화")
    print("Ctrl+C: 종료")

    start_time = time.time()
    next_publish_time = start_time

    try:
        while True:
            current_time = time.time()
            if current_time >= next_publish_time:
                publish_data()
                next_publish_time += LOOP_DELAY

                # 밀린 시간 처리 (Overrun 방지)
                if current_time > next_publish_time:
                    next_publish_time = current_time + LOOP_DELAY

            # 다음 루프까지 대기
            time.sleep(max(0, next_publish_time - time.time()))

    except KeyboardInterrupt:
        print("\n--- 시뮬레이터 종료 요청 ---")
    finally:
        listener.stop()
        client.loop_stop()
        client.disconnect()
        print("시뮬레이터 종료 및 MQTT 연결 해제")


if __name__ == "__main__":
    main_loop()