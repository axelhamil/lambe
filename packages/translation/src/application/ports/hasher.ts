export interface Hasher {
  sha256Hex(input: string): Promise<string>;
}
