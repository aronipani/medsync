// Last test-scan result per medicine, kept on the phone (not in backups: it's about this phone's camera and reader).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TestRecord, TestRecords } from './testScan.ts';

const KEY = 'medsync.testScans.v1';

export async function loadTestRecords(): Promise<TestRecords> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TestRecords) : {};
  } catch {
    return {};
  }
}

export async function saveTestRecord(medId: string, record: TestRecord): Promise<TestRecords> {
  const all = { ...(await loadTestRecords()), [medId]: record };
  await AsyncStorage.setItem(KEY, JSON.stringify(all)).catch(() => {});
  return all;
}
