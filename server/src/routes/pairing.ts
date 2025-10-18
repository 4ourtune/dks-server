import { Router } from "express";
import PairingController from "../controllers/PairingController";
import { authenticateToken } from "../middleware/auth";
import {
  validate,
  pinPairingConfirmSchema,
  pinPairingStatusSchema,
} from "../middleware/validation";

const router = Router();
const controller = new PairingController();

router.get(
  "/pin/status",
  authenticateToken,
  validate(pinPairingStatusSchema),
  controller.getPendingSession,
);
router.post(
  "/pin/confirm",
  authenticateToken,
  validate(pinPairingConfirmSchema),
  controller.confirmPinPairing,
);
router.post(
  "/session/refresh",
  authenticateToken,
  controller.refreshPKISession,
);

export default router;
