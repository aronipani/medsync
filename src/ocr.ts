import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { OcrLine } from './label.ts';

/** Reads text from a photo on the device, one entry per printed line, with its text height. */
export async function readLines(uri: string): Promise<OcrLine[]> {
  const res = await TextRecognition.recognize(uri);
  const out: OcrLine[] = [];
  for (const block of res.blocks) {
    for (const line of block.lines) out.push({ text: line.text, height: line.frame?.height, top: line.frame?.top, left: line.frame?.left });
  }
  return out;
}

export function isNotLinkedError(e: unknown): boolean {
  return String(e).includes('linked');
}
