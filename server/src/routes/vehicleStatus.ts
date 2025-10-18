import { Router } from "express";
import { authenticateVehicle } from "../middleware/vehicleAuth";
import VehicleStatusController from "../controllers/VehicleStatusController";

const router = Router();
const controller = new VehicleStatusController();

router.post("/", authenticateVehicle, controller.reportStatus);
router.get("/", authenticateVehicle, controller.getStatus);

export default router;
