const Post = require('../../models/Post');
const User = require('../../models/Users');
const mongoose = require('mongoose');
const notificationController = require('../Notification/notificationController');
const PostService = require('../../services/postService');
const fs = require('fs');
const path = require('path');

// Tạo bài viết mới
exports.createPost = async (req, res) => {
    try {
        const {
            content,
            type = 'Chia sẻ',
            visibility = 'public',
            department,
            tags = [],
            badgeInfo
        } = req.body;

        const authorId = req.user._id;

        // Validate required fields
        if (!content || content.trim() === '') {
            return res.status(400).json({ message: 'Nội dung bài viết không được để trống' });
        }

        // Parse tags if it's a string (from form data)
        let parsedTags = tags;
        if (typeof tags === 'string') {
            try {
                parsedTags = JSON.parse(tags);
            } catch (e) {
                parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
            }
        }

        // Validate tags (ensure they are valid user IDs)
        if (parsedTags.length > 0) {
            const validUsers = await User.find({ _id: { $in: parsedTags } }).select('_id');
            const validUserIds = validUsers.map(user => user._id.toString());
            const invalidTags = parsedTags.filter(tag => !validUserIds.includes(tag));
            
            if (invalidTags.length > 0) {
                return res.status(400).json({ 
                    message: 'Một số người dùng được tag không tồn tại',
                    invalidTags 
                });
            }
        }

        // Process uploaded files
        let images = [];
        let videos = [];

        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const filePath = `/uploads/posts/${file.filename}`;
                if (file.mimetype.startsWith('image/')) {
                    images.push(filePath);
                } else if (file.mimetype.startsWith('video/')) {
                    videos.push(filePath);
                }
            });
        }

        const postData = {
            author: authorId,
            content: content.trim(),
            type,
            visibility,
            tags: parsedTags,
            images,
            videos
        };

        // Add department if visibility is department
        if (visibility === 'department' && department) {
            postData.department = department;
        }

        // Add badge info if type is Badge
        if (type === 'Badge' && badgeInfo) {
            let parsedBadgeInfo = badgeInfo;
            if (typeof badgeInfo === 'string') {
                try {
                    parsedBadgeInfo = JSON.parse(badgeInfo);
                } catch (e) {
                    // Keep as string if parsing fails
                }
            }
            postData.badgeInfo = parsedBadgeInfo;
        }

        const post = await Post.create(postData);

        // Populate author information
        const populatedPost = await Post.findById(post._id)
            .populate('author', 'fullname avatarUrl email department jobTitle')
            .populate('tags', 'fullname avatarUrl email');

        // Broadcast new post via socket
        const newfeedSocket = req.app.get('newfeedSocket');
        if (newfeedSocket) {
            await newfeedSocket.broadcastNewPost(populatedPost);
        }

        // Send notifications to tagged users
        if (parsedTags.length > 0) {
            await notificationController.sendTaggedInPostNotification(
                populatedPost,
                req.user.fullname,
                parsedTags
            );
        }

        res.status(201).json({
            success: true,
            message: 'Tạo bài viết thành công',
            data: populatedPost
        });
    } catch (error) {
        console.error('Error creating post:', error);
        
        // Clean up uploaded files if post creation fails
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const filePath = path.join(__dirname, '../../uploads/posts/', file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi tạo bài viết',
            error: error.message 
        });
    }
};

// Lấy danh sách bài viết (newfeed)
exports.getNewsfeed = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            type,
            author,
            department,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const userId = req.user._id;
        const userDepartment = req.user.department;

        // Build filter query
        let filter = {};

        // Filter by visibility - chỉ hiển thị public posts hoặc posts của department của user
        filter.$or = [
            { visibility: 'public' }
        ];

        // Nếu user có department, thêm posts của department đó
        if (userDepartment) {
            filter.$or.push({
                visibility: 'department',
                department: userDepartment
            });
        }

        // Filter by type if specified
        if (type) {
            filter.type = type;
        }

        // Filter by author if specified
        if (author) {
            filter.author = author;
        }

        // Filter by department if specified
        if (department) {
            filter.department = department;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        // Get posts with pagination
        const posts = await Post.find(filter)
            .populate('author', 'fullname avatarUrl email department jobTitle')
            .populate('tags', 'fullname avatarUrl email')
            .populate('comments.user', 'fullname avatarUrl email')
            .populate('reactions.user', 'fullname avatarUrl email')
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));

        // Get total count for pagination
        const totalPosts = await Post.countDocuments(filter);
        const totalPages = Math.ceil(totalPosts / parseInt(limit));

        res.status(200).json({
            success: true,
            data: {
                posts,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalPosts,
                    hasNext: parseInt(page) < totalPages,
                    hasPrev: parseInt(page) > 1
                }
            }
        });
    } catch (error) {
        console.error('Error getting newsfeed:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi lấy bảng tin',
            error: error.message 
        });
    }
};

