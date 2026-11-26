import { expect, it } from 'vitest';
import { assetPaths } from './assets';

it('keeps audio outside compiled output while serving packaged SVGs from the runtime root', () => {
    const source = assetPaths('/project/backend', undefined);
    const compiled = assetPaths('/project/backend/dist', undefined);
    expect(source.audioDirectory).toBe('/project/backend/audioFiles');
    expect(compiled.audioDirectory).toBe(source.audioDirectory);
    expect(compiled.staticRoot).toBe('/project/backend/dist');
    expect(assetPaths('/project/backend/dist', '/mnt/audio').audioDirectory).toBe('/mnt/audio');
    expect(assetPaths('/project/backend/dist', 'data/audio').audioDirectory).toBe('/project/backend/data/audio');
});
