# Hệ Thống Chấm Công HIKVISION

Hệ thống tích hợp máy chấm công HIKVISION với Staff Portal Backend, tự động lấy dữ liệu chấm công và lưu trữ với logic chỉ giữ lại thời gian vào/ra đầu tiên và cuối cùng mỗi ngày.

## 🏗️ Kiến Trúc Hệ Thống

```
Máy Chấm Công HIKVISION → Python Client → Node.js Backend → MongoDB
```

### Các Thành Phần

1. **TimeAttendance Model**: Lưu trữ dữ liệu chấm công
2. **TimeAttendance Controller**: Xử lý logic API
3. **Python Client**: Kết nối với máy chấm công HIKVISION
4. **Scheduler Scripts**: Đồng bộ tự động

## 📊 Database Schema

### TimeAttendance Collection

```javascript
{
  employeeCode: String,      // Mã nhân viên từ máy chấm công
  date: Date,               // Ngày chấm công (00:00:00)
  checkInTime: Date,        // Thời gian vào đầu tiên trong ngày
  checkOutTime: Date,       // Thời gian ra cuối cùng trong ngày
  totalCheckIns: Number,    // Tổng số lần chấm công trong ngày
  deviceId: String,         // ID thiết bị chấm công
  trackerId: String,        // ID tracker
  user: ObjectId,           // Reference đến Users collection
  status: String,           // active, processed, error
  notes: String,            // Ghi chú
  rawData: [{               // Dữ liệu thô từ máy chấm công
    timestamp: Date,
    deviceId: String,
    recordedAt: Date
  }]
}
```

## 🚀 API Endpoints

### Upload Dữ Liệu Chấm Công
```http
POST /api/attendance/upload
Content-Type: application/json

{
  "data": [
    {
      "fingerprintCode": "123456",
      "dateTime": "2024-01-15 08:30:00",
      "device_id": "192.168.1.100"
    }
  ],
  "tracker_id": "device_001"
}
```

### Lấy Dữ Liệu Chấm Công
```http
GET /api/attendance/records?startDate=2024-01-01&endDate=2024-01-31&employeeCode=123456&page=1&limit=100
```

### Thống Kê Chấm Công
```http
GET /api/attendance/stats?startDate=2024-01-01&endDate=2024-01-31
```

### Chi Tiết Nhân Viên
```http
GET /api/attendance/employee/123456?startDate=2024-01-01&endDate=2024-01-31
```

### Cập Nhật Ghi Chú
```http
PUT /api/attendance/record/:recordId/notes
Content-Type: application/json

{
  "notes": "Ghi chú mới",
  "status": "processed"
}
```

### Đồng Bộ Với Users
```http
POST /api/attendance/sync-users
```

## 🐍 Python Client Usage

### Cài Đặt Dependencies
```bash
cd workspace-backend/scripts
pip install -r requirements.txt
```

## ⚠️ Cải Thiện Timeout (2025-05-26)

**Đã sửa triệt để các lỗi timeout với những cải tiến sau:**

### ✅ Các tính năng mới:

1. **Enhanced Retry Strategy**: 
   - Exponential backoff với 5 lần retry
   - Tự động phát hiện và xử lý lỗi 401 Unauthorized
   - Refresh session tự động khi timeout

2. **Circuit Breaker Pattern**: 
   - Tự động tạm dừng thiết bị lỗi nhiều lần
   - Recovery timeout 10 phút
   - Giảm tải hệ thống khi có thiết bị problematic

3. **Timeout Configuration**:
   - **Connection Timeout**: 10s (kết nối ban đầu)
   - **Read Timeout**: 60s (đọc response)  
   - **Device Sync Timeout**: 20 phút/thiết bị (configurable)
   - **Batch Size**: Giảm xuống 5 records/request, 50 records/upload

4. **Concurrency Control**:
   - Giới hạn tối đa 3 workers đồng thời
   - Staggered connection với 2s delay giữa các thiết bị
   - Progress tracking real-time

5. **Timeout Monitor Tool**:
   ```bash
   # Test kết nối tất cả thiết bị
   python timeout_monitor.py --config-dir ./configs --test-type both
   
   # Test chỉ connection với timeout 5s
   python timeout_monitor.py --config-dir ./configs --test-type connection --timeout 5
   
   # Test API với timeout 30s
   python timeout_monitor.py --config-dir ./configs --test-type api --api-timeout 30 --output test_results.json
   ```

### 🔧 Sử dụng cải tiến mới:

