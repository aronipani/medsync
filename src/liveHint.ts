// Live scanning (hands-free): what a quick look at the camera says to do next.
// Pure — no React Native — so it can be unit tested. Used by the Scan tab's automatic reading.

export type LiveState = 'nothing' | 'far' | 'ready';

export interface LiveHint {
  state: LiveState;
  text: string; // shown over the camera, a few words
}

const LETTERS_FOR_STRIP = 8; // fewer letters than this: no strip in view yet
const MIN_TEXT_HEIGHT = 0.014; // printed lines smaller than this share of the photo's height: too far to read

/** From a quick upright read of a small photo: is a strip in view, close enough to read? */
export function liveHint(lines: { text: string; height?: number }[], photoHeight: number): LiveHint {
  const letters = lines.reduce((n, l) => n + (l.text.match(/[A-Za-z]/g)?.length ?? 0), 0);
  if (letters < LETTERS_FOR_STRIP) return { state: 'nothing', text: 'Hold the strip in front of the camera' };
  const heights = lines
    .map((l) => l.height ?? 0)
    .filter((h) => h > 0)
    .sort((a, b) => b - a);
  // The biggest print (the brand name) decides: small print is always small.
  const biggest = heights.slice(0, 3);
  const tall = biggest.length ? biggest.reduce((a, b) => a + b, 0) / biggest.length : 0;
  if (photoHeight > 0 && tall / photoHeight < MIN_TEXT_HEIGHT) return { state: 'far', text: 'Bring the strip closer' };
  return { state: 'ready', text: 'Hold still — reading…' };
}
