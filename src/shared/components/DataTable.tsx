import { ReactNode, useState, useMemo, useCallback } from "react";
import { Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/core/i18n/i18nStore";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "./TableSkeleton";
import { generatePDF } from "@/shared/utils/pdfGenerator";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  searchable?: boolean;
}

interface BulkAction<T> {
  label: string;
  icon?: ReactNode;
  variant?: "default" | "destructive" | "outline";
  action: (selectedIds: string[]) => Promise<void> | void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  filterSlot?: ReactNode;
  isLoading?: boolean;
  exportFileName?: string;
  pdfExport?: {
    title: string;
    subtitle?: string;
  };
  bulkActions?: BulkAction<T>[];
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  serverSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage,
  searchable = false,
  searchPlaceholder,
  filterSlot,
  isLoading = false,
  exportFileName,
  pdfExport,
  bulkActions,
  page,
  pageSize,
  total,
  onPageChange,
  serverSearch = false,
  searchValue,
  onSearchChange,
}: DataTableProps<T>) {
  const { t } = useI18n();
  const [localSearch, setLocalSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const noData = emptyMessage ?? t("common.noData");
  const search = serverSearch ? (searchValue ?? "") : localSearch;
  const isPaged = typeof total === "number" && typeof pageSize === "number" && !!onPageChange;
  const currentPage = page ?? 1;
  const totalPages = isPaged ? Math.max(1, Math.ceil((total ?? 0) / (pageSize ?? 1))) : 1;
  const pageStart = isPaged && total ? (currentPage - 1) * (pageSize ?? 1) + 1 : 0;
  const pageEnd = isPaged && total ? Math.min(total, currentPage * (pageSize ?? 1)) : 0;

  const filtered = useMemo(() => {
    if (serverSearch || !search || !searchable) return data;
    const q = search.toLowerCase();
    const searchCols = columns.filter((c) => c.searchable !== false);
    return data.filter((item) =>
      searchCols.some((col) => {
        const val = (item as any)[col.key];
        return val && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, searchable, columns, serverSearch]);

  const handleSearchChange = (value: string) => {
    if (serverSearch) {
      onSearchChange?.(value);
      return;
    }
    setLocalSearch(value);
  };

  const exportCsv = useCallback(() => {
    const headers = columns.filter((c) => c.key !== "actions").map((c) => c.header);
    const keys = columns.filter((c) => c.key !== "actions").map((c) => c.key);
    const rows = filtered.map((item) =>
      keys.map((k) => {
        const val = (item as any)[k];
        const str = val == null ? "" : String(val);
        return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      })
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFileName || "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, columns, exportFileName]);

  const exportPdfHandler = useCallback(() => {
    if (!pdfExport) return;
    const cols = columns
      .filter((c) => c.key !== "actions")
      .map((c) => ({ header: c.header, dataKey: c.key }));
    const rows = filtered.map((item) => {
      const row: any = {};
      cols.forEach((c) => {
        const val = (item as any)[c.dataKey];
        row[c.dataKey] = val == null ? "" : String(val);
      });
      return row;
    });
    generatePDF({
      title: pdfExport.title,
      subtitle: pdfExport.subtitle,
      columns: cols,
      data: rows,
      filename: `${exportFileName || "export"}-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  }, [filtered, columns, exportFileName, pdfExport]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((item) => keyExtractor(item))));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkAction = async (action: BulkAction<T>) => {
    setBulkLoading(true);
    try {
      await action.action(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setBulkLoading(false);
    }
  };

  const hasBulkActions = !!bulkActions?.length;
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {(searchable || filterSlot || hasBulkActions) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={searchPlaceholder ?? t("common.search")}
                className="w-full h-9 pl-9 pr-3 bg-card rounded-lg border text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow"
              />
            </div>
          )}
          {filterSlot}
          <div className="flex items-center gap-1.5 ms-auto">
            {hasBulkActions && someSelected && (
              <>
                <span className="text-xs text-muted-foreground mr-1">
                  {selectedIds.size} {t("common.selected")}
                </span>
                {bulkActions!.map((action, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant={action.variant ?? "outline"}
                    onClick={() => handleBulkAction(action)}
                    disabled={bulkLoading}
                    className="h-8"
                  >
                    {action.icon}
                    {action.label}
                  </Button>
                ))}
              </>
            )}
            {data.length > 0 && (
              <>
                <Button variant="ghost" size="sm" onClick={exportCsv} className="h-8 text-xs">
                  <Download className="h-3.5 w-3.5 mr-1" />
                  CSV
                </Button>
                {pdfExport && (
                  <Button variant="ghost" size="sm" onClick={exportPdfHandler} className="h-8 text-xs">
                    <Download className="h-3.5 w-3.5 mr-1" />
                    PDF
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                {hasBulkActions && (
                  <th className="w-10 px-4">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-border accent-primary cursor-pointer"
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th key={col.key}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length + (hasBulkActions ? 1 : 0)} className="p-0">
                    <TableSkeleton columns={columns.length} rows={5} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (hasBulkActions ? 1 : 0)} className="text-center py-12 text-muted-foreground text-sm">
                    {noData}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const id = keyExtractor(item);
                  return (
                    <tr
                      key={id}
                      className={selectedIds.has(id) ? "bg-primary/[0.03]" : ""}
                    >
                      {hasBulkActions && (
                        <td className="w-10 px-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(id)}
                            onChange={() => toggleSelect(id)}
                            className="rounded border-border accent-primary cursor-pointer"
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key}>
                          {col.render ? col.render(item) : (item as any)[col.key]}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {isPaged && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground border-t">
            <span>
              {pageStart}–{pageEnd} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 font-medium tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
