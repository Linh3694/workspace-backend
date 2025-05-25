const Post = require('../models/Post');
const User = require('../models/Users');
const mongoose = require('mongoose');

class PostService {
    
    // Lấy trending posts dựa trên số lượng reaction và comment
    static async getTrendingPosts(limit = 10, timeFrame = 7) {
        try {
            const dateThreshold = new Date();
            dateThreshold.setDate(dateThreshold.getDate() - timeFrame);

            const posts = await Post.aggregate([
                {
                    $match: {
                        createdAt: { $gte: dateThreshold },
                        visibility: 'public'
                    }
                },
                {
                    $addFields: {
                        totalEngagement: {
                            $add: [
                                { $size: '$reactions' },
                                { $size: '$comments' }
                            ]
                        }
                    }
                },
                {
                    $sort: { totalEngagement: -1, createdAt: -1 }
                },
                {
                    $limit: limit
                }
            ]);

            // Populate necessary fields
            await Post.populate(posts, [
                { path: 'author', select: 'fullname avatarUrl email department' },
                { path: 'tags', select: 'fullname avatarUrl email' },
                { path: 'department', select: 'name' },
                { path: 'comments.user', select: 'fullname avatarUrl email' },
                { path: 'reactions.user', select: 'fullname avatarUrl email' }
            ]);

            return posts;
        } catch (error) {
            throw new Error(`Lỗi khi lấy trending posts: ${error.message}`);
        }
    }

