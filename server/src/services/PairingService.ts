import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import PairingSessionModel from '../models/PairingSession';
import VehicleService from './VehicleService';
import KeyService from './KeyService';
import LoggerService from './LoggerService';
import PKISessionModel from '../models/PKISession';
import { PairingSessionStatus, PKISessionRecord } from '../types';

interface StartPinSessionResult {
  sessionId: string;
  pin: string;
  expiresAt: string;
  maxAttempts: number;
}

interface ConfirmPinResult {
  vehicleId: number;
  keyId: number | null;
  pairingToken: string;
}

interface VehicleSessionStatus {
  sessionId: string;
  status: PairingSessionStatus;
  vehicleId: number;
  pairingToken: string | null;
  expiresAt: string;
  attemptsRemaining: number;
  lastAttemptAt?: string;
}

class PairingService {
  private static readonly PIN_LENGTH = 6;
  private static readonly DEFAULT_ATTEMPTS = 5;
  private static readonly PIN_TTL_MS = 10 * 60 * 1000;
  private static readonly PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private static readonly PKI_SESSION_TTL_MS = 15 * 60 * 1000;

  private pairingModel: PairingSessionModel;
  private vehicleService: VehicleService;
  private keyService: KeyService;
  private logger: LoggerService;
  private pkiSessionModel: PKISessionModel;

  constructor() {
    this.pairingModel = new PairingSessionModel();
    this.vehicleService = new VehicleService();
    this.keyService = new KeyService();
    this.logger = LoggerService.getInstance();
    this.pkiSessionModel = new PKISessionModel();
  }

  async requestPinFromVehicle(deviceId: string, ownerCandidateUserId?: number): Promise<StartPinSessionResult> {
    const vehicle = await this.vehicleService.getVehicleByDeviceId(deviceId);
    if (!vehicle?.id) {
      throw this.buildError('Vehicle not found for device ID', 'VEHICLE_NOT_FOUND');
    }

    if (vehicle.owner_id && vehicle.owner_id !== ownerCandidateUserId) {
      throw this.buildError('Vehicle already registered to another user', 'VEHICLE_ALREADY_REGISTERED');
    }

    const existingPending = await this.pairingModel.findPendingByVehicle(vehicle.id);
    await Promise.all(existingPending.map((session) =>
      this.pairingModel.update(session.id!, { status: 'cancelled' })
    ));

    const sessionId = randomUUID();
    const pin = this.generatePin();
    const salt = randomBytes(16);
    const pinHash = this.hashPin(pin, salt);
    const expiresAt = new Date(Date.now() + PairingService.PIN_TTL_MS).toISOString();

    await this.pairingModel.create({
      session_id: sessionId,
      vehicle_id: vehicle.id,
      pin_salt: salt,
      pin_hash: pinHash,
      attempts_remaining: PairingService.DEFAULT_ATTEMPTS,
      status: 'pending',
      expires_at: expiresAt,
      owner_candidate_user_id: ownerCandidateUserId ?? null,
    });

    this.logger.info('Vehicle requested pairing PIN', {
      vehicleId: vehicle.id,
      deviceId,
      sessionId,
    });

    return {
      sessionId,
      pin,
      expiresAt,
      maxAttempts: PairingService.DEFAULT_ATTEMPTS,
    };
  }

  async refreshPKISession(
    userId: number,
    vehicleId: number,
    options: { pairingToken?: string | null; sessionId?: string | null } = {},
  ): Promise<{
    vehicleId: number;
    sessionId: string;
    sessionKey: string;
    expiresAt: string;
    serverNonce: string;
    clientNonce: string;
    pairingToken?: string | null;
    vehiclePublicKey?: string | null;
  }> {
    const vehicle = await this.vehicleService.getVehicleById(vehicleId);
    if (!vehicle?.id) {
      throw this.buildError('Vehicle not found', 'VEHICLE_NOT_FOUND');
    }

    const hasAccess = await this.vehicleService.hasVehicleAccess(userId, vehicleId);
    if (!hasAccess) {
      throw this.buildError('User does not have access to this vehicle', 'ACCESS_DENIED');
    }

    const verifiedSession = await this.pairingModel.findLatestVerifiedByVehicle(vehicleId);
    if (!verifiedSession) {
      throw this.buildError('Vehicle pairing has not been completed', 'PAIRING_NOT_VERIFIED');
    }

    const expectedToken = verifiedSession.pairing_token ?? null;
    if (expectedToken && options.pairingToken && expectedToken !== options.pairingToken) {
      throw this.buildError('Pairing token mismatch', 'PAIRING_TOKEN_MISMATCH');
    }

    const existing = await this.pkiSessionModel.findActiveByVehicle(vehicleId);
    if (existing && (!options.sessionId || existing.session_id === options.sessionId)) {
      return this.mapPKISessionRecord(existing, expectedToken);
    }

    const sessionId = randomUUID();
    const sessionKey = randomBytes(32).toString('base64');
    const clientNonce = randomBytes(16).toString('base64');
    const serverNonce = randomBytes(16).toString('base64');
    const expiresAt = new Date(Date.now() + PairingService.PKI_SESSION_TTL_MS).toISOString();

    const record = await this.pkiSessionModel.upsert({
      vehicle_id: vehicleId,
      pairing_session_id: verifiedSession.id ?? null,
      session_id: sessionId,
      session_key: sessionKey,
      pairing_token: expectedToken,
      client_nonce: clientNonce,
      server_nonce: serverNonce,
      expires_at: expiresAt,
    });

    this.logger.info('PKI session refreshed', {
      vehicleId,
      sessionId,
      userId,
    });

    return this.mapPKISessionRecord(record, expectedToken);
  }

