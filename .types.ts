
export interface Habit {
  id: string;
  name: string;
  goal: number;
  completions: boolean[];
  color?: string; // Hex color for the habit
  category?: string; // Category group name
  categoryColor?: string; // Color for the category badge
}

export interface VoiceNote {
  id: string;
  url: string;
  timestamp: number;
}

export interface DashboardState {
  habits: Habit[];
  voiceNotes: VoiceNote[];
  month: string;
  year: number;
  userName: string;
}

export enum WeekColor {
  Week1 = '#ffedd5',
  Week2 = '#fce7f3',
  Week3 = '#e0f2fe',
  Week4 = '#fef3c7',
  Week5 = '#dcfce7'
}
