import { createClient } from '@supabase/supabase-js';

// Using the project URL derived from the JWT and the Anon Key provided by the user
const supabaseUrl = 'https://cdzkxdmnltaiknjsrqrq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkemt4ZG1ubHRhaWtuanNxcnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4MjI2MTksImV4cCI6MjA4MDM5ODYxOX0.y4uyLdOvDk-yHlj7xPFBEtCO1zC8eNgmudTkIdr54vE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
