"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

type DataTableProps<T> = {
  columns: {
    key: string;
    label: string;
    render: (item: T) => React.ReactNode;
    className?: string;
    sortable?: boolean;
    mobileHidden?: boolean;
  }[];
  data: T[];
  emptyLabel?: string;
  getRowKey?: (item: T) => React.Key;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string, dir: "asc" | "desc") => void;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  desktopLayout?: "auto" | "fixed";
};

export function DataTable<T>({ columns, data, desktopLayout = "auto", emptyLabel = "Sin registros", getRowKey, sort, onSort, pagination }: DataTableProps<T>) {
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;
  useEffect(() => {
    if (pagination && pagination.page > pageCount) pagination.onPageChange(pageCount);
  }, [pageCount, pagination]);
  return (
    <div className="overflow-hidden border-y border-app-border bg-transparent">
      <div className="divide-y divide-app-border md:hidden">
        {data.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-app-muted">{emptyLabel}</p>
        ) : data.map((item, index) => (
          <article className="grid gap-3 px-4 py-5" key={getRowKey ? getRowKey(item) : index}>
            {columns.filter((column) => !column.mobileHidden).map((column) => (
              <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-4" key={column.key}>
                <p className="pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">{column.label}</p>
                <div className={cn("min-w-0 break-words text-right text-sm text-app-text", column.className)}>{column.render(item)}</div>
              </div>
            ))}
          </article>
        ))}
      </div>
      <div className={cn("hidden md:block", desktopLayout === "auto" ? "overflow-x-auto" : "overflow-x-hidden")}>
        <table className={cn("w-full border-collapse text-left text-sm", desktopLayout === "auto" ? "min-w-[680px]" : "table-fixed")}>
          <thead className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={cn("px-4 py-4", column.mobileHidden && "hidden lg:table-cell", column.className)}>
                  {column.sortable && onSort ? (
                    <button
                      aria-label={`Ordenar por ${column.label}`}
                      className="inline-flex items-center gap-2 transition hover:text-app-text"
                      onClick={() => onSort(column.key, sort?.key === column.key && sort.dir === "desc" ? "asc" : "desc")}
                      type="button"
                    >
                      {column.label}
                      <span aria-hidden="true">{sort?.key === column.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                    </button>
                  ) : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-app-muted" colSpan={columns.length}>
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr key={getRowKey ? getRowKey(item) : index} className="border-t border-app-border transition hover:bg-white/60">
                  {columns.map((column) => (
                    <td key={column.key} className={cn("px-4 py-4 align-middle text-app-text", column.mobileHidden && "hidden lg:table-cell", column.className)}>
                      {column.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination ? (
        <div className="flex flex-col gap-3 border-t border-app-border px-4 py-3 text-xs text-app-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            {pagination.total === 0 ? "0 registros" : `${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} de ${pagination.total}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              className="min-h-11 rounded-lg border border-app-border bg-white px-3 py-2 font-medium text-app-text disabled:cursor-not-allowed disabled:opacity-40"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              type="button"
            >
              Anterior
            </button>
            <span>Página {pagination.page} de {pageCount}</span>
            <button
              className="min-h-11 rounded-lg border border-app-border bg-white px-3 py-2 font-medium text-app-text disabled:cursor-not-allowed disabled:opacity-40"
              disabled={pagination.page >= pageCount}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              type="button"
            >
              Siguiente
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
