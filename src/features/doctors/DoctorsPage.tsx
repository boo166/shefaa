import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { UserPlus, Star, Search, MoreVertical, Pencil, Trash2, CalendarClock } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { AddDoctorModal } from "./AddDoctorModal";
import { DoctorScheduleModal } from "./DoctorScheduleModal";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { EmptyState } from "@/shared/components/EmptyState";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import type { Doctor } from "@/domain/doctor/doctor.types";
import { doctorService } from "@/services/doctors/doctor.service";
import { queryKeys } from "@/services/queryKeys";

const DEMO_DOCTORS: Doctor[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    tenant_id: "00000000-0000-0000-0000-000000000000",
    user_id: null,
    full_name: "Dr. Sarah Ahmed",
    specialty: "Cardiology",
    rating: 4.9,
    status: "available",
    email: "sarah@clinic.com",
    phone: "+966 50 111 2222",
    created_at: "2026-03-01T08:00:00Z",
    updated_at: "2026-03-01T08:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    tenant_id: "00000000-0000-0000-0000-000000000000",
    user_id: null,
    full_name: "Dr. John Smith",
    specialty: "Orthopedics",
    rating: 4.7,
    status: "busy",
    email: "john@clinic.com",
    phone: "+966 50 333 4444",
    created_at: "2026-03-02T08:00:00Z",
    updated_at: "2026-03-02T08:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    tenant_id: "00000000-0000-0000-0000-000000000000",
    user_id: null,
    full_name: "Dr. Layla Khalid",
    specialty: "Pediatrics",
    rating: 4.8,
    status: "available",
    email: "layla@clinic.com",
    phone: "+966 50 555 6666",
    created_at: "2026-03-03T08:00:00Z",
    updated_at: "2026-03-03T08:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    tenant_id: "00000000-0000-0000-0000-000000000000",
    user_id: null,
    full_name: "Dr. Omar Hassan",
    specialty: "Dermatology",
    rating: 4.6,
    status: "on_leave",
    email: "omar@clinic.com",
    phone: "+966 50 777 8888",
    created_at: "2026-03-04T08:00:00Z",
    updated_at: "2026-03-04T08:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    tenant_id: "00000000-0000-0000-0000-000000000000",
    user_id: null,
    full_name: "Dr. Amira Nasser",
    specialty: "Neurology",
    rating: 4.9,
    status: "available",
    email: "amira@clinic.com",
    phone: "+966 50 999 0000",
    created_at: "2026-03-05T08:00:00Z",
    updated_at: "2026-03-05T08:00:00Z",
  },
];

const statusVariant: Record<string, "success" | "warning" | "default"> = { available: "success", busy: "warning", on_leave: "default" };

