// Photos arrive already cleaned by the phone, but the server does not trust that: it checks the file is a
// JPEG and removes every metadata segment (EXIF with GPS and camera model, XMP, comments) before the
// photo goes anywhere. Pure byte surgery — no image library.

import { HttpError } from './http.ts';

export function cleanJpeg(buf: Buffer, maxBytes: number): Buffer {
  if (buf.length > maxBytes) throw new HttpError(413, 'photo_too_large');
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new HttpError(415, 'not_jpeg');
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new HttpError(415, 'bad_jpeg');
    const marker = buf[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xda) {
      out.push(buf.subarray(i)); // start of scan: the rest is image data
      return Buffer.concat(out);
    }
    if (i + 4 > buf.length) throw new HttpError(415, 'bad_jpeg');
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    // APP0 (JFIF) is kept; APP1–APP15 (EXIF, XMP, ICC, maker notes) and COM (comments) are dropped.
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(seg);
    i += 2 + len;
  }
  throw new HttpError(415, 'bad_jpeg');
}
