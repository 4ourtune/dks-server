import { Router } from 'express';
import AuthController from '../controllers/AuthController';
import { authenticateToken } from '../middleware/auth';
import {
    validate,
    registerSchema,
    loginSchema,
    refreshTokenSchema
} from '../middleware/validation';

const router = Router();
const authController = new AuthController();

router.post(
    '/register',
    validate(registerSchema),
    authController.register
);

router.post(
    '/login',
    validate(loginSchema),
    authController.login
);

router.post(
    '/refresh',
    validate(refreshTokenSchema),
    authController.refresh
);

router.post(
    '/logout',
    authenticateToken,
    authController.logout
);

router.get(
    '/profile',
    authenticateToken,
    authController.profile
);

router.put(
    '/profile',
    authenticateToken,
    authController.updateProfile
);

router.put(
    '/change-password',
    authenticateToken,
    authController.changePassword
);

router.delete(
    '/account',
    authenticateToken,
    authController.deleteAccount
);

export default router;
