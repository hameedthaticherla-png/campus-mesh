/**
 * Campus Mesh — Local Disk Storage Provider Implementation
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type { IStorageProvider } from './storage.interface.js';
import { config } from '../config/env.config.js';

export class LocalDiskStorageProvider implements IStorageProvider {
  /**
   * Enforces strict path confinement preventing directory traversal attacks.
   */
  private assertPathWithinStorage(filePath: string): void {
    const resolvedPath = path.resolve(filePath);
    const resolvedStorage = path.resolve(config.storageDir);
    // Allow paths that start with storageDir (plus path separator check)
    const isInside =
      resolvedPath === resolvedStorage ||
      resolvedPath.startsWith(resolvedStorage + path.sep) ||
      resolvedPath.startsWith(resolvedStorage + '/');

    if (!isInside) {
      throw new Error(`Security Violation: Storage path "${filePath}" escapes configured storage directory.`);
    }
  }

  public async saveStream(stream: NodeJS.ReadableStream, targetPath: string): Promise<number> {
    this.assertPathWithinStorage(targetPath);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      await fsp.mkdir(dir, { recursive: true });
    }

    let bytesWritten = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        bytesWritten += chunk.length;
        callback(null, chunk);
      }
    });

    const writeStream = fs.createWriteStream(targetPath);
    await pipeline(stream, meter, writeStream);

    return bytesWritten;
  }

  public createReadStream(filePath: string, start?: number, end?: number): NodeJS.ReadableStream {
    this.assertPathWithinStorage(filePath);
    const options: { start?: number; end?: number } = {};
    if (typeof start === 'number') options.start = start;
    if (typeof end === 'number') options.end = end;

    return fs.createReadStream(filePath, options);
  }

  public async delete(filePath: string): Promise<boolean> {
    this.assertPathWithinStorage(filePath);
    try {
      await fsp.unlink(filePath);
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  public async exists(filePath: string): Promise<boolean> {
    this.assertPathWithinStorage(filePath);
    try {
      await fsp.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  public async move(sourcePath: string, targetPath: string): Promise<void> {
    this.assertPathWithinStorage(sourcePath);
    this.assertPathWithinStorage(targetPath);

    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      await fsp.mkdir(targetDir, { recursive: true });
    }

    try {
      await fsp.rename(sourcePath, targetPath);
    } catch (err: unknown) {
      // Fallback if cross-device link error (EXDEV)
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        await fsp.copyFile(sourcePath, targetPath);
        await fsp.unlink(sourcePath);
      } else {
        throw err;
      }
    }
  }

  public async getFileSize(filePath: string): Promise<number> {
    this.assertPathWithinStorage(filePath);
    const stat = await fsp.stat(filePath);
    return stat.size;
  }
}

export const localStorageProvider = new LocalDiskStorageProvider();
