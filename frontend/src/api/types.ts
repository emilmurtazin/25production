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

export interface ModificationItem {
  id: string;
  modificationId: string;
  catalogOperationId: string;
  qty: number;
  catalogOperation: CatalogOperation;
}

export interface Modification {
  id: string;
  name: string;
  createdAt: string;
  items: ModificationItem[];
  totalHours: number;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  object: string;
  deadlineHours: number;
  createdAt: string;
  orders?: Order[];
}

export interface OrderOperation {
  id: string;
  orderId: string;
  name: string;
  durationHours: number;
  sequence: number;
  resourceId: string;
  pinnedStart: number | null;
  pinnedResourceId: string | null;
}

export interface Order {
  id: string;
  name: string;
  projectId: string;
  priority: Priority;
  createdById: string | null;
  createdAt: string;
  operations: OrderOperation[];
  project?: Project;
}

export interface ScheduleSegment { start: number; end: number; }

export interface ScheduledOperation {
  id: string;
  orderId: string;
  orderName: string;
  projectId: string;
  projectName: string;
  client: string;
  priority: Priority;
  deadlineHours: number;
  name: string;
  durationHours: number;
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
