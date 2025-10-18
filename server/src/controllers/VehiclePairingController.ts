import { Response } from "express";
import { VehicleAuthRequest } from "../middleware/vehicleAuth";
import PairingService from "../services/PairingService";
import CertificateModel from "../models/Certificate";
import { DigitalKeyCertificate } from "../types";

class VehiclePairingController {
  private pairingService: PairingService;
  private certificateModel: CertificateModel;

  constructor() {
    this.pairingService = new PairingService();
    this.certificateModel = new CertificateModel();
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

      const certificates =
        await this.certificateModel.findActiveDigitalKeysForVehicle(vehicleId);

      const serialized = certificates
        .map((certificate) => {
          const data = certificate
            .certificateData as DigitalKeyCertificate | undefined;
          if (!data) {
            return null;
          }

          const keyId =
            data.subject?.keyId ??
            (data as any).keyId ??
            certificate.serialNumber;

          const permissions =
            data.permissions ??
            {
              unlock: false,
              lock: false,
              startEngine: false,
            };

          return {
            certificateId: certificate.serialNumber,
            keyId,
            userId: data.subject?.userId ?? certificate.subjectId,
            permissions,
            allowedVehicles: data.allowedVehicles,
            publicKey: data.publicKey ?? certificate.publicKey,
            validFrom: data.validFrom ?? certificate.issuedAt,
            validTo: data.validTo ?? certificate.expiresAt,
            certificate: data,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

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
