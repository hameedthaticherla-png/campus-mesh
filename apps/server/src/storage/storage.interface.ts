/**
 * Campus Mesh — Storage Provider Abstraction
 */

export interface IStorageProvider {
  /**
   * Saves a readable stream to disk at the given target path.
   * Returns total bytes written.
   */
  saveStream(stream: NodeJS.ReadableStream, targetPath: string): Promise<number>;

  /**
   * Creates a readable stream for a file or a specific byte range [start, end].
   * Note: 'end' is inclusive as per Node.js fs.createReadStream convention.
   */
  createReadStream(path: string, start?: number, end?: number): NodeJS.ReadableStream;

  /**
   * Deletes a file from storage. Returns true if deleted, false if file did not exist.
   */
  delete(path: string): Promise<boolean>;

  /**
   * Checks if a file exists in storage.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Atomically renames/moves a file from sourcePath to targetPath.
   */
  move(sourcePath: string, targetPath: string): Promise<void>;

  /**
   * Gets the file size in bytes.
   */
  getFileSize(path: string): Promise<number>;
}
