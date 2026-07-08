# Wellspring Recruitment Backend

Backend API cho hệ thống tuyển dụng Wellspring.

## 🚀 Tính năng

- **Authentication**: Đăng nhập bằng Microsoft Azure AD
- **Job Management**: Quản lý tin tuyển dụng (tạo, sửa, xóa, toggle active)
- **Application Management**: Quản lý hồ sơ ứng tuyển (xem, xóa, download CV)
- **Email Notifications**: Gửi email thông báo CV mới qua Microsoft Graph API

## 📦 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB với Mongoose ODM
- **Session Store**: Redis
- **Authentication**: Microsoft Azure AD (passport-azure-ad)
- **Email**: Microsoft Graph API
- **File Upload**: Multer
- **Image Processing**: Sharp

## 📁 Cấu trúc dự án

```
workspace-backend/
├── app.js                          # Entry point
├── config/                         # Cấu hình
│   ├── database.js
│   └── redis.js
├── controllers/                    # Business logic
│   ├── Management/
│   │   └── userController.js
│   └── Recruitment/
│       ├── jobController.js
│       └── applicationController.js
├── middleware/                     # Express middlewares
│   ├── auth.js
│   ├── authMiddleware.js
│   ├── upload.js
│   ├── uploadCV.js
│   └── uploadApplication.js
├── models/                         # MongoDB models
│   ├── Users.js
│   ├── Job.js
│   └── Application.js
├── routes/                         # API routes
│   ├── Auth/
│   │   └── authMicrosoft.js
│   ├── Management/
│   │   └── users.js
│   └── Recruitment/
│       ├── jobRoutes.js
│       └── applicationRoutes.js
├── services/                       # Business services
│   ├── emailNotificationService.js
│   └── redisService.js
├── uploads/                        # File uploads
│   ├── CV/
│   └── Profile/
└── package.json
```

## 🔧 Cài đặt

1. **Clone repository**
```bash
cd /Volumes/CORSAIR/workspace-backend
```

2. **Cài đặt dependencies**
```bash
npm install
```

3. **Cấu hình môi trường** - Tạo file `.env`:
```env
# Server
PORT=3002

# MongoDB
MONGO_URI=mongodb://localhost:27017/recruitment

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-secret-key

# Microsoft Azure AD
TENANT_ID=your-tenant-id
CLIENT_ID=your-client-id

# Email Notification (Microsoft Graph API)
TENANTTICKET_ID=your-tenant-id
CLIENTTICKET_ID=your-client-id
CLIENTTICKET_SECRET=your-client-secret
EMAIL_USER=no-reply@wellspring.edu.vn
RECRUITMENT_NOTIFY_EMAILS=hr@wellspring.edu.vn,recruitment@wellspring.edu.vn
```

4. **Chạy server**
```bash
# Development
npm run dev

# Production
npm start
```

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/microsoft/recruitment/login` - Đăng nhập Microsoft cho admin

### Jobs
- `GET /api/jobs` - Lấy danh sách jobs
- `GET /api/jobs/:id` - Lấy chi tiết 1 job
- `POST /api/jobs` - Tạo job mới (Admin)
- `PUT /api/jobs/toggle-active/:id` - Toggle active status (Admin)
- `PUT /api/jobs/:id` - Cập nhật job (Admin)
- `DELETE /api/jobs/:id` - Xóa job (Admin)

### Applications
- `GET /api/applications` - Lấy tất cả applications (Admin)
- `GET /api/applications/job/:jobId` - Lấy applications theo job (Admin)
- `GET /api/applications/open-position` - Lấy applications vị trí mở (Admin)
- `POST /api/applications` - Nộp hồ sơ cho job cụ thể (Public)
- `POST /api/applications/open-position` - Nộp hồ sơ vị trí mở (Public)
- `DELETE /api/applications/:id` - Xóa application (Admin)

### Users
- `GET /api/users` - Lấy danh sách users (Admin)
- `POST /api/users` - Tạo user mới (Admin)
- `PUT /api/users/:id` - Cập nhật user (Admin)
- `DELETE /api/users/:id` - Xóa user (Admin)

### Health Check
- `GET /health` - Kiểm tra trạng thái server

## 🔐 Authentication & Authorization

- Admin routes yêu cầu JWT token trong header: `Authorization: Bearer <token>`
- Token được cấp sau khi đăng nhập thành công qua Microsoft
- Email admin phải được whitelist trong database (User model)

## 📧 Email Notifications

Hệ thống tự động gửi email thông báo khi có CV mới:
- Sử dụng Microsoft Graph API
- Email được gửi đến danh sách trong `RECRUITMENT_NOTIFY_EMAILS`
- Không block response khi gửi email (async)

## 🗂️ File Uploads

- **CV**: `/uploads/CV/` - PDF, DOC, DOCX (max 50MB)
- **Profile Picture**: `/uploads/Profile/` - JPG, PNG, WEBP (max 10MB)

## 🚦 CORS Configuration

Allowed origins:
- `http://localhost:3000` (Development)
- `http://localhost:5173` (Development)
- `https://tuyendung.wellspring.edu.vn` (Production)
- `https://career.wellspring.edu.vn` (Production)

## 📊 Database Models

### User
- email, password, fullname, role, active
- Roles: admin, hr, bod, superadmin

### Job
- title, description, requirements, location, jobType, urgent, deadline, active

### Application
- fullname, birthdate, phone, email, graduationSchools, highestDegree, englishLevel
- expectedSalary, cvFile, profilePicture
- appliedJob (ref Job) hoặc openPositionTitle

## 🔄 Version History

- **v2.0.0** (Current) - Clean up, chỉ giữ lại chức năng Recruitment
- **v1.0.0** - Full system với SIS, Inventory, Library, Chat, etc.

## 📝 Notes

- Dự án đã được clean up từ workspace-backend cũ
- Đã xóa bỏ các modules: SIS, Inventory, Library, Bus, HallOfHonor, Chat, Ticket, etc.
- Giảm dependencies từ 59 xuống 23 packages
- Giảm CORS origins từ 7 xuống 4 domains

## 👥 Maintainers

Wellspring IT Team

## 📄 License

ISC








