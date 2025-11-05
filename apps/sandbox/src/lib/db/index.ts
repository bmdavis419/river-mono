import { REDIS_URL } from '$env/static/private';
import Redis from 'ioredis';

export const redisClient = new Redis(REDIS_URL);
