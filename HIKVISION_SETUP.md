# Hướng dẫn cấu hình máy Face ID Hikvision cho Real-time Event Notifications

## Tổng quan

Thay vì sử dụng phương pháp batch upload (lấy dữ liệu định kỳ), hệ thống hiện tại hỗ trợ nhận **real-time event notifications** từ máy face ID Hikvision. Khi có sự kiện quét face ID, máy sẽ tự động gửi HTTP POST request đến server.

## Endpoints API

### 1. Real-time Event Notification

- **URL**: `POST /api/attendance/hikvision-event`
- **Mục đích**: Nhận event notifications từ máy Hikvision
- **Authentication**: Không cần (để máy có thể gửi trực tiếp)

### 2. Test Endpoint (Development)

- **URL**: `POST /api/attendance/test-hikvision-event`
- **Mục đích**: Test chức năng với dữ liệu giả lập
- **Body**: `{ employeeCode?: string, employeeName?: string, similarity?: number }`

## Cấu hình máy Hikvision

### Bước 1: Truy cập Web Interface của máy

1. Mở trình duyệt và truy cập IP của máy face ID
2. Đăng nhập bằng tài khoản admin

### Bước 2: Cấu hình Event Notification

1. Vào **Configuration** → **Event** → **Normal Event**
2. Chọn **Face Recognition** hoặc **Access Control**
3. Tích chọn **Notify Surveillance Center**
4. Cấu hình **HTTP Listening**:
   - **URL**: `http://[SERVER_IP]:[PORT]/api/attendance/hikvision-event`
   - **Method**: POST
   - **Content Type**: application/json

### Bước 3: Cấu hình HTTP Listening (Quan trọng)

1. Vào **Configuration** → **Network** → **Advanced Settings** → **HTTP Listening**
2. **Enable HTTP Listening**: ✅ Bật
3. **HTTP Listening Port**: 80 (hoặc port tùy chỉnh)
4. **URL**: `/`
5. **Protocol**: HTTP (hoặc HTTPS nếu có SSL)

### Bước 4: Cấu hình Event Notification URL

1. Vào **Configuration** → **Event** → **Normal Event** → **Face Recognition**
2. **Linkage Method**: Tích chọn **Notify Surveillance Center**
3. **Notification**:
   - **Address Type**: URL
   - **URL**: `http://[SERVER_IP]:[PORT]/api/attendance/hikvision-event`
   - **Method**: POST

## Format dữ liệu Hikvision gửi

Máy Hikvision sẽ gửi JSON với format sau:

```json
{
  "ipAddress": "192.168.1.100",
  "portNo": 80,
  "protocol": "HTTP",
  "macAddress": "00:12:34:56:78:90",
  "channelID": 1,
  "dateTime": "2023-12-01T10:30:00+07:00",
  "activePostCount": 1,
  "eventType": "faceSnapMatch",
  "eventState": "active",
  "EventNotificationAlert": {
    "eventType": "faceSnapMatch",
    "eventState": "active",
    "eventDescription": "Face match successful",
    "dateTime": "2023-12-01T10:30:00+07:00",
    "ActivePost": [
      {
        "channelID": 1,
        "ipAddress": "192.168.1.100",
        "FPID": "123456", // ← MÃ NHÂN VIÊN
        "name": "John Doe",
        "type": "faceMatch",
        "similarity": 85,
        "dateTime": "2023-12-01T10:30:00+07:00"
      }
    ]
  }
}
```

## Mapping dữ liệu

Server sẽ tự động mapping các trường sau:

