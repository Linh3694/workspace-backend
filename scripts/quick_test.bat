@echo off
setlocal enabledelayedexpansion
REM Batch script để test nhanh và debug

echo ========================================
echo     TEST NHANH HỆ THỐNG
echo ========================================

REM Chuyển đến thư mục scripts
cd /d "%~dp0"

echo.
echo Chọn test:
echo 1. Test đồng bộ một lần (tạo log)
echo 2. Kiểm tra thư mục và files
echo 3. Test kết nối virtual environment  
echo 4. Xem logs hiện có
echo 5. Dọn dẹp logs cũ
echo.
set /p choice="Nhập lựa chọn (1-5): "

if "%choice%"=="1" (
    echo.
    echo 🧪 TEST ĐỒNG BỘ MỘT LẦN...
    
    REM Kiểm tra virtual environment
    if not exist "venv\Scripts\activate.bat" (
        echo ❌ Virtual environment chưa được tạo
        echo 💡 Chạy setup.bat trước
        pause
        exit /b 1
    )
    
    echo Kích hoạt virtual environment...
    call venv\Scripts\activate.bat
    
    echo Tạo thư mục logs...
    if not exist "logs" mkdir logs
    if not exist "logs\auto_sync" mkdir logs\auto_sync
    
    echo Chạy đồng bộ test...
    python sync_all_devices.py --config-dir ./ --backend-url https://api-dev.wellspring.edu.vn --output logs\auto_sync\test_sync.json
    
    if errorlevel 1 (
        echo ❌ Test thất bại
    ) else (
        echo ✅ Test thành công!
        echo 📄 Log được tạo: logs\auto_sync\test_sync.json
        
        if exist "logs\auto_sync\test_sync.json" (
            echo.
            echo 📊 Kết quả test:
            python -c "
import json
try:
    with open('logs/auto_sync/test_sync.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f'✅ Thành công: {data.get(\"successful_devices\", 0)}/{data.get(\"total_devices\", 0)} thiết bị')
    print(f'❌ Thất bại: {data.get(\"failed_devices\", 0)} thiết bị') 
    print(f'⏱️ Thời gian: {data.get(\"duration_seconds\", 0):.1f} giây')
    print(f'📁 Records: {data.get(\"total_records_processed\", 0)}')
except Exception as e:
    print(f'⚠️ Lỗi đọc kết quả: {e}')
"
        )
    )
    
) else if "%choice%"=="2" (
    echo.
    echo 🔍 KIỂM TRA THƯ MỤC VÀ FILES...
    
    echo Thư mục hiện tại: %CD%
    echo.
    
    echo 📂 Kiểm tra virtual environment:
    if exist "venv" (
        echo ✅ Thư mục venv tồn tại
        if exist "venv\Scripts\activate.bat" (
            echo ✅ activate.bat tồn tại
        ) else (
            echo ❌ activate.bat không tồn tại
        )
    ) else (
        echo ❌ Thư mục venv không tồn tại
    )
    
    echo.
    echo 📂 Kiểm tra logs:
    if exist "logs" (
        echo ✅ Thư mục logs tồn tại
        if exist "logs\auto_sync" (
            echo ✅ Thư mục logs\auto_sync tồn tại
            
            set log_count=0
            for %%f in ("logs\auto_sync\*.json") do set /a log_count+=1
            echo 📄 Số file log: !log_count!
            
            if !log_count! gtr 0 (
                echo 📋 Danh sách logs:
                dir "logs\auto_sync\*.json" /b /o-d
            )
        ) else (
            echo ❌ Thư mục logs\auto_sync không tồn tại
        )
    ) else (
        echo ❌ Thư mục logs không tồn tại
    )
    
    echo.
    echo 📂 Kiểm tra files scripts:
    echo ✅ auto_sync.bat: & if exist "auto_sync.bat" (echo Tồn tại) else (echo Không tồn tại)
    echo ✅ service_sync.bat: & if exist "service_sync.bat" (echo Tồn tại) else (echo Không tồn tại)
    echo ✅ sync_all_devices.py: & if exist "sync_all_devices.py" (echo Tồn tại) else (echo Không tồn tại)
    
) else if "%choice%"=="3" (
    echo.
    echo 🔍 TEST VIRTUAL ENVIRONMENT...
    
    if not exist "venv\Scripts\activate.bat" (
        echo ❌ Virtual environment chưa được tạo
        echo 💡 Chạy setup.bat để tạo
        goto :eof
    )
    
    echo Kích hoạt virtual environment...
    call venv\Scripts\activate.bat
    
    echo Test Python:
    python --version
    
    echo.
    echo Test các package:
    python -c "
try:
    import requests
    print('✅ requests OK')
except ImportError:
    print('❌ requests missing')

try:
    import json
    print('✅ json OK')
except ImportError:
    print('❌ json missing')
    
try:
    import configparser
    print('✅ configparser OK')  
except ImportError:
    print('❌ configparser missing')
"
    
) else if "%choice%"=="4" (
    echo.
    echo 📋 XEM LOGS HIỆN CÓ...
    
    if not exist "logs\auto_sync" (
        echo ❌ Thư mục logs\auto_sync không tồn tại
        echo 💡 Chạy option 1 để tạo test log
        goto :eof
    )
    
    set log_count=0
    for %%f in ("logs\auto_sync\*.json") do set /a log_count+=1
    
    if %log_count%==0 (
        echo ⚠️ Không có log files
        echo 📂 Thư mục tồn tại nhưng trống
        dir "logs\auto_sync" /a
    ) else (
        echo ✅ Tìm thấy %log_count% log files:
        echo.
        
        for /f %%i in ('dir "logs\auto_sync\*.json" /b /o-d') do (
            echo 📄 %%i
            python -c "
import json, os
try:
    with open('logs/auto_sync/%%i', 'r', encoding='utf-8') as f:
        data = json.load(f)
    start_time = data.get('start_time', 'Unknown')[:19].replace('T', ' ')
    success = data.get('successful_devices', 0)
    total = data.get('total_devices', 0)
    print(f'   📅 {start_time} | ✅ {success}/{total} thiết bị')
except:
    print('   ⚠️ Không đọc được file')
" 2>nul
            echo.
        )
    )
    
) else if "%choice%"=="5" (
    echo.
    echo 🧹 DỌN DẸP LOGS CŨ...
    
    if exist "logs\auto_sync\*.json" (
        set /p confirm="Xóa tất cả log files? (y/N): "
        if /i "!confirm!"=="y" (
            del "logs\auto_sync\*.json" /q
            echo ✅ Đã xóa tất cả log files
        ) else (
            echo ❌ Hủy bỏ
        )
    ) else (
        echo ⚠️ Không có log files để xóa
    )
    
) else (
    echo Lựa chọn không hợp lệ
)

echo.
echo 💡 Gợi ý tiếp theo:
echo - Nếu logs trống: Chạy option 1 để tạo test log
echo - Sau đó test: service_sync.bat option 7
echo - Hoặc khởi chạy auto: service_sync.bat option 1
echo.
pause 