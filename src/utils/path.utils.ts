import * as path from 'path';

/**
 * Ensures that the given path is absolute. If it's relative, it resolves it
 * to an absolute path based on the current working directory.
 *
 * @param inputPath The path to check.
 * @returns The absolute path.
 */
export function ensureAbsolutePath(inputPath: string): string {
  if (!path.isAbsolute(inputPath)) {
    return path.resolve(inputPath);
  }
  return inputPath;
}
