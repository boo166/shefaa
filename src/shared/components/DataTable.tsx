import { ReactNode, useState, useMemo, useCallback } from "react";
import { Search, Download, Trash2, CheckSquare } from "lucide-react";
import { useI18n } from "@/core/i18n/i18nStore";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-4">
      {(searchable || filterSlot || hasBulkActions) && (
        <div className="flex flex-wrap items-center gap-3">
          {searchable && (
            <div className="flex items-center gap-2 bg-card rounded-lg border px-4 py-2 max-w-sm flex-1 min-w-[200px]">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={searchPlaceholder ?? t("common.search")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          {filterSlot}
          <div className="flex items-center gap-2 ms-auto">
            {hasBulkActions && someSelected && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} {t("common.selected")}
                </span>
                {bulkActions!.map((action, i) => (
                  <Button
                    key={i}
                    size="sm"
                    variant={action.variant ?? "outline"}
                    onClick={() => handleBulkAction(action)}
                    disabled={bulkLoading}
                  >
                    {action.icon}
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
            {data.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
                {pdfExport && (
                  <Button variant="outline" size="sm" onClick={exportPdfHandler}>
                    <Download className="h-4 w-4" />
                    PDF
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr className="bg-muted/50">
                {hasBulkActions && (
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="cursor-pointer accent-primary"
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
                  <td colSpan={columns.length + (hasBulkActions ? 1 : 0)} className="text-center py-8 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      {t("common.loading")}
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (hasBulkActions ? 1 : 0)} className="text-center py-8 text-muted-foreground">
                    {noData}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const id = keyExtractor(item);
                  return (
                    <tr
                      key={id}
                      className={`hover:bg-muted/30 transition-colors ${selectedIds.has(id) ? "bg-primary/5" : ""}`}
                    >
                      {hasBulkActions && (
                        <td className="w-10">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(id)}
                            onChange={() => toggleSelect(id)}
                            className="cursor-pointer accent-primary"
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
        {isPaged && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground border-t">
            <span>
              {t("common.showing")} {pageStart}-{pageEnd} {t("common.of")} {total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                {t("common.previous")}
              </Button>
              <span>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