  private mapPKISessionRecord(record: PKISessionRecord, pairingToken: string | null) {
    return {
      vehicleId: record.vehicle_id,
      sessionId: record.session_id,
      sessionKey: record.session_key,
      expiresAt: record.expires_at,
      serverNonce: record.server_nonce ?? '',
      clientNonce: record.client_nonce ?? '',
      pairingToken,
      vehiclePublicKey: null,
    };
  }

  async getSessionStatusForVehicle(sessionId: string, deviceId: string): Promise<VehicleSessionStatus> {
    const vehicle = await this.vehicleService.getVehicleByDeviceId(deviceId);
    if (!vehicle?.id) {
      throw this.buildError('Vehicle not found for device ID', 'VEHICLE_NOT_FOUND');
    }

    const session = await this.pairingModel.findBySessionAndVehicle(sessionId, vehicle.id);
    if (!session) {
      throw this.buildError('Pairing session not found', 'SESSION_NOT_FOUND');
    }

    return {
      sessionId: session.session_id,
      status: session.status,
      vehicleId: session.vehicle_id,
      pairingToken: session.pairing_token ?? null,
      expiresAt: session.expires_at,
      attemptsRemaining: session.attempts_remaining,
      lastAttemptAt: session.last_attempt_at,
    };
  }

  async confirmPinSession(userId: number, vehicleId: number, pin: string): Promise<ConfirmPinResult> {
    const vehicle = await this.vehicleService.getVehicleById(vehicleId);
    if (!vehicle?.id) {
      throw this.buildError('Vehicle not found', 'VEHICLE_NOT_FOUND');
    }

    if (vehicle.owner_id && vehicle.owner_id !== userId) {
      throw this.buildError('Vehicle already registered to another user', 'VEHICLE_ALREADY_REGISTERED');
    }

    const pendingSessions = await this.pairingModel.findPendingByVehicle(vehicle.id);
    if (!pendingSessions.length) {
      throw this.buildError('No pending pairing sessions for this vehicle', 'NO_PENDING_SESSION');
    }

    let matchedSession = null;
    for (const candidate of pendingSessions) {
      if (candidate.owner_candidate_user_id && candidate.owner_candidate_user_id !== userId) {
        continue;
      }
      const candidateHash = this.hashPin(pin, candidate.pin_salt);
      if (timingSafeEqual(candidateHash, candidate.pin_hash)) {
        matchedSession = candidate;
        break;
      }
    }

    const session = matchedSession ?? pendingSessions[0];
    if (session.owner_candidate_user_id && session.owner_candidate_user_id !== userId) {
      throw this.buildError('Pairing session reserved for a different user', 'SESSION_OWNERSHIP_ERROR');
    }

    const providedHash = this.hashPin(pin, session.pin_salt);
    const pinMatches = timingSafeEqual(providedHash, session.pin_hash);

    if (!pinMatches) {
      const remaining = session.attempts_remaining - 1;
      const status: PairingSessionStatus = remaining <= 0 ? 'expired' : 'pending';
      await this.pairingModel.update(session.id!, {
        attempts_remaining: Math.max(remaining, 0),
        status,
        last_attempt_at: new Date().toISOString(),
      });

      const error = this.buildError('Invalid PIN', 'PIN_INVALID');
      (error as any).remainingAttempts = Math.max(remaining, 0);
      throw error;
    }

    const pairingToken = randomUUID();

    await this.pairingModel.update(session.id!, {
      status: 'verified',
      user_id: userId,
      pairing_token: pairingToken,
      last_attempt_at: new Date().toISOString(),
    });

    if (!vehicle.owner_id) {
      await this.vehicleService.updateVehicle(vehicle.id, { owner_id: userId });
    }

    let digitalKeyId: number | null = null;
    try {
      const key = await this.keyService.createDigitalKey(userId, vehicle.id, {
        unlock: true,
        lock: true,
        startEngine: false,
      });
      digitalKeyId = key.id ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Active key already exists')) {
        const existingKeys = await this.keyService.getUserKeys(userId);
        const key = existingKeys.find((k) => k.vehicle_id === vehicle.id && k.is_active);
        digitalKeyId = key?.id ?? null;
      } else {
        throw error;
      }
    }

    this.logger.info('Pairing PIN confirmed', {
      vehicleId: vehicle.id,
      userId,
      pairingToken,
    });

    return {
      vehicleId: vehicle.id,
      keyId: digitalKeyId,
      pairingToken,
    };
  }

  async getPendingSessionForVehicle(vehicleId: number): Promise<{
    sessionId: string;
    vehicleId: number;
    expiresAt: string;
    attemptsRemaining: number;
    ownerCandidateUserId: number | null;
  } | null> {
    const pendingSessions = await this.pairingModel.findPendingByVehicle(vehicleId);
    if (!pendingSessions.length) {
      return null;
    }

    const session = pendingSessions[0];
    return {
      sessionId: session.session_id,
      vehicleId: session.vehicle_id,
      expiresAt: session.expires_at,
      attemptsRemaining: session.attempts_remaining,
      ownerCandidateUserId: session.owner_candidate_user_id ?? null,
    };
  }

  private generatePin(): string {
    const chars = PairingService.PIN_ALPHABET;
    const random = randomBytes(PairingService.PIN_LENGTH);
    let pin = '';
    for (let i = 0; i < PairingService.PIN_LENGTH; i += 1) {
      const index = random[i] % chars.length;
      pin += chars[index];
    }
    return pin;
  }

  private hashPin(pin: string, salt: Buffer): Buffer {
    return scryptSync(pin, salt, 32);
  }

  private buildError(message: string, code: string): Error {
    const error = new Error(message);
    (error as any).code = code;
    return error;
  }
}

export default PairingService;
