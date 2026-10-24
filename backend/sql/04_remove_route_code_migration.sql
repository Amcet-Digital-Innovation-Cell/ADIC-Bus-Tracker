-- ==============================================================================
-- Migration 04: Safely Remove route_code from AmcetTransit Database
-- Target Schema: bus_tracking
-- Target Table:  bus_tracking.bus_routes
-- Description:   Drops the obsolete route_code column, associated indexes, and
--                refreshes any dependent views. All routes are uniquely identified
--                by 'id' (primary key) and human-readable 'route_name'.
-- ==============================================================================

-- 1. Drop any legacy views that might reference route_code
DROP VIEW IF EXISTS public.bus_routes CASCADE;
DROP VIEW IF EXISTS bus_tracking.v_bus_routes CASCADE;

-- 2. Drop any indexes on route_code
DROP INDEX IF EXISTS bus_tracking.idx_bus_routes_route_code;
DROP INDEX IF EXISTS public.idx_bus_routes_route_code;

-- 3. Safely drop route_code column from bus_tracking.bus_routes
ALTER TABLE bus_tracking.bus_routes 
  DROP COLUMN IF EXISTS route_code;

-- 4. Clean up legacy public.bus_routes table if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'bus_routes' 
          AND column_name = 'route_code'
    ) THEN
        ALTER TABLE public.bus_routes DROP COLUMN route_code;
    END IF;
END $$;

-- 5. Re-create backward-compatible public view (without route_code)
CREATE OR REPLACE VIEW public.bus_routes AS
SELECT 
    id,
    route_name,
    origin,
    destination,
    created_at,
    stops
FROM bus_tracking.bus_routes;

-- 6. Verification query
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'bus_tracking' 
  AND table_name = 'bus_routes'
ORDER BY ordinal_position;
