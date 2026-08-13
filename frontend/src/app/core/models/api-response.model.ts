import type { components } from './api.generated';

export interface ApiResponse<T = unknown> {
  status: 'success' | 'fail' | 'error';
  data?: T;
  message?: string;
}

// currentPage / limit / numberOfPages are always present; next/prev may be null
export interface Pagination
  extends Required<Omit<components['schemas']['Pagination'], 'next' | 'prev'>> {
  next?: number | null;
  prev?: number | null;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T> {
  count: number;
  pagination: Pagination;
}
