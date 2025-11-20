import { Queue, Worker, Job } from 'bullmq';
import { redisConnection, pgPool, redisPubSub } from './db';
import { DexRouter } from './router';

const ORDER_QUEUE_NAME = 'order-execution';

// The Queue
export const orderQueue = new Queue(ORDER_QUEUE_NAME, { 
  connection: redisConnection 
});

const router = new DexRouter();

// The Worker
export const orderWorker = new Worker(ORDER_QUEUE_NAME, async (job: Job) => {
  const { orderId, tokenIn, tokenOut, amount } = job.data;

  // Helper to sync state: DB -> Redis PubSub -> Frontend
  const logAndNotify = async (status: string, msg: string, extra: any = {}) => {
    await pgPool.query(
      `UPDATE orders SET status = $1, logs = logs || $2::jsonb, updated_at = NOW(), dex = $3, price = $4, tx_hash = $5 WHERE id = $6`,
      [status, JSON.stringify([msg]), extra.dex || null, extra.price || null, extra.txHash || null, orderId]
    );
    
    await redisPubSub.publish(`order:${orderId}`, JSON.stringify({ 
      id: orderId, status, log: msg, ...extra 
    }));
  };

  try {
    // 1. ROUTING
    await logAndNotify('routing', 'Querying Raydium and Meteora...');
    const quotes = await router.getQuotes(tokenIn, tokenOut, amount);
    const bestQuote = quotes.sort((a, b) => b.price - a.price)[0]; // Best price wins

    // 2. BUILDING
    await logAndNotify('building', `Selected ${bestQuote.name} @ $${bestQuote.price.toFixed(2)}`, {
      dex: bestQuote.name,
      price: bestQuote.price
    });
    await new Promise(r => setTimeout(r, 500)); // Simulate tx construction

    // 3. SUBMITTED
    await logAndNotify('submitted', 'Transaction signed and propagated.');

    // 4. EXECUTION (SETTLEMENT)
    const txHash = await router.executeSwap(bestQuote.name, orderId);

    // 5. CONFIRMED
    await logAndNotify('confirmed', `Swap successful: ${txHash}`, { txHash });
    return { status: 'confirmed', txHash };

  } catch (error: any) {
    await logAndNotify('failed', `Error: ${error.message}`);
    throw error; // Triggers BullMQ retry logic
  }
}, {
  connection: redisConnection,
  concurrency: 10, // Requirement: Max 10 concurrent
  limiter: {
    max: 100, // Requirement: 100 orders/min
    duration: 60000
  }
});
