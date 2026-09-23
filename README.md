# AirControl

AirControl is a gesture-driven Windows control system that turns a webcam and your hand into a low-latency mouse and shortcut controller.

## Architecture

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + Socket.IO + MongoDB
- **Windows Agent:** Python + OpenCV + MediaPipe + Win32 input
- **Frontend deployment:** Vercel
- **Backend deployment:** Render
- **Gesture processing:** Local on the Windows laptop

The cloud dashboard manages configuration, device status, and activity. Actual webcam processing and Windows input injection stay local for speed and offline operation.

## MVP gestures

| Gesture | Action |
| --- | --- |
| Move index finger | Move cursor |
| Thumb + index pinch | Left click |
| Thumb + middle pinch | Copy |
| Thumb + ring pinch | Paste |
| Thumb + pinky pinch | Right click |
| Open palm hold | Screenshot |

More setup instructions will be added with the application scaffold.
