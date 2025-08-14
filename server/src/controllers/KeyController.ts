import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import KeyService from '../services/KeyService';
import VehicleModel from '../models/Vehicle';
import LoggerService from '../services/LoggerService';

class KeyController {
    private keyService: KeyService;
    private vehicleModel: VehicleModel;
    private logger: LoggerService;

    constructor() {
        this.keyService = new KeyService();
        this.vehicleModel = new VehicleModel();
        this.logger = LoggerService.getInstance();
    }

    register = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const { vehicle_id, permissions, expires_at } = req.body;

            const vehicle = await this.vehicleModel.findById(vehicle_id);
            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            const isOwner = await this.vehicleModel.isOwner(vehicle_id, userId);
            if (!isOwner) {
                res.status(403).json({ error: 'Only vehicle owner can register digital keys' });
                return;
            }

            const digitalKey = await this.keyService.createDigitalKey(
                userId,
                vehicle_id,
                permissions,
                expires_at
            );

            this.logger.key('create', { 
                keyId: digitalKey.id!.toString(), 
                userId, 
                vehicleId: vehicle_id,
                success: true 
            });

            res.status(201).json({
                message: 'Digital key registered successfully',
                key: {
                    id: digitalKey.id,
                    vehicle_id: digitalKey.vehicle_id,
                    permissions: digitalKey.permissions,
                    expires_at: digitalKey.expires_at,
                    is_active: digitalKey.is_active,
                    created_at: digitalKey.created_at
                }
            });
        } catch (error) {
            this.logger.error('Key registration error', error, {
                userId: req.user?.id,
                vehicleId: req.body.vehicle_id,
                requestData: req.body
            });
            
            if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to register digital key' });
            }
        }
    };

    getUserKeys = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const keys = await this.keyService.getUserKeys(userId);
            
            const keysWithVehicleInfo = await Promise.all(
                keys.map(async (key) => {
                    const vehicle = await this.vehicleModel.findById(key.vehicle_id);
                    return {
                        id: key.id,
                        vehicle_id: key.vehicle_id,
                        vehicle_info: vehicle ? {
                            vin: vehicle.vin,
                            model: vehicle.model
                        } : null,
                        permissions: key.permissions,
                        expires_at: key.expires_at,
                        is_active: key.is_active,
                        created_at: key.created_at
                    };
                })
            );

            res.status(200).json({
                keys: keysWithVehicleInfo
            });
        } catch (error) {
            console.error('Get user keys error:', error);
            res.status(500).json({ error: 'Failed to retrieve digital keys' });
        }
    };

    getKeyById = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const keyId = parseInt(req.params.keyId);
            const keys = await this.keyService.getUserKeys(userId);
            const key = keys.find(k => k.id === keyId);

            if (!key) {
                res.status(404).json({ error: 'Digital key not found' });
                return;
            }

            const vehicle = await this.vehicleModel.findById(key.vehicle_id);

            res.status(200).json({
                key: {
                    id: key.id,
                    vehicle_id: key.vehicle_id,
                    vehicle_info: vehicle ? {
                        vin: vehicle.vin,
                        model: vehicle.model,
                        status: vehicle.status
                    } : null,
                    permissions: key.permissions,
                    expires_at: key.expires_at,
                    is_active: key.is_active,
                    created_at: key.created_at,
                    updated_at: key.updated_at
                }
            });
        } catch (error) {
            console.error('Get key by ID error:', error);
            res.status(500).json({ error: 'Failed to retrieve digital key' });
        }
    };

    updateKey = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const keyId = parseInt(req.params.keyId);
            const { permissions, is_active, expires_at } = req.body;

            const keys = await this.keyService.getUserKeys(userId);
            const key = keys.find(k => k.id === keyId);

            if (!key) {
                res.status(404).json({ error: 'Digital key not found' });
                return;
            }

            const isOwner = await this.vehicleModel.isOwner(key.vehicle_id, userId);
            if (!isOwner) {
                res.status(403).json({ error: 'Only vehicle owner can modify digital keys' });
                return;
            }

            const updatedKey = await this.keyService.updateKeyPermissions(
                keyId,
                permissions,
                is_active,
                expires_at
            );

            if (!updatedKey) {
                res.status(404).json({ error: 'Failed to update digital key' });
                return;
            }

            res.status(200).json({
                message: 'Digital key updated successfully',
                key: {
                    id: updatedKey.id,
                    vehicle_id: updatedKey.vehicle_id,
                    permissions: updatedKey.permissions,
                    expires_at: updatedKey.expires_at,
                    is_active: updatedKey.is_active,
                    updated_at: updatedKey.updated_at
                }
            });
        } catch (error) {
            console.error('Update key error:', error);
            res.status(500).json({ error: 'Failed to update digital key' });
        }
    };

    deleteKey = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const keyId = parseInt(req.params.keyId);

            const keys = await this.keyService.getUserKeys(userId);
            const key = keys.find(k => k.id === keyId);

            if (!key) {
                res.status(404).json({ error: 'Digital key not found' });
                return;
            }

            const isOwner = await this.vehicleModel.isOwner(key.vehicle_id, userId);
            if (!isOwner) {
                res.status(403).json({ error: 'Only vehicle owner can delete digital keys' });
                return;
            }

            const revoked = await this.keyService.revokeDigitalKey(keyId);
            if (!revoked) {
                res.status(500).json({ error: 'Failed to revoke digital key' });
                return;
            }

            res.status(200).json({
                message: 'Digital key revoked successfully'
            });
        } catch (error) {
            console.error('Delete key error:', error);
            res.status(500).json({ error: 'Failed to revoke digital key' });
        }
    };

    validateKey = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const keyId = parseInt(req.params.keyId);
            const { action } = req.body;

            const keys = await this.keyService.getUserKeys(userId);
            const key = keys.find(k => k.id === keyId);

            if (!key) {
                res.status(404).json({ error: 'Digital key not found' });
                return;
            }

            const isValid = await this.keyService.validateDigitalKey(keyId, action);
            const keyDataValid = await this.keyService.verifyKeyData(keyId);

            res.status(200).json({
                valid: isValid && keyDataValid,
                key_id: keyId,
                action: action,
                permissions: key.permissions,
                is_active: key.is_active,
                expires_at: key.expires_at
            });
        } catch (error) {
            console.error('Validate key error:', error);
            res.status(500).json({ error: 'Failed to validate digital key' });
        }
    };

    getKeyStats = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const stats = await this.keyService.getKeyStats(userId);

            res.status(200).json({
                statistics: stats
            });
        } catch (error) {
            console.error('Get key stats error:', error);
            res.status(500).json({ error: 'Failed to retrieve key statistics' });
        }
    };

    getAccessLogs = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }

            const limit = parseInt(req.query.limit as string) || 50;
            const logs = await this.keyService.getUserAccessLogs(userId, limit);

            const logsWithVehicleInfo = await Promise.all(
                logs.map(async (log) => {
                    const vehicle = await this.vehicleModel.findById(log.vehicle_id);
                    return {
                        ...log,
                        vehicle_info: vehicle ? {
                            vin: vehicle.vin,
                            model: vehicle.model
                        } : null
                    };
                })
            );

            res.status(200).json({
                access_logs: logsWithVehicleInfo
            });
        } catch (error) {
            console.error('Get access logs error:', error);
            res.status(500).json({ error: 'Failed to retrieve access logs' });
        }
    };

    cleanupExpiredKeys = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const cleanedCount = await this.keyService.cleanupExpiredKeys();

            res.status(200).json({
                message: 'Expired keys cleanup completed',
                cleaned_keys_count: cleanedCount
            });
        } catch (error) {
            console.error('Cleanup expired keys error:', error);
            res.status(500).json({ error: 'Failed to cleanup expired keys' });
        }
    };
}

export default KeyController;