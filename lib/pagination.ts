type PageResponse<T> = { data: T[] | null; error: unknown; count: number | null };

// Fetch every batch before calculating totals; the visible page is independent.
export async function loadAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResponse<T>>,
  batchSize = 200
): Promise<PageResponse<T>> {
  const rows: T[] = [];
  while (true) {
    const response = await fetchPage(rows.length, rows.length + batchSize - 1);
    if (response.error) return { data: null, error: response.error, count: response.count };
    const batch = response.data ?? [];
    rows.push(...batch);
    if (!batch.length || (response.count !== null ? rows.length >= response.count : batch.length < batchSize)) {
      return { data: rows, error: null, count: response.count ?? rows.length };
    }
  }
}

export function paginationWindow(total: number, requestedPage: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const offset = (page - 1) * pageSize;
  return { page, pageCount, offset, end: Math.min(offset + pageSize, total), total };
}
