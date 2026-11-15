-- 0014: where a league plays (step 2.125, record 057, T-260).
--
-- P3 §1 step 2 asks a new league "Where": a city, beside the time zone. The leagues
-- table (0003) had the time zone and the contact email but no city, so the internal
-- tool that makes a league (P3 §8) and League settings → Profile had nowhere to keep
-- it. Empty until it is given, like the contact email; written as typed, with no
-- spaces around it.

alter table public.leagues add column city text;

alter table public.leagues add constraint leagues_city_length check (
  city is null or (city = btrim(city) and length(city) between 1 and 100)
);

comment on column public.leagues.city is
  'Where the league plays, as its organizer writes it (P3 §1 step 2). Empty until given.';
