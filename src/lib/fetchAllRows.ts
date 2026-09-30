// The backend returns at most 1000 rows per request; page through so large lists are never cut off.
export async function fetchAllRows(build: () => any, pageSize = 1000): Promise<{ data: any[]; error: any }> {
  const all: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < pageSize) return { data: all, error: null };
  }
}
