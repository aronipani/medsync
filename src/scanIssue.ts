// What went wrong with a scan that was too weak for a verdict. The scan never says "right" or "wrong
// medicine" from a weak read; it says what the problem with the read was and how to fix it.
// Pure — no React Native — so it can be unit tested.

import { readsAsMedicine } from './match.ts';
import type { Medication } from './types.ts';

export type ScanIssue = 'nothing' | 'tooLittle' | 'broken' | 'makerSide' | 'unknownName' | 'partialName' | 'twoFit';

export interface ScanDiagnosis {
  issue: ScanIssue;
  title: string; // what was wrong with the read, in a few words
  why: string; // one sentence on what the phone saw
  tips: string[]; // what to do differently, most useful first
}

// Print found on the maker's side of a strip (address, licence, storage), never the medicine's name.
const MAKER_WORDS = new Set([
  'LIMITED', 'LTD', 'PVT', 'MARKETED', 'MANUFACTURED', 'MFG', 'MFD', 'LIC', 'TRADEMARK', 'ROAD', 'INDUSTRIAL',
  'AREA', 'ESTATE', 'DIST', 'PLOT', 'PHARMACEUTICALS', 'PHARMA', 'LABORATORIES', 'HEALTHCARE', 'SCHEDULE',
  'PRESCRIPTION', 'CAUTION', 'STORE', 'PROTECT', 'MOISTURE', 'CHILDREN', 'REACH', 'TEMPERATURE', 'RETAIL',
  'MUMBAI', 'DELHI', 'BANGALORE', 'BENGALURU', 'HYDERABAD', 'CHENNAI', 'KOLKATA', 'AHMEDABAD', 'GOA', 'BADDI',
  'SIKKIM', 'HIMACHAL', 'GUJARAT', 'MAHARASHTRA', 'INDIA', 'TAXES', 'INCL', 'BATCH', 'EXPIRY', 'PRICE',
]);

const CLOSER = 'Hold the strip about a hand-width from the phone, flat and steady.';
const NAME_SIDE = 'Turn the strip over to the side with the big printed name.';
const CONTENTS_SIDE = "Scan the side that lists what's in each tablet.";
const UPRIGHT = 'Turn the strip so the name reads left to right.';
const SHINE = 'Tilt the strip a little away from lights, or turn on the torch.';
const FLATTEN = 'Flatten creases and keep fingers off the name.';
const TEACH = 'Or open "Helper: it is the right medicine" and tap its name, so it is known next time.';
export const BOX_BARCODE = 'Or scan the barcode on the box — once it is linked, it works every time.';

/**
 * Why a read was too weak for a verdict, judged from the text the phone read.
 * `twoFit`: the household matcher found more than one medicine that fits; `partialOf`: it found one, but not surely.
 */
export function diagnoseScan(
  text: string,
  household: Pick<Medication, 'name' | 'strength' | 'aliases'>[] = [],
  ctx: { twoFit?: string[]; partialOf?: string } = {},
): ScanDiagnosis {
  // Every weak read also offers the box barcode: it doesn't depend on shine, wear or a cut strip.
  const d = diagnose(text, household, ctx);
  return { ...d, tips: [...d.tips, BOX_BARCODE] };
}

function diagnose(
  text: string,
  household: Pick<Medication, 'name' | 'strength' | 'aliases'>[],
  ctx: { twoFit?: string[]; partialOf?: string },
): ScanDiagnosis {
  if (ctx.twoFit && ctx.twoFit.length > 1) {
    return {
      issue: 'twoFit',
      title: 'Only part of the name was read',
      why: `What was read fits more than one of your medicines (${ctx.twoFit.join(', ')}).`,
      tips: [NAME_SIDE, UPRIGHT, SHINE],
    };
  }
  if (ctx.partialOf) {
    return {
      issue: 'partialName',
      title: 'Only part of the name was read',
      why: `It may be ${ctx.partialOf}, but too little of the name was read to be sure.`,
      tips: [UPRIGHT, SHINE, FLATTEN],
    };
  }
  const words = text.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  const letters = words.join('').length;
  if (!letters) {
    return { issue: 'nothing', title: 'No text could be read', why: 'The phone found no printed letters in the photo.', tips: [CLOSER, SHINE, NAME_SIDE] };
  }
  if (letters < 12) {
    return { issue: 'tooLittle', title: 'Too little text was read', why: 'Only a few letters could be read — the strip may be too far, blurred or cut off.', tips: [CLOSER, UPRIGHT, SHINE] };
  }
  const short = words.filter((w) => w.length <= 2).length;
  if (words.length >= 5 && short / words.length > 0.5) {
    return { issue: 'broken', title: 'The letters came out broken', why: 'The print was read in bits — usually shine on the foil or creases.', tips: [SHINE, FLATTEN, CLOSER] };
  }
  if (!readsAsMedicine(text, household as never)) {
    const maker = words.filter((w) => MAKER_WORDS.has(w)).length;
    if (maker >= 2) {
      return { issue: 'makerSide', title: "Only the maker's details were read", why: 'The phone read the address and licence print, not the medicine name.', tips: [NAME_SIDE, CONTENTS_SIDE, UPRIGHT] };
    }
    return {
      issue: 'unknownName',
      title: 'No medicine name the app knows',
      why: 'Text was read, but no name from your list or the medicine list — it may be a brand the app has not seen.',
      tips: [CONTENTS_SIDE, NAME_SIDE, TEACH],
    };
  }
  return { issue: 'unknownName', title: 'The strip could not be matched', why: 'A medicine name was read, but not clearly enough to compare.', tips: [NAME_SIDE, UPRIGHT, SHINE] };
}
