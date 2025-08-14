import { Router } from 'express';
import AuthController from '../controllers/AuthController';
import { authenticateToken } from '../middleware/auth';
import { 
    validate, 
    registerSchema, 
    loginSchema, 
    refreshTokenSchema,
    rateLimit 
} from '../middleware/validation';

const router = Router();
const authController = new AuthController();

const authRateLimit = rateLimit(15 * 60 * 1000, 5);
const refreshRateLimit = rateLimit(60 * 60 * 1000, 10);

router.post('/register', 
    authRateLimit,
    validate(registerSchema), 
    authController.register
);

router.post('/login', 
    authRateLimit,
    validate(loginSchema), 
    authController.login
);

router.post('/refresh', 
    refreshRateLimit,
    validate(refreshTokenSchema), 
    authController.refresh
);

router.post('/logout', 
    authenticateToken, 
    authController.logout
);

router.get('/profile', 
    authenticateToken, 
    authController.profile
);

router.put('/profile', 
    authenticateToken, 
    authController.updateProfile
);

router.put('/change-password', 
    authenticateToken, 
    authController.changePassword
);

router.delete('/account', 
    authenticateToken, 
    authController.deleteAccount
);

export default router;