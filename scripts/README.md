# 🕐 Attendance Sync Script

Script tự động đồng bộ dữ liệu chấm công từ máy chấm công HIKVISION đến backend Wellspring.

## 📁 Cấu trúc files

```
scripts/
├── hikcon.py                    # Script chính sync dữ liệu
├── run_sync.sh                  # Script shell wrapper
├── manage_service.sh            # Script quản lý service
├── com.wellspring.attendance.plist # Cấu hình launchd
├── requirements.txt             # Python dependencies
├── device_001.txt - device_007.txt # Cấu hình các máy chấm công
├── venv/                        # Virtual environment
└── README.md                    # File này
```

## 🚀 Cách sử dụng

### 1. Test script một lần
```bash
./manage_service.sh test
```

### 2. Khởi động service (chạy mỗi 5 phút)
```bash
./manage_service.sh start
```

### 3. Kiểm tra trạng thái
```bash
./manage_service.sh status
```

### 4. Xem logs
```bash
./manage_service.sh logs
```

### 5. Dừng service
```bash
./manage_service.sh stop
```

### 6. Khởi động lại service
```bash
./manage_service.sh restart
```

## ⚙️ Cấu hình

### Cấu hình máy chấm công (device_xxx.txt)
```
DEVICE_IP=10.1.4.13
USERNAME=admin
PASSWORD=Wellspring#2024
TRACKER_ID=device_001

# Tùy chọn: giới hạn thời gian sync
# START_TIME=2025-05-27
# END_TIME=2025-05-27
```

### Thay đổi tần suất chạy
Sửa file `com.wellspring.attendance.plist`:
- `<integer>300</integer>` = 5 phút (300 giây)
- `<integer>600</integer>` = 10 phút
- `<integer>1800</integer>` = 30 phút

## 📝 Logs

- **Output logs**: `launchd.log`
- **Error logs**: `launchd_error.log`
- **Sync logs**: `sync.log`
- **Cron logs**: `cron.log`

## 🔧 Troubleshooting

### Service không chạy
```bash
# Kiểm tra trạng thái
./manage_service.sh status

# Xem logs lỗi
./manage_service.sh logs

# Khởi động lại
./manage_service.sh restart
```

### Lỗi kết nối máy chấm công
- Kiểm tra IP, username, password trong file device_xxx.txt
- Đảm bảo máy Mac có thể ping đến IP máy chấm công
- Kiểm tra firewall

### Lỗi kết nối backend
- Kiểm tra URL backend trong `hikcon.py`
- Kiểm tra kết nối internet
- Kiểm tra logs để xem response từ server

## 📊 Monitoring

### Kiểm tra logs realtime
```bash
tail -f launchd.log
```

### Kiểm tra số lượng records sync
```bash
grep "records chấm công" launchd.log | tail -10
```

### Kiểm tra lỗi
```bash
grep "❌" launchd.log | tail -10
```

## 🔄 Cập nhật

### Cập nhật script
1. Sửa file `hikcon.py`
2. Khởi động lại service: `./manage_service.sh restart`

### Thêm máy chấm công mới
1. Tạo file `device_xxx.txt` mới
2. Thêm vào list trong `hikcon.py`
3. Khởi động lại service

## 🛡️ Bảo mật

- File cấu hình chứa password, đảm bảo quyền truy cập phù hợp
- Logs có thể chứa thông tin nhạy cảm, cần bảo vệ
- Sử dụng HTTPS cho backend endpoint 