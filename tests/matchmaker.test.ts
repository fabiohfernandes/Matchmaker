import { MatchmakerService } from '../src/services/matchmaker/service';
import { MatchmakerMessage } from '../src/types';

describe('MatchmakerService', () => {
  let service: MatchmakerService;
  let mockConnection: any;

  beforeEach(() => {
    service = new MatchmakerService();
    mockConnection = {
      remoteAddress: '127.0.0.1',
      remotePort: 12345,
    };
  });

  afterEach(() => {
    // Clean up
    service.removeAllListeners();
  });

  describe('Server Registration', () => {
    test('should register a new server', () => {
      const message: MatchmakerMessage = {
        type: 'connect',
        address: '192.168.1.100',
        port: 8080,
        https: false,
        ready: true,
        playerConnected: false,
      };

      const serverId = service.registerServer(mockConnection, message);

      expect(serverId).toBeDefined();
      expect(typeof serverId).toBe('string');

      const stats = service.getStats();
      expect(stats.totalServers).toBe(1);
      expect(stats.availableServers).toBe(1);
    });

    test('should handle server with existing player', () => {
      const message: MatchmakerMessage = {
        type: 'connect',
        address: '192.168.1.100',
        port: 8080,
        https: false,
        ready: true,
        playerConnected: true,
      };

      const serverId = service.registerServer(mockConnection, message);
      const stats = service.getStats();
      
      expect(stats.totalServers).toBe(1);
      expect(stats.availableServers).toBe(0); // Not available due to connected player
      expect(stats.totalClients).toBe(1);
    });
  });

  describe('Server Availability', () => {
    test('should return available server when one exists', () => {
      const message: MatchmakerMessage = {
        type: 'connect',
        address: '192.168.1.100',
        port: 8080,
        https: false,
        ready: true,
        playerConnected: false,
      };

      service.registerServer(mockConnection, message);
      const availableServer = service.getAvailableServer();

      expect(availableServer).toBeDefined();
      expect(availableServer?.address).toBe('192.168.1.100');
      expect(availableServer?.port).toBe(8080);
    });

    test('should return null when no servers are available', () => {
      const availableServer = service.getAvailableServer();
      expect(availableServer).toBeNull();
    });

    test('should not return server that is not ready', () => {
      const message: MatchmakerMessage = {
        type: 'connect',
        address: '192.168.1.100',
        port: 8080,
        https: false,
        ready: false,
        playerConnected: false,
      };

      service.registerServer(mockConnection, message);
      const availableServer = service.getAvailableServer();

      expect(availableServer).toBeNull();
    });
  });

  describe('Queue Management', () => {
    test('should add client to queue', () => {
      const session = service.addToQueue('test-client-1', 0);

      expect(session).toBeDefined();
      expect(session.clientId).toBe('test-client-1');
      expect(session.status).toBe('queued');
      expect(session.priority).toBe(0);

      const queuePosition = service.getQueuePosition(session.id);
      expect(queuePosition?.position).toBe(1);
      expect(queuePosition?.totalInQueue).toBe(1);
    });

    test('should process queue when server becomes available', () => {
      // Add client to queue first
      const session = service.addToQueue('test-client-1', 0);
      
      // Register a server
      const message: MatchmakerMessage = {
        type: 'connect',
        address: '192.168.1.100',
        port: 8080,
        https: false,
        ready: true,
        playerConnected: false,
      };
      
      service.registerServer(mockConnection, message);
      
      // Process queue
      const processed = service.processNextInQueue();
      
      expect(processed).toBe(true);
      
      // Queue should now be empty
      const queuePosition = service.getQueuePosition(session.id);
      expect(queuePosition).toBeNull();
    });

    test('should respect priority in queue', () => {
      const lowPrioritySession = service.addToQueue('low-priority', 0);
      const highPrioritySession = service.addToQueue('high-priority', 10);

      const lowPos = service.getQueuePosition(lowPrioritySession.id);
      const highPos = service.getQueuePosition(highPrioritySession.id);

      expect(highPos?.position).toBeLessThan(lowPos?.position!);
    });
  });

  describe('Server Status Updates', () => {
    test('should update server ready status', () => {
      const message: MatchmakerMessage = {
        type: 'connect',
        address: '192.168.1.100',
        port: 8080,
        https: false,
        ready: false,
        playerConnected: false,
      };

      const serverId = service.registerServer(mockConnection, message);
      
      // Server should not be available initially
      let availableServer = service.getAvailableServer();
      expect(availableServer).toBeNull();

      // Update server to ready
      service.updateServerStatus(serverId, { type: 'streamerConnected' });
      
      // Server should now be available
      availableServer = service.getAvailableServer();
      expect(availableServer).toBeDefined();
    });

    test('should track client connections', () => {
      const message: MatchmakerMessage = {
        type: 'connect',
        address: '192.168.1.100',
        port: 8080,
        https: false,
        ready: true,
        playerConnected: false,
      };

      const serverId = service.registerServer(mockConnection, message);
      
      // Add client connection
      service.updateServerStatus(serverId, { type: 'clientConnected' });
      
      const stats = service.getStats();
      expect(stats.totalClients).toBe(1);
      expect(stats.availableServers).toBe(0); // Server now occupied

      // Remove client connection
      service.updateServerStatus(serverId, { type: 'clientDisconnected' });
      
      const updatedStats = service.getStats();
      expect(updatedStats.totalClients).toBe(0);
      expect(updatedStats.availableServers).toBe(1); // Server available again
    });
  });

  describe('Statistics', () => {
    test('should provide accurate statistics', () => {
      // Register two servers
      const message1: MatchmakerMessage = {
        type: 'connect',
        address: '192.168.1.100',
        port: 8080,
        https: false,
        ready: true,
        playerConnected: false,
      };
      
      const message2: MatchmakerMessage = {
        type: 'connect',
        address: '192.168.1.101',
        port: 8080,
        https: false,
        ready: true,
        playerConnected: true,
      };

      service.registerServer(mockConnection, message1);
      service.registerServer({}, message2);

      // Add clients to queue
      service.addToQueue('client1');
      service.addToQueue('client2');

      const stats = service.getStats();
      expect(stats.totalServers).toBe(2);
      expect(stats.availableServers).toBe(1); // One has connected client
      expect(stats.totalClients).toBe(1);
      expect(stats.queueLength).toBe(2);
    });
  });
});