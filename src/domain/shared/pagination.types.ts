export interface PagedResult<T> {
  data: T[];
  count: number;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  filters?: Record<string, unknown>;
  sort?: { column: string; ascending?: boolean };
}