// Lấy chi tiết một bài viết
exports.getPostById = async (req, res) => {
    try {
        const { postId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID bài viết không hợp lệ' 
            });
        }

        const post = await Post.findById(postId)
            .populate('author', 'fullname avatarUrl email department jobTitle')
            .populate('tags', 'fullname avatarUrl email')
            .populate('comments.user', 'fullname avatarUrl email')
            .populate('reactions.user', 'fullname avatarUrl email');

        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        // Check if user has permission to view this post
        const userId = req.user._id;
        const userDepartment = req.user.department;

        if (post.visibility === 'department' && 
            post.department && 
            post.department !== userDepartment) {
            return res.status(403).json({ 
                success: false,
                message: 'Bạn không có quyền xem bài viết này' 
            });
        }

        res.status(200).json({
            success: true,
            data: post
        });
    } catch (error) {
        console.error('Error getting post by ID:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi lấy bài viết',
            error: error.message 
        });
    }
};

// Cập nhật bài viết
exports.updatePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const {
            content,
            type,
            visibility,
            department,
            tags,
            badgeInfo,
            images,
            videos,
            isPinned
        } = req.body;

        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID bài viết không hợp lệ' 
            });
        }

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        // Check if user is the author or has admin rights
        if (post.author.toString() !== userId.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'Bạn không có quyền chỉnh sửa bài viết này' 
            });
        }

        // Validate tags if provided
        if (tags && tags.length > 0) {
            const validUsers = await User.find({ _id: { $in: tags } }).select('_id');
            const validUserIds = validUsers.map(user => user._id.toString());
            const invalidTags = tags.filter(tag => !validUserIds.includes(tag));
            
            if (invalidTags.length > 0) {
                return res.status(400).json({ 
                    success: false,
                    message: 'Một số người dùng được tag không tồn tại',
                    invalidTags 
                });
            }
        }

        // Build update data
        const updateData = {};
        if (content !== undefined) updateData.content = content.trim();
        if (type !== undefined) updateData.type = type;
        if (visibility !== undefined) updateData.visibility = visibility;
        if (department !== undefined) updateData.department = department;
        if (tags !== undefined) updateData.tags = tags;
        if (images !== undefined) updateData.images = images;
        if (videos !== undefined) updateData.videos = videos;
        if (badgeInfo !== undefined) updateData.badgeInfo = badgeInfo;
        if (isPinned !== undefined && req.user.role === 'admin') updateData.isPinned = isPinned;

        const updatedPost = await Post.findByIdAndUpdate(
            postId,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('author', 'fullname avatarUrl email department jobTitle')
            .populate('tags', 'fullname avatarUrl email')
            .populate('comments.user', 'fullname avatarUrl email')
            .populate('reactions.user', 'fullname avatarUrl email');

        res.status(200).json({
            success: true,
            message: 'Cập nhật bài viết thành công',
            data: updatedPost
        });
    } catch (error) {
        console.error('Error updating post:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi cập nhật bài viết',
            error: error.message 
        });
    }
};

// Xóa bài viết
exports.deletePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID bài viết không hợp lệ' 
            });
        }

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        // Check if user is the author or has admin rights
        if (post.author.toString() !== userId.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'Bạn không có quyền xóa bài viết này' 
            });
        }

        await Post.findByIdAndDelete(postId);

        res.status(200).json({
            success: true,
            message: 'Xóa bài viết thành công'
        });
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi xóa bài viết',
            error: error.message 
        });
    }
};

