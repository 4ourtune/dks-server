-- PostgreSQL schema for Digital Key System
-- Converted from SQLite schema with optimizations

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vehicles table
CREATE TABLE vehicles (
    id SERIAL PRIMARY KEY,
    vin VARCHAR(17) UNIQUE NOT NULL,
    model VARCHAR(100) NOT NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(32) UNIQUE,
    secret_hash VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Digital keys table
CREATE TABLE digital_keys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
    key_data TEXT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{"unlock": true, "lock": true, "startEngine": false}',
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pairing sessions table (PIN-based pairing)
CREATE TABLE pairing_sessions (
    id SERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    pin_salt BYTEA NOT NULL,
    pin_hash BYTEA NOT NULL,
    owner_candidate_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    pairing_token VARCHAR(128),
    attempts_remaining INTEGER NOT NULL DEFAULT 5,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'cancelled')),
    expires_at TIMESTAMP NOT NULL,
    last_attempt_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pairing_sessions_session_id ON pairing_sessions(session_id);
CREATE INDEX idx_pairing_sessions_vehicle_id ON pairing_sessions(vehicle_id);
CREATE INDEX idx_pairing_sessions_status ON pairing_sessions(status);
-- Access logs table
CREATE TABLE access_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('unlock', 'lock', 'startEngine', 'status_check')),
    result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failure', 'timeout')),
    error_message TEXT,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_vehicles_owner_id ON vehicles(owner_id);
CREATE INDEX idx_vehicles_vin ON vehicles(vin);
CREATE INDEX idx_vehicles_device_id ON vehicles(device_id);
CREATE INDEX idx_digital_keys_user_id ON digital_keys(user_id);
CREATE INDEX idx_digital_keys_vehicle_id ON digital_keys(vehicle_id);
CREATE INDEX idx_digital_keys_active ON digital_keys(is_active) WHERE is_active = true;
CREATE INDEX idx_digital_keys_expires ON digital_keys(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX idx_access_logs_vehicle_id ON access_logs(vehicle_id);
CREATE INDEX idx_access_logs_timestamp ON access_logs(timestamp);
CREATE INDEX idx_access_logs_action ON access_logs(action);

-- Triggers for automatic updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_digital_keys_updated_at BEFORE UPDATE ON digital_keys
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_pairing_sessions_updated_at BEFORE UPDATE ON pairing_sessions
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();


-- PKI Certificate Management Tables

-- Root CA keys storage
CREATE TABLE root_ca_keys (
    id SERIAL PRIMARY KEY,
    key_id VARCHAR(64) UNIQUE NOT NULL,
    private_key_encrypted TEXT NOT NULL,
    public_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Certificates table
CREATE TABLE certificates (
    id SERIAL PRIMARY KEY,
    serial_number VARCHAR(64) UNIQUE NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('vehicle', 'digital_key')),
    subject_id INTEGER NOT NULL,
    public_key TEXT NOT NULL,
    certificate_data JSONB NOT NULL,
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    revocation_reason VARCHAR(100) NULL,
    is_active BOOLEAN DEFAULT true
);

-- Certificate revocation list
CREATE TABLE certificate_revocation_list (
    id SERIAL PRIMARY KEY,
    certificate_serial VARCHAR(64) NOT NULL,
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(100) NOT NULL
);

-- PKI Indexes
CREATE INDEX idx_certificates_serial_number ON certificates(serial_number);
CREATE INDEX idx_certificates_type ON certificates(type);
CREATE INDEX idx_certificates_subject_id ON certificates(subject_id);
CREATE INDEX idx_certificates_active ON certificates(is_active) WHERE is_active = true;
CREATE INDEX idx_certificates_expires_at ON certificates(expires_at);
CREATE INDEX idx_certificates_revoked_at ON certificates(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX idx_root_ca_keys_active ON root_ca_keys(is_active) WHERE is_active = true;
CREATE INDEX idx_crl_certificate_serial ON certificate_revocation_list(certificate_serial);
CREATE INDEX idx_crl_revoked_at ON certificate_revocation_list(revoked_at);
