const Fastify = require('fastify');
import websocket from '@fastify/websocket';
const { randomUUID } = require('crypto');
const { orderQueue } = require('./queue');
const { pgPool, initDB, redisPubSub } = require('./db');

const fastify = Fastify({ logger: true });
fastify.register(websocket);

initDB();

// POST /api/orders/execute
fastify.post('/api/orders/execute', async (request, reply) => {
  const { type, tokenIn, tokenOut, amount } = request.body as any;

  // VALIDATION: STRICTLY MARKET ORDERS ONLY
  if (type !== 'MARKET') {
    return reply.code(400).send({ 
      error: 'Invalid Order Type. This engine only supports MARKET orders.' 
    });
  }
  
  if (amount <= 0) return reply.code(400).send({ error: 'Invalid amount' });

  const orderId = randomUUID();

  // 1. Persist Pending State
  await pgPool.query(
    `INSERT INTO orders (id, type, token_in, token_out, amount, status, logs) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orderId, type, tokenIn, tokenOut, amount, 'pending', JSON.stringify(['Order Received'])]
  );

  // 2. Push to Queue
  await orderQueue.add('execute-swap', { orderId, tokenIn, tokenOut, amount }, {
    attempts: 3, // Retry logic
    backoff: { type: 'exponential', delay: 1000 }
  });

  return { orderId, status: 'pending', message: 'Order queued' };
});

// WebSocket Route for Real-time Updates
fastify.register(async function (fastify) {
  fastify.get('/ws/orders/:orderId', { websocket: true }, (connection, req) => {
    const { orderId } = req.params as any;
    
    const sub = new Redis(); 
    sub.subscribe(`order:${orderId}`);

    sub.on('message', (channel, message) => {
      connection.socket.send(message);
    });

    connection.socket.on('close', () => sub.disconnect());
  });
});

const start = async () => {
  try { await fastify.listen({ port: 3000 }); } 
  catch (err) { process.exit(1); }
};
start();
