import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createServiceLogger } from '../../common/logger';
import { WebSocketMessage } from '../../types';
import { MatchmakerService } from '../matchmaker/service';
import { SessionService } from '../session/service';

export class WebSocketService {
  private logger = createServiceLogger('WebSocketService');
  private io: SocketIOServer;
  private connectedClients = new Map<string, any>(); // socketId -> socket info

  constructor(
    httpServer: HttpServer,
    private matchmakerService: MatchmakerService,
    private sessionService: SessionService
  ) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });

    this.setupEventHandlers();
    this.setupServiceEventListeners();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      this.logger.info('Client connected', { 
        socketId: socket.id,
        remoteAddress: socket.handshake.address 
      });

      this.connectedClients.set(socket.id, {
        socket,
        connectedAt: Date.now(),
        sessionId: null,
        clientId: null,
      });

      // Handle queue join
      socket.on('joinQueue', (data) => {
        this.handleJoinQueue(socket, data);
      });

      // Handle queue status request
      socket.on('getQueueStatus', (data) => {
        this.handleGetQueueStatus(socket, data);
      });

      // Handle session updates
      socket.on('updateActivity', (data) => {
        this.handleUpdateActivity(socket, data);
      });

      // Handle ping for keep-alive
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.handleDisconnection(socket, reason);
      });

      // Send initial connection confirmation
      socket.emit('connected', {
        socketId: socket.id,
        timestamp: Date.now(),
      });
    });
  }

  private setupServiceEventListeners(): void {
    // Listen for matchmaker events
    this.matchmakerService.on('clientQueued', (session) => {
      this.broadcastQueueUpdate();
      this.sendToSession(session.id, 'queueJoined', {
        sessionId: session.id,
        position: this.matchmakerService.getQueuePosition(session.id),
      });
    });

    this.matchmakerService.on('clientAssigned', (session, server) => {
      this.sendToSession(session.id, 'serverAssigned', {
        sessionId: session.id,
        server: {
          address: server.address,
          port: server.port,
          https: server.https,
        },
      });
      this.broadcastQueueUpdate();
    });

    this.matchmakerService.on('serverRegistered', () => {
      this.broadcastServerUpdate();
    });

    this.matchmakerService.on('serverUnregistered', () => {
      this.broadcastServerUpdate();
    });

    // Listen for session events
    this.sessionService.on('sessionRemoved', (session) => {
      this.sendToSession(session.id, 'sessionExpired', {
        sessionId: session.id,
        reason: 'timeout',
      });
    });
  }

  private handleJoinQueue(socket: any, data: any): void {
    try {
      const { clientId, priority = 0 } = data;
      const client = this.connectedClients.get(socket.id);
      
      if (!client) {
        socket.emit('error', { message: 'Client not found' });
        return;
      }

      const session = this.matchmakerService.addToQueue(clientId, priority);
      
      // Update client info
      client.sessionId = session.id;
      client.clientId = clientId;

      const queuePosition = this.matchmakerService.getQueuePosition(session.id);
      
      socket.emit('queueJoined', {
        sessionId: session.id,
        position: queuePosition,
      });

      this.logger.info('Client joined queue via WebSocket', {
        socketId: socket.id,
        sessionId: session.id,
        clientId,
        priority,
      });

    } catch (error: any) {
      this.logger.error('Error handling join queue', { 
        socketId: socket.id, 
        error: error.message 
      });
      socket.emit('error', { message: 'Failed to join queue' });
    }
  }

  private handleGetQueueStatus(socket: any, data: any): void {
    try {
      const { sessionId } = data;
      const queuePosition = this.matchmakerService.getQueuePosition(sessionId);
      
      if (queuePosition) {
        socket.emit('queueStatus', {
          sessionId,
          position: queuePosition,
        });
      } else {
        socket.emit('queueStatus', {
          sessionId,
          position: null,
          message: 'Session not found in queue',
        });
      }
    } catch (error: any) {
      this.logger.error('Error getting queue status', { 
        socketId: socket.id, 
        error: error.message 
      });
      socket.emit('error', { message: 'Failed to get queue status' });
    }
  }

  private handleUpdateActivity(socket: any, data: any): void {
    try {
      const { sessionId } = data;
      const updated = this.sessionService.updateActivity(sessionId);
      
      if (updated) {
        socket.emit('activityUpdated', { sessionId, timestamp: Date.now() });
      } else {
        socket.emit('error', { message: 'Session not found' });
      }
    } catch (error: any) {
      this.logger.error('Error updating activity', { 
        socketId: socket.id, 
        error: error.message 
      });
      socket.emit('error', { message: 'Failed to update activity' });
    }
  }

  private handleDisconnection(socket: any, reason: string): void {
    const client = this.connectedClients.get(socket.id);
    
    if (client) {
      this.logger.info('Client disconnected', {
        socketId: socket.id,
        sessionId: client.sessionId,
        clientId: client.clientId,
        reason,
      });

      // Clean up session if exists
      if (client.sessionId) {
        this.sessionService.removeSession(client.sessionId);
        this.matchmakerService.removeSession(client.sessionId);
      }

      this.connectedClients.delete(socket.id);
    }
  }

  private sendToSession(sessionId: string, event: string, data: any): void {
    // Find socket by session ID
    for (const [socketId, client] of this.connectedClients.entries()) {
      if (client.sessionId === sessionId) {
        client.socket.emit(event, data);
        break;
      }
    }
  }

  private broadcastQueueUpdate(): void {
    const stats = this.matchmakerService.getStats();
    const message: WebSocketMessage = {
      type: 'queueUpdate',
      data: {
        queueLength: stats.queueLength,
        availableServers: stats.availableServers,
        totalServers: stats.totalServers,
      },
      timestamp: Date.now(),
    };

    this.io.emit('queueUpdate', message);
  }

  private broadcastServerUpdate(): void {
    const stats = this.matchmakerService.getStats();
    const message: WebSocketMessage = {
      type: 'healthUpdate',
      data: {
        totalServers: stats.totalServers,
        availableServers: stats.availableServers,
        totalClients: stats.totalClients,
      },
      timestamp: Date.now(),
    };

    this.io.emit('serverUpdate', message);
  }

  public broadcastMessage(event: string, data: any): void {
    this.io.emit(event, data);
  }

  public getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  public getConnectedClients(): any[] {
    return Array.from(this.connectedClients.values()).map(client => ({
      socketId: client.socket.id,
      sessionId: client.sessionId,
      clientId: client.clientId,
      connectedAt: client.connectedAt,
    }));
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down WebSocket service');
    
    // Notify all connected clients
    this.io.emit('serverShutdown', {
      message: 'Server is shutting down',
      timestamp: Date.now(),
    });

    // Close all connections
    this.io.close();
    this.connectedClients.clear();
    
    this.logger.info('WebSocket service shutdown complete');
  }
}