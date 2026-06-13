-- RPC guards and RLS policies for pharmacist / lab_technician roles.

create or replace function public.assert_can_access_pharmacy()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'pharmacist'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform public.assert_tenant_feature_access('pharmacy');
end;
$$;

create or replace function public.assert_can_access_laboratory()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'lab_technician'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  perform public.assert_tenant_feature_access('laboratory');
end;
$$;

revoke all on function public.assert_can_access_laboratory() from public;
grant execute on function public.assert_can_access_laboratory() to authenticated;

drop policy if exists "Clinic admins can manage medications" on public.medications;
create policy "Pharmacy operators can manage medications"
  on public.medications
  for all to authenticated
  using (
    tenant_id = public.get_user_tenant_id(auth.uid())
    and (
      public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
      or public.has_role(auth.uid(), 'pharmacist'::public.app_role)
      or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  with check (
    tenant_id = public.get_user_tenant_id(auth.uid())
    and (
      public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
      or public.has_role(auth.uid(), 'pharmacist'::public.app_role)
      or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

drop policy if exists "Clinic admins can create lab orders" on public.lab_orders;
drop policy if exists "Clinic admins can update lab orders" on public.lab_orders;

create policy "Lab operators can create lab orders"
  on public.lab_orders
  for insert to authenticated
  with check (
    tenant_id = public.get_user_tenant_id(auth.uid())
    and (
      public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
      or public.has_role(auth.uid(), 'lab_technician'::public.app_role)
      or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

create policy "Lab operators can update lab orders"
  on public.lab_orders
  for update to authenticated
  using (
    tenant_id = public.get_user_tenant_id(auth.uid())
    and (
      public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
      or public.has_role(auth.uid(), 'lab_technician'::public.app_role)
      or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  with check (
    tenant_id = public.get_user_tenant_id(auth.uid())
    and (
      public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
      or public.has_role(auth.uid(), 'lab_technician'::public.app_role)
      or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

drop policy if exists "Tenant users can manage appointment queue" on public.appointment_queue;
create policy "Tenant users can manage appointment queue"
  on public.appointment_queue
  for all to authenticated
  using (tenant_id = public.get_user_tenant_id(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id(auth.uid()));
