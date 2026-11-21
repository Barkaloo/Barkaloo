-- now() is fixed at transaction start: multiple submissions inside a transaction
-- received the same time and the latest-result view could pick an older answer.
-- Keep existing history intact; record the actual insertion time for new attempts.
alter table public.tutor_attempts alter column created_at set default clock_timestamp();
