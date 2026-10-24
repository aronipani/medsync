import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { AppState } from './types.ts';

const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** Every dose (taken, missed, skipped) and every refill or count fix, as a spreadsheet file to share with a doctor. */
export async function shareHistoryCsv(state: AppState, today: string): Promise<void> {
  const memberName = (id: string) => state.members.find((m) => m.id === id)?.name ?? '—';
  const lines = [
    ['Type', 'Person', 'Medicine', 'Scheduled date', 'Scheduled time', 'Status', 'Recorded at', 'Quantity', 'Method'].map(csv).join(','),
    ...state.logs.map((l) => ['dose', memberName(l.memberId), l.medName, l.date, l.time, l.status, l.at, l.qty, l.method].map(csv).join(',')),
    ...state.stock
      .filter((e) => e.reason === 'refill' || e.reason === 'adjust')
      .map((e) => [e.reason, memberName(e.memberId), e.medName, '', '', '', e.at, e.delta, ''].map(csv).join(',')),
  ];
  const file = new File(Paths.cache, `TakeSure history ${today}.csv`);
  file.write(lines.join('\n'));
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Medicine history' });
}
