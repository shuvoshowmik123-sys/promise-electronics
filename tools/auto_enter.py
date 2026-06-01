"""
Auto Enter Clicker — Promise Electronics
Presses Enter every 2 seconds while running. Click Start to begin, Stop to end.
No pip installs needed — uses built-in ctypes (Windows).
"""

import tkinter as tk
import threading
import time
import ctypes

INTERVAL = 2  # seconds between each Enter press

VK_RETURN = 0x0D

def press_enter():
    ctypes.windll.user32.keybd_event(VK_RETURN, 0, 0, 0)      # key down
    time.sleep(0.05)
    ctypes.windll.user32.keybd_event(VK_RETURN, 0, 0x0002, 0) # key up


running = False
count   = 0

def clicker_loop(status_var, count_var, start_btn, stop_btn):
    global running, count
    while running:
        press_enter()
        count += 1
        count_var.set(f"Enter pressed: {count}")
        time.sleep(INTERVAL)
    status_var.set("Stopped.")
    start_btn.config(state="normal")
    stop_btn.config(state="disabled")


def on_start(status_var, count_var, start_btn, stop_btn):
    global running, count
    running = True
    count   = 0
    status_var.set("Running — pressing Enter every 2 sec...")
    start_btn.config(state="disabled")
    stop_btn.config(state="normal")
    t = threading.Thread(target=clicker_loop,
                         args=(status_var, count_var, start_btn, stop_btn),
                         daemon=True)
    t.start()


def on_stop():
    global running
    running = False


def main():
    root = tk.Tk()
    root.title("Auto Enter — Promise Electronics")
    root.geometry("360x200")
    root.resizable(False, False)
    root.configure(bg="#1a1a2e")

    tk.Label(root, text="Auto Enter Clicker", font=("Arial", 14, "bold"),
             bg="#1a1a2e", fg="#e94560").pack(pady=(20, 4))

    status_var = tk.StringVar(value="Ready. Click Start.")
    tk.Label(root, textvariable=status_var, font=("Arial", 10),
             bg="#1a1a2e", fg="#00d4ff", wraplength=320).pack(pady=4)

    count_var = tk.StringVar(value="Enter pressed: 0")
    tk.Label(root, textvariable=count_var, font=("Consolas", 9),
             bg="#1a1a2e", fg="#00ff88").pack(pady=2)

    btn_frame = tk.Frame(root, bg="#1a1a2e")
    btn_frame.pack(pady=14)

    stop_btn  = tk.Button(btn_frame, text="Stop", state="disabled",
                          bg="#555555", fg="white", font=("Arial", 11, "bold"),
                          padx=20, pady=6, command=on_stop)
    start_btn = tk.Button(btn_frame, text="Start",
                          bg="#00d4ff", fg="#000000", font=("Arial", 11, "bold"),
                          padx=20, pady=6)
    start_btn.config(command=lambda: on_start(status_var, count_var, start_btn, stop_btn))

    start_btn.pack(side="left", padx=10)
    stop_btn.pack(side="left", padx=10)

    root.mainloop()


if __name__ == "__main__":
    main()
