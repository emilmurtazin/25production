import { apiFetch, setToken } from './client';
import type {
  User, Shop, Resource, CatalogOperation, Measurement, Product, Order, ScheduleResponse,
  Priority, Worker, WorkOrder, GenerateWorkOrdersResult, GenerateWorkOrdersRangeResult,
  ReassignWorkOrderItemResult, AnalyticsOverview,
} from './types';

// ---------- auth ----------
export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const result = await apiFetch<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { email, password } });
  setToken(result.token);
  return result;
}
export function logout() {
  setToken(null);
}
export function me(): Promise<User> {
  return apiFetch('/auth/me');
}
export function createUser(data: { email: string; password: string; name: string; role: User['role']; shopId?: string | null }): Promise<User> {
  return apiFetch('/auth/users', { method: 'POST', body: data });
}

// ---------- shops ----------
export function fetchShops(): Promise<Shop[]> {
  return apiFetch('/shops');
}
export function createShop(data: { name: string; workStart?: number; workEnd?: number; workDays?: number[] }): Promise<Shop> {
  return apiFetch('/shops', { method: 'POST', body: data });
}
export function updateShop(id: string, data: Partial<{ name: string; workStart: number; workEnd: number; workDays: number[] }>): Promise<Shop> {
  return apiFetch(`/shops/${id}`, { method: 'PATCH', body: data });
}
export function deleteShop(id: string): Promise<void> {
  return apiFetch(`/shops/${id}`, { method: 'DELETE' });
}

// ---------- resources ----------
export function fetchResources(shopId?: string): Promise<Resource[]> {
  return apiFetch(shopId ? `/resources?shopId=${shopId}` : '/resources');
}
export function createResource(data: { name: string; type: string; shopId: string; alwaysOn?: boolean }): Promise<Resource> {
  return apiFetch('/resources', { method: 'POST', body: data });
}
export function updateResource(id: string, data: Partial<{ name: string; type: string; shopId: string; alwaysOn: boolean }>): Promise<Resource> {
  return apiFetch(`/resources/${id}`, { method: 'PATCH', body: data });
}
export function deleteResource(id: string): Promise<void> {
  return apiFetch(`/resources/${id}`, { method: 'DELETE' });
}

// ---------- catalog ----------
export function fetchCatalog(): Promise<CatalogOperation[]> {
  return apiFetch('/catalog');
}
export function createCatalogOperation(data: { node: string; name: string; normMinutes: number; requiredGrade: number; resourceId: string }): Promise<CatalogOperation> {
  return apiFetch('/catalog', { method: 'POST', body: data });
}
export function updateCatalogOperation(id: string, data: Partial<{ node: string; name: string; normMinutes: number; requiredGrade: number; resourceId: string }>): Promise<CatalogOperation> {
  return apiFetch(`/catalog/${id}`, { method: 'PATCH', body: data });
}
export function deleteCatalogOperation(id: string): Promise<void> {
  return apiFetch(`/catalog/${id}`, { method: 'DELETE' });
}

// ---------- measurements ----------
export function createMeasurement(catalogOperationId: string, minutes: number): Promise<Measurement> {
  return apiFetch('/measurements', { method: 'POST', body: { catalogOperationId, minutes } });
}
export function deleteMeasurement(id: string): Promise<void> {
  return apiFetch(`/measurements/${id}`, { method: 'DELETE' });
}
export function applyAverageAsNorm(catalogOperationId: string): Promise<CatalogOperation> {
  return apiFetch(`/measurements/by-operation/${catalogOperationId}/apply-average`, { method: 'POST' });
}

// ---------- products (изделия) ----------
export function fetchProducts(): Promise<Product[]> {
  return apiFetch('/products');
}
export function createProduct(data: { name: string; items: { catalogOperationId: string; qty: number }[] }): Promise<Product> {
  return apiFetch('/products', { method: 'POST', body: data });
}
export function deleteProduct(id: string): Promise<void> {
  return apiFetch(`/products/${id}`, { method: 'DELETE' });
}

