import { Router } from 'express';
import CertificateController from '../controllers/CertificateController';
import { authenticateToken } from '../middleware/auth';
import { validate, certificateValidationSchemas } from '../middleware/validation';
import { createRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const certificateController = new CertificateController();

const certificateManagementRateLimit = createRateLimiter(60 * 1000, 20);
const certificateVerificationRateLimit = createRateLimiter(60 * 1000, 100);

router.post('/vehicle',
    authenticateToken,
    certificateManagementRateLimit,
    validate(certificateValidationSchemas.vehicleCertificateSchema),
    certificateController.issueVehicleCertificate
);

router.post('/digital-key',
    authenticateToken,
    certificateManagementRateLimit,
    validate(certificateValidationSchemas.digitalKeyCertificateSchema),
    certificateController.issueDigitalKeyCertificate
);

router.post('/verify',
    authenticateToken,
    certificateVerificationRateLimit,
    validate(certificateValidationSchemas.certificateVerificationSchema),
    certificateController.verifyCertificate
);

router.get('/user',
    authenticateToken,
    certificateController.getUserCertificates
);

router.get('/vehicle/:vehicleId',
    authenticateToken,
    validate(certificateValidationSchemas.vehicleIdParamSchema),
    certificateController.getVehicleCertificate
);

router.get('/root-ca/public-key',
    certificateController.getRootCAPublicKey
);

router.get('/crl',
    authenticateToken,
    certificateController.getCertificateRevocationList
);

router.get('/stats',
    authenticateToken,
    certificateController.getCertificateStats
);

router.get('/:serialNumber',
    authenticateToken,
    validate(certificateValidationSchemas.serialNumberParamSchema),
    certificateController.getCertificate
);

router.post('/:serialNumber/revoke',
    authenticateToken,
    certificateManagementRateLimit,
    validate(certificateValidationSchemas.revokeCertificateSchema),
    certificateController.revokeCertificate
);

router.post('/:serialNumber/renew',
    authenticateToken,
    certificateManagementRateLimit,
    validate(certificateValidationSchemas.renewCertificateSchema),
    certificateController.renewCertificate
);

router.get('/:serialNumber/export',
    authenticateToken,
    validate(certificateValidationSchemas.exportCertificateSchema),
    certificateController.exportCertificate
);

export default router;
