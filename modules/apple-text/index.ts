import { requireOptionalNativeModule } from 'expo';

export interface AppleTextLine {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  corners: { x: number; y: number }[];
  confidence: number;
  alternatives?: string[]; // Vision's next-best readings of the line (builds from ios-25 on)
}

interface AppleTextNative {
  /** words: household medicine words as a custom vocabulary (turns on language correction for that call only). */
  recognize(uri: string, words?: string[] | null): Promise<AppleTextLine[]>;
  /** Image feature print distance from the photo to each reference (-1 = unreadable); builds with look matching. */
  lookDistances?(uri: string, refs: string[]): Promise<{ distances: number[]; revision: number }>;
}

/** The Apple Vision reader, or null where it isn't built in (Android, Expo Go, older builds). */
export const AppleText = requireOptionalNativeModule<AppleTextNative>('AppleText');
