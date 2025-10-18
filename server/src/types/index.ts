export interface User {
  id?: number;
  email: string;
  password_hash: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface Vehicle {
  id?: number;
  vin: string;
  model: string;
  owner_id: number | null;
  device_id: string;
  secret_hash: string;
  status: "active" | "inactive" | "maintenance";
  created_at?: string;
  updated_at?: string;
}

export type PairingSessionStatus =
  | "pending"
  | "verified"
  | "completed"
  | "expired"
  | "cancelled";

export interface PairingSession {
  id?: number;
  session_id: string;
  vehicle_id: number;
  user_id: number | null;
  pin_salt: Buffer;
  pin_hash: Buffer;
  owner_candidate_user_id?: number | null;
  pairing_token?: string | null;
  attempts_remaining: number;
  status: PairingSessionStatus;
  expires_at: string;
  last_attempt_at?: string;
  created_at?: string;
  updated_at?: string;
}
export interface DigitalKey {
  id?: number;
  user_id: number;
  vehicle_id: number;
  key_data: string;
  permissions: KeyPermissions;
  expires_at?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface KeyPermissions {
  unlock: boolean;
  lock: boolean;
  startEngine: boolean;
}

export interface AccessLog {
  id?: number;
  user_id: number;
  vehicle_id: number;
  action: "unlock" | "lock" | "startEngine" | "status_check";
  result: "success" | "failure" | "timeout";
  error_message?: string;
  ip_address?: string;
  user_agent?: string;
  timestamp?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface VehicleStatus {
  door_locked?: boolean;
  door_open?: boolean;
  engine_running?: boolean;
  battery_level?: number;
  latitude?: number;
  longitude?: number;
  location_updated?: string;
  last_update?: string;
  // Legacy fields for backward compatibility
  locked?: boolean;
  location?: {
    latitude: number;
    longitude: number;
  };
  last_updated?: string;
}

export interface VehicleCommand {
  action: "unlock" | "lock" | "startEngine";
  user_id: number;
  vehicle_id: number;
  key_id: number;
}

export interface SocketEvent {
  "vehicle:connect": { vehicle_id: number; device_id: string };
  "vehicle:command": VehicleCommand;
  "vehicle:status_request": { vehicle_id: number };
  "vehicle:status_update": { vehicle_id: number; status: VehicleStatus };
  "vehicle:command_result": {
    vehicle_id: number;
    action: "unlock" | "lock" | "startEngine";
    result: "success" | "failure" | "timeout";
    error_message?: string;
  };
  "vehicle:error": { vehicle_id: number; error: string };
}

export interface Certificate {
  id?: number;
  serialNumber: string;
  type: "vehicle" | "digital_key";
  subjectId: number;
  publicKey: string;
  certificateData: CertificateData;
  issuedAt?: string;
  expiresAt: string;
  revokedAt?: string;
  revocationReason?: string;
  isActive: boolean;
}

export interface CertificateData {
  version: string;
  serialNumber: string;
  issuer: string;
  subject: CertificateSubject;
  publicKey: string;
  validFrom: string;
  validTo: string;
  signature: string;
}

export interface CertificateSubject {
  vehicleId?: number;
  deviceSerial?: string;
  manufacturer?: string;
  model?: string;
  userId?: number;
  keyId?: string;
}

export interface VehicleCertificate extends CertificateData {
  subject: {
    vehicleId: number;
    deviceSerial: string;
    manufacturer: string;
    model: string;
  };
  capabilities: ("unlock" | "lock" | "startEngine")[];
}

export interface DigitalKeyCertificate extends CertificateData {
  subject: {
    userId: number;
    keyId: string;
  };
  permissions: KeyPermissions;
  allowedVehicles: number[];
}

export interface RootCAKeys {
  id?: number;
  keyId: string;
  privateKeyEncrypted: string;
  publicKey: string;
  createdAt?: string;
  isActive: boolean;
}

export interface RootCACertificate {
  id: string;
  subject: string;
  issuer: string;
  publicKey: string;
  signature: string;
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  version: number;
}

export interface CertificateRevocationEntry {
  id?: number;
  certificateSerial: string;
  revokedAt?: string;
  reason: string;
}

export interface PKISessionRecord {
  id?: number;
  vehicle_id: number;
  pairing_session_id?: number | null;
  session_id: string;
  session_key: string;
  pairing_token?: string | null;
  client_nonce?: string | null;
  server_nonce?: string | null;
  expires_at: string;
  created_at?: string;
  updated_at?: string;
}
