@echo off
setlocal

:: Set UTF-8 encoding for proper Unicode support
chcp 65001 >nul 2>&1

:: Script de chay hikcon.py voi virtual environment tren Windows
:: Duong dan tuyet doi den thu muc script
set SCRIPT_DIR=%~dp0

:: Chuyen den thu muc script
cd /d "%SCRIPT_DIR%"

:: Kiem tra virtual environment
if exist "venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
) else (
    echo Virtual environment not found, using system Python...
)

:: Chay script Python va ghi log
echo [%date% %time%] Starting attendance sync... >> sync.log

:: Set PYTHONIOENCODING to handle Unicode properly
set PYTHONIOENCODING=utf-8
python hikcon.py >> sync.log 2>> sync_error.log

:: Ghi ket qua voi timestamp
echo [%date% %time%] Sync completed >> sync.log
echo. >> sync.log

:: Deactivate virtual environment neu co
if exist "venv\Scripts\deactivate.bat" (
    call deactivate
)

endlocal 