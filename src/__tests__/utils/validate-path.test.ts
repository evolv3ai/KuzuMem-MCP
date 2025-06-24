import * as path from 'path';
import { validatePath } from '../../utils/security.utils';

describe('validatePath', () => {
  const testRoot = '/test/root';
  const windowsTestRoot = 'C:\\test\\root';

  describe('Input validation', () => {
    it('should reject empty or invalid target paths', () => {
      expect(() => validatePath('', testRoot)).toThrow('Target path must be a non-empty string');
      expect(() => validatePath(null as any, testRoot)).toThrow(
        'Target path must be a non-empty string',
      );
      expect(() => validatePath(undefined as any, testRoot)).toThrow(
        'Target path must be a non-empty string',
      );
    });

    it('should reject empty or invalid root paths', () => {
      expect(() => validatePath('file.txt', '')).toThrow('Root path must be a non-empty string');
      expect(() => validatePath('file.txt', null as any)).toThrow(
        'Root path must be a non-empty string',
      );
      expect(() => validatePath('file.txt', undefined as any)).toThrow(
        'Root path must be a non-empty string',
      );
    });
  });

  describe('Valid relative paths', () => {
    it('should accept simple relative paths', () => {
      const result = validatePath('file.txt', testRoot);
      expect(result).toBe(path.resolve(testRoot, 'file.txt'));
    });

    it('should accept nested relative paths', () => {
      const result = validatePath('src/components/file.ts', testRoot);
      expect(result).toBe(path.resolve(testRoot, 'src/components/file.ts'));
    });

    it('should accept paths with ./ prefix', () => {
      const result = validatePath('./src/file.ts', testRoot);
      expect(result).toBe(path.resolve(testRoot, 'src/file.ts'));
    });

    it('should accept paths that resolve to root directory', () => {
      const result = validatePath('.', testRoot);
      expect(result).toBe(path.resolve(testRoot));
    });
  });

  describe('Path traversal protection', () => {
    it('should reject simple parent directory traversal', () => {
      expect(() => validatePath('../file.txt', testRoot)).toThrow(
        /Path traversal attempt detected/,
      );
    });

    it('should reject deep parent directory traversal', () => {
      expect(() => validatePath('../../../etc/passwd', testRoot)).toThrow(
        /Path traversal attempt detected/,
      );
    });

    it('should reject complex traversal attempts', () => {
      expect(() => validatePath('src/../../etc/passwd', testRoot)).toThrow(
        /Path traversal attempt detected/,
      );
    });

    it('should reject mixed traversal with valid paths', () => {
      expect(() => validatePath('src/../../../etc/passwd', testRoot)).toThrow(
        /Path traversal attempt detected/,
      );
    });
  });

  describe('Absolute path handling', () => {
    it('should accept absolute paths within root directory', () => {
      const absolutePathInRoot = path.resolve(testRoot, 'src/file.ts');
      const result = validatePath(absolutePathInRoot, testRoot);
      expect(result).toBe(absolutePathInRoot);
    });

    it('should accept root directory itself as absolute path', () => {
      const result = validatePath(testRoot, testRoot);
      expect(result).toBe(testRoot);
    });

    it('should reject absolute paths outside root directory', () => {
      expect(() => validatePath('/etc/passwd', testRoot)).toThrow(
        /Path traversal attempt detected/,
      );
    });

    it('should reject Windows absolute paths with drive letters (malicious)', () => {
      expect(() => validatePath('C:\\Windows\\System32', testRoot)).toThrow(
        'Absolute drive path not allowed: C:\\Windows\\System32',
      );
      expect(() => validatePath('D:\\data\\file.txt', testRoot)).toThrow(
        'Absolute drive path not allowed: D:\\data\\file.txt',
      );
    });

    it('should reject UNC paths on Windows', () => {
      expect(() => validatePath('\\\\server\\share\\file.txt', testRoot)).toThrow(
        'UNC path not allowed: \\\\server\\share\\file.txt',
      );
      expect(() => validatePath('\\\\localhost\\c$\\file.txt', testRoot)).toThrow(
        'UNC path not allowed: \\\\localhost\\c$\\file.txt',
      );
    });
  });

  describe('Windows-specific handling', () => {
    // Mock process.platform for Windows-specific tests
    const originalPlatform = process.platform;

    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      });
    });

    it('should handle Windows path separators correctly', () => {
      const result = validatePath('src\\components\\file.ts', windowsTestRoot);
      expect(result).toBe(path.resolve(windowsTestRoot, 'src\\components\\file.ts'));
    });
  });

  describe('Edge cases', () => {
    it('should handle paths with special characters', () => {
      const result = validatePath('file with spaces.txt', testRoot);
      expect(result).toBe(path.resolve(testRoot, 'file with spaces.txt'));
    });

    it('should handle paths with Unicode characters', () => {
      const result = validatePath('файл.txt', testRoot);
      expect(result).toBe(path.resolve(testRoot, 'файл.txt'));
    });

    it('should handle multiple consecutive path separators', () => {
      const result = validatePath('src//components///file.ts', testRoot);
      expect(result).toBe(path.resolve(testRoot, 'src//components///file.ts'));
    });

    it('should handle paths ending with separators', () => {
      const result = validatePath('src/components/', testRoot);
      expect(result).toBe(path.resolve(testRoot, 'src/components/'));
    });
  });

  describe('Security edge cases', () => {
    it('should handle null byte injection attempts', () => {
      const result = validatePath('file\x00.txt', testRoot);
      expect(result).toBe(path.resolve(testRoot, 'file\x00.txt'));
    });

    it('should handle very long paths', () => {
      const longPath = 'a'.repeat(1000) + '/file.txt';
      const result = validatePath(longPath, testRoot);
      expect(result).toBe(path.resolve(testRoot, longPath));
    });

    it('should handle paths with URL encoding', () => {
      const result = validatePath('file%2Etxt', testRoot);
      expect(result).toBe(path.resolve(testRoot, 'file%2Etxt'));
    });
  });
});
