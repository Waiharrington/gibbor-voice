-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Calls Table
create table public.calls (
  id uuid default uuid_generate_v4() primary key,
  "from" text,
  "to" text,
  direction text check (direction in ('inbound', 'outbound')),
  status text,
  duration integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Messages Table
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  "from" text,
  "to" text,
  body text,
  media_url text, -- Store URL of the image/media
  direction text check (direction in ('inbound', 'outbound')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) - Optional but recommended
alter table public.calls enable row level security;
alter table public.messages enable row level security;

-- Create policies to allow public access (since we are using service key in backend, this is just for safety if anon key is used)
-- For this MVP, we will allow all access to keep it simple, or we can rely on Service Key bypassing RLS.
-- Let's create a policy that allows everything for now to avoid permission issues during dev.
create policy "Enable all access for all users" on public.calls for all using (true) with check (true);
create policy "Enable all access for all users" on public.messages for all using (true) with check (true);

-- Campaigns Table
create table campaigns (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  status text default 'active', -- active, paused, completed
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Leads Table
create table leads (
  id uuid default uuid_generate_v4() primary key,
  campaign_id uuid references campaigns(id) on delete cascade,
  phone text not null,
  name text,
  status text default 'pending', -- pending, called, voicemail, connected, not_interested, sale
  last_call_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies for Campaigns and Leads
alter table campaigns enable row level security;
alter table leads enable row level security;

create policy "Enable all access for anon" on campaigns for all using (true) with check (true);
create policy "Enable all access for anon" on leads for all using (true) with check (true);
