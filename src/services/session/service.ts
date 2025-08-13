import { EventEmitter } from 'events';
import { createServiceLogger } from '../../common/logger';
import { now, isExpired } from '../../common/utils';
import { ClientSession } from '../../types';
import { config } from '../../config';

export class SessionService extends EventEmitter {
  private logger = createServiceLogger('SessionService');
  private sessions = new Map<string, ClientSession>();
  private cleanupInterval!: NodeJS.Timeout;

  constructor() {
    super();
    this.startCleanupInterval();
  }

  /**
   * Create a new session
   */
  createSession(clientId?: string, priority: number = 0): ClientSession {
    const session: ClientSession = {
      id: this.generateSessionId(),
      clientId,
      createdAt: now(),
      lastActivity: now(),
      status: 'queued',
      priority,
    };

    this.sessions.set(session.id, session);
    this.logger.info('Session created', { sessionId: session.id, clientId });
    this.emit('sessionCreated', session);
    
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ClientSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session activity
   */
  updateActivity(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = now();
      this.logger.debug('Session activity updated', { sessionId });
      return true;
    }
    return false;
  }

  /**
   * Update session status
   */
  updateStatus(sessionId: string, status: ClientSession['status'], serverId?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      const oldStatus = session.status;
      session.status = status;
      session.lastActivity = now();
      
      if (serverId) {
        session.serverId = serverId;
      }

      this.logger.info('Session status updated', { 
        sessionId, 
        oldStatus, 
        newStatus: status, 
        serverId 
      });
      
      this.emit('sessionStatusChanged', session, oldStatus);
      return true;
    }
    return false;
  }

  /**
   * Remove session
   */
  removeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.logger.info('Session removed', { sessionId, clientId: session.clientId });
      this.emit('sessionRemoved', session);
      return true;
    }
    return false;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ClientSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions by status
   */
  getSessionsByStatus(status: ClientSession['status']): ClientSession[] {
    return Array.from(this.sessions.values()).filter(session => session.status === status);
  }

  /**
   * Get sessions by client ID
   */
  getSessionsByClientId(clientId: string): ClientSession[] {
    return Array.from(this.sessions.values()).filter(session => session.clientId === clientId);
  }

  /**
   * Get expired sessions
   */
  getExpiredSessions(): ClientSession[] {
    const currentTime = now();
    return Array.from(this.sessions.values()).filter(session => 
      isExpired(session.lastActivity, config.SessionTimeoutMs!)
    );
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    const expiredSessions = this.getExpiredSessions();
    let cleanedUp = 0;

    for (const session of expiredSessions) {
      this.logger.info('Cleaning up expired session', { 
        sessionId: session.id, 
        clientId: session.clientId,
        lastActivity: new Date(session.lastActivity).toISOString(),
      });
      
      this.removeSession(session.id);
      cleanedUp++;
    }

    if (cleanedUp > 0) {
      this.logger.info('Expired sessions cleanup completed', { cleanedUp });
      this.emit('cleanupCompleted', cleanedUp);
    }

    return cleanedUp;
  }

  /**
   * Get session statistics
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());
    const statusCounts = sessions.reduce((acc, session) => {
      acc[session.status] = (acc[session.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const now_timestamp = now();
    const expiredCount = sessions.filter(session => 
      isExpired(session.lastActivity, config.SessionTimeoutMs!)
    ).length;

    return {
      totalSessions: sessions.length,
      statusCounts,
      expiredSessions: expiredCount,
      oldestSession: sessions.length > 0 ? Math.min(...sessions.map(s => s.createdAt)) : null,
      newestSession: sessions.length > 0 ? Math.max(...sessions.map(s => s.createdAt)) : null,
    };
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Run every minute

    this.logger.info('Session cleanup interval started', { intervalMs: 60000 });
  }

  /**
   * Stop the cleanup interval
   */
  public stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.logger.info('Session cleanup interval stopped');
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down session service');
    this.stopCleanupInterval();
    
    // Notify about remaining sessions
    const activeSessions = this.getAllSessions();
    if (activeSessions.length > 0) {
      this.logger.info('Active sessions during shutdown', { count: activeSessions.length });
      this.emit('shutdown', activeSessions);
    }

    this.sessions.clear();
    this.logger.info('Session service shutdown complete');
  }
}