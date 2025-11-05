import { env } from '$env/dynamic/private';
import Redis from 'ioredis';

export const redisClient = new Redis(env.REDIS_URL);
