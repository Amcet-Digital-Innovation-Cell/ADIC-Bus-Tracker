-- ==============================================================================
-- 01_amcet_schema_separation.sql
-- AMCET Transit Management System - Complete Production DDL Architecture
-- Target Schema: bus_tracking
-- Database:      PostgreSQL 15+ / Supabase
-- ==============================================================================

-- 1. Create Dedicated bus_tracking Schema
CREATE SCHEMA IF NOT EXISTS bus_tracking;

-- 2. Table: bus_tracking.bus_routes (Transit routes with JSONB stops sequence)
CREATE TABLE IF NOT EXISTS bus_tracking.bus_routes (
    id BIGSERIAL PRIMARY KEY,
    route_name VARCHAR(255) NOT NULL,
    origin VARCHAR(255),
    destination VARCHAR(255) DEFAULT 'AMCET',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    stops JSONB DEFAULT '[]'::jsonb
);

-- Index on route_name for fast lookup and case-insensitive uniqueness
CREATE INDEX IF NOT EXISTS idx_bus_routes_name ON bus_tracking.bus_routes (UPPER(route_name));

-- 3. Table: bus_tracking.buses (Fleet vehicles & driver assignments)
CREATE TABLE IF NOT EXISTS bus_tracking.buses (
    id BIGSERIAL PRIMARY KEY,
    bus_number VARCHAR(50) NOT NULL,
    registration_number VARCHAR(50) NOT NULL UNIQUE,
    vehicle_number VARCHAR(50),
    bus_name VARCHAR(100),
    route_id BIGINT REFERENCES bus_tracking.bus_routes(id) ON DELETE SET NULL,
    route_name VARCHAR(255),
    driver_name VARCHAR(150),
    driver_phone VARCHAR(50),
    license_number VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Pending (GPS)',
    capacity INT DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buses_registration ON bus_tracking.buses (UPPER(registration_number));
CREATE INDEX IF NOT EXISTS idx_buses_route_id ON bus_tracking.buses (route_id);

-- 4. Table: bus_tracking.bus_stops (Normalized pickup points & sequence order)
CREATE TABLE IF NOT EXISTS bus_tracking.bus_stops (
    id BIGSERIAL PRIMARY KEY,
    bus_id BIGINT REFERENCES bus_tracking.buses(id) ON DELETE CASCADE,
    route_id BIGINT REFERENCES bus_tracking.bus_routes(id) ON DELETE CASCADE,
    stop_name VARCHAR(255) NOT NULL,
    stop_order INT NOT NULL DEFAULT 1,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bus_stops_bus ON bus_tracking.bus_stops (bus_id);
CREATE INDEX IF NOT EXISTS idx_bus_stops_route ON bus_tracking.bus_stops (route_id);

-- 5. Table: bus_tracking.gps_telemetry (Real-time IoT tracker coordinates)
CREATE TABLE IF NOT EXISTS bus_tracking.gps_telemetry (
    id BIGSERIAL PRIMARY KEY,
    vehicle_number VARCHAR(50) NOT NULL,
    imei VARCHAR(50),
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    speed NUMERIC(6, 2) DEFAULT 0.00,
    ignition BOOLEAN DEFAULT false,
    address TEXT,
    location_address TEXT,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    gps_actual_time TIMESTAMPTZ,
    raw_status VARCHAR(50) DEFAULT 'STOP',
    raw_payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_gps_telemetry_vehicle ON bus_tracking.gps_telemetry (vehicle_number);

-- 6. Table: bus_tracking.students (College student transit roster)
CREATE TABLE IF NOT EXISTS bus_tracking.students (
    id BIGSERIAL PRIMARY KEY,
    student_id VARCHAR(50) NOT NULL UNIQUE,
    student_name VARCHAR(150) NOT NULL,
    student_mobile VARCHAR(50),
    email VARCHAR(150),
    department VARCHAR(100),
    academic_year VARCHAR(20) DEFAULT '1st Year',
    pass_out_year VARCHAR(10),
    parent_name VARCHAR(150),
    parent_phone VARCHAR(50),
    emergency_contact VARCHAR(50),
    route_id BIGINT REFERENCES bus_tracking.bus_routes(id) ON DELETE SET NULL,
    bus_number VARCHAR(50),
    activation_key VARCHAR(50),
    is_registered BOOLEAN DEFAULT false,
    registered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_id ON bus_tracking.students (UPPER(student_id));
CREATE INDEX IF NOT EXISTS idx_students_route ON bus_tracking.students (route_id);

-- 7. Grant Permissions & Row Level Security
GRANT USAGE ON SCHEMA bus_tracking TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA bus_tracking TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA bus_tracking TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA bus_tracking TO authenticated;
