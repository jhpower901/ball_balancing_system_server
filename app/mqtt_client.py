import json
import threading
import time

import paho.mqtt.client as mqtt

MQTT_HOST = "anzam.kr"   # 필요 시 수정
MQTT_PORT = 1883
MQTT_TOPIC_STATUS = "ballbalancer/status"
MQTT_TOPIC_CMD = "ballbalancer/cmd"

#TODO: 실시간 디버그 콘솔 (任意 MQTT publish/subscribe)
#TODO: MQTT 기반 영상 스트림 or WebRTC 카메라 스트림
#TODO: UI 대시보드 정리(탭 분리, 다중 카드 등)
#TODO: 로그 저장/CSV export
#TODO: PID 실험 자동화 스크립트 추가
#TODO: 제어 모드 전환(auto/manual)


'''
payload 예시
{
  "platform_pose": {
    "roll": 0,
    "pitch": 3
  },
  "joystick_val": {
    "x": 1,
    "y": 0.5
  },
  "real_pose": {
    "x": -0.9,
    "y": 0.7
  },
  "error": {
    "x": 0.77,
    "y": -0.0
  },
  "time": 1764648990.455,
  "PID_const": {
        "Kp": 0,
        "Ki": 3.34,
        "Kd": 1.13
    },
    "ctr_mode": "manual",
    "target_pose": {
        "x": 0,
        "y": 0
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

    def on_disconnect(self, client, userdata, rc):
        print("[MQTT] Disconnected:", rc)

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            print("[MQTT] Invalid JSON")
            return

        # SocketIO를 통해 브라우저로 전달
        self.socketio.emit("status_update", payload, namespace="/")

        print(f"[MQTT] <{msg.topic}> {payload}")

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
