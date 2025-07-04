# Hướng dẫn Setup Microsoft 365 User Sync

## Tổng quan

Tính năng đồng bộ dữ liệu User từ Microsoft 365 cho phép:

- Đồng bộ tự động users từ Microsoft Graph API
- Lưu trữ dữ liệu Microsoft trong model riêng
- Map và đồng bộ sang model User local
- Quản lý đồng bộ qua API endpoints

## Cấu hình Environment Variables

Thêm các biến môi trường sau vào file `.env`:

```env
# Microsoft 365 Configuration
MICROSOFT_TENANT_ID=your_tenant_id
MICROSOFT_CLIENT_ID=your_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret

# Optional: Enable hourly sync (default: daily only)
MICROSOFT_HOURLY_SYNC=false
```

## Setup Microsoft 365 App Registration

### 1. Tạo App Registration trong Azure Portal

1. Truy cập [Azure Portal](https://portal.azure.com)
2. Vào "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Điền thông tin:
   - Name: `WIS Microsoft Sync`
   - Supported account types: `Accounts in this organizational directory only`
   - Redirect URI: `Web` > `https://your-domain.com/auth/microsoft/callback`

### 2. Cấu hình API Permissions

1. Vào "API permissions"
2. Click "Add a permission"
3. Chọn "Microsoft Graph"
4. Chọn "Application permissions"
5. Thêm các permissions:
   - `User.Read.All` - Đọc thông tin users
   - `Directory.Read.All` - Đọc thông tin directory

### 6. Tạo Client Secret

1. Vào "Certificates & secrets"
2. Click "New client secret"
3. Đặt description và expiration
4. Copy secret value (chỉ hiển thị 1 lần)

### 7. Lấy thông tin cần thiết

- **Tenant ID**: Copy từ "Overview" > "Directory (tenant) ID"
- **Client ID**: Copy từ "Overview" > "Application (client) ID"
- **Client Secret**: Đã tạo ở bước 6

## API Endpoints

### 1. Đồng bộ toàn bộ users

```http
POST /api/microsoft-sync/sync-all
Authorization: Bearer <token>
```

### 2. Đồng bộ một user cụ thể

```http
POST /api/microsoft-sync/sync-user/:microsoftId
Authorization: Bearer <token>
```

### 3. Lấy thống kê đồng bộ

```http
GET /api/microsoft-sync/stats
Authorization: Bearer <token>
```

### 4. Lấy danh sách Microsoft users

```http
GET /api/microsoft-sync/users?page=1&limit=20&status=synced&search=john
Authorization: Bearer <token>
```

### 5. Lấy chi tiết Microsoft user

```http
GET /api/microsoft-sync/users/:id
Authorization: Bearer <token>
```

### 6. Map Microsoft user với local user

```http
POST /api/microsoft-sync/users/:id/map
Authorization: Bearer <token>
Content-Type: application/json

{
  "localUserId": "local_user_id_here"
}
```

### 7. Xóa mapping

```http
DELETE /api/microsoft-sync/users/:id/map
Authorization: Bearer <token>
```

### 8. Retry sync cho user bị lỗi

```http
POST /api/microsoft-sync/users/:id/retry
Authorization: Bearer <token>
```

### 9. Lấy danh sách local users chưa map

```http
GET /api/microsoft-sync/unmapped-users?page=1&limit=20&search=john
Authorization: Bearer <token>
```

## Scheduled Jobs

### Daily Sync (2:00 AM)

- Chạy tự động mỗi ngày lúc 2:00 AM
- Đồng bộ toàn bộ users từ Microsoft 365

### Hourly Sync (Tùy chọn)

- Chạy mỗi giờ nếu `MICROSOFT_HOURLY_SYNC=true`
- Chỉ đồng bộ những user có thay đổi

## Database Schema

### MicrosoftUser Model

```javascript
{
  id: String,                    // Microsoft Graph ID
  displayName: String,           // Tên hiển thị
  givenName: String,             // Tên
  surname: String,               // Họ
  userPrincipalName: String,     // Email chính
  mail: String,                  // Email
  jobTitle: String,              // Chức danh
  department: String,            // Phòng ban
  officeLocation: String,        // Vị trí văn phòng
  businessPhones: [String],      // Số điện thoại công ty
  mobilePhone: String,           // Số điện thoại di động
  employeeId: String,            // Mã nhân viên
  employeeType: String,          // Loại nhân viên
  accountEnabled: Boolean,       // Tài khoản có hoạt động
  preferredLanguage: String,     // Ngôn ngữ ưa thích
  usageLocation: String,         // Vị trí sử dụng
  lastSyncAt: Date,              // Lần đồng bộ cuối
  syncStatus: String,            // Trạng thái đồng bộ
  syncError: String,             // Lỗi đồng bộ
  mappedUserId: ObjectId,        // ID user local đã map
  createdAt: Date,
  updatedAt: Date
}
```

## Role Mapping

Hệ thống tự động map role từ Microsoft sang local role:

| Microsoft Job Title/Department | Local Role |
| ------------------------------ | ---------- |
| Admin/Administrator            | admin      |
| Teacher/Giáo viên              | teacher    |
| Principal/Hiệu trưởng          | principal  |
| Librarian/Thủ thư              | librarian  |
| HR/Human Resource              | hr         |
| Technical/IT                   | technical  |
| Marcom/Marketing               | marcom     |
| BOD/Board                      | bod        |
| Service                        | service    |
| Registrar                      | registrar  |
| Admission                      | admission  |
| BOS                            | bos        |
| Khác                           | user       |

## Troubleshooting

### 1. Lỗi Authentication

- Kiểm tra Tenant ID, Client ID, Client Secret
- Đảm bảo App có đủ permissions
- Kiểm tra Client Secret chưa hết hạn

### 2. Lỗi API Permissions

- Đảm bảo đã grant admin consent cho permissions
- Kiểm tra App registration có đúng tenant

### 3. Lỗi Sync

- Kiểm tra logs trong console
- Xem trạng thái sync trong database
- Retry sync cho user bị lỗi

### 4. Performance Issues

- Giới hạn số lượng users sync mỗi lần
- Tăng timeout cho API calls
- Sử dụng pagination cho large datasets

## Monitoring

### Logs

- Tất cả sync activities được log
- Check console logs cho errors
- Monitor sync statistics qua API

### Metrics

- Total users synced
- Failed syncs
- Sync duration
- Error rates

## Security Considerations

1. **Client Secret Security**

   - Rotate secrets regularly
   - Store securely in environment variables
   - Never commit to version control

2. **API Permissions**

   - Use least privilege principle
   - Only grant necessary permissions
   - Regular permission audits

3. **Data Protection**
   - Encrypt sensitive data
   - Implement data retention policies
   - Regular security audits

## Testing

### Manual Testing

1. Test sync với small dataset
2. Verify data mapping
3. Test error handling
4. Test retry functionality

### Automated Testing

- Unit tests cho service functions
- Integration tests cho API endpoints
- Mock Microsoft Graph API responses
