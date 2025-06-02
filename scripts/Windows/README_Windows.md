# 🕐 Attendance Sync Script - Windows Version

Script tự động đồng bộ dữ liệu chấm công từ máy chấm công HIKVISION đến backend Wellspring trên Windows.

## 📁 Cấu trúc files

```
scripts-windows/
├── hikcon.py                    # Script chính sync dữ liệu  
├── manage_service.bat           # Script quản lý service (Batch)
├── manage_service.ps1           # Script quản lý service (PowerShell - Khuyến nghị)
├── run_sync.bat                 # Script wrapper chạy Python
├── setup_windows.bat            # Script thiết lập tự động
├── requirements.txt             # Python dependencies
├── device_001.txt               # Cấu hình máy chấm công mẫu
├── venv/                        # Virtual environment (sau khi setup)
└── README_Windows.md            # File này
```

## 🚀 Cài đặt và thiết lập

### Bước 1: Cài đặt Python
1. Tải Python từ [python.org](https://www.python.org/downloads/)
2. **Quan trọng**: Chọn "Add Python to PATH" khi cài đặt
3. Phiên bản khuyến nghị: Python 3.8 trở lên

### Bước 2: Thiết lập tự động
```cmd
# Chạy script setup tự động
setup_windows.bat
```

Script sẽ tự động:
- ✅ Kiểm tra Python và pip
- ✅ Tạo virtual environment
- ✅ Cài đặt dependencies
- ✅ Kiểm tra files cấu hình

### Bước 3: Cấu hình máy chấm công
Chỉnh sửa file `device_001.txt`:
```
DEVICE_IP=10.1.4.13
USERNAME=admin  
PASSWORD=Wellspring#2024
TRACKER_ID=device_001
```

## 🎯 Cách sử dụng

### Sử dụng Command Prompt (Batch)

#### Test script một lần
```cmd
manage_service.bat test
```

#### Khởi động service (chạy mỗi 5 phút)
```cmd
manage_service.bat start
```

#### Kiểm tra trạng thái
```cmd
manage_service.bat status
```

#### Xem logs
```cmd
manage_service.bat logs
```

#### Dừng service
```cmd
manage_service.bat stop
```

### Sử dụng PowerShell (Khuyến nghị)

#### Test script một lần
```powershell
.\manage_service.ps1 -Action test
```

#### Khởi động service
```powershell
.\manage_service.ps1 -Action start
```

#### Kiểm tra trạng thái
```powershell
.\manage_service.ps1 -Action status
```

#### Xem logs với màu sắc
```powershell
.\manage_service.ps1 -Action logs
```

#### Monitor logs realtime
```powershell
.\manage_service.ps1 -Action monitor
```

#### Dừng service
```powershell
.\manage_service.ps1 -Action stop
```

## ⚙️ Cấu hình chi tiết

### Cấu hình máy chấm công (device_xxx.txt)
```
# Thông tin kết nối
DEVICE_IP=10.1.4.13
USERNAME=admin
PASSWORD=Wellspring#2024
TRACKER_ID=device_001

# Tùy chọn: giới hạn thời gian sync
START_TIME=2025-01-01
END_TIME=2025-01-31
```

### Thêm nhiều máy chấm công
1. Copy `device_001.txt` thành `device_002.txt`, `device_003.txt`...
2. Thay đổi thông tin trong từng file
3. Script sẽ tự động đọc tất cả file `device_*.txt`

### Thay đổi tần suất chạy
Mặc định service chạy mỗi 5 phút. Để thay đổi:

**Sử dụng PowerShell:**
```powershell
# Dừng service hiện tại
.\manage_service.ps1 -Action stop

# Chỉnh sửa file manage_service.ps1, tìm dòng:
# $Trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5)
# Thay 5 thành số phút mong muốn

# Khởi động lại
.\manage_service.ps1 -Action start
```

## 📝 Logs và Monitoring

### Các file log
- **sync.log**: Output chính của script
- **sync_error.log**: Error logs
- **Windows Event Log**: Scheduled task logs

### Xem logs realtime
```powershell
# PowerShell (có màu sắc)
.\manage_service.ps1 -Action monitor

# Command Prompt
type sync.log
```

### Kiểm tra Windows Task Scheduler
1. Mở Task Scheduler (`taskschd.msc`)
2. Tìm task "WellspringAttendanceSync"
3. Xem lịch sử chạy

## 🔧 Troubleshooting

### Service không chạy
```cmd
# Kiểm tra trạng thái
manage_service.bat status

# Xem logs
manage_service.bat logs

# Khởi động lại
manage_service.bat restart
```

### Lỗi "Python not found"
1. Cài đặt lại Python với "Add to PATH"
2. Restart Command Prompt
3. Chạy lại `setup_windows.bat`

### Lỗi quyền truy cập Task Scheduler
- Chạy Command Prompt hoặc PowerShell "Run as Administrator"
- Hoặc sử dụng account có quyền admin

### Lỗi kết nối máy chấm công
- Kiểm tra IP, username, password trong file `device_*.txt`
- Test ping đến IP máy chấm công: `ping 10.1.4.13`
- Kiểm tra firewall

### Lỗi kết nối backend
- Kiểm tra kết nối internet
- Kiểm tra URL backend trong `hikcon.py`
- Xem logs để debug response

## 🔄 Cập nhật và bảo trì

### Cập nhật script
1. Thay đổi file cần thiết
2. Khởi động lại service:
```cmd
manage_service.bat restart
```

### Backup cấu hình
```cmd
# Backup files cấu hình
copy device_*.txt backup\
```

### Dọn dẹp logs cũ
```powershell
# Xóa logs cũ hơn 30 ngày
Get-ChildItem *.log | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-30)} | Remove-Item
```

## 📊 Monitoring nâng cao

### PowerShell monitoring script
```powershell
# Xem thống kê sync
Get-Content sync.log | Select-String "Tìm thấy.*records" | Measure-Object

# Xem errors gần nhất
Get-Content sync_error.log | Select-Object -Last 10

# Kiểm tra service health
Get-ScheduledTask -TaskName "WellspringAttendanceSync" | Get-ScheduledTaskInfo
```

### Tạo alert email (nâng cao)
Có thể tích hợp với PowerShell script để gửi email khi có lỗi:
```powershell
# Thêm vào cuối manage_service.ps1
if (Get-Content sync_error.log -Tail 1 -ErrorAction SilentlyContinue) {
    Send-MailMessage -To "admin@domain.com" -Subject "Attendance Sync Error" -Body "Check logs"
}
```

## 🛡️ Bảo mật

- ✅ File cấu hình chứa password, đặt quyền truy cập phù hợp
- ✅ Logs có thể chứa thông tin nhạy cảm
- ✅ Sử dụng HTTPS cho backend endpoint
- ✅ Định kỳ thay đổi password máy chấm công

## 🆚 So sánh phiên bản

| Tính năng | Windows (Batch) | Windows (PowerShell) | Mac/Linux |
|-----------|-----------------|---------------------|-----------|
| Quản lý service | ✅ | ✅ | ✅ |
| Logs màu sắc | ❌ | ✅ | ✅ |
| Monitor realtime | ❌ | ✅ | ✅ |
| Setup tự động | ✅ | ✅ | ✅ |
| Cross-platform | ❌ | ❌ | ✅ |

**Khuyến nghị**: Sử dụng PowerShell version để có trải nghiệm tốt nhất trên Windows.

## 📞 Hỗ trợ

Nếu gặp vấn đề:
1. Kiểm tra logs: `manage_service.bat logs`
2. Test chạy một lần: `manage_service.bat test`  
3. Xem Windows Event Viewer
4. Liên hệ team IT để được hỗ trợ 