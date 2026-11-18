-- Custom SQL migration file, put your code below! --
CREATE FUNCTION review_event_reject_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'review_event is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_event_no_update
BEFORE UPDATE ON review_event
FOR EACH ROW EXECUTE FUNCTION review_event_reject_update();