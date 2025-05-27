#!/bin/bash

PLIST_FILE="/Users/linh/staff-portal-web-only/staff-portal/workspace-backend/scripts/com.wellspring.attendance.plist"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
SERVICE_NAME="com.wellspring.attendance"

case "$1" in
    start)
        echo "🚀 Bắt đầu service attendance sync..."
        
        # Tạo thư mục LaunchAgents nếu chưa có
        mkdir -p "$LAUNCHD_DIR"
        
        # Copy plist file vào LaunchAgents
        cp "$PLIST_FILE" "$LAUNCHD_DIR/"
        
        # Load service
        launchctl load "$LAUNCHD_DIR/com.wellspring.attendance.plist"
        
        echo "✅ Service đã được khởi động và sẽ chạy mỗi 5 phút"
        echo "📝 Logs sẽ được ghi vào:"
        echo "   - Output: $(dirname $PLIST_FILE)/launchd.log"
        echo "   - Error: $(dirname $PLIST_FILE)/launchd_error.log"
        ;;
        
    stop)
        echo "🛑 Dừng service attendance sync..."
        launchctl unload "$LAUNCHD_DIR/com.wellspring.attendance.plist"
        echo "✅ Service đã được dừng"
        ;;
        
    restart)
        echo "🔄 Khởi động lại service..."
        launchctl unload "$LAUNCHD_DIR/com.wellspring.attendance.plist" 2>/dev/null
        launchctl load "$LAUNCHD_DIR/com.wellspring.attendance.plist"
        echo "✅ Service đã được khởi động lại"
        ;;
        
    status)
        echo "📊 Trạng thái service:"
        if launchctl list | grep -q "$SERVICE_NAME"; then
            echo "✅ Service đang chạy"
            launchctl list | grep "$SERVICE_NAME"
        else
            echo "❌ Service không chạy"
        fi
        ;;
        
    logs)
        echo "📝 Xem logs gần nhất:"
        echo "=== OUTPUT LOGS ==="
        tail -20 "$(dirname $PLIST_FILE)/launchd.log" 2>/dev/null || echo "Chưa có logs"
        echo ""
        echo "=== ERROR LOGS ==="
        tail -20 "$(dirname $PLIST_FILE)/launchd_error.log" 2>/dev/null || echo "Chưa có error logs"
        ;;
        
    test)
        echo "🧪 Test chạy script một lần..."
        /Users/linh/staff-portal-web-only/staff-portal/workspace-backend/scripts/run_sync.sh
        ;;
        
    *)
        echo "Cách sử dụng: $0 {start|stop|restart|status|logs|test}"
        echo ""
        echo "Các lệnh:"
        echo "  start   - Bắt đầu service (chạy mỗi 5 phút)"
        echo "  stop    - Dừng service"
        echo "  restart - Khởi động lại service"
        echo "  status  - Kiểm tra trạng thái service"
        echo "  logs    - Xem logs gần nhất"
        echo "  test    - Chạy thử script một lần"
        exit 1
        ;;
esac 