| Hikvision Field | TimeAttendance Field | Mô tả                          |
| --------------- | -------------------- | ------------------------------ |
| `FPID`          | `employeeCode`       | Mã nhân viên (quan trọng nhất) |
| `cardNo`        | `employeeCode`       | Backup cho FPID                |
| `employeeCode`  | `employeeCode`       | Backup cho FPID                |
| `userID`        | `employeeCode`       | Backup cho FPID                |
| `dateTime`      | `timestamp`          | Thời gian chấm công            |
| `ipAddress`     | `deviceId`           | ID thiết bị                    |
| `name`          | `notes`              | Tên nhân viên (lưu vào notes)  |
| `similarity`    | `notes`              | Độ tương đồng (lưu vào notes)  |

## Event Types được hỗ trợ

Server chỉ xử lý các event types sau:

- `faceSnapMatch`
- `faceMatch`
- `faceRecognition`
- `accessControllerEvent`

Các event khác sẽ được bỏ qua.

## Cấu hình mạng

### Firewall

Đảm bảo port của server được mở để máy Hikvision có thể gửi request:

```bash
# Ví dụ với port 3000
sudo ufw allow 3000
```

### Network Security

1. Đặt máy Hikvision và server trong cùng VLAN
2. Cấu hình IP tĩnh cho máy face ID
3. Kiểm tra kết nối mạng giữa máy và server

## Test và Debug

### 1. Test bằng cURL

```bash
curl -X POST http://localhost:3000/api/attendance/test-hikvision-event \
  -H "Content-Type: application/json" \
  -d '{
    "employeeCode": "123456",
    "employeeName": "Test Employee",
    "similarity": 95
  }'
```

### 2. Test bằng Postman

- URL: `POST http://[SERVER_IP]:[PORT]/api/attendance/test-hikvision-event`
- Headers: `Content-Type: application/json`
- Body:

```json
{
  "employeeCode": "123456",
  "employeeName": "Nguyen Van A",
  "similarity": 90
}
```

### 3. Kiểm tra logs

Server sẽ log chi tiết mọi event nhận được:

```bash
# Theo dõi logs
tail -f /path/to/server/logs/app.log

# Hoặc với console output
npm run dev
```

## Troubleshooting

### Lỗi thường gặp

1. **Máy không gửi event**

   - Kiểm tra cấu hình HTTP Listening
   - Đảm bảo URL chính xác
   - Kiểm tra kết nối mạng

2. **Server không nhận được event**

   - Kiểm tra firewall
   - Xác minh server đang chạy
   - Kiểm tra port có đúng không

3. **Event bị reject**
   - Kiểm tra format JSON
   - Đảm bảo có `employeeCode` (FPID)
   - Xem logs để biết lỗi cụ thể

### Debug commands

```bash
# Kiểm tra server có đang lắng nghe không
netstat -tulpn | grep :3000

# Test kết nối từ máy Hikvision
ping [SERVER_IP]

# Test HTTP endpoint
curl -X POST http://[SERVER_IP]:[PORT]/api/attendance/health
```

## So sánh với Batch Upload

| Aspect          | Batch Upload          | Real-time Events   |
| --------------- | --------------------- | ------------------ |
| **Tần suất**    | Theo lịch (5-15 phút) | Ngay lập tức       |
| **Độ trễ**      | 5-15 phút             | < 1 giây           |
| **Tải server**  | Cao (bulk)            | Thấp (từng event)  |
| **Complexity**  | Đơn giản              | Phức tạp hơn       |
| **Reliability** | Cao (retry logic)     | Cần error handling |
| **Debugging**   | Dễ                    | Khó hơn            |

## Kết luận

Real-time event notification cung cấp:

- ✅ Cập nhật chấm công tức thì
- ✅ Giảm tải server (không cần polling)
- ✅ Trải nghiệm người dùng tốt hơn
- ✅ Dữ liệu chính xác hơn (timestamp thật)

Tuy nhiên cần:

- ⚠️ Cấu hình mạng cẩn thận
- ⚠️ Error handling và monitoring tốt
- ⚠️ Backup plan nếu real-time fails

**Khuyến nghị**: Sử dụng song song cả hai phương pháp - real-time làm chính, batch làm backup.
