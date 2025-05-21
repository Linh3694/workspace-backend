const { createClient } = require('redis');
require('dotenv').config();

const redisClient = createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
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