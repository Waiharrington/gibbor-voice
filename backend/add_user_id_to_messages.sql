-- Add user_id column to messages table
ALTER TABLE public.messages
ADD COLUMN user_id UUID REFERENCES auth.users(id);
-- Optional: Index for performance
CREATE INDEX idx_messages_user_id ON public.messages(user_id);
-- Verify
-- SELECT * FROM messages LIMIT 1;