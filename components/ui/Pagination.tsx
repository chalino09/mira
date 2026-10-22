"use client";

import { paginationWindow } from "@/lib/pagination";

export function Pagination({ label, page, pageSize, total, onPageChange }: {
  label: string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const window = paginationWindow(total, page, pageSize);
  return (
    <nav aria-label={`Páginas de ${label}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border py-3 text-xs text-app-muted">
      <p aria-live="polite" role="status">
        {total ? `${window.offset + 1}–${window.end} de ${total}` : "0 registros"} · Página {window.page} de {window.pageCount}
      </p>
      <div className="flex gap-2">
        <button aria-label={`Página anterior de ${label}`} className="min-h-11 rounded-lg border border-app-border bg-white px-3 font-medium text-app-text disabled:cursor-not-allowed disabled:opacity-40" disabled={window.page <= 1} onClick={() => onPageChange(window.page - 1)} type="button">Anterior</button>
        <button aria-label={`Página siguiente de ${label}`} className="min-h-11 rounded-lg border border-app-border bg-white px-3 font-medium text-app-text disabled:cursor-not-allowed disabled:opacity-40" disabled={window.page >= window.pageCount} onClick={() => onPageChange(window.page + 1)} type="button">Siguiente</button>
      </div>
    </nav>
  );
}