    // Lấy posts của những người user follow
    static async getFollowingPosts(userId, page = 1, limit = 10) {
        try {
            // Tìm những người user đang follow
            const user = await User.findById(userId).populate('following', '_id');
            const followingIds = user.following ? user.following.map(f => f._id) : [];
            
            // Thêm chính user vào danh sách để thấy posts của mình
            followingIds.push(userId);

            const skip = (page - 1) * limit;

            const posts = await Post.find({
                author: { $in: followingIds },
                $or: [
                    { visibility: 'public' },
                    { visibility: 'department', department: user.department }
                ]
            })
                .populate('author', 'fullname avatarUrl email department jobTitle')
                .populate('tags', 'fullname avatarUrl email')
                .populate('department', 'name')
                .populate('comments.user', 'fullname avatarUrl email')
                .populate('reactions.user', 'fullname avatarUrl email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const totalPosts = await Post.countDocuments({
                author: { $in: followingIds },
                $or: [
                    { visibility: 'public' },
                    { visibility: 'department', department: user.department }
                ]
            });

            return {
                posts,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalPosts / limit),
                    totalPosts,
                    hasNext: page < Math.ceil(totalPosts / limit),
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            throw new Error(`Lỗi khi lấy posts từ following: ${error.message}`);
        }
    }

    // Tìm kiếm posts
    static async searchPosts(query, userId, page = 1, limit = 10) {
        try {
            const user = await User.findById(userId);
            const skip = (page - 1) * limit;

            const searchFilter = {
                $or: [
                    { content: { $regex: query, $options: 'i' } },
                    { 'badgeInfo.badgeName': { $regex: query, $options: 'i' } },
                    { 'badgeInfo.message': { $regex: query, $options: 'i' } }
                ],
                $and: [
                    {
                        $or: [
                            { visibility: 'public' },
                            { visibility: 'department', department: user.department }
                        ]
                    }
                ]
            };

            const posts = await Post.find(searchFilter)
                .populate('author', 'fullname avatarUrl email department jobTitle')
                .populate('tags', 'fullname avatarUrl email')
                .populate('department', 'name')
                .populate('comments.user', 'fullname avatarUrl email')
                .populate('reactions.user', 'fullname avatarUrl email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const totalPosts = await Post.countDocuments(searchFilter);

            return {
                posts,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalPosts / limit),
                    totalPosts,
                    hasNext: page < Math.ceil(totalPosts / limit),
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            throw new Error(`Lỗi khi tìm kiếm posts: ${error.message}`);
        }
    }

    // Lấy thống kê engagement của posts
    static async getPostEngagementStats(postId) {
        try {
            const post = await Post.findById(postId);
            
            if (!post) {
                throw new Error('Không tìm thấy bài viết');
            }

            // Thống kê reactions theo loại
            const reactionStats = post.reactions.reduce((acc, reaction) => {
                acc[reaction.type] = (acc[reaction.type] || 0) + 1;
                return acc;
            }, {});

            // Thống kê comments theo thời gian
            const commentsByDate = post.comments.reduce((acc, comment) => {
                const date = comment.createdAt.toISOString().split('T')[0];
                acc[date] = (acc[date] || 0) + 1;
                return acc;
            }, {});

            return {
                totalReactions: post.reactions.length,
                totalComments: post.comments.length,
                reactionBreakdown: reactionStats,
                commentsByDate,
                engagementRate: ((post.reactions.length + post.comments.length) / 100) * 100 // Giả sử có 100 views
            };
        } catch (error) {
            throw new Error(`Lỗi khi lấy thống kê engagement: ${error.message}`);
        }
    }

    // Lấy posts có liên quan dựa trên tags và department
    static async getRelatedPosts(postId, limit = 5) {
        try {
            const post = await Post.findById(postId);
            
            if (!post) {
                throw new Error('Không tìm thấy bài viết');
            }

            const relatedFilter = {
                _id: { $ne: postId }, // Loại trừ bài viết hiện tại
                $or: [
                    { tags: { $in: post.tags } }, // Posts có chung tags
                    { department: post.department }, // Posts cùng department
                    { type: post.type }, // Posts cùng type
                    { author: post.author } // Posts cùng tác giả
                ]
            };

            const relatedPosts = await Post.find(relatedFilter)
                .populate('author', 'fullname avatarUrl email department jobTitle')
                .populate('tags', 'fullname avatarUrl email')
                .populate('department', 'name')
                .sort({ createdAt: -1 })
                .limit(limit);

            return relatedPosts;
        } catch (error) {
            throw new Error(`Lỗi khi lấy posts liên quan: ${error.message}`);
        }
    }

    // Lấy top contributors (người đăng nhiều posts nhất)
    static async getTopContributors(timeFrame = 30, limit = 10) {
        try {
            const dateThreshold = new Date();
            dateThreshold.setDate(dateThreshold.getDate() - timeFrame);

            const topContributors = await Post.aggregate([
                {
                    $match: {
                        createdAt: { $gte: dateThreshold }
                    }
                },
                {
                    $group: {
                        _id: '$author',
                        postCount: { $sum: 1 },
                        totalReactions: { $sum: { $size: '$reactions' } },
                        totalComments: { $sum: { $size: '$comments' } }
                    }
                },
                {
                    $addFields: {
                        totalEngagement: {
                            $add: ['$totalReactions', '$totalComments']
                        }
                    }
                },
                {
                    $sort: { postCount: -1, totalEngagement: -1 }
                },
                {
                    $limit: limit
                }
            ]);

            // Populate user information
            await Post.populate(topContributors, {
                path: '_id',
                select: 'fullname avatarUrl email department',
                model: 'User'
            });

            return topContributors.map(contributor => ({
                user: contributor._id,
                postCount: contributor.postCount,
                totalReactions: contributor.totalReactions,
                totalComments: contributor.totalComments,
                totalEngagement: contributor.totalEngagement
            }));
        } catch (error) {
            throw new Error(`Lỗi khi lấy top contributors: ${error.message}`);
        }
    }

    // Lấy posts phổ biến theo department
    static async getPopularPostsByDepartment(departmentId, limit = 10) {
        try {
            const posts = await Post.aggregate([
                {
                    $match: {
                        $or: [
                            { department: new mongoose.Types.ObjectId(departmentId) },
                            { visibility: 'public' }
                        ]
                    }
                },
                {
                    $addFields: {
                        totalEngagement: {
                            $add: [
                                { $size: '$reactions' },
                                { $size: '$comments' }
                            ]
                        }
                    }
                },
                {
                    $sort: { totalEngagement: -1, createdAt: -1 }
                },
                {
                    $limit: limit
                }
            ]);

            // Populate necessary fields
            await Post.populate(posts, [
                { path: 'author', select: 'fullname avatarUrl email department' },
                { path: 'tags', select: 'fullname avatarUrl email' },
                { path: 'department', select: 'name' },
                { path: 'comments.user', select: 'fullname avatarUrl email' },
                { path: 'reactions.user', select: 'fullname avatarUrl email' }
            ]);

            return posts;
        } catch (error) {
            throw new Error(`Lỗi khi lấy posts phổ biến theo department: ${error.message}`);
        }
    }

    // Feed algorithm - tính toán relevance score
    static async getPersonalizedFeed(userId, page = 1, limit = 10) {
        try {
            const user = await User.findById(userId).populate('following', '_id');
            const followingIds = user.following ? user.following.map(f => f._id) : [];
            const skip = (page - 1) * limit;

            const posts = await Post.aggregate([
                {
                    $match: {
                        $or: [
                            { visibility: 'public' },
                            { visibility: 'department', department: user.department }
                        ]
                    }
                },
                {
                    $addFields: {
                        relevanceScore: {
                            $add: [
                                // Điểm cho posts từ người follow
                                {
                                    $cond: [
                                        { $in: ['$author', followingIds] },
                                        10,
                                        0
                                    ]
                                },
                                // Điểm cho posts được tag
                                {
                                    $cond: [
                                        { $in: [new mongoose.Types.ObjectId(userId), '$tags'] },
                                        15,
                                        0
                                    ]
                                },
                                // Điểm cho posts cùng department
                                {
                                    $cond: [
                                        { $eq: ['$department', user.department] },
                                        5,
                                        0
                                    ]
                                },
                                // Điểm cho posts có nhiều engagement
                                {
                                    $multiply: [
                                        { $add: [{ $size: '$reactions' }, { $size: '$comments' }] },
                                        0.1
                                    ]
                                },
                                // Điểm cho posts mới
                                {
                                    $divide: [
                                        { $subtract: [new Date(), '$createdAt'] },
                                        -86400000 // -1 day in milliseconds
                                    ]
                                }
                            ]
                        }
                    }
                },
                {
                    $sort: { relevanceScore: -1, createdAt: -1 }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);

            // Populate necessary fields
            await Post.populate(posts, [
                { path: 'author', select: 'fullname avatarUrl email department' },
                { path: 'tags', select: 'fullname avatarUrl email' },
                { path: 'department', select: 'name' },
                { path: 'comments.user', select: 'fullname avatarUrl email' },
                { path: 'reactions.user', select: 'fullname avatarUrl email' }
            ]);

            const totalPosts = await Post.countDocuments({
                $or: [
                    { visibility: 'public' },
                    { visibility: 'department', department: user.department }
                ]
            });

            return {
                posts,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalPosts / limit),
                    totalPosts,
                    hasNext: page < Math.ceil(totalPosts / limit),
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            throw new Error(`Lỗi khi lấy personalized feed: ${error.message}`);
        }
    }
}

module.exports = PostService; 