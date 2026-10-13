import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { FACE_MESH_VERSION, faceMeshSources } from './face-mesh-sources';

const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${FACE_MESH_VERSION}/`;

describe('faceMeshSources', () => {
  it('tries the KYC server first and the pinned public CDN last', () => {
    expect(faceMeshSources({ serverUrl: 'https://trust.myaza.app' })).toEqual([
      `https://trust.myaza.app/api/v1/assets/face-mesh/${FACE_MESH_VERSION}/`,
      CDN,
    ]);
  });

  it("puts the integrator's own host ahead of both", () => {
    expect(
      faceMeshSources({ serverUrl: 'http://localhost:3001/', assetsBasePath: '/kyc-assets/' }),
    ).toEqual([
      '/kyc-assets/face-mesh/',
      `http://localhost:3001/api/v1/assets/face-mesh/${FACE_MESH_VERSION}/`,
      CDN,
    ]);
  });

  it('always has the public CDN to fall back to', () => {
    expect(faceMeshSources()).toEqual([CDN]);
    expect(faceMeshSources({ serverUrl: '  ', assetsBasePath: '' })).toEqual([CDN]);
  });

  it('never asks any source for "latest"', () => {
    for (const source of faceMeshSources({ serverUrl: 'https://trust.myaza.app' })) {
      expect(source).toContain(FACE_MESH_VERSION);
    }
  });

  it('asks for the version this package itself depends on', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url).pathname, 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@mediapipe/face_mesh']).toContain(FACE_MESH_VERSION);
  });
});
