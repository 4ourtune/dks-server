import ECCCryptoService from './ECCCryptoService';
import CryptoService from './CryptoService';
import CertificateModel from '../models/Certificate';
import { 
    Certificate, 
    VehicleCertificate, 
    DigitalKeyCertificate, 
    KeyPermissions,
    CertificateData,
    RootCAKeys,
    RootCACertificate
} from '../types';

class CertificateAuthorityService {
    private certificateModel: CertificateModel;
    private rootCAKeys: { publicKey: string; privateKey: string; keyId: string; createdAt?: string } | null = null;
    private rootCACertificate: RootCACertificate | null = null;

    constructor() {
        this.certificateModel = new CertificateModel();
    }

    async initializeRootCA(): Promise<void> {
        try {
            await this.certificateModel.ensureRootCATable();
            const existingCA = await this.certificateModel.getRootCAKeys();
            
            if (existingCA) {
                const decryptedPrivateKey = this.decryptRootCAPrivateKey(existingCA.privateKeyEncrypted);
                this.rootCAKeys = {
                    publicKey: existingCA.publicKey,
                    privateKey: decryptedPrivateKey,
                    keyId: existingCA.keyId,
                    createdAt: existingCA.createdAt
                };
                this.rootCACertificate = this.buildRootCACertificate(existingCA.keyId, existingCA.createdAt);
                console.log('Root CA loaded successfully');
                return;
            }

            const keyPair = ECCCryptoService.generateECKeyPair();
            const encryptedPrivateKey = this.encryptRootCAPrivateKey(keyPair.privateKey);
            const keyId = ECCCryptoService.generateSecureToken(16);

            await this.certificateModel.storeRootCAKeys({
                keyId,
                privateKeyEncrypted: encryptedPrivateKey,
                publicKey: keyPair.publicKey,
                isActive: true
            });

            this.rootCAKeys = {
                publicKey: keyPair.publicKey,
                privateKey: keyPair.privateKey,
                keyId,
                createdAt: new Date().toISOString()
            };
            this.rootCACertificate = this.buildRootCACertificate(keyId);
            console.log('Root CA initialized successfully');

        } catch (error) {
            console.error('Root CA initialization failed:', error);
            throw new Error('Failed to initialize Certificate Authority');
        }
    }

    private encryptRootCAPrivateKey(privateKey: string): string {
        const masterPassword = process.env.ROOT_CA_PASSWORD || 'default_ca_password';
        const keyHash = ECCCryptoService.hashData(masterPassword);
        const encryptionResult = CryptoService.encrypt(privateKey, keyHash);
        return JSON.stringify(encryptionResult);
    }

    private decryptRootCAPrivateKey(encryptedPrivateKey: string): string {
        const masterPassword = process.env.ROOT_CA_PASSWORD || 'default_ca_password';
        const keyHash = ECCCryptoService.hashData(masterPassword);
        
        try {
            const encryptionData = JSON.parse(encryptedPrivateKey);
            return CryptoService.decrypt(encryptionData.encryptedData, keyHash, encryptionData.iv, encryptionData.tag);
        } catch (error) {
            throw new Error('Failed to decrypt Root CA private key');
        }
    }

    async issueVehicleCertificate(
        vehicleId: number,
        deviceSerial: string,
        manufacturer: string = 'Unknown',
        model: string = 'Unknown',
        validityDays: number = 365
    ): Promise<Certificate> {
        if (!this.rootCAKeys) {
            throw new Error('Root CA not initialized');
        }

        const existingCert = await this.certificateModel.findBySubjectId(vehicleId, 'vehicle');
        if (existingCert && existingCert.isActive) {
            throw new Error('Active vehicle certificate already exists');
        }

        const vehicleKeyPair = ECCCryptoService.generateECKeyPair();

        const vehicleCert = ECCCryptoService.createVehicleCertificate(
            vehicleId,
            deviceSerial,
            manufacturer,
            model,
            vehicleKeyPair.publicKey,
            this.rootCAKeys.privateKey,
            validityDays
        );

        const certificate: Certificate = {
            serialNumber: vehicleCert.serialNumber,
            type: 'vehicle',
            subjectId: vehicleId,
            publicKey: vehicleCert.publicKey,
            certificateData: vehicleCert,
            expiresAt: vehicleCert.validTo,
            isActive: true
        };

        const savedCert = await this.certificateModel.create(certificate);

        console.log(`Vehicle certificate issued for vehicle ${vehicleId}`);
        return savedCert;
    }

    async issueDigitalKeyCertificate(
        userId: number,
        vehicleId: number,
        permissions: KeyPermissions,
        validityDays: number = 90
    ): Promise<Certificate> {
        if (!this.rootCAKeys) {
            throw new Error('Root CA not initialized');
        }

        const vehicleCert = await this.certificateModel.findBySubjectId(vehicleId, 'vehicle');
        if (!vehicleCert || !vehicleCert.isActive) {
            throw new Error('Valid vehicle certificate required');
        }

        const userKeyPair = ECCCryptoService.generateECKeyPair();
        const keyId = ECCCryptoService.generateSecureToken(12);

        const digitalKeyCert = ECCCryptoService.createDigitalKeyCertificate(
            userId,
            keyId,
            permissions,
            [vehicleId],
            userKeyPair.publicKey,
            this.rootCAKeys.privateKey,
            validityDays
        );

        const certificate: Certificate = {
            serialNumber: digitalKeyCert.serialNumber,
            type: 'digital_key',
            subjectId: userId,
            publicKey: digitalKeyCert.publicKey,
            certificateData: digitalKeyCert,
            expiresAt: digitalKeyCert.validTo,
            isActive: true
        };

        const savedCert = await this.certificateModel.create(certificate);

        console.log(`Digital key certificate issued for user ${userId}, vehicle ${vehicleId}`);
        return savedCert;
    }

