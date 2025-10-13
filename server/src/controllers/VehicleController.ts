import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import VehicleService from '../services/VehicleService';
import KeyService from '../services/KeyService';
import LoggerService from '../services/LoggerService';

class VehicleController {
    private vehicleService: VehicleService;
    private keyService: KeyService;
    private logger: LoggerService;

    constructor() {
        this.vehicleService = new VehicleService();
        this.keyService = new KeyService();
        this.logger = LoggerService.getInstance();
    }

    // System vehicle registration - creates a new vehicle in the system
    registerSystemVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const { vin, model, device_id, status = 'active' } = req.body;

            const { vehicle: createdVehicle, secret } = await this.vehicleService.registerVehicle({
                vin,
                model,
                owner_id: null, // System vehicle has no initial owner
                device_id: device_id,
                status
            });

            this.logger.vehicle('system_register', { vehicleId: createdVehicle.id!, userId, success: true });

            res.status(201).json({
                message: 'Vehicle registered in system successfully',
                vehicle: {
                    id: createdVehicle.id,
                    vin: createdVehicle.vin,
                    model: createdVehicle.model,
                    device_id: createdVehicle.device_id,
                    status: createdVehicle.status,
                    created_at: createdVehicle.created_at
                },
                credentials: {
                    secret
                }
            });
        } catch (error) {
            this.logger.error('System vehicle registration error', error, { 
                adminUserId: req.user?.id,
                requestData: req.body 
            });
            
            if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to register vehicle in system' });
            }
        }
    };

    // User vehicle registration - user connects to existing vehicle
    registerUserToVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicleId = parseInt(req.params.vehicleId);
            const vehicle = await this.vehicleService.getVehicleById(vehicleId);

            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            if (vehicle.owner_id !== null) {
                res.status(400).json({ error: 'Vehicle is already registered to another user' });
                return;
            }

            // Register user as vehicle owner
            const updatedVehicle = await this.vehicleService.updateVehicle(vehicleId, {
                owner_id: userId
            });

            // Create a digital key for the user
            await this.keyService.createDigitalKey(
                userId,
                vehicleId,
                {
                    unlock: true,
                    lock: true,
                    startEngine: true
                }
            );

            this.logger.vehicle('user_register', { vehicleId, userId, success: true });

            res.status(200).json({
                message: 'Successfully registered to vehicle',
                vehicle: {
                    id: updatedVehicle!.id,
                    vin: updatedVehicle!.vin,
                    model: updatedVehicle!.model,
                    status: updatedVehicle!.status,
                    owner_id: updatedVehicle!.owner_id
                }
            });
        } catch (error) {
            this.logger.error('User vehicle registration error', error, { 
                userId: req.user?.id,
                vehicleId: parseInt(req.params.vehicleId) 
            });
            
            if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to register to vehicle' });
            }
        }
    };

    // Legacy method for backward compatibility
    registerVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const { vin, model, device_id, status = 'active' } = req.body;

            const { vehicle: createdVehicle, secret } = await this.vehicleService.registerVehicle({
                vin,
                model,
                owner_id: userId,
                device_id: device_id,
                status
            });

            this.logger.vehicle('register', { vehicleId: createdVehicle.id!, userId, success: true });

            res.status(201).json({
                message: 'Vehicle registered successfully',
                vehicle: {
                    id: createdVehicle.id,
                    vin: createdVehicle.vin,
                    model: createdVehicle.model,
                    device_id: createdVehicle.device_id,
                    status: createdVehicle.status,
                    created_at: createdVehicle.created_at
                },
                credentials: {
                    secret
                }
            });
        } catch (error) {
            this.logger.error('Vehicle registration error', error, { 
                userId: req.user?.id,
                requestData: req.body 
            });
            
            if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to register vehicle' });
            }
        }
    };

    getUserVehicles = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicles = await this.vehicleService.getUserVehicles(userId);

            const vehiclesWithKeys = await Promise.all(
                vehicles.map(async (vehicle) => {
                    const keys = await this.keyService.getVehicleKeys(vehicle.id!);
                    const activeKeys = keys.filter(key => key.is_active);
                    
                    return {
                        ...vehicle,
                        active_keys_count: activeKeys.length,
                        total_keys_count: keys.length
                    };
                })
            );

            res.status(200).json({
                vehicles: vehiclesWithKeys
            });
        } catch (error) {
            console.error('Get user vehicles error:', error);
            res.status(500).json({ error: 'Failed to retrieve vehicles' });
        }
    };

    getVehicleById = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicleId = parseInt(req.params.vehicleId);
            const vehicle = await this.vehicleService.getVehicleById(vehicleId);

            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            if (vehicle.owner_id !== userId) {
                const hasKey = await this.keyService.getUserKeys(userId);
                const vehicleKey = hasKey.find(key => key.vehicle_id === vehicleId && key.is_active);
                
                if (!vehicleKey) {
                    res.status(403).json({ error: 'Access denied to this vehicle' });
                    return;
                }
            }

            const keys = await this.keyService.getVehicleKeys(vehicleId);
            const activeKeys = keys.filter(key => key.is_active);
            const status = await this.vehicleService.getVehicleStatus(vehicleId);
            const isConnected = await this.vehicleService.isVehicleConnected(vehicleId);

            res.status(200).json({
                vehicle: {
                    ...vehicle,
                    active_keys_count: activeKeys.length,
                    total_keys_count: keys.length,
                    status_info: status,
                    is_connected: isConnected
                }
            });
        } catch (error) {
            console.error('Get vehicle by ID error:', error);
            res.status(500).json({ error: 'Failed to retrieve vehicle' });
        }
    };

    updateVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicleId = parseInt(req.params.vehicleId);
            const vehicle = await this.vehicleService.getVehicleById(vehicleId);

            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            if (vehicle.owner_id !== userId) {
                res.status(403).json({ error: 'Only vehicle owner can update vehicle information' });
                return;
            }

            const { vin, model, device_id, status } = req.body;
            const updateData: any = {};

            if (vin) updateData.vin = vin;
            if (model) updateData.model = model;
            if (device_id) updateData.device_id = device_id;
            if (status) updateData.status = status;

            const updatedVehicle = await this.vehicleService.updateVehicle(vehicleId, updateData);

            res.status(200).json({
                message: 'Vehicle updated successfully',
                vehicle: updatedVehicle
            });
        } catch (error) {
            console.error('Update vehicle error:', error);
            if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to update vehicle' });
            }
        }
    };

    deleteVehicle = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicleId = parseInt(req.params.vehicleId);
            const vehicle = await this.vehicleService.getVehicleById(vehicleId);

            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            if (vehicle.owner_id !== userId) {
                res.status(403).json({ error: 'Only vehicle owner can delete vehicle' });
                return;
            }

            const deleted = await this.vehicleService.deleteVehicle(vehicleId);

            if (!deleted) {
                res.status(500).json({ error: 'Failed to delete vehicle' });
                return;
            }

            res.status(200).json({
                message: 'Vehicle deleted successfully'
            });
        } catch (error) {
            console.error('Delete vehicle error:', error);
            if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to delete vehicle' });
            }
        }
    };

    unlock = async (req: AuthRequest, res: Response): Promise<void> => {
        await this.executeVehicleCommand(req, res, 'unlock');
    };

    lock = async (req: AuthRequest, res: Response): Promise<void> => {
        await this.executeVehicleCommand(req, res, 'lock');
    };

    engineOn = async (req: AuthRequest, res: Response): Promise<void> => {
        await this.executeVehicleCommand(req, res, 'startEngine');
    };

    private executeVehicleCommand = async (
        req: AuthRequest, 
        res: Response, 
        action: 'unlock' | 'lock' | 'startEngine'
    ): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicleId = parseInt(req.params.vehicleId);
            const { key_id } = req.body;

            if (!key_id) {
                res.status(400).json({ error: 'Digital key ID is required' });
                return;
            }

            const ipAddress = req.ip;
            const userAgent = req.get('User-Agent');

            const result = await this.keyService.executeVehicleAction(
                userId,
                vehicleId,
                key_id,
                action,
                ipAddress,
                userAgent
            );

            if (result.success) {
                const status = await this.vehicleService.getVehicleStatus(vehicleId);
                res.status(200).json({
                    message: result.message,
                    action: action,
                    vehicle_status: status
                });
            } else {
                res.status(400).json({
                    error: result.message,
                    action: action
                });
            }
        } catch (error) {
            console.error(`Vehicle ${action} error:`, error);
            res.status(500).json({ error: `Failed to ${action} vehicle` });
        }
    };

    getStatus = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicleId = parseInt(req.params.vehicleId);
            
            const vehicle = await this.vehicleService.getVehicleById(vehicleId);
            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            if (vehicle.owner_id !== userId) {
                const hasKey = await this.keyService.getUserKeys(userId);
                const vehicleKey = hasKey.find(key => key.vehicle_id === vehicleId && key.is_active);
                
                if (!vehicleKey) {
                    res.status(403).json({ error: 'Access denied to this vehicle' });
                    return;
                }
            }

            const status = await this.vehicleService.getVehicleStatus(vehicleId);
            const isConnected = await this.vehicleService.isVehicleConnected(vehicleId);

            // Enhanced status response with detailed information
            res.status(200).json({
                vehicle_id: vehicleId,
                vehicle_info: {
                    vin: vehicle.vin,
                    model: vehicle.model,
                    status: vehicle.status
                },
                connection: {
                    is_connected: isConnected,
                    last_seen: status?.last_update || null
                },
                door_status: {
                    is_locked: status?.door_locked ?? null,
                    is_open: status?.door_open ?? null,
                    lock_status: status?.door_locked ? 'locked' : 'unlocked',
                    door_status: status?.door_open ? 'open' : 'closed'
                },
                engine_status: {
                    is_running: status?.engine_running ?? null,
                    engine_status: status?.engine_running ? 'running' : 'stopped'
                },
                battery: {
                    level: status?.battery_level ?? null,
                    status: this.getBatteryStatus(status?.battery_level)
                },
                location: {
                    latitude: status?.latitude ?? null,
                    longitude: status?.longitude ?? null,
                    last_updated: status?.location_updated ?? null
                },
                raw_status: status
            });
        } catch (error) {
            console.error('Get vehicle status error:', error);
            res.status(500).json({ error: 'Failed to get vehicle status' });
        }
    };

    private getBatteryStatus(level: number | null | undefined): string {
        if (level === null || level === undefined) return 'unknown';
        if (level > 75) return 'good';
        if (level > 50) return 'fair';
        if (level > 25) return 'low';
        return 'critical';
    }

    getLogs = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicleId = parseInt(req.params.vehicleId);
            const limit = parseInt(req.query.limit as string) || 50;

            const vehicle = await this.vehicleService.getVehicleById(vehicleId);
            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            if (vehicle.owner_id !== userId) {
                res.status(403).json({ error: 'Only vehicle owner can view access logs' });
                return;
            }

            const logs = await this.vehicleService.getVehicleAccessLogs(vehicleId, limit);

            res.status(200).json({
                vehicle_id: vehicleId,
                access_logs: logs
            });
        } catch (error) {
            console.error('Get vehicle logs error:', error);
            res.status(500).json({ error: 'Failed to retrieve access logs' });
        }
    };

    getStatistics = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicleId = parseInt(req.params.vehicleId);

            const vehicle = await this.vehicleService.getVehicleById(vehicleId);
            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            if (vehicle.owner_id !== userId) {
                res.status(403).json({ error: 'Only vehicle owner can view statistics' });
                return;
            }

            const stats = await this.vehicleService.getVehicleStatistics(vehicleId);

            res.status(200).json({
                vehicle_id: vehicleId,
                statistics: stats
            });
        } catch (error) {
            console.error('Get vehicle statistics error:', error);
            res.status(500).json({ error: 'Failed to retrieve vehicle statistics' });
        }
    };

    performMaintenance = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicleId = parseInt(req.params.vehicleId);

            const vehicle = await this.vehicleService.getVehicleById(vehicleId);
            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            if (vehicle.owner_id !== userId) {
                res.status(403).json({ error: 'Only vehicle owner can perform maintenance' });
                return;
            }

            const maintenanceResult = await this.vehicleService.performMaintenanceCheck(vehicleId);

            res.status(200).json({
                vehicle_id: vehicleId,
                maintenance_check: maintenanceResult
            });
        } catch (error) {
            console.error('Vehicle maintenance error:', error);
            res.status(500).json({ error: 'Failed to perform maintenance check' });
        }
    };

    setMaintenanceMode = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const vehicleId = parseInt(req.params.vehicleId);
            const { enabled } = req.body;

            const vehicle = await this.vehicleService.getVehicleById(vehicleId);
            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            if (vehicle.owner_id !== userId) {
                res.status(403).json({ error: 'Only vehicle owner can set maintenance mode' });
                return;
            }

            const updatedVehicle = await this.vehicleService.setVehicleMaintenanceMode(vehicleId, enabled);

            res.status(200).json({
                message: `Vehicle maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
                vehicle: updatedVehicle
            });
        } catch (error) {
            console.error('Set maintenance mode error:', error);
            res.status(500).json({ error: 'Failed to set maintenance mode' });
        }
    };
}

export default VehicleController;