export const DoctorsPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [scheduleDoctor, setScheduleDoctor] = useState<{ id: string; name: string } | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useRealtimeSubscription(["doctors"]);

  const { data: doctorPage, isLoading } = useQuery({
    queryKey: queryKeys.doctors.list({
      tenantId: user?.tenantId,
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
    }),
    queryFn: async () => doctorService.listPaged({
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
    }),
    enabled: !!user?.tenantId && !isDemo,
  });

  const doctors = isDemo ? DEMO_DOCTORS : (doctorPage?.data ?? []);
  const totalDoctors = isDemo ? DEMO_DOCTORS.length : (doctorPage?.count ?? 0);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  const demoFiltered = useMemo(() => {
    if (!isDemo) return doctors;
    const q = searchTerm.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) =>
      d.full_name.toLowerCase().includes(q) ||
      d.specialty.toLowerCase().includes(q) ||
      (d.email ?? "").toLowerCase().includes(q) ||
      (d.phone ?? "").toLowerCase().includes(q)
    );
  }, [doctors, isDemo, searchTerm]);

  const pagedDoctors = isDemo ? demoFiltered.slice((page - 1) * pageSize, page * pageSize) : doctors;
  const total = isDemo ? demoFiltered.length : totalDoctors;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total ? (page - 1) * pageSize + 1 : 0;
  const pageEnd = total ? Math.min(total, page * pageSize) : 0;

  const handleDelete = async () => {
    if (!deleteId || isDemo) return;
    setDeleting(true);
    try {
      await doctorService.remove(deleteId);
      toast({ title: t("doctors.doctorRemoved") });
      queryClient.invalidateQueries({ queryKey: queryKeys.doctors.root(user?.tenantId) });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (isDemo) return;
    try {
      await doctorService.update(id, { status: newStatus as Doctor["status"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.doctors.root(user?.tenantId) });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setOpenMenu(null);
    }
  };

  const getDoctorStatusLabel = (status: string) => {
    if (status === "available") return t("doctors.available");
    if (status === "busy") return t("doctors.busy");
    if (status === "on_leave") return t("doctors.onLeave");
    return status;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("doctors.title")}</h1>
        <PermissionGuard permission="manage_users">
          <Button onClick={() => setShowAddModal(true)}><UserPlus className="h-4 w-4" />{t("doctors.addDoctor")}</Button>
        </PermissionGuard>
      </div>

      <div className="flex items-center gap-2 bg-card rounded-lg border px-4 py-2 max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t("common.search")}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {!isDemo && isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          {t("common.loading")}
        </div>
      ) : pagedDoctors.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={t("doctors.noDoctorsFound")}
          description={t("doctors.addFirstDoctor")}
          actionLabel={t("doctors.addDoctor")}
          onAction={() => setShowAddModal(true)}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedDoctors.map((doc) => (
              <div key={doc.id} className="bg-card rounded-lg border p-5 hover:shadow-md transition-shadow relative group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                      {doc.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{doc.full_name}</h3>
                      <p className="text-sm text-muted-foreground">{doc.specialty}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge variant={statusVariant[doc.status] ?? "default"}>
                      {getDoctorStatusLabel(doc.status)}
                    </StatusBadge>
                    <PermissionGuard permission="manage_users">
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenu(openMenu === doc.id ? null : doc.id)}
                          className="p-1 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>
                        {openMenu === doc.id && (
                          <div className="absolute end-0 top-full mt-1 bg-card rounded-md border shadow-lg py-1 z-10 min-w-[140px]">
                            <button
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-start"
                              onClick={() => handleStatusChange(doc.id, doc.status === "available" ? "busy" : "available")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {t("doctors.toggleStatus")}
                            </button>
                            <button
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-start"
                              onClick={() => { setScheduleDoctor({ id: doc.id, name: doc.full_name }); setOpenMenu(null); }}
                            >
                              <CalendarClock className="h-3.5 w-3.5" />
                              {t("doctors.schedule")}
                            </button>
                            <button
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-destructive text-start"
                              onClick={() => { setDeleteId(doc.id); setOpenMenu(null); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t("common.remove")}
                            </button>
                          </div>
                        )}
                      </div>
                    </PermissionGuard>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  {doc.email && <p>{doc.email}</p>}
                  {doc.phone && <p>{doc.phone}</p>}
                </div>
                <div className="flex items-center justify-end text-sm mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                    <span className="font-medium">{doc.rating ?? "â€”"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground border rounded-lg bg-card">
              <span>
                {t("common.showing")} {pageStart}-{pageEnd} {t("common.of")} {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                >
                  {t("common.previous")}
                </Button>
                <span>
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <AddDoctorModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: queryKeys.doctors.root(user?.tenantId) })}
      />

      <ConfirmDialog
        open={!!deleteId}
        title={t("doctors.removeDoctorTitle")}
        message={t("doctors.removeDoctorMessage")}
        confirmLabel={t("common.remove")}
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      {scheduleDoctor && (
        <DoctorScheduleModal
          open={!!scheduleDoctor}
          onClose={() => setScheduleDoctor(null)}
          doctorId={scheduleDoctor.id}
          doctorName={scheduleDoctor.name}
        />
      )}
    </div>
  );
};
