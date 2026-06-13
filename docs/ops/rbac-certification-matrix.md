# RBAC Certification Matrix

Source of truth for role × domain × action certification. CI drift guards:
- `src/platform/authorization/__tests__/rbacMatrix.test.ts`
- `supabase/tests/rbac_certification_matrix.sql`

## Roles

| Role | Client key |
|------|------------|
| Super Admin | `super_admin` |
| Admin | `clinic_admin` |
| Doctor | `doctor` |
| Receptionist | `receptionist` |
| Nurse | `nurse` |
| Billing | `accountant` |
| Pharmacist | `pharmacist` |
| Lab Technician | `lab_technician` |

## Action mapping

| Action | Permission / guard |
|--------|-------------------|
| Read | `view_*` or domain read capability |
| Write | `manage_*` or command RPC guard |
| Delete | `clinic_admin` / `manage_clinic` |
| Approve | domain command (insurance submit, lab finalize) |
| Export | `view_reports` / `manage_clinic` |

## Matrix (allowed = Y)

### Patients

| Role | Read | Write | Delete | Approve | Export |
|------|------|-------|--------|---------|--------|
| super_admin | Y | Y | Y | - | Y |
| clinic_admin | Y | Y | Y | - | Y |
| doctor | Y | - | - | - | - |
| receptionist | Y | Y | - | - | - |
| nurse | Y | - | - | - | - |
| accountant | - | - | - | - | - |
| pharmacist | Y | - | - | - | - |
| lab_technician | Y | - | - | - | - |

### Appointments

| Role | Read | Write | Delete | Approve | Export |
|------|------|-------|--------|---------|--------|
| super_admin | Y | Y | Y | - | Y |
| clinic_admin | Y | Y | Y | - | Y |
| doctor | Y | Y | - | - | - |
| receptionist | Y | Y | - | - | - |
| nurse | Y | - | - | - | - |
| accountant | - | - | - | - | - |
| pharmacist | - | - | - | - | - |
| lab_technician | - | - | - | - | - |

### Billing

| Role | Read | Write | Delete | Approve | Export |
|------|------|-------|--------|---------|--------|
| super_admin | Y | Y | Y | Y | Y |
| clinic_admin | Y | Y | Y | Y | Y |
| accountant | Y | Y | - | Y | Y |
| others | - | - | - | - | - |

### Insurance

| Role | Read | Write | Delete | Approve | Export |
|------|------|-------|--------|---------|--------|
| super_admin | Y | Y | Y | Y | Y |
| clinic_admin | Y | Y | Y | Y | Y |
| accountant | Y | Y | - | - | Y |
| others | - | - | - | - | - |

### Inventory / Pharmacy

| Role | Read | Write | Delete | Approve | Export |
|------|------|-------|--------|---------|--------|
| super_admin | Y | Y | Y | - | Y |
| clinic_admin | Y | Y | Y | - | Y |
| pharmacist | Y | Y | - | - | - |
| others | - | - | - | - | - |

### Labs

| Role | Read | Write | Delete | Approve | Export |
|------|------|-------|--------|---------|--------|
| super_admin | Y | Y | Y | Y | Y |
| clinic_admin | Y | Y | Y | Y | Y |
| lab_technician | Y | Y | - | Y | - |
| doctor | Y* | - | - | - | - |

*Doctor may view medical records linked to lab orders via medical record permissions; lab write/finalize requires lab operator roles.

### Reports

| Role | Read | Export |
|------|------|--------|
| super_admin | Y | Y |
| clinic_admin | Y | Y |
| accountant | Y | Y |
| others | - | - |

### Settings

| Role | Read | Write | Delete |
|------|------|-------|--------|
| super_admin | Y | Y | Y |
| clinic_admin | Y | Y | - |
| others | - | - | - |

## Verification

```bash
npm test -- rbacMatrix
npm run test:db -- rbac_certification_matrix
```

Staging adversarial: `tests/staging-auth/rbac-adversarial.spec.ts`
