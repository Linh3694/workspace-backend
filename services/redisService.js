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

    // Lưu thông tin chat
    async setChatData(chatId, data, expirationInSeconds = DEFAULT_TTL) {
        if (!this.client) return { success: false, error: 'Redis not connected' };
        try {
            const key = `chat:${chatId}`;
            await this.client.hSet(key, data); // data là object {field: value, ...}
            if (expirationInSeconds) {
                await this.client.expire(key, expirationInSeconds);
            }
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