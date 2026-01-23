-- Seed file for local development
-- Creates a test user with credentials:
-- Email: test@example.com
-- Password: password123

-- Insert test user into auth.users
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role,
  aud,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
  '00000000-0000-0000-0000-000000000000',
  'test@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false,
  'authenticated',
  'authenticated',
  '',
  '',
  '',
  ''
);

-- Insert test user identity
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
  format('{"sub":"%s","email":"%s"}', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::text, 'test@example.com')::jsonb,
  'email',
  now(),
  now(),
  now()
);

-- Update the user profile with test FTP and weight values
-- (The profile row is auto-created by the trigger in the migration)
UPDATE public.users
SET 
  ftp = 250,
  weight = 75.0,
  updated_at = now()
WHERE id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid;
