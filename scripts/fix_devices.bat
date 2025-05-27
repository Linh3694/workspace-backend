@echo off
REM Batch script để khắc phục thiết bị lỗi kết nối

echo ========================================
echo     KHẮC PHỤC THIẾT BỊ LỖI KẾT NỐI
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
call venv\Scripts\activate.bat

echo.
echo Phát hiện thiết bị lỗi từ kết quả đồng bộ:
echo ❌ device_002.txt (IP: 10.1.4.16) - Lỗi kết nối
echo ❌ device_003.txt (IP: 10.1.4.12) - Lỗi kết nối
echo.
echo Chọn phương pháp khắc phục:
echo 1. Ping test các IP thiết bị
echo 2. Thử kết nối với timeout tăng dần
echo 3. Reset session và thử lại
echo 4. Kiểm tra config file thiết bị
echo 5. Thử đồng bộ chỉ thiết bị lỗi
echo 6. Tự động khắc phục toàn bộ
echo.
set /p choice="Nhập lựa chọn (1-6): "

if "%choice%"=="1" (
    echo.
    echo 🔍 PING TEST THIẾT BỊ...
    echo Testing device_002 (10.1.4.16):
    ping -n 4 10.1.4.16
    echo.
    echo Testing device_003 (10.1.4.12):
    ping -n 4 10.1.4.12
    echo.
    echo Nếu ping thất bại, kiểm tra:
    echo - Kết nối mạng
    echo - Firewall
    echo - IP thiết bị có đúng không
    
) else if "%choice%"=="2" (
    echo.
    echo ⏱️ THỬ KẾT NỐI VỚI TIMEOUT TĂNG DẦN...
    echo Timeout 5s:
    python timeout_monitor.py --config-dir ./ --test-type connection --timeout 5 --devices device_002.txt,device_003.txt
    echo.
    echo Timeout 15s:
    python timeout_monitor.py --config-dir ./ --test-type connection --timeout 15 --devices device_002.txt,device_003.txt
    echo.
    echo Timeout 30s:
    python timeout_monitor.py --config-dir ./ --test-type connection --timeout 30 --devices device_002.txt,device_003.txt
    
) else if "%choice%"=="3" (
    echo.
    echo 🔄 RESET SESSION VÀ THỬ LẠI...
    python -c "
import requests
import time

devices = [
    {'name': 'device_002', 'ip': '10.1.4.16'},
    {'name': 'device_003', 'ip': '10.1.4.12'}
]

for device in devices:
    print(f'🔄 Reset session cho {device[\"name\"]} ({device[\"ip\"]})...')
    try:
        # Thử logout để reset session
        logout_url = f'http://{device[\"ip\"]}/ISAPI/Security/sessionLogout'
        requests.post(logout_url, timeout=10)
        print(f'✅ Reset session thành công cho {device[\"name\"]}')
        time.sleep(2)
    except Exception as e:
        print(f'⚠️ Không thể reset session {device[\"name\"]}: {e}')
    
print('\n🔍 Thử kết nối lại...')
"
    python timeout_monitor.py --config-dir ./ --test-type connection --devices device_002.txt,device_003.txt
    
) else if "%choice%"=="4" (
    echo.
    echo 📋 KIỂM TRA CONFIG FILE...
    echo Checking device_002.txt:
    if exist "device_002.txt" (
        type device_002.txt
    ) else (
        echo ❌ File device_002.txt không tồn tại
    )
    echo.
    echo Checking device_003.txt:
    if exist "device_003.txt" (
        type device_003.txt
    ) else (
        echo ❌ File device_003.txt không tồn tại
    )
    echo.
    echo Kiểm tra:
    echo - IP address có đúng không
    echo - Username/Password có đúng không
    echo - Port có đúng không (mặc định 80)
    
) else if "%choice%"=="5" (
    echo.
    echo 🔄 ĐỒNG BỘ CHỈ THIẾT BỊ LỖI...
    echo Chạy đồng bộ cho device_002 và device_003 với retry...
    
    REM Tạo config tạm cho thiết bị lỗi
    if not exist "temp_configs" mkdir temp_configs
    copy device_002.txt temp_configs\ >nul 2>&1
    copy device_003.txt temp_configs\ >nul 2>&1
    
    python sync_all_devices.py --config-dir ./temp_configs --backend-url https://api-dev.wellspring.edu.vn --max-retries 3 --connection-timeout 30
    
    REM Dọn dẹp
    if exist "temp_configs" rmdir /s /q temp_configs
    
) else if "%choice%"=="6" (
    echo.
    echo 🤖 TỰ ĐỘNG KHẮC PHỤC TOÀN BỘ...
    
    echo 1/4 Ping test...
    ping -n 2 10.1.4.16 >nul && echo ✅ device_002 ping OK || echo ❌ device_002 ping failed
    ping -n 2 10.1.4.12 >nul && echo ✅ device_003 ping OK || echo ❌ device_003 ping failed
    
    echo.
    echo 2/4 Reset sessions...
    python -c "
import requests
for ip in ['10.1.4.16', '10.1.4.12']:
    try:
        requests.post(f'http://{ip}/ISAPI/Security/sessionLogout', timeout=5)
        print(f'✅ Reset {ip} OK')
    except:
        print(f'⚠️ Reset {ip} failed')
"
    
    echo.
    echo 3/4 Test connection với timeout 30s...
    python timeout_monitor.py --config-dir ./ --test-type connection --timeout 30 --devices device_002.txt,device_003.txt
    
    echo.
    echo 4/4 Thử đồng bộ với settings tối ưu...
    python sync_all_devices.py --config-dir ./ --backend-url https://api-dev.wellspring.edu.vn --max-retries 3 --connection-timeout 30 --read-timeout 60 --devices device_002.txt,device_003.txt
    
) else (
    echo Lựa chọn không hợp lệ
    goto :eof
)

echo.
echo ========================================
echo     HOÀN THÀNH KHẮC PHỤC SỰ CỐ
echo ========================================
echo.
echo 💡 GỢI Ý TIẾP THEO:
echo - Nếu vẫn lỗi, kiểm tra cài đặt mạng thiết bị
echo - Thử truy cập web interface thiết bị: http://10.1.4.16 và http://10.1.4.12
echo - Kiểm tra username/password trong config files
echo - Liên hệ admin mạng nếu ping không thành công
echo.
pause 