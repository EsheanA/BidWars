import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const backendRoot = fileURLToPath(new URL('..', import.meta.url));
for (const folder of ['BidWarsSVGs', 'GoldSVGs']) {
    const destination = path.join(backendRoot, 'dist', folder);
    await mkdir(destination, { recursive: true });
    await cp(path.join(backendRoot, folder), destination, { recursive: true });
}
