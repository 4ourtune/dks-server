import { Request, Response, NextFunction } from "express";

import VehicleService from "../services/VehicleService";
import { Vehicle } from "../types";

export interface VehicleAuthRequest extends Request {
  deviceId?: string;
  vehicleId?: number;
  vehicle?: Vehicle;
  usedFallbackSecret?: boolean;
}

const vehicleService = new VehicleService();

function getHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value ? String(value) : undefined;
}

function getQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "string"
  ) {
    return value[0] as string;
  }

  return undefined;
}

export const authenticateVehicle = async (
  req: VehicleAuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const secret =
    getHeaderValue(req.headers["x-vehicle-secret"]) ??
    getQueryValue(req.query.secret);
  const vehicleIdRaw = getHeaderValue(req.headers["x-vehicle-id"]);

  if (!vehicleIdRaw) {
    res.status(400).json({ error: "Vehicle identifier missing" });
    return;
  }

  const vehicleId = Number(vehicleIdRaw);
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    res.status(400).json({ error: "Vehicle identifier is invalid" });
    return;
  }

  if (!secret) {
    res.status(401).json({ error: "Invalid vehicle credentials" });
    return;
  }

  try {
    let vehicle = await vehicleService.validateVehicleSecret(vehicleId, secret);
    let usedFallbackSecret = false;

    const fallbackSecret = process.env.VEHICLE_API_SECRET;
    if (!vehicle && fallbackSecret && secret === fallbackSecret) {
      vehicle = await vehicleService.getVehicleById(vehicleId);
      usedFallbackSecret = Boolean(vehicle);
      if (usedFallbackSecret) {
        console.warn(
          `Vehicle ${vehicleId} authenticated with fallback secret. Rotate vehicle secret ASAP.`,
        );
      }
    }

    if (!vehicle) {
      res.status(401).json({ error: "Invalid vehicle credentials" });
      return;
    }

    req.vehicleId = vehicle.id!;
    req.deviceId = vehicle.device_id ? String(vehicle.device_id) : undefined;
    req.vehicle = vehicle;
    req.usedFallbackSecret = usedFallbackSecret;

    next();
  } catch (error) {
    console.error("Vehicle authentication error:", error);
    res.status(500).json({ error: "Vehicle authentication failed" });
  }
};
