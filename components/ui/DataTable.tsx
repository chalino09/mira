import { cn } from "@/lib/utils";

type DataTableProps<T> = {
  columns: {
    key: string;
    label: string;
    render: (item: T) => React.ReactNode;
    className?: string;
  }[];
  data: T[];
  emptyLabel?: string;
};

export function DataTable<T>({ columns, data, emptyLabel = "Sin registros" }: DataTableProps<T>) {
  return (
    <div className="overflow-hidden border-y border-app-border bg-transparent">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead className="text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={cn("px-4 py-4", column.className)}>
                  {column.label}
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
                <tr key={index} className="border-t border-app-border transition hover:bg-white/60">
                  {columns.map((column) => (
                    <td key={column.key} className={cn("px-4 py-4 align-middle text-app-text", column.className)}>
                      {column.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
