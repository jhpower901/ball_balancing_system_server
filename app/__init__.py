from flask import Flask
from flask_socketio import SocketIO

socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode="eventlet",
    #async_mode="threading",
)

from .mqtt_client import init_mqtt  # socketio 정의 아래에 위치


def create_app(config_object=None):
    app = Flask(__name__)

    app.config.from_mapping(
        SECRET_KEY="change-this-secret-key",
    )
    if config_object:
        app.config.from_object(config_object)

    from .views import bp as main_bp
    app.register_blueprint(main_bp)

    # SocketIO 초기화
    socketio.init_app(app)

    # MQTT 초기화 (socketio 인스턴스를 넘김)
    init_mqtt(socketio)

    # socketio_namespace import 해서 이벤트 등록
    from . import socketio_namespace  # noqa: F401

    return app
