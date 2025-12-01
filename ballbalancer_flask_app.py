from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
from flask_mqtt import Mqtt
import datetime
import pymysql
import json
from module.log_config import logging

# Logging setup

logger = logging.getLogger(__name__)

# Flask app setup
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# MQTT setup
app.config['MQTT_BROKER_URL'] = 'anzam.kr'
app.config['MQTT_BROKER_PORT'] = 1883
app.config['MQTT_REFRESH_TIME'] = 10
mqtt = Mqtt(app)
MQTT_SUB_TOPIC = 'ballbalancer/status'
MQTT_PUB_TOPIC = 'ballbalancer/cmd'



# DB setup
conn = None
cursor = None

@app.route("/")
def index():
    return

@mqtt.on_connect()
def handle_connect(client, userdata, flags, rc):
    logger.info(f"[MQTT] Connected with result code {rc}")

@socketio.on("order")
def handle_order(data):
    global conn, cursor
    user = data.get("user")
    due = data.get("due_date")
    address = data.get("address")
    items = data.get("items")
    order_id = None

    emit("order_response", {"status": "received", "user": user})
    logger.info(f"[ORDER] user={user}, due={due}, addr={address}, items={items}")

    # DB insert
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


    # MQTT publish
    message = json.dumps({
        "user": user,
        "due": due,
        "addr": address,
        "items": items
    })
    mqtt.publish(f'{MQTT_PUB_TOPIC}/{order_id}', message)
    logger.info(f"[MQTT] Published to {MQTT_PUB_TOPIC}/{order_id} → {message}")


@socketio.on("disconnect")
def handle_disconnect():
    print('[SocketIO] 클라이언트 연결 해제')
