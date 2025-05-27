@echo off
REM Batch script để tự động chạy đồng bộ theo chu kỳ

echo ========================================
echo     ĐỒNG BỘ TỰ ĐỘNG THEO CHU KỲ
echo ========================================

REM Chuyển đến thư mục scripts
cd /d "%~dp0"

REM Kiểm tra virtual environment
if not exist "venv\Scripts\activate.bat" (
    echo LỖI: Virtual environment chưa được tạo
    echo Vui lòng chạy setup.bat trước
    pause
    exit /b 1
)

REM Kích hoạt virtual environment
echo Kích hoạt virtual environment...
call venv\Scripts\activate.bat

echo.
echo Chọn chế độ đồng bộ tự động:
echo 1. Đồng bộ cứ 5 phút một lần
echo 2. Đồng bộ cứ 10 phút một lần  
echo 3. Đồng bộ cứ 15 phút một lần
echo 4. Đồng bộ cứ 30 phút một lần
echo 5. Đồng bộ cứ 1 giờ một lần
echo 6. Tùy chỉnh khoảng thời gian
echo 7. Chạy một lần duy nhất và thoát
echo.
set /p choice="Nhập lựa chọn (1-7): "

REM Thiết lập khoảng thời gian
if "%choice%"=="1" (
    set interval_minutes=5
    set interval_seconds=300
) else if "%choice%"=="2" (
    set interval_minutes=10
    set interval_seconds=600
) else if "%choice%"=="3" (
    set interval_minutes=15
    set interval_seconds=900
) else if "%choice%"=="4" (
    set interval_minutes=30
    set interval_seconds=1800
) else if "%choice%"=="5" (
    set interval_minutes=60
    set interval_seconds=3600
) else if "%choice%"=="6" (
    set /p interval_minutes="Nhập khoảng thời gian (phút): "
    set /a interval_seconds=%interval_minutes%*60
) else if "%choice%"=="7" (
    set interval_minutes=0
    set interval_seconds=0
) else (
    echo Lựa chọn không hợp lệ
    pause
    exit /b 1
)

REM Tạo thư mục logs nếu chưa có
if not exist "logs" mkdir logs
if not exist "logs\auto_sync" mkdir logs\auto_sync

REM Hiển thị thông tin
echo.
echo ========================================
echo     THIẾT LẬP ĐỒNG BỘ TỰ ĐỘNG
echo ========================================
if "%interval_minutes%"=="0" (
    echo Chế độ: Chạy một lần duy nhất
) else (
    echo Chu kỳ: %interval_minutes% phút
    echo Khoảng cách: %interval_seconds% giây
)
echo Backend URL: https://api-dev.wellspring.edu.vn
echo Log folder: logs\auto_sync\
echo.
echo 💡 Để dừng, nhấn Ctrl+C
echo ========================================

REM Biến đếm lần chạy
set run_count=0

:sync_loop
set /a run_count+=1

REM Tạo timestamp cho log
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "timestamp=%YYYY%-%MM%-%DD%_%HH%-%Min%-%Sec%"

echo.
echo 🔄 [%date% %time%] Bắt đầu đồng bộ lần %run_count%...

REM Chạy đồng bộ với log
python sync_all_devices.py --config-dir ./ --backend-url https://api-dev.wellspring.edu.vn --output logs\auto_sync\sync_%timestamp%.json

REM Kiểm tra kết quả và hiển thị summary
if errorlevel 1 (
    echo ❌ [%date% %time%] Đồng bộ lần %run_count% THẤT BẠI
    echo Kết quả: LỖI - Kiểm tra log để biết chi tiết
) else (
    echo ✅ [%date% %time%] Đồng bộ lần %run_count% THÀNH CÔNG
    
    REM Phân tích kết quả nhanh
    python -c "
import json, sys
try:
    with open('logs/auto_sync/sync_%timestamp%.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    success = data.get('successful_devices', 0)
    total = data.get('total_devices', 0)
    failed = data.get('failed_devices', 0)
    records = data.get('total_records_processed', 0)
    duration = data.get('duration_seconds', 0)
    
    print(f'📊 Kết quả: {success}/{total} thiết bị thành công, {failed} lỗi')
    print(f'📁 Records: {records} | ⏱️ Thời gian: {duration:.1f}s')
    
    if failed > 0:
        failed_devices = [r.get('device_name', 'Unknown') for r in data.get('results', []) if r.get('status') == 'error']
        print(f'❌ Thiết bị lỗi: {', '.join(failed_devices)}')
except:
    print('⚠️ Không thể đọc kết quả chi tiết')
" 2>nul
)

REM Nếu chỉ chạy một lần thì thoát
if "%interval_minutes%"=="0" (
    echo.
    echo ✅ Đồng bộ một lần hoàn thành
    goto :end
)

REM Tính toán thời gian chạy tiếp theo
call :calculate_next_time

echo.
echo ⏰ Chạy tiếp theo: %next_time%
echo 💤 Đang chờ %interval_minutes% phút...
echo    (Nhấn Ctrl+C để dừng)

REM Đếm ngược với hiển thị progress
set remaining_seconds=%interval_seconds%
:countdown_loop
if %remaining_seconds% leq 0 goto :sync_loop

REM Hiển thị progress mỗi 30 giây
set /a display_mod=%remaining_seconds% %% 30
if %display_mod%==0 (
    set /a remaining_minutes=%remaining_seconds%/60
    echo 💤 Còn lại: %remaining_minutes% phút %remaining_seconds% giây...
)

REM Chờ 1 giây
timeout /t 1 /nobreak >nul 2>&1
set /a remaining_seconds-=1
goto :countdown_loop

:calculate_next_time
REM Tính toán thời gian chạy tiếp theo
for /f "tokens=1-3 delims=:" %%a in ('echo %time%') do (
    set /a current_hour=%%a
    set /a current_minute=%%b
    set /a current_second=%%c
)

set /a next_minute=%current_minute%+%interval_minutes%
set /a next_hour=%current_hour%

REM Xử lý overflow phút
if %next_minute% geq 60 (
    set /a next_hour+=1
    set /a next_minute-=60
)

REM Xử lý overflow giờ  
if %next_hour% geq 24 (
    set /a next_hour-=24
)

REM Format với leading zero
if %next_hour% lss 10 set next_hour=0%next_hour%
if %next_minute% lss 10 set next_minute=0%next_minute%

set next_time=%next_hour%:%next_minute%
goto :eof

:end
echo.
echo ========================================
echo     KẾT THÚC ĐỒNG BỘ TỰ ĐỘNG
echo ========================================
echo Tổng số lần chạy: %run_count%
echo Logs được lưu tại: logs\auto_sync\
echo.
echo 📊 Để xem thống kê chi tiết, chạy: monitor_sync.bat
echo 🔧 Để khắc phục thiết bị lỗi, chạy: fix_devices.bat
echo.
pause 