import express from 'express';
import path from 'path';
import { createServiceLogger } from '../../common/logger';
import { MatchmakerService } from '../matchmaker/service';
import { SessionService } from '../session/service';
import { HealthMonitorService } from '../health-monitor/service';
import { WebSocketService } from '../websocket/service';

export class AdminDashboardService {
  private app = express();
  private logger = createServiceLogger('AdminDashboard');

  constructor(
    private matchmakerService: MatchmakerService,
    private sessionService: SessionService,
    private healthMonitorService: HealthMonitorService,
    private webSocketService?: WebSocketService
  ) {
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../../public')));
  }

  private setupRoutes(): void {
    // Dashboard home
    this.app.get('/', (req, res) => {
      res.send(this.generateDashboardHTML());
    });

    // API endpoints for dashboard data
    this.app.get('/api/dashboard', (req, res) => {
      const matchmakerStats = this.matchmakerService.getStats();
      const sessionStats = this.sessionService.getStats();
      const healthStats = this.healthMonitorService.getOverallHealth();
      const servers = this.matchmakerService.getServers();
      const sessions = this.sessionService.getAllSessions();
      
      const wsStats = this.webSocketService ? {
        connectedClients: this.webSocketService.getConnectedClientsCount(),
        clients: this.webSocketService.getConnectedClients(),
      } : null;

      res.json({
        timestamp: Date.now(),
        matchmaker: matchmakerStats,
        sessions: sessionStats,
        health: healthStats,
        servers: servers.map(server => ({
          id: server.id,
          address: server.address,
          port: server.port,
          ready: server.ready,
          clients: server.numConnectedClients,
          lastPing: server.lastPingReceived,
          https: server.https,
        })),
        activeSessions: sessions.map(session => ({
          id: session.id,
          clientId: session.clientId,
          status: session.status,
          priority: session.priority,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
        })),
        websocket: wsStats,
      });
    });

    // Server management
    this.app.post('/api/servers/:serverId/restart', (req, res) => {
      // This would typically send a restart command to the server
      res.json({ success: true, message: 'Restart command sent' });
    });

    // Session management
    this.app.delete('/api/sessions/:sessionId', (req, res) => {
      const { sessionId } = req.params;
      const removed = this.sessionService.removeSession(sessionId);
      if (removed) {
        this.matchmakerService.removeSession(sessionId);
        res.json({ success: true, message: 'Session removed' });
      } else {
        res.status(404).json({ success: false, message: 'Session not found' });
      }
    });

    // Bulk operations
    this.app.post('/api/sessions/cleanup', (req, res) => {
      const cleaned = this.sessionService.cleanupExpiredSessions();
      res.json({ success: true, cleanedSessions: cleaned });
    });

    // Health check trigger
    this.app.post('/api/health/check', async (req, res) => {
      try {
        const results = await this.healthMonitorService.checkAllServices();
        res.json({ success: true, results });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  private generateDashboardHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enhanced Matchmaker Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .stat-title {
            font-size: 14px;
            color: #666;
            margin-bottom: 8px;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: #333;
        }
        .status-healthy { color: #22c55e; }
        .status-degraded { color: #f59e0b; }
        .status-unhealthy { color: #ef4444; }
        .table-container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .table-header {
            padding: 20px;
            border-bottom: 1px solid #e5e5e5;
            font-weight: bold;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e5e5;
        }
        th {
            background-color: #f9f9f9;
            font-weight: 600;
        }
        .refresh-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            margin-left: 10px;
        }
        .refresh-btn:hover {
            background: #2563eb;
        }
        .auto-refresh {
            margin-left: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Enhanced Matchmaker Dashboard</h1>
            <p>Real-time monitoring and management interface</p>
            <button onclick="refreshData()" class="refresh-btn">Refresh Data</button>
            <label class="auto-refresh">
                <input type="checkbox" id="autoRefresh" checked> Auto-refresh (10s)
            </label>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-title">Total Servers</div>
                <div class="stat-value" id="totalServers">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Available Servers</div>
                <div class="stat-value" id="availableServers">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Total Clients</div>
                <div class="stat-value" id="totalClients">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">Queue Length</div>
                <div class="stat-value" id="queueLength">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">System Health</div>
                <div class="stat-value" id="systemHealth">-</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">WebSocket Clients</div>
                <div class="stat-value" id="wsClients">-</div>
            </div>
        </div>

        <div class="table-container">
            <div class="table-header">Active Servers</div>
            <table id="serversTable">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Address</th>
                        <th>Port</th>
                        <th>Status</th>
                        <th>Clients</th>
                        <th>Last Ping</th>
                        <th>HTTPS</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>

        <div class="table-container">
            <div class="table-header">Active Sessions</div>
            <table id="sessionsTable">
                <thead>
                    <tr>
                        <th>Session ID</th>
                        <th>Client ID</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Created</th>
                        <th>Last Activity</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    </div>

    <script>
        let autoRefreshInterval;

        async function refreshData() {
            try {
                const response = await fetch('/api/dashboard');
                const data = await response.json();
                updateDashboard(data);
            } catch (error) {
                console.error('Failed to fetch dashboard data:', error);
            }
        }

        function updateDashboard(data) {
            // Update stats
            document.getElementById('totalServers').textContent = data.matchmaker.totalServers;
            document.getElementById('availableServers').textContent = data.matchmaker.availableServers;
            document.getElementById('totalClients').textContent = data.matchmaker.totalClients;
            document.getElementById('queueLength').textContent = data.matchmaker.queueLength;
            
            const healthElement = document.getElementById('systemHealth');
            healthElement.textContent = data.health.status;
            healthElement.className = 'stat-value status-' + data.health.status;
            
            document.getElementById('wsClients').textContent = data.websocket ? data.websocket.connectedClients : 'N/A';

            // Update servers table
            const serversTableBody = document.getElementById('serversTable').querySelector('tbody');
            serversTableBody.innerHTML = '';
            data.servers.forEach(server => {
                const row = serversTableBody.insertRow();
                row.innerHTML = \`
                    <td>\${server.id.substring(0, 8)}...</td>
                    <td>\${server.address}</td>
                    <td>\${server.port}</td>
                    <td class="status-\${server.ready ? 'healthy' : 'unhealthy'}">\${server.ready ? 'Ready' : 'Not Ready'}</td>
                    <td>\${server.clients}</td>
                    <td>\${new Date(server.lastPing).toLocaleTimeString()}</td>
                    <td>\${server.https ? 'Yes' : 'No'}</td>
                \`;
            });

            // Update sessions table
            const sessionsTableBody = document.getElementById('sessionsTable').querySelector('tbody');
            sessionsTableBody.innerHTML = '';
            data.activeSessions.forEach(session => {
                const row = sessionsTableBody.insertRow();
                row.innerHTML = \`
                    <td>\${session.id.substring(0, 8)}...</td>
                    <td>\${session.clientId || 'N/A'}</td>
                    <td>\${session.status}</td>
                    <td>\${session.priority}</td>
                    <td>\${new Date(session.createdAt).toLocaleTimeString()}</td>
                    <td>\${new Date(session.lastActivity).toLocaleTimeString()}</td>
                    <td><button onclick="removeSession('\${session.id}')" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Remove</button></td>
                \`;
            });
        }

        async function removeSession(sessionId) {
            try {
                const response = await fetch(\`/api/sessions/\${sessionId}\`, { method: 'DELETE' });
                if (response.ok) {
                    refreshData();
                }
            } catch (error) {
                console.error('Failed to remove session:', error);
            }
        }

        function setupAutoRefresh() {
            const checkbox = document.getElementById('autoRefresh');
            
            function toggleAutoRefresh() {
                if (checkbox.checked) {
                    autoRefreshInterval = setInterval(refreshData, 10000);
                } else {
                    clearInterval(autoRefreshInterval);
                }
            }
            
            checkbox.addEventListener('change', toggleAutoRefresh);
            toggleAutoRefresh(); // Start with initial state
        }

        // Initialize
        refreshData();
        setupAutoRefresh();
    </script>
</body>
</html>
    `;
  }

  public start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        this.logger.info('Admin Dashboard started', { port });
        resolve();
      });
    });
  }

  public getApp(): express.Application {
    return this.app;
  }
}