    async verifyCertificate(certificate: CertificateData): Promise<boolean> {
        if (!this.rootCAKeys) {
            throw new Error('Root CA not initialized');
        }

        const isRevoked = await this.isCertificateRevoked(certificate.serialNumber);
        if (isRevoked) {
            return false;
        }

        return ECCCryptoService.verifyCertificate(certificate, this.rootCAKeys.publicKey);
    }

    async revokeCertificate(serialNumber: string, reason: string = 'Revoked by administrator'): Promise<void> {
        const certificate = await this.certificateModel.findBySerialNumber(serialNumber);
        if (!certificate) {
            throw new Error('Certificate not found');
        }

        await this.certificateModel.revokeCertificate(serialNumber, reason);
        console.log(`Certificate ${serialNumber} revoked: ${reason}`);
    }

    async isCertificateRevoked(serialNumber: string): Promise<boolean> {
        const certificate = await this.certificateModel.findBySerialNumber(serialNumber);
        return certificate ? !!certificate.revokedAt : false;
    }

    async getCertificateRevocationList(): Promise<any[]> {
        return await this.certificateModel.getCertificateRevocationList();
    }

    private buildRootCACertificate(keyId: string, createdAt?: string): RootCACertificate {
        if (!this.rootCAKeys) {
            throw new Error('Root CA not initialized');
        }

        const issuedAt = createdAt ? new Date(createdAt) : new Date();
        const notBefore = issuedAt.toISOString();
        const notAfter = new Date(issuedAt.getTime() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString();

        const certificatePayload = {
            id: 'dks-root-ca',
            subject: 'DKS Root CA',
            issuer: 'DKS Root CA',
            publicKey: this.rootCAKeys.publicKey,
            notBefore,
            notAfter,
            serialNumber: keyId,
            version: 1
        };

        const signatureBase = JSON.stringify({
            id: certificatePayload.id,
            subject: certificatePayload.subject,
            issuer: certificatePayload.issuer,
            publicKey: certificatePayload.publicKey,
            notBefore: certificatePayload.notBefore,
            notAfter: certificatePayload.notAfter,
            serialNumber: certificatePayload.serialNumber,
            version: certificatePayload.version
        });

        const signature = ECCCryptoService.signWithECDSA(
            signatureBase,
            this.rootCAKeys.privateKey
        );

        return {
            ...certificatePayload,
            signature
        };
    }

    async getRootCACertificate(): Promise<RootCACertificate> {
        if (!this.rootCAKeys) {
            await this.initializeRootCA();
        }

        if (!this.rootCAKeys) {
            throw new Error('Root CA not initialized');
        }

        if (!this.rootCACertificate) {
            this.rootCACertificate = this.buildRootCACertificate(this.rootCAKeys.keyId, this.rootCAKeys.createdAt);
        }

        return this.rootCACertificate;
    }

    async getRootCAPublicKey(): Promise<string> {
        const certificate = await this.getRootCACertificate();
        return certificate.publicKey;
    }

    async getCertificateBySerialNumber(serialNumber: string): Promise<Certificate | null> {
        return await this.certificateModel.findBySerialNumber(serialNumber);
    }

    async getUserCertificates(userId: number): Promise<Certificate[]> {
        return await this.certificateModel.findAllBySubjectId(userId, 'digital_key', true);
    }

    async getVehicleCertificate(vehicleId: number): Promise<Certificate | null> {
        return await this.certificateModel.findBySubjectId(vehicleId, 'vehicle');
    }

    async validateDigitalKeyAccess(
        userCertificate: DigitalKeyCertificate,
        vehicleId: number,
        action: keyof KeyPermissions
    ): Promise<boolean> {
        if (!userCertificate.allowedVehicles.includes(vehicleId)) {
            return false;
        }

        if (!userCertificate.permissions[action]) {
            return false;
        }

        return this.verifyCertificate(userCertificate);
    }

    async cleanupExpiredCertificates(): Promise<number> {
        return await this.certificateModel.deactivateExpiredCertificates();
    }

    async getCertificateStats(): Promise<{
        totalCertificates: number;
        activeCertificates: number;
        expiredCertificates: number;
        revokedCertificates: number;
        vehicleCertificates: number;
        digitalKeyCertificates: number;
    }> {
        return await this.certificateModel.getCertificateStats();
    }

    async renewCertificate(serialNumber: string, validityDays?: number): Promise<Certificate> {
        const existingCert = await this.certificateModel.findBySerialNumber(serialNumber);
        if (!existingCert) {
            throw new Error('Certificate not found');
        }

        await this.revokeCertificate(serialNumber, 'Renewed');

        if (existingCert.type === 'vehicle') {
            const certData = existingCert.certificateData as VehicleCertificate;
            return this.issueVehicleCertificate(
                existingCert.subjectId,
                certData.subject.deviceSerial,
                certData.subject.manufacturer,
                certData.subject.model,
                validityDays
            );
        } else {
            const certData = existingCert.certificateData as DigitalKeyCertificate;
            const vehicleId = certData.allowedVehicles[0];
            return this.issueDigitalKeyCertificate(
                existingCert.subjectId,
                vehicleId,
                certData.permissions,
                validityDays
            );
        }
    }

    async exportCertificate(serialNumber: string, format: 'json' | 'pem' = 'json'): Promise<string> {
        const certificate = await this.certificateModel.findBySerialNumber(serialNumber);
        if (!certificate) {
            throw new Error('Certificate not found');
        }

        if (format === 'json') {
            return JSON.stringify(certificate, null, 2);
        }

        throw new Error('PEM format not yet implemented');
    }
}

export default CertificateAuthorityService;


