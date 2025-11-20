// STRICTLY ONE ORDER TYPE AS PER REQUIREMENTS
export type OrderType = 'MARKET'; 

export type OrderStatus = 'pending' | 'routing' | 'building' | 'submitted' | 'confirmed' | 'failed';

export interface Order {
  id: string;
  type: OrderType;
  tokenIn: string;
  tokenOut: string;
  amount: number;
  status: OrderStatus;
  dex?: 'Raydium' | 'Meteora';
  price?: number;
  txHash?: string;
  logs: string[];
  created_at: Date;
  updated_at: Date;
}
