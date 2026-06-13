-- Atomically move a bottle to another slot, swapping with any occupant.
-- The wines_shelf_position_uniq index (0002) forbids two non-null rows from
-- sharing a slot and is non-deferrable, so a direct swap would violate it
-- mid-statement. Parking the source at (null, null) first keeps every step
-- collision-free, and wrapping it in one function = one transaction makes it
-- atomic: a mid-step failure can never strand a bottle out of the cabinet.
create or replace function public.move_bottle(
  p_src_id uuid,
  p_dst_shelf int,
  p_dst_position int
) returns void
language plpgsql
as $$
declare
  v_src_shelf int;
  v_src_position int;
  v_dst_id uuid;
begin
  -- Lock and read the source bottle's current slot.
  select shelf, position into v_src_shelf, v_src_position
  from public.wines
  where id = p_src_id
  for update;

  if not found then
    raise exception 'source bottle % not found', p_src_id;
  end if;
  if v_src_shelf is null or v_src_position is null then
    raise exception 'source bottle % is not in a slot', p_src_id;
  end if;

  -- Find the bottle (if any) currently in the destination slot.
  select id into v_dst_id
  from public.wines
  where shelf = p_dst_shelf and position = p_dst_position
  for update;

  -- Dropped onto its own slot: nothing to do.
  if v_dst_id is not null and v_dst_id = p_src_id then
    return;
  end if;

  -- 1) Park the source so neither slot collides during the move.
  update public.wines set shelf = null, position = null where id = p_src_id;

  -- 2) Swap: move the destination occupant into the source's old slot.
  if v_dst_id is not null then
    update public.wines
    set shelf = v_src_shelf, position = v_src_position
    where id = v_dst_id;
  end if;

  -- 3) Move the source into the (now empty) destination slot.
  update public.wines
  set shelf = p_dst_shelf, position = p_dst_position
  where id = p_src_id;
end;
$$;

grant execute on function public.move_bottle(uuid, int, int) to anon, authenticated;