// ---------- orders (заказ = бывшие проект+заказ вместе) ----------
export function fetchOrders(): Promise<Order[]> {
  return apiFetch('/orders');
}
export function createOrder(data: {
  name?: string; client: string; deadlineDate: string; priority: Priority;
  products?: { productId: string; qty: number }[];
  items?: { catalogOperationId: string; qty: number }[];
}): Promise<Order> {
  return apiFetch('/orders', { method: 'POST', body: data });
}
export function updateOrder(id: string, data: Partial<{ name: string; client: string; deadlineDate: string; priority: Priority }>): Promise<Order> {
  return apiFetch(`/orders/${id}`, { method: 'PATCH', body: data });
}
export function createUrgentOrder(): Promise<Order> {
  return apiFetch('/orders/urgent-quick', { method: 'POST' });
}
export function deleteOrder(id: string): Promise<void> {
  return apiFetch(`/orders/${id}`, { method: 'DELETE' });
}
export function pinOperation(opId: string, pinnedStart: number, pinnedResourceId?: string): Promise<Order> {
  return apiFetch(`/orders/operations/${opId}/pin`, { method: 'PATCH', body: { pinnedStart, pinnedResourceId } });
}
export function unpinOperation(opId: string): Promise<Order> {
  return apiFetch(`/orders/operations/${opId}/pin`, { method: 'DELETE' });
}

// ---------- schedule ----------
export function fetchSchedule(): Promise<ScheduleResponse> {
  return apiFetch('/schedule');
}

// ---------- workers ----------
export function fetchWorkers(resourceId?: string): Promise<Worker[]> {
  return apiFetch(resourceId ? `/workers?resourceId=${resourceId}` : '/workers');
}
export function createWorker(data: { name: string; grade: number; resourceId: string }): Promise<Worker> {
  return apiFetch('/workers', { method: 'POST', body: data });
}
export function updateWorker(id: string, data: Partial<{ name: string; grade: number; active: boolean }>): Promise<Worker> {
  return apiFetch(`/workers/${id}`, { method: 'PATCH', body: data });
}
export function deleteWorker(id: string): Promise<void> {
  return apiFetch(`/workers/${id}`, { method: 'DELETE' });
}

// ---------- work orders (наряды) ----------
export function generateWorkOrders(dayOffset: number, resourceId?: string): Promise<GenerateWorkOrdersResult> {
  return apiFetch('/work-orders/generate', { method: 'POST', body: { dayOffset, resourceId } });
}
export function generateWorkOrdersRange(fromDayOffset: number, toDayOffset: number, resourceId?: string): Promise<GenerateWorkOrdersRangeResult> {
  return apiFetch('/work-orders/generate-range', { method: 'POST', body: { fromDayOffset, toDayOffset, resourceId } });
}
export function fetchWorkOrders(params: { dayOffset?: number; fromDayOffset?: number; toDayOffset?: number; workerId?: string; resourceId?: string } = {}): Promise<WorkOrder[]> {
  const qs = new URLSearchParams();
  if (params.dayOffset !== undefined) qs.set('dayOffset', String(params.dayOffset));
  if (params.fromDayOffset !== undefined) qs.set('fromDayOffset', String(params.fromDayOffset));
  if (params.toDayOffset !== undefined) qs.set('toDayOffset', String(params.toDayOffset));
  if (params.workerId) qs.set('workerId', params.workerId);
  if (params.resourceId) qs.set('resourceId', params.resourceId);
  const query = qs.toString();
  return apiFetch(`/work-orders${query ? `?${query}` : ''}`);
}
export function reportWorkOrderItem(itemId: string, hoursActual: number): Promise<WorkOrder['items'][number]> {
  return apiFetch(`/work-orders/items/${itemId}/report`, { method: 'POST', body: { hoursActual } });
}
export function reassignWorkOrderItem(itemId: string, data: { workerId?: string; hoursPlanned?: number }): Promise<ReassignWorkOrderItemResult> {
  return apiFetch(`/work-orders/items/${itemId}`, { method: 'PATCH', body: data });
}

// ---------- analytics ----------
export function fetchAnalyticsOverview(): Promise<AnalyticsOverview> {
  return apiFetch('/analytics/overview');
}
