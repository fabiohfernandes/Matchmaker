# Enhanced Pixel Streaming Matchmaker

A modern, scalable matchmaker system that replaces the Epic Games original implementation with significant improvements for production use.

## 🚀 Features

### Core Architecture
- **Microservices Design**: Proper separation of concerns with dedicated services
- **TypeScript**: Full type safety and modern JavaScript features
- **Event-Driven**: Services communicate via events for loose coupling
- **Docker Ready**: Complete containerization with multi-stage builds
- **Production Ready**: Comprehensive logging, monitoring, and error handling

### Services
- **API Gateway**: Main entry point with rate limiting and authentication
- **Matchmaker Service**: Core logic for server allocation and queue management
- **Session Service**: Handle session timeouts and cleanup
- **Health Monitor**: Auto-recovery and health checking
- **WebSocket Service**: Real-time updates for clients
- **Admin Dashboard**: Web-based monitoring interface

### Security & Performance
- **Rate Limiting**: Configurable per IP/user limits
- **Input Validation**: Joi-based validation and sanitization
- **JWT Authentication**: Secure admin endpoints
- **SSL/TLS Support**: HTTPS termination with NGINX
- **Security Headers**: Helmet.js for security hardening

### Enhanced Features
- **Priority Queue**: VIP user support with configurable priorities
- **Real-time Updates**: WebSocket connections for live status
- **Health Monitoring**: Comprehensive service health checks
- **Auto-Recovery**: Automatic restart capabilities
- **Graceful Shutdown**: Clean shutdown handling
- **Session Management**: Configurable timeouts and cleanup

## 📦 Quick Start

### Using Docker (Recommended)

```bash
# Clone and setup
git clone <repository>
cd Matchmaker

# Start all services with Docker Compose
docker-compose up -d

# Check status
docker-compose logs -f matchmaker
```

### Manual Installation

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start the enhanced matchmaker
npm run dev
```

### Legacy Mode

```bash
# Run the original matchmaker for backward compatibility
npm run start-legacy
```

## 🔧 Configuration

Copy `.env.example` to `.env` and configure:

```env
# Service Configuration
HTTP_PORT=3000
MATCHMAKER_PORT=9999
ADMIN_DASHBOARD_PORT=3001
USE_HTTPS=false

# Database & Cache
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost:5432/matchmaker

# Security
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
RATE_LIMIT_MAX_REQUESTS=100
SESSION_TIMEOUT_MS=1800000

# Monitoring
HEALTH_CHECK_INTERVAL_MS=30000
LOG_LEVEL=info
```

## 📡 API Endpoints

### Public Endpoints
```
GET  /health                    - System health check
GET  /signallingserver          - Get available Cirrus server (legacy compatible)
POST /queue/join                - Join matchmaking queue
GET  /queue/position/:sessionId - Check queue position
```

### Admin Endpoints (JWT Required)
```
GET  /stats                     - Detailed statistics
```

### WebSocket Events
```
# Client to Server
joinQueue       - Join the matchmaking queue
getQueueStatus  - Get current queue position
updateActivity  - Update session activity
ping           - Keep-alive ping

# Server to Client
connected       - Connection confirmation
queueJoined     - Successfully joined queue
serverAssigned  - Assigned to a Cirrus server
queueUpdate     - Queue status updates
error          - Error messages
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   NGINX LB      │    │   Admin Web     │    │   Monitoring    │
│   Port 80/443   │    │   Port 3001     │    │   & Alerts      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  API Gateway    │◄──►│  Health Monitor │◄──►│  Session Mgmt   │
│  Port 3000      │    │  Auto-Recovery  │    │  Cleanup        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  WebSocket      │◄──►│  Matchmaker     │◄──►│  Cirrus Servers │
│  Real-time      │    │  Core Logic     │    │  Port 9999      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Redis Cache   │    │   PostgreSQL    │    │   Client Apps   │
│   Sessions      │    │   Persistent    │    │   Pixel Stream  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔧 Development

### Scripts
```bash
npm run build           # Build TypeScript
npm run build:watch     # Build with watch mode
npm run dev             # Development with auto-restart
npm run lint            # Run ESLint
npm run lint:fix        # Fix lint issues
npm run format          # Format with Prettier
npm run test            # Run tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage
```

### Docker Commands
```bash
npm run docker:build   # Build Docker images
npm run docker:up      # Start services
npm run docker:down    # Stop services
npm run docker:logs    # View logs
```

## 📊 Monitoring

### Admin Dashboard
Access the web dashboard at `http://localhost:3001` for:
- Real-time server and queue statistics
- Active session management
- Health status monitoring
- Manual session cleanup
- Server restart controls

### Health Checks
Built-in health monitoring for:
- System resources (memory, CPU, event loop)
- Service availability
- Database connections
- Queue performance

### Logging
Structured logging with Winston:
- Console output for development
- File logging for production
- Configurable log levels
- Service-specific log context

## 🛡️ Security Features

- **Input Sanitization**: All inputs validated and sanitized
- **Rate Limiting**: Configurable request limits per IP
- **JWT Authentication**: Secure admin access
- **CORS Protection**: Configurable origin policies
- **Security Headers**: Comprehensive security headers via Helmet
- **Container Security**: Non-root user, minimal attack surface

## 🔄 Backward Compatibility

The enhanced matchmaker maintains full backward compatibility:
- Same TCP protocol for Cirrus server communication
- Legacy REST API endpoints preserved
- Original `matchmaker.js` still functional
- Gradual migration path available

## 📈 Performance

### Optimizations
- Event-driven architecture for minimal blocking
- Connection pooling for databases
- Efficient queue management algorithms
- Memory leak prevention with cleanup intervals
- Graceful degradation under load

### Scaling
- Horizontal scaling via load balancer
- Stateless design for easy replication
- Redis for shared session state
- Database connection pooling
- Container orchestration ready

## 🚀 Deployment

### AWS ECS
Use the included `docker-compose.yml` as a base for ECS task definitions.

### Kubernetes
```yaml
# Example deployment configuration available in deployment/k8s/
```

### Traditional Servers
```bash
# Build production image
docker build -t matchmaker:latest .

# Run with environment file
docker run --env-file .env -p 3000:3000 -p 9999:9999 matchmaker:latest
```

## 🆘 Troubleshooting

### Common Issues

**Port 80 Permission Denied**
```bash
# Use non-privileged port
HTTP_PORT=3000 node dist/index.js
```

**WebSocket Connection Issues**
```bash
# Check CORS configuration
# Verify firewall settings
# Test with direct connection
```

**Database Connection Errors**
```bash
# Verify DATABASE_URL
# Check PostgreSQL service status
# Review connection pool settings
```

### Debug Mode
```bash
LOG_LEVEL=debug node dist/index.js
```

## 📄 License

Same license as the original Epic Games Pixel Streaming implementation.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit pull request

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and migration guides.
