import * as fs from 'fs';
import * as path from 'path';

/**
 * Security configuration for repository analysis
 */
export interface SecurityConfig {
  maxFiles: number;
  maxDirectoryDepth: number;
  maxFileSize: number; // in bytes
  allowedExtensions: string[];
  blockedPaths: string[];
}

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  maxFiles: 10000, // Prevent memory exhaustion
  maxDirectoryDepth: 20, // Prevent stack overflow
  maxFileSize: 10 * 1024 * 1024, // 10MB per file
  allowedExtensions: ['.js', '.ts', '.json', '.md', '.txt', '.yml', '.yaml', '.toml'],
  blockedPaths: ['node_modules', '.git', 'dist', 'build', 'coverage', '.next'],
};

/**
 * Validates and normalizes a file path to prevent path traversal attacks
 * @param targetPath - The path to validate
 * @param rootPath - The root directory that should contain the target
 * @returns Normalized safe path
 * @throws Error if path is invalid or traverses outside root
 */
export function validatePath(targetPath: string, rootPath: string): string {
  // Resolve absolute paths to prevent traversal
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(normalizedRoot, targetPath);

  // Ensure the target path is within the root directory
  if (
    !normalizedTarget.startsWith(normalizedRoot + path.sep) &&
    normalizedTarget !== normalizedRoot
  ) {
    throw new Error(`Path traversal attempt detected: ${targetPath}`);
  }

  return normalizedTarget;
}

/**
 * Safely parses JSON with comprehensive error handling
 * @param jsonString - The JSON string to parse
 * @param fallback - Default value if parsing fails
 * @param maxLength - Maximum allowed string length
 * @returns Parsed object or fallback
 */
export function safeJsonParse<T>(
  jsonString: unknown,
  fallback: T,
  maxLength: number = 1024 * 1024, // 1MB default
): T {
  try {
    // Validate input exists and is a string
    if (jsonString === null || jsonString === undefined) {
      return fallback;
    }

    if (typeof jsonString !== 'string') {
      return fallback;
    }

    // Check string length to prevent DoS
    if (jsonString.length > maxLength) {
      throw new Error(`JSON string too large: ${jsonString.length} bytes (max: ${maxLength})`);
    }

    // Trim whitespace and check for empty string
    const trimmed = jsonString.trim();
    if (trimmed === '') {
      return fallback;
    }

    // Parse JSON with additional validation
    const parsed = JSON.parse(trimmed);

    // Validate parsed result is not null
    if (parsed === null) {
      return fallback;
    }

    return parsed as T;
  } catch (error) {
    // Log parsing error for debugging (but don't throw)
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return fallback;
  }
}

/**
 * Resource manager for file operations with automatic cleanup
 */
export class ResourceManager {
  private openHandles: Set<fs.promises.FileHandle> = new Set();

  /**
   * Safely read a file with automatic handle cleanup
   * @param filePath - Path to file
   * @param encoding - File encoding
   * @param maxSize - Maximum file size in bytes
   * @returns File content
   */
  async readFileSecurely(
    filePath: string,
    encoding: BufferEncoding = 'utf-8',
    maxSize: number = DEFAULT_SECURITY_CONFIG.maxFileSize,
  ): Promise<string> {
    let handle: fs.promises.FileHandle | null = null;

    try {
      // Check file size before reading
      const stats = await fs.promises.stat(filePath);
      if (stats.size > maxSize) {
        throw new Error(`File too large: ${stats.size} bytes (max: ${maxSize})`);
      }

      // Open file handle
      handle = await fs.promises.open(filePath, 'r');
      this.openHandles.add(handle);

      // Read file content
      const content = await handle.readFile({ encoding });
      return content;
    } finally {
      // Always clean up handle
      if (handle) {
        this.openHandles.delete(handle);
        await handle.close().catch(() => {
          // Ignore close errors but log them
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Failed to close file handle for: ${filePath}`);
          }
        });
      }
    }
  }

  /**
   * Check if a path should be ignored for security/performance reasons
   * @param relativePath - Relative path from root
   * @param config - Security configuration
   * @returns true if path should be ignored
   */
  shouldIgnorePath(
    relativePath: string,
    config: SecurityConfig = DEFAULT_SECURITY_CONFIG,
  ): boolean {
    const normalizedPath = relativePath.toLowerCase();

    // Check against blocked paths
    for (const blockedPath of config.blockedPaths) {
      if (normalizedPath.includes(blockedPath.toLowerCase())) {
        return true;
      }
    }

    // Check file extension if it's a file
    const ext = path.extname(normalizedPath);
    if (ext && !config.allowedExtensions.includes(ext)) {
      return true;
    }

    return false;
  }

  /**
   * Clean up any remaining open handles
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.openHandles).map(async (handle) => {
      try {
        await handle.close();
      } catch (error) {
        // Log but don't throw during cleanup
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Failed to close handle during cleanup: ${error}`);
        }
      }
    });

    await Promise.allSettled(cleanupPromises);
    this.openHandles.clear();
  }
}

/**
 * Memory usage monitor for large operations
 */
