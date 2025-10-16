import Database from '../database/connection';
import { PKISessionRecord } from '../types';

class PKISessionModel {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  async upsert(session: {
    vehicle_id: number;
    pairing_session_id?: number | null;
    session_id: string;
    session_key: string;
    pairing_token?: string | null;
    client_nonce?: string | null;
    server_nonce?: string | null;
    expires_at: string;
  }): Promise<PKISessionRecord> {
    const row = await this.db.get(
      `INSERT INTO pki_sessions (
        vehicle_id,
        pairing_session_id,
        session_id,
        session_key,
        pairing_token,
        client_nonce,
        server_nonce,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (vehicle_id) DO UPDATE SET
        pairing_session_id = EXCLUDED.pairing_session_id,
        session_id = EXCLUDED.session_id,
        session_key = EXCLUDED.session_key,
        pairing_token = EXCLUDED.pairing_token,
        client_nonce = EXCLUDED.client_nonce,
        server_nonce = EXCLUDED.server_nonce,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        session.vehicle_id,
        session.pairing_session_id ?? null,
        session.session_id,
        session.session_key,
        session.pairing_token ?? null,
        session.client_nonce ?? null,
        session.server_nonce ?? null,
        session.expires_at,
      ],
    );

    return row as PKISessionRecord;
  }

  async findActiveByVehicle(vehicleId: number, referenceDate: Date = new Date()): Promise<PKISessionRecord | null> {
    const row = await this.db.get(
      `SELECT * FROM pki_sessions
       WHERE vehicle_id = $1 AND expires_at > $2
       ORDER BY expires_at DESC
       LIMIT 1`,
      [vehicleId, referenceDate.toISOString()],
    );

    return (row as PKISessionRecord) ?? null;
  }

  async findBySessionId(sessionId: string): Promise<PKISessionRecord | null> {
    const row = await this.db.get(
      `SELECT * FROM pki_sessions WHERE session_id = $1`,
      [sessionId],
    );

    return (row as PKISessionRecord) ?? null;
  }
}

export default PKISessionModel;
