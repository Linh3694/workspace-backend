@echo off
setlocal EnableDelayedExpansion

:: Đường dẫn script - Thay đổi theo thư mục thực tế của bạn
set SCRIPT_DIR=%~dp0
set SERVICE_NAME=WellspringAttendanceSync
set PYTHON_SCRIPT=%SCRIPT_DIR%hikcon.py
set LOG_FILE=%SCRIPT_DIR%sync.log
set ERROR_LOG=%SCRIPT_DIR%sync_error.log

:: Lấy tham số đầu vào
set ACTION=%1

if "%ACTION%"=="start" goto START
if "%ACTION%"=="stop" goto STOP
if "%ACTION%"=="restart" goto RESTART
if "%ACTION%"=="status" goto STATUS
if "%ACTION%"=="logs" goto LOGS
if "%ACTION%"=="test" goto TEST
if "%ACTION%"=="install" goto INSTALL
if "%ACTION%"=="uninstall" goto UNINSTALL
goto HELP

:START
echo 🚀 Bắt đầu service attendance sync...
echo.
echo Tạo scheduled task để chạy mỗi 5 phút...

schtasks /create /tn "%SERVICE_NAME%" /tr "cmd /c \"%SCRIPT_DIR%run_sync.bat\"" /sc minute /mo 5 /f >nul 2>&1

if %errorlevel%==0 (
    echo ✅ Service đã được khởi động và sẽ chạy mỗi 5 phút
    echo 📝 Logs sẽ được ghi vào:
    echo    - Output: %LOG_FILE%
    echo    - Error: %ERROR_LOG%
) else (
    echo ❌ Lỗi khi tạo scheduled task. Bạn có thể cần chạy với quyền Administrator
)
goto END

:STOP
echo 🛑 Dừng service attendance sync...
schtasks /delete /tn "%SERVICE_NAME%" /f >nul 2>&1

if %errorlevel%==0 (
    echo ✅ Service đã được dừng
) else (
    echo ⚠️ Service có thể đã được dừng trước đó hoặc chưa được tạo
)
goto END

:RESTART
echo 🔄 Khởi động lại service...
call :STOP
timeout /t 2 >nul
call :START
goto END

:STATUS
echo 📊 Trạng thái service:
schtasks /query /tn "%SERVICE_NAME%" >nul 2>&1

if %errorlevel%==0 (
    echo ✅ Service đang chạy
    schtasks /query /tn "%SERVICE_NAME%" /fo LIST | findstr /C:"Task Name" /C:"Status" /C:"Next Run Time"
) else (
    echo ❌ Service không chạy
)
goto END

:LOGS
echo 📝 Xem logs gần nhất:
echo === OUTPUT LOGS ===
if exist "%LOG_FILE%" (
    powershell -Command "Get-Content '%LOG_FILE%' | Select-Object -Last 20"
) else (
    echo Chưa có logs
)
echo.
echo === ERROR LOGS ===
if exist "%ERROR_LOG%" (
    powershell -Command "Get-Content '%ERROR_LOG%' | Select-Object -Last 20"
) else (
    echo Chưa có error logs
)
goto END

:TEST
echo 🧪 Test chạy script một lần...
call "%SCRIPT_DIR%run_sync.bat"
goto END

:INSTALL
echo 🔧 Cài đặt dependencies và thiết lập môi trường...
call "%SCRIPT_DIR%setup_windows.bat"
goto END

:UNINSTALL
echo 🗑️ Gỡ bỏ service...
call :STOP
echo ✅ Service đã được gỡ bỏ
goto END

:HELP
echo Cách sử dụng: %0 {start^|stop^|restart^|status^|logs^|test^|install^|uninstall}
echo.
echo Các lệnh:
echo   start     - Bắt đầu service (chạy mỗi 5 phút)
echo   stop      - Dừng service
echo   restart   - Khởi động lại service
echo   status    - Kiểm tra trạng thái service
echo   logs      - Xem logs gần nhất
echo   test      - Chạy thử script một lần
echo   install   - Cài đặt dependencies và thiết lập
echo   uninstall - Gỡ bỏ service
echo.
echo Ví dụ:
echo   %0 install    - Thiết lập lần đầu
echo   %0 test       - Test chạy một lần
echo   %0 start      - Bắt đầu service tự động

:END
endlocal 