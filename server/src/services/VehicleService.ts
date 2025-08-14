import VehicleModel from '../models/Vehicle';
import DigitalKeyModel from '../models/DigitalKey';
import { Vehicle, VehicleStatus, AccessLog } from '../types';

class VehicleService {
    private vehicleModel: VehicleModel;
    private digitalKeyModel: DigitalKeyModel;
    private connectedVehicles: Map<number, VehicleStatus>;

    constructor() {
        this.vehicleModel = new VehicleModel();
        this.digitalKeyModel = new DigitalKeyModel();
        this.connectedVehicles = new Map();
    }

    async registerVehicle(vehicleData: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>): Promise<Vehicle> {
        const existingVehicle = await this.vehicleModel.findByVin(vehicleData.vin);
        if (existingVehicle) {
            throw new Error('Vehicle with this VIN already exists');
        }

        const existingDevice = await this.vehicleModel.findByTC375DeviceId(vehicleData.tc375_device_id);
        if (existingDevice) {
            throw new Error('TC375 device already registered');
        }

        return await this.vehicleModel.create(vehicleData);
    }

    async updateVehicle(
        vehicleId: number, 
        updateData: Partial<Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>>
    ): Promise<Vehicle | null> {
        const vehicle = await this.vehicleModel.findById(vehicleId);
        if (!vehicle) {
            throw new Error('Vehicle not found');
        }

        if (updateData.vin && updateData.vin !== vehicle.vin) {
            const existingVin = await this.vehicleModel.findByVin(updateData.vin);
            if (existingVin && existingVin.id !== vehicleId) {
                throw new Error('Vehicle with this VIN already exists');
            }
        }

        if (updateData.tc375_device_id && updateData.tc375_device_id !== vehicle.tc375_device_id) {
            const existingDevice = await this.vehicleModel.findByTC375DeviceId(updateData.tc375_device_id);
            if (existingDevice && existingDevice.id !== vehicleId) {
                throw new Error('TC375 device already registered');
            }
        }

        return await this.vehicleModel.update(vehicleId, updateData);
    }

    async deleteVehicle(vehicleId: number): Promise<boolean> {
        const vehicle = await this.vehicleModel.findById(vehicleId);
        if (!vehicle) {
            throw new Error('Vehicle not found');
        }

        const activeKeys = await this.digitalKeyModel.findByVehicleId(vehicleId);
        const hasActiveKeys = activeKeys.some(key => key.is_active);
        
        if (hasActiveKeys) {
            throw new Error('Cannot delete vehicle with active digital keys. Revoke all keys first.');
        }

        return await this.vehicleModel.delete(vehicleId);
    }

    async getUserVehicles(userId: number): Promise<Vehicle[]> {
        return await this.vehicleModel.findByOwnerId(userId);
    }

    async getVehicleById(vehicleId: number): Promise<Vehicle | null> {
        return await this.vehicleModel.findById(vehicleId);
    }

    async getVehicleStatus(vehicleId: number): Promise<VehicleStatus | null> {
        const vehicle = await this.vehicleModel.findById(vehicleId);
        if (!vehicle) {
            throw new Error('Vehicle not found');
        }

        const cachedStatus = this.connectedVehicles.get(vehicleId);
        if (cachedStatus) {
            return cachedStatus;
        }

        return this.getDefaultVehicleStatus();
    }

    private getDefaultVehicleStatus(): VehicleStatus {
        return {
            locked: true,
            engine_running: false,
            battery_level: 85,
            location: {
                latitude: 37.7749,
                longitude: -122.4194
            },
            last_updated: new Date().toISOString()
        };
    }

    async updateVehicleStatus(vehicleId: number, status: Partial<VehicleStatus>): Promise<VehicleStatus> {
        const currentStatus = this.connectedVehicles.get(vehicleId) || this.getDefaultVehicleStatus();
        
        const updatedStatus: VehicleStatus = {
            ...currentStatus,
            ...status,
            last_updated: new Date().toISOString()
        };

        this.connectedVehicles.set(vehicleId, updatedStatus);
        return updatedStatus;
    }

    async connectVehicle(vehicleId: number, tc375DeviceId: string): Promise<boolean> {
        const vehicle = await this.vehicleModel.findById(vehicleId);
        if (!vehicle) {
            return false;
        }

        if (vehicle.tc375_device_id !== tc375DeviceId) {
            return false;
        }

        if (vehicle.status !== 'active') {
            return false;
        }

        const defaultStatus = this.getDefaultVehicleStatus();
        this.connectedVehicles.set(vehicleId, defaultStatus);
        
        console.log(`Vehicle ${vehicleId} connected with TC375 device ${tc375DeviceId}`);
        return true;
    }

