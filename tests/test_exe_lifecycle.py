"""
End-to-End lifecycle test for dist/InvoiceTracker.exe standalone executable.
"""
import unittest
import subprocess
import time
import urllib.request
import json
import os
import sys
import psutil


class TestExeLifecycle(unittest.TestCase):
    def test_standalone_executable_lifecycle(self):
        exe_path = os.path.abspath("dist/InvoiceTracker.exe")
        self.assertTrue(os.path.isfile(exe_path), f"Executable not found at {exe_path}")

        proc = subprocess.Popen([exe_path])
        try:
            time.sleep(3.5)
            self.assertIsNone(proc.poll(), "InvoiceTracker.exe terminated prematurely!")

            found_port = None
            for p in range(52400, 52450):
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{p}/api/stats", timeout=1) as res:
                        if res.status == 200:
                            found_port = p
                            break
                except Exception:
                    pass

            self.assertIsNotNone(found_port, "Could not find listening port for InvoiceTracker.exe")

            # Check static file serving
            with urllib.request.urlopen(f"http://127.0.0.1:{found_port}/") as res:
                html = res.read().decode("utf-8")
                self.assertIn("<title>", html)

            with urllib.request.urlopen(f"http://127.0.0.1:{found_port}/app.js") as res:
                js = res.read().decode("utf-8")
                self.assertIn("initHeartbeat", js)
                self.assertIn("tabId", js)

            # Check heartbeat
            req = urllib.request.Request(
                f"http://127.0.0.1:{found_port}/api/heartbeat?tab_id=unittest_tab",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req) as res:
                hb = json.loads(res.read().decode("utf-8"))
                self.assertTrue(hb.get("success"))

        finally:
            try:
                parent = psutil.Process(proc.pid)
                for child in parent.children(recursive=True):
                    child.kill()
                parent.kill()
            except Exception:
                pass


if __name__ == "__main__":
    unittest.main()
