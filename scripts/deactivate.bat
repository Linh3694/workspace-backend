@echo off
REM Batch script để thoát virtual environment

echo ========================================
echo     THOÁT MÔI TRƯỜNG ẢO
echo ========================================

REM Thoát virtual environment
call deactivate 2>nul

echo Virtual environment đã được deactivate
echo Bạn có thể đóng cửa sổ này

pause 