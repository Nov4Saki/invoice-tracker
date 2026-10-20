"""
Desktop Window Launcher for Invoice Tracker.
Launches the app in a standalone native desktop window using:
1. Microsoft Edge App Mode (default on Windows 10/11 - zero dependencies, native frameless desktop app feel)
2. Google Chrome App Mode
3. pywebview (if installed)
4. Default web browser (universal fallback)
"""

import os
import sys
import subprocess
import threading
import time
import webbrowser
import socket
from app.server import run_server


def find_free_port(start_port=52400):
    for port in range(start_port, start_port + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return start_port


def get_edge_path():
    paths = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return None


def get_chrome_path():
    paths = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return None


def launch_app(port=None):
    if port is None:
        port = find_free_port()

    server = run_server(port=port)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    url = f"http://127.0.0.1:{port}"
    print(f"[*] Invoice Tracker Server running on {url}")

    # Create temporary isolated profile dir for app-mode to ensure standalone window
    app_data_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "app_profile"
    )
    os.makedirs(app_data_dir, exist_ok=True)

    edge_bin = get_edge_path()
    chrome_bin = get_chrome_path()

    launched_process = None

    if edge_bin:
        cmd = [
            edge_bin,
            f"--app={url}",
            f"--user-data-dir={app_data_dir}",
            "--window-size=1280,850",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions"
        ]
        try:
            print("[*] Launching native window via Microsoft Edge App Mode...")
            launched_process = subprocess.Popen(cmd)
        except Exception as e:
            print(f"[!] Failed to launch Edge: {e}")

    elif chrome_bin:
        cmd = [
            chrome_bin,
            f"--app={url}",
            f"--user-data-dir={app_data_dir}",
            "--window-size=1280,850",
            "--no-first-run"
        ]
        try:
            print("[*] Launching native window via Chrome App Mode...")
            launched_process = subprocess.Popen(cmd)
        except Exception as e:
            print(f"[!] Failed to launch Chrome: {e}")

    if not launched_process:
        # Fallback to pywebview if installed
        try:
            import webview
            print("[*] Launching native window via pywebview...")
            webview.create_window(
                "Invoice Tracker & Financial Reports | نظام الفواتير والمحاسبة",
                url,
                width=1280,
                height=850,
                min_size=(980, 650)
            )
            webview.start()
            server.shutdown()
            return
        except Exception:
            pass

        # Universal fallback to default browser
        print("[*] Opening in default web browser...")
        webbrowser.open(url)

    if launched_process:
        try:
            # Wait for app window to close, then gracefully stop server
            launched_process.wait()
        except KeyboardInterrupt:
            pass
        finally:
            server.shutdown()
    else:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            server.shutdown()


if __name__ == "__main__":
    launch_app()
