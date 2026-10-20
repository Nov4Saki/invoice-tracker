"""
Main Test Runner for Invoice Tracker & Accounting.
Discovers and executes all unit and integration tests.
Run with: python tests/run_tests.py
"""

import unittest
import sys
import os

# Put project root in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=os.path.dirname(__file__), pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
