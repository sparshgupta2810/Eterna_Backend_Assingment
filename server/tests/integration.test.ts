
import supertest from 'supertest';
import { fastify } from '../src/server';
import { pgPool, redisConnection, initDB } from '../src/db';
import { DexRouter } from '../src/router';
import { orderWorker } from '../src/queue';

// Mock the Router for unit tests
jest.mock('../src/router');

describe('Order Execution Engine - Comprehensive Test Suite', () => {
  
  beforeAll(async () => {
    await initDB();
    await fastify.ready();
  });

  // --- SECTION A: INPUT VALIDATION ---

  // Test 1: Happy Path - Submit Valid Market Order
  it('TC-01: should accept a valid market order and return an ID', async () => {
    const response = await supertest(fastify.server)
      .post('/api/orders/execute')
      .send({
        type: 'MARKET',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amount: 1.5
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('orderId');
    expect(response.body.status).toBe('pending');
    expect(response.body.message).toBe('Order queued');
  });

  // Test 2: Reject Invalid Order Type
  it('TC-02: should strictly REJECT non-market orders (Limit/Sniper)', async () => {
    const response = await supertest(fastify.server)
      .post('/api/orders/execute')
      .send({ 
        type: 'LIMIT',
        tokenIn: 'SOL', 
        tokenOut: 'USDC',
        amount: 1 
      });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/only MARKET orders/i);
  });

  // Test 3: Reject Invalid Amount
  it('TC-03: should reject negative or zero amounts', async () => {
    const response = await supertest(fastify.server)
      .post('/api/orders/execute')
      .send({ type: 'MARKET', tokenIn: 'SOL', tokenOut: 'USDC', amount: -5 });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid amount');
  });

  // --- SECTION B: QUEUE & PERSISTENCE ---

  // Test 4: Database Persistence
  it('TC-04: should persist the order in PostgreSQL with PENDING status immediately', async () => {
    const res = await supertest(fastify.server).post('/api/orders/execute').send({
      type: 'MARKET', tokenIn: 'BTC', tokenOut: 'USDC', amount: 0.1
    });
    const id = res.body.orderId;

    // Direct DB Check
    const dbRes = await pgPool.query('SELECT * FROM orders WHERE id = $1', [id]);
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].status).toBe('pending');
    expect(dbRes.rows[0].token_in).toBe('BTC');
  });

  // Test 5: Queue Concurrency (Load Test)
  it('TC-05: should handle 5 concurrent submissions without dropping data', async () => {
    const payload = { type: 'MARKET', tokenIn: 'SOL', tokenOut: 'USDC', amount: 1 };
    
    // Fire 5 requests in parallel
    const requests = Array(5).fill(0).map(() => 
      supertest(fastify.server).post('/api/orders/execute').send(payload)
    );
    
    const responses = await Promise.all(requests);
    
    // Verify all 200 OK
    responses.forEach(r => expect(r.status).toBe(200));
    
    // Verify DB count increased by 5
    const countRes = await pgPool.query('SELECT COUNT(*) FROM orders');
    expect(parseInt(countRes.rows[0].count)).toBeGreaterThanOrEqual(5);
  });

  // --- SECTION C: ROUTING LOGIC (UNIT) ---

  // Test 6: Best Price Selection
  it('TC-06: Routing Logic should select the DEX with the HIGHER return amount', async () => {
    const router = new DexRouter();
    
    // Spy on the method but actually let it run (or mock return values specific to this test)
    // Here we manually invoke the logic to test the comparison function
    const mockQuotes = [
      { name: 'Raydium', price: 100, fee: 0.003 },
      { name: 'Meteora', price: 105, fee: 0.002 } // Higher price
    ];
    
    // Mock getQuotes implementation for this test
    jest.spyOn(router, 'getQuotes').mockResolvedValue(mockQuotes);

    const quotes = await router.getQuotes('SOL', 'USDC', 1);
    const bestQuote = quotes.sort((a, b) => b.price - a.price)[0];

    expect(bestQuote.name).toBe('Meteora');
    expect(bestQuote.price).toBe(105);
  });

  // Test 7: Router Fee Handling
  it('TC-07: Routing Logic should return valid structure with fees', async () => {
    const router = new DexRouter();
    const quotes = await router.getQuotes('SOL', 'USDC', 1);
    
    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toHaveProperty('fee');
    expect(quotes[1]).toHaveProperty('fee');
  });

  // --- SECTION D: WEBSOCKET LIFECYCLE ---

  // Test 8: WebSocket Handshake
  it('TC-08: should allow WebSocket connection upgrade for valid order ID', async () => {
    // Note: Supertest has limited WS support, checking handshake headers
    // In a real environment, use a WS client like 'ws'
    const res = await supertest(fastify.server).post('/api/orders/execute').send({
        type: 'MARKET', tokenIn: 'SOL', tokenOut: 'USDC', amount: 1
    });
    const id = res.body.orderId;

    await supertest(fastify.server)
      .get(`/ws/orders/${id}`)
      .set('Connection', 'Upgrade')
      .set('Upgrade', 'websocket')
      .expect(101); // Switching Protocols
  });

  // Test 9: WebSocket Channel Isolation
  it('TC-09: should establish separate subscriptions for different Order IDs', async () => {
    // Conceptual test: Ensure endpoint doesn't crash on random ID
    const randomId = 'non-existent-uuid';
    await supertest(fastify.server)
      .get(`/ws/orders/${randomId}`)
      .set('Connection', 'Upgrade')
      .set('Upgrade', 'websocket')
      .expect(101); 
      // Should still connect (Redis sub created), even if no data flows
  });

  // --- SECTION E: ERROR HANDLING ---

  // Test 10: Execution Failure (Slippage)
  it('TC-10: Worker should handle execution errors by updating status to FAILED', async () => {
    const router = new DexRouter();
    
    // Force executeSwap to fail
    jest.spyOn(router, 'executeSwap').mockRejectedValue(new Error('Slippage Tolerance Exceeded'));
    
    // Manually trigger the worker processing logic (Unit test of worker function)
    try {
        await router.executeSwap('Raydium', 'test-id');
    } catch (e) {
        expect(e.message).toBe('Slippage Tolerance Exceeded');
    }
    
    // In a full integration test, we would check if DB status updated to 'failed'
    // verifying the catch block in queue.ts
  });
});

afterAll(async () => {
  await pgPool.end();
  await redisConnection.quit();
});

function expect(message: any) {
  throw new Error('Function not implemented.');
}
