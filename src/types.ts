export type Meal = 'breakfast' | 'lunch' | 'dinner';
export type MealRelation = 'before' | 'with' | 'after';

export type DoseTiming =
  | { kind: 'meal'; meal: Meal; relation: MealRelation }
  | { kind: 'custom'; time: string }; // "HH:MM" 24h

export interface Dose {
  id: string;
  timing: DoseTiming;
  qty: number; // units per dose, e.g. 1 tablet, 0.5 tablet
  days: number[]; // 0=Sun..6=Sat; empty = every day
  since: string; // ISO time this dose (or its timing) took effect; no "missed" before this
}

export interface Medication {
  id: string;
  memberId: string;
  name: string; // brand name as printed on the strip, e.g. "Dolo"
  strength: string; // e.g. "650" or "40 mg"
  aliases: string[]; // other printed names, e.g. generic "Paracetamol 650"
  barcodes: string[]; // linked barcode / QR values
  unit: string; // tablet, capsule, ml, puff...
  doses: Dose[];
  stock: number;
  lowStockAt: number;
  endDate?: string; // YYYY-MM-DD, last day of a course
  notes?: string;
  active: boolean;
  createdAt: string;
  learned?: string[]; // fingerprints of strips a person confirmed ("Teach this strip")
  expiry?: string; // YYYY-MM printed on the strip in use (read when a scan is confirmed)
  overlapOk?: string[]; // ids of medicines a doctor confirmed this one is meant to be taken with (same ingredient)
}

export interface MealTimes {
  breakfast: string;
  lunch: string;
  dinner: string;
}

export interface Member {
  id: string;
  name: string;
  color: string;
  mealTimes: MealTimes;
  language?: import('./phrases.ts').LangCode; // spoken announcements (default English)
  voice?: boolean; // speak scan results and reminders aloud (default on)
}

export interface Settings {
  mealOffsetMin: number; // "before"/"after" meal = meal time -/+ this
  dueWindowMin: number; // a dose becomes scannable this many minutes before its time
  missedAfterMin: number; // a dose is logged "missed" this many minutes after its time
  followUpMin: number; // "still not taken" reminder after this many minutes (0 = off)
  helperView?: boolean; // full app (Medicines, Settings) for a family helper; off = simple Today + Scan for the patient
  showScanDetails?: boolean; // helper: show which reader / detector read each scan (off: plain results only)
  collectConsent?: string; // when the person agreed to the photo-collection notice (spec 13)
  testReminderMin: number; // "test-scan first" reminder this long before a dose with an untested or failed medicine (0 = off)
  snoozeMin: number;
  regionDetector?: boolean; // use the strip-region detector when scanning (on unless switched off; spec 10)
  collectTraining?: boolean; // save confirmed scan photos for training an image model (off by default)
  lastBackupAt?: string; // ISO time of the last backup the person saved
  acceptedNotice?: number; // version of the safety & privacy notice the person accepted
}

export type LogStatus = 'taken' | 'missed' | 'skipped';
export type LogMethod = 'barcode' | 'text' | 'manual' | 'auto';

export interface DoseLog {
  id: string;
  key: string; // occurrence key: date|medId|doseId
  memberId: string;
  medId: string;
  medName: string;
  date: string; // YYYY-MM-DD scheduled day
  time: string; // HH:MM scheduled time
  status: LogStatus;
  method: LogMethod;
  qty: number;
  at: string; // ISO time recorded
}

export interface StockEvent {
  id: string;
  medId: string;
  memberId: string;
  medName: string;
  delta: number;
  reason: 'dose' | 'refill' | 'adjust' | 'undo';
  at: string;
}

/** A prescription read by the app, waiting for a person to check it. */
export interface PendingRxItem {
  id: string;
  med: Medication; // draft medicine (not yet in the schedule)
  source: string; // text read from the prescription
  warnings: string[];
  checked: boolean; // a person confirmed it against the prescription
  include: boolean;
  asNeeded: boolean;
}

export interface PendingRx {
  id: string;
  memberId: string;
  imageUris: string[];
  createdAt: string;
  items: PendingRxItem[];
  stopIds?: string[]; // current medicines the person chose to stop (not on the new prescription)
}

/** A saved copy of one person's schedule, taken just before it was changed. */
export interface ScheduleVersion {
  id: string;
  memberId: string;
  at: string; // when the change happened
  reason: string; // "Prescription of 12 Oct 2026", "Edited by hand", "Merged duplicates", "Restored version"
  source?: string; // prescription text, when the change came from one
  before: Medication[]; // the person's medicines just before the change
  changes: import('./consolidate.ts').ScheduleChange[];
}

export interface AppState {
  version: 1;
  members: Member[];
  meds: Medication[];
  logs: DoseLog[];
  stock: StockEvent[];
  settings: Settings;
  pending?: PendingRx;
  history?: ScheduleVersion[]; // newest last
}

export type OccurrenceStatus = 'upcoming' | 'due' | LogStatus;

export interface Occurrence {
  key: string;
  date: string;
  time: string;
  memberId: string;
  med: Medication;
  dose: Dose;
  status: OccurrenceStatus;
  log?: DoseLog;
}
