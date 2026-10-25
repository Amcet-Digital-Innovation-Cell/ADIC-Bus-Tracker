-- ==============================================================================
-- Migration: Alter stop_id Column Type in bus_tracking.students
-- 
-- Problem: 
--   High-precision decimal timestamp IDs (e.g. 1792670894336.837) generated
--   by the frontend exceed PostgreSQL 32-bit INTEGER limits (max ~2.1 billion)
--   and contain decimal points, causing "out of range for type integer" errors.
--
-- Solution:
--   Alters bus_tracking.students.stop_id to VARCHAR(255) (or NUMERIC(20, 3)),
--   safely accommodating high-precision decimal timestamps, string IDs, and UUIDs.
-- ==============================================================================

-- Step 1: Temporarily drop dependent view if it exists
DROP VIEW IF EXISTS bus_tracking.students_with_stops_view CASCADE;

-- Step 2: Alter column type
-- If stop_id already exists as integer, alter it using explicit text/varchar casting.
-- If it doesn't exist, create it as VARCHAR(255).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'bus_tracking' 
          AND table_name = 'students' 
          AND column_name = 'stop_id'
    ) THEN
        -- Alter existing column to VARCHAR(255) for maximum format flexibility
        ALTER TABLE bus_tracking.students 
        ALTER COLUMN stop_id TYPE VARCHAR(255) USING stop_id::VARCHAR(255);
        
        RAISE NOTICE 'Column bus_tracking.students.stop_id successfully altered to VARCHAR(255).';
    ELSE
        -- Add column if missing
        ALTER TABLE bus_tracking.students 
        ADD COLUMN stop_id VARCHAR(255);
        
        RAISE NOTICE 'Column bus_tracking.students.stop_id successfully created as VARCHAR(255).';
    END IF;
END $$;

-- Optional Alternative: If strictly NUMERIC(20, 3) is required instead of VARCHAR:
-- ALTER TABLE bus_tracking.students 
-- ALTER COLUMN stop_id TYPE NUMERIC(20, 3) USING stop_id::NUMERIC(20, 3);

-- Step 3: Recreate students_with_stops_view with universal stop mapping
CREATE OR REPLACE VIEW bus_tracking.students_with_stops_view AS
SELECT 
    s.*,
    COALESCE(st.stop_info->>'stop_name', s.boarding_stop) AS stop_name,
    COALESCE(st.stop_info->>'stop_name', s.boarding_stop) AS boarding_stop,
    r.route_name
FROM bus_tracking.students s
LEFT JOIN bus_tracking.bus_routes r ON s.route_id = r.id
LEFT JOIN LATERAL (
    SELECT elem AS stop_info
    FROM jsonb_array_elements(
        CASE 
            WHEN jsonb_typeof(r.stops) = 'array' THEN r.stops 
            ELSE '[]'::jsonb 
        END
    ) elem
    WHERE (elem->>'id')::text = s.stop_id::text
    LIMIT 1
) st ON true;

-- Step 4: Re-grant permissions
GRANT SELECT ON bus_tracking.students_with_stops_view TO anon, authenticated, service_role;
