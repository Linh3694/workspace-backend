# Newfeed API Documentation

## Tổng quan
API Newfeed cung cấp các chức năng giống như mạng xã hội cho hệ thống staff portal, bao gồm đăng bài, tương tác, bình luận và nhiều tính năng khác.

## Base URL
```
/api/posts
```

## Authentication
Tất cả các endpoint đều yêu cầu authentication token trong header:
```
Authorization: Bearer <token>
```

## Endpoints

### 1. Tạo bài viết mới
**POST** `/`

**Body (multipart/form-data):**
```json
{
  "content": "Nội dung bài viết",
  "type": "Chia sẻ", // enum: ['Thông báo', 'Chia sẻ', 'Câu hỏi', 'Badge', 'Khác']
  "visibility": "public", // enum: ['public', 'department']
  "department": "departmentId", // required if visibility = 'department'
  "tags": ["userId1", "userId2"], // array of user IDs to tag
  "badgeInfo": {
    "badgeName": "Tên huy hiệu",
    "badgeIcon": "link-to-icon",
    "message": "Thông điệp"
  },
  "files": [] // upload files (images/videos)
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tạo bài viết thành công",
  "data": {
    "_id": "postId",
    "author": {
      "_id": "authorId",
      "fullname": "Tên tác giả",
      "avatarUrl": "avatar-url",
      "email": "email@example.com",
      "department": "departmentId"
    },
    "content": "Nội dung bài viết",
    "type": "Chia sẻ",
    "visibility": "public",
    "images": ["/uploads/posts/image1.jpg"],
    "videos": ["/uploads/posts/video1.mp4"],
    "tags": [],
    "reactions": [],
    "comments": [],
    "isPinned": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Lấy newfeed
**GET** `/newsfeed`

**Query Parameters:**
- `page` (number): Trang hiện tại (default: 1)
- `limit` (number): Số bài viết mỗi trang (default: 10)
- `type` (string): Lọc theo loại bài viết
- `author` (string): Lọc theo tác giả
- `department` (string): Lọc theo phòng ban
- `sortBy` (string): Sắp xếp theo field (default: 'createdAt')
- `sortOrder` (string): Thứ tự sắp xếp 'asc'/'desc' (default: 'desc')

**Response:**
```json
{
  "success": true,
  "data": {
    "posts": [],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalPosts": 50,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### 3. Lấy personalized feed
**GET** `/personalized`

Trả về feed được cá nhân hóa dựa trên thuật toán relevance score.

**Query Parameters:**
- `page` (number): Trang hiện tại
- `limit` (number): Số bài viết mỗi trang

### 4. Lấy trending posts
**GET** `/trending`

**Query Parameters:**
- `limit` (number): Số bài viết (default: 10)
- `timeFrame` (number): Khung thời gian tính toán (ngày) (default: 7)

### 5. Tìm kiếm bài viết
**GET** `/search`

**Query Parameters:**
- `q` (string): Từ khóa tìm kiếm (required)
- `page` (number): Trang hiện tại
- `limit` (number): Số kết quả mỗi trang

### 6. Lấy posts từ following
**GET** `/following`

Lấy bài viết từ những người user đang follow.

**Query Parameters:**
- `page` (number): Trang hiện tại
- `limit` (number): Số bài viết mỗi trang

### 7. Lấy bài viết đã pin
**GET** `/pinned`

### 8. Lấy chi tiết bài viết
**GET** `/:postId`

### 9. Cập nhật bài viết
**PUT** `/:postId`

Chỉ tác giả hoặc admin mới có thể cập nhật.

### 10. Xóa bài viết
**DELETE** `/:postId`

Chỉ tác giả hoặc admin mới có thể xóa.

### 11. Thêm reaction
**POST** `/:postId/reactions`

**Body:**
```json
{
  "type": "like" // enum: ['like', 'love', 'haha', 'sad', 'wow']
}
```

### 12. Xóa reaction
**DELETE** `/:postId/reactions`

### 13. Thêm comment
**POST** `/:postId/comments`

**Body:**
```json
{
  "content": "Nội dung comment"
}
```

### 14. Xóa comment
**DELETE** `/:postId/comments/:commentId`

### 15. Pin/Unpin bài viết (Admin only)
**PATCH** `/:postId/pin`

### 16. Lấy thống kê engagement
**GET** `/:postId/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalReactions": 25,
    "totalComments": 10,
    "reactionBreakdown": {
      "like": 15,
      "love": 8,
      "haha": 2
    },
    "commentsByDate": {
      "2024-01-01": 5,
      "2024-01-02": 3,
      "2024-01-03": 2
    },
    "engagementRate": 35.0
  }
}
```

### 17. Lấy bài viết liên quan
**GET** `/:postId/related`

**Query Parameters:**
- `limit` (number): Số bài viết liên quan (default: 5)

### 18. Lấy top contributors
**GET** `/contributors/top`

**Query Parameters:**
- `timeFrame` (number): Khung thời gian (ngày) (default: 30)
- `limit` (number): Số contributors (default: 10)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "user": {
        "_id": "userId",
        "fullname": "Tên user",
        "avatarUrl": "avatar-url",
        "email": "email@example.com",
        "department": "departmentId"
      },
      "postCount": 15,
      "totalReactions": 100,
      "totalComments": 50,
      "totalEngagement": 150
    }
  ]
}
```

### 19. Lấy posts phổ biến theo department
**GET** `/department/:departmentId/popular`

**Query Parameters:**
- `limit` (number): Số bài viết (default: 10)

## Real-time Events (Socket.IO)

### Events Client có thể gửi:
- `post_created`: Thông báo có bài viết mới
- `post_reacted`: Thông báo có reaction mới
- `post_commented`: Thông báo có comment mới
- `typing_comment`: Bắt đầu typing comment
- `stop_typing_comment`: Dừng typing comment

### Events Client sẽ nhận:
- `new_post`: Bài viết mới được tạo
- `post_tagged`: Được tag trong bài viết
- `post_reaction_updated`: Reaction được cập nhật
- `post_comment_updated`: Comment được cập nhật
- `post_notification`: Thông báo về bài viết
- `user_typing_comment`: User khác đang typing
- `user_stop_typing_comment`: User khác dừng typing
- `trending_posts_updated`: Cập nhật trending posts
- `post_pin_updated`: Bài viết được pin/unpin

## Error Responses

Tất cả error responses đều có format:
```json
{
  "success": false,
  "message": "Mô tả lỗi",
  "error": "Chi tiết lỗi (nếu có)"
}
```

## Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

## File Upload
- Hỗ trợ upload hình ảnh và video
- Giới hạn file size: 50MB
- Số lượng file tối đa: 10 files per post
- Các format được hỗ trợ: 
  - Images: jpg, jpeg, png, gif, webp
  - Videos: mp4, avi, mov, wmv

## Pagination
Tất cả endpoint có pagination đều trả về:
```json
{
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalPosts": 50,
    "hasNext": true,
    "hasPrev": false
  }
}
``` 