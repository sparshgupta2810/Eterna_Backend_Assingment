# 🚀 Eterna Order Execution Engine  
Backend Assignment — **Market Order Execution System**

---

## 🏗 Tech Stack

- **Runtime:** Node.js + TypeScript  
- **API Framework:** Fastify  
- **WebSockets:** @fastify/websocket  
- **Queue System:** BullMQ  
- **State Management:** Redis (Pub/Sub + Queue Storage)  
- **Database:** PostgreSQL  
- **Architecture:** Event-driven, Queue-based Execution Pipeline  

---

## 🎯 Core Design Decisions

### ✅ **Selected Order Type: MARKET ORDER**

This assignment focuses exclusively on **Market Orders**.

**Why Market Orders?**

Market orders represent the core execution path of any trading engine because they require:

- Low latency  
- Fast routing  
- Predictable settlement  
- Slippage awareness  

Building the Market Order engine first creates the foundation for more advanced order types.

---

## 🔧 Extensibility for Future Order Types

### **1️⃣ Limit Orders**

Add a standalone **Price Watcher Service** using:

- Redis Keyspace notifications **or**  
- Cron-based polling  

When: `CurrentPrice <= LimitPrice`  
→ Trigger the existing `POST /api/orders/execute`  
→ Limit order converts into a Market Order for execution  

No changes required in the existing engine.

---

### **2️⃣ Sniper Orders**

Add a **Mempool Listener Service**:

- Subscribes to chain events (e.g., `LiquidityPoolCreated`)  
- Detects token launches instantly  
- Pushes a **high-priority** job to BullMQ  

Uses the same execution pipeline.

---

## 🧩 Architecture & Processing Flow

---

## 📡 2. Real-time Updates (WebSocket)

### **Endpoint**
ws://localhost:3000/ws/orders/:orderId

markdown
Copy code

### **Flow**
1. Client connects using `orderId`
2. Backend subscribes to Redis channel:
order:<orderId>

bash
Copy code
3. Worker publishes status → Redis → WebSocket client

