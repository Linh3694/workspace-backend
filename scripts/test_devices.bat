@echo off
REM Batch script để kiểm tra kết nối thiết bị chấm công

echo ========================================
echo     KIỂM TRA KẾT NỐI THIẾT BỊ
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
echo Chọn loại kiểm tra:
echo 1. Kiểm tra kết nối tất cả thiết bị
echo 2. Kiểm tra kết nối thiết bị
echo 3. Kiểm tra API backend
echo 4. Kiểm tra tất cả (kết nối + API)
echo 5. Tùy chỉnh timeout và lưu kết quả
echo.
set /p choice="Nhập lựa chọn (1-5): "

if "%choice%"=="1" (
    echo Kiểm tra kết nối tất cả thiết bị...
    python timeout_monitor.py --config-dir ./configs --test-type connection
) else if "%choice%"=="2" (
    echo Kiểm tra kết nối thiết bị với timeout mặc định...
    python timeout_monitor.py --config-dir ./configs --test-type connection
) else if "%choice%"=="3" (
    echo Kiểm tra API backend...
    python timeout_monitor.py --config-dir ./configs --test-type api
) else if "%choice%"=="4" (
    echo Kiểm tra toàn bộ hệ thống...
    python timeout_monitor.py --config-dir ./configs --test-type both
) else if "%choice%"=="5" (
    set /p timeout="Nhập timeout (giây, mặc định 10): "
    set /p api_timeout="Nhập API timeout (giây, mặc định 30): "
    if "%timeout%"=="" set timeout=10
    if "%api_timeout%"=="" set api_timeout=30
    echo Chạy test với timeout %timeout%s và API timeout %api_timeout%s...
    python timeout_monitor.py --config-dir ./configs --test-type both --timeout %timeout% --api-timeout %api_timeout% --output test_results.json
    echo Kết quả đã được lưu vào test_results.json
) else (
    echo Lựa chọn không hợp lệ. Chạy kiểm tra mặc định...
    python timeout_monitor.py --config-dir ./configs --test-type both
)

if errorlevel 1 (
    echo.
    echo LỖI: Quá trình kiểm tra thất bại
    echo Vui lòng kiểm tra log để biết thêm chi tiết
) else (
    echo.
    echo THÀNH CÔNG: Kiểm tra hoàn thành
)

echo.
echo Nhấn phím bất kỳ để đóng...
pause 