// Category -> color mapping, matching the design's category accents (docs/design.md).

import type { WorkoutCategory } from '../types';

export const CATEGORY_COLORS: Record<string, string> = {
  Strength: '#95482a',
  Push: '#5f5170',
  Pull: '#b0803f',
  Legs: '#567a3e',
  Cardio: '#b64436',
  Mobility: '#a89a76',
};

export const CATEGORY_GRADIENTS: Record<string, string> = {
  Strength: 'linear-gradient(150deg,#b96139,#95482a)',
  Push: 'linear-gradient(150deg,#5f5170,#453a54)',
  Pull: 'linear-gradient(150deg,#b0803f,#8c6330)',
  Legs: 'linear-gradient(150deg,#567a3e,#3f5b2c)',
  Cardio: 'linear-gradient(150deg,#b64436,#8e3227)',
  Mobility: 'linear-gradient(150deg,#a89a76,#897c5b)',
};

export const CATEGORY_TODAY_GRADIENTS: Record<string, string> = {
  Strength: 'linear-gradient(135deg,#b96139,#95482a)',
  Push: 'linear-gradient(135deg,#5f5170,#453a54)',
  Pull: 'linear-gradient(135deg,#b0803f,#8c6330)',
  Legs: 'linear-gradient(135deg,#567a3e,#3c5429)',
  Cardio: 'linear-gradient(135deg,#b64436,#8e3227)',
  Mobility: 'linear-gradient(135deg,#a89a76,#897c5b)',
};

export const WORKOUT_CATEGORIES: WorkoutCategory[] = [
  'Strength',
  'Push',
  'Pull',
  'Legs',
  'Cardio',
  'Mobility',
];

export const WORKOUT_TYPES = ['Strength', 'Hypertrophy', 'Power'] as const;

export function categoryColor(category: string | null | undefined): string {
  return CATEGORY_COLORS[category ?? ''] ?? '#8c6330';
}

export function categoryGradient(category: string | null | undefined): string {
  return CATEGORY_GRADIENTS[category ?? ''] ?? CATEGORY_GRADIENTS.Strength;
}

export function categoryTodayGradient(category: string | null | undefined): string {
  return CATEGORY_TODAY_GRADIENTS[category ?? ''] ?? CATEGORY_TODAY_GRADIENTS.Strength;
}
