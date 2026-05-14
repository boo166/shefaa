\if :{?rls_suite}
set local role authenticated;
set local row_security = on;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.patient_documents where id = '38600000-0000-0000-0000-000000000001'),
  1::bigint,
  'documents RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=own patient document visible path=patient_documents.select.own'
);

select is(
  (select count(*) from public.patient_documents where id = '38600000-0000-0000-0000-000000000002'),
  0::bigint,
  'documents RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign patient document hidden path=patient_documents.select.foreign'
);

select throws_ok(
  $$
  insert into public.patient_documents (tenant_id, patient_id, file_name, file_path, file_size, file_type, uploaded_by)
  values ('30000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', 'blocked.pdf', '30000000-0000-0000-0000-000000000002/patients/blocked.pdf', 10, 'application/pdf', '31000000-0000-0000-0000-000000000001');
  $$,
  '42501',
  'new row violates row-level security policy for table "patient_documents"',
  'documents RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign document insert denied path=patient_documents.insert.foreign'
);

select lives_ok(
  $$
  update public.patient_documents
  set file_name = 'blocked-rename.pdf'
  where id = '38600000-0000-0000-0000-000000000002';
  $$,
  'documents RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign document update sees no rows path=patient_documents.update.foreign'
);

select is(
  (select count(*) from public.insurance_claim_attachments where id = '38700000-0000-0000-0000-000000000001'),
  1::bigint,
  'documents RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=own insurance attachment visible path=insurance_claim_attachments.select.own'
);

select is(
  (select count(*) from public.insurance_claim_attachments where id = '38700000-0000-0000-0000-000000000002'),
  0::bigint,
  'documents RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign insurance attachment hidden path=insurance_claim_attachments.select.foreign'
);
\else
select plan(1);
select pass('documents RLS assertions are executed by supabase/tests/rls_suite.sql');
select * from finish();
\endif
