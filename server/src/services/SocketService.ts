import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import VehicleService from './VehicleService';
import KeyService from './KeyService';
import { SocketEvent, VehicleCommand } from '../types';

interface AuthenticatedSocket extends Socket {
    userId?: number;
    vehicleId?: number;
}

class SocketService {
    private io: Server;
    private vehicleService: VehicleService;
    private keyService: KeyService;
    private connectedVehicles: Map<number, AuthenticatedSocket>;
    private connectedUsers: Map<number, AuthenticatedSocket>;

    constructor(io: Server) {
        this.io = io;
        this.vehicleService = new VehicleService();
        this.keyService = new KeyService();
        this.connectedVehicles = new Map();
        this.connectedUsers = new Map();
        
        this.setupSocketHandlers();
    }

    private setupSocketHandlers(): void {
        this.io.use(this.authenticateSocket.bind(this));
        
        this.io.on('connection', (socket: AuthenticatedSocket) => {
            console.log(`Client connected: ${socket.id}, User: ${socket.userId}`);
            
            if (socket.userId) {
                this.connectedUsers.set(socket.userId, socket);
            }

            this.setupEventHandlers(socket);

            socket.on('disconnect', () => {
                this.handleDisconnection(socket);
            });
        });
    }

    private authenticateSocket(socket: AuthenticatedSocket, next: any): void {
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('Authentication token required'));
        }

        try {
            const secret = process.env.JWT_SECRET;
            if (!secret) {
                return next(new Error('JWT_SECRET not configured'));
            }

            const decoded = jwt.verify(token, secret) as any;
            socket.userId = decoded.userId;
            next();
        } catch (error) {
            next(new Error('Invalid authentication token'));
        }
    }

    private setupEventHandlers(socket: AuthenticatedSocket): void {
        socket.on('vehicle:connect', (data: SocketEvent['vehicle:connect']) => {
            this.handleVehicleConnect(socket, data);
        });

        socket.on('vehicle:command', (data: SocketEvent['vehicle:command']) => {
            this.handleVehicleCommand(socket, data);
        });

        socket.on('vehicle:status_request', (data: SocketEvent['vehicle:status_request']) => {
            this.handleStatusRequest(socket, data);
        });
    }

    private async handleVehicleConnect(
        socket: AuthenticatedSocket, 
        data: SocketEvent['vehicle:connect']
    ): Promise<void> {
        try {
            const { vehicle_id, device_id } = data;

            if (!socket.userId) {
                socket.emit('vehicle:error', { 
                    vehicle_id, 
                    error: 'Authentication required' 
                });
                return;
            }

            const vehicle = await this.vehicleService.getVehicleById(vehicle_id);
            if (!vehicle) {
                socket.emit('vehicle:error', { 
                    vehicle_id, 
                    error: 'Vehicle not found' 
                });
                return;
            }

            if (vehicle.owner_id !== socket.userId) {
                const userKeys = await this.keyService.getUserKeys(socket.userId);
                const vehicleKey = userKeys.find(key => 
                    key.vehicle_id === vehicle_id && key.is_active
                );
                
                if (!vehicleKey) {
                    socket.emit('vehicle:error', { 
                        vehicle_id, 
                        error: 'Access denied to this vehicle' 
                    });
                    return;
                }
            }

            const connected = await this.vehicleService.connectVehicle(vehicle_id, device_id);
            
            if (connected) {
                socket.vehicleId = vehicle_id;
                this.connectedVehicles.set(vehicle_id, socket);
                
                socket.join(`vehicle_${vehicle_id}`);
                
                const status = await this.vehicleService.getVehicleStatus(vehicle_id);
                socket.emit('vehicle:status_update', { 
                    vehicle_id, 
                    status: status! 
                });
                
                console.log(`Vehicle ${vehicle_id} connected via socket ${socket.id}`);
            } else {
                socket.emit('vehicle:error', { 
                    vehicle_id, 
                    error: 'Failed to connect to vehicle' 
                });
            }
        } catch (error) {
            console.error('Vehicle connect error:', error);
            socket.emit('vehicle:error', { 
                vehicle_id: data.vehicle_id, 
                error: 'Connection failed' 
            });
        }
    }

    private async handleVehicleCommand(
        socket: AuthenticatedSocket, 
        data: VehicleCommand
    ): Promise<void> {
        try {
            const { action, user_id, vehicle_id, key_id } = data;

            if (!socket.userId || socket.userId !== user_id) {
                socket.emit('vehicle:command_result', {
                    vehicle_id,
                    action,
                    result: 'failure',
                    error_message: 'Authentication mismatch'
                });
                return;
            }

            const ipAddress = socket.handshake.address;
            const userAgent = socket.handshake.headers['user-agent'];

            const result = await this.keyService.executeVehicleAction(
                user_id,
                vehicle_id,
                key_id,
                action,
                ipAddress,
                userAgent
            );

            if (result.success) {
                await this.vehicleService.executeVehicleCommand(vehicle_id, action);
                
                const updatedStatus = await this.vehicleService.getVehicleStatus(vehicle_id);
                
                this.io.to(`vehicle_${vehicle_id}`).emit('vehicle:status_update', {
                    vehicle_id,
                    status: updatedStatus!
                });

                socket.emit('vehicle:command_result', {
                    vehicle_id,
                    action,
                    result: 'success'
                });
            } else {
                socket.emit('vehicle:command_result', {
                    vehicle_id,
                    action,
                    result: 'failure',
                    error_message: result.message
                });
            }
        } catch (error) {
            console.error('Vehicle command error:', error);
            socket.emit('vehicle:command_result', {
                vehicle_id: data.vehicle_id,
                action: data.action,
                result: 'failure',
                error_message: 'Command execution failed'
            });
        }
    }

    private async handleStatusRequest(
        socket: AuthenticatedSocket, 
        data: SocketEvent['vehicle:status_request']
    ): Promise<void> {
        try {
            const { vehicle_id } = data;

            if (!socket.userId) {
                socket.emit('vehicle:error', { 
                    vehicle_id, 
                    error: 'Authentication required' 
                });
                return;
            }

            const vehicle = await this.vehicleService.getVehicleById(vehicle_id);
            if (!vehicle) {
                socket.emit('vehicle:error', { 
                    vehicle_id, 
                    error: 'Vehicle not found' 
                });
                return;
            }

            if (vehicle.owner_id !== socket.userId) {
                const userKeys = await this.keyService.getUserKeys(socket.userId);
                const vehicleKey = userKeys.find(key => 
                    key.vehicle_id === vehicle_id && key.is_active
                );
                
                if (!vehicleKey) {
                    socket.emit('vehicle:error', { 
                        vehicle_id, 
                        error: 'Access denied to this vehicle' 
                    });
                    return;
                }
            }

            const status = await this.vehicleService.getVehicleStatus(vehicle_id);
            
            if (status) {
                socket.emit('vehicle:status_update', { 
                    vehicle_id, 
                    status 
                });
            } else {
                socket.emit('vehicle:error', { 
                    vehicle_id, 
                    error: 'Unable to retrieve vehicle status' 
                });
            }
        } catch (error) {
            console.error('Status request error:', error);
            socket.emit('vehicle:error', { 
                vehicle_id: data.vehicle_id, 
                error: 'Status request failed' 
            });
        }
    }

    private handleDisconnection(socket: AuthenticatedSocket): void {
        console.log(`Client disconnected: ${socket.id}, User: ${socket.userId}`);
        
        if (socket.userId) {
            this.connectedUsers.delete(socket.userId);
        }

        if (socket.vehicleId) {
            this.connectedVehicles.delete(socket.vehicleId);
            this.vehicleService.disconnectVehicle(socket.vehicleId);
            console.log(`Vehicle ${socket.vehicleId} disconnected`);
        }
    }

    public broadcastToVehicle(vehicleId: number, event: string, data: any): void {
        this.io.to(`vehicle_${vehicleId}`).emit(event, data);
    }

    public broadcastToUser(userId: number, event: string, data: any): void {
        const userSocket = this.connectedUsers.get(userId);
        if (userSocket) {
            userSocket.emit(event, data);
        }
    }

    public getConnectedVehicles(): number[] {
        return Array.from(this.connectedVehicles.keys());
    }

    public getConnectedUsers(): number[] {
        return Array.from(this.connectedUsers.keys());
    }

    public isVehicleConnected(vehicleId: number): boolean {
        return this.connectedVehicles.has(vehicleId);
    }

    public isUserConnected(userId: number): boolean {
        return this.connectedUsers.has(userId);
    }

    public async sendVehicleNotification(
        vehicleId: number, 
        notification: {
            type: 'alert' | 'warning' | 'info';
            title: string;
            message: string;
        }
    ): Promise<void> {
        this.broadcastToVehicle(vehicleId, 'vehicle:notification', {
            vehicle_id: vehicleId,
            ...notification,
            timestamp: new Date().toISOString()
        });
    }

    public async performPeriodicStatusUpdate(): Promise<void> {
        const connectedVehicles = this.getConnectedVehicles();
        
        for (const vehicleId of connectedVehicles) {
            try {
                const status = await this.vehicleService.getVehicleStatus(vehicleId);
                if (status) {
                    this.broadcastToVehicle(vehicleId, 'vehicle:status_update', {
                        vehicle_id: vehicleId,
                        status
                    });
                }
            } catch (error) {
                console.error(`Failed to update status for vehicle ${vehicleId}:`, error);
            }
        }
    }

    public startPeriodicUpdates(intervalMs: number = 30000): void {
        setInterval(() => {
            this.performPeriodicStatusUpdate();
        }, intervalMs);
        
        console.log(`Started periodic status updates every ${intervalMs}ms`);
    }
}

export default SocketService;
