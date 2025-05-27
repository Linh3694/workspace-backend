@echo off
REM Batch script để thiết lập môi trường virtual environment cho Windows

echo ========================================
echo     THIẾT LẬP MÔI TRƯỜNG PYTHON
echo ========================================

REM Chuyển đến thư mục scripts
cd /d "%~dp0"

echo Thư mục hiện tại: %CD%

REM Kiểm tra xem Python đã cài đặt chưa
python --version >nul 2>&1
if errorlevel 1 (
    echo LỖI: Python chưa được cài đặt hoặc không có trong PATH
    echo Vui lòng cài đặt Python từ https://python.org
    pause
    exit /b 1
)

echo Python đã được cài đặt: 
python --version

REM Tạo virtual environment nếu chưa có
if not exist "venv" (
    echo Tạo virtual environment mới...
    python -m venv venv
    if errorlevel 1 (
        echo LỖI: Không thể tạo virtual environment
        pause
        exit /b 1
    )
    echo Virtual environment đã được tạo thành công!
) else (
    echo Virtual environment đã tồn tại
)

REM Kích hoạt virtual environment
echo Kích hoạt virtual environment...
call venv\Scripts\activate.bat

REM Cập nhật pip
echo Cập nhật pip...
python -m pip install --upgrade pip

REM Cài đặt dependencies
echo Cài đặt dependencies từ requirements.txt...
pip install -r requirements.txt
if errorlevel 1 (
    echo LỖI: Không thể cài đặt dependencies
    pause
    exit /b 1
)

echo.
echo ========================================
echo     THIẾT LẬP HOÀN THÀNH THÀNH CÔNG!
echo ========================================
echo.
echo Để sử dụng:
echo 1. Chạy run_sync.bat để đồng bộ dữ liệu chấm công
echo 2. Chạy test_devices.bat để kiểm tra kết nối thiết bị
echo 3. Chạy deactivate.bat để thoát môi trường ảo
echo.
pause 