export class MemoryMonitor {
  private initialMemory: number;
  private maxMemoryIncrease: number;

  constructor(maxMemoryIncreaseMB: number = 500) {
    this.initialMemory = process.memoryUsage().heapUsed;
    this.maxMemoryIncrease = maxMemoryIncreaseMB * 1024 * 1024; // Convert to bytes
  }

  /**
   * Check if memory usage is within acceptable limits
   * @throws Error if memory usage exceeds limits
   */
  checkMemoryUsage(): void {
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = currentMemory - this.initialMemory;

    if (memoryIncrease > this.maxMemoryIncrease) {
      throw new Error(
        `Memory usage exceeded limit: ${Math.round(memoryIncrease / 1024 / 1024)}MB increase ` +
          `(max: ${Math.round(this.maxMemoryIncrease / 1024 / 1024)}MB)`,
      );
    }
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryStats(): { current: number; increase: number; limit: number } {
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = currentMemory - this.initialMemory;

    return {
      current: Math.round(currentMemory / 1024 / 1024), // MB
      increase: Math.round(memoryIncrease / 1024 / 1024), // MB
      limit: Math.round(this.maxMemoryIncrease / 1024 / 1024), // MB
    };
  }
}

/**
 * Secure process spawning configuration for test environments
 */
export interface SecureSpawnConfig {
  readonly allowedCommands: readonly string[];
  readonly allowedArgs: readonly string[];
  readonly timeout: number;
  readonly maxMemory: number;
  readonly env: Record<string, string>;
}

export const DEFAULT_TEST_SPAWN_CONFIG: SecureSpawnConfig = {
  allowedCommands: ['npx', 'node', 'tsx'] as const,
  allowedArgs: ['tsx', '-r', 'ts-node/register'] as const,
  timeout: 30000, // 30 seconds
  maxMemory: 512 * 1024 * 1024, // 512MB
  env: {
    NODE_ENV: 'test',
    NODE_OPTIONS: '--max-old-space-size=512',
  },
} as const;

/**
 * Security error for process spawning violations
 */
export class ProcessSpawnSecurityError extends Error {
  constructor(
    message: string,
    public readonly violation: string,
  ) {
    super(`Process spawn security violation: ${message}`);
    this.name = 'ProcessSpawnSecurityError';
  }
}

/**
 * Securely validate and spawn processes for test environments
 * @param command - Command to execute
 * @param args - Arguments for the command
 * @param serverPath - Path to the server file
 * @param config - Security configuration
 * @returns Spawn options with security constraints
 */
export function validateSecureSpawn(
  command: string,
  args: string[],
  serverPath: string,
  config: SecureSpawnConfig = DEFAULT_TEST_SPAWN_CONFIG,
): {
  command: string;
  args: string[];
  options: {
    stdio: ['pipe', 'pipe', 'pipe'];
    env: Record<string, string>;
    timeout: number;
    detached: false;
    shell: false;
  };
} {
  // Validate command is in allowlist
  if (!config.allowedCommands.includes(command as any)) {
    throw new ProcessSpawnSecurityError(
      `Command '${command}' not in allowlist`,
      'DISALLOWED_COMMAND',
    );
  }

  // Validate server path is within expected locations
  const allowedServerPaths = ['src/mcp-stdio-server.ts', 'src/mcp-httpstream-server.ts'];
  const normalizedPath = serverPath.replace(/\\/g, '/');
  if (!allowedServerPaths.some((allowed) => normalizedPath.endsWith(allowed))) {
    throw new ProcessSpawnSecurityError(
      `Server path '${serverPath}' not in allowlist`,
      'DISALLOWED_PATH',
    );
  }

  // Validate arguments
  const dangerousArgs = ['--allow-scripts', '--unsafe-perm', '--ignore-scripts=false'];
  const hasDangerousArgs = args.some((arg) => dangerousArgs.includes(arg));
  if (hasDangerousArgs) {
    throw new ProcessSpawnSecurityError(
      `Dangerous arguments detected: ${args.join(' ')}`,
      'DANGEROUS_ARGS',
    );
  }

  // Validate all args are in allowlist or are safe paths
  const unsafeArgs = args.filter((arg) => {
    // Allow known safe arguments
    if (config.allowedArgs.includes(arg as any)) {
      return false;
    }
    // Allow server paths
    if (allowedServerPaths.some((allowed) => arg.endsWith(allowed))) {
      return false;
    }
    // Allow relative paths starting with src/
    if (arg.startsWith('src/') && !arg.includes('..')) {
      return false;
    }
    return true;
  });

  if (unsafeArgs.length > 0) {
    throw new ProcessSpawnSecurityError(
      `Unsafe arguments detected: ${unsafeArgs.join(', ')}`,
      'UNSAFE_ARGS',
    );
  }

  return {
    command,
    args,
    options: {
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
      env: {
        ...(Object.fromEntries(
          Object.entries(process.env).filter(([, value]) => value !== undefined),
        ) as Record<string, string>),
        ...config.env,
      },
      timeout: config.timeout,
      detached: false,
      shell: false, // Never use shell to prevent injection
    },
  };
}
