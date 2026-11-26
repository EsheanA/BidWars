import path from 'node:path';

export function assetPaths(runtimeRoot = path.resolve(__dirname, '..'), audioDirectory = process.env.AUDIO_DIRECTORY) {
    const backendRoot = path.basename(runtimeRoot) === 'dist' ? path.dirname(runtimeRoot) : runtimeRoot;
    return {
        staticRoot: runtimeRoot,
        audioDirectory: audioDirectory ? path.resolve(backendRoot, audioDirectory) : path.join(backendRoot, 'audioFiles')
    };
}
