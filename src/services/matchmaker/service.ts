import { EventEmitter } from 'events';
import { createServiceLogger } from '../../common/logger';
import { generateId, now, isExpired } from '../../common/utils';
import { CirrusServer, ClientSession, QueuePosition, MatchmakerMessage } from '../../types';
import { config } from '../../config';

export class MatchmakerService extends EventEmitter {
  private logger = createServiceLogger('MatchmakerService');
  private cirrusServers = new Map<string, CirrusServer>();
  private clientSessions = new Map<string, ClientSession>();
  private queueOrder: string[] = [];

  constructor() {
    super();
    this.startCleanupInterval();
  }

  /**
   * Register a new Cirrus server
   */
  registerServer(connection: any, message: MatchmakerMessage): string {
    const serverId = generateId();
    const server: CirrusServer = {
      id: serverId,
      address: message.address!,
      port: message.port!,
      https: message.https || false,
      numConnectedClients: message.playerConnected ? 1 : 0,
      lastPingReceived: now(),
      ready: message.ready === true,
      metadata: message.metadata || {},
    };

    // Check for existing server with same address:port
    const existingServer = this.findServerByAddress(server.address, server.port);
    if (existingServer) {
      this.logger.info('Replacing existing server', {
        serverId: existingServer.id,
        address: server.address,
        port: server.port,
      });
      this.cirrusServers.delete(existingServer.id);
    }

    this.cirrusServers.set(serverId, server);
    this.logger.info('Server registered', {
      serverId,
      address: server.address,
      port: server.port,
      playerConnected: message.playerConnected,
    });

    this.emit('serverRegistered', server);
    return serverId;
  }

  /**
   * Update server status
   */
  updateServerStatus(serverId: string, message: MatchmakerMessage): void {
    const server = this.cirrusServers.get(serverId);
    if (!server) {
      this.logger.warn('Attempted to update non-existent server', { serverId });
      return;
    }

    switch (message.type) {
      case 'streamerConnected':
        server.ready = true;
        this.logger.info('Server ready for use', { serverId, address: server.address });
        break;
      case 'streamerDisconnected':
        server.ready = false;
        this.logger.info('Server no longer ready', { serverId, address: server.address });
        break;
      case 'clientConnected':
        server.numConnectedClients++;
        this.logger.info('Client connected to server', { serverId, clients: server.numConnectedClients });
        break;
      case 'clientDisconnected':
        server.numConnectedClients = Math.max(0, server.numConnectedClients - 1);
        if (server.numConnectedClients === 0) {
          server.lastRedirect = 0; // Make immediately available
        }
        this.logger.info('Client disconnected from server', { serverId, clients: server.numConnectedClients });
        break;
      case 'ping':
        server.lastPingReceived = now();
        break;
    }

    this.emit('serverUpdated', server);
  }

  /**
   * Unregister a server
   */
  unregisterServer(serverId: string): void {
    const server = this.cirrusServers.get(serverId);
    if (server) {
      this.cirrusServers.delete(serverId);
      this.logger.info('Server unregistered', { serverId, address: server.address });
      this.emit('serverUnregistered', server);
    }
  }

  /**
   * Get an available server for a client
   */
  getAvailableServer(): CirrusServer | null {
    for (const server of this.cirrusServers.values()) {
      if (this.isServerAvailable(server)) {
        // Add cooldown to prevent multiple assignments
        server.lastRedirect = now();
        this.logger.info('Assigned server to client', { 
          serverId: server.id, 
          address: server.address, 
          port: server.port 
        });
        return server;
      }
    }

    this.logger.warn('No available servers found', { totalServers: this.cirrusServers.size });
    return null;
  }

