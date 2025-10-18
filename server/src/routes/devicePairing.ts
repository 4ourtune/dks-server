import { Router } from "express";
import VehiclePairingController from "../controllers/VehiclePairingController";
import { authenticateVehicle } from "../middleware/vehicleAuth";

const router = Router();
const controller = new VehiclePairingController();

router.post("/pairing/pin", authenticateVehicle, controller.requestPin);
router.get(
  "/pairing/session/:sessionId",
  authenticateVehicle,
  controller.getSessionStatus,
);

export default router;
