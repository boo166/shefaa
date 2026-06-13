import { appointmentService } from "@/services/appointments/appointment.service";
import { appointmentQueueRepository } from "@/services/appointments/appointmentQueue.repository";
import { billingService } from "@/services/billing/billing.service";
import { labService } from "@/services/laboratory/lab.service";
import { prescriptionService } from "@/services/prescriptions/prescription.service";
import { getTenantContext } from "@/services/supabase/tenant";
import { toServiceError } from "@/services/supabase/errors";
import { platformRepository } from "@/platform/data/platformRepository";

export type PatientTimelineEventKind =
  | "appointment_scheduled"
  | "appointment_checked_in"
  | "appointment_called"
  | "appointment_in_service"
  | "appointment_completed"
  | "appointment_no_show"
  | "lab_ordered"
  | "lab_completed"
  | "invoice_created"
  | "payment_received"
  | "refund_issued"
  | "prescription_created";

export type PatientTimelineEvent = {
  id: string;
  at: string;
  kind: PatientTimelineEventKind;
  title: string;
  detail?: string | null;
  relatedId?: string | null;
};

function pushEvent(events: PatientTimelineEvent[], event: PatientTimelineEvent) {
  events.push(event);
}

export const patientTimelineService = {
  async listByPatient(patientId: string): Promise<PatientTimelineEvent[]> {
    try {
      const { tenantId } = getTenantContext();
      const events: PatientTimelineEvent[] = [];

      const [appointments, labs, invoices, prescriptions] = await Promise.all([
        appointmentService.listByPatient(patientId, { limit: 100 }),
        labService.listByPatient(patientId, { limit: 100 }),
        billingService.listByPatient(patientId, { limit: 100 }),
        prescriptionService.listByPatient(patientId, { limit: 100 }),
      ]);

      const queueRows = await Promise.all(
        appointments.map((appointment) =>
          appointmentQueueRepository.getByAppointmentId(appointment.id, tenantId).catch(() => null),
        ),
      );

      const invoiceIds = invoices.map((inv) => inv.id);
      let paymentRows: Array<{ id: string; amount: number; paid_at: string; invoice_id: string }> = [];
      let refundRows: Array<{ id: string; amount: number; refunded_at: string; invoice_id: string; reason: string | null }> = [];

      if (invoiceIds.length > 0) {
        const [paymentResult, refundResult] = await Promise.all([
          platformRepository
            .from("invoice_payments")
            .select("id, amount, paid_at, invoice_id")
            .eq("tenant_id", tenantId)
            .in("invoice_id", invoiceIds),
          platformRepository
            .from("invoice_refunds")
            .select("id, amount, refunded_at, invoice_id, reason")
            .eq("tenant_id", tenantId)
            .in("invoice_id", invoiceIds),
        ]);
        paymentRows = (paymentResult.data ?? []) as typeof paymentRows;
        refundRows = (refundResult.data ?? []) as typeof refundRows;
      }

      for (const appointment of appointments) {
        pushEvent(events, {
          id: `appt-${appointment.id}-scheduled`,
          at: appointment.appointment_date,
          kind: "appointment_scheduled",
          title: "Appointment scheduled",
          detail: appointment.type,
          relatedId: appointment.id,
        });

        if (appointment.status === "no_show") {
          pushEvent(events, {
            id: `appt-${appointment.id}-noshow`,
            at: appointment.updated_at ?? appointment.appointment_date,
            kind: "appointment_no_show",
            title: "No-show recorded",
            relatedId: appointment.id,
          });
        }
      }

      for (const queue of queueRows) {
        if (!queue) continue;
        pushEvent(events, {
          id: `queue-${queue.id}-checkin`,
          at: queue.check_in_at,
          kind: "appointment_checked_in",
          title: "Checked in",
          relatedId: queue.appointment_id,
        });
        if (queue.called_at) {
          pushEvent(events, {
            id: `queue-${queue.id}-called`,
            at: queue.called_at,
            kind: "appointment_called",
            title: "Called",
            relatedId: queue.appointment_id,
          });
        }
        if (queue.status === "in_service") {
          pushEvent(events, {
            id: `queue-${queue.id}-inservice`,
            at: queue.called_at ?? queue.check_in_at,
            kind: "appointment_in_service",
            title: "In service",
            relatedId: queue.appointment_id,
          });
        }
        if (queue.completed_at) {
          pushEvent(events, {
            id: `queue-${queue.id}-done`,
            at: queue.completed_at,
            kind: "appointment_completed",
            title: "Visit completed",
            relatedId: queue.appointment_id,
          });
        }
      }

      for (const lab of labs) {
        pushEvent(events, {
          id: `lab-${lab.id}-ordered`,
          at: lab.order_date,
          kind: "lab_ordered",
          title: "Lab ordered",
          detail: lab.test_name,
          relatedId: lab.id,
        });
        if (lab.status === "completed" && lab.resulted_at) {
          pushEvent(events, {
            id: `lab-${lab.id}-completed`,
            at: lab.resulted_at,
            kind: "lab_completed",
            title: "Lab result recorded",
            detail: lab.test_name,
            relatedId: lab.id,
          });
        }
      }

      for (const invoice of invoices) {
        pushEvent(events, {
          id: `invoice-${invoice.id}`,
          at: invoice.invoice_date,
          kind: "invoice_created",
          title: "Invoice created",
          detail: invoice.service_description ?? undefined,
          relatedId: invoice.id,
        });
      }

      for (const payment of paymentRows) {
        pushEvent(events, {
          id: `payment-${payment.id}`,
          at: payment.paid_at,
          kind: "payment_received",
          title: "Payment received",
          detail: `$${Number(payment.amount).toFixed(2)}`,
          relatedId: payment.invoice_id,
        });
      }

      for (const refund of refundRows) {
        pushEvent(events, {
          id: `refund-${refund.id}`,
          at: refund.refunded_at,
          kind: "refund_issued",
          title: "Refund issued",
          detail: refund.reason ?? `$${Number(refund.amount).toFixed(2)}`,
          relatedId: refund.invoice_id,
        });
      }

      for (const rx of prescriptions) {
        pushEvent(events, {
          id: `rx-${rx.id}`,
          at: rx.created_at,
          kind: "prescription_created",
          title: "Prescription created",
          detail: rx.medication_name,
          relatedId: rx.id,
        });
      }

      return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    } catch (err) {
      throw toServiceError(err, "Failed to load patient timeline");
    }
  },
};
