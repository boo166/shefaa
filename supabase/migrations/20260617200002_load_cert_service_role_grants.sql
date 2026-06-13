-- Allow operational load-cert scripts (service role) to execute inventory command RPCs.

grant execute on function public.command_medication_reserve(uuid, uuid, integer, uuid, uuid, timestamptz, text, text, uuid, text, text, text) to service_role;
grant execute on function public.command_medication_release(uuid, uuid, timestamptz, text, text, uuid, text, text, text) to service_role;
grant execute on function public.command_medication_dispense(uuid, uuid, uuid, uuid, integer, timestamptz, text, text, uuid, text, text, text) to service_role;
