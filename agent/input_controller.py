import ctypes
from ctypes import wintypes

user32 = ctypes.windll.user32

INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002

MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010

VK_CONTROL = 0x11
VK_C = 0x43
VK_V = 0x56
VK_LWIN = 0x5B
VK_SNAPSHOT = 0x2C

ULONG_PTR = wintypes.WPARAM


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class _INPUTUNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT)]


class INPUT(ctypes.Structure):
    _anonymous_ = ("union",)
    _fields_ = [("type", wintypes.DWORD), ("union", _INPUTUNION)]


def _ensure_desktop():
    try:
        hdesk = user32.OpenInputDesktop(0, False, 0x01FF)
        if hdesk:
            user32.SetThreadDesktop(hdesk)
    except Exception:
        pass


def _send(inputs):
    _ensure_desktop()
    array_type = INPUT * len(inputs)
    payload = array_type(*inputs)
    sent = user32.SendInput(len(inputs), payload, ctypes.sizeof(INPUT))
    if sent != len(inputs):
        for item in inputs:
            if item.type == INPUT_MOUSE:
                user32.mouse_event(
                    item.mi.dwFlags,
                    item.mi.dx,
                    item.mi.dy,
                    item.mi.mouseData,
                    item.mi.dwExtraInfo,
                )
            elif item.type == INPUT_KEYBOARD:
                user32.keybd_event(
                    item.ki.wVk,
                    item.ki.wScan,
                    item.ki.dwFlags,
                    item.ki.dwExtraInfo,
                )


def _mouse(flags):
    return INPUT(type=INPUT_MOUSE, mi=MOUSEINPUT(0, 0, 0, flags, 0, 0))


def _key(vk, up=False):
    flags = KEYEVENTF_KEYUP if up else 0
    return INPUT(type=INPUT_KEYBOARD, ki=KEYBDINPUT(vk, 0, flags, 0, 0))


class WindowsInputController:
    def __init__(self):
        user32.SetProcessDPIAware()
        self.screen_w = user32.GetSystemMetrics(0)
        self.screen_h = user32.GetSystemMetrics(1)

    def move_to(self, x, y):
        x = max(0, min(self.screen_w - 1, int(x)))
        y = max(0, min(self.screen_h - 1, int(y)))
        user32.SetCursorPos(x, y)

    def left_click(self):
        _send([_mouse(MOUSEEVENTF_LEFTDOWN), _mouse(MOUSEEVENTF_LEFTUP)])

    def right_click(self):
        _send([_mouse(MOUSEEVENTF_RIGHTDOWN), _mouse(MOUSEEVENTF_RIGHTUP)])

    def hotkey(self, *keys):
        _send([*[_key(vk) for vk in keys], *[_key(vk, True) for vk in reversed(keys)]])

    def copy(self):
        self.hotkey(VK_CONTROL, VK_C)

    def paste(self):
        self.hotkey(VK_CONTROL, VK_V)

    def screenshot(self):
        self.hotkey(VK_LWIN, VK_SNAPSHOT)

    def perform(self, action):
        actions = {
            "left_click": self.left_click,
            "right_click": self.right_click,
            "copy": self.copy,
            "paste": self.paste,
            "screenshot": self.screenshot,
        }
        callback = actions.get(action)
        if callback:
            callback()
