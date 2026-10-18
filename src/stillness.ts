// Waits until the phone is held still (or a time limit passes), so photos aren't blurred by a moving hand.
// Uses the motion sensor; where it isn't available it simply waits a short moment.
import { DeviceMotion } from 'expo-sensors';

const STILL_RATE = 0.35; // radians per second of rotation: below this the hand is steady
const STILL_FOR_MS = 400;

export async function waitUntilStill(maxMs = 1500): Promise<boolean> {
  let available = false;
  try {
    available = await DeviceMotion.isAvailableAsync();
  } catch {
    available = false;
  }
  if (!available) {
    await new Promise((r) => setTimeout(r, Math.min(maxMs, 300)));
    return false;
  }
  return new Promise((resolve) => {
    let stillSince = 0;
    let done = false;
    const finish = (still: boolean) => {
      if (done) return;
      done = true;
      sub.remove();
      clearTimeout(timer);
      resolve(still);
    };
    DeviceMotion.setUpdateInterval(80);
    const sub = DeviceMotion.addListener((m) => {
      const r = m.rotationRate;
      const rate = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0;
      const now = Date.now();
      if (rate < STILL_RATE) {
        if (!stillSince) stillSince = now;
        if (now - stillSince >= STILL_FOR_MS) finish(true);
      } else stillSince = 0;
    });
    const timer = setTimeout(() => finish(false), maxMs);
  });
}
