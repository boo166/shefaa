import { StatCard } from "@/shared/components/StatCard";
import { Skull, BellOff, GitCompare, Archive } from "lucide-react";

type OpsAlertsPanelProps = {
  title: string;
  alerts: {
    deadLetters: number;
    failedDeliveries: number;
    queueDrift: number;
    retentionFindings: number;
  };
  labels: {
    deadLetters: string;
    failedDeliveries: string;
    queueDrift: string;
    retentionFindings: string;
  };
};

export function OpsAlertsPanel({ title, alerts, labels }: OpsAlertsPanelProps) {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard title={labels.deadLetters} value={alerts.deadLetters} icon={Skull} accent={alerts.deadLetters > 0 ? "destructive" : "primary"} className="shadow-none border" />
        <StatCard title={labels.failedDeliveries} value={alerts.failedDeliveries} icon={BellOff} accent={alerts.failedDeliveries > 0 ? "warning" : "primary"} className="shadow-none border" />
        <StatCard title={labels.queueDrift} value={alerts.queueDrift} icon={GitCompare} accent={alerts.queueDrift > 0 ? "warning" : "primary"} className="shadow-none border" />
        <StatCard title={labels.retentionFindings} value={alerts.retentionFindings} icon={Archive} accent={alerts.retentionFindings > 0 ? "warning" : "primary"} className="shadow-none border" />
      </div>
    </section>
  );
}
