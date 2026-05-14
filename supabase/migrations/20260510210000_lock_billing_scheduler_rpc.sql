revoke execute on function public.run_scheduled_billing_reconciliation(text, interval, integer, interval)
from PUBLIC;

revoke execute on function public.run_scheduled_billing_reconciliation(text, interval, integer, interval)
from anon;

revoke execute on function public.run_scheduled_billing_reconciliation(text, interval, integer, interval)
from authenticated;

revoke execute on function public.schedule_billing_reconciliation_jobs()
from PUBLIC;

revoke execute on function public.schedule_billing_reconciliation_jobs()
from anon;

revoke execute on function public.schedule_billing_reconciliation_jobs()
from authenticated;

grant execute on function public.run_scheduled_billing_reconciliation(text, interval, integer, interval)
to service_role;

grant execute on function public.schedule_billing_reconciliation_jobs()
to service_role;
