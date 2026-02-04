-- Create Zones Table
CREATE TABLE IF NOT EXISTS zones (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    callback_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create Zone Numbers Table (Numbers assigned to a zone)
CREATE TABLE IF NOT EXISTS zone_numbers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Update Profiles to link to a Zone
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE
SET NULL;
-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_zone_numbers_zone_id ON zone_numbers(zone_id);
CREATE INDEX IF NOT EXISTS idx_profiles_zone_id ON profiles(zone_id);