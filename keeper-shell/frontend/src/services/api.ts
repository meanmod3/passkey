import { useAuthStore } from '../stores/auth.store';
import type {
  AuthMeResponse,
  LoginResponse,
  RecordDTO,
  RequestDTO,
  AuditEventDTO,
  NotificationDTO,
  UserDTO,
  CreateRequestInput,
  ApproveRequestInput,
  DenyRequestInput,
  ExtendRequestInput,
} from '@keeper-shell/shared';

// In dev Vite proxies /api → http://localhost:4000 (vite.config.ts).
// In prod set VITE_API_BASE and strip /api prefix accordingly.
const API_BASE = (import.meta.env.VITE_API_BASE ?? '') as string;

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = useAuthStore.getState();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401) {
    useAuthStore.getState().clearAuth();
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const msg = typeof body === 'object' && body && 'error' in body
      ? String((body as { error: unknown }).error)
      : res.statusText;
    throw new ApiError(res.status, msg, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  mockLogin: (userId: string) =>
    request<LoginResponse>('/api/auth/mock-login', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  me: () => request<AuthMeResponse>('/api/auth/me'),
  listUsers: () => request<{ users: UserDTO[] }>('/api/auth/users'),

  // Records
  listRecords: (params: { q?: string; environment?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.environment) qs.set('environment', params.environment);
    if (params.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<{ records: RecordDTO[] }>(`/api/records${suffix}`);
  },
  getRecord: (id: string) => request<{ record: RecordDTO & { history: RequestDTO[] } }>(`/api/records/${id}`),
  updateRecord: (id: string, patch: { ownerId?: string; status?: string; hideBorrower?: boolean }) =>
    request<{ record: RecordDTO }>(`/api/records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // Requests
  createRequest: (input: CreateRequestInput) =>
    request<{ request: RequestDTO }>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listRequests: (params: { status?: string; recordId?: string; requesterId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.recordId) qs.set('recordId', params.recordId);
    if (params.requesterId) qs.set('requesterId', params.requesterId);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<{ requests: RequestDTO[] }>(`/api/requests${suffix}`);
  },
  approveRequest: (id: string, input: ApproveRequestInput = {}) =>
    request<{ request: RequestDTO }>(`/api/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  denyRequest: (id: string, input: DenyRequestInput = {}) =>
    request<{ request: RequestDTO }>(`/api/requests/${id}/deny`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  releaseRequest: (id: string) =>
    request<{ request: RequestDTO }>(`/api/requests/${id}/release`, { method: 'POST' }),
  extendRequest: (id: string, input: ExtendRequestInput) =>
    request<{ request: RequestDTO }>(`/api/requests/${id}/extend`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  // Audit
  listAudit: (params: { action?: string; recordId?: string; requestId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.action) qs.set('action', params.action);
    if (params.recordId) qs.set('recordId', params.recordId);
    if (params.requestId) qs.set('requestId', params.requestId);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<{ events: AuditEventDTO[] }>(`/api/audit${suffix}`);
  },

  // Notifications
  listNotifications: () => request<{ notifications: NotificationDTO[] }>('/api/notifications'),
  markNotificationRead: (id: string) =>
    request<{ updated: number }>(`/api/notifications/${id}/read`, { method: 'POST' }),
};
