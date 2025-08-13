export interface CirrusServer {
  id: string;
  address: string;
  port: number;
  https: boolean;
  numConnectedClients: number;
  lastPingReceived: number;
  ready: boolean;
  lastRedirect?: number;
  metadata?: Record<string, any>;
}

export interface MatchmakerConfig {
  HttpPort: number;
  UseHTTPS: boolean;
  MatchmakerPort: number;
  LogToFile: boolean;
  EnableWebserver: boolean;
  RedisUrl?: string;
  DatabaseUrl?: string;
  JwtSecret?: string;
  RateLimitWindowMs?: number;
  RateLimitMaxRequests?: number;
  SessionTimeoutMs?: number;
  HealthCheckIntervalMs?: number;
  AdminDashboardPort?: number;
}

export interface ClientSession {
  id: string;
  clientId?: string;
  serverId?: string;
  createdAt: number;
  lastActivity: number;
  status: 'queued' | 'connected' | 'disconnected' | 'expired';
  priority: number;
  metadata?: Record<string, any>;
}

export interface QueuePosition {
  position: number;
  estimatedWaitTime: number;
  totalInQueue: number;
}

export interface HealthStatus {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  lastCheck: number;
  details?: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface MatchmakerMessage {
  type: 'connect' | 'disconnect' | 'streamerConnected' | 'streamerDisconnected' | 
        'clientConnected' | 'clientDisconnected' | 'ping' | 'healthCheck';
  address?: string;
  port?: number;
  https?: boolean;
  ready?: boolean;
  playerConnected?: boolean;
  serverId?: string;
  clientId?: string;
  metadata?: Record<string, any>;
}

export interface WebSocketMessage {
  type: 'queueUpdate' | 'serverAssigned' | 'error' | 'healthUpdate';
  data: any;
  timestamp: number;
}