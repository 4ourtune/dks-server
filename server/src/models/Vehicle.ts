import Database from '../database/connection';
import { Vehicle } from '../types';

class VehicleModel {
    private db: Database;

    constructor() {
        this.db = Database.getInstance();
    }

    async create(vehicleData: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>): Promise<Vehicle> {
        const result = await this.db.run(
            'INSERT INTO vehicles (vin, model, owner_id, tc375_device_id, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [vehicleData.vin, vehicleData.model, vehicleData.owner_id, vehicleData.tc375_device_id, vehicleData.status]
        );

        const vehicle = await this.findById(result.lastID!);
        return vehicle!;
    }

    async findById(id: number): Promise<Vehicle | null> {
        const vehicle = await this.db.get(
            'SELECT * FROM vehicles WHERE id = $1',
            [id]
        );
        return vehicle || null;
    }

    async findByVin(vin: string): Promise<Vehicle | null> {
        const vehicle = await this.db.get(
            'SELECT * FROM vehicles WHERE vin = $1',
            [vin]
        );
        return vehicle || null;
    }

    async findByTC375DeviceId(deviceId: string): Promise<Vehicle | null> {
        const vehicle = await this.db.get(
            'SELECT * FROM vehicles WHERE tc375_device_id = $1',
            [deviceId]
        );
        return vehicle || null;
    }

    async findByOwnerId(ownerId: number): Promise<Vehicle[]> {
        const vehicles = await this.db.all(
            'SELECT * FROM vehicles WHERE owner_id = $1 ORDER BY created_at DESC',
            [ownerId]
        );
        return vehicles;
    }

    async update(id: number, vehicleData: Partial<Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>>): Promise<Vehicle | null> {
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        if (vehicleData.vin) {
            updateFields.push(`vin = $${updateValues.length + 1}`);
            updateValues.push(vehicleData.vin);
        }

        if (vehicleData.model) {
            updateFields.push(`model = $${updateValues.length + 1}`);
            updateValues.push(vehicleData.model);
        }

        if (vehicleData.tc375_device_id) {
            updateFields.push(`tc375_device_id = $${updateValues.length + 1}`);
            updateValues.push(vehicleData.tc375_device_id);
        }

        if (vehicleData.status) {
            updateFields.push(`status = $${updateValues.length + 1}`);
            updateValues.push(vehicleData.status);
        }

        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        updateValues.push(id);

        await this.db.run(
            `UPDATE vehicles SET ${updateFields.join(', ')} WHERE id = $${updateValues.length}`,
            updateValues
        );

        return this.findById(id);
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.db.run('DELETE FROM vehicles WHERE id = $1', [id]);
        return result.changes! > 0;
    }

    async getAllVehicles(): Promise<Vehicle[]> {
        const vehicles = await this.db.all(
            'SELECT * FROM vehicles ORDER BY created_at DESC'
        );
        return vehicles;
    }

    async getVehiclesByStatus(status: 'active' | 'inactive' | 'maintenance'): Promise<Vehicle[]> {
        const vehicles = await this.db.all(
            'SELECT * FROM vehicles WHERE status = $1 ORDER BY created_at DESC',
            [status]
        );
        return vehicles;
    }

    async isOwner(vehicleId: number, userId: number): Promise<boolean> {
        const vehicle = await this.db.get(
            'SELECT owner_id FROM vehicles WHERE id = $1',
            [vehicleId]
        );
        return vehicle && vehicle.owner_id === userId;
    }
}

export default VehicleModel;