// Thêm reaction vào bài viết
exports.addReaction = async (req, res) => {
    try {
        const { postId } = req.params;
        const { type = 'like' } = req.body;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID bài viết không hợp lệ' 
            });
        }

        // Allow any string type (for custom emoji codes) but ensure it's not empty
        if (!type || typeof type !== 'string' || type.trim() === '') {
            return res.status(400).json({ 
                success: false,
                message: 'Loại reaction không hợp lệ' 
            });
        }

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        // Check if user already reacted
        const existingReactionIndex = post.reactions.findIndex(
            reaction => reaction.user.toString() === userId.toString()
        );

        if (existingReactionIndex !== -1) {
            // Update existing reaction
            post.reactions[existingReactionIndex].type = type.trim();
            post.reactions[existingReactionIndex].createdAt = new Date();
        } else {
            // Add new reaction
            post.reactions.push({
                user: userId,
                type: type.trim(),
                createdAt: new Date()
            });
        }

        await post.save();

        // Populate and return updated post
        const updatedPost = await Post.findById(postId)
            .populate('author', 'fullname avatarUrl email')
            .populate('reactions.user', 'fullname avatarUrl email')
            .populate('comments.user', 'fullname avatarUrl email')
            .populate('tags', 'fullname avatarUrl email')
            .populate('department', 'name');

        // Send notification to post author if not reacting to own post
        if (post.author.toString() !== userId.toString()) {
            await notificationController.sendPostReactionNotification(
                updatedPost,
                req.user.fullname,
                type.trim()
            );
        }

        res.status(200).json({
            success: true,
            message: 'Thêm reaction thành công',
            data: updatedPost
        });
    } catch (error) {
        console.error('Error adding reaction:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi thêm reaction',
            error: error.message 
        });
    }
};

// Xóa reaction khỏi bài viết
exports.removeReaction = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID bài viết không hợp lệ' 
            });
        }

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        // Remove user's reaction
        post.reactions = post.reactions.filter(
            reaction => reaction.user.toString() !== userId.toString()
        );

        await post.save();

        // Populate and return updated post
        const updatedPost = await Post.findById(postId)
            .populate('author', 'fullname avatarUrl email')
            .populate('reactions.user', 'fullname avatarUrl email')
            .populate('comments.user', 'fullname avatarUrl email')
            .populate('tags', 'fullname avatarUrl email')
            .populate('department', 'name');

        res.status(200).json({
            success: true,
            message: 'Xóa reaction thành công',
            data: updatedPost
        });
    } catch (error) {
        console.error('Error removing reaction:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi xóa reaction',
            error: error.message 
        });
    }
};

// Thêm comment vào bài viết
exports.addComment = async (req, res) => {
    try {
        const { postId } = req.params;
        const { content } = req.body;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID bài viết không hợp lệ' 
            });
        }

        if (!content || content.trim() === '') {
            return res.status(400).json({ 
                success: false,
                message: 'Nội dung comment không được để trống' 
            });
        }

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        // Add new comment
        const newComment = {
            user: userId,
            content: content.trim(),
            createdAt: new Date(),
            reactions: []
        };

        post.comments.push(newComment);
        await post.save();

        // Populate and return updated post
        const updatedPost = await Post.findById(postId)
            .populate('author', 'fullname avatarUrl email')
            .populate('comments.user', 'fullname avatarUrl email');

        // Send notification to post author if not commenting on own post
        if (post.author.toString() !== userId.toString()) {
            await notificationController.sendPostCommentNotification(
                updatedPost,
                req.user.fullname,
                content.trim()
            );
        }

        res.status(200).json({
            success: true,
            message: 'Thêm comment thành công',
            data: updatedPost
        });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi thêm comment',
            error: error.message 
        });
    }
};

// Xóa comment
exports.deleteComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID không hợp lệ' 
            });
        }

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        const commentIndex = post.comments.findIndex(
            comment => comment._id.toString() === commentId.toString()
        );

        if (commentIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy comment' 
            });
        }

        const comment = post.comments[commentIndex];

        // Check if user is the comment author or post author or has admin rights
        if (comment.user.toString() !== userId.toString() && 
            post.author.toString() !== userId.toString() && 
            req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'Bạn không có quyền xóa comment này' 
            });
        }

        post.comments.splice(commentIndex, 1);
        await post.save();

        // Populate and return updated post
        const updatedPost = await Post.findById(postId)
            .populate('author', 'fullname avatarUrl email')
            .populate('comments.user', 'fullname avatarUrl email');

        res.status(200).json({
            success: true,
            message: 'Xóa comment thành công',
            data: updatedPost
        });
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi xóa comment',
            error: error.message 
        });
    }
};

// Pin/Unpin bài viết (chỉ admin)
exports.togglePinPost = async (req, res) => {
    try {
        const { postId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID bài viết không hợp lệ' 
            });
        }

        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ 
                success: false,
                message: 'Chỉ admin mới có quyền pin/unpin bài viết' 
            });
        }

        const post = await Post.findById(postId);

        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        post.isPinned = !post.isPinned;
        await post.save();

        const updatedPost = await Post.findById(postId)
            .populate('author', 'fullname avatarUrl email department jobTitle')
            .populate('tags', 'fullname avatarUrl email')
            .populate('department', 'name');

        res.status(200).json({
            success: true,
            message: post.isPinned ? 'Pin bài viết thành công' : 'Unpin bài viết thành công',
            data: updatedPost
        });
    } catch (error) {
        console.error('Error toggling pin post:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi pin/unpin bài viết',
            error: error.message 
        });
    }
};

