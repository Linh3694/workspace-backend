#!/bin/bash
# Script để chạy đồng bộ chấm công với virtual environment

# Chuyển đến thư mục scripts
cd "$(dirname "$0")"

# Kích hoạt virtual environment
source attendance_env/bin/activate

# Chạy lệnh được truyền vào
exec "$@" 