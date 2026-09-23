import math
import time


def dist(a, b):
    return math.hypot(a.x - b.x, a.y - b.y)


def clamp(value, low, high):
    return max(low, min(high, value))


class GestureEngine:
    def __init__(self):
        self.was_pinching = False
        self.last_action_at = 0.0
        self.open_palm_since = None
        self.screenshot_latched = False
        self.filtered_x = None
        self.filtered_y = None

    def _finger_extended(self, landmarks, tip, pip):
        return landmarks[tip].y < landmarks[pip].y

    def _open_palm(self, lm):
        return all([
            self._finger_extended(lm, 8, 6),
            self._finger_extended(lm, 12, 10),
            self._finger_extended(lm, 16, 14),
            self._finger_extended(lm, 20, 18),
        ])

    def _pinch_candidate(self, lm, threshold):
        palm_width = max(dist(lm[5], lm[17]), 0.01)
        candidates = {
            "right_click": dist(lm[4], lm[8]) / palm_width,
            "copy": dist(lm[4], lm[12]) / palm_width,
            "paste": dist(lm[4], lm[16]) / palm_width,
            "left_click": dist(lm[4], lm[20]) / palm_width,
        }
        action, ratio = min(candidates.items(), key=lambda item: item[1])
        return (action, ratio) if ratio <= threshold else (None, ratio)

    def cursor(self, lm, config, screen_w, screen_h):
        margin = float(config.get("activeMargin", 0.08))
        x = lm[8].x
        y = lm[8].y

        if config.get("mirrorCamera", True):
            x = 1.0 - x

        x = clamp((x - margin) / max(1.0 - 2.0 * margin, 0.1), 0.0, 1.0)
        y = clamp((y - margin) / max(1.0 - 2.0 * margin, 0.1), 0.0, 1.0)

        sensitivity = float(config.get("sensitivity", 1.15))
        x = clamp(0.5 + (x - 0.5) * sensitivity, 0.0, 1.0)
        y = clamp(0.5 + (y - 0.5) * sensitivity, 0.0, 1.0)

        target_x = x * screen_w
        target_y = y * screen_h
        alpha = clamp(float(config.get("smoothing", 0.32)), 0.03, 1.0)

        if self.filtered_x is None:
            self.filtered_x, self.filtered_y = target_x, target_y
        else:
            self.filtered_x += (target_x - self.filtered_x) * alpha
            self.filtered_y += (target_y - self.filtered_y) * alpha

        return self.filtered_x, self.filtered_y

    def process(self, lm, config):
        now = time.monotonic()
        cooldown = float(config.get("gestureCooldownMs", 450)) / 1000.0
        threshold = float(config.get("pinchThreshold", 0.42))

        if self._open_palm(lm):
            if self.open_palm_since is None:
                self.open_palm_since = now

            hold = float(config.get("screenshotHoldMs", 850)) / 1000.0
            if not self.screenshot_latched and now - self.open_palm_since >= hold:
                if now - self.last_action_at >= cooldown:
                    self.last_action_at = now
                    self.screenshot_latched = True
                    return {"gesture": "Open palm hold", "action": "screenshot"}
        else:
            self.open_palm_since = None
            self.screenshot_latched = False

        action, ratio = self._pinch_candidate(lm, threshold)
        pinching = action is not None

        if pinching and not self.was_pinching and now - self.last_action_at >= cooldown:
            self.was_pinching = True
            self.last_action_at = now
            names = {
                "right_click": "Thumb + Index",
                "copy": "Thumb + Middle",
                "paste": "Thumb + Ring",
                "left_click": "Thumb + Pinky",
            }
            return {
                "gesture": names[action],
                "action": action,
                "meta": {"pinchRatio": round(ratio, 3)},
            }

        if not pinching:
            self.was_pinching = False

        return None
