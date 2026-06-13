export type BillingStatus = "paid" | "pending" | "overdue" | "partially_paid" | "void" | "partially_refunded" | "refunded" | "written_off";
export type AppointmentStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";
export type InsuranceStatus = "draft" | "submitted" | "processing" | "approved" | "denied" | "reimbursed";
export type LabStatus = "pending" | "processing" | "completed";

const billingTransitions: Record<BillingStatus, BillingStatus[]> = {
  pending: ["overdue", "void", "written_off"],
  overdue: ["pending", "void", "written_off"],
  partially_paid: ["overdue", "void", "partially_refunded", "refunded", "written_off"],
  paid: ["partially_refunded", "refunded"],
  partially_refunded: ["refunded", "pending", "overdue", "partially_paid", "written_off"],
  refunded: [],
  written_off: [],
  void: [],
};

const appointmentTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: ["scheduled"],
  no_show: ["scheduled", "cancelled"],
};

const insuranceTransitions: Record<InsuranceStatus, InsuranceStatus[]> = {
  draft: ["submitted"],
  submitted: ["processing", "denied"],
  processing: ["approved", "denied"],
  approved: ["reimbursed"],
  denied: ["draft"],
  reimbursed: [],
};

const labTransitions: Record<LabStatus, LabStatus[]> = {
  pending: ["processing", "completed"],
  processing: ["completed"],
  completed: [],
};

function canTransition<T extends string>(map: Record<T, T[]>, current: T, next: T) {
  if (current === next) return true;
  return map[current]?.includes(next) ?? false;
}

export const statePolicies = {
  billing: {
    canTransition: (current: BillingStatus, next: BillingStatus) => canTransition(billingTransitions, current, next),
  },
  appointments: {
    canTransition: (current: AppointmentStatus, next: AppointmentStatus) => canTransition(appointmentTransitions, current, next),
  },
  insurance: {
    canTransition: (current: InsuranceStatus, next: InsuranceStatus) => canTransition(insuranceTransitions, current, next),
  },
  lab: {
    canTransition: (current: LabStatus, next: LabStatus) => canTransition(labTransitions, current, next),
  },
  pharmacy: {
    deriveStatusFromStock: (stock: number): "in_stock" | "low_stock" | "out_of_stock" => {
      if (stock <= 0) return "out_of_stock";
      if (stock < 50) return "low_stock";
      return "in_stock";
    },
  },
};
