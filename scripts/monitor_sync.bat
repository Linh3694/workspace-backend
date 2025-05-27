@echo off
REM Batch script để theo dõi và phân tích kết quả đồng bộ

echo ========================================
echo     THEO DÕI VÀ PHÂN TÍCH ĐỒNG BỘ
echo ========================================

REM Chuyển đến thư mục scripts
cd /d "%~dp0"

REM Kiểm tra virtual environment có tồn tại không
if not exist "venv\Scripts\activate.bat" (
    echo LỖI: Virtual environment chưa được tạo
    echo Vui lòng chạy setup.bat trước để thiết lập môi trường
    pause
    exit /b 1
)

REM Kích hoạt virtual environment
echo Kích hoạt virtual environment...
call venv\Scripts\activate.bat

echo.
echo Chọn chế độ theo dõi:
echo 1. Chạy đồng bộ và lưu kết quả chi tiết
echo 2. Chỉ kiểm tra thiết bị lỗi từ lần chạy trước
echo 3. Thống kê tổng quan các lần chạy
echo 4. Chạy đồng bộ với retry cho thiết bị lỗi
echo 5. Xuất báo cáo Excel
echo.
set /p choice="Nhập lựa chọn (1-5): "

REM Tạo thư mục logs nếu chưa có
if not exist "logs" mkdir logs

REM Tạo tên file log với timestamp
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "timestamp=%YYYY%-%MM%-%DD%_%HH%-%Min%-%Sec%"

if "%choice%"=="1" (
    echo Chạy đồng bộ với log chi tiết...
    echo Kết quả sẽ được lưu vào: logs\sync_result_%timestamp%.json
    python sync_all_devices.py --config-dir ./ --backend-url https://api-dev.wellspring.edu.vn --output logs\sync_result_%timestamp%.json --verbose
    echo.
    echo Phân tích kết quả...
    python -c "
import json, sys
try:
    with open('logs/sync_result_%timestamp%.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    print('📊 KẾT QUẢ ĐỒNG BỘ:')
    print(f'✅ Thành công: {data.get(\"successful_devices\", 0)}/{data.get(\"total_devices\", 0)} thiết bị')
    print(f'❌ Thất bại: {data.get(\"failed_devices\", 0)} thiết bị')
    print(f'⏱️ Thời gian: {data.get(\"duration_seconds\", 0):.1f} giây')
    print(f'📁 Records xử lý: {data.get(\"total_records_processed\", 0)}')
    
    failed = [r for r in data.get('results', []) if r.get('status') == 'error']
    if failed:
        print('\n❌ THIẾT BỊ LỖI:')
        for device in failed:
            print(f'  - {device.get(\"device_name\", \"Unknown\")}: {device.get(\"message\", \"Unknown error\")}')
except Exception as e:
    print(f'Lỗi đọc file kết quả: {e}')
"
    
) else if "%choice%"=="2" (
    echo Kiểm tra thiết bị lỗi...
    echo Danh sách thiết bị có vấn đề:
    echo - device_002.txt (IP: 10.1.4.16) - Lỗi kết nối
    echo - device_003.txt (IP: 10.1.4.12) - Lỗi kết nối
    echo.
    echo Chạy test kết nối cho các thiết bị này...
    python timeout_monitor.py --config-dir ./ --test-type connection --devices device_002.txt,device_003.txt
    
) else if "%choice%"=="3" (
    echo Thống kê tổng quan...
    if exist "logs\*.json" (
        python -c "
import json, os, glob
from datetime import datetime

print('📈 THỐNG KÊ TỔNG QUAN:')
log_files = glob.glob('logs/sync_result_*.json')
if not log_files:
    print('Chưa có file log nào')
    exit()

total_runs = len(log_files)
successful_devices = 0
failed_devices = 0
total_records = 0

for file in log_files[-5:]:  # 5 lần chạy gần nhất
    try:
        with open(file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        successful_devices += data.get('successful_devices', 0)
        failed_devices += data.get('failed_devices', 0)
        total_records += data.get('total_records_processed', 0)
        
        # Hiển thị từng lần chạy
        start_time = data.get('start_time', '').replace('T', ' ')[:19]
        print(f'🕐 {start_time}: {data.get(\"successful_devices\", 0)}/{data.get(\"total_devices\", 0)} thành công')
    except:
        continue

print(f'\n📊 TỔNG KẾT {min(5, total_runs)} lần chạy gần nhất:')
print(f'✅ Tổng thiết bị thành công: {successful_devices}')
print(f'❌ Tổng thiết bị thất bại: {failed_devices}')
print(f'📁 Tổng records xử lý: {total_records}')
if successful_devices + failed_devices > 0:
    success_rate = (successful_devices / (successful_devices + failed_devices)) * 100
    print(f'📈 Tỷ lệ thành công: {success_rate:.1f}%%')
"
    ) else (
        echo Chưa có dữ liệu thống kê
        echo Vui lòng chạy option 1 trước để tạo log
    )
    
) else if "%choice%"=="4" (
    echo Chạy đồng bộ với retry cho thiết bị lỗi...
    echo Sẽ thử lại các thiết bị: device_002, device_003
    python sync_all_devices.py --config-dir ./ --backend-url https://api-dev.wellspring.edu.vn --retry-failed --max-retries 3 --output logs\retry_result_%timestamp%.json
    
) else if "%choice%"=="5" (
    echo Xuất báo cáo Excel...
    python -c "
import json, glob, pandas as pd
from datetime import datetime

try:
    log_files = glob.glob('logs/sync_result_*.json')
    if not log_files:
        print('Không có dữ liệu để xuất báo cáo')
        exit()
    
    data = []
    for file in log_files:
        with open(file, 'r', encoding='utf-8') as f:
            result = json.load(f)
        
        data.append({
            'Thời gian': result.get('start_time', '').replace('T', ' ')[:19],
            'Tổng thiết bị': result.get('total_devices', 0),
            'Thành công': result.get('successful_devices', 0),
            'Thất bại': result.get('failed_devices', 0),
            'Timeout': result.get('timeout_devices', 0),
            'Records xử lý': result.get('total_records_processed', 0),
            'Thời gian chạy (s)': result.get('duration_seconds', 0)
        })
    
    df = pd.DataFrame(data)
    excel_file = f'logs/sync_report_{datetime.now().strftime(\"%Y%m%d_%H%M%S\")}.xlsx'
    df.to_excel(excel_file, index=False)
    print(f'📊 Đã xuất báo cáo Excel: {excel_file}')
    
except ImportError:
    print('❌ Cần cài pandas để xuất Excel: pip install pandas openpyxl')
except Exception as e:
    print(f'❌ Lỗi xuất báo cáo: {e}')
"
    
) else (
    echo Lựa chọn không hợp lệ
    goto :eof
)

if errorlevel 1 (
    echo.
    echo ❌ Có lỗi xảy ra trong quá trình thực hiện
) else (
    echo.
    echo ✅ Hoàn thành thành công
)

echo.
echo Nhấn phím bất kỳ để đóng...
pause 