    async disconnectVehicle(vehicleId: number): Promise<void> {
        this.connectedVehicles.delete(vehicleId);
        console.log(`Vehicle ${vehicleId} disconnected`);
    }

    async isVehicleConnected(vehicleId: number): Promise<boolean> {
        return this.connectedVehicles.has(vehicleId);
    }

    async getConnectedVehicles(): Promise<number[]> {
        return Array.from(this.connectedVehicles.keys());
    }

    async executeVehicleCommand(
        vehicleId: number,
        command: 'unlock' | 'lock' | 'start' | 'stop'
    ): Promise<{ success: boolean; message: string }> {
        const vehicle = await this.vehicleModel.findById(vehicleId);
        if (!vehicle) {
            return { success: false, message: 'Vehicle not found' };
        }

        if (!this.isVehicleConnected(vehicleId)) {
            return { success: false, message: 'Vehicle not connected' };
        }

        if (vehicle.status !== 'active') {
            return { success: false, message: 'Vehicle is not active' };
        }

        try {
            const currentStatus = await this.getVehicleStatus(vehicleId);
            if (!currentStatus) {
                return { success: false, message: 'Unable to get vehicle status' };
            }

            const updatedStatus = this.applyCommand(currentStatus, command);
            await this.updateVehicleStatus(vehicleId, updatedStatus);

            return { success: true, message: `Command ${command} executed successfully` };
        } catch (error) {
            return { success: false, message: `Command execution failed: ${error}` };
        }
    }

    private applyCommand(currentStatus: VehicleStatus, command: string): Partial<VehicleStatus> {
        switch (command) {
            case 'unlock':
                return { locked: false };
            case 'lock':
                return { locked: true };
            case 'start':
                if (currentStatus.locked) {
                    throw new Error('Cannot start engine while vehicle is locked');
                }
                return { engine_running: true };
            case 'stop':
                return { engine_running: false };
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }

    async getVehicleAccessLogs(vehicleId: number, limit: number = 50): Promise<AccessLog[]> {
        return await this.digitalKeyModel.getAccessLogs(vehicleId, limit);
    }

    async getVehicleStatistics(vehicleId: number): Promise<{
        totalAccess: number;
        successfulAccess: number;
        failedAccess: number;
        lastAccess?: Date;
        activeKeys: number;
    }> {
        const logs = await this.getVehicleAccessLogs(vehicleId, 1000);
        const activeKeys = await this.digitalKeyModel.findByVehicleId(vehicleId);

        const totalAccess = logs.length;
        const successfulAccess = logs.filter(log => log.result === 'success').length;
        const failedAccess = logs.filter(log => log.result === 'failure').length;
        const lastAccess = logs.length > 0 ? new Date(logs[0].timestamp!) : undefined;
        const activeKeyCount = activeKeys.filter(key => key.is_active).length;

        return {
            totalAccess,
            successfulAccess,
            failedAccess,
            lastAccess,
            activeKeys: activeKeyCount
        };
    }

    async performMaintenanceCheck(vehicleId: number): Promise<{
        status: 'passed' | 'failed' | 'warning';
        issues: string[];
        recommendations: string[];
    }> {
        const vehicle = await this.vehicleModel.findById(vehicleId);
        if (!vehicle) {
            throw new Error('Vehicle not found');
        }

        const status = await this.getVehicleStatus(vehicleId);
        if (!status) {
            return {
                status: 'failed',
                issues: ['Unable to connect to vehicle'],
                recommendations: ['Check TC375 connection']
            };
        }

        const issues: string[] = [];
        const recommendations: string[] = [];

        if (status.battery_level < 20) {
            issues.push('Low battery level');
            recommendations.push('Charge vehicle battery');
        }

        if (status.battery_level < 50) {
            recommendations.push('Consider charging battery soon');
        }

        const logs = await this.getVehicleAccessLogs(vehicleId, 100);
        const recentFailures = logs.filter(log => 
            log.result === 'failure' &&
            new Date(log.timestamp!) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        ).length;

        if (recentFailures > 5) {
            issues.push('High failure rate in recent access attempts');
            recommendations.push('Check digital key permissions and vehicle connectivity');
        }

        const maintenanceStatus = issues.length === 0 ? 'passed' : 
                                issues.some(issue => issue.includes('battery') || issue.includes('failure')) ? 'failed' : 'warning';

        return {
            status: maintenanceStatus,
            issues,
            recommendations
        };
    }

    async setVehicleMaintenanceMode(vehicleId: number, enabled: boolean): Promise<Vehicle | null> {
        const status = enabled ? 'maintenance' : 'active';
        return await this.vehicleModel.update(vehicleId, { status });
    }
}

export default VehicleService;