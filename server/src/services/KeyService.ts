import DigitalKeyModel from "../models/DigitalKey";
import VehicleModel from "../models/Vehicle";
import CryptoService from "./CryptoService";
import { DigitalKey, KeyPermissions, AccessLog } from "../types";

class KeyService {
  private digitalKeyModel: DigitalKeyModel;
  private vehicleModel: VehicleModel;

  constructor() {
    this.digitalKeyModel = new DigitalKeyModel();
    this.vehicleModel = new VehicleModel();
  }

  async createDigitalKey(
    userId: number,
    vehicleId: number,
    permissions: KeyPermissions,
    expiresAt?: string,
  ): Promise<DigitalKey> {
    const vehicle = await this.vehicleModel.findById(vehicleId);
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }

    const existingKey = await this.digitalKeyModel.findByUserAndVehicle(
      userId,
      vehicleId,
    );
    if (existingKey && existingKey.is_active) {
      throw new Error("Active key already exists for this user and vehicle");
    }

    const keyDataPlain = CryptoService.generateDigitalKeyData(
      vehicleId,
      userId,
      permissions,
    );
    const encryptedKey = CryptoService.encryptKeyWithMasterKey(keyDataPlain);

    const keyData = JSON.stringify({
      encryptedKey: encryptedKey.encryptedKey,
      iv: encryptedKey.iv,
      tag: encryptedKey.tag,
      masterKey: encryptedKey.masterKey,
    });

    const digitalKey = await this.digitalKeyModel.create({
      user_id: userId,
      vehicle_id: vehicleId,
      key_data: keyData,
      permissions,
      expires_at: expiresAt,
      is_active: true,
    });

