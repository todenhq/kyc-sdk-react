/**
 * Writes sdk-flutter/test/customisable_texts_vectors.json: the texts a
 * workflow may customise, with their key, where they appear and the web
 * default. A workflow stores its texts by these keys, so every SDK must know
 * the same set; the React Native and Flutter tests read this file, and the web
 * test fails if it drifts from CUSTOMISABLE_TEXTS. Run after changing the list:
 *   npx tsx scripts/customisable-texts-vectors.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { customisableTextsVectors } from '../src/i18n/customisable-vectors';

const out = join(__dirname, '../../sdk-flutter/test/customisable_texts_vectors.json');
writeFileSync(out, `${JSON.stringify(customisableTextsVectors(), null, 2)}\n`);
console.log(`wrote ${out}`);
