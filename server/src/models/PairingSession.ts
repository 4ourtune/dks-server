import Database from "../database/connection";
import { PairingSession, PairingSessionStatus } from "../types";

class PairingSessionModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  async create(session: {
    session_id: string;
    vehicle_id: number;
    pin_salt: Buffer;
    pin_hash: Buffer;
    attempts_remaining: number;
    status: PairingSessionStatus;
    expires_at: string;
    user_id?: number | null;
    owner_candidate_user_id?: number | null;
    pairing_token?: string | null;
    last_attempt_at?: string;
  }): Promise<PairingSession> {
    const row = await this.db.get(
      `INSERT INTO pairing_sessions (
        session_id,
        vehicle_id,
        user_id,
        pin_salt,
        pin_hash,
        owner_candidate_user_id,
        pairing_token,
        attempts_remaining,
        status,
        expires_at,
        last_attempt_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        session.session_id,
        session.vehicle_id,
        session.user_id ?? null,
        session.pin_salt,
        session.pin_hash,
        session.owner_candidate_user_id ?? null,
        session.pairing_token ?? null,
        session.attempts_remaining,
        session.status,
        session.expires_at,
        session.last_attempt_at ?? null,
      ],
    );

    return row as PairingSession;
  }

  async findBySessionId(sessionId: string): Promise<PairingSession | null> {
    const row = await this.db.get(
      "SELECT * FROM pairing_sessions WHERE session_id = $1",
      [sessionId],
    );
    return (row as PairingSession) || null;
  }

  async findById(id: number): Promise<PairingSession | null> {
    const row = await this.db.get(
      "SELECT * FROM pairing_sessions WHERE id = $1",
      [id],
    );
    return (row as PairingSession) || null;
  }

  async findPendingByVehicle(vehicleId: number): Promise<PairingSession[]> {
    const rows = await this.db.all(
      `SELECT * FROM pairing_sessions
       WHERE vehicle_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [vehicleId],
    );
    return rows as PairingSession[];
  }

  async findLatestVerifiedByVehicle(
    vehicleId: number,
  ): Promise<PairingSession | null> {
    const row = await this.db.get(
      `SELECT * FROM pairing_sessions
       WHERE vehicle_id = $1 AND status IN ('verified', 'completed')
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [vehicleId],
    );
    return (row as PairingSession) || null;
  }

  async findBySessionAndVehicle(
    sessionId: string,
    vehicleId: number,
  ): Promise<PairingSession | null> {
    const row = await this.db.get(
      "SELECT * FROM pairing_sessions WHERE session_id = $1 AND vehicle_id = $2",
      [sessionId, vehicleId],
    );
    return (row as PairingSession) || null;
  }

  async findByVehicleAndToken(
    vehicleId: number,
    pairingToken: string,
  ): Promise<PairingSession | null> {
    const row = await this.db.get(
      `SELECT * FROM pairing_sessions
       WHERE vehicle_id = $1 AND pairing_token = $2
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [vehicleId, pairingToken],
    );
    return (row as PairingSession) || null;
  }

  async update(
    id: number,
    updates: Partial<
      Pick<
        PairingSession,
        | "attempts_remaining"
        | "status"
        | "pin_hash"
        | "pin_salt"
        | "expires_at"
        | "last_attempt_at"
        | "user_id"
        | "owner_candidate_user_id"
        | "pairing_token"
      >
    >,
  ): Promise<PairingSession | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.attempts_remaining !== undefined) {
      fields.push(`attempts_remaining = $${values.length + 1}`);
      values.push(updates.attempts_remaining);
    }

    if (updates.status !== undefined) {
      fields.push(`status = $${values.length + 1}`);
      values.push(updates.status);
    }

    if (updates.pin_hash !== undefined) {
      fields.push(`pin_hash = $${values.length + 1}`);
      values.push(updates.pin_hash);
    }

    if (updates.pin_salt !== undefined) {
      fields.push(`pin_salt = $${values.length + 1}`);
      values.push(updates.pin_salt);
    }

    if (updates.expires_at !== undefined) {
      fields.push(`expires_at = $${values.length + 1}`);
      values.push(updates.expires_at);
    }

    if (updates.last_attempt_at !== undefined) {
      fields.push(`last_attempt_at = $${values.length + 1}`);
      values.push(updates.last_attempt_at);
    }

    if (updates.user_id !== undefined) {
      fields.push(`user_id = $${values.length + 1}`);
      values.push(updates.user_id);
    }

    if (updates.owner_candidate_user_id !== undefined) {
      fields.push(`owner_candidate_user_id = $${values.length + 1}`);
      values.push(updates.owner_candidate_user_id);
    }

    if (updates.pairing_token !== undefined) {
      fields.push(`pairing_token = $${values.length + 1}`);
      values.push(updates.pairing_token);
    }

    if (!fields.length) {
      return this.findById(id);
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    await this.db.run(
      `UPDATE pairing_sessions SET ${fields.join(", ")} WHERE id = $${values.length}`,
      values,
    );

    return this.findById(id);
  }
}

export default PairingSessionModel;
