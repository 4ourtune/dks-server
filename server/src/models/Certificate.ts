import Database from '../database/connection';
import { Certificate, RootCAKeys, CertificateRevocationEntry } from '../types';

class CertificateModel {
    private db: Database;

    constructor() {
        this.db = Database.getInstance();
    }

    async create(certificate: Certificate): Promise<Certificate> {
        const query = `
            INSERT INTO certificates (
                serial_number, type, subject_id, public_key, certificate_data,
                expires_at, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;

        const values = [
            certificate.serialNumber,
            certificate.type,
            certificate.subjectId,
            certificate.publicKey,
            JSON.stringify(certificate.certificateData),
            certificate.expiresAt,
            certificate.isActive
        ];

        const result = await this.db.query(query, values);
        return this.mapRowToCertificate(result.rows[0]);
    }

    async findBySerialNumber(serialNumber: string): Promise<Certificate | null> {
        const query = `
            SELECT * FROM certificates 
            WHERE serial_number = $1
        `;

        const result = await this.db.query(query, [serialNumber]);
        return result.rows.length > 0 ? this.mapRowToCertificate(result.rows[0]) : null;
    }

    async findBySubjectId(
        subjectId: number, 
        type: 'vehicle' | 'digital_key',
        activeOnly: boolean = false
    ): Promise<Certificate | null> {
        let query = `
            SELECT * FROM certificates 
            WHERE subject_id = $1 AND type = $2
        `;

        if (activeOnly) {
            query += ` AND is_active = true AND revoked_at IS NULL`;
        }

        query += ` ORDER BY issued_at DESC LIMIT 1`;

        const result = await this.db.query(query, [subjectId, type]);
        return result.rows.length > 0 ? this.mapRowToCertificate(result.rows[0]) : null;
    }

    async findAllBySubjectId(
        subjectId: number, 
        type: 'vehicle' | 'digital_key',
        activeOnly: boolean = false
    ): Promise<Certificate[]> {
        let query = `
            SELECT * FROM certificates 
            WHERE subject_id = $1 AND type = $2
        `;

        if (activeOnly) {
            query += ` AND is_active = true AND revoked_at IS NULL`;
        }

        query += ` ORDER BY issued_at DESC`;

        const result = await this.db.query(query, [subjectId, type]);
        return result.rows.map((row: any) => this.mapRowToCertificate(row));
    }

    async revokeCertificate(serialNumber: string, reason: string): Promise<void> {
        try {
            await this.db.run(`
                UPDATE certificates 
                SET revoked_at = CURRENT_TIMESTAMP, revocation_reason = $1, is_active = false
                WHERE serial_number = $2
            `, [reason, serialNumber]);

            await this.db.run(`
                INSERT INTO certificate_revocation_list (certificate_serial, reason)
                VALUES ($1, $2)
            `, [serialNumber, reason]);
        } catch (error) {
            throw error;
        }
    }

    async getCertificateRevocationList(): Promise<CertificateRevocationEntry[]> {
        const query = `
            SELECT * FROM certificate_revocation_list 
            ORDER BY revoked_at DESC
        `;

        const result = await this.db.query(query);
        return result.rows.map((row: any) => ({
            id: row.id,
            certificateSerial: row.certificate_serial,
            revokedAt: row.revoked_at,
            reason: row.reason
        }));
    }

    async deactivateExpiredCertificates(): Promise<number> {
        const query = `
            UPDATE certificates 
            SET is_active = false 
            WHERE expires_at < CURRENT_TIMESTAMP AND is_active = true
            RETURNING id
        `;

        const result = await this.db.query(query);
        return result.rowCount || 0;
    }

    async getCertificateStats(): Promise<{
        totalCertificates: number;
        activeCertificates: number;
        expiredCertificates: number;
        revokedCertificates: number;
        vehicleCertificates: number;
        digitalKeyCertificates: number;
    }> {
        const query = `
            SELECT 
                COUNT(*) as total_certificates,
                COUNT(*) FILTER (WHERE is_active = true AND revoked_at IS NULL) as active_certificates,
                COUNT(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP) as expired_certificates,
                COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) as revoked_certificates,
                COUNT(*) FILTER (WHERE type = 'vehicle') as vehicle_certificates,
                COUNT(*) FILTER (WHERE type = 'digital_key') as digital_key_certificates
            FROM certificates
        `;

        const result = await this.db.query(query);
        const row = result.rows[0];

        return {
            totalCertificates: parseInt(row.total_certificates),
            activeCertificates: parseInt(row.active_certificates),
            expiredCertificates: parseInt(row.expired_certificates),
            revokedCertificates: parseInt(row.revoked_certificates),
            vehicleCertificates: parseInt(row.vehicle_certificates),
            digitalKeyCertificates: parseInt(row.digital_key_certificates)
        };
    }

    async storeRootCAKeys(rootCAKeys: RootCAKeys): Promise<void> {
        const query = `
            INSERT INTO root_ca_keys (key_id, private_key_encrypted, public_key, is_active)
            VALUES ($1, $2, $3, $4)
        `;

        const values = [
            rootCAKeys.keyId,
            rootCAKeys.privateKeyEncrypted,
            rootCAKeys.publicKey,
            rootCAKeys.isActive
        ];

        await this.db.query(query, values);
    }

    async getRootCAKeys(): Promise<RootCAKeys | null> {
        const query = `
            SELECT * FROM root_ca_keys 
            WHERE is_active = true 
            ORDER BY created_at DESC 
            LIMIT 1
        `;

        const result = await this.db.query(query);
        
        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            id: row.id,
            keyId: row.key_id,
            privateKeyEncrypted: row.private_key_encrypted,
            publicKey: row.public_key,
            createdAt: row.created_at,
            isActive: row.is_active
        };
    }

    async findActiveCertificates(limit: number = 50, offset: number = 0): Promise<Certificate[]> {
        const query = `
            SELECT * FROM certificates 
            WHERE is_active = true AND revoked_at IS NULL
            ORDER BY issued_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await this.db.query(query, [limit, offset]);
        return result.rows.map((row: any) => this.mapRowToCertificate(row));
    }

    async findCertificatesByType(
        type: 'vehicle' | 'digital_key',
        limit: number = 50,
        offset: number = 0
    ): Promise<Certificate[]> {
        const query = `
            SELECT * FROM certificates 
            WHERE type = $1
            ORDER BY issued_at DESC
            LIMIT $2 OFFSET $3
        `;

        const result = await this.db.query(query, [type, limit, offset]);
        return result.rows.map((row: any) => this.mapRowToCertificate(row));
    }

    private mapRowToCertificate(row: any): Certificate {
        return {
            id: row.id,
            serialNumber: row.serial_number,
            type: row.type,
            subjectId: row.subject_id,
            publicKey: row.public_key,
            certificateData: JSON.parse(row.certificate_data),
            issuedAt: row.issued_at,
            expiresAt: row.expires_at,
            revokedAt: row.revoked_at,
            revocationReason: row.revocation_reason,
            isActive: row.is_active
        };
    }
}

export default CertificateModel;