    return digitalKey;
  }

  async validateDigitalKey(
    keyId: number,
    action: keyof KeyPermissions,
  ): Promise<boolean> {
    const isValid = await this.digitalKeyModel.isValidKey(keyId);
    if (!isValid) return false;

    const hasPermission = await this.digitalKeyModel.hasPermission(
      keyId,
      action,
    );
    if (!hasPermission) return false;

    return true;
  }

  async updateKeyPermissions(
    keyId: number,
    permissions: Partial<KeyPermissions>,
    isActive?: boolean,
    expiresAt?: string,
  ): Promise<DigitalKey | null> {
    const existingKey = await this.digitalKeyModel.findById(keyId);
    if (!existingKey) {
      throw new Error("Digital key not found");
    }

    const updatedPermissions = {
      ...existingKey.permissions,
      ...permissions,
    };

    const updateData: Partial<DigitalKey> = {
      permissions: updatedPermissions,
    };

    if (isActive !== undefined) {
      updateData.is_active = isActive;
    }

    if (expiresAt !== undefined) {
      updateData.expires_at = expiresAt;
    }

    return await this.digitalKeyModel.update(keyId, updateData);
  }

  async revokeDigitalKey(keyId: number): Promise<boolean> {
    return await this.digitalKeyModel.deactivate(keyId);
  }

  async getUserKeys(userId: number): Promise<DigitalKey[]> {
    return await this.digitalKeyModel.findByUserId(userId);
  }

  async getVehicleKeys(vehicleId: number): Promise<DigitalKey[]> {
    return await this.digitalKeyModel.findByVehicleId(vehicleId);
  }

  async executeVehicleAction(
    userId: number,
    vehicleId: number,
    keyId: number,
    action: "unlock" | "lock" | "startEngine",
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const isAuthorized = await this.validateDigitalKey(
        keyId,
        this.mapActionToPermission(action),
      );

      if (!isAuthorized) {
        await this.logAccess(
          userId,
          vehicleId,
          action,
          "failure",
          "Unauthorized access",
          ipAddress,
          userAgent,
        );
        return {
          success: false,
          message: "Unauthorized: Invalid key or insufficient permissions",
        };
      }

      const key = await this.digitalKeyModel.findById(keyId);
      if (!key || key.user_id !== userId || key.vehicle_id !== vehicleId) {
        await this.logAccess(
          userId,
          vehicleId,
          action,
          "failure",
          "Key mismatch",
          ipAddress,
          userAgent,
        );
        return { success: false, message: "Key validation failed" };
      }

      const result = await this.sendCommandToVehicle(vehicleId, action, key);

      if (result.success) {
        await this.logAccess(
          userId,
          vehicleId,
          action,
          "success",
          undefined,
          ipAddress,
          userAgent,
        );
        return { success: true, message: `Vehicle ${action} successful` };
      } else {
        await this.logAccess(
          userId,
          vehicleId,
          action,
          "failure",
          result.error,
          ipAddress,
          userAgent,
        );
        return {
          success: false,
          message: result.error || "Command execution failed",
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await this.logAccess(
        userId,
        vehicleId,
        action,
        "failure",
        errorMessage,
        ipAddress,
        userAgent,
      );
      return { success: false, message: "Internal error occurred" };
    }
  }

  private mapActionToPermission(action: string): keyof KeyPermissions {
    switch (action) {
      case "unlock":
        return "unlock";
      case "lock":
        return "lock";
      case "startEngine":
      case "engine_on":
        return "startEngine";
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async sendCommandToVehicle(
    vehicleId: number,
    action: string,
    key: DigitalKey,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const vehicle = await this.vehicleModel.findById(vehicleId);
      if (!vehicle) {
        return { success: false, error: "Vehicle not found" };
      }

      if (vehicle.status !== "active") {
        return { success: false, error: "Vehicle is not active" };
      }

      const keyDataObj = JSON.parse(key.key_data);
      const decryptedKeyData = CryptoService.decrypt(
        keyDataObj.encryptedKey,
        keyDataObj.masterKey,
        keyDataObj.iv,
        keyDataObj.tag,
      );

      const keyInfo = JSON.parse(decryptedKeyData);
      if (keyInfo.vehicleId !== vehicleId || keyInfo.userId !== key.user_id) {
        return { success: false, error: "Key validation failed" };
      }

      await this.simulateVehicleCommand(vehicle.device_id, action);

      return { success: true };
    } catch (error) {
      return { success: false, error: "Failed to communicate with vehicle" };
    }
  }

  private async simulateVehicleCommand(
    deviceId: string,
    action: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Sent ${action} command to Device device: ${deviceId}`);
        resolve();
      }, 100);
    });
  }

  private async logAccess(
    userId: number,
    vehicleId: number,
    action: "unlock" | "lock" | "startEngine",
    result: "success" | "failure" | "timeout",
    errorMessage?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.digitalKeyModel.logAccess({
      user_id: userId,
      vehicle_id: vehicleId,
      action,
      result,
      error_message: errorMessage,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  }

  async getAccessLogs(
    vehicleId: number,
    limit: number = 50,
  ): Promise<AccessLog[]> {
    return await this.digitalKeyModel.getAccessLogs(vehicleId, limit);
  }

  async getUserAccessLogs(
    userId: number,
    limit: number = 50,
  ): Promise<AccessLog[]> {
    return await this.digitalKeyModel.getUserAccessLogs(userId, limit);
  }

  async cleanupExpiredKeys(): Promise<number> {
    return await this.digitalKeyModel.cleanupExpiredKeys();
  }

  async verifyKeyData(keyId: number): Promise<boolean> {
    try {
      const key = await this.digitalKeyModel.findById(keyId);
      if (!key) return false;

      const keyDataObj = JSON.parse(key.key_data);
      const decryptedKeyData = CryptoService.decrypt(
        keyDataObj.encryptedKey,
        keyDataObj.masterKey,
        keyDataObj.iv,
        keyDataObj.tag,
      );

      const keyInfo = JSON.parse(decryptedKeyData);

      return (
        keyInfo.vehicleId === key.vehicle_id && keyInfo.userId === key.user_id
      );
    } catch (error) {
      return false;
    }
  }

  async getKeyStats(userId: number): Promise<{
    totalKeys: number;
    activeKeys: number;
    expiredKeys: number;
    recentAccess: number;
  }> {
    const userKeys = await this.getUserKeys(userId);
    const now = new Date();

    const totalKeys = userKeys.length;
    const activeKeys = userKeys.filter(
      (key) =>
        key.is_active && (!key.expires_at || new Date(key.expires_at) > now),
    ).length;
    const expiredKeys = userKeys.filter(
      (key) => key.expires_at && new Date(key.expires_at) <= now,
    ).length;

    const recentLogs = await this.getUserAccessLogs(userId, 10);
    const recentAccess = recentLogs.filter(
      (log) =>
        log.result === "success" &&
        new Date(log.timestamp!) > new Date(Date.now() - 24 * 60 * 60 * 1000),
    ).length;

    return {
      totalKeys,
      activeKeys,
      expiredKeys,
      recentAccess,
    };
  }
}

export default KeyService;
