import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

export function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function sha512(input: string): string {
  return createHash('sha512').update(input).digest('hex');
}

export async function hashFile(
  filePath: string,
  algorithm: 'md5' | 'sha256' | 'sha512' = 'sha256'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = createReadStream(filePath);

    pipeline(stream, hash)
      .then(() => {
        resolve(hash.digest('hex'));
      })
      .catch(reject);
  });
}

export function hashString(
  input: string,
  algorithm: 'md5' | 'sha256' | 'sha512' = 'sha256'
): string {
  return createHash(algorithm).update(input).digest('hex');
}
