-- Add pharmacist and lab_technician enum values.
-- Must be in a separate migration from policy usage (PostgreSQL enum safety).

alter type public.app_role add value if not exists 'pharmacist';
alter type public.app_role add value if not exists 'lab_technician';
