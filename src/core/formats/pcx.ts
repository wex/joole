export class PcxFormatError extends Error {
  constructor(public readonly reason: 'too-small' | 'no-palette-marker') {
    super(reason);
    this.name = 'PcxFormatError';
  }
}

/**
 * The 256-colour palette of a .pcx: the byte 0x0C followed by 768 bytes of
 * red, green and blue triples at the very end of the file.
 */
export function readPcxPalette(bytes: Uint8Array): Uint8Array {
  if (bytes.byteLength < 769) {
    throw new PcxFormatError('too-small');
  }
  const marker = bytes[bytes.byteLength - 769];
  if (marker !== 0x0c) {
    throw new PcxFormatError('no-palette-marker');
  }
  return bytes.subarray(bytes.byteLength - 768);
}
