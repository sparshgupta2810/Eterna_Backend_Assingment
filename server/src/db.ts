import { Pool } from 'pg';
import Redis from 'ioredis';

// PostgreSQL Setup
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/dex_engine'
});

// Redis for BullMQ and PubSub
export const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
  maxRetriesPerRequest: null
});

export const redisPubSub = new Redis({ 
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379 
});

export const initDB = async () => {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY,
      type VARCHAR(20) NOT NULL, -- Will only accept 'MARKET'
      token_in VARCHAR(10) NOT NULL,
      token_out VARCHAR(10) NOT NULL,
      amount DECIMAL NOT NULL,
      status VARCHAR(20) NOT NULL,
      dex VARCHAR(20),
      price DECIMAL,
      tx_hash VARCHAR(100),
      logs JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
};