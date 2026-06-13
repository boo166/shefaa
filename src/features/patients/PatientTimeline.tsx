import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/core/i18n/i18nStore";
import { formatDate } from "@/shared/utils/formatDate";
import { patientTimelineService, type PatientTimelineEventKind } from "@/services/patients/patientTimeline.service";
import {
  CalendarDays, CheckCircle2, Phone, Stethoscope, FlaskConical,
  Receipt, Wallet, RotateCcw, Pill, XCircle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PatientTimelineProps = {
  patientId: string;
  tenantId?: string;
};

const kindIcon: Record<PatientTimelineEventKind, typeof CalendarDays> = {
  appointment_scheduled: CalendarDays,
  appointment_checked_in: CheckCircle2,
  appointment_called: Phone,
  appointment_in_service: Stethoscope,
  appointment_completed: CheckCircle2,
  appointment_no_show: XCircle,
  lab_ordered: FlaskConical,
  lab_completed: FlaskConical,
  invoice_created: Receipt,
  payment_received: Wallet,
  refund_issued: RotateCcw,
  prescription_created: Pill,
};

const kindLabelKey: Record<PatientTimelineEventKind, string> = {
  appointment_scheduled: "patients.timeline.scheduled",
  appointment_checked_in: "patients.timeline.checkedIn",
  appointment_called: "patients.timeline.called",
  appointment_in_service: "patients.timeline.inService",
  appointment_completed: "patients.timeline.completed",
  appointment_no_show: "patients.timeline.noShow",
  lab_ordered: "patients.timeline.labOrdered",
  lab_completed: "patients.timeline.labCompleted",
  invoice_created: "patients.timeline.invoiceCreated",
  payment_received: "patients.timeline.paymentReceived",
  refund_issued: "patients.timeline.refundIssued",
  prescription_created: "patients.timeline.prescriptionCreated",
};

export function PatientTimeline({ patientId, tenantId }: PatientTimelineProps) {
  const { t, locale, calendarType } = useI18n(["patients"]);

  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: ["patientTimeline", tenantId, patientId],
    queryFn: () => patientTimelineService.listByPatient(patientId),
    enabled: !!patientId && !!tenantId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin me-2" />
        {t("patients.timeline.loading")}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {t("patients.timeline.loadError")}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        {t("patients.timeline.empty")}
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      <div className="absolute top-2 bottom-2 start-5 w-px bg-border" aria-hidden />
      {events.map((event, index) => {
        const Icon = kindIcon[event.kind];
        return (
          <div key={event.id} className={cn("relative flex gap-4 pb-6", index === 0 && "pt-1")}>
            <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-card">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                  {formatDate(event.at, locale, "time", calendarType)}
                </span>
                <span className="text-sm font-semibold">{t(kindLabelKey[event.kind])}</span>
              </div>
              {event.detail ? (
                <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
              ) : null}
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDate(event.at, locale, "date", calendarType)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
