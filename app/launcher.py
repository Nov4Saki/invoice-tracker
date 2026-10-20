"""
Desktop Window Launcher for Invoice Tracker.
Launches the app in a standalone native desktop window using:
1. pywebview (preferred - native Windows desktop window via Edge WebView2 runtime)
2. Microsoft Edge App Mode (fallback with heartbeat keep-alive)
3. Google Chrome App Mode (fallback with heartbeat keep-alive)
4. Default web browser (universal fallback with heartbeat keep-alive)
"""

import os
import sys
import subprocess
import threading
import time
import webbrowser
import socket
from app.server import run_server, server_state
from app import db


def get_base_dir():
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        parent_dir = os.path.dirname(exe_dir)
        parent_data_db = os.path.join(parent_dir, "data", "invoices.db")
        local_data_db = os.path.join(exe_dir, "data", "invoices.db")
        if not os.path.exists(local_data_db) and os.path.exists(parent_data_db):
            return parent_dir
        return exe_dir
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_app_data_dir():
    return os.path.join(get_base_dir(), "data", "app_profile")


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
    # Ensure database schema, migrations, and defaults are initialized
    db.init_db()

    if port is None:
        port = find_free_port()

    server = run_server(port=port)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    url = f"http://127.0.0.1:{port}"
    print(f"[*] Invoice Tracker Server running on {url}")

    app_data_dir = get_app_data_dir()
    os.makedirs(app_data_dir, exist_ok=True)
    webview_storage = os.path.join(app_data_dir, "webview_cache")
    os.makedirs(webview_storage, exist_ok=True)

    # 1. Primary Desktop Window: pywebview (Edge WebView2)
    pywebview_success = False

    def verify_pywebview(win):
        nonlocal pywebview_success
        for _ in range(30):
            time.sleep(0.1)
            if server_state.heartbeat_received:
                pywebview_success = True
                return

        # If no heartbeat after 3 seconds, check if pywebview failed to initialize web content
        if not server_state.heartbeat_received:
            print("[!] pywebview window did not connect to server (WebView2 may be unavailable). Falling back...")
            try:
                win.destroy()
            except Exception:
                pass

    try:
        import webview
        print("[*] Launching native desktop window via pywebview...")
        window = webview.create_window(
            title="Invoice Tracker & Financial Reports | نظام الفواتير والمحاسبة",
            url=url,
            width=1280,
            height=850,
            min_size=(980, 650),
            text_select=True,
            confirm_close=False,
        )
        webview.start(verify_pywebview, window, private_mode=False, storage_path=webview_storage)

        if pywebview_success:
            print("[*] pywebview window closed by user. Shutting down server...")
            server.shutdown()
            server.server_close()
            return
        else:
            print("[*] pywebview could not render page. Continuing to desktop browser fallback...")
    except Exception as e:
        print(f"[!] pywebview desktop window could not be started: {e}")

    # 2. Fallbacks: Edge App Mode, Chrome App Mode, or Default Web Browser
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

    if not launched_process and chrome_bin:
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
        print("[*] Opening in default web browser...")
        webbrowser.open(url)

    # 3. Server Keep-Alive & Heartbeat Monitor
    # Edge/Chrome processes on Windows may exit immediately after delegating to
    # a running browser instance. We must not terminate the server when launched_process exits with 0.
    # Instead, we monitor client heartbeats and shut down only when the window is actually closed.
    print("[*] Application active. Press Ctrl+C in terminal to stop.")
    start_time = time.time()
    initial_grace_period = 45.0  # seconds to wait for initial page load / heartbeat

    try:
        while True:
            time.sleep(1.0)

            # Check if all client tabs/windows closed and grace period expired
            if not server_state.should_keep_running(heartbeat_timeout=15.0, close_grace=4.0):
                print("[*] Application window closed by user. Shutting down server...")
                break

            # Initial connection timeout check
            if not server_state.heartbeat_received:
                # If launched process stayed alive for > 5s, it may be an isolated browser process
                if launched_process and (time.time() - start_time) > 5.0 and launched_process.poll() is None:
                    continue

                if (time.time() - start_time) > initial_grace_period:
                    if not launched_process or launched_process.poll() is not None:
                        print("[*] Initial connection timeout. Shutting down server...")
                        break

    except KeyboardInterrupt:
        print("\n[*] Interrupted by user. Shutting down server...")
    finally:
        if launched_process and launched_process.poll() is None:
            try:
                launched_process.terminate()
            except Exception:
                pass
        server.shutdown()
        server.server_close()
        print("[*] Server stopped cleanly.")


if __name__ == "__main__":
    launch_app()