```bash
# Đồng bộ với timeout 15 phút/thiết bị
python sync_all_devices.py \
  --config-dir ./configs/ \
  --backend-url http://localhost:3000 \
  --max-workers 2 \
  --device-timeout-minutes 15

# Monitor timeout issues
python timeout_monitor.py \
  --config-dir ./configs \
  --test-type both \
  --timeout 10 \
  --api-timeout 30 \
  --verbose
```

### Tạo File Cấu Hình
Tạo file `device_config.txt`:
```
DEVICE_IP=192.168.1.100
USERNAME=admin
PASSWORD=password123
TRACKER_ID=device_001
START_TIME=2024-01-01
END_TIME=2024-01-31
```

### Chạy Đồng Bộ Một Máy
```bash
python hikvision_client.py --config device_001.txt --backend-url http://localhost:3000
```

### Chạy Đồng Bộ Với Khoảng Thời Gian
```bash
python hikvision_client.py \
  --config device_config.txt \
  --backend-url http://localhost:3000 \
  --start-date 2024-01-01 \
  --end-date 2024-01-31 \
  --verbose
```

### Chạy Đồng Bộ Nhiều Máy
```bash
python sync_all_devices.py \
  --config-dir ./configs/ \
  --backend-url http://localhost:3000 \
  --max-workers 5 \
  --output sync_result.json
```

### Chạy Đồng Bộ Thiết Bị Cụ Thể
```bash
python sync_all_devices.py \
  --config-dir ./configs/ \
  --devices device_001 device_002 \
  --start-date 2024-01-01 \
  --end-date 2024-01-31
```

## ⚙️ Cấu Hình Tự Động

### Cron Job (Linux/Mac)
Thêm vào crontab:
```bash
# Đồng bộ mỗi giờ
0 * * * * cd /path/to/scripts && python sync_all_devices.py --config-dir ./configs --backend-url http://localhost:3000

# Đồng bộ mỗi ngày lúc 6:00 AM
0 6 * * * cd /path/to/scripts && python sync_all_devices.py --config-dir ./configs --backend-url http://localhost:3000 --start-date $(date -d "yesterday" +\%Y-\%m-\%d) --end-date $(date +\%Y-\%m-\%d)
```

### Task Scheduler (Windows)
Tạo batch file `sync_attendance.bat`:
```batch
@echo off
cd /d "C:\path\to\scripts"
python sync_all_devices.py --config-dir ./configs --backend-url http://localhost:3000
```

## 🔧 Troubleshooting

### Lỗi Kết Nối Máy Chấm Công
```bash
# Kiểm tra kết nối
ping 192.168.1.100

# Test API HIKVISION
curl -u admin:password123 http://192.168.1.100/ISAPI/System/deviceInfo
```

### Lỗi Upload Backend
```bash
# Kiểm tra backend
curl http://localhost:3000/api/attendance/health

# Test upload
curl -X POST http://localhost:3000/api/attendance/upload \
  -H "Content-Type: application/json" \
  -d '{"data":[{"fingerprintCode":"test","dateTime":"2024-01-01 08:00:00"}]}'
```

### Debug Mode
```bash
python hikvision_client.py --config device_config.txt --verbose
```

## 📝 Logs

- `hikvision_client.log`: Log của single device client
- `sync_all_devices.log`: Log của multi-device syncer
- Backend logs: Xem trong console hoặc log files của Node.js

## 🔐 Security Notes

1. **Bảo mật file config**: Không commit file config chứa password vào git
2. **Network security**: Đảm bảo máy chấm công ở trong mạng nội bộ
3. **API authentication**: Cân nhắc thêm authentication cho upload endpoint
4. **Database security**: Sử dụng MongoDB authentication và encryption

## 📈 Monitoring & Performance

### Metrics Cần Theo Dõi
- Số lượng records được xử lý mỗi ngày
- Thời gian đồng bộ trung bình
- Tỷ lệ lỗi kết nối
- Dung lượng database

### Optimization Tips
- Chạy đồng bộ trong giờ ít traffic
- Sử dụng batch size phù hợp (100-500 records/batch)
- Monitor memory usage của Node.js
- Tạo index cho MongoDB queries

## 🆘 Support

Nếu gặp vấn đề:
1. Kiểm tra logs
2. Test kết nối network
3. Verify credentials
4. Check MongoDB connection
5. Liên hệ team support

## 📅 Changelog

### v1.0.0 (2024-01-15)
- ✅ TimeAttendance model với logic first/last check-in
- ✅ RESTful API endpoints
- ✅ Python client cho HIKVISION
- ✅ Multi-device sync support
- ✅ Comprehensive logging
- ✅ Error handling và retry logic 