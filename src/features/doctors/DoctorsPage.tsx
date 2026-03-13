import { useEffect, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { UserPlus, Star, Search, MoreVertical, Pencil, Trash2, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
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

const statusVariant: Record<string, "success" | "warning" | "default"> = { available: "success", busy: "warning", on_leave: "default" };

export const DoctorsPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
    enabled: !!user?.tenantId,
  });

  const doctors = doctorPage?.data ?? [];
  const totalDoctors = doctorPage?.count ?? 0;

  useEffect(() => { setPage(1); }, [searchTerm]);

  const total = totalDoctors;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total ? (page - 1) * pageSize + 1 : 0;
  const pageEnd = total ? Math.min(total, page * pageSize) : 0;

  const handleDelete = async () => {
    if (!deleteId) return;
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
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("doctors.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} doctors</p>
        </div>
        <PermissionGuard permission="manage_users">
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-1" />{t("doctors.addDoctor")}
          </Button>
        </PermissionGuard>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t("common.search")}
          className="w-full h-9 pl-9 pr-3 bg-card rounded-lg border text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                <div className="space-y-2 flex-1">
                  <div className="skeleton-line w-28" />
                  <div className="skeleton-line w-20 h-3" />
                </div>
              </div>
              <div className="skeleton-line w-full" />
            </div>
          ))}
        </div>
      ) : doctors.length === 0 ? (
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
            {doctors.map((doc) => (
              <div key={doc.id} className="bg-card rounded-xl border p-5 hover:shadow-md transition-all relative group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                      {doc.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{doc.full_name}</h3>
                      <p className="text-xs text-muted-foreground">{doc.specialty}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge variant={statusVariant[doc.status] ?? "default"} dot>
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
                          <div className="absolute end-0 top-full mt-1 bg-card rounded-lg border shadow-lg py-1 z-10 min-w-[140px]">
                            <button
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-start"
                              onClick={() => handleStatusChange(doc.id, doc.status === "available" ? "busy" : "available")}
                            >
                              <Pencil className="h-3 w-3" />
                              {t("doctors.toggleStatus")}
                            </button>
                            <button
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-start"
                              onClick={() => { setScheduleDoctor({ id: doc.id, name: doc.full_name }); setOpenMenu(null); }}
                            >
                              <CalendarClock className="h-3 w-3" />
                              {t("doctors.schedule")}
                            </button>
                            <button
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted text-destructive text-start"
                              onClick={() => { setDeleteId(doc.id); setOpenMenu(null); }}
                            >
                              <Trash2 className="h-3 w-3" />
                              {t("common.remove")}
                            </button>
                          </div>
                        )}
                      </div>
                    </PermissionGuard>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {doc.email && <p>{doc.email}</p>}
                  {doc.phone && <p className="tabular-nums">{doc.phone}</p>}
                </div>
                <div className="flex items-center justify-end text-xs mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-warning text-warning" />
                    <span className="font-medium">{doc.rating ?? "—"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{pageStart}–{pageEnd} of {total}</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 font-medium tabular-nums">{page} / {totalPages}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
                  <ChevronRight className="h-4 w-4" />
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
