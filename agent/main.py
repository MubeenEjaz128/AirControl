import json
import os
import platform
import threading
import time
from pathlib import Path

import cv2
import mediapipe as mp
import socketio
from dotenv import load_dotenv

from gesture_engine import GestureEngine

if platform.system() != "Windows":
    raise SystemExit("AirControl agent currently supports Windows only.")

from input_controller import WindowsInputController

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

API_URL = os.getenv("AIRCONTROL_API", "http://localhost:10000").rstrip("/")
DEVICE_ID = os.getenv("AIRCONTROL_DEVICE_ID", "my-laptop")
AGENT_TOKEN = os.getenv("AIRCONTROL_AGENT_TOKEN", "aircontrol-agent")
CAMERA_INDEX = int(os.getenv("AIRCONTROL_CAMERA_INDEX", "0"))
PREVIEW = os.getenv("AIRCONTROL_PREVIEW", "true").lower() in {"1", "true", "yes", "on"}

DEFAULT_CONFIG = {
    "enabled": True,
    "sensitivity": 1.15,
    "smoothing": 0.32,
    "pinchThreshold": 0.42,
    "gestureCooldownMs": 450,
    "screenshotHoldMs": 850,
    "activeMargin": 0.08,
    "mirrorCamera": True,
}


def load_config():
    config = DEFAULT_CONFIG.copy()
    path = BASE_DIR / "config.json"
    if path.exists():
        try:
            config.update(json.loads(path.read_text(encoding="utf-8")))
        except Exception as exc:
            print("Config warning:", exc)
    return config


config = load_config()
config_lock = threading.Lock()
controller = WindowsInputController()
engine = GestureEngine()
sio = socketio.Client(
    reconnection=True,
    reconnection_attempts=0,
    logger=False,
    engineio_logger=False,
)


@sio.event
def connect():
    print(f"Cloud connected as {DEVICE_ID}")


@sio.event
def disconnect():
    print("Cloud disconnected; local gesture control remains available.")


@sio.on("config:update")
def on_config_update(next_config):
    global config
    if isinstance(next_config, dict):
        with config_lock:
            config = {**config, **next_config}
        print("Configuration synced.")


@sio.on("command")
def on_command(command):
    global config
    kind = (command or {}).get("type")

    if kind == "enable":
        with config_lock:
            config["enabled"] = True
    elif kind == "disable":
        with config_lock:
            config["enabled"] = False
    elif kind == "recalibrate":
        engine.filtered_x = None
        engine.filtered_y = None
        print("Cursor calibration reset.")


def connect_cloud():
    try:
        sio.connect(
            API_URL,
            auth={"role": "agent", "deviceId": DEVICE_ID, "token": AGENT_TOKEN},
            transports=["websocket", "polling"],
            wait_timeout=8,
        )
    except Exception as exc:
        print("Cloud connection unavailable:", exc)


def emit_status(**payload):
    if sio.connected:
        try:
            sio.emit("agent:status", payload)
        except Exception:
            pass


def emit_gesture(event):
    if sio.connected:
        try:
            sio.emit("gesture:event", {"type": "gesture", **event})
        except Exception:
            pass


def main():
    threading.Thread(target=connect_cloud, daemon=True).start()

    cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_DSHOW)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera index {CAMERA_INDEX}")

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 540)
    cap.set(cv2.CAP_PROP_FPS, 30)

    mp_hands = mp.solutions.hands
    drawing = mp.solutions.drawing_utils
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        model_complexity=1,
        min_detection_confidence=0.65,
        min_tracking_confidence=0.65,
    )

    frames = 0
    fps = 0.0
    fps_window = time.monotonic()
    last_status = 0.0
    last_gesture = "—"

    print("AirControl active. Press Q in the preview window to exit.")

    try:
        while True:
            ok, frame = cap.read()

            if not ok:
                emit_status(camera="error", handDetected=False, fps=0)
                time.sleep(0.1)
                continue

            frame = cv2.flip(frame, 1)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = hands.process(rgb)
            hand_detected = bool(result.multi_hand_landmarks)

            with config_lock:
                current = dict(config)

            if hand_detected:
                hand = result.multi_hand_landmarks[0]
                lm = hand.landmark

                if current.get("enabled", True):
                    x, y = engine.cursor(lm, current, controller.screen_w, controller.screen_h)
                    controller.move_to(x, y)

                    event = engine.process(lm, current)
                    if event:
                        controller.perform(event["action"])
                        last_gesture = event["gesture"]
                        emit_gesture(event)

                if PREVIEW:
                    drawing.draw_landmarks(frame, hand, mp_hands.HAND_CONNECTIONS)

            frames += 1
            now = time.monotonic()
            elapsed = now - fps_window

            if elapsed >= 1.0:
                fps = frames / elapsed
                frames = 0
                fps_window = now

            if now - last_status >= 0.75:
                emit_status(
                    camera="active",
                    handDetected=hand_detected,
                    fps=round(fps, 1),
                    lastGesture=last_gesture,
                    controlEnabled=bool(current.get("enabled", True)),
                )
                last_status = now

            if PREVIEW:
                state = "ON" if current.get("enabled", True) else "OFF"
                cv2.putText(
                    frame,
                    f"AirControl {state} | {fps:.0f} FPS",
                    (18, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    (235, 245, 255),
                    2,
                )
                cv2.putText(
                    frame,
                    f"Gesture: {last_gesture}",
                    (18, 58),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (180, 210, 255),
                    1,
                )
                cv2.imshow("AirControl Agent", frame)

                if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                    break
    finally:
        emit_status(camera="offline", handDetected=False, fps=0)
        hands.close()
        cap.release()

        if PREVIEW:
            cv2.destroyAllWindows()

        if sio.connected:
            sio.disconnect()


if __name__ == "__main__":
    main()
