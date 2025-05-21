const { createClient } = require('redis');
require('dotenv').config();

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error('Redis connection lost. Max retries reached.');
                return new Error('Redis max retries reached');
            }
            return Math.min(retries * 100, 3000);
        }
    }
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

const connectRedis = async () => {
    try {
        await redisClient.connect();
    } catch (error) {
        console.error('Redis connection error:', error);
    }
};

module.exports = {
    redisClient,
    connectRedis
}; 