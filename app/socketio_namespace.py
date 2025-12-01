from . import socketio


@socketio.on("connect")
def handle_connect():
    print("[SocketIO] client connected")


@socketio.on("disconnect")
def handle_disconnect():
    print("[SocketIO] client disconnected")
