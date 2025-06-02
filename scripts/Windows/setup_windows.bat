@echo off
setlocal EnableDelayedExpansion

echo =========================================================
echo    🚀 Wellspring Attendance Sync - Windows Setup
echo =========================================================
echo.

:: Lấy đường dẫn script hiện tại
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo 📁 Thư mục hiện tại: %SCRIPT_DIR%
echo.

:: Bước 1: Kiểm tra Python
echo 🐍 Bước 1: Kiểm tra Python...
python --version >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=*" %%a in ('python --version 2^>^&1') do set PYTHON_VERSION=%%a
    echo ✅ Python đã được cài đặt: !PYTHON_VERSION!
) else (
    echo ❌ Python chưa được cài đặt!
    echo 💡 Vui lòng tải và cài đặt Python từ: https://www.python.org/downloads/
    echo    - Chọn "Add Python to PATH" khi cài đặt
    echo    - Phiên bản khuyến nghị: Python 3.8 trở lên
    pause
    exit /b 1
)
echo.

:: Bước 2: Kiểm tra pip
echo 📦 Bước 2: Kiểm tra pip...
pip --version >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=*" %%a in ('pip --version 2^>^&1') do set PIP_VERSION=%%a
    echo ✅ pip đã sẵn sàng: !PIP_VERSION!
) else (
    echo ❌ pip không khả dụng! Đang cài đặt...
    python -m ensurepip --upgrade
)
echo.

:: Bước 3: Tạo virtual environment
echo 🔧 Bước 3: Thiết lập Virtual Environment...
if exist "venv" (
    echo ⚠️ Virtual environment đã tồn tại
    echo 🗑️ Xóa virtual environment cũ...
    rmdir /s /q venv
)

echo 📦 Tạo virtual environment mới...
python -m venv venv
if %errorlevel%==0 (
    echo ✅ Virtual environment đã được tạo
) else (
    echo ❌ Lỗi khi tạo virtual environment
    pause
    exit /b 1
)
echo.

:: Bước 4: Kích hoạt virtual environment và cài đặt packages
echo 📚 Bước 4: Cài đặt Python packages...
call venv\Scripts\activate.bat

echo 🔄 Cập nhật pip...
python -m pip install --upgrade pip

echo 📋 Cài đặt requirements...
if exist "requirements.txt" (
    pip install -r requirements.txt
    if %errorlevel%==0 (
        echo ✅ Đã cài đặt thành công từ requirements.txt
    ) else (
        echo ❌ Lỗi khi cài đặt từ requirements.txt
    )
) else (
    echo ⚠️ Không tìm thấy requirements.txt, cài đặt packages cơ bản...
    pip install pytz==2023.3 requests==2.31.0
    if %errorlevel%==0 (
        echo ✅ Đã cài đặt packages cơ bản
    ) else (
        echo ❌ Lỗi khi cài đặt packages
    )
)

call deactivate
echo.

:: Bước 5: Kiểm tra files cấu hình
echo ⚙️ Bước 5: Kiểm tra files cấu hình...
set FOUND_DEVICE=0
for %%f in (device_*.txt) do (
    if exist "%%f" (
        echo ✅ Tìm thấy file cấu hình: %%f
        set FOUND_DEVICE=1
    )
)

if !FOUND_DEVICE!==0 (
    echo ⚠️ Không tìm thấy file cấu hình máy chấm công
    echo 💡 Vui lòng tạo file device_001.txt với nội dung:
    echo.
    echo # Cấu hình máy chấm công HIKVISION
    echo DEVICE_IP=10.1.4.13
    echo USERNAME=admin
    echo PASSWORD=Wellspring#2024
    echo TRACKER_ID=device_001
    echo.
) else (
    echo ✅ Đã có file cấu hình máy chấm công
)
echo.

:: Bước 6: Kiểm tra script chính
echo 🔍 Bước 6: Kiểm tra files script...
set REQUIRED_FILES=hikcon.py manage_service.bat run_sync.bat
for %%f in (%REQUIRED_FILES%) do (
    if exist "%%f" (
        echo ✅ %%f
    ) else (
        echo ❌ Thiếu file: %%f
    )
)
echo.

:: Bước 7: Test chạy script
echo 🧪 Bước 7: Test script (tùy chọn)...
echo Bạn có muốn test chạy script một lần không? (y/n)
set /p TEST_CHOICE="Nhập lựa chọn: "
if /i "!TEST_CHOICE!"=="y" (
    echo 🚀 Đang chạy test...
    call run_sync.bat
    echo ✅ Test hoàn tất, kiểm tra logs để xem kết quả
) else (
    echo ⏭️ Bỏ qua test
)
echo.

:: Kết thúc
echo =========================================================
echo                   🎉 SETUP HOÀN TẤT!
echo =========================================================
echo.
echo 📖 Các bước tiếp theo:
echo.
echo 1. 🔧 Cấu hình máy chấm công:
echo    - Chỉnh sửa file device_001.txt (hoặc tạo thêm device_002.txt...)
echo    - Điền đúng IP, username, password của máy chấm công
echo.
echo 2. 🧪 Test chạy một lần:
echo    manage_service.bat test
echo.
echo 3. 🚀 Khởi động service tự động:
echo    manage_service.bat start
echo.
echo 4. 📊 Kiểm tra trạng thái:
echo    manage_service.bat status
echo.
echo 5. 📝 Xem logs:
echo    manage_service.bat logs
echo.
echo 💡 Để sử dụng PowerShell (khuyến nghị):
echo    .\manage_service.ps1 -Action start
echo.
echo 📚 Đọc README_Windows.md để biết thêm chi tiết
echo.

pause
endlocal 