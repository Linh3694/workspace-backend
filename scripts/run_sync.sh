#!/bin/bash

# Script để chạy hikcon.py với virtual environment
# Đường dẫn tuyệt đối đến thư mục script
SCRIPT_DIR="/Users/linh/staff-portal-web-only/staff-portal/workspace-backend/scripts"

# Chuyển đến thư mục script
cd "$SCRIPT_DIR"

# Kích hoạt virtual environment và chạy script
source venv/bin/activate && python hikcon.py

# Log kết quả với timestamp
echo "$(date): Sync completed" >> sync.log 