// Lấy bài viết đã pin
exports.getPinnedPosts = async (req, res) => {
    try {
        const userId = req.user._id;
        const userDepartment = req.user.department;

        // Build filter for pinned posts
        let filter = {
            isPinned: true,
            $or: [
                { visibility: 'public' },
                { visibility: 'department', department: userDepartment }
            ]
        };

        const pinnedPosts = await Post.find(filter)
            .populate('author', 'fullname avatarUrl email department jobTitle')
            .populate('tags', 'fullname avatarUrl email')
            .populate('department', 'name')
            .sort({ updatedAt: -1 });

        res.status(200).json({
            success: true,
            data: pinnedPosts
        });
    } catch (error) {
        console.error('Error getting pinned posts:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi lấy bài viết đã pin',
            error: error.message 
        });
    }
};

// Lấy trending posts
exports.getTrendingPosts = async (req, res) => {
    try {
        const { limit = 10, timeFrame = 7 } = req.query;
        
        const trendingPosts = await PostService.getTrendingPosts(
            parseInt(limit), 
            parseInt(timeFrame)
        );

        res.status(200).json({
            success: true,
            data: trendingPosts
        });
    } catch (error) {
        console.error('Error getting trending posts:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
};

// Lấy personalized feed
exports.getPersonalizedFeed = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const userId = req.user._id;

        const result = await PostService.getPersonalizedFeed(
            userId,
            parseInt(page),
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting personalized feed:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
};

// Tìm kiếm posts
exports.searchPosts = async (req, res) => {
    try {
        const { q: query, page = 1, limit = 10 } = req.query;
        const userId = req.user._id;

        if (!query || query.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Từ khóa tìm kiếm không được để trống'
            });
        }

        const result = await PostService.searchPosts(
            query.trim(),
            userId,
            parseInt(page),
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error searching posts:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
};

// Lấy posts từ following
exports.getFollowingPosts = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const userId = req.user._id;

        const result = await PostService.getFollowingPosts(
            userId,
            parseInt(page),
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error getting following posts:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
};

// Lấy posts liên quan
exports.getRelatedPosts = async (req, res) => {
    try {
        const { postId } = req.params;
        const { limit = 5 } = req.query;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID bài viết không hợp lệ' 
            });
        }

        const relatedPosts = await PostService.getRelatedPosts(
            postId,
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            data: relatedPosts
        });
    } catch (error) {
        console.error('Error getting related posts:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
};

// Lấy thống kê engagement
exports.getPostEngagementStats = async (req, res) => {
    try {
        const { postId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID bài viết không hợp lệ' 
            });
        }

        const stats = await PostService.getPostEngagementStats(postId);

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error getting post engagement stats:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
};

// Lấy top contributors
exports.getTopContributors = async (req, res) => {
    try {
        const { timeFrame = 30, limit = 10 } = req.query;

        const contributors = await PostService.getTopContributors(
            parseInt(timeFrame),
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            data: contributors
        });
    } catch (error) {
        console.error('Error getting top contributors:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
};

// Lấy posts phổ biến theo department
exports.getPopularPostsByDepartment = async (req, res) => {
    try {
        const { departmentId } = req.params;
        const { limit = 10 } = req.query;

        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID department không hợp lệ' 
            });
        }

        const posts = await PostService.getPopularPostsByDepartment(
            departmentId,
            parseInt(limit)
        );

        res.status(200).json({
            success: true,
            data: posts
        });
    } catch (error) {
        console.error('Error getting popular posts by department:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
};

// ========== CÁC CONTROLLERS MỚI CHO COMMENT FEATURES ==========

// Thêm reaction cho comment
exports.addCommentReaction = async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const { type } = req.body;
        const userId = req.user._id;

        // Validate inputs
        if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID không hợp lệ' 
            });
        }

        if (!type || type.trim() === '') {
            return res.status(400).json({ 
                success: false,
                message: 'Loại reaction không được để trống' 
            });
        }

        // Tìm post và comment
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy comment' 
            });
        }

        // Kiểm tra xem user đã reaction comment này chưa
        const existingReactionIndex = comment.reactions.findIndex(
            reaction => reaction.user.toString() === userId.toString()
        );

        if (existingReactionIndex > -1) {
            // Nếu cùng loại reaction thì remove, khác loại thì update
            if (comment.reactions[existingReactionIndex].type === type) {
                comment.reactions.splice(existingReactionIndex, 1);
            } else {
                comment.reactions[existingReactionIndex].type = type;
                comment.reactions[existingReactionIndex].createdAt = new Date();
            }
        } else {
            // Thêm reaction mới
            comment.reactions.push({
                user: userId,
                type: type.trim(),
                createdAt: new Date()
            });
        }

        await post.save();

        // Populate và return updated post
        const updatedPost = await Post.findById(postId)
            .populate('author', 'fullname avatarUrl email')
            .populate('comments.user', 'fullname avatarUrl email')
            .populate('comments.reactions.user', 'fullname avatarUrl email')
            .populate('reactions.user', 'fullname avatarUrl email');

        // Gửi notification cho tác giả comment (nếu không phải chính mình)
        if (comment.user.toString() !== userId.toString()) {
            await notificationController.sendCommentReactionNotification(
                updatedPost,
                commentId,
                req.user.fullname,
                type
            );
        }

        res.status(200).json({
            success: true,
            message: 'Reaction comment thành công',
            data: updatedPost
        });
    } catch (error) {
        console.error('Error adding comment reaction:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi reaction comment',
            error: error.message 
        });
    }
};

