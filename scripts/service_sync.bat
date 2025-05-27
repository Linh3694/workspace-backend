@echo off
setlocal enabledelayedexpansion
REM Batch script để chạy đồng bộ như service

echo ========================================
echo     DỊCH VỤ ĐỒNG BỘ TỰ ĐỘNG
echo ========================================

REM Chuyển đến thư mục scripts
cd /d "%~dp0"

echo.
echo Chọn hành động:
echo 1. Khởi chạy dịch vụ đồng bộ (5 phút/lần)
echo 2. Khởi chạy dịch vụ đồng bộ (15 phút/lần)
echo 3. Khởi chạy dịch vụ đồng bộ (30 phút/lần)
echo 4. Khởi chạy dịch vụ đồng bộ (tùy chỉnh)
echo 5. Kiểm tra trạng thái dịch vụ
echo 6. Dừng dịch vụ đồng bộ
echo 7. Xem log dịch vụ
echo.
set /p choice="Nhập lựa chọn (1-7): "

if "%choice%"=="1" (
    echo.
    echo 🚀 Khởi chạy dịch vụ đồng bộ 5 phút/lần...
    start "AutoSync-Service-5min" /min cmd /c "echo 1 | auto_sync.bat"
    echo ✅ Dịch vụ đã được khởi chạy trong background
    echo 📋 Tên cửa sổ: AutoSync-Service-5min
    echo.
    echo 💡 Dịch vụ đang chạy ngầm, có thể đóng cửa sổ này
    echo 🔍 Để kiểm tra: chạy lại và chọn option 5
    goto :end_script
    
) else if "%choice%"=="2" (
    echo.
    echo 🚀 Khởi chạy dịch vụ đồng bộ 15 phút/lần...
    start "AutoSync-Service-15min" /min cmd /c "echo 3 | auto_sync.bat"
    echo ✅ Dịch vụ đã được khởi chạy trong background
    echo 📋 Tên cửa sổ: AutoSync-Service-15min
    echo.
    echo 💡 Dịch vụ đang chạy ngầm, có thể đóng cửa sổ này
    echo 🔍 Để kiểm tra: chạy lại và chọn option 5
    goto :end_script
    
) else if "%choice%"=="3" (
    echo.
    echo 🚀 Khởi chạy dịch vụ đồng bộ 30 phút/lần...
    start "AutoSync-Service-30min" /min cmd /c "echo 4 | auto_sync.bat"
    echo ✅ Dịch vụ đã được khởi chạy trong background
    echo 📋 Tên cửa sổ: AutoSync-Service-30min
    echo.
    echo 💡 Dịch vụ đang chạy ngầm, có thể đóng cửa sổ này
    echo 🔍 Để kiểm tra: chạy lại và chọn option 5
    goto :end_script
    
) else if "%choice%"=="4" (
    set /p custom_interval="Nhập khoảng thời gian (phút): "
    echo.
    echo 🚀 Khởi chạy dịch vụ đồng bộ !custom_interval! phút/lần...
    start "AutoSync-Service-!custom_interval!min" /min cmd /c "echo 6 | auto_sync.bat & echo !custom_interval!"
    echo ✅ Dịch vụ đã được khởi chạy trong background
    echo 📋 Tên cửa sổ: AutoSync-Service-!custom_interval!min
    echo.
    echo 💡 Dịch vụ đang chạy ngầm, có thể đóng cửa sổ này
    echo 🔍 Để kiểm tra: chạy lại và chọn option 5
    goto :end_script
    
) else if "%choice%"=="5" (
    echo.
    echo 🔍 KIỂM TRA TRẠNG THÁI DỊCH VỤ...
    
    REM Tìm các process auto sync
    tasklist /fi "WINDOWTITLE eq AutoSync-Service*" /fo table 2>nul | find "cmd.exe" >nul
    if errorlevel 1 (
        echo ❌ Không có dịch vụ đồng bộ nào đang chạy
    ) else (
        echo ✅ Dịch vụ đồng bộ đang chạy:
        tasklist /fi "WINDOWTITLE eq AutoSync-Service*" /fo table 2>nul | findstr "cmd.exe"
    )
    
    echo.
    echo 📊 LOGS GẦN NHẤT:
    if exist "logs\auto_sync\*.json" (
        for /f %%i in ('dir "logs\auto_sync\sync_*.json" /b /o-d 2^>nul ^| head -3') do (
            echo 📄 %%i
        )
    ) else (
        echo ⚠️ Chưa có log nào
    )
    goto :end_script
    
) else if "%choice%"=="6" (
    echo.
    echo 🛑 DỪNG DỊCH VỤ ĐỒNG BỘ...
    
    REM Tìm và kill các process auto sync
    for /f "tokens=2" %%i in ('tasklist /fi "WINDOWTITLE eq AutoSync-Service*" /fo csv ^| findstr "cmd.exe"') do (
        echo Dừng process %%i...
        taskkill /pid %%i /f >nul 2>&1
    )
    
    REM Kiểm tra lại
    tasklist /fi "WINDOWTITLE eq AutoSync-Service*" /fo table 2>nul | find "cmd.exe" >nul
    if errorlevel 1 (
        echo ✅ Đã dừng tất cả dịch vụ đồng bộ
    ) else (
        echo ⚠️ Một số dịch vụ vẫn đang chạy, thử dừng thủ công
    )
    goto :end_script
    
) else if "%choice%"=="7" (
    echo.
    echo 📋 XEM LOG DỊCH VỤ...
    
    REM Kiểm tra thư mục logs
    if not exist "logs" (
        echo ❌ Thư mục logs chưa tồn tại
        echo 💡 Dịch vụ chưa được chạy lần nào hoặc chưa hoàn thành lần chạy đầu tiên
        echo.
        echo Để tạo logs:
        echo 1. Chạy auto_sync.bat một lần để test
        echo 2. Hoặc đợi dịch vụ auto hoàn thành chu kỳ đầu tiên
        goto :show_help
    )
    
    if not exist "logs\auto_sync" (
        echo ❌ Thư mục logs\auto_sync chưa tồn tại  
        echo 💡 Dịch vụ auto sync chưa được chạy lần nào
        goto :show_help
    )
    
    REM Đếm số file log
    set log_count=0
    for %%f in ("logs\auto_sync\sync_*.json") do set /a log_count+=1
    
    if %log_count%==0 (
        echo ⚠️ Chưa có file log nào trong logs\auto_sync\
        echo 📂 Thư mục tồn tại nhưng trống
        echo.
        dir "logs\auto_sync" /a
        goto :show_help
    )
    
    echo ✅ Tìm thấy %log_count% file log
    echo Logs của dịch vụ đồng bộ tự động (%log_count% files):
    echo.
    
    REM Hiển thị 5 log gần nhất
    set count=0
    for /f %%i in ('dir "logs\auto_sync\sync_*.json" /b /o-d 2^>nul') do (
        set /a count+=1
        if !count! leq 5 (
            echo 📄 %%i
            python -c "
import json, sys, os
try:
    file_path = 'logs/auto_sync/%%i'
    if not os.path.exists(file_path):
        print('   ❌ File không tồn tại')
    else:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        start_time = data.get('start_time', '').replace('T', ' ')[:19]
        success = data.get('successful_devices', 0)
        total = data.get('total_devices', 0)
        failed = data.get('failed_devices', 0)
        duration = data.get('duration_seconds', 0)
        
        print(f'   ⏰ {start_time} | ✅ {success}/{total} | ❌ {failed} | ⏱️ {duration:.1f}s')
        
        if failed > 0:
            failed_devices = [r.get('device_name', 'Unknown') for r in data.get('results', []) if r.get('status') == 'error']
            print(f'   🔴 Lỗi: {', '.join(failed_devices[:3])}')
except Exception as e:
    print(f'   ⚠️ Lỗi đọc file: {e}')
" 2>nul
            echo.
        )
    )
    
    echo 📊 Để xem thống kê chi tiết: monitor_sync.bat
    echo 📁 Thư mục log: logs\auto_sync\
    goto :end_choice
    
    :show_help
    echo.
    echo 🔍 CÁCH KIỂM TRA:
    echo 1. Kiểm tra dịch vụ đang chạy: service_sync.bat option 5
    echo 2. Chạy test đồng bộ: auto_sync.bat option 7 (chạy 1 lần)
    echo 3. Khởi chạy dịch vụ: service_sync.bat option 1  
    echo 4. Đợi 5-10 phút rồi kiểm tra lại logs
    echo.
    echo 💡 Hoặc chạy quick_test.bat option 1 để tạo log test ngay
    
    :end_choice
    goto :end_script
    
) else (
    echo Lựa chọn không hợp lệ
    goto :end_script
)

:end_script
echo.
echo ========================================
echo     QUẢN LÝ DỊCH VỤ HOÀN THÀNH
echo ========================================
echo.
echo 💡 GỢI Ý:
echo - Dịch vụ chạy trong background, có thể đóng cửa sổ này
echo - Logs được lưu tại: logs\auto_sync\
echo - Để xem chi tiết: monitor_sync.bat
echo - Để dừng: chạy lại service_sync.bat và chọn option 6
echo.
pause 