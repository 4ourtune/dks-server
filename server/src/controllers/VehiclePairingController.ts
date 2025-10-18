import { Response } from "express";
import { VehicleAuthRequest } from "../middleware/vehicleAuth";
import PairingService from "../services/PairingService";

class VehiclePairingController {
  private pairingService: PairingService;

  constructor() {
    this.pairingService = new PairingService();
  }

  requestPin = async (
    req: VehicleAuthRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const deviceId = req.deviceId;
      if (!deviceId) {
        res.status(400).json({ error: "Device identifier missing" });
        return;
      }

      const { ownerCandidateUserId } = req.body;
      const result = await this.pairingService.requestPinFromVehicle(
        deviceId,
        ownerCandidateUserId,
      );
      res.status(201).json(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to generate pairing PIN";
      const code =
        error instanceof Error && (error as any).code
          ? (error as any).code
          : "PAIRING_ERROR";
      res
        .status(code === "VEHICLE_NOT_FOUND" ? 404 : 400)
        .json({ error: message, code });
    }
  };

  getSessionStatus = async (
    req: VehicleAuthRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const deviceId = req.deviceId;
      if (!deviceId) {
        res.status(400).json({ error: "Device identifier missing" });
        return;
      }

      const sessionId = req.params.sessionId;
      if (!sessionId) {
        res.status(400).json({ error: "sessionId is required" });
        return;
      }

      const status = await this.pairingService.getSessionStatusForVehicle(
        sessionId,
        deviceId,
      );
      res.status(200).json(status);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to retrieve session status";
      const code =
        error instanceof Error && (error as any).code
          ? (error as any).code
          : "PAIRING_ERROR";
      res
        .status(code === "SESSION_NOT_FOUND" ? 404 : 400)
        .json({ error: message, code });
    }
  };
}

export default VehiclePairingController;