// Xóa reaction khỏi comment
exports.removeCommentReaction = async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const userId = req.user._id;

        // Validate inputs
        if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID không hợp lệ' 
            });
        }

        // Tìm post và comment
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy comment' 
            });
        }

        // Tìm và xóa reaction của user
        const reactionIndex = comment.reactions.findIndex(
            reaction => reaction.user.toString() === userId.toString()
        );

        if (reactionIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy reaction để xóa' 
            });
        }

        comment.reactions.splice(reactionIndex, 1);
        await post.save();

        // Populate và return updated post
        const updatedPost = await Post.findById(postId)
            .populate('author', 'fullname avatarUrl email')
            .populate('comments.user', 'fullname avatarUrl email')
            .populate('comments.reactions.user', 'fullname avatarUrl email')
            .populate('reactions.user', 'fullname avatarUrl email');

        res.status(200).json({
            success: true,
            message: 'Xóa reaction comment thành công',
            data: updatedPost
        });
    } catch (error) {
        console.error('Error removing comment reaction:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi xóa reaction comment',
            error: error.message 
        });
    }
};

// Reply comment
exports.replyComment = async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const { content } = req.body;
        const userId = req.user._id;

        // Validate inputs
        if (!mongoose.Types.ObjectId.isValid(postId) || !mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ 
                success: false,
                message: 'ID không hợp lệ' 
            });
        }

        if (!content || content.trim() === '') {
            return res.status(400).json({ 
                success: false,
                message: 'Nội dung reply không được để trống' 
            });
        }

        // Tìm post và parent comment
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy bài viết' 
            });
        }

        const parentComment = post.comments.id(commentId);
        if (!parentComment) {
            return res.status(404).json({ 
                success: false,
                message: 'Không tìm thấy comment để reply' 
            });
        }

        // Kiểm tra nếu đây đã là reply thì không cho reply tiếp (chỉ 1 level)
        if (parentComment.parentComment) {
            return res.status(400).json({ 
                success: false,
                message: 'Không thể reply vào một reply. Hãy reply vào comment gốc.' 
            });
        }

        // Tạo reply comment mới
        const replyComment = {
            user: userId,
            content: content.trim(),
            createdAt: new Date(),
            reactions: [],
            parentComment: commentId
        };

        post.comments.push(replyComment);
        await post.save();

        // Populate và return updated post
        const updatedPost = await Post.findById(postId)
            .populate('author', 'fullname avatarUrl email')
            .populate('comments.user', 'fullname avatarUrl email')
            .populate('comments.reactions.user', 'fullname avatarUrl email')
            .populate('reactions.user', 'fullname avatarUrl email');

        // Gửi notification cho tác giả comment gốc (nếu không phải chính mình)
        if (parentComment.user.toString() !== userId.toString()) {
            await notificationController.sendCommentReplyNotification(
                updatedPost,
                parentComment._id,
                req.user.fullname,
                content.trim()
            );
        }

        res.status(200).json({
            success: true,
            message: 'Reply comment thành công',
            data: updatedPost
        });
    } catch (error) {
        console.error('Error replying to comment:', error);
        res.status(500).json({ 
            success: false,
            message: 'Lỗi server khi reply comment',
            error: error.message 
        });
    }
}; 