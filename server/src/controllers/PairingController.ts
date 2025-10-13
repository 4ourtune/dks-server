import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import PairingService from '../services/PairingService';

class PairingController {
  private pairingService: PairingService;

  constructor() {
    this.pairingService = new PairingService();
  }

  getPendingSession = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const vehicleIdParam = typeof req.query.vehicleId === 'string'
        ? parseInt(req.query.vehicleId, 10)
        : undefined;

      if (!vehicleIdParam || Number.isNaN(vehicleIdParam) || vehicleIdParam <= 0) {
        res.status(400).json({ error: 'vehicleId query parameter is required' });
        return;
      }

      const session = await this.pairingService.getPendingSessionForVehicle(vehicleIdParam);
      if (session && session.ownerCandidateUserId && session.ownerCandidateUserId !== userId) {
        res.status(403).json({ error: 'Pairing session reserved for a different user' });
        return;
      }

      res.status(200).json(session ? {
        sessionId: session.sessionId,
        vehicleId: session.vehicleId,
        expiresAt: session.expiresAt,
        attemptsRemaining: session.attemptsRemaining,
      } : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load pairing session';
      res.status(400).json({ error: message });
    }
  };

  confirmPinPairing = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { vehicleId, pin } = req.body;

      const numericVehicleId = typeof vehicleId === 'string' ? parseInt(vehicleId, 10) : vehicleId;
      if (!Number.isInteger(numericVehicleId) || numericVehicleId <= 0) {
        res.status(400).json({ error: 'vehicleId is required' });
        return;
      }

      if (typeof pin !== 'string' || pin.length === 0) {
        res.status(400).json({ error: 'pin is required' });
        return;
      }

      const result = await this.pairingService.confirmPinSession(userId, numericVehicleId, pin);

      res.status(200).json({
        vehicleId: result.vehicleId,
        keyId: result.keyId,
        pairingToken: result.pairingToken,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to confirm pairing PIN';
      const code = error instanceof Error && (error as any).code ? (error as any).code : 'PAIRING_ERROR';
      const remainingAttempts = error instanceof Error && (error as any).remainingAttempts !== undefined
        ? (error as any).remainingAttempts
        : undefined;

      const status = code === 'PIN_INVALID' ? 401
        : code === 'PIN_EXPIRED' || code === 'PIN_ATTEMPTS_EXCEEDED' ? 410
        : 400;

      res.status(status).json({
        error: message,
        code,
        remainingAttempts,
      });
    }
  };
}

export default PairingController;
