import { Request, Response } from 'express';
import { VehicleAuthRequest } from '../middleware/vehicleAuth';
import VehicleService from '../services/VehicleService';

class VehicleStatusController {
  private vehicleService: VehicleService;

  constructor() {
    this.vehicleService = new VehicleService();
  }

  reportStatus = async (req: VehicleAuthRequest, res: Response): Promise<void> => {
    try {
      const vehicleId = req.vehicleId;
      if (!vehicleId) {
        res.status(400).json({ error: 'Vehicle identifier missing' });
        return;
      }

      const statusPayload = req.body;
      if (!statusPayload || typeof statusPayload !== 'object') {
        res.status(400).json({ error: 'Invalid status payload' });
        return;
      }

      const updatedStatus = await this.vehicleService.updateVehicleStatus(vehicleId, statusPayload);

      res.status(200).json({
        message: 'Vehicle status updated',
        status: updatedStatus
      });
    } catch (error) {
      console.error('Vehicle status update error:', error);
      res.status(500).json({ error: 'Failed to update vehicle status' });
    }
  };

  getStatus = async (req: VehicleAuthRequest, res: Response): Promise<void> => {
    try {
      const vehicleId = req.vehicleId;
      if (!vehicleId) {
        res.status(400).json({ error: 'Vehicle identifier missing' });
        return;
      }

      const status = await this.vehicleService.getVehicleStatus(vehicleId);

      if (!status) {
        res.status(404).json({ error: 'Status not found' });
        return;
      }

      res.status(200).json({
        vehicle_id: vehicleId,
        status
      });
    } catch (error) {
      console.error('Vehicle status retrieval error:', error);
      res.status(500).json({ error: 'Failed to retrieve vehicle status' });
    }
  };
}

export default VehicleStatusController;
