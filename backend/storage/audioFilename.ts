export function audioFilename(value: string): string {
    const match = /^(?:audioFiles\/)?([a-zA-Z0-9_-]+\.mp3)$/.exec(value);
    if (!match) throw new Error('Invalid prepared audio path');
    return match[1]!;
}
