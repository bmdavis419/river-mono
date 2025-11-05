import { env } from '$env/dynamic/private';
import Redis from 'ioredis';

console.log('REDIS_URL', env.REDIS_URL);

export const redisClient = new Redis(env.REDIS_URL);
