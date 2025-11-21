🏗 Tech Stack

Runtime: Node.js + TypeScript

API & WebSocket: Fastify (@fastify/websocket)

Queue & Workers: BullMQ

State Management: Redis (Pub/Sub & Queue storage)

Persistence: PostgreSQL

📝 Core Design Decisions

1. Selected Order Type: MARKET ORDER

I strictly implemented the Market Order type.

Why?
Market orders are the atomic unit of execution for any trading system. They represent the "execution layer" that prioritizes speed, routing efficiency, and slippage protection. By building a robust Market Order engine first, we establish the critical infrastructure (Queueing -> Routing -> Transaction Building -> Settlement) required for any other order type.

2. Extensibility (How to support Limit & Sniper)

The engine is designed as a composable "Execution Core". Supporting other types does not require changing this engine, but rather adding triggers before it:

Limit Orders: Implement a separate Price Watcher Service (using Redis Keyspace notifications or a Cron job) that monitors pool prices. When CurrentPrice <= LimitPrice, the watcher triggers the existing POST /api/orders/execute endpoint, effectively converting the Limit order into a Market order for execution.

Sniper Orders: Implement a Mempool Listener Service that subscribes to on-chain events (e.g., LiquidityPoolCreated). Upon detecting a target token launch, it instantly injects a job into this engine's queue with a priority: high flag to ensure it is processed before standard user orders.

🚀 Architecture & Flow

1. Order Submission (HTTP)

Endpoint: POST /api/orders/execute

Action: Validates payload (Strictly MARKET type). Generates a UUID. Pushes the job to the BullMQ queue order-execution.

Response: Returns { orderId, status: 'pending' } immediately to the client.

2. Real-time Updates (WebSocket)

Endpoint: WS /ws/orders/:orderId

Mechanism: The client connects using the orderId. The backend subscribes to a specific Redis channel order:<orderId>.

Flow: As the Worker processes the job, it publishes status updates (routing -> building -> confirmed) to Redis, which are instantly forwarded to the WebSocket client.

3. Concurrent Processing (Queue)

Concurrency: The Worker is configured with concurrency: 10, allowing 10 orders to be processed in parallel.

Rate Limiting: A limiter of 100 jobs / 60 seconds is applied to respect DEX API rate limits.

Retries: If execution fails (e.g., slippage error), BullMQ automatically retries up to 3 times with exponential backoff.

🛠 Setup Instructions

Prerequisites

Node.js v16+

Docker (for running Redis and Postgres)

1. Start Infrastructure

Run the required databases using Docker:

# Start Redis (Required for Queue & WebSockets)
docker run -d -p 6379:6379 --name redis-dex redis

# Start PostgreSQL (Required for History)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=dex_engine --name pg-dex postgres


2. Installation

Navigate to the server directory and install dependencies:

cd server
npm install


3. Running the Backend

Start the Fastify server and the Queue Worker:

npm start
# Server will listen on http://localhost:3000


4. Running Tests

Run the integration test suite (Validation, Queue, Routing, WebSocket):

npm test


🧪 API Specification

Submit Order

POST /api/orders/execute

{
  "type": "MARKET",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amount": 1.5
}


WebSocket Stream

URL: ws://localhost:3000/ws/orders/{orderId}
Events:

{"status": "routing", "log": "..."}

{"status": "building", "dex": "Raydium", "price": 145.50}

{"status": "submitted", "log": "..."}

{"status": "confirmed", "txHash": "0x..."}
```
