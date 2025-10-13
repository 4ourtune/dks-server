-- Seed data for Digital Key System
-- Test data for development and testing

-- Insert test users
INSERT INTO users (email, password_hash, name) VALUES
('admin@example.com', '$2b$10$example.hash.for.testing.purposes.only', 'System Administrator'),
('john.doe@example.com', '$2b$10$example.hash.for.testing.purposes.only', 'John Doe'),
('jane.smith@example.com', '$2b$10$example.hash.for.testing.purposes.only', 'Jane Smith');

-- Insert test vehicles
INSERT INTO vehicles (vin, model, owner_id, device_id, secret_hash, status) VALUES
('1HGBH41JXMN109186', 'Honda Civic 2021', 2, 'DEVICE_001', '$2a$12$EGhK4piDmCZ7lqPzlnw/4O8xQOEm6YU0qSgXfLZYonPG69k7Rgm5q', 'active'),
('JM1BK32F781123456', 'Mazda CX-5 2022', 3, 'DEVICE_002', '$2a$12$2skzsqD08p/iw11MSeOHeOqv/ShSYP/4zdKoIju3r2DmO9fSsBNlW', 'active'),
('WBAFR1C50DD123456', 'BMW 3 Series 2023', 2, 'DEVICE_003', '$2a$12$UUd/Md4PhxcHZbG7/T.WeOSdh6t8mI68U.Wm1WaZum9fGcdY7//c.', 'inactive');

-- Insert test digital keys
INSERT INTO digital_keys (user_id, vehicle_id, key_data, permissions, expires_at, is_active) VALUES
(2, 1, 'encrypted_key_data_001', '{"unlock": true, "lock": true, "startEngine": true}', NULL, true),
(3, 2, 'encrypted_key_data_002', '{"unlock": true, "lock": true, "startEngine": true}', NULL, true),
(2, 3, 'encrypted_key_data_003', '{"unlock": true, "lock": true, "startEngine": false}', '2025-12-31 23:59:59', false);

-- Insert test access logs
INSERT INTO access_logs (user_id, vehicle_id, action, result, ip_address, user_agent) VALUES
(2, 1, 'unlock', 'success', '192.168.1.100', 'DigitalKeyApp/1.0'),
(2, 1, 'startEngine', 'success', '192.168.1.100', 'DigitalKeyApp/1.0'),
(3, 2, 'unlock', 'success', '192.168.1.101', 'DigitalKeyApp/1.0'),
(2, 3, 'unlock', 'failure', '192.168.1.100', 'DigitalKeyApp/1.0');
