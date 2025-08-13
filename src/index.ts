import * as net from 'net';
import * as http from 'http';
import { logger, createServiceLogger } from './common/logger';
import { config } from './config';
import { MatchmakerService } from './services/matchmaker/service';
import { ApiGatewayService } from './services/api-gateway/service';
import { SessionService } from './services/session/service';
import { HealthMonitorService } from './services/health-monitor/service';
import { WebSocketService } from './services/websocket/service';
import { AdminDashboardService } from './services/admin-dashboard/service';
import { MatchmakerMessage } from './types';

class EnhancedMatchmaker {
  private logger = createServiceLogger('EnhancedMatchmaker');
  private matchmakerService: MatchmakerService;
  private apiGatewayService: ApiGatewayService;
  private sessionService: SessionService;
  private healthMonitorService: HealthMonitorService;
  private webSocketService!: WebSocketService;
  private adminDashboardService!: AdminDashboardService;
  private tcpServer!: net.Server;
  private httpServer!: http.Server;
  private connectionMap = new Map<net.Socket, string>(); // connection -> serverId

  constructor() {
    this.logger.info('Initializing Enhanced Matchmaker');
    
    // Initialize services
    this.sessionService = new SessionService();
    this.matchmakerService = new MatchmakerService();
    this.apiGatewayService = new ApiGatewayService(this.matchmakerService);
    this.healthMonitorService = new HealthMonitorService();

    this.setupServiceHealthChecks();
    this.setupEventHandlers();
    this.setupTcpServer();
    this.setupGracefulShutdown();
  }

  /**
   * Start all services
   */
  public async start(): Promise<void> {
    try {
      this.logger.info('Starting Enhanced Matchmaker services');

      // Create HTTP server for Express and Socket.IO
      this.httpServer = http.createServer(this.apiGatewayService.getApp());

      // Initialize WebSocket service
      this.webSocketService = new WebSocketService(
        this.httpServer,
        this.matchmakerService,
        this.sessionService
      );

      // Initialize Admin Dashboard
      this.adminDashboardService = new AdminDashboardService(
        this.matchmakerService,
        this.sessionService,
        this.healthMonitorService,
        this.webSocketService
      );

      // Start HTTP server with Express and Socket.IO
      await this.startHttpServer();

      // Start Admin Dashboard
      await this.adminDashboardService.start(config.AdminDashboardPort!);

      // Start TCP server for Cirrus connections
      await this.startTcpServer();

      this.logger.info('Enhanced Matchmaker started successfully', {
        httpPort: config.HttpPort,
        matchmakerPort: config.MatchmakerPort,
        adminDashboardPort: config.AdminDashboardPort,
        useHttps: config.UseHTTPS,
      });

      // Log initial status
      setTimeout(() => {
        const stats = this.matchmakerService.getStats();
        const health = this.healthMonitorService.getOverallHealth();
        const wsClients = this.webSocketService.getConnectedClientsCount();
        this.logger.info('System status after startup', { 
          stats, 
          health: health.status,
          webSocketClients: wsClients,
        });
      }, 5000);

    } catch (error: any) {
      this.logger.error('Failed to start Enhanced Matchmaker', { error: error.message });
      throw error;
    }
  }

  /**
   * Setup health checks for all services
   */
  private setupServiceHealthChecks(): void {
    // Matchmaker service health check
    this.healthMonitorService.registerService('matchmaker', async () => {
      const stats = this.matchmakerService.getStats();
      const hasServers = stats.totalServers > 0;
      
      return {
        service: 'matchmaker',
        status: hasServers ? 'healthy' : 'degraded',
        lastCheck: Date.now(),
        details: stats,
      };
    });

    // Session service health check
    this.healthMonitorService.registerService('session', async () => {
      const stats = this.sessionService.getStats();
      const hasExpiredSessions = stats.expiredSessions > 0;
      
      return {
        service: 'session',
        status: hasExpiredSessions ? 'degraded' : 'healthy',
        lastCheck: Date.now(),
        details: stats,
      };
    });

    // TCP server health check
    this.healthMonitorService.registerService('tcpServer', async () => {
      const isListening = this.tcpServer?.listening;
      
      return {
        service: 'tcpServer',
        status: isListening ? 'healthy' : 'unhealthy',
        lastCheck: Date.now(),
        details: {
          listening: isListening,
          port: config.MatchmakerPort,
          connections: this.connectionMap.size,
        },
      };
    });

    // WebSocket service health check (when initialized)
    setTimeout(() => {
      if (this.webSocketService) {
        this.healthMonitorService.registerService('webSocket', async () => {
          const connectedClients = this.webSocketService.getConnectedClientsCount();
          
          return {
            service: 'webSocket',
            status: 'healthy',
            lastCheck: Date.now(),
            details: {
              connectedClients,
            },
          };
        });
      }
    }, 1000);
  }