  /**
   * Add client to queue
   */
  addToQueue(clientId?: string, priority: number = 0): ClientSession {
    const session: ClientSession = {
      id: generateId(),
      clientId,
      createdAt: now(),
      lastActivity: now(),
      status: 'queued',
      priority,
    };

    this.clientSessions.set(session.id, session);
    
    // Insert into queue based on priority
    const insertIndex = this.queueOrder.findIndex(sessionId => {
      const otherSession = this.clientSessions.get(sessionId);
      return otherSession && otherSession.priority < priority;
    });

    if (insertIndex === -1) {
      this.queueOrder.push(session.id);
    } else {
      this.queueOrder.splice(insertIndex, 0, session.id);
    }

    this.logger.info('Client added to queue', { 
      sessionId: session.id, 
      clientId, 
      priority, 
      queuePosition: this.getQueuePosition(session.id)?.position 
    });

    this.emit('clientQueued', session);
    return session;
  }

  /**
   * Get queue position for a session
   */
  getQueuePosition(sessionId: string): QueuePosition | null {
    const position = this.queueOrder.indexOf(sessionId) + 1;
    if (position === 0) return null;

    return {
      position,
      estimatedWaitTime: position * 300000, // 5 minutes per position estimate
      totalInQueue: this.queueOrder.length,
    };
  }

  /**
   * Process next client in queue
   */
  processNextInQueue(): boolean {
    if (this.queueOrder.length === 0) return false;

    const server = this.getAvailableServer();
    if (!server) return false;

    const sessionId = this.queueOrder.shift()!;
    const session = this.clientSessions.get(sessionId);
    
    if (session) {
      session.serverId = server.id;
      session.status = 'connected';
      session.lastActivity = now();
      
      this.logger.info('Client assigned to server', { 
        sessionId, 
        serverId: server.id,
        clientId: session.clientId 
      });
      
      this.emit('clientAssigned', session, server);
      return true;
    }

    return false;
  }

  /**
   * Remove session
   */
  removeSession(sessionId: string): void {
    const session = this.clientSessions.get(sessionId);
    if (session) {
      this.clientSessions.delete(sessionId);
      const queueIndex = this.queueOrder.indexOf(sessionId);
      if (queueIndex !== -1) {
        this.queueOrder.splice(queueIndex, 1);
      }
      this.logger.info('Session removed', { sessionId, clientId: session.clientId });
      this.emit('sessionRemoved', session);
    }
  }

  /**
   * Get server statistics
   */
  getStats() {
    const servers = Array.from(this.cirrusServers.values());
    const availableServers = servers.filter(server => this.isServerAvailable(server));
    const totalClients = servers.reduce((sum, server) => sum + server.numConnectedClients, 0);

    return {
      totalServers: servers.length,
      availableServers: availableServers.length,
      totalClients,
      queueLength: this.queueOrder.length,
      activeSessions: this.clientSessions.size,
    };
  }

  /**
   * Get all servers
   */
  getServers(): CirrusServer[] {
    return Array.from(this.cirrusServers.values());
  }

  /**
   * Check if server is available
   */
  private isServerAvailable(server: CirrusServer): boolean {
    if (!server.ready || server.numConnectedClients > 0) {
      return false;
    }

    // Check cooldown period
    if (server.lastRedirect && (now() - server.lastRedirect) < 10000) {
      return false;
    }

    return true;
  }

  /**
   * Find server by address and port
   */
  private findServerByAddress(address: string, port: number): CirrusServer | undefined {
    return Array.from(this.cirrusServers.values()).find(
      server => server.address === address && server.port === port
    );
  }

  /**
   * Start cleanup interval for expired sessions and stale servers
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
      this.cleanupStaleServers();
    }, 60000); // Run every minute
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const currentTime = now();
    for (const [sessionId, session] of this.clientSessions.entries()) {
      if (isExpired(session.lastActivity, config.SessionTimeoutMs!)) {
        this.logger.info('Removing expired session', { sessionId, clientId: session.clientId });
        this.removeSession(sessionId);
      }
    }
  }

  /**
   * Clean up stale servers (no ping for 2 minutes)
   */
  private cleanupStaleServers(): void {
    const currentTime = now();
    for (const [serverId, server] of this.cirrusServers.entries()) {
      if (isExpired(server.lastPingReceived, 120000)) { // 2 minutes
        this.logger.warn('Removing stale server', { serverId, address: server.address });
        this.unregisterServer(serverId);
      }
    }
  }
}