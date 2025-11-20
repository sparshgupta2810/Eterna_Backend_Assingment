import { useState, useRef } from 'react';
import { Zap, Terminal, ArrowRight, CheckCircle, XCircle, Activity } from 'lucide-react';

// TYPES
interface Order {
  id: string;
  status: string;
  logs: string[];
  txHash?: string;
  dex?: string;
  price?: number;
}

export default function App() {
  const [amount, setAmount] = useState(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);

  // 1. Submit Order
  const submitOrder = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/orders/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'MARKET', // HARDCODED: ONE ORDER TYPE
          tokenIn: 'SOL',
          tokenOut: 'USDC',
          amount: amount
        })
      });
      
      const data = await res.json();
      if (data.orderId) {
        const newOrder = { id: data.orderId, status: 'pending', logs: [] };
        setOrders(prev => [newOrder, ...prev]);
        connectWebSocket(data.orderId);
      }
    } catch (err) {
      alert('Error connecting to backend. Ensure Node server is running on port 3000.');
    }
  };

  // 2. Connect WebSocket
  const connectWebSocket = (orderId: string) => {
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(`ws://localhost:3000/ws/orders/${orderId}`);
    
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      
      // Update Logs
      if (update.log) {
        setLogs(prev => [`[${update.status.toUpperCase()}] ${update.log}`, ...prev]);
      }

      // Update Order State
      setOrders(prev => prev.map(o => 
        o.id === update.id ? { ...o, status: update.status, txHash: update.txHash, dex: update.dex, price: update.price } : o
      ));
    };

    wsRef.current = ws;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-8">
      <header className="mb-8 flex items-center gap-3 text-emerald-400">
        <div className="p-2 bg-emerald-500/20 rounded-lg"><Zap className="w-6 h-6" /></div>
        <h1 className="text-2xl font-bold tracking-tight">DEX Engine: Market Order Interface</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Control Panel */}
        <div className="space-y-6">
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Order Entry</h2>
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded font-bold">MARKET ONLY</span>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Amount (SOL)</label>
                <input 
                  type="number" 
                  value={amount}
                  onChange={e => setAmount(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-600 p-4 rounded-lg text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all text-lg font-mono"
                />
              </div>
              
              <div className="flex items-center gap-4 text-sm font-mono">
                <div className="flex-1 bg-slate-900 p-4 rounded-lg text-center border border-slate-700 text-slate-300">SOL</div>
                <ArrowRight className="w-5 h-5 text-slate-600" />
                <div className="flex-1 bg-slate-900 p-4 rounded-lg text-center border border-slate-700 text-slate-300">USDC</div>
              </div>

              <button 
                onClick={submitOrder}
                className="w-full bg-emerald-600 hover:bg-emerald-500 py-4 rounded-lg font-bold text-white transition-colors shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" />
                EXECUTE MARKET ORDER
              </button>
            </div>
          </div>

          {/* Order Feed */}
          <div className="space-y-3">
            {orders.map(o => (
              <div key={o.id} className="bg-slate-800 border border-slate-700 p-4 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-slate-500 mb-1">ID: {o.id.slice(0, 8)}</div>
                  <div className="flex items-center gap-2">
                    {o.status === 'confirmed' && <span className="text-emerald-400 font-bold text-sm">{o.dex} @ ${o.price?.toFixed(2)}</span>}
                    {o.status === 'pending' && <span className="text-slate-400 text-sm italic">Queued...</span>}
                    {o.status === 'routing' && <span className="text-blue-400 text-sm animate-pulse">Finding Best Price...</span>}
                  </div>
                </div>
                
                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1 ${
                  o.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' :
                  o.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                  'bg-blue-500/10 text-blue-400'
                }`}>
                  {o.status === 'confirmed' && <CheckCircle className="w-3 h-3" />}
                  {o.status === 'failed' && <XCircle className="w-3 h-3" />}
                  {o.status === 'routing' && <Activity className="w-3 h-3" />}
                  {o.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Terminal Logs */}
        <div className="bg-black rounded-xl border border-slate-800 p-5 font-mono text-xs h-[600px] overflow-hidden flex flex-col shadow-2xl">
          <div className="flex items-center gap-2 text-slate-500 mb-3 border-b border-slate-800 pb-3">
            <Terminal className="w-4 h-4" />
            <span>Real-time Execution Logs</span>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent pr-2">
            {logs.length === 0 && (
              <div className="text-slate-600 italic flex flex-col items-center justify-center h-full gap-2">
                <Activity className="w-8 h-8 opacity-20" />
                Waiting for order submission...
              </div>
            )}
            {logs.map((log, i) => (
              <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <span className="text-slate-700 select-none">➜</span>
                <span className={log.includes('CONFIRMED') ? 'text-emerald-400' : log.includes('FAILED') ? 'text-red-400' : 'text-slate-300'}>
                  {log}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}