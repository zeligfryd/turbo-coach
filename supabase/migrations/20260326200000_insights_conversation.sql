-- Add system conversation support and unread tracking to coach_conversations
ALTER TABLE coach_conversations
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0;

-- Function to atomically append a message and increment unread count
CREATE OR REPLACE FUNCTION append_insight_message(
  p_conversation_id uuid,
  p_user_id uuid,
  p_message jsonb
) RETURNS void AS $$
BEGIN
  UPDATE coach_conversations
  SET
    messages = COALESCE(messages, '[]'::jsonb) || jsonb_build_array(p_message),
    unread_count = unread_count + 1,
    updated_at = now()
  WHERE id = p_conversation_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
