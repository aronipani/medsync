// The strip-region detector on the phone: finds where the brand, contents, strength and expiry date are printed.
// YOLO11n-OBB trained in training/, exported to TFLite (assets/models/strip-regions.tflite), run with
// react-native-fast-tflite on the CPU. See docs/specs/10-region-detector-and-text-readers.md.

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import { decodeObb, toInput, toPhoto, type PhotoRegion } from './obb.ts';

export { pickRegions } from './obb.ts';

type Tflite = typeof import('react-native-fast-tflite');
type Model = Awaited<ReturnType<Tflite['loadTensorflowModel']>>;

export type DetectorState = 'loading' | 'ready' | 'missing';
let state: DetectorState = 'loading';
let loading: Promise<Model | null> | null = null;
let enabled = true;

/** Starts loading the model (once). Resolves to null where the runtime or the model isn't in this build. */
export function loadRegionModel(): Promise<Model | null> {
  loading ??= (async () => {
    try {
      // Required lazily: the native runtime is created when the package is first loaded.
      const tflite: Tflite = require('react-native-fast-tflite');
      const model = await tflite.loadTensorflowModel(require('../assets/models/strip-regions.tflite'), []);
      state = 'ready';
      return model;
    } catch {
      state = 'missing';
      return null;
    }
  })();
  return loading;
}

export const detectorState = (): DetectorState => state;

/** Settings → "Use the region detector". When off, scans use the full reading only (the old method). */
export function setRegionDetectorEnabled(on: boolean) {
  enabled = on;
}
export const regionDetectorEnabled = () => enabled;

/**
 * Finds the printed areas on a photo. `size` is the photo's upright size (as ImageManipulator renders it).
 * Returns regions in photo pixels, best first; null if the detector isn't available.
 */
export async function detectRegions(uri: string, size: { width: number; height: number }): Promise<PhotoRegion[] | null> {
  const model = await loadRegionModel();
  if (!model) return null;
  const inShape = model.inputs[0]?.shape ?? [1, 640, 640, 3];
  const inSize = inShape[1] === 3 ? inShape[2] : inShape[1]; // NHWC (usual) or NCHW
  const fit = size.width >= size.height ? { width: inSize } : { height: inSize };
  const small = await (await ImageManipulator.manipulate(uri).resize(fit).renderAsync()).saveAsync({ compress: 0.95, format: SaveFormat.JPEG });
  const decoded = jpeg.decode(new File(small.uri).bytesSync(), { useTArray: true, formatAsRGBA: true });
  const { data, lb } = toInput(decoded.data, decoded.width, decoded.height, inSize);
  const input = inShape[1] === 3 ? toChannelsFirst(data, inSize) : data;
  const [out] = await model.run([input.buffer as ArrayBuffer]);
  const dets = decodeObb(new Float32Array(out), model.outputs[0].shape, inSize, { conf: 0.25 });
  const scale = decoded.width / size.width; // photo pixels → model pixels
  return dets.map((d) => toPhoto(d, { ...lb, scale }));
}

function toChannelsFirst(hwc: Float32Array, size: number): Float32Array {
  const out = new Float32Array(hwc.length);
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    out[i] = hwc[i * 3];
    out[plane + i] = hwc[i * 3 + 1];
    out[2 * plane + i] = hwc[i * 3 + 2];
  }
  return out;
}
