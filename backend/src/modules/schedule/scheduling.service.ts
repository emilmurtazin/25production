// ============================================================
// Алгоритм пересчёта графика — прямой перенос логики из HTML-прототипа.
// Ничего не хранится в БД в вычисленном виде: schedule считается заново по каждому запросу
// из текущего состояния заказов + календарей цехов. Это гарантирует, что график всегда
// соответствует последним изменениям (новый срочный заказ, правка нормы, перенос ресурса и т.д.)
// ============================================================

export interface ShopCalendar {
  workStart: number;
  workEnd: number;
  workDays: number[]; // 0=Вс..6=Сб
}

export interface ResourceInput {
  id: string;
  name: string;
  type: string;
  alwaysOn: boolean;
  shopId: string;
  shopName: string;
  calendar: ShopCalendar;
}

export interface OrderOperationInput {
  id: string;
  orderId: string;
  orderName: string;
  client: string;
  priority: 'NORMAL' | 'URGENT';
  deadlineHours: number; // вычисляется из реальной deadlineDate заказа на момент запроса
  orderCreatedAt: number; // timestamp (мс) — тай-брейкер сортировки внутри одного приоритета/срока
  name: string;
  durationHours: number; // полная норма (для отображения)
  completedHours: number; // сколько уже реально отработано по нарядам
  catalogOperationId: string | null;
  requiredGrade: number; // минимальный разряд рабочего для этой операции
  sequence: number;
  resourceId: string;
  pinnedStart: number | null;
  pinnedResourceId: string | null;
}

export interface ScheduleSegment { start: number; end: number; }

export interface ScheduledOperation extends OrderOperationInput {
  effectiveResourceId: string;
  pinned: boolean;
  remainingHours: number;
  start: number;
  end: number;
  segments: ScheduleSegment[];
}

const BASE_WEEKDAY = 1; // 0 часов графика = условный понедельник, 00:00

export function weekdayOfCalHour(calHour: number): number {
  const dayIndex = Math.floor(calHour / 24);
  return (((BASE_WEEKDAY + dayIndex) % 7) + 7) % 7;
}

export function isWorkingHour(calHour: number, resource: Pick<ResourceInput, 'alwaysOn' | 'calendar'>): boolean {
  if (resource.alwaysOn) return true;
  const hourOfDay = ((calHour % 24) + 24) % 24;
  if (!resource.calendar.workDays.includes(weekdayOfCalHour(calHour))) return false;
  return hourOfDay >= resource.calendar.workStart && hourOfDay < resource.calendar.workEnd;
}

export function nextWorkingHour(calHour: number, resource: Pick<ResourceInput, 'alwaysOn' | 'calendar'>): number {
  if (resource.alwaysOn) return calHour;
  let h = calHour;
  let guard = 0;
  while (!isWorkingHour(h, resource) && guard < 24 * 14) { h += 1; guard += 1; }
  return h;
}

// Продвигает "start" на duration часов ЧИСТОЙ рабочей нагрузки по календарю цеха этого ресурса,
// пропуская ночи/выходные. Возвращает конец и список непрерывных отрезков (разрывы = ночь/выходной).
export function addWorkingDuration(
  start: number,
  duration: number,
  resource: Pick<ResourceInput, 'alwaysOn' | 'calendar'>,
): { end: number; segments: ScheduleSegment[] } {
  if (resource.alwaysOn) {
    return { end: start + duration, segments: [{ start, end: start + duration }] };
  }
  let cur = nextWorkingHour(start, resource);
  let remaining = duration;
  const segments: ScheduleSegment[] = [];
  let guard = 0;
  while (remaining > 1e-9 && guard < 24 * 90) {
    guard += 1;
    const dayIndex = Math.floor(cur / 24);
    const blockEnd = dayIndex * 24 + resource.calendar.workEnd;
    const available = blockEnd - cur;
    if (available >= remaining - 1e-9) {
      const segEnd = cur + remaining;
      segments.push({ start: cur, end: segEnd });
      cur = segEnd;
      remaining = 0;
    } else {
      segments.push({ start: cur, end: blockEnd });
      remaining -= available;
      cur = nextWorkingHour(blockEnd, resource);
    }
  }
  return { end: cur, segments };
}

function findPinnedOverlap(segments: ScheduleSegment[], pinnedIntervals?: ScheduleSegment[]): ScheduleSegment | null {
  if (!pinnedIntervals) return null;
  for (const seg of segments) {
    for (const iv of pinnedIntervals) {
      if (seg.start < iv.end && seg.end > iv.start) return iv;
    }
  }
  return null;
}

export function computeSchedule(
  operations: OrderOperationInput[],
  resourcesById: Map<string, ResourceInput>,
): ScheduledOperation[] {
  const resourceCursor: Record<string, number> = {};
  const orderCursor: Record<string, number> = {};
  resourcesById.forEach((_, id) => { resourceCursor[id] = 0; });

  const withResource = operations
    .map((op) => {
      const effectiveResourceId = op.pinnedResourceId || op.resourceId;
      const remainingHours = Math.max(0, op.durationHours - (op.completedHours || 0));
      return { ...op, effectiveResourceId, remainingHours, pinned: op.pinnedStart != null };
    })
    // Полностью выполненные операции (остаток 0) в графике загрузки больше не занимают время —
    // они уже сделаны, их незачем планировать заново.
    .filter((op) => op.remainingHours > 1e-9 || op.pinned);

  const pinned = withResource.filter((o) => o.pinned);
  const free = withResource.filter((o) => !o.pinned);

  const pinnedByResource: Record<string, ScheduleSegment[]> = {};
  const scheduled: ScheduledOperation[] = [];

  pinned.forEach((op) => {
    const start = op.pinnedStart as number;
    // Закреплённая вручную операция всегда занимает ровно остаток — если её уже частично сделали,
    // блок на графике короче исходной нормы.
    const end = start + op.remainingHours;
    (pinnedByResource[op.effectiveResourceId] ??= []).push({ start, end });
    orderCursor[op.orderId] = Math.max(orderCursor[op.orderId] ?? 0, end);
    scheduled.push({ ...op, start, end, segments: [{ start, end }] });
  });

  free.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'URGENT' ? -1 : 1;
    if (a.deadlineHours !== b.deadlineHours) return a.deadlineHours - b.deadlineHours;
    if (a.orderId !== b.orderId) return a.orderCreatedAt - b.orderCreatedAt;
    return a.sequence - b.sequence;
  });

  free.forEach((op) => {
    if (orderCursor[op.orderId] === undefined) orderCursor[op.orderId] = 0;
    const resource = resourcesById.get(op.effectiveResourceId);
    if (!resource) return; // ресурс удалён — операция пропускается (защита от рассинхронизации данных)

    let candidate = Math.max(resourceCursor[op.effectiveResourceId] ?? 0, orderCursor[op.orderId]);
    let result = addWorkingDuration(candidate, op.remainingHours, resource);
    let guard = 0;
    while (guard < 20) {
      const conflict = findPinnedOverlap(result.segments, pinnedByResource[op.effectiveResourceId]);
      if (!conflict) break;
      candidate = conflict.end;
      result = addWorkingDuration(candidate, op.remainingHours, resource);
      guard += 1;
    }

    const start = result.segments[0].start;
    const { end } = result;
    resourceCursor[op.effectiveResourceId] = end;
    orderCursor[op.orderId] = end;
    scheduled.push({ ...op, start, end, segments: result.segments });
  });

  scheduled.sort((a, b) => a.start - b.start);
  return scheduled;
}
