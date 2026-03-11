-- Ensure storage buckets exist and are configured consistently (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-documents', 'patient-documents', false)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;
