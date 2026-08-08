-- =====================================================================
-- EVRute :: 0020d — Opening hours are optional for imported stations
-- =====================================================================
-- stations_hours_valid required is_24x7 OR (open_time AND close_time). That
-- is correct for an EVRute station: an owner publishing one must state its
-- hours. It is wrong for imported reference data, where hours are commonly
-- unknown — the only ways to satisfy it were to invent times or to claim
-- 24x7 falsely, both of which lie to the user.
-- =====================================================================

alter table public.stations drop constraint stations_hours_valid;

alter table public.stations
  add constraint stations_hours_valid check (
    (source <> 'evrute' and ((open_time is null) = (close_time is null)))
    or (source = 'evrute' and (is_24x7 or (open_time is not null and close_time is not null)))
  );

comment on constraint stations_hours_valid on public.stations is
  'EVRute stations must declare hours. Imported stations may leave them '
  'unknown (both null) rather than fabricate a 24x7 claim.';
