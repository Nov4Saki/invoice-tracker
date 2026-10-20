@echo off
title Invoice Tracker & Accounting
cd /d "%~dp0"
python main.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Failed to start with python. Trying py...
    py main.py
    if %ERRORLEVEL% NEQ 0 (
        echo Error: Python 3 is required to run this application.
        pause
    )
)
