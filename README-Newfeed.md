# Hệ thống Newfeed - Staff Portal

## Tổng quan
Hệ thống Newfeed là một nền tảng tương tự mạng xã hội được tích hợp vào Staff Portal, cho phép nhân viên chia sẻ thông tin, tương tác và kết nối với nhau trong môi trường làm việc.

## Tính năng chính

### 🎯 Core Features
- **Đăng bài viết**: Tạo posts với text, hình ảnh, video
- **Reactions**: Like, Love, Haha, Sad, Wow
- **Comments**: Bình luận và thảo luận
- **Tags**: Tag các user khác trong bài viết
- **File Upload**: Upload hình ảnh và video (tối đa 50MB, 10 files)

### 📱 Advanced Features
- **Real-time Updates**: Cập nhật trực tiếp qua Socket.IO
- **Personalized Feed**: Thuật toán cá nhân hóa feed
- **Trending Posts**: Bài viết thịnh hành
- **Search**: Tìm kiếm bài viết theo nội dung
- **Department Posts**: Bài viết riêng theo phòng ban
- **Pin Posts**: Ghim bài viết quan trọng (Admin)

### 📊 Analytics Features
- **Engagement Statistics**: Thống kê tương tác
- **Top Contributors**: Xếp hạng người đóng góp nhiều nhất
- **Related Posts**: Gợi ý bài viết liên quan
- **Activity Tracking**: Theo dõi hoạt động

## Kiến trúc hệ thống

### 📁 Cấu trúc thư mục
```
workspace-backend/
├── controllers/Newfeed/
│   └── postController.js          # Xử lý API requests
├── models/
│   └── Post.js                    # MongoDB schema
├── routes/Newfeed/
│   └── postRoutes.js             # Định nghĩa routes
├── services/
│   └── postService.js            # Business logic
├── utils/
│   └── newfeedSocket.js          # Socket.IO handlers
├── uploads/posts/                # Thư mục lưu file upload
└── docs/
    └── newfeed-api.md            # API documentation
```

### 🔧 Components

#### 1. Model (Post.js)
```javascript
// Schema chính cho bài viết
{
  author: ObjectId,           // Tác giả
  content: String,            // Nội dung
  type: String,              // Loại bài viết
  visibility: String,        // Public/Department
  images: [String],          // Đường dẫn hình ảnh
  videos: [String],          // Đường dẫn video
  tags: [ObjectId],          // Users được tag
  reactions: [Schema],       // Reactions
  comments: [Schema],        // Comments
  isPinned: Boolean,         // Trạng thái pin
  badgeInfo: Object          // Thông tin huy hiệu
}
```

#### 2. Controller (postController.js)
Xử lý các HTTP requests:
- `createPost`: Tạo bài viết mới
- `getNewsfeed`: Lấy danh sách bài viết
- `getPersonalizedFeed`: Feed cá nhân hóa
- `getTrendingPosts`: Bài viết trending
- `searchPosts`: Tìm kiếm
- `addReaction/removeReaction`: Xử lý reactions
- `addComment/deleteComment`: Xử lý comments

#### 3. Service (postService.js)
Business logic phức tạp:
- **Trending Algorithm**: Tính toán dựa trên engagement
- **Personalized Feed**: Thuật toán cá nhân hóa với scoring
- **Search Engine**: Tìm kiếm full-text
- **Analytics**: Thống kê và báo cáo
- **Related Posts**: Gợi ý bài viết liên quan

#### 4. Socket Handler (newfeedSocket.js)
Real-time features:
- Broadcast bài viết mới
- Cập nhật reactions/comments trực tiếp
- Thông báo tag users
- Typing indicators
- Pin/unpin notifications

### 🔒 Security & Permissions

#### Visibility Levels:
1. **Public**: Tất cả users có thể xem
2. **Department**: Chỉ users cùng phòng ban

#### Role-based Access:
- **User**: Tạo, sửa, xóa bài viết của mình
- **Admin**: Có thể pin/unpin, xóa bất kỳ bài viết nào

### 🚀 Performance Optimizations

#### 1. Database Indexing
```javascript
// Indexes được tạo cho:
- author (cho query theo tác giả)
- createdAt (cho sorting)
- visibility + department (cho filtering)
- content (cho text search)
```

#### 2. Aggregation Pipeline
```javascript
// Sử dụng MongoDB aggregation cho:
- Trending posts calculation
- Personalized feed scoring
- Statistics generation
- Top contributors ranking
```

#### 3. Real-time Efficiency
```javascript
// Socket.IO optimizations:
- Room-based broadcasting
- Selective user notifications
- Event batching
- Connection management
```

## API Endpoints

### 📝 Posts Management
- `POST /api/posts` - Tạo bài viết
- `GET /api/posts/newsfeed` - Lấy newfeed
- `GET /api/posts/:id` - Chi tiết bài viết
- `PUT /api/posts/:id` - Cập nhật bài viết
- `DELETE /api/posts/:id` - Xóa bài viết

### 🔥 Special Feeds
- `GET /api/posts/trending` - Bài viết trending
- `GET /api/posts/personalized` - Feed cá nhân hóa
- `GET /api/posts/following` - Posts từ following
- `GET /api/posts/pinned` - Bài viết đã pin

