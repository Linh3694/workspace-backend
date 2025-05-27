# Hướng Dẫn Sử Dụng Batch Files cho Windows

## 📁 Các File Batch Đã Tạo

### 1. `setup.bat` - Thiết Lập Môi Trường
**Mục đích**: Tạo và cấu hình virtual environment Python trên Windows

**Chức năng**:
- Kiểm tra Python đã cài đặt
- Tạo virtual environment mới (nếu chưa có)
- Kích hoạt virtual environment
- Cập nhật pip
- Cài đặt tất cả dependencies từ `requirements.txt`

**Cách sử dụng**:
```cmd
setup.bat
```

**Lưu ý**: Chạy file này đầu tiên khi thiết lập lần đầu

---

### 2. `run_sync.bat` - Đồng Bộ Dữ Liệu Chấm Công
**Mục đích**: Chạy script đồng bộ dữ liệu từ máy chấm công

**Chức năng**:
- Kích hoạt virtual environment
- Chạy `sync_all_devices.py` với cấu hình mặc định
- Hoặc chạy lệnh tùy chỉnh nếu có tham số

**Cách sử dụng**:
```cmd
# Chạy với cấu hình mặc định
run_sync.bat

# Hoặc chạy với lệnh tùy chỉnh
run_sync.bat python sync_all_devices.py --config-dir ./configs --backend-url http://192.168.1.100:3000
```

---

### 3. `test_devices.bat` - Kiểm Tra Thiết Bị
**Mục đích**: Kiểm tra kết nối với các thiết bị chấm công

**Chức năng**:
- Menu lựa chọn loại kiểm tra
- Kiểm tra kết nối thiết bị
- Kiểm tra API backend
- Tùy chỉnh timeout và lưu kết quả

**Cách sử dụng**:
```cmd
test_devices.bat
```

**Menu tùy chọn**:
1. Kiểm tra kết nối tất cả thiết bị
2. Kiểm tra kết nối thiết bị
3. Kiểm tra API backend
4. Kiểm tra tất cả (kết nối + API)
5. Tùy chỉnh timeout và lưu kết quả

---

### 4. `start_server.bat` - Khởi Chạy Backend Server
**Mục đích**: Khởi chạy backend server để test

**Chức năng**:
- Tìm kiếm và chuyển đến thư mục backend
- Cài đặt dependencies Node.js (nếu chưa có)
- Khởi chạy server

**Cách sử dụng**:
```cmd
start_server.bat
```

---

### 5. `monitor_sync.bat` - Theo Dõi và Phân Tích
**Mục đích**: Theo dõi kết quả đồng bộ và tạo báo cáo chi tiết

**Chức năng**:
- Chạy đồng bộ với log chi tiết
- Thống kê tổng quan các lần chạy
- Xuất báo cáo Excel
- Retry cho thiết bị lỗi

**Cách sử dụng**:
```cmd
monitor_sync.bat
```

---

### 6. `fix_devices.bat` - Khắc Phục Thiết Bị Lỗi
**Mục đích**: Tự động chẩn đoán và khắc phục thiết bị lỗi kết nối

**Chức năng**:
- Ping test thiết bị
- Reset session thiết bị
- Kiểm tra config files
- Tự động khắc phục toàn bộ

**Cách sử dụng**:
```cmd
fix_devices.bat
```

---

### 7. `auto_sync.bat` - Đồng Bộ Tự Động Theo Chu Kỳ
**Mục đích**: Chạy đồng bộ tự động theo khoảng thời gian định kỳ

**Chức năng**:
- Đồng bộ cứ 5, 10, 15, 30 phút hoặc 1 giờ
- Tùy chỉnh khoảng thời gian
- Hiển thị progress và thời gian chạy tiếp theo
- Lưu log chi tiết từng lần chạy
- Đếm ngược thời gian chờ

**Cách sử dụng**:
```cmd
auto_sync.bat
```

**Menu tùy chọn**:
1. Đồng bộ cứ 5 phút một lần ⭐ **(YÊU CẦU)**
2. Đồng bộ cứ 10 phút một lần
3. Đồng bộ cứ 15 phút một lần
4. Đồng bộ cứ 30 phút một lần
5. Đồng bộ cứ 1 giờ một lần
6. Tùy chỉnh khoảng thời gian
7. Chạy một lần duy nhất

---

### 8. `service_sync.bat` - Dịch Vụ Đồng Bộ Background
**Mục đích**: Quản lý dịch vụ đồng bộ chạy trong background

**Chức năng**:
- Khởi chạy dịch vụ trong background
- Kiểm tra trạng thái dịch vụ
- Dừng dịch vụ
- Xem log dịch vụ
- Quản lý multiple services

**Cách sử dụng**:
```cmd
service_sync.bat
```

---

### 9. `deactivate.bat` - Thoát Môi Trường Ảo
**Mục đích**: Thoát khỏi virtual environment

**Cách sử dụng**:
```cmd
deactivate.bat
```

---

## 🚀 Quy Trình Sử Dụng Hoàn Chỉnh

### Lần Đầu Thiết Lập:
1. **Cài đặt Python** (nếu chưa có): Tải từ https://python.org
2. **Chạy thiết lập**:
   ```cmd
   setup.bat
   ```
