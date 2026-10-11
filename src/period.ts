// Time-of-day periods that drive the app background and dose-group tints.

export type Period = 'morning' | 'afternoon' | 'evening' | 'night';

export const PERIOD_LABEL: Record<Period, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

/** Ionicons names */
export const PERIOD_ICON: Record<Period, 'partly-sunny-outline' | 'sunny-outline' | 'cloudy-night-outline' | 'moon-outline'> = {
  morning: 'partly-sunny-outline',
  afternoon: 'sunny-outline',
  evening: 'cloudy-night-outline',
  night: 'moon-outline',
};

/** Morning 5:00–11:59, afternoon 12:00–16:59, evening 17:00–20:59, night 21:00–4:59. */
export function periodOfMinutes(min: number): Period {
  const h = Math.floor((((min % 1440) + 1440) % 1440) / 60);
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export const periodOfTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return periodOfMinutes(h * 60 + m);
};

export const periodOfDate = (d: Date) => periodOfMinutes(d.getHours() * 60 + d.getMinutes());

export interface PeriodColors {
  bg: string; // screen background
  card: string;
  line: string;
  muted: string;
  tint: string; // soft fill for dose groups in this period
  accent: string; // icon / heading colour for this period
}

/** Light-mode colours. Night uses a deep navy with light text. */
export const PERIOD_LIGHT: Record<Period, PeriodColors> = {
  morning: { bg: '#FFF4E0', card: '#FFFFFF', line: '#F2E2C4', muted: '#FBEBCB', tint: '#FFE9C2', accent: '#B45309' },
  afternoon: { bg: '#E6F2FB', card: '#FFFFFF', line: '#CFE2F1', muted: '#D9EAF7', tint: '#D3E8F8', accent: '#0369A1' },
  evening: { bg: '#FBEAE4', card: '#FFFFFF', line: '#F1D3C8', muted: '#F7DDD3', tint: '#F8D9CC', accent: '#C2410C' },
  night: { bg: '#121A33', card: '#1B2546', line: '#2A3660', muted: '#243056', tint: '#25325C', accent: '#A5B4FC' },
};

/** Dark-mode colours: same moods, lower brightness. */
export const PERIOD_DARK: Record<Period, PeriodColors> = {
  morning: { bg: '#1F190F', card: '#2A2216', line: '#3A2F1E', muted: '#33291A', tint: '#3A2C14', accent: '#FBBF24' },
  afternoon: { bg: '#0D1A24', card: '#152532', line: '#213646', muted: '#1B2D3C', tint: '#183449', accent: '#7DD3FC' },
  evening: { bg: '#22130F', card: '#2E1B16', line: '#432820', muted: '#3A221B', tint: '#4A2518', accent: '#FDBA74' },
  night: { bg: '#0A0F1F', card: '#131A30', line: '#222B47', muted: '#1C2440', tint: '#1E2850', accent: '#A5B4FC' },
};
