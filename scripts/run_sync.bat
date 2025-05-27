@echo off
REM Batch script để chạy đồng bộ chấm công với virtual environment trên Windows

echo ========================================
echo     ĐỒNG BỘ DỮ LIỆU CHẤM CÔNG
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

REM Kiểm tra xem có tham số dòng lệnh không
if "%~1"=="" (
    REM Nếu không có tham số, chạy lệnh mặc định
    echo Chạy đồng bộ tất cả thiết bị với cấu hình mặc định...
    python sync_all_devices.py --config-dir ./ --backend-url https://api-dev.wellspring.edu.vn
) else (
    REM Nếu có tham số, chạy lệnh được truyền vào
    echo Chạy lệnh: %*
    %*
)

if errorlevel 1 (
    echo.
    echo LỖI: Quá trình đồng bộ thất bại
    echo Vui lòng kiểm tra log để biết thêm chi tiết
) else (
    echo.
    echo THÀNH CÔNG: Đồng bộ dữ liệu hoàn thành
)

echo.
echo Nhấn phím bất kỳ để đóng...
pause 