3. **Kiểm tra thiết bị** (tùy chọn):
   ```cmd
   test_devices.bat
   ```

### Sử Dụng Hàng Ngày:

#### **Chế Độ Tự Động (Khuyến Nghị):**
1. **Khởi chạy backend server** (nếu cần):
   ```cmd
   start_server.bat
   ```
2. **Khởi chạy dịch vụ đồng bộ 5 phút/lần**:
   ```cmd
   service_sync.bat
   # Chọn option 1: Khởi chạy dịch vụ đồng bộ (5 phút/lần)
   ```

#### **Chế Độ Thủ Công:**
1. **Khởi chạy backend server** (nếu cần):
   ```cmd
   start_server.bat
   ```
2. **Chạy đồng bộ với monitoring**:
   ```cmd
   monitor_sync.bat
   ```
3. **Hoặc chạy đồng bộ theo chu kỳ**:
   ```cmd
   auto_sync.bat
   # Chọn option 1: Đồng bộ cứ 5 phút một lần
   ```

### Troubleshooting:
- **Kiểm tra kết nối thiết bị**:
  ```cmd
  test_devices.bat
  ```
- **Khắc phục thiết bị lỗi**:
  ```cmd
  fix_devices.bat
  ```
- **Xem thống kê và báo cáo**:
  ```cmd
  monitor_sync.bat
  ```
- **Kiểm tra dịch vụ đang chạy**:
  ```cmd
  service_sync.bat
  # Chọn option 5: Kiểm tra trạng thái dịch vụ
  ```
- **Dừng dịch vụ tự động**:
  ```cmd
  service_sync.bat
  # Chọn option 6: Dừng dịch vụ đồng bộ
  ```
- **Xem log lỗi**: Kiểm tra file `.log` trong thư mục scripts và `logs/auto_sync/`

---

## 🔄 Hướng Dẫn Auto Sync (Đồng Bộ Tự Động)

### **Tính Năng Auto Sync 5 Phút:**
Đây là tính năng chính bạn yêu cầu - tự động chạy đồng bộ cứ 5 phút một lần.

#### **Cách 1: Chạy Dịch Vụ Background (Khuyến Nghị)**
```cmd
# Khởi chạy dịch vụ tự động trong background
service_sync.bat
# Chọn option 1: Khởi chạy dịch vụ đồng bộ (5 phút/lần)

# Kiểm tra trạng thái
service_sync.bat  
# Chọn option 5: Kiểm tra trạng thái dịch vụ

# Dừng dịch vụ khi cần
service_sync.bat
# Chọn option 6: Dừng dịch vụ đồng bộ
```

#### **Cách 2: Chạy Trực Tiếp**
```cmd
# Chạy auto sync trực tiếp (sẽ hiển thị progress)
auto_sync.bat
# Chọn option 1: Đồng bộ cứ 5 phút một lần
# Nhấn Ctrl+C để dừng
```

### **Logs và Monitoring:**
- **Log files**: `logs/auto_sync/sync_YYYY-MM-DD_HH-MM-SS.json`
- **Xem log**: `service_sync.bat` → option 7
- **Thống kê**: `monitor_sync.bat` → option 3

### **Ưu Điểm Auto Sync:**
- ✅ Tự động chạy cứ 5 phút (theo yêu cầu)
- ✅ Chạy background, không cần giữ cửa sổ mở
- ✅ Log chi tiết từng lần chạy
- ✅ Hiển thị progress và thời gian chạy tiếp theo
- ✅ Có thể dừng/khởi động dễ dàng
- ✅ Tự động retry khi có lỗi
- ✅ Quản lý nhiều dịch vụ cùng lúc

---

## 🔧 Cấu Hình Bổ Sung

### Thay Đổi Backend URL:
Mở `run_sync.bat` và sửa dòng:
```batch
python sync_all_devices.py --config-dir ./configs --backend-url http://YOUR_SERVER:3000
```

### Thay Đổi Timeout:
Sử dụng tùy chọn 5 trong `test_devices.bat` để tùy chỉnh timeout

---

## ⚠️ Lưu Ý Quan Trọng

1. **Luôn chạy `setup.bat` trước khi sử dụng lần đầu**
2. **Đảm bảo Python đã được cài đặt và có trong PATH**
3. **Kiểm tra kết nối mạng với máy chấm công và backend server**
4. **Các file config thiết bị phải có trong thư mục `./configs`**
5. **Backend server phải đang chạy trước khi đồng bộ dữ liệu**

---

## 📋 Yêu Cầu Hệ Thống

- **OS**: Windows 7/8/10/11
- **Python**: 3.7 trở lên
- **Node.js**: 14.x trở lên (cho backend server)
- **Kết nối mạng**: Tới máy chấm công và backend server

---

## 🆘 Hỗ Trợ

Nếu gặp vấn đề, vui lòng:
1. Kiểm tra log files (`.log`) trong thư mục scripts
2. Chạy `test_devices.bat` để kiểm tra kết nối
3. Đảm bảo tất cả requirements đã được cài đặt đầy đủ 