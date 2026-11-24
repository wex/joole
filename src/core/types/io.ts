export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;
