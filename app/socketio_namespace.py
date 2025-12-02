from . import socketio
from .mqtt_client import mqtt_client


@socketio.on("connect")
def handle_connect():
    print("[SocketIO] client connected")


@socketio.on("disconnect")
def handle_disconnect():
    print("[SocketIO] client disconnected")


@socketio.on("set_pid")
def handle_set_pid(data):
    print("[SocketIO] set_pid:", data)
    if mqtt_client:
        mqtt_client.publish_cmd(data)