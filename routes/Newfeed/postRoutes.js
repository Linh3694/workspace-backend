const express = require('express');
const router = express.Router();
const postController = require('../../controllers/Newfeed/postController');
const authMiddleware = require('../../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');


///// Test CICD 123
// Setup multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/posts/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
    fileFilter: function (req, file, cb) {
        // Allow images and videos
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ cho phép upload hình ảnh và video!'), false);
        }
    }
});

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Special routes (must be before parameterized routes)
router.get('/trending', postController.getTrendingPosts);
router.get('/search', postController.searchPosts);
router.get('/newsfeed', postController.getNewsfeed);
router.get('/personalized', postController.getPersonalizedFeed);
router.get('/following', postController.getFollowingPosts);
router.get('/pinned', postController.getPinnedPosts);
router.get('/contributors/top', postController.getTopContributors);

// Routes for posts
router.post('/', upload.array('files', 10), postController.createPost);
router.get('/:postId', postController.getPostById);
router.put('/:postId', upload.array('files', 10), postController.updatePost);
router.delete('/:postId', postController.deletePost);

// Routes for post analytics and related content
router.get('/:postId/stats', postController.getPostEngagementStats);
router.get('/:postId/related', postController.getRelatedPosts);

// Routes for reactions
router.post('/:postId/reactions', postController.addReaction);
router.delete('/:postId/reactions', postController.removeReaction);

// Routes for comments
router.post('/:postId/comments', postController.addComment);
router.delete('/:postId/comments/:commentId', postController.deleteComment);

// Routes for pin/unpin (admin only)
router.patch('/:postId/pin', postController.togglePinPost);

// Routes for department specific posts
router.get('/department/:departmentId/popular', postController.getPopularPostsByDepartment);

module.exports = router; 