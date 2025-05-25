const Post = require('../models/Post');
const User = require('../models/Users');

class NewfeedSocket {
    constructor(io) {
        this.io = io;
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`User connected to newfeed: ${socket.user?.fullname || 'Unknown'}`);

            // Join user to their personal room
            if (socket.user) {
                socket.join(`user_${socket.user._id}`);
                socket.join(`department_${socket.user.department}`);
            }

            // Handle post creation events
            socket.on('post_created', (data) => {
                this.handlePostCreated(socket, data);
            });

            // Handle reaction events
            socket.on('post_reacted', (data) => {
                this.handlePostReacted(socket, data);
            });

            // Handle comment events
            socket.on('post_commented', (data) => {
                this.handlePostCommented(socket, data);
            });

            // Handle typing indicator for comments
            socket.on('typing_comment', (data) => {
                this.handleTypingComment(socket, data);
            });

            socket.on('stop_typing_comment', (data) => {
                this.handleStopTypingComment(socket, data);
            });

            // Handle disconnect
            socket.on('disconnect', () => {
                console.log(`User disconnected from newfeed: ${socket.user?.fullname || 'Unknown'}`);
            });
        });
    }

    // Broadcast new post to relevant users
    async broadcastNewPost(post) {
        try {
            const populatedPost = await Post.findById(post._id)
                .populate('author', 'fullname avatarUrl email department jobTitle')
                .populate('tags', 'fullname avatarUrl email')
                .populate('department', 'name');

            // Broadcast to public feed if visibility is public
            if (populatedPost.visibility === 'public') {
                this.io.emit('new_post', {
                    type: 'post_created',
                    data: populatedPost
                });
            }

            // Broadcast to department if visibility is department
            if (populatedPost.visibility === 'department' && populatedPost.department) {
                this.io.to(`department_${populatedPost.department._id}`).emit('new_post', {
                    type: 'post_created',
                    data: populatedPost
                });
            }

            // Notify tagged users
            if (populatedPost.tags && populatedPost.tags.length > 0) {
                populatedPost.tags.forEach(taggedUser => {
                    this.io.to(`user_${taggedUser._id}`).emit('post_tagged', {
                        type: 'tagged_in_post',
                        data: populatedPost,
                        message: `${populatedPost.author.fullname} đã tag bạn trong một bài viết`
                    });
                });
            }

        } catch (error) {
            console.error('Error broadcasting new post:', error);
        }
    }

    // Broadcast reaction updates
    async broadcastReaction(postId, reactionData) {
        try {
            const post = await Post.findById(postId)
                .populate('author', 'fullname avatarUrl email')
                .populate('reactions.user', 'fullname avatarUrl email');

            // Broadcast to all users following this post
            this.io.emit('post_reaction_updated', {
                type: 'reaction_added',
                postId: postId,
                data: {
                    reactions: post.reactions,
                    totalReactions: post.reactions.length
                }
            });

            // Notify post author if not self-reaction
            if (post.author._id.toString() !== reactionData.userId.toString()) {
                this.io.to(`user_${post.author._id}`).emit('post_notification', {
                    type: 'post_reaction',
                    message: `${reactionData.userName} đã react ${reactionData.reactionType} bài viết của bạn`,
                    postId: postId,
                    data: post
                });
            }

        } catch (error) {
            console.error('Error broadcasting reaction:', error);
        }
    }

    // Broadcast comment updates
    async broadcastComment(postId, commentData) {
        try {
            const post = await Post.findById(postId)
                .populate('author', 'fullname avatarUrl email')
                .populate('comments.user', 'fullname avatarUrl email');

            // Broadcast to all users following this post
            this.io.emit('post_comment_updated', {
                type: 'comment_added',
                postId: postId,
                data: {
                    comments: post.comments,
                    totalComments: post.comments.length
                }
            });

            // Notify post author if not self-comment
            if (post.author._id.toString() !== commentData.userId.toString()) {
                this.io.to(`user_${post.author._id}`).emit('post_notification', {
                    type: 'post_comment',
                    message: `${commentData.userName} đã bình luận về bài viết của bạn`,
                    postId: postId,
                    data: post
                });
            }

            // Notify other commenters (excluding the current commenter and post author)
            const otherCommenters = post.comments
                .map(comment => comment.user._id.toString())
                .filter((userId, index, arr) => arr.indexOf(userId) === index) // Remove duplicates
                .filter(userId => 
                    userId !== commentData.userId.toString() && 
                    userId !== post.author._id.toString()
                );

            otherCommenters.forEach(userId => {
                this.io.to(`user_${userId}`).emit('post_notification', {
                    type: 'post_comment_reply',
                    message: `${commentData.userName} đã bình luận về bài viết mà bạn cũng đã tham gia`,
                    postId: postId,
                    data: post
                });
            });

        } catch (error) {
            console.error('Error broadcasting comment:', error);
        }
    }

    // Handle post creation from client
    async handlePostCreated(socket, data) {
        try {
            if (socket.user) {
                await this.broadcastNewPost(data.post);
            }
        } catch (error) {
            console.error('Error handling post created:', error);
        }
    }

    // Handle reaction from client
    async handlePostReacted(socket, data) {
        try {
            if (socket.user) {
                await this.broadcastReaction(data.postId, {
                    userId: socket.user._id,
                    userName: socket.user.fullname,
                    reactionType: data.reactionType
                });
            }
        } catch (error) {
            console.error('Error handling post reaction:', error);
        }
    }

    // Handle comment from client
    async handlePostCommented(socket, data) {
        try {
            if (socket.user) {
                await this.broadcastComment(data.postId, {
                    userId: socket.user._id,
                    userName: socket.user.fullname,
                    comment: data.comment
                });
            }
        } catch (error) {
            console.error('Error handling post comment:', error);
        }
    }

    // Handle typing indicator for comments
    handleTypingComment(socket, data) {
        socket.broadcast.emit('user_typing_comment', {
            postId: data.postId,
            user: {
                _id: socket.user._id,
                fullname: socket.user.fullname
            }
        });
    }

    // Handle stop typing indicator for comments
    handleStopTypingComment(socket, data) {
        socket.broadcast.emit('user_stop_typing_comment', {
            postId: data.postId,
            userId: socket.user._id
        });
    }

    // Broadcast trending posts update
    async broadcastTrendingUpdate() {
        try {
            // This could be called periodically to update trending posts
            this.io.emit('trending_posts_updated', {
                type: 'trending_updated',
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Error broadcasting trending update:', error);
        }
    }

    // Broadcast pin/unpin updates
    async broadcastPinUpdate(postId, isPinned) {
        try {
            const post = await Post.findById(postId)
                .populate('author', 'fullname avatarUrl email department jobTitle')
                .populate('department', 'name');

            this.io.emit('post_pin_updated', {
                type: isPinned ? 'post_pinned' : 'post_unpinned',
                data: post
            });

        } catch (error) {
            console.error('Error broadcasting pin update:', error);
        }
    }
}

module.exports = NewfeedSocket; 