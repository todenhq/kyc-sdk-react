import { expect, it } from 'vitest';
import { describeInMonorepo, sharedVectors } from '../__tests__/monorepo';
import { customisableTextsVectors } from './customisable-vectors';

describeInMonorepo('the shared customisable texts file', () => {
  it('matches the web list (regenerate with npx tsx scripts/customisable-texts-vectors.ts)', () => {
    const shared = sharedVectors('sdk-flutter/test/customisable_texts_vectors.json', {});
    expect(shared).toEqual(JSON.parse(JSON.stringify(customisableTextsVectors())));
  });
});
