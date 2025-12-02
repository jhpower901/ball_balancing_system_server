import json
import threading
import time

import paho.mqtt.client as mqtt

MQTT_HOST = "anzam.kr"   # 필요 시 수정
MQTT_PORT = 1883
MQTT_TOPIC_STATUS = "ballbalancer/status"
MQTT_TOPIC_HELLO  = "ballbalancer/hello"
MQTT_TOPIC_CMD    = "ballbalancer/cmd"

#TODO: 실시간 디버그 콘솔 (任意 MQTT publish/subscribe)
#TODO: MQTT 기반 영상 스트림 or WebRTC 카메라 스트림
#TODO: UI 대시보드 정리(탭 분리, 다중 카드 등)
#TODO: 로그 저장/CSV export
#TODO: PID 실험 자동화 스크립트 추가
#TODO: 제어 모드 전환(auto/manual)


'''
[status payload 예시]
{
  "time": 1764648990.455,
  "platform_pose": {
    "roll": 0,
    "pitch": 3
  },
  "target_pose": {
    "x": 0,
    "y": 0
  },
  "real_pose": {
    "x": -0.9,
    "y": 0.7
  },
  "joystick_val": {
    "x": 1,
    "y": 0.5
  },
  "error": {
    "x": 0.77,
    "y": -0.0
  },
  "PID_const": {
        "kp_x": 0.55,
        "ki_x": 0.05,
        "kd_x": 0.275,
        "kp_y": 0.35,
        "ki_y": 0.05,
        "kd_y": 0.16
  },
  "ctr_mode": "manual"
}


[cmd payload 예시]
{
  "PID_const": {
        "kp_x": 0.55,
        "ki_x": 0.05,
        "kd_x": 0.275,
        "kp_y": 0.35,
        "ki_y": 0.05,
        "kd_y": 0.16
  },
  "time": 1764658733.651,
  "ctr_mode": "manual",
  "target_pose": {
    "x": 0.5,
    "y": 0
  }
}


[hello payload 예시]
{
  "device_id": "esp32-ball-1",
  "firmware": "1.0.0",
  "PID_const": {
        "kp_x": 0.55,
        "ki_x": 0.05,
        "kd_x": 0.275,
        "kp_y": 0.35,
        "ki_y": 0.05,
        "kd_y": 0.16
  },
  "platform_pose": {
    "roll": 0,
    "pitch": 0
  },
  "field_size": {
    "width": 260,
    "height": 200
  }
}
'''



class MQTTClient:
    def __init__(self, socketio):
        self.socketio = socketio
        self.client = mqtt.Client()
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message

    def connect(self):
        """백그라운드 스레드에서 MQTT 루프 실행"""
        thread = threading.Thread(target=self._run, daemon=True)
        thread.start()

    def _run(self):
        while True:
            try:
                print("[MQTT] Connecting to broker...")
                self.client.connect(MQTT_HOST, MQTT_PORT, 60)
                self.client.loop_forever()
            except Exception as e:
                print("[MQTT] Connection failed:", e)
                time.sleep(3)

    def on_connect(self, client, userdata, flags, rc):
        print("[MQTT] Connected with result code", rc)
        client.subscribe(MQTT_TOPIC_STATUS)
        client.subscribe(MQTT_TOPIC_HELLO)

    def on_disconnect(self, client, userdata, rc):
        print("[MQTT] Disconnected:", rc)

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            print("[MQTT] Invalid JSON")
            return


        print(f"[MQTT] <{msg.topic}> {payload}")

        if msg.topic == MQTT_TOPIC_STATUS:
            # SocketIO를 통해 브라우저로 전달
            self.socketio.emit("status_update", payload, namespace="/")
            print(f"[MQTT] <{msg.topic}> {payload}")

        elif msg.topic == MQTT_TOPIC_HELLO:
            print(f"[MQTT] HELLO from device: {payload}")
            self.handle_hello(payload)

        else:
            print(f"[MQTT] <{msg.topic}> {payload}")

    def handle_hello(self, payload):
        """ESP 부팅 hello → 웹 초기화 + handshake cmd 전송"""

        device_id = payload.get("device_id", "unknown")
        pid_const = payload.get("PID_const", {})
        platform_pose = payload.get("platform_pose", {})
        firmware = payload.get("firmware", "unknown")
        field_size = payload.get("field_size", None)

        # 1) 웹 대시보드 초기화 이벤트 emit
        #    → main.js에서 device_hello 이벤트로 받아서
        #      PID 슬라이더, 3D pose, device_id 표시
        self.socketio.emit("device_hello", {
            "device_id": device_id,
            "PID_const": pid_const,
            "platform_pose": platform_pose,
            "firmware": firmware,
            "field_size": field_size,
        }, namespace="/")

        # 2) handshake cmd 생성
        #    - 기본적으로 ESP가 준 PID 값을 그대로 돌려보내되
        #      time, ctr_mode, target_pose 는 서버에서 채움
        cmd = {
            "device_id": device_id,
            "PID_const": {
                "Kp": float(pid_const.get("Kp", 0.0)),
                "Ki": float(pid_const.get("Ki", 0.0)),
                "Kd": float(pid_const.get("Kd", 0.0)),
            },
            "time": time.time(),
            "ctr_mode": "manual",
            "target_pose": {
                "x": 0.0,
                "y": 0.0,
            }
        }

        self.publish_cmd(cmd)
        print("[MQTT] sent handshake cmd:", cmd)


    def publish_cmd(self, payload):
        import json
        try:
            self.client.publish(MQTT_TOPIC_CMD, json.dumps(payload))
            print("[MQTT] published cmd:", payload)
        except Exception as e:
            print("[MQTT] publish error:", e)


# 전역 변수로 하나만 운용
mqtt_client = None


def init_mqtt(socketio):
    """create_app에서 socketio 인스턴스를 넘겨줄 때 호출"""
    global mqtt_client
    if mqtt_client is None:
        mqtt_client = MQTTClient(socketio)
        mqtt_client.connect()
