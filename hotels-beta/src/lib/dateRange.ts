export type MonthGridCell = { iso: string; day: number } | null;

export type MonthGrid = {
  year: number;
  month: number;
  weeks: MonthGridCell[][];
};

export function parseIsoDateLocal(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function toIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysIso(value: string, days: number): string {
  const date = parseIsoDateLocal(value);
  if (!date) return value;
  date.setDate(date.getDate() + days);
  return toIsoDateLocal(date);
}

export function compareIso(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function mondayFirstWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function buildMonthGrid(monthDate: Date): MonthGrid {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = mondayFirstWeekday(firstOfMonth);

  const cells: MonthGridCell[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ iso: toIsoDateLocal(new Date(year, month, day)), day });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: MonthGridCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return { year, month, weeks };
}

export function monthLabel(monthDate: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(monthDate);
}

export function weekdayLabelsMondayFirst(): string[] {
  const formatter = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
  const mondayReference = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(mondayReference);
    date.setDate(mondayReference.getDate() + i);
    return formatter.format(date);
  });
}
