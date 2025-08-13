import { EventEmitter } from 'events';
import { createServiceLogger } from '../../common/logger';
import { now } from '../../common/utils';
import { HealthStatus } from '../../types';
import { config } from '../../config';

export class HealthMonitorService extends EventEmitter {
  private logger = createServiceLogger('HealthMonitor');
  private healthChecks = new Map<string, HealthStatus>();
  private monitoringInterval!: NodeJS.Timeout;
  private services: Map<string, () => Promise<HealthStatus>> = new Map();

  constructor() {
    super();
    this.setupBuiltinHealthChecks();
    this.startMonitoring();
  }

  /**
   * Register a service for health monitoring
   */
  registerService(name: string, healthCheckFn: () => Promise<HealthStatus>): void {
    this.services.set(name, healthCheckFn);
    this.logger.info('Service registered for health monitoring', { service: name });
  }

  /**
   * Unregister a service
   */
  unregisterService(name: string): void {
    this.services.delete(name);
    this.healthChecks.delete(name);
    this.logger.info('Service unregistered from health monitoring', { service: name });
  }

  /**
   * Get health status for a specific service
   */
  getServiceHealth(service: string): HealthStatus | undefined {
    return this.healthChecks.get(service);
  }

  /**
   * Get overall health status
   */
  getOverallHealth(): {
    status: 'healthy' | 'unhealthy' | 'degraded';
    services: HealthStatus[];
    timestamp: number;
  } {
    const services = Array.from(this.healthChecks.values());
    const unhealthyServices = services.filter(s => s.status === 'unhealthy');
    const degradedServices = services.filter(s => s.status === 'degraded');

    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    if (unhealthyServices.length > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedServices.length > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      services,
      timestamp: now(),
    };
  }

  /**
   * Force health check for all services
   */
  async checkAllServices(): Promise<HealthStatus[]> {
    const results: HealthStatus[] = [];

    for (const [serviceName, healthCheckFn] of this.services.entries()) {
      try {
        const status = await this.performHealthCheck(serviceName, healthCheckFn);
        results.push(status);
      } catch (error: any) {
        const errorStatus: HealthStatus = {
          service: serviceName,
          status: 'unhealthy',
          lastCheck: now(),
          details: { error: error.message },
        };
        this.healthChecks.set(serviceName, errorStatus);
        results.push(errorStatus);
      }
    }

    return results;
  }

  /**
   * Get health check history for a service
   */
  getServiceHistory(service: string): HealthStatus[] {
    // For now, just return current status
    // In a real implementation, you might store history in a database
    const current = this.healthChecks.get(service);
    return current ? [current] : [];
  }

  /**
   * Start auto-recovery for a service
   */
  async attemptAutoRecovery(service: string): Promise<boolean> {
    this.logger.info('Attempting auto-recovery', { service });

    try {
      // Basic recovery attempt - re-run health check
      const healthCheckFn = this.services.get(service);
      if (healthCheckFn) {
        const status = await this.performHealthCheck(service, healthCheckFn);
        
        if (status.status === 'healthy') {
          this.logger.info('Auto-recovery successful', { service });
          this.emit('recoverySuccessful', service, status);
          return true;
        }
      }

      this.logger.warn('Auto-recovery failed', { service });
      this.emit('recoveryFailed', service);
      return false;
    } catch (error: any) {
      this.logger.error('Auto-recovery error', { service, error: error.message });
      this.emit('recoveryError', service, error);
      return false;
    }
  }

  /**
   * Setup built-in health checks
   */
  private setupBuiltinHealthChecks(): void {
    // System health check
    this.registerService('system', async () => {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (memUsagePercent > 90) {
        status = 'unhealthy';
      } else if (memUsagePercent > 70) {
        status = 'degraded';
      }

      return {
        service: 'system',
        status,
        lastCheck: now(),
        details: {
          memoryUsage: memUsage,
          memoryUsagePercent: Math.round(memUsagePercent),
          uptime: Math.round(uptime),
          nodeVersion: process.version,
        },
      };
    });

    // Event loop lag check
    this.registerService('eventLoop', async () => {
      const start = process.hrtime.bigint();
      
      return new Promise<HealthStatus>((resolve) => {
        setImmediate(() => {
          const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
          
          let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
          if (lag > 100) {
            status = 'unhealthy';
          } else if (lag > 50) {
            status = 'degraded';
          }

          resolve({
            service: 'eventLoop',
            status,
            lastCheck: now(),
            details: {
              lagMs: Math.round(lag),
            },
          });
        });
      });
    });
  }

  /**
   * Perform health check for a service
   */
  private async performHealthCheck(
    serviceName: string, 
    healthCheckFn: () => Promise<HealthStatus>
  ): Promise<HealthStatus> {
    const startTime = now();
    
    try {
      const status = await Promise.race([
        healthCheckFn(),
        this.createTimeoutPromise(serviceName, 5000), // 5 second timeout
      ]);

      const prevStatus = this.healthChecks.get(serviceName);
      this.healthChecks.set(serviceName, status);

      // Emit events for status changes
      if (!prevStatus || prevStatus.status !== status.status) {
        this.logger.info('Health status changed', { 
          service: serviceName, 
          oldStatus: prevStatus?.status, 
          newStatus: status.status 
        });
        this.emit('statusChanged', serviceName, status, prevStatus);

        // Trigger auto-recovery for unhealthy services
        if (status.status === 'unhealthy') {
          this.emit('serviceUnhealthy', serviceName, status);
          // Auto-recovery could be triggered here
        }
      }

      return status;
    } catch (error: any) {
      const errorStatus: HealthStatus = {
        service: serviceName,
        status: 'unhealthy',
        lastCheck: now(),
        details: { 
          error: error.message,
          checkDurationMs: now() - startTime,
        },
      };

      this.healthChecks.set(serviceName, errorStatus);
      this.logger.error('Health check failed', { service: serviceName, error: error.message });
      
      return errorStatus;
    }
  }

  /**
   * Create a timeout promise for health checks
   */
  private createTimeoutPromise(serviceName: string, timeoutMs: number): Promise<HealthStatus> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout for service: ${serviceName}`));
      }, timeoutMs);
    });
  }

  /**
   * Start monitoring interval
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkAllServices();
      } catch (error: any) {
        this.logger.error('Error during health monitoring cycle', { error: error.message });
      }
    }, config.HealthCheckIntervalMs);

    this.logger.info('Health monitoring started', { 
      intervalMs: config.HealthCheckIntervalMs 
    });
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.logger.info('Health monitoring stopped');
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down health monitor');
    this.stopMonitoring();
    this.services.clear();
    this.healthChecks.clear();
    this.logger.info('Health monitor shutdown complete');
  }
}