import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/primitives/Button";
import type { BillingReconciliationFinding } from "@/domain/billing/billing.types";

type ReconciliationFindingsPanelProps = {
  title: string;
  findings: BillingReconciliationFinding[];
  onAcknowledge?: (findingId: string) => void;
  acknowledgingId?: string | null;
  emptyLabel: string;
};

function severityVariant(severity: string) {
  if (severity === "critical") return "destructive" as const;
  if (severity === "warning") return "warning" as const;
  return "default" as const;
}

export function ReconciliationFindingsPanel({
  title,
  findings,
  onAcknowledge,
  acknowledgingId,
  emptyLabel,
}: ReconciliationFindingsPanelProps) {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <StatusBadge variant={findings.length > 0 ? "warning" : "success"} dot>
          {findings.length}
        </StatusBadge>
      </div>
      {findings.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {findings.map((finding) => (
            <li key={finding.id} className="rounded-lg border p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={severityVariant(finding.severity)}>{finding.severity}</StatusBadge>
                <span className="font-medium text-foreground">{finding.finding_code}</span>
                <span className="text-muted-foreground">{new Date(finding.detected_at).toLocaleString()}</span>
              </div>
              {finding.evidence?.message ? (
                <p className="text-muted-foreground">{String(finding.evidence.message)}</p>
              ) : null}
              {onAcknowledge && finding.status === "OPEN" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acknowledgingId === finding.id}
                  onClick={() => onAcknowledge(finding.id)}
                >
                  Acknowledge
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
