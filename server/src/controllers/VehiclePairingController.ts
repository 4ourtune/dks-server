import { Response } from "express";
import { VehicleAuthRequest } from "../middleware/vehicleAuth";
import PairingService from "../services/PairingService";
import KeyService from "../services/KeyService";

class VehiclePairingController {
  private pairingService: PairingService;
  private keyService: KeyService;

  constructor() {
    this.pairingService = new PairingService();
    this.keyService = new KeyService();
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

  getVehicleKeys = async (
    req: VehicleAuthRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const vehicleId = req.vehicleId;
      if (!vehicleId) {
        res.status(400).json({ error: "Vehicle identifier missing" });
        return;
      }

      const keys = await this.keyService.getVehicleKeys(vehicleId);
      const now = Date.now();
      const activeKeys = keys.filter((key) => {
        if (!key.is_active) {
          return false;
        }
        if (key.expires_at && new Date(key.expires_at).getTime() <= now) {
          return false;
        }
        return true;
      });

      const serialized = activeKeys.map((key) => ({
        id: key.id,
        keyId: key.id != null ? String(key.id) : undefined,
        userId: key.user_id,
        permissions: key.permissions,
        expiresAt: key.expires_at,
        createdAt: key.created_at,
        updatedAt: key.updated_at,
        keyData: (() => {
          try {
            return JSON.parse(key.key_data);
          } catch {
            return null;
          }
        })(),
      }));

      res.status(200).json({
        vehicleId,
        keys: serialized,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Vehicle key sync error:", error);
      res.status(500).json({ error: "Failed to retrieve vehicle keys" });
    }
  };
}

export default VehiclePairingController;
