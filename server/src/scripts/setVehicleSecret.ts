import 'dotenv/config';

import Database from '../database/connection';
import VehicleService from '../services/VehicleService';

async function main(): Promise<void> {
    const [, , vehicleIdArg, secretArg] = process.argv;

    if (!vehicleIdArg || !secretArg) {
        console.error('Usage: npm run vehicle:set-secret -- <vehicleId> <plainSecret>');
        process.exitCode = 1;
        return;
    }

    const vehicleId = Number(vehicleIdArg);
    if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
        console.error('Vehicle ID must be a positive integer.');
        process.exitCode = 1;
        return;
    }

    const plainSecret = secretArg.trim();
    if (!plainSecret) {
        console.error('Secret must be a non-empty string.');
        process.exitCode = 1;
        return;
    }

    const vehicleService = new VehicleService();

    try {
        const vehicle = await vehicleService.setVehicleSecret(vehicleId, plainSecret);
        console.log(`Secret updated for vehicle ${vehicle.id} (device_id: ${vehicle.device_id}).`);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to update vehicle secret: ${message}`);
        process.exitCode = 1;
    } finally {
        try {
            await Database.getInstance().close();
        } catch (closeError) {
            // Swallow close errors to avoid masking main failure reasons.
        }
    }
}

main();
