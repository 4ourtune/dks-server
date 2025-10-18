import { Request, Response, NextFunction } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import UserModel from "../models/User";

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
  };
  userId?: number;
}

const userModel = new UserModel();

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Access token required" });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET not configured");
    }

    const decoded = jwt.verify(token, secret) as any;
    const user = await userModel.findById(decoded.userId);

    if (!user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    req.user = {
      id: user.id!,
      email: user.email,
      name: user.name,
    };
    req.userId = user.id!;

    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid or expired token" });
    return;
  }
};

export const generateTokens = (
  userId: number,
): { accessToken: string; refreshToken: string } => {
  const secret = process.env.JWT_SECRET;
  const accessTokenExpiry = process.env.JWT_EXPIRES_IN || "15m";
  const refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

  if (!secret) {
    throw new Error("JWT_SECRET not configured");
  }

  const accessToken = jwt.sign({ userId, type: "access" }, secret, {
    expiresIn: accessTokenExpiry,
  } as SignOptions);

  const refreshToken = jwt.sign({ userId, type: "refresh" }, secret, {
    expiresIn: refreshTokenExpiry,
  } as SignOptions);

  return { accessToken, refreshToken };
};

export const verifyRefreshToken = (
  refreshToken: string,
): { userId: number } | null => {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET not configured");
    }

    const decoded = jwt.verify(refreshToken, secret) as any;

    if (decoded.type !== "refresh") {
      return null;
    }

    return { userId: decoded.userId };
  } catch (error) {
    return null;
  }
};

export const requireVehicleAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const vehicleId = parseInt(req.params.vehicleId);
  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const VehicleModel = (await import("../models/Vehicle")).default;
    const vehicleModel = new VehicleModel();

    const hasAccess = await vehicleModel.isOwner(vehicleId, userId);

    if (!hasAccess) {
      const DigitalKeyModel = (await import("../models/DigitalKey")).default;
      const keyModel = new DigitalKeyModel();

      const digitalKey = await keyModel.findByUserAndVehicle(userId, vehicleId);

      if (!digitalKey || !digitalKey.is_active) {
        res.status(403).json({ error: "Access denied to this vehicle" });
        return;
      }
    }

    next();
  } catch (error) {
    console.error("Error checking vehicle access:", error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
};

export { AuthRequest };
