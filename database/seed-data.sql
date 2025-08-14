-- Seed data for Digital Key System
-- Test data for development and testing

-- Insert test users
INSERT INTO users (email, password_hash, name) VALUES
('admin@example.com', '$2b$10$example.hash.for.testing.purposes.only', 'System Administrator'),
('john.doe@example.com', '$2b$10$example.hash.for.testing.purposes.only', 'John Doe'),
('jane.smith@example.com', '$2b$10$example.hash.for.testing.purposes.only', 'Jane Smith');

-- Insert test vehicles
INSERT INTO vehicles (vin, model, owner_id, tc375_device_id, status) VALUES
('1HGBH41JXMN109186', 'Honda Civic 2021', 2, 'TC375_DEVICE_001', 'active'),
('JM1BK32F781123456', 'Mazda CX-5 2022', 3, 'TC375_DEVICE_002', 'active'),
('WBAFR1C50DD123456', 'BMW 3 Series 2023', 2, 'TC375_DEVICE_003', 'inactive');

-- Insert test digital keys
INSERT INTO digital_keys (user_id, vehicle_id, key_data, permissions, expires_at, is_active) VALUES
(2, 1, 'encrypted_key_data_001', '{"unlock": true, "start": true, "trunk": true}', NULL, true),
(3, 2, 'encrypted_key_data_002', '{"unlock": true, "start": true, "trunk": true}', NULL, true),
(2, 3, 'encrypted_key_data_003', '{"unlock": true, "start": false, "trunk": true}', '2025-12-31 23:59:59', false);

-- Insert test access logs
INSERT INTO access_logs (user_id, vehicle_id, action, result, ip_address, user_agent) VALUES
(2, 1, 'unlock', 'success', '192.168.1.100', 'DigitalKeyApp/1.0'),
(2, 1, 'start', 'success', '192.168.1.100', 'DigitalKeyApp/1.0'),
(3, 2, 'unlock', 'success', '192.168.1.101', 'DigitalKeyApp/1.0'),
(2, 3, 'unlock', 'failure', '192.168.1.100', 'DigitalKeyApp/1.0');