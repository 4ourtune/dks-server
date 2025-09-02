import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import Database from './database/connection';
import SocketService from './services/SocketService';
import LoggerService from './services/LoggerService';
import CertificateController from './controllers/CertificateController';

import authRoutes from './routes/auth';
import keysRoutes from './routes/keys';
import vehiclesRoutes from './routes/vehicles';
import certificateRoutes from './routes/certificates';

import { errorHandler } from './middleware/validation';

dotenv.config();

class App {
    private app: express.Application;
    private server: any;
    private io: Server;
    private socketService: SocketService;
    private database: Database;
    private logger: LoggerService;
    private certificateController: CertificateController;

    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: process.env.CLIENT_ORIGIN || "*",
                methods: ["GET", "POST"],
                credentials: true
            }
        });

        this.database = Database.getInstance();
        this.socketService = new SocketService(this.io);
        this.logger = LoggerService.getInstance();
        this.certificateController = new CertificateController();

        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
        this.initializeCertificateAuthority();
        this.startPeriodicTasks();
    }

    private setupMiddleware(): void {
        this.app.use(helmet({
            crossOriginResourcePolicy: { policy: "cross-origin" }
        }));

        this.app.use(cors({
            origin: process.env.CLIENT_ORIGIN || "*",
            credentials: true
        }));

        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Simple API logging middleware
        this.app.use((req, res, next) => {
            const startTime = Date.now();
            
            const originalSend = res.send;
            res.send = function(data) {
                const responseTime = Date.now() - startTime;
                const logger = LoggerService.getInstance();
                
                let extra: any = {};
                if (res.statusCode >= 400) {
                    try {
                        const responseData = typeof data === 'string' ? JSON.parse(data) : data;
                        extra.error = responseData?.error || responseData?.message;
                    } catch (e) {
                        extra.error = 'Unknown error';
                    }
                }
                
                logger.api(req.method, req.path, res.statusCode, responseTime, extra);
                return originalSend.call(this, data);
            };
            
            next();
        });
    }

    private setupRoutes(): void {
        this.app.get('/', (req, res) => {
            res.json({
                message: 'Digital Key System API',
                version: '1.0.0',
                status: 'running',
                timestamp: new Date().toISOString()
            });
        });

        this.app.get('/health', async (req, res) => {
            try {
                const dbHealth = await this.database.healthCheck();
                
                res.status(dbHealth ? 200 : 503).json({
                    status: dbHealth ? 'healthy' : 'unhealthy',
                    database: dbHealth ? 'connected' : 'disconnected',
                    socketio: 'active',
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    timestamp: new Date().toISOString(),
                    version: process.env.npm_package_version || '1.0.0'
                });
            } catch (error) {
                res.status(503).json({
                    status: 'unhealthy',
                    database: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }
        });

        this.app.use('/api/auth', authRoutes);
        this.app.use('/api/keys', keysRoutes);
        this.app.use('/api/vehicles', vehiclesRoutes);
        this.app.use('/api/certificates', certificateRoutes);

        this.app.get('/api/status', (req, res) => {
            const logStats = this.logger.getLogStats();
            res.json({
                connected_vehicles: this.socketService.getConnectedVehicles().length,
                connected_users: this.socketService.getConnectedUsers().length,
                total_connections: this.io.sockets.sockets.size,
                timestamp: new Date().toISOString(),
                logs: logStats
            });
        });

        // Test endpoint for mobile app debugging
        this.app.post('/api/test', (req, res) => {
            this.logger.debug('Test endpoint called', req.body);
            
            setTimeout(() => {
                res.status(200).json({
                    success: true,
                    message: 'Test endpoint response',
                    receivedData: req.body,
                    timestamp: new Date().toISOString(),
                    serverStatus: 'OK'
                });
            }, 100);
        });

        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: 'The requested endpoint does not exist',
                path: req.originalUrl
            });
        });
    }

    private setupErrorHandling(): void {
        this.app.use(errorHandler);

        process.on('uncaughtException', (error: Error) => {
            this.logger.error('Uncaught Exception', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
            this.logger.error('Unhandled Rejection', reason, { promise: promise.toString() });
        });

        process.on('SIGINT', () => {
            this.logger.server('Received SIGINT. Graceful shutdown...');
            this.gracefulShutdown();
        });

        process.on('SIGTERM', () => {
            this.logger.server('Received SIGTERM. Graceful shutdown...');
            this.gracefulShutdown();
        });
    }

    private async initializeCertificateAuthority(): Promise<void> {
        try {
            await this.certificateController.initialize();
            this.logger.server('Certificate Authority initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Certificate Authority', error);
            throw error;
        }
    }

    private startPeriodicTasks(): void {
        this.socketService.startPeriodicUpdates(30000);

        setInterval(async () => {
            try {
                const KeyService = (await import('./services/KeyService')).default;
                const keyService = new KeyService();
                const cleanedKeys = await keyService.cleanupExpiredKeys();
                
                if (cleanedKeys > 0) {
                    this.logger.server(`Cleaned up ${cleanedKeys} expired keys`);
                }
            } catch (error) {
                this.logger.error('Error during key cleanup', error);
            }
        }, 60 * 60 * 1000);

        setInterval(async () => {
            try {
                const CertificateAuthorityService = (await import('./services/CertificateAuthorityService')).default;
                const caService = new CertificateAuthorityService();
                await caService.initializeRootCA();
                const cleanedCertificates = await caService.cleanupExpiredCertificates();
                
                if (cleanedCertificates > 0) {
                    this.logger.server(`Cleaned up ${cleanedCertificates} expired certificates`);
                }
            } catch (error) {
                this.logger.error('Error during certificate cleanup', error);
            }
        }, 60 * 60 * 1000);

        this.logger.server('Periodic tasks started');
    }

    private gracefulShutdown(): void {
        this.server.close(() => {
            console.log('HTTP server closed');
            
            this.io.close(() => {
                console.log('Socket.IO server closed');
                
                this.database.close();
                
                console.log('Graceful shutdown completed');
                process.exit(0);
            });
        });

        setTimeout(() => {
            console.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);
    }

    public start(): void {
        const port = process.env.PORT || 3000;
        
        this.server.listen(port, '0.0.0.0', () => {
            const startupMessage = [
                '='.repeat(60),
                `🚗 Digital Key System Server`,
                '='.repeat(60),
                `🚀 Server running on port ${port}`,
                `📊 Environment: ${process.env.NODE_ENV || 'development'}`,
                `🔗 Database: PostgreSQL (${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME})`,
                `📋 Logs: ${this.logger.getLogStats().logDirectory}`,
                `⚡ Socket.IO enabled`,
                `🛡️  Security: JWT + bcrypt + rate limiting`,
                `📝 API endpoints:`,
                `   - GET  /                  (API info)`,
                `   - GET  /health            (Health check)`,
                `   - GET  /api/status        (Server status + logs)`,
                `   - POST /api/test          (Test endpoint)`,
                `   - POST /api/auth/register (User registration)`,
                `   - POST /api/auth/login    (User login)`,
                `   - GET  /api/auth/profile  (User profile)`,
                `   - POST /api/vehicles      (Register vehicle)`,
                `   - GET  /api/vehicles      (List vehicles)`,
                `   - POST /api/keys/register (Register digital key)`,
                `   - GET  /api/keys          (List digital keys)`,
                `   - POST /api/vehicles/:id/unlock (Unlock vehicle)`,
                `   - POST /api/vehicles/:id/lock (Lock vehicle)`,
                `   - POST /api/vehicles/:id/engine_on (Start engine)`,
                `   - GET  /api/vehicles/:id/status (Vehicle status)`,
                `   - POST /api/certificates/vehicle (Issue vehicle certificate)`,
                `   - POST /api/certificates/digital-key (Issue digital key certificate)`,
                `   - POST /api/certificates/verify (Verify certificate)`,
                `   - GET  /api/certificates/root-ca/public-key (Root CA public key)`,
                `   - GET  /api/certificates/crl (Certificate revocation list)`,
                `🔌 WebSocket events:`,
                `   - vehicle:connect         (TC375 connection)`,
                `   - vehicle:command         (Vehicle commands)`,
                `   - vehicle:status_request  (Status updates)`,
                '='.repeat(60),
                `✅ Digital Key System is ready!`,
                `📱 Ready for mobile app connections`,
                `🖥️  Ready for TC375 connections`,
                '='.repeat(60)
            ].join('\n');

            console.log(startupMessage);
            this.logger.server('Digital Key System Server started', {
                port,
                environment: process.env.NODE_ENV || 'development',
                database: `PostgreSQL (${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME})`
            });
        });
    }
}

if (require.main === module) {
    const app = new App();
    app.start();
}

export default App;