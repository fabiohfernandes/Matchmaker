import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { createServiceLogger } from '../../common/logger';
import { successResponse, errorResponse, sanitizeInput } from '../../common/utils';
import { config } from '../../config';
import { MatchmakerService } from '../matchmaker/service';

export class ApiGatewayService {
  private app = express();
  private logger = createServiceLogger('ApiGateway');
  private matchmakerService: MatchmakerService;

  constructor(matchmakerService: MatchmakerService) {
    this.matchmakerService = matchmakerService;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.RateLimitWindowMs,
      max: config.RateLimitMaxRequests,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      const stats = this.matchmakerService.getStats();
      res.json(successResponse({
        status: 'healthy',
        timestamp: Date.now(),
        stats,
      }));
    });

    // Get signalling server (REST API)
    this.app.get('/signallingserver', (req, res) => {
      try {
        const server = this.matchmakerService.getAvailableServer();
        
        if (server) {
          const protocol = server.https ? 'https' : 'http';
          res.json(successResponse({
            signallingServer: `${server.address}:${server.port}`,
            protocol,
            serverId: server.id,
          }));
        } else {
          res.json(errorResponse('No signalling servers available'));
        }
      } catch (error: any) {
        this.logger.error('Error getting signalling server', { error: error.message });
        res.status(500).json(errorResponse('Internal server error'));
      }
    });

    // Queue management
    this.app.post('/queue/join', (req, res) => {
      try {
        const { clientId, priority = 0 } = req.body;
        const sanitizedClientId = clientId ? sanitizeInput(clientId) : undefined;
        
        const session = this.matchmakerService.addToQueue(sanitizedClientId, priority);
        const queuePosition = this.matchmakerService.getQueuePosition(session.id);
        
        res.json(successResponse({
          sessionId: session.id,
          queuePosition,
        }));
      } catch (error: any) {
        this.logger.error('Error joining queue', { error: error.message });
        res.status(500).json(errorResponse('Failed to join queue'));
      }
    });

    this.app.get('/queue/position/:sessionId', (req, res) => {
      try {
        const { sessionId } = req.params;
        const queuePosition = this.matchmakerService.getQueuePosition(sessionId);
        
        if (queuePosition) {
          res.json(successResponse(queuePosition));
        } else {
          res.status(404).json(errorResponse('Session not found in queue'));
        }
      } catch (error: any) {
        this.logger.error('Error getting queue position', { error: error.message });
        res.status(500).json(errorResponse('Internal server error'));
      }
    });

    // Server statistics
    this.app.get('/stats', this.authenticateToken, (req, res) => {
      try {
        const stats = this.matchmakerService.getStats();
        const servers = this.matchmakerService.getServers();
        
        res.json(successResponse({
          ...stats,
          servers: servers.map(server => ({
            id: server.id,
            address: server.address,
            port: server.port,
            ready: server.ready,
            clients: server.numConnectedClients,
            lastPing: server.lastPingReceived,
          })),
        }));
      } catch (error: any) {
        this.logger.error('Error getting stats', { error: error.message });
        res.status(500).json(errorResponse('Internal server error'));
      }
    });

    // Error handling
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error', { 
        error: error.message, 
        stack: error.stack,
        path: req.path,
        method: req.method,
      });
      
      res.status(500).json(errorResponse('Internal server error'));
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json(errorResponse('Route not found'));
    });
  }

  private authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json(errorResponse('Access token required'));
      return;
    }

    jwt.verify(token, config.JwtSecret!, (err, user) => {
      if (err) {
        res.status(403).json(errorResponse('Invalid token'));
        return;
      }
      
      (req as any).user = user;
      next();
    });
  }

  public start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        this.logger.info('API Gateway started', { port });
        resolve();
      });
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}