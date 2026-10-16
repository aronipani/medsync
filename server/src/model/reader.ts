// The frontier model behind strip reading. The app never sees which model or provider this is:
// it only gets the checked profile (profile.ts), so the model can change without an app update.

export interface StripReader {
  /** Reads 1–2 photos (back of the strip first) and returns the model's raw answer, to be checked by checkProfile. */
  read(photos: Buffer[]): Promise<unknown>;
}

export const STRIP_PROMPT = `You are reading photos of one medicine blister strip (Indian market, often worn, cut or shiny).
The first photo is the printed foil side, the second (if present) is the pocket side.
Record what is PRINTED on this strip, using the record_strip tool. Rules:
- Only report what you can actually see. Never guess a brand from the pill colour or shape.
- brand: the brand name as printed (e.g. "Clopilet"), without strength or "Tablets".
- strength: the strength with unit as printed (e.g. "75 mg", "40 mg", "2.5 mg", "500 mg + 125 mg").
- generic: the contents line (e.g. "Clopidogrel"), maker: the manufacturer or marketer.
- tokens: up to 12 short distinctive words or numbers that identify THIS product even on a cut piece of the strip
  (brand, generic words, strength numbers, unusual print). Exclude batch numbers, prices, dates, addresses.
- repeatsPerPocket: true if the name is printed again behind each pocket.
- grid: rows and columns of pockets on the whole strip (count the empty ones too).
- colours: foil background and main print colours as #rrggbb.
- regions: boxes on the FIRST photo for brand, contents, strength and expiry, as [x1, y1, x2, y2] in 0…1.
- lookAlikes: well-known Indian brands whose names are easily confused with this one (at most 5).
- expiry: printed expiry as YYYY-MM, if readable.
- confidence: for each field you filled, 0…1. Use below 0.6 when the print is torn, hidden or you are unsure.
If the photos don't show a medicine strip, return brand "" and strength "".`;

export const STRIP_TOOL = {
  name: 'record_strip',
  description: 'Record what is printed on the medicine strip in the photos.',
  input_schema: {
    type: 'object',
    properties: {
      brand: { type: 'string' },
      strength: { type: 'string' },
      generic: { type: 'string' },
      maker: { type: 'string' },
      form: { type: 'string', description: 'tablet, capsule, …' },
      tokens: { type: 'array', items: { type: 'string' } },
      repeatsPerPocket: { type: 'boolean' },
      grid: { type: 'object', properties: { rows: { type: 'integer' }, cols: { type: 'integer' } } },
      colours: { type: 'object', properties: { foil: { type: 'string' }, print: { type: 'array', items: { type: 'string' } } } },
      regions: {
        type: 'array',
        items: {
          type: 'object',
          properties: { cls: { type: 'string', enum: ['brand', 'contents', 'strength', 'expiry'] }, box: { type: 'array', items: { type: 'number' } } },
        },
      },
      lookAlikes: { type: 'array', items: { type: 'string' } },
      expiry: { type: 'string', description: 'YYYY-MM' },
      confidence: { type: 'object', additionalProperties: { type: 'number' } },
    },
    required: ['brand', 'strength', 'confidence'],
  },
} as const;
