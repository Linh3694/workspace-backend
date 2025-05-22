const { createClient } = require('redis');
require('dotenv').config();

class RedisService {
    constructor() {
        // Trong môi trường local, không khởi tạo Redis client
        if (process.env.NODE_ENV === 'production') {
            this.client = createClient({
                socket: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
                    reconnectStrategy: (retries) => {
                        if (retries > 10) {
                            console.error('Redis connection lost. Max retries reached.');
                            return new Error('Redis max retries reached');
                        }
                        return Math.min(retries * 100, 3000);
                    }
                },
                password: process.env.REDIS_PASSWORD
            });

            this.client.on('error', (err) => console.log('Redis Client Error', err));
            this.client.connect();
        } else {
            console.log('Running in local environment without Redis');
            this.client = null;
        }
    }

    // === USER METHODS ===

    // Lưu thông tin user
    async setUserData(userId, data, expirationInSeconds = 3600) {
        if (!this.client) return;
        try {
            const key = `user:${userId}`;
            await this.client.setEx(key, expirationInSeconds, JSON.stringify(data));
        } catch (error) {
            console.error('Redis setUserData error:', error);
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
            console.error('Redis getUserData error:', error);
            return null;
        }
    }

    // Lưu danh sách users
    async setAllUsers(users, expirationInSeconds = 3600) {
        if (!this.client) return;
        try {
            const key = 'users:all';
            await this.client.setEx(key, expirationInSeconds, JSON.stringify(users));
        } catch (error) {
            console.error('Redis setAllUsers error:', error);
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
            console.error('Redis getAllUsers error:', error);
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
            console.error('Redis deleteUserCache error:', error);
        }
    }

    // Xóa cache danh sách users
    async deleteAllUsersCache() {
        if (!this.client) return;
        try {
            const key = 'users:all';
            await this.client.del(key);
        } catch (error) {
            console.error('Redis deleteAllUsersCache error:', error);
        }
    }

    // === AUTH METHODS ===

    // Lưu token
    async setAuthToken(userId, token, expirationInSeconds = 86400) {
        if (!this.client) return;
        try {
            const key = `auth:token:${userId}`;
            await this.client.setEx(key, expirationInSeconds, token);
        } catch (error) {
            console.error('Redis setAuthToken error:', error);
        }
    }

    // Lấy token
    async getAuthToken(userId) {
        if (!this.client) return null;
        try {
            const key = `auth:token:${userId}`;
            return await this.client.get(key);
        } catch (error) {
            console.error('Redis getAuthToken error:', error);
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
            console.error('Redis deleteAuthToken error:', error);
        }
    }

    // === CHAT METHODS === 

    // Lưu thông tin chat
    async setChatData(chatId, data, expirationInSeconds = 3600) {
        if (!this.client) return;
        try {
            const key = `chat:${chatId}`;
            await this.client.setEx(key, expirationInSeconds, JSON.stringify(data));
        } catch (error) {
            console.error('Redis setChatData error:', error);
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
            console.error('Redis getChatData error:', error);
            return null;
        }
    }

    // Lưu danh sách chat của user
    async setUserChats(userId, chats, expirationInSeconds = 3600) {
        if (!this.client) return;
        try {
            const key = `user:chats:${userId}`;
            await this.client.setEx(key, expirationInSeconds, JSON.stringify(chats));
        } catch (error) {
            console.error('Redis setUserChats error:', error);
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
            console.error('Redis getUserChats error:', error);
            return null;
        }
    }

    // Lưu tin nhắn của một chat
    async setChatMessages(chatId, messages, expirationInSeconds = 3600) {
        if (!this.client) return;
        try {
            const key = `chat:messages:${chatId}`;
            await this.client.setEx(key, expirationInSeconds, JSON.stringify(messages));
        } catch (error) {
            console.error('Redis setChatMessages error:', error);
        }
    }

    // Lấy tin nhắn của một chat
    async getChatMessages(chatId) {
        if (!this.client) return null;
        try {
            const key = `chat:messages:${chatId}`;
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Redis getChatMessages error:', error);
            return null;
        }
    }

    // Xóa cache của một chat
    async deleteChatCache(chatId) {
        if (!this.client) return;
        try {
            const key = `chat:${chatId}`;
            await this.client.del(key);
        } catch (error) {
            console.error('Redis deleteChatCache error:', error);
        }
    }

    // Xóa cache tin nhắn của một chat
    async deleteChatMessagesCache(chatId) {
        if (!this.client) return;
        try {
            const key = `chat:messages:${chatId}`;
            await this.client.del(key);
        } catch (error) {
            console.error('Redis deleteChatMessagesCache error:', error);
        }
    }

    // Xóa cache danh sách chat của user
    async deleteUserChatsCache(userId) {
        if (!this.client) return;
        try {
            const key = `user:chats:${userId}`;
            await this.client.del(key);
        } catch (error) {
            console.error('Redis deleteUserChatsCache error:', error);
        }
    }
}

module.exports = new RedisService(); 