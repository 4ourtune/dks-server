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
    tc375_device_id: string;
    status: 'active' | 'inactive' | 'maintenance';
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
    engine_on: boolean;
}

export interface AccessLog {
    id?: number;
    user_id: number;
    vehicle_id: number;
    action: 'unlock' | 'lock' | 'engine_on' | 'status_check';
    result: 'success' | 'failure' | 'timeout';
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
    action: 'unlock' | 'lock' | 'engine_on';
    user_id: number;
    vehicle_id: number;
    key_id: number;
}

export interface SocketEvent {
    'vehicle:connect': { vehicle_id: number; tc375_device_id: string };
    'vehicle:command': VehicleCommand;
    'vehicle:status_request': { vehicle_id: number };
    'vehicle:status_update': { vehicle_id: number; status: VehicleStatus };
    'vehicle:command_result': { 
        vehicle_id: number; 
        action: 'unlock' | 'lock' | 'engine_on'; 
        result: 'success' | 'failure' | 'timeout';
        error_message?: string;
    };
    'vehicle:error': { vehicle_id: number; error: string };
}