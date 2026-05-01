export interface Plan {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string; // ISO string
  endTime?: string; // ISO string
  isCompleted: boolean;
  priority: 'low' | 'medium' | 'high';
  reminded: boolean;
  isFromCourse?: boolean;
}

export interface Course {
  id: string;
  name: string;
  teacher?: string;
  location?: string;
  dayOfWeek: number; // 1 (Mon) - 7 (Sun)
  startSection: number;
  endSection: number;
  color?: string;
  weekType?: 'all' | 'odd' | 'even'; // all: 每周, odd: 单周, even: 双周
  weeks?: number[]; // 新增：保存具体的周数，如 [1, 2, 3, 4, 5]
}

export type ViewType = 'today' | 'calendar' | 'timetable' | 'settings';
