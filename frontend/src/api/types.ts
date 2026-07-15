export type Role = 'ADMIN' | 'DISPATCHER' | 'NORMIROVSHIK' | 'SHOP_MASTER';
export type Priority = 'NORMAL' | 'URGENT';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  shopId: string | null;
}

export interface ShopCalendarFields {
  workStart: number;
  workEnd: number;
  workDays: number[];
}

export interface Shop extends ShopCalendarFields {
  id: string;
  name: string;
  createdAt: string;
  resources?: Resource[];
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  alwaysOn: boolean;
  shopId: string;
  createdAt: string;
}

export interface Measurement {
  id: string;
  catalogOperationId: string;
  minutes: number;
  measuredById: string | null;
  createdAt: string;
}

export interface CatalogOperation {
  id: string;
  node: string;
  name: string;
  normMinutes: number;
  normHours: number;
  requiredGrade: number;
  resourceId: string;
  createdAt: string;
  updatedAt: string;
  measurements: Measurement[];
}

export interface Worker {
  id: string;
  name: string;
  grade: number;
  resourceId: string;
  active: boolean;
  createdAt: string;
}

// ---------- Изделия (бывшие "модификации") ----------
export interface ProductItem {
  id: string;
  productId: string;
  catalogOperationId: string;
  qty: number;
  catalogOperation: CatalogOperation;
}

export interface Product {
  id: string;
  name: string;
  createdAt: string;
  items: ProductItem[];
  totalHours: number;
}

// ---------- Заказы (проект и заказ объединены — client/срок хранятся прямо на заказе) ----------
export interface OrderOperation {
  id: string;
  orderId: string;
  name: string;
  durationHours: number;
  completedHours: number;
  sequence: number;
  resourceId: string;
  catalogOperationId: string | null;
  pinnedStart: number | null;
  pinnedResourceId: string | null;
}

export interface Order {
  id: string;
  name: string;
  client: string;
  deadlineDate: string; // 'YYYY-MM-DD'
  priority: Priority;
  createdById: string | null;
  createdAt: string;
  operations: OrderOperation[];
}

// ---------- Расписание ----------
export interface ScheduleSegment { start: number; end: number; }

export interface ScheduledOperation {
  id: string;
  orderId: string;
  orderName: string;
  client: string;
  priority: Priority;
  deadlineHours: number;
  name: string;
  durationHours: number;
  completedHours: number;
  remainingHours: number;
  catalogOperationId: string | null;
  requiredGrade: number;
  sequence: number;
  resourceId: string;
  effectiveResourceId: string;
  pinned: boolean;
  pinnedStart: number | null;
  pinnedResourceId: string | null;
  start: number;
  end: number;
  segments: ScheduleSegment[];
}

export interface ScheduleResponse {
  resources: (Resource & { shopName: string; calendar: ShopCalendarFields })[];
  shops: Shop[];
  operations: ScheduledOperation[];
}

// ---------- Наряды ----------
export interface WorkOrderItem {
  id: string;
  workOrderId: string;
  orderOperationId: string;
  hoursPlanned: number;
  hoursActual: number | null;
  reportedById: string | null;
  reportedAt: string | null;
  orderOperation: OrderOperation & { order: Order };
}

export interface WorkOrder {
  id: string;
  workerId: string;
  resourceId: string;
  dayOffset: number;
  date: string;
  createdAt: string;
  worker: Worker;
  resource: Resource;
  items: WorkOrderItem[];
}

export interface GenerateWorkOrdersResult {
  dayOffset: number;
  date: string;
  resources: Record<string, { workerCount: number; assignedHours: number; unassignedHours: number }>;
}

export interface GenerateWorkOrdersRangeResult {
  fromDayOffset: number;
  toDayOffset: number;
  days: Record<number, Record<string, { workerCount: number; assignedHours: number; unassignedHours: number }>>;
}

export interface ReassignWorkOrderItemResult extends WorkOrderItem {
  workOrder: WorkOrder;
  warning: string | null;
}

// ---------- Аналитика ----------
export interface AnalyticsOrder {
  id: string;
  name: string;
  client: string;
  deadlineDate: string;
  projectedCompletionHours: number | null;
  atRisk: boolean;
  overdueByHours: number;
  remainingOperations: number;
  remainingHours: number;
}

export interface AnalyticsShop {
  id: string;
  name: string;
  utilizationPercent: number;
  overloadedResources: number;
  totalResources: number;
  totalRemainingHours: number;
}

export interface AnalyticsResource {
  id: string;
  name: string;
  shopId: string;
  shopName: string;
  remainingHours: number;
  availableHours: number;
  utilizationPercent: number;
  overloaded: boolean;
}

export interface AnalyticsWorker {
  workerId: string;
  name: string;
  grade: number;
  plannedHours: number;
  actualHours: number;
  efficiencyPercent: number | null;
  reportRatePercent: number | null;
}

export interface AnalyticsOverview {
  generatedAt: string;
  windowHours: number;
  reportPeriod: { from: string; to: string };
  totals: {
    activeOrders: number;
    atRiskOrders: number;
    totalRemainingHours: number;
    overallCompletionPercent: number;
  };
  orders: AnalyticsOrder[];
  shops: AnalyticsShop[];
  resources: AnalyticsResource[];
  workers: AnalyticsWorker[];
}
