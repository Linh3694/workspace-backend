@echo off
setlocal

:: Set UTF-8 encoding for proper Unicode support
chcp 65001 >nul 2>&1

:: Script to run hikcon.py with virtual environment on Windows
:: Absolute path to script directory
set SCRIPT_DIR=%~dp0

:: Change to script directory
cd /d "%SCRIPT_DIR%"

:: Create logs directory if it doesn't exist
if not exist "logs" mkdir "logs"

:: Generate date-based log file names
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "TODAY=%YYYY%-%MM%-%DD%"

set LOG_FILE=logs\sync_%TODAY%.log
set ERROR_LOG=logs\sync_error_%TODAY%.log

:: Check virtual environment
if exist "venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
) else (
    echo Virtual environment not found, using system Python...
)

:: Run Python script and write logs
echo [%date% %time%] Starting attendance sync... >> %LOG_FILE%

:: Set PYTHONIOENCODING to handle Unicode properly
set PYTHONIOENCODING=utf-8
python hikcon.py >> %LOG_FILE% 2>> %ERROR_LOG%

:: Write result with timestamp
echo [%date% %time%] Sync completed >> %LOG_FILE%
echo. >> %LOG_FILE%

:: Deactivate virtual environment if exists
if exist "venv\Scripts\deactivate.bat" (
    call deactivate
)

endlocal 