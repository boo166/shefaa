type CrossDomainReconPanelProps = {
  title: string;
  data: {
    billing: { finding_count: number; critical_count: number };
    patients: { finding_count: number; critical_count: number };
    notifications: { finding_count: number; critical_count: number };
    appointments: { finding_count: number; critical_count: number };
  };
  labels: {
    billing: string;
    patients: string;
    notifications: string;
    appointments: string;
    findings: string;
    critical: string;
  };
};

function ReconDomainCard({
  label,
  findingCount,
  criticalCount,
  findingsLabel,
  criticalLabel,
}: {
  label: string;
  findingCount: number;
  criticalCount: number;
  findingsLabel: string;
  criticalLabel: string;
}) {
  return (
    <div className="rounded-lg border p-3 text-xs space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground">{findingsLabel}: {findingCount}</p>
      <p className={criticalCount > 0 ? "text-destructive" : "text-muted-foreground"}>
        {criticalLabel}: {criticalCount}
      </p>
    </div>
  );
}

export function CrossDomainReconPanel({ title, data, labels }: CrossDomainReconPanelProps) {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <ReconDomainCard label={labels.billing} findingCount={data.billing.finding_count} criticalCount={data.billing.critical_count} findingsLabel={labels.findings} criticalLabel={labels.critical} />
        <ReconDomainCard label={labels.patients} findingCount={data.patients.finding_count} criticalCount={data.patients.critical_count} findingsLabel={labels.findings} criticalLabel={labels.critical} />
        <ReconDomainCard label={labels.notifications} findingCount={data.notifications.finding_count} criticalCount={data.notifications.critical_count} findingsLabel={labels.findings} criticalLabel={labels.critical} />
        <ReconDomainCard label={labels.appointments} findingCount={data.appointments.finding_count} criticalCount={data.appointments.critical_count} findingsLabel={labels.findings} criticalLabel={labels.critical} />
      </div>
    </section>
  );
}
