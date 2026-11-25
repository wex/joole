/** A texture converted to RGBA8 pixels, ready for a WebGL upload. */
export interface ConvertedTexture {
  readonly width: number;
  readonly height: number;
  /** width times height times 4 bytes, red, green, blue, alpha order. */
  readonly rgba: Uint8Array;
}

/** Request sent to the texture worker. wal and palette are transferred. */
export interface TextureConvertRequest {
  readonly type: 'convert';
  readonly id: number;
  readonly wal: ArrayBuffer;
  /** The 768 bytes of RGB triples read from pics/colormap.pcx. */
  readonly palette: ArrayBuffer;
}

export interface TextureConvertedResponse {
  readonly type: 'converted';
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: ArrayBuffer;
}

export interface TextureErrorResponse {
  readonly type: 'error';
  readonly id: number;
  readonly message: string;
}

export type TextureWorkerResponse = TextureConvertedResponse | TextureErrorResponse;
