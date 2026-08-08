-- =====================================================================
-- EVRute :: 0019 — Demo accounts, seeded correctly
-- =====================================================================
-- BUG THIS FIXES
-- The demo users were originally created with a plain INSERT into
-- auth.users that set only the obvious columns. Every sign-in then failed
-- with a 500 and the browser showed "Database error querying schema".
--
-- The real error, from the GoTrue logs:
--
--   error finding user: sql: Scan error on column index 3,
--   name "confirmation_token": converting NULL to string is unsupported
--
-- GoTrue scans a set of token columns into Go `string`, not `*string`. A
-- NULL in any of them is unrepresentable, so the user row cannot be read at
-- all and authentication fails before any password check. The Auth API sets
-- these to empty strings on signup; a raw INSERT leaves them NULL.
--
-- The columns that must be '' rather than NULL:
--   confirmation_token, recovery_token, email_change_token_new,
--   email_change, email_change_token_current, phone_change,
--   phone_change_token, reauthentication_token
--
-- PREFER THE AUTH API. `supabase.auth.admin.createUser()` gets all of this
-- right and is the supported path. This function exists only so a fresh
-- database (CI, a new branch, a local reset) comes up with working demo
-- logins in one migration, with no external call.
-- =====================================================================

create or replace function evr.seed_auth_user(
  p_email    text,
  p_password text,
  p_role     public.app_role,
  p_name     text
)
returns uuid
language plpgsql
security definer
set search_path = auth, public, evr, extensions
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if found then
    return v_id;
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    -- Not optional. NULL in any of these makes the row unreadable by GoTrue
    -- and breaks sign-in for this user permanently.
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token,
    reauthentication_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                       'role', p_role::text),
    jsonb_build_object('full_name', p_name),
    now(), now(),
    '', '', '', '', '', '', '', ''
  );

  -- An identity row is what makes the account usable by the email provider;
  -- without it GoTrue treats the user as having no way to sign in.
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data, last_sign_in_at,
    created_at, updated_at
  )
  values (
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true,
                       'phone_verified', false),
    now(), now(), now()
  )
  on conflict do nothing;

  return v_id;
end;
$$;

revoke execute on function evr.seed_auth_user(text, text, public.app_role, text)
  from public, anon, authenticated;

-- Repair any user already created the wrong way. Idempotent.
update auth.users
set confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change               = coalesce(email_change, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change               = coalesce(phone_change, ''),
    phone_change_token         = coalesce(phone_change_token, ''),
    reauthentication_token     = coalesce(reauthentication_token, '')
where confirmation_token is null
   or recovery_token is null
   or email_change_token_new is null
   or email_change is null
   or email_change_token_current is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null;

-- Demo accounts. ROTATE OR DELETE THESE BEFORE THE PROJECT IS PUBLIC —
-- they are three known-password logins, one of them an administrator.
select evr.seed_auth_user('demo.customer@evrute.in', 'Passw0rd!23', 'customer', 'Ananya Rao');
select evr.seed_auth_user('demo.owner@evrute.in',    'Passw0rd!23', 'owner',    'Vikram Shetty');
select evr.seed_auth_user('demo.admin@evrute.in',    'Passw0rd!23', 'admin',    'EVRute Admin');

-- Backfill identities for users seeded before this migration existed.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email,
                          'email_verified', true, 'phone_verified', false),
       now(), now(), now()
from auth.users u
where u.email is not null
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );
