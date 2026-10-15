import { requireOptionalNativeModule } from 'expo';

export interface AppleTextLine {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  corners: { x: number; y: number }[];
  confidence: number;
}

interface AppleTextNative {
  recognize(uri: string): Promise<AppleTextLine[]>;
}

/** The Apple Vision reader, or null where it isn't built in (Android, Expo Go, older builds). */
export const AppleText = requireOptionalNativeModule<AppleTextNative>('AppleText');
