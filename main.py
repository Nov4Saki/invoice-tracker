"""
Main Entry Point for Invoice Tracker Desktop App.
Run with: python main.py
"""

import sys
import os

# Ensure current directory is on python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.launcher import launch_app

import multiprocessing

if __name__ == "__main__":
    multiprocessing.freeze_support()
    launch_app()
