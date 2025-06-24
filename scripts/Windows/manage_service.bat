@echo off
setlocal EnableDelayedExpansion

:: Script path - Change according to your actual directory
set SCRIPT_DIR=%~dp0
set SERVICE_NAME=WellspringAttendanceSync
set PYTHON_SCRIPT=%SCRIPT_DIR%hikcon.py

:: Create logs directory if it doesn't exist
if not exist "%SCRIPT_DIR%logs" mkdir "%SCRIPT_DIR%logs"

:: Generate date-based log file names
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "TODAY=%YYYY%-%MM%-%DD%"

set LOG_FILE=%SCRIPT_DIR%logs\sync_%TODAY%.log
set ERROR_LOG=%SCRIPT_DIR%logs\sync_error_%TODAY%.log

:: Get input parameter
set ACTION=%1

if "%ACTION%"=="start" goto START
if "%ACTION%"=="stop" goto STOP
if "%ACTION%"=="restart" goto RESTART
if "%ACTION%"=="status" goto STATUS
if "%ACTION%"=="logs" goto LOGS
if "%ACTION%"=="test" goto TEST
if "%ACTION%"=="install" goto INSTALL
if "%ACTION%"=="uninstall" goto UNINSTALL
if "%ACTION%"=="cleanup" goto CLEANUP
goto HELP

:START
echo 🚀 Starting attendance sync service...
echo.
echo Creating scheduled task to run every 5 minutes...

schtasks /create /tn "%SERVICE_NAME%" /tr "cmd /c \"%SCRIPT_DIR%run_sync.bat\"" /sc minute /mo 5 /f >nul 2>&1

if %errorlevel%==0 (
    echo ✅ Service has been started and will run every 5 minutes
    echo 📝 Logs will be written to:
    echo    - Output: %LOG_FILE%
    echo    - Error: %ERROR_LOG%
    echo    - Log Directory: %SCRIPT_DIR%logs\
) else (
    echo ❌ Error creating scheduled task. You may need to run as Administrator
)
goto END

:STOP
echo 🛑 Stopping attendance sync service...
schtasks /delete /tn "%SERVICE_NAME%" /f >nul 2>&1

if %errorlevel%==0 (
    echo ✅ Service has been stopped
) else (
    echo ⚠️ Service may have been stopped previously or not created yet
)
goto END

:RESTART
echo 🔄 Restarting service...
call :STOP
timeout /t 2 >nul
call :START
goto END

:STATUS
echo 📊 Service status:
schtasks /query /tn "%SERVICE_NAME%" >nul 2>&1

if %errorlevel%==0 (
    echo ✅ Service is running
    schtasks /query /tn "%SERVICE_NAME%" /fo LIST | findstr /C:"Task Name" /C:"Status" /C:"Next Run Time"
) else (
    echo ❌ Service is not running
)
goto END

:LOGS
echo 📝 Viewing recent logs:
echo === OUTPUT LOGS (Today: %TODAY%) ===
if exist "%LOG_FILE%" (
    powershell -Command "Get-Content '%LOG_FILE%' | Select-Object -Last 20"
) else (
    echo No logs for today
)
echo.
echo === ERROR LOGS (Today: %TODAY%) ===
if exist "%ERROR_LOG%" (
    powershell -Command "Get-Content '%ERROR_LOG%' | Select-Object -Last 20"
) else (
    echo No error logs for today
)
echo.
echo 📂 Available log files:
if exist "%SCRIPT_DIR%logs\*.log" (
    dir "%SCRIPT_DIR%logs\*.log" /b /o-d | powershell -Command "$input | Select-Object -First 10"
) else (
    echo No log files found
)
goto END

:TEST
echo 🧪 Testing script execution once...
call "%SCRIPT_DIR%run_sync.bat"
goto END

:INSTALL
echo 🔧 Installing dependencies and setting up environment...
call "%SCRIPT_DIR%setup_windows.bat"
goto END

:UNINSTALL
echo 🗑️ Removing service...
call :STOP
echo ✅ Service has been removed
goto END

:CLEANUP
echo 🧹 Cleaning up old log files...
echo Removing log files older than 30 days...
forfiles /p "%SCRIPT_DIR%logs" /s /m *.log /d -30 /c "cmd /c del @path" 2>nul
if %errorlevel%==0 (
    echo ✅ Old log files cleaned up
) else (
    echo ⚠️ No old log files to clean or cleanup failed
)
goto END

:HELP
echo Usage: %0 {start^|stop^|restart^|status^|logs^|test^|install^|uninstall^|cleanup}
echo.
echo Commands:
echo   start     - Start service (runs every 5 minutes)
echo   stop      - Stop service
echo   restart   - Restart service
echo   status    - Check service status
echo   logs      - View recent logs
echo   test      - Run script once for testing
echo   install   - Install dependencies and setup
echo   uninstall - Remove service
echo   cleanup   - Clean up old log files (older than 30 days)
echo.
echo Examples:
echo   %0 install    - Initial setup
echo   %0 test       - Test run once
echo   %0 start      - Start automatic service
echo   %0 logs       - View today's logs
echo   %0 cleanup    - Clean old logs
echo.
echo Log files are organized by date in the 'logs' folder:
echo   - Daily output: logs\sync_YYYY-MM-DD.log
echo   - Daily errors: logs\sync_error_YYYY-MM-DD.log

:END
endlocal 