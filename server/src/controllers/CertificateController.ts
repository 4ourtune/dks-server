import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import CertificateAuthorityService from '../services/CertificateAuthorityService';
import VehicleService from '../services/VehicleService';
import LoggerService from '../services/LoggerService';
import { 
    KeyPermissions, 
    Certificate as CertificateEntity, 
    DigitalKeyCertificate, 
    VehicleCertificate 
} from '../types';

class CertificateController {
    private caService: CertificateAuthorityService;
    private vehicleService: VehicleService;
    private logger: LoggerService;

    constructor() {
        this.caService = new CertificateAuthorityService();
        this.vehicleService = new VehicleService();
        this.logger = LoggerService.getInstance();
    }

    private buildCertificateResponse(certificate: CertificateEntity): any {
        const baseData: any = certificate.certificateData || {};
        const notBefore = baseData.validFrom ?? baseData.notBefore ?? certificate.issuedAt;
        const notAfter = baseData.validTo ?? baseData.notAfter ?? certificate.expiresAt;
        const parsedVersion = typeof baseData.version === 'string' ? parseFloat(baseData.version) : baseData.version;
        const version = Number.isFinite(parsedVersion) ? parsedVersion : baseData.version ?? 1;

        const response: any = {
            id: certificate.serialNumber,
            serialNumber: certificate.serialNumber,
            issuer: baseData.issuer,
            subject: baseData.subject,
            publicKey: certificate.publicKey,
            signature: baseData.signature,
            notBefore: notBefore,
            notAfter: notAfter,
            version,
            type: certificate.type
        };

        if (certificate.type === 'digital_key') {
            const digitalData = baseData as DigitalKeyCertificate;
            response.vehicleId = digitalData.allowedVehicles?.[0] ?? null;
            response.allowedVehicles = digitalData.allowedVehicles ?? [];
            response.permissions = digitalData.permissions ?? { unlock: false, lock: false, startEngine: false };
            response.userId = digitalData.subject?.userId ?? certificate.subjectId;
            response.keyId = digitalData.subject?.keyId;
        } else if (certificate.type === 'vehicle') {
            const vehicleData = baseData as VehicleCertificate;
            response.vehicleId = vehicleData.subject?.vehicleId;
            response.deviceId = vehicleData.subject?.deviceSerial;
            response.capabilities = vehicleData.capabilities ?? [];
            response.manufacturer = vehicleData.subject?.manufacturer;
            response.model = vehicleData.subject?.model;
        }

        return response;
    }

    async initialize(): Promise<void> {
        await this.caService.initializeRootCA();
    }

    issueVehicleCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            await this.caService.initializeRootCA();
            const { vehicleId, deviceSerial, manufacturer, model, validityDays } = req.body;
            
            if (!vehicleId || !deviceSerial) {
                res.status(400).json({
                    success: false,
                    message: 'Vehicle ID and device serial are required'
                });
                return;
            }

            const vehicle = await this.vehicleService.getVehicleById(vehicleId);
            if (!vehicle) {
                res.status(404).json({
                    success: false,
                    message: 'Vehicle not found'
                });
                return;
            }

            const certificate = await this.caService.issueVehicleCertificate(
                vehicleId,
                deviceSerial,
                manufacturer || 'Unknown',
                model || vehicle.model,
                validityDays || 365
            );

            this.logger.server(`Vehicle certificate issued for vehicle ${vehicleId}`);

            const certificateResponse = this.buildCertificateResponse(certificate);
            
            res.status(201).json({
                success: true,
                message: 'Vehicle certificate issued successfully',
                certificate: certificateResponse,
                data: {
                    certificate: certificateResponse
                }
            });
        } catch (error) {
            this.logger.error('Failed to issue vehicle certificate:', error);
            res.status(500).json({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to issue vehicle certificate'
            });
        }
    };

    issueDigitalKeyCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            await this.caService.initializeRootCA();
            const { vehicleId, permissions, validityDays } = req.body;
            const userId = req.userId!;

            if (!vehicleId || !permissions) {
                res.status(400).json({
                    success: false,
                    message: 'Vehicle ID and permissions are required'
                });
                return;
            }

            const hasAccess = await this.vehicleService.hasVehicleAccess(userId, vehicleId);
            if (!hasAccess) {
                res.status(403).json({
                    success: false,
                    message: 'Access denied to this vehicle'
                });
                return;
            }

            const normalizedPermissions: KeyPermissions = {
                unlock: Boolean((permissions as any).unlock),
                lock: Boolean((permissions as any).lock),
                startEngine: Boolean((permissions as any).startEngine ?? (permissions as any).engine_on ?? false),
            };

            const certificate = await this.caService.issueDigitalKeyCertificate(
                userId,
                vehicleId,
                normalizedPermissions,
                validityDays || 90
            );

            this.logger.server(`Digital key certificate issued for user ${userId}, vehicle ${vehicleId}`);

            const certificateResponse = this.buildCertificateResponse(certificate);

            res.status(201).json({
                success: true,
                message: 'Digital key certificate issued successfully',
                certificate: certificateResponse,
                data: {
                    certificate: certificateResponse
                }
            });
        } catch (error) {
            this.logger.error('Failed to issue digital key certificate:', error);
            res.status(500).json({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to issue digital key certificate'
            });
        }
    };

    verifyCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { certificate } = req.body;

            if (!certificate) {
                res.status(400).json({
                    success: false,
                    message: 'Certificate is required'
                });
                return;
            }

            const isValid = await this.caService.verifyCertificate(certificate);

            res.json({
                success: true,
                data: {
                    isValid,
                    serialNumber: certificate.serialNumber,
                    issuer: certificate.issuer,
                    validFrom: certificate.validFrom,
                    validTo: certificate.validTo
                }
            });
        } catch (error) {
            this.logger.error('Certificate verification failed:', error);
            res.status(500).json({
                success: false,
                message: 'Certificate verification failed'
            });
        }
    };

    getCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { serialNumber } = req.params;

            const certificate = await this.caService.getCertificateBySerialNumber(serialNumber);
            if (!certificate) {
                res.status(404).json({
                    success: false,
                    message: 'Certificate not found'
                });
                return;
            }

            const certificateResponse = this.buildCertificateResponse(certificate);

            res.json({
                success: true,
                certificate: certificateResponse,
                data: {
                    certificate: certificateResponse
                }
            });
        } catch (error) {
            this.logger.error('Failed to get certificate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve certificate'
            });
        }
    };

    getUserCertificates = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.userId!;

            const certificates = await this.caService.getUserCertificates(userId);
            const certificateResponses = certificates.map(cert => this.buildCertificateResponse(cert));

            res.json({
                success: true,
                certificates: certificateResponses,
                data: {
                    certificates: certificateResponses
                }
            });
        } catch (error) {
            this.logger.error('Failed to get user certificates:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve user certificates'
            });
        }
    };

    getVehicleCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { vehicleId } = req.params;
            const userId = req.userId!;

            const hasAccess = await this.vehicleService.hasVehicleAccess(userId, parseInt(vehicleId));
            if (!hasAccess) {
                res.status(403).json({
                    success: false,
                    message: 'Access denied to this vehicle'
                });
                return;
            }

            const certificate = await this.caService.getVehicleCertificate(parseInt(vehicleId));
            if (!certificate) {
                res.status(404).json({
                    success: false,
                    message: 'Vehicle certificate not found'
                });
                return;
            }

            const certificateResponse = this.buildCertificateResponse(certificate);

            res.json({
                success: true,
                certificate: certificateResponse,
                data: {
                    certificate: certificateResponse
                }
            });
        } catch (error) {
            this.logger.error('Failed to get vehicle certificate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve vehicle certificate'
            });
        }
    };

    revokeCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { serialNumber } = req.params;
            const { reason } = req.body;

            await this.caService.revokeCertificate(serialNumber, reason || 'Revoked by user');

            this.logger.server(`Certificate ${serialNumber} revoked by user ${req.userId}`);

            res.json({
                success: true,
                message: 'Certificate revoked successfully'
            });
        } catch (error) {
            this.logger.error('Failed to revoke certificate:', error);
            res.status(500).json({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to revoke certificate'
            });
        }
    };

    renewCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { serialNumber } = req.params;
            const { validityDays } = req.body;

            const newCertificate = await this.caService.renewCertificate(serialNumber, validityDays);

            this.logger.server(`Certificate ${serialNumber} renewed by user ${req.userId}`);

            res.json({
                success: true,
                message: 'Certificate renewed successfully',
                data: {
                    serialNumber: newCertificate.serialNumber,
                    expiresAt: newCertificate.expiresAt,
                    certificate: newCertificate.certificateData
                }
            });
        } catch (error) {
            this.logger.error('Failed to renew certificate:', error);
            res.status(500).json({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to renew certificate'
            });
        }
    };

    getRootCAPublicKey = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const certificate = await this.caService.getRootCACertificate();

            res.json({
                success: true,
                certificate,
                message: 'Root CA certificate retrieved successfully'
            });
        } catch (error) {
            this.logger.error('Failed to get Root CA public key:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve Root CA certificate'
            });
        }
    };

    getCertificateRevocationList = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const crl = await this.caService.getCertificateRevocationList();

            res.json({
                success: true,
                data: {
                    revocationList: crl,
                    generatedAt: new Date().toISOString()
                }
            });
        } catch (error) {
            this.logger.error('Failed to get CRL:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve certificate revocation list'
            });
        }
    };

    getCertificateStats = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const stats = await this.caService.getCertificateStats();

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            this.logger.error('Failed to get certificate stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve certificate statistics'
            });
        }
    };

    exportCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { serialNumber } = req.params;
            const { format } = req.query;

            const exportedCert = await this.caService.exportCertificate(
                serialNumber,
                (format as 'json' | 'pem') || 'json'
            );

            if (format === 'pem') {
                res.setHeader('Content-Type', 'application/x-pem-file');
                res.setHeader('Content-Disposition', `attachment; filename="${serialNumber}.pem"`);
            } else {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="${serialNumber}.json"`);
            }

            res.send(exportedCert);
        } catch (error) {
            this.logger.error('Failed to export certificate:', error);
            res.status(500).json({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to export certificate'
            });
        }
    };
}

export default CertificateController;

