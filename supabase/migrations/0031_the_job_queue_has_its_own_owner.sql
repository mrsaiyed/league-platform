-- 0031: the job queue has its own owner (step 2.112, record 053, T-257, T-490).
--
-- pg-boss keeps its own tables in the schema `pgboss`. The release makes that schema
-- here, empty, owned by the role queue_owner, which has no login and no powers, and
-- open to nobody else. pg-boss makes and upgrades its tables there when the worker
-- starts. The worker's login is granted queue_owner and app_user, the website's login
-- app_user only, so the website can never read or change a queued job. This migration
-- grants queue_owner to no login: that is a step of setting up a hosted database, done
-- by hand (step 2.95's procedures).
--
-- It runs where the migrations' user is not a superuser (Supabase's `postgres`): giving
-- a schema to another role needs the right to SET ROLE to it, so the migrations' user
-- grants itself queue_owner for this file only, with SET and without INHERIT (it gets
-- none of queue_owner's rights by being a member), does the work and revokes its own
-- membership. It can run again without error.

-- A role belongs to the whole server, so it may already exist. One with a login or a
-- power stops the migration (naming such an attribute to take it away needs powers the
-- migrations' user may not have), as does one that is a member of another role.
do $$
declare
  existing pg_catalog.pg_roles%rowtype;
begin
  select * into existing from pg_catalog.pg_roles where rolname = 'queue_owner';
  if not found then
    create role queue_owner with nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
    return;
  end if;
  if existing.rolcanlogin or existing.rolsuper or existing.rolcreatedb
    or existing.rolcreaterole or existing.rolreplication or existing.rolbypassrls then
    raise exception 'the role queue_owner exists with a login or a power: alter role queue_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls';
  end if;
  if exists (select 1 from pg_catalog.pg_auth_members m where m.member = existing.oid) then
    raise exception 'the role queue_owner is a member of another role, so it could act as that role: revoke that role from queue_owner';
  end if;
end $$;

grant queue_owner to current_user with set true, inherit false;

create schema if not exists pgboss authorization queue_owner;

-- Revoked as the schema's owner, which holds every right on it (a member without
-- INHERIT holds none of them, and a revoke without the right is only a warning). Then
-- back to the role that runs the migrations, by name (set_config of 'role' is SET ROLE):
-- RESET ROLE would go back to the session's own role, which need not be the one that
-- granted itself queue_owner above.
do $$
declare
  migrator text := current_user;
begin
  set role queue_owner;
  revoke all on schema pgboss from public;
  perform pg_catalog.set_config('role', migrator, false);
end $$;

revoke queue_owner from current_user;
