import { Router } from 'express';
import KeyController from '../controllers/KeyController';
import { authenticateToken } from '../middleware/auth';
import { 
    validate, 
    digitalKeySchema, 
    keyPermissionUpdateSchema,
    keyIdParamSchema,
    paginationSchema,
    rateLimit 
} from '../middleware/validation';

const router = Router();
const keyController = new KeyController();

const keyActionRateLimit = rateLimit(60 * 1000, 20);
const keyManagementRateLimit = rateLimit(60 * 1000, 10);

router.post('/register', 
    authenticateToken,
    keyManagementRateLimit,
    validate(digitalKeySchema), 
    keyController.register
);

router.get('/', 
    authenticateToken,
    validate(paginationSchema),
    keyController.getUserKeys
);

router.get('/stats',
    authenticateToken,
    keyController.getKeyStats
);

router.get('/access-logs',
    authenticateToken,
    validate(paginationSchema),
    keyController.getAccessLogs
);

router.get('/:keyId', 
    authenticateToken,
    validate(keyIdParamSchema),
    keyController.getKeyById
);

router.put('/:keyId', 
    authenticateToken,
    keyManagementRateLimit,
    validate(keyPermissionUpdateSchema),
    keyController.updateKey
);

router.delete('/:keyId', 
    authenticateToken,
    keyManagementRateLimit,
    validate(keyIdParamSchema),
    keyController.deleteKey
);

router.post('/:keyId/validate', 
    authenticateToken,
    keyActionRateLimit,
    validate(keyIdParamSchema),
    keyController.validateKey
);

router.post('/cleanup/expired',
    authenticateToken,
    keyController.cleanupExpiredKeys
);

export default router;