### 🔍 Discovery
- `GET /api/posts/search` - Tìm kiếm
- `GET /api/posts/:id/related` - Bài viết liên quan
- `GET /api/posts/contributors/top` - Top contributors

### 💝 Interactions
- `POST /api/posts/:id/reactions` - Thêm reaction
- `DELETE /api/posts/:id/reactions` - Xóa reaction
- `POST /api/posts/:id/comments` - Thêm comment
- `DELETE /api/posts/:id/comments/:commentId` - Xóa comment

### 📊 Analytics
- `GET /api/posts/:id/stats` - Thống kê engagement
- `GET /api/posts/department/:id/popular` - Posts phổ biến theo phòng ban

## Socket.IO Events

### 📤 Client → Server
```javascript
socket.emit('post_created', postData);
socket.emit('post_reacted', { postId, reactionType });
socket.emit('post_commented', { postId, comment });
socket.emit('typing_comment', { postId });
socket.emit('stop_typing_comment', { postId });
```

### 📥 Server → Client
```javascript
socket.on('new_post', handleNewPost);
socket.on('post_tagged', handleTagNotification);
socket.on('post_reaction_updated', handleReactionUpdate);
socket.on('post_comment_updated', handleCommentUpdate);
socket.on('user_typing_comment', handleTypingIndicator);
socket.on('post_pin_updated', handlePinUpdate);
```

## Cài đặt và Sử dụng

### 📋 Prerequisites
- Node.js >= 14
- MongoDB >= 4.4
- Redis (optional, for caching)

### 🛠️ Installation
```bash
# Đã tích hợp sẵn vào existing codebase
# Chỉ cần tạo thư mục uploads
mkdir -p uploads/posts

# Install dependencies (đã có trong package.json)
npm install multer socket.io
```

### 🔧 Configuration
```javascript
// File upload settings trong postRoutes.js
const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: imageVideoFilter
});
```

### 🚀 Usage Examples

#### Tạo bài viết với file upload:
```javascript
const formData = new FormData();
formData.append('content', 'Hello World!');
formData.append('type', 'Chia sẻ');
formData.append('files', imageFile);
formData.append('files', videoFile);

fetch('/api/posts', {
  method: 'POST',
  body: formData,
  headers: { 'Authorization': 'Bearer ' + token }
});
```

#### Lắng nghe real-time updates:
```javascript
socket.on('new_post', (data) => {
  // Thêm post mới vào UI
  addPostToFeed(data.data);
});

socket.on('post_reaction_updated', (data) => {
  // Cập nhật reactions
  updatePostReactions(data.postId, data.data.reactions);
});
```

## Algorithms

### 🎯 Personalized Feed Algorithm
```javascript
const relevanceScore = 
  (isFromFollowing ? 10 : 0) +
  (isTagged ? 15 : 0) +
  (sameDepartment ? 5 : 0) +
  (engagementCount * 0.1) +
  (recencyBonus);
```

### 🔥 Trending Algorithm
```javascript
const trendingScore = 
  totalReactions + 
  totalComments + 
  (recencyFactor * timeWeight);
```

### 🔍 Search Algorithm
MongoDB text search với weighted fields:
- Content: weight 10
- Badge info: weight 5
- Comments: weight 2

## Monitoring & Analytics

### 📈 Key Metrics
- Posts per day/week/month
- Engagement rates (reactions/comments per post)
- Active users posting
- Most popular content types
- Department participation rates

### 🔍 Tracking Events
```javascript
// Analytics events to track:
- post_created
- post_viewed
- reaction_added
- comment_added
- search_performed
- file_uploaded
```

## Troubleshooting

### 🚨 Common Issues

1. **File upload failures**
   - Check upload directory permissions
   - Verify file size limits
   - Ensure MIME type validation

2. **Socket connection issues**
   - Verify JWT token in socket auth
   - Check CORS settings
   - Confirm user joins correct rooms

3. **Performance issues**
   - Monitor database query performance
   - Check aggregation pipeline efficiency
   - Optimize populate queries

### 🔧 Debug Commands
```bash
# Check upload directory
ls -la uploads/posts/

# Monitor MongoDB queries
db.setProfilingLevel(2)

# Socket.IO debug
DEBUG=socket.io* node app.js
```

## Future Enhancements

### 🔮 Planned Features
- [ ] Story/Status updates (24h expiry)
- [ ] Poll posts
- [ ] Event posts with RSVP
- [ ] Advanced content moderation
- [ ] Post scheduling
- [ ] Analytics dashboard
- [ ] Content approval workflow
- [ ] Rich text editor
- [ ] Mention notifications
- [ ] Save/bookmark posts

### 🛡️ Security Enhancements
- [ ] Content filtering/moderation
- [ ] Rate limiting for posts
- [ ] File virus scanning
- [ ] Advanced permission system
- [ ] Audit logging

### ⚡ Performance Improvements
- [ ] Redis caching layer
- [ ] CDN for media files
- [ ] Image compression
- [ ] Lazy loading optimization
- [ ] Database query optimization

---

## 📞 Support
Để hỗ trợ hoặc báo cáo lỗi, vui lòng tạo issue trong repository hoặc liên hệ team development.

---
*Cập nhật lần cuối: 2024* 