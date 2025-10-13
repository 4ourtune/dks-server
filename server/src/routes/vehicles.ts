import { Router } from 'express';
import VehicleController from '../controllers/VehicleController';
import { authenticateToken, requireVehicleAccess } from '../middleware/auth';
import { 
    validate, 
    vehicleSchema, 
    vehicleCommandSchema,
    vehicleIdParamSchema,
    paginationSchema,
    rateLimit 
} from '../middleware/validation';

const router = Router();
const vehicleController = new VehicleController();

const vehicleCommandRateLimit = rateLimit(60 * 1000, 30);
const vehicleManagementRateLimit = rateLimit(60 * 1000, 10);
const vehicleStatusRateLimit = rateLimit(60 * 1000, 100);

// System vehicle registration (for admin/system use)
router.post('/system', 
    authenticateToken,
    vehicleManagementRateLimit,
    validate(vehicleSchema), 
    vehicleController.registerSystemVehicle
);

// User vehicle registration (user connects to existing vehicle)
router.post('/:vehicleId/register', 
    authenticateToken,
    vehicleManagementRateLimit,
    validate(vehicleIdParamSchema),
    vehicleController.registerUserToVehicle
);

// Legacy endpoint (kept for backward compatibility)
router.post('/', 
    authenticateToken,
    vehicleManagementRateLimit,
    validate(vehicleSchema), 
    vehicleController.registerVehicle
);

router.get('/', 
    authenticateToken,
    validate(paginationSchema),
    vehicleController.getUserVehicles
);

router.get('/:vehicleId', 
    authenticateToken,
    validate(vehicleIdParamSchema),
    requireVehicleAccess,
    vehicleController.getVehicleById
);

router.put('/:vehicleId', 
    authenticateToken,
    vehicleManagementRateLimit,
    validate(vehicleIdParamSchema),
    requireVehicleAccess,
    vehicleController.updateVehicle
);

router.delete('/:vehicleId', 
    authenticateToken,
    vehicleManagementRateLimit,
    validate(vehicleIdParamSchema),
    requireVehicleAccess,
    vehicleController.deleteVehicle
);

// Door control APIs
router.post('/:vehicleId/unlock', 
    authenticateToken,
    vehicleCommandRateLimit,
    validate(vehicleCommandSchema),
    requireVehicleAccess,
    vehicleController.unlock
);

router.post('/:vehicleId/lock', 
    authenticateToken,
    vehicleCommandRateLimit,
    validate(vehicleCommandSchema),
    requireVehicleAccess,
    vehicleController.lock
);

router.post('/:vehicleId/engine_on', 
    authenticateToken,
    vehicleCommandRateLimit,
    validate(vehicleCommandSchema),
    requireVehicleAccess,
    vehicleController.engineOn
);

router.get('/:vehicleId/status', 
    authenticateToken,
    vehicleStatusRateLimit,
    validate(vehicleIdParamSchema),
    requireVehicleAccess,
    vehicleController.getStatus
);

router.get('/:vehicleId/logs', 
    authenticateToken,
    validate(vehicleIdParamSchema),
    validate(paginationSchema),
    requireVehicleAccess,
    vehicleController.getLogs
);

router.get('/:vehicleId/statistics', 
    authenticateToken,
    validate(vehicleIdParamSchema),
    requireVehicleAccess,
    vehicleController.getStatistics
);

router.post('/:vehicleId/maintenance/check', 
    authenticateToken,
    validate(vehicleIdParamSchema),
    requireVehicleAccess,
    vehicleController.performMaintenance
);

router.post('/:vehicleId/maintenance/mode', 
    authenticateToken,
    vehicleManagementRateLimit,
    validate(vehicleIdParamSchema),
    requireVehicleAccess,
    vehicleController.setMaintenanceMode
);

export default router;
