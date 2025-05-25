const { createClient } = require('redis');
const logger = require('../logger');
require('dotenv').config();

const DEFAULT_TTL = process.env.REDIS_TTL_DEFAULT ? Number(process.env.REDIS_TTL_DEFAULT) : undefined;
const ONLINE_TTL = process.env.REDIS_TTL_ONLINE ? Number(process.env.REDIS_TTL_ONLINE) : undefined;

class RedisService {
    constructor() {
        if (process.env.NODE_ENV === 'production') {
            this.client = createClient({
                socket: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
                    reconnectStrategy: (retries) => {
                        const delay = Math.min(retries * 100, 3000);
                        logger.warn(`[Redis] Retry #${retries}, delay ${delay}ms`);
                        if (retries > 10) {
                            logger.error('[Redis] connection lost. Max retries reached.');
                            return new Error('Redis max retries reached');
                        }
                        return delay;
                    }
                },
                password: process.env.REDIS_PASSWORD
            });

            this.client.on('error', (err) => logger.error('[Redis] Client Error', err));
            this.client.connect();
        } else {
            logger.info('[Redis] Running in local environment without Redis');
            this.client = null;
        }
    }

    // === USER METHODS ===

    // Lưu thông tin user
    async setUserData(userId, data, expirationInSeconds = DEFAULT_TTL) {
        if (!this.client) return { success: false, error: 'Redis not connected' };
        try {
            const key = `user:${userId}`;
            if (expirationInSeconds) {
                await this.client.setEx(key, expirationInSeconds, JSON.stringify(data));
            } else {
                await this.client.set(key, JSON.stringify(data));
            }
            return { success: true };
        } catch (error) {
            logger.error(`[Redis][setUserData] userId=${userId} error=${error.message}`);
            return { success: false, error };
        }
    }

    // Lấy thông tin user
    async getUserData(userId) {
        if (!this.client) return null;
        try {
            const key = `user:${userId}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error(`[Redis][getUserData] userId=${userId} error=${error.message}`);
            return null;
        }
    }

    // Lưu danh sách users
    async setAllUsers(users, expirationInSeconds = DEFAULT_TTL) {
        if (!this.client) return;
        try {
            const key = 'users:all';
            await this.client.setEx(key, expirationInSeconds, JSON.stringify(users));
        } catch (error) {
            logger.error(`[Redis][setAllUsers] error=${error.message}`);
        }
    }

    // Lấy danh sách users
    async getAllUsers() {
        if (!this.client) return null;
        try {
            const key = 'users:all';
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error(`[Redis][getAllUsers] error=${error.message}`);
            return null;
        }
    }

    // Xóa cache của một user
    async deleteUserCache(userId) {
        if (!this.client) return;
        try {
            const key = `user:${userId}`;
            await this.client.del(key);
        } catch (error) {
            logger.error(`[Redis][deleteUserCache] userId=${userId} error=${error.message}`);
        }
    }

    // Xóa cache danh sách users
    async deleteAllUsersCache() {
        if (!this.client) return;
        try {
            const key = 'users:all';
            await this.client.del(key);
        } catch (error) {
            logger.error(`[Redis][deleteAllUsersCache] error=${error.message}`);
        }
    }

    // === AUTH METHODS ===

    // Lưu token
    async setAuthToken(userId, token, expirationInSeconds = DEFAULT_TTL) {
        if (!this.client) return;
        try {
            const key = `auth:token:${userId}`;
            await this.client.setEx(key, expirationInSeconds, token);
        } catch (error) {
            logger.error(`[Redis][setAuthToken] userId=${userId} error=${error.message}`);
        }
    }

    // Lấy token
    async getAuthToken(userId) {
        if (!this.client) return null;
        try {
            const key = `auth:token:${userId}`;
            return await this.client.get(key);
        } catch (error) {
            logger.error(`[Redis][getAuthToken] userId=${userId} error=${error.message}`);
            return null;
        }
    }

    // Xóa token
    async deleteAuthToken(userId) {
        if (!this.client) return;
        try {
            const key = `auth:token:${userId}`;
            await this.client.del(key);
        } catch (error) {
            logger.error(`[Redis][deleteAuthToken] userId=${userId} error=${error.message}`);
        }
    }

    // === CHAT METHODS === 

    // Cache warming cho chat data
    async warmChatCache(chatId) {
        if (!this.client) return { success: false, error: 'Redis not connected' };
        try {
            const Chat = require('../models/Chat');
            const chat = await Chat.findById(chatId)
                .populate('participants', 'fullname avatarUrl email department')
                .populate('lastMessage')
                .lean();
            
            if (chat) {
                await this.setChatData(chatId, chat, 3600); // 1 giờ
                logger.info(`[Redis] Warmed cache for chat: ${chatId}`);
            }
            return { success: true };
        } catch (error) {
            logger.error(`[Redis][warmChatCache] chatId=${chatId} error=${error.message}`);
            return { success: false, error };
        }
    }

    // Batch cache invalidation cho chat
    async invalidateChatCaches(chatId, participantIds = []) {
        if (!this.client) return;
        try {
            const pipeline = this.client.multi();
            
            // Xóa cache chat chính
            pipeline.del(`chat:${chatId}`);
            pipeline.del(`chat:messages:${chatId}`);
            
            // Xóa cache pagination
            for (let page = 1; page <= 10; page++) {
                pipeline.del(`chat:messages:${chatId}:page:${page}:limit:20`);
            }
            
            // Xóa cache user chats cho tất cả participants
            participantIds.forEach(userId => {
                pipeline.del(`user:chats:${userId}`);
            });
            
            await pipeline.exec();
            logger.info(`[Redis] Invalidated caches for chat: ${chatId}`);
        } catch (error) {
            logger.error(`[Redis][invalidateChatCaches] chatId=${chatId} error=${error.message}`);
        }
    }

    // Lưu thông tin chat với TTL thông minh
    async setChatData(chatId, data, expirationInSeconds = DEFAULT_TTL) {
        if (!this.client) return { success: false, error: 'Redis not connected' };
        try {
            const key = `chat:${chatId}`;
            
            // TTL thông minh dựa trên hoạt động của chat
            let ttl = expirationInSeconds || DEFAULT_TTL;
            if (data.lastMessage && data.updatedAt) {
                const lastActivity = new Date(data.updatedAt);
                const hoursSinceLastActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);
                
                // Chat hoạt động gần đây có TTL dài hơn
                if (hoursSinceLastActivity < 1) {
                    ttl = 7200; // 2 giờ
                } else if (hoursSinceLastActivity < 24) {
                    ttl = 3600; // 1 giờ
                } else {
                    ttl = 1800; // 30 phút
                }
            }
            
            await this.client.setEx(key, ttl, JSON.stringify(data));
            return { success: true };
        } catch (error) {
            logger.error(`[Redis][setChatData] chatId=${chatId} error=${error.message}`);
            return { success: false, error };
        }
    }

    // Lấy thông tin chat
    async getChatData(chatId) {
        if (!this.client) return null;
        try {
            const key = `chat:${chatId}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error(`[Redis][getChatData] chatId=${chatId} error=${error.message}`);
            return null;
        }
    }

    // Lưu danh sách chat của user
    async setUserChats(userId, chats, expirationInSeconds = DEFAULT_TTL) {
        if (!this.client) return;
        try {
            const key = `user:chats:${userId}`;
            await this.client.setEx(key, expirationInSeconds, JSON.stringify(chats));
        } catch (error) {
            logger.error(`[Redis][setUserChats] userId=${userId} error=${error.message}`);
        }
    }

    // Lấy danh sách chat của user
    async getUserChats(userId) {
        if (!this.client) return null;
        try {
            const key = `user:chats:${userId}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error(`[Redis][getUserChats] userId=${userId} error=${error.message}`);
            return null;
        }
    }

    // Lưu tin nhắn của một chat
    async setChatMessages(chatId, messages, expirationInSeconds = DEFAULT_TTL) {
        if (!this.client) return;
        try {
            const key = `chat:messages:${chatId}`;
            await this.client.setEx(key, expirationInSeconds, JSON.stringify(messages));
        } catch (error) {
            logger.error(`[Redis][setChatMessages] chatId=${chatId} error=${error.message}`);
        }
    }

    // Lấy tin nhắn của một chat
    async getChatMessages(chatId, start = 0, stop = -1) {
        if (!this.client) return { success: false, error: 'Redis not connected' };
        try {
            const key = `chat:messages:${chatId}`;
            const data = await this.client.lRange(key, start, stop);
            return { success: true, data: data.map(msg => JSON.parse(msg)) };
        } catch (error) {
            logger.error(`[Redis][getChatMessages] chatId=${chatId} error=${error.message}`);
            return { success: false, error };
        }
    }

    // Xóa cache của một chat
    async deleteChatCache(chatId) {
        if (!this.client) return;
        try {
            const key = `chat:${chatId}`;
            await this.client.del(key);
        } catch (error) {
            logger.error(`[Redis][deleteChatCache] chatId=${chatId} error=${error.message}`);
        }
    }

    // Xóa cache tin nhắn của một chat
    async deleteChatMessagesCache(chatId) {
        if (!this.client) return;
        try {
            const key = `chat:messages:${chatId}`;
            await this.client.del(key);
        } catch (error) {
            logger.error(`[Redis][deleteChatMessagesCache] chatId=${chatId} error=${error.message}`);
        }
    }

    // Xóa cache danh sách chat của user
    async deleteUserChatsCache(userId) {
        if (!this.client) return;
        try {
            const key = `user:chats:${userId}`;
            await this.client.del(key);
        } catch (error) {
            logger.error(`[Redis][deleteUserChatsCache] userId=${userId} error=${error.message}`);
        }
    }

    // === ONLINE STATUS METHODS ===

    /**
     * Đặt trạng thái online/offline cho user (dễ dùng cho các nơi khác)
     * @param {string} userId 
     * @param {boolean} isOnline 
     * @param {number} lastSeen 
     * @param {number} expirationInSeconds 
     */
    async setOnlineStatus(userId, isOnline, lastSeen = Date.now(), expirationInSeconds = ONLINE_TTL) {
        if (!this.client) return { success: false, error: 'Redis not connected' };
        try {
            const key = `user:online:${userId}`;
            const data = JSON.stringify({ isOnline, lastSeen });
            if (expirationInSeconds) {
                await this.client.setEx(key, expirationInSeconds, data);
            } else {
                await this.client.set(key, data);
            }
            return { success: true };
        } catch (error) {
            logger.error(`[Redis][setOnlineStatus] userId=${userId} error=${error.message}`);
            return { success: false, error };
        }
    }

    // Get user's online status
    async getUserOnlineStatus(userId) {
        if (!this.client) return null;
        try {
            const key = `user:online:${userId}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error(`[Redis][getUserOnlineStatus] userId=${userId} error=${error.message}`);
            return null;
        }
    }

    // Get multiple users' online status
    async getMultipleUsersOnlineStatus(userIds) {
        if (!this.client) return null;
        try {
            const pipeline = this.client.multi();
            userIds.forEach(userId => {
                const key = `user:online:${userId}`;
                pipeline.get(key);
            });
            const results = await pipeline.exec();
            return results.map((result, index) => ({
                userId: userIds[index],
                status: result ? JSON.parse(result) : null
            }));
        } catch (error) {
            logger.error(`[Redis][getMultipleUsersOnlineStatus] error=${error.message}`);
            return null;
        }
    }

    // Delete user's online status
    async deleteUserOnlineStatus(userId) {
        if (!this.client) return;
        try {
            const key = `user:online:${userId}`;
            await this.client.del(key);
        } catch (error) {
            logger.error(`[Redis][deleteUserOnlineStatus] userId=${userId} error=${error.message}`);
        }
    }

    // Thêm 1 message vào cuối list
    async pushChatMessage(chatId, message) {
        if (!this.client) return { success: false, error: 'Redis not connected' };
        try {
            const key = `chat:messages:${chatId}`;
            await this.client.rPush(key, JSON.stringify(message));
            return { success: true };
        } catch (error) {
            logger.error(`[Redis][pushChatMessage] chatId=${chatId} error=${error.message}`);
            return { success: false, error };
        }
    }

    // Lấy nhiều chat messages cùng lúc
    async getMultipleChatMessages(chatIds) {
        if (!this.client) return { success: false, error: 'Redis not connected' };
        try {
            const pipeline = this.client.multi();
            chatIds.forEach(chatId => {
                const key = `chat:messages:${chatId}`;
                pipeline.lRange(key, 0, -1);
            });
            const results = await pipeline.exec();
            return { success: true, data: results.map(list => list.map(msg => JSON.parse(msg))) };
        } catch (error) {
            logger.error(`[Redis][getMultipleChatMessages] error=${error.message}`);
            return { success: false, error };
        }
    }

    // === DEVICE CACHING METHODS ===

    /**
     * Lưu danh sách thiết bị theo loại và trang vào cache
     * @param {string} deviceType - laptop, monitor, printer, projector, tool
     * @param {number} page - số trang
     * @param {number} limit - số thiết bị mỗi trang
     * @param {Array} devices - danh sách thiết bị
     * @param {number} total - tổng số thiết bị
     * @param {number} expirationInSeconds - thời gian cache (default 5 phút)
     */
    async setDevicePage(deviceType, page, limit, devices, total, expirationInSeconds = 300) {
        if (!this.client) return { success: false, error: 'Redis not connected' };
        try {
            const key = `devices:${deviceType}:page:${page}:limit:${limit}`;
            const data = JSON.stringify({ devices, total, page, limit, cached_at: Date.now() });
            await this.client.setEx(key, expirationInSeconds, data);
            return { success: true };
        } catch (error) {
            logger.error(`[Redis][setDevicePage] deviceType=${deviceType} page=${page} error=${error.message}`);
            return { success: false, error };
        }
    }

    /**
     * Lấy danh sách thiết bị đã cache theo loại và trang
     * @param {string} deviceType - laptop, monitor, printer, projector, tool
     * @param {number} page - số trang
     * @param {number} limit - số thiết bị mỗi trang
     */
    async getDevicePage(deviceType, page, limit) {
        if (!this.client) return null;
        try {
            const key = `devices:${deviceType}:page:${page}:limit:${limit}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error(`[Redis][getDevicePage] deviceType=${deviceType} page=${page} error=${error.message}`);
            return null;
        }
    }

    /**
     * Xóa tất cả cache của một loại thiết bị
     * @param {string} deviceType - laptop, monitor, printer, projector, tool
     */
    async deleteDeviceCache(deviceType) {
        if (!this.client) return;
        try {
            const pattern = `devices:${deviceType}:*`;
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
                logger.info(`[Redis] Deleted ${keys.length} cache keys for device type: ${deviceType}`);
            }
        } catch (error) {
            logger.error(`[Redis][deleteDeviceCache] deviceType=${deviceType} error=${error.message}`);
        }
    }

    /**
     * Xóa tất cả cache thiết bị
     */
    async deleteAllDeviceCache() {
        if (!this.client) return;
        try {
            const pattern = 'devices:*';
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
                logger.info(`[Redis] Deleted ${keys.length} device cache keys`);
            }
        } catch (error) {
            logger.error(`[Redis][deleteAllDeviceCache] error=${error.message}`);
        }
    }

    /**
     * Đóng kết nối Redis an toàn khi ứng dụng tắt
     */
    async quit() {
        if (this.client) {
            try {
                await this.client.quit();
                logger.info('[Redis] Client connection closed.');
            } catch (error) {
                logger.error('[Redis] Error closing client:', error);
            }
        }
    }
}

module.exports = new RedisService();

process.on('SIGINT', async () => {
    await redisService.quit();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    await redisService.quit();
    process.exit(0);
}); 