@echo off
REM Batch script để khởi chạy backend server

echo ========================================
echo     KHỞI CHẠY BACKEND SERVER
echo ========================================

REM Chuyển đến thư mục scripts
cd /d "%~dp0"

echo Thư mục hiện tại: %CD%

REM Di chuyển lên thư mục cha để tìm backend
cd ..

echo Tìm kiếm backend server...
if exist "package.json" (
    echo Tìm thấy Node.js project
    
    REM Kiểm tra xem có node_modules không
    if not exist "node_modules" (
        echo Cài đặt dependencies...
        npm install
    )
    
    echo Khởi chạy server...
    echo Server sẽ chạy tại http://localhost:3000
    echo Nhấn Ctrl+C để dừng server
    echo.
    
    REM Khởi chạy server
    npm start
    
) else (
    echo LỖI: Không tìm thấy backend server (package.json)
    echo Vui lòng đảm bảo bạn đang ở đúng thư mục
    echo Hoặc khởi chạy backend server thủ công
)

echo.
echo Nhấn phím bất kỳ để đóng...
pause 