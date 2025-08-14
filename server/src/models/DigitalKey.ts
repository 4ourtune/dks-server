import Database from '../database/connection';
import { DigitalKey, KeyPermissions, AccessLog } from '../types';

class DigitalKeyModel {
    private db: Database;

    constructor() {
        this.db = Database.getInstance();
    }

    async create(keyData: Omit<DigitalKey, 'id' | 'created_at' | 'updated_at'>): Promise<DigitalKey> {
        const result = await this.db.run(
            'INSERT INTO digital_keys (user_id, vehicle_id, key_data, permissions, expires_at, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [
                keyData.user_id,
                keyData.vehicle_id,
                keyData.key_data,
                keyData.permissions,
                keyData.expires_at,
                keyData.is_active
            ]
        );

        const digitalKey = await this.findById(result.lastID!);
        return digitalKey!;
    }

    async findById(id: number): Promise<DigitalKey | null> {
        const key = await this.db.get(
            'SELECT * FROM digital_keys WHERE id = $1',
            [id]
        );
        
        return key || null;
    }

    async findByUserId(userId: number): Promise<DigitalKey[]> {
        const keys = await this.db.all(
            'SELECT * FROM digital_keys WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        
        return keys;
    }

    async findByVehicleId(vehicleId: number): Promise<DigitalKey[]> {
        const keys = await this.db.all(
            'SELECT * FROM digital_keys WHERE vehicle_id = $1 ORDER BY created_at DESC',
            [vehicleId]
        );
        
        return keys;
    }

    async findByUserAndVehicle(userId: number, vehicleId: number): Promise<DigitalKey | null> {
        const key = await this.db.get(
            'SELECT * FROM digital_keys WHERE user_id = $1 AND vehicle_id = $2 AND is_active = true',
            [userId, vehicleId]
        );
        
        return key || null;
    }

    async update(id: number, keyData: Partial<Omit<DigitalKey, 'id' | 'created_at' | 'updated_at'>>): Promise<DigitalKey | null> {
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        if (keyData.key_data) {
            updateFields.push(`key_data = $${updateValues.length + 1}`);
            updateValues.push(keyData.key_data);
        }

        if (keyData.permissions) {
            updateFields.push(`permissions = $${updateValues.length + 1}`);
            updateValues.push(keyData.permissions);
        }

        if (keyData.expires_at !== undefined) {
            updateFields.push(`expires_at = $${updateValues.length + 1}`);
            updateValues.push(keyData.expires_at);
        }

        if (keyData.is_active !== undefined) {
            updateFields.push(`is_active = $${updateValues.length + 1}`);
            updateValues.push(keyData.is_active);
        }

        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        updateValues.push(id);

        await this.db.run(
            `UPDATE digital_keys SET ${updateFields.join(', ')} WHERE id = $${updateValues.length}`,
            updateValues
        );

        return this.findById(id);
    }

    async delete(id: number): Promise<boolean> {
        const result = await this.db.run('DELETE FROM digital_keys WHERE id = $1', [id]);
        return result.changes! > 0;
    }

    async deactivate(id: number): Promise<boolean> {
        const result = await this.db.run(
            'UPDATE digital_keys SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );
        return result.changes! > 0;
    }

    async isValidKey(id: number): Promise<boolean> {
        const key = await this.db.get(
            'SELECT is_active, expires_at FROM digital_keys WHERE id = $1',
            [id]
        );

        if (!key || !key.is_active) {
            return false;
        }

        if (key.expires_at && new Date(key.expires_at) < new Date()) {
            return false;
        }

        return true;
    }

    async hasPermission(keyId: number, action: keyof KeyPermissions): Promise<boolean> {
        const key = await this.findById(keyId);
        if (!key || !key.is_active) return false;

        return key.permissions[action] === true;
    }

    async logAccess(logData: Omit<AccessLog, 'id' | 'timestamp'>): Promise<AccessLog> {
        const result = await this.db.run(
            'INSERT INTO access_logs (user_id, vehicle_id, action, result, error_message, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [
                logData.user_id,
                logData.vehicle_id,
                logData.action,
                logData.result,
                logData.error_message,
                logData.ip_address,
                logData.user_agent
            ]
        );

        const accessLog = result.rows[0];

        return accessLog;
    }

    async getAccessLogs(vehicleId: number, limit: number = 50): Promise<AccessLog[]> {
        const logs = await this.db.all(
            'SELECT * FROM access_logs WHERE vehicle_id = $1 ORDER BY timestamp DESC LIMIT $2',
            [vehicleId, limit]
        );
        return logs;
    }

    async getUserAccessLogs(userId: number, limit: number = 50): Promise<AccessLog[]> {
        const logs = await this.db.all(
            'SELECT * FROM access_logs WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2',
            [userId, limit]
        );
        return logs;
    }

    async cleanupExpiredKeys(): Promise<number> {
        const result = await this.db.run(
            'UPDATE digital_keys SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE expires_at < CURRENT_TIMESTAMP AND is_active = true'
        );
        return result.changes!;
    }
}

export default DigitalKeyModel;