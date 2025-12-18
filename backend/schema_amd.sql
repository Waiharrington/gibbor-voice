-- Function to fetch and lock leads atomically (Prevents double dialing)
-- Usage: SELECT * FROM get_next_leads('campaign_uuid', 3);

CREATE OR REPLACE FUNCTION get_next_leads(p_campaign_id UUID, p_limit INT)
RETURNS SETOF leads AS $$
DECLARE
  v_lead_ids UUID[];
BEGIN
  -- 1. Lock rows using FOR UPDATE SKIP LOCKED (Postgres feature for queues)
  -- This skips rows already locked by another transaction
  UPDATE leads
  SET status = 'dialing', last_call_at = NOW()
  WHERE id IN (
    SELECT id
    FROM leads
    WHERE campaign_id = p_campaign_id AND status = 'pending'
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id INTO v_lead_ids;

  -- 2. Return the updated rows
  RETURN QUERY SELECT * FROM leads WHERE id = ANY(v_lead_ids);
END;
$$ LANGUAGE plpgsql;