  /**
   * Setup event handlers between services
   */
  private setupEventHandlers(): void {
    // Queue processing
    this.matchmakerService.on('serverRegistered', () => {
      // Try to process queue when new server becomes available
      this.processQueue();
    });

    this.matchmakerService.on('serverUpdated', (server) => {
      if (server.ready && server.numConnectedClients === 0) {
        // Server became available, process queue
        this.processQueue();
      }
    });

    // Health monitoring events
    this.healthMonitorService.on('serviceUnhealthy', (serviceName, status) => {
      this.logger.warn('Service became unhealthy', { service: serviceName, status });
      
      // Attempt auto-recovery
      this.healthMonitorService.attemptAutoRecovery(serviceName);
    });

    this.healthMonitorService.on('recoverySuccessful', (serviceName) => {
      this.logger.info('Service auto-recovery successful', { service: serviceName });
    });

    // Session events
    this.sessionService.on('sessionRemoved', (session) => {
      this.matchmakerService.removeSession(session.id);
    });
  }

  /**
   * Setup TCP server for Cirrus connections
   */
  private setupTcpServer(): void {
    this.tcpServer = net.createServer((connection) => {
      this.logger.info('New Cirrus server connection', { 
        remoteAddress: connection.remoteAddress,
        remotePort: connection.remotePort,
      });

      connection.on('data', (data) => {
        this.handleCirrusMessage(connection, data);
      });

      connection.on('error', (error) => {
        this.logger.error('Cirrus connection error', { 
          remoteAddress: connection.remoteAddress,
          error: error.message,
        });
        this.handleCirrusDisconnection(connection);
      });

      connection.on('close', () => {
        this.logger.info('Cirrus server disconnected', { 
          remoteAddress: connection.remoteAddress,
        });
        this.handleCirrusDisconnection(connection);
      });
    });

    this.tcpServer.on('error', (error) => {
      this.logger.error('TCP server error', { error: error.message });
    });
  }

  /**
   * Start HTTP server for Express and Socket.IO
   */
  private startHttpServer(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(config.HttpPort, () => {
        this.logger.info('HTTP server started with Express and Socket.IO', { 
          port: config.HttpPort 
        });
        resolve();
      });
    });
  }

  /**
   * Start TCP server
   */
  private startTcpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tcpServer.listen(config.MatchmakerPort, () => {
        this.logger.info('TCP server listening for Cirrus connections', { 
          port: config.MatchmakerPort 
        });
        resolve();
      });

      this.tcpServer.on('error', reject);
    });
  }

  /**
   * Handle messages from Cirrus servers
   */
  private handleCirrusMessage(connection: net.Socket, data: Buffer): void {
    try {
      const message: MatchmakerMessage = JSON.parse(data.toString());
      this.logger.debug('Received Cirrus message', { 
        type: message.type,
        address: message.address,
        port: message.port,
      });

      let serverId = this.connectionMap.get(connection);

      switch (message.type) {
        case 'connect':
          serverId = this.matchmakerService.registerServer(connection, message);
          this.connectionMap.set(connection, serverId);
          break;

        case 'streamerConnected':
        case 'streamerDisconnected':
        case 'clientConnected':
        case 'clientDisconnected':
        case 'ping':
          if (serverId) {
            this.matchmakerService.updateServerStatus(serverId, message);
          } else {
            this.logger.warn('Received message for unregistered server', { 
              type: message.type,
              remoteAddress: connection.remoteAddress,
            });
            connection.end();
          }
          break;

        default:
          this.logger.warn('Unknown message type from Cirrus server', { 
            type: message.type,
            remoteAddress: connection.remoteAddress,
          });
          connection.end();
      }
    } catch (error: any) {
      this.logger.error('Failed to parse Cirrus message', { 
        error: error.message,
        data: data.toString(),
        remoteAddress: connection.remoteAddress,
      });
      connection.end();
    }
  }

  /**
   * Handle Cirrus server disconnection
   */
  private handleCirrusDisconnection(connection: net.Socket): void {
    const serverId = this.connectionMap.get(connection);
    if (serverId) {
      this.matchmakerService.unregisterServer(serverId);
      this.connectionMap.delete(connection);
    }
  }

  /**
   * Process the queue to assign clients to available servers
   */
  private processQueue(): void {
    let processed = true;
    while (processed) {
      processed = this.matchmakerService.processNextInQueue();
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info('Received shutdown signal', { signal });

      try {
        // Stop accepting new connections
        this.tcpServer?.close();
        this.httpServer?.close();

        // Shutdown services
        if (this.webSocketService) {
          await this.webSocketService.shutdown();
        }
        await this.sessionService.shutdown();
        await this.healthMonitorService.shutdown();

        this.logger.info('Enhanced Matchmaker shutdown complete');
        process.exit(0);
      } catch (error: any) {
        this.logger.error('Error during shutdown', { error: error.message });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Start the application
async function main(): Promise<void> {
  try {
    logger.info('Starting Enhanced Matchmaker Application', {
      nodeVersion: process.version,
      config: {
        httpPort: config.HttpPort,
        matchmakerPort: config.MatchmakerPort,
        adminDashboardPort: config.AdminDashboardPort,
        useHttps: config.UseHTTPS,
      },
    });

    const app = new EnhancedMatchmaker();
    await app.start();
  } catch (error: any) {
    logger.error('Failed to start application', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Only start if this file is run directly
if (require.main === module) {
  main();
}

export { EnhancedMatchmaker };