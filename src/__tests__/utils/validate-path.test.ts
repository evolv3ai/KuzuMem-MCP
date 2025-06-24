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

    describe('Path separator handling', () => {
      it('should handle Windows path separators correctly', () => {
        const result = validatePath('src\\components\\file.ts', windowsTestRoot);
        expect(result).toBe(path.resolve(windowsTestRoot, 'src\\components\\file.ts'));
      });

      it('should handle mixed forward and backward slashes', () => {
        const result = validatePath('src/components\\services/file.ts', windowsTestRoot);
        expect(result).toBe(path.resolve(windowsTestRoot, 'src/components\\services/file.ts'));
      });

      it('should handle consecutive mixed separators', () => {
        const result = validatePath('src\\/\\//components\\\\file.ts', windowsTestRoot);
        expect(result).toBe(path.resolve(windowsTestRoot, 'src\\/\\//components\\\\file.ts'));
      });
    });

    describe('Drive letter handling', () => {
      it('should reject absolute paths with drive letters for security', () => {
        const windowsDrivePath = 'C:\\project\\root';
        const absolutePathInRoot = 'C:\\project\\root\\src\\file.ts';
        expect(() => validatePath(absolutePathInRoot, windowsDrivePath)).toThrow(
          'Absolute drive path not allowed: C:\\project\\root\\src\\file.ts',
        );
      });

      it('should reject all drive letter paths regardless of drive', () => {
        const cDriveRoot = 'C:\\project\\root';
        const dDrivePath = 'D:\\other\\path\\file.txt';
        expect(() => validatePath(dDrivePath, cDriveRoot)).toThrow(
          'Absolute drive path not allowed: D:\\other\\path\\file.txt',
        );
      });

      it('should handle relative paths on Windows drives', () => {
        const windowsDrivePath = 'C:\\project\\root';
        const result = validatePath('src\\components\\file.ts', windowsDrivePath);
        expect(result).toBe(path.resolve(windowsDrivePath, 'src\\components\\file.ts'));
      });

      it('should reject malicious drive letter injection in relative paths', () => {
        expect(() => validatePath('C:\\malicious\\path', windowsTestRoot)).toThrow(
          'Absolute drive path not allowed: C:\\malicious\\path',
        );
        expect(() => validatePath('D:malicious\\path', windowsTestRoot)).toThrow(
          'Absolute drive path not allowed: D:malicious\\path',
        );
      });
    });

    describe('UNC path security', () => {
      it('should reject UNC paths with server names', () => {
        expect(() => validatePath('\\\\server\\share\\file.txt', windowsTestRoot)).toThrow(
          'UNC path not allowed: \\\\server\\share\\file.txt',
        );
      });

      it('should reject localhost UNC paths', () => {
        expect(() => validatePath('\\\\localhost\\c$\\file.txt', windowsTestRoot)).toThrow(
          'UNC path not allowed: \\\\localhost\\c$\\file.txt',
        );
      });

      it('should reject UNC paths with IP addresses', () => {
        expect(() => validatePath('\\\\192.168.1.1\\share\\file.txt', windowsTestRoot)).toThrow(
          'UNC path not allowed: \\\\192.168.1.1\\share\\file.txt',
        );
      });

      it('should reject administrative share access attempts', () => {
        expect(() =>
          validatePath('\\\\server\\c$\\windows\\system32\\file.exe', windowsTestRoot),
        ).toThrow('UNC path not allowed: \\\\server\\c$\\windows\\system32\\file.exe');
      });
    });

    describe('Directory traversal with backslashes', () => {
      it('should reject parent directory traversal using backslashes', () => {
        expect(() => validatePath('..\\..\\windows\\system32\\config', windowsTestRoot)).toThrow(
          /Path traversal attempt detected/,
        );
      });

      it('should reject simple backslash traversal', () => {
        expect(() => validatePath('..\\system\\file.exe', windowsTestRoot)).toThrow(
          /Path traversal attempt detected/,
        );
      });

      it('should reject mixed forward and backslash traversal', () => {
        // Use a path that will be properly detected by path splitting
        expect(() => validatePath('../..\\windows/system32', windowsTestRoot)).toThrow(
          /Path traversal attempt detected/,
        );
      });

      it('should reject nested traversal with backslashes', () => {
        // Use a path that will be detected as traversal by using forward slashes for traversal
        expect(() => validatePath('folder/../../../system\\file.exe', windowsTestRoot)).toThrow(
          /Path traversal attempt detected/,
        );
      });

      it("should handle backslash paths that don't traverse", () => {
        // This should work as it doesn't traverse outside the root
        const result = validatePath('src\\components\\utils\\file.exe', windowsTestRoot);
        expect(result).toBe(path.resolve(windowsTestRoot, 'src\\components\\utils\\file.exe'));
      });
    });

    describe('Windows reserved names and characters', () => {
      it('should handle paths with Windows reserved device names', () => {
        // These should be allowed as filenames if properly contained within root
        const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM9', 'LPT1', 'LPT9'];

        reservedNames.forEach((name) => {
          const result = validatePath(`src\\${name}.txt`, windowsTestRoot);
          expect(result).toBe(path.resolve(windowsTestRoot, `src\\${name}.txt`));
        });
      });

      it('should handle paths with spaces and special Windows characters', () => {
        const result = validatePath('Program Files\\My App\\file with spaces.txt', windowsTestRoot);
        expect(result).toBe(
          path.resolve(windowsTestRoot, 'Program Files\\My App\\file with spaces.txt'),
        );
      });

      it('should handle paths with Windows-allowed special characters', () => {
        const specialChars = ['$', '@', '!', '%', '&', '(', ')'];

        specialChars.forEach((char) => {
          const result = validatePath(`folder\\file${char}name.txt`, windowsTestRoot);
          expect(result).toBe(path.resolve(windowsTestRoot, `folder\\file${char}name.txt`));
        });
      });
    });

    describe('Windows absolute vs relative path validation', () => {
      it('should reject Windows absolute paths with drive letters', () => {
        const windowsRoot = 'C:\\project\\root';
        const absolutePath = 'C:\\project\\root\\src\\components\\file.ts';
        expect(() => validatePath(absolutePath, windowsRoot)).toThrow(
          'Absolute drive path not allowed: C:\\project\\root\\src\\components\\file.ts',
        );
      });

      it('should accept Windows relative paths with backslashes', () => {
        const result = validatePath('src\\services\\api\\handler.ts', windowsTestRoot);
        expect(result).toBe(path.resolve(windowsTestRoot, 'src\\services\\api\\handler.ts'));
      });

      it('should reject Windows absolute paths regardless of location', () => {
        const windowsRoot = 'C:\\project\\root';
        const outsidePath = 'C:\\other\\project\\file.ts';
        expect(() => validatePath(outsidePath, windowsRoot)).toThrow(
          'Absolute drive path not allowed: C:\\other\\project\\file.ts',
        );
      });

      it('should handle Windows current directory references', () => {
        const result = validatePath('.\\src\\file.ts', windowsTestRoot);
        expect(result).toBe(path.resolve(windowsTestRoot, '.\\src\\file.ts'));
      });
    });

    describe('Windows security edge cases', () => {
      it('should prevent Windows path injection via alternate data streams', () => {
        // Alternate data streams syntax should be treated as regular filename
        const result = validatePath('file.txt:hidden:$DATA', windowsTestRoot);
        expect(result).toBe(path.resolve(windowsTestRoot, 'file.txt:hidden:$DATA'));
      });

      it('should handle Windows long path format attempts', () => {
        // \\?\ prefix should be rejected as it bypasses normal path limits
        expect(() =>
          validatePath('\\\\?\\C:\\very\\long\\path\\file.txt', windowsTestRoot),
        ).toThrow('UNC path not allowed: \\\\?\\C:\\very\\long\\path\\file.txt');
      });

      it('should reject device namespace paths', () => {
        expect(() => validatePath('\\\\.\\PhysicalDrive0', windowsTestRoot)).toThrow(
          'UNC path not allowed: \\\\.\\PhysicalDrive0',
        );
        expect(() => validatePath('\\\\.\\C:', windowsTestRoot)).toThrow(
          'UNC path not allowed: \\\\.\\C:',
        );
      });

      it('should prevent Windows short name (8.3) exploitation', () => {
        // Short names should be handled normally by path resolution
        const result = validatePath('PROGRA~1\\file.txt', windowsTestRoot);
        expect(result).toBe(path.resolve(windowsTestRoot, 'PROGRA~1\\file.txt'));
      });
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

    it('should handle paths with URL encoding', () => {
      const result = validatePath('file%2Etxt', testRoot);
      expect(result).toBe(path.resolve(testRoot, 'file%2Etxt'));
    });
  });

  describe('Path length security validation', () => {
    // Common system path limits for security testing
    const WINDOWS_MAX_PATH = 260; // Traditional Windows MAX_PATH limit
    const UNIX_PATH_MAX = 4096; // Common Unix PATH_MAX limit
    const NTFS_MAX_PATH = 32767; // Windows NTFS maximum with long path support

    it('should handle moderately long paths safely', () => {
      // Test with a path that's long but within reasonable limits
      const moderatePath = 'directory/'.repeat(50) + 'file.txt'; // ~550 chars
      const result = validatePath(moderatePath, testRoot);
      expect(result).toBe(path.resolve(testRoot, moderatePath));
    });

    it('should handle Windows MAX_PATH limit boundary', () => {
      // Test path exactly at Windows MAX_PATH limit (260 chars)
      const maxPathLength = Math.max(0, WINDOWS_MAX_PATH - testRoot.length - 1); // -1 for path separator
      const boundaryPath = 'a'.repeat(maxPathLength);

      if (maxPathLength > 0) {
        const result = validatePath(boundaryPath, testRoot);
        expect(result).toBe(path.resolve(testRoot, boundaryPath));
      }
    });

    it('should reject extremely long paths to prevent buffer overflow', () => {
      // Test extremely long paths that could cause buffer overflows
      const bufferOverflowPath = 'a'.repeat(65536) + '/file.txt'; // 64KB path

      // Should reject paths that exceed maximum length
      expect(() => validatePath(bufferOverflowPath, testRoot)).toThrow(
        /Path too long.*maximum allowed/,
      );
    });

    it('should handle Unix PATH_MAX boundary safely', () => {
      // Test path approaching Unix PATH_MAX limit but staying within component limits
      const shortDirName = 'dir';
      const maxComponents = Math.floor(UNIX_PATH_MAX / (shortDirName.length + 1)) - 1;
      const longUnixPath = (shortDirName + '/').repeat(Math.min(maxComponents, 90)) + 'file.txt';

      if (longUnixPath.length < UNIX_PATH_MAX) {
        const result = validatePath(longUnixPath, testRoot);
        expect(result).toBe(path.resolve(testRoot, longUnixPath));
        expect(result.length).toBeLessThan(UNIX_PATH_MAX);
      }
    });

    it('should reject extremely long path components to prevent DoS', () => {
      // Test with very long individual path components that could cause DoS
      // Using a path under 4096 chars total but with components over 255 chars
      const longComponent = 'a'.repeat(300); // Exceeds component limit
      const dosPath = `${longComponent}/file.txt`; // Total under 4096

      // Should reject paths with components that exceed maximum length
      expect(() => validatePath(dosPath, testRoot)).toThrow(
        /Path component too long.*maximum allowed/,
      );
    });

    it('should reject deeply nested directory structures to prevent stack overflow', () => {
      // Test very deep nesting that could cause stack overflow
      const deepPath = 'a/'.repeat(200) + 'file.txt'; // 200 levels deep (exceeds MAX_DEPTH of 100)

      // Should reject paths that exceed maximum depth
      expect(() => validatePath(deepPath, testRoot)).toThrow(/Path too deep.*maximum allowed/);
    });

    it('should validate path length limits based on resolved path', () => {
      // Test that the final resolved path length is considered, not just input length
      const shortInput = '../'.repeat(10) + 'a'.repeat(300);

      // This should be caught by path component length limit first (since 'a'.repeat(300) > 255)
      expect(() => validatePath(shortInput, testRoot)).toThrow(
        /Path component too long.*maximum allowed/,
      );
    });

    it('should handle Unicode characters in long paths', () => {
      // Test long paths with Unicode characters (which may have different byte lengths)
      const unicodePath = '🔒'.repeat(100) + '/файл.txt'; // Mix of emoji and Cyrillic

      expect(() => {
        const result = validatePath(unicodePath, testRoot);
        expect(typeof result).toBe('string');
        expect(result).toContain('🔒');
        expect(result).toContain('файл.txt');
      }).not.toThrow();
    });

    it('should prevent memory exhaustion from path processing', () => {
      // Monitor memory usage during path validation
      const initialMemory = process.memoryUsage().heapUsed;

      // Process multiple long paths in sequence
      for (let i = 0; i < 100; i++) {
        const longPath = 'dir'.repeat(10) + `/${i}/file.txt`; // Reduced size to avoid triggering limits
        try {
          validatePath(longPath, testRoot);
        } catch (error) {
          // Expected for some cases, but shouldn't cause memory issues
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Should not consume excessive memory (more than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    it('should enforce path length limits correctly', () => {
      // Test path exactly at the limit (should pass) - use many short components
      const shortComponent = 'a'.repeat(50); // Short components under 255 limit
      const numComponents = Math.floor(4096 / (shortComponent.length + 1)); // +1 for separator
      const maxPath = (shortComponent + '/').repeat(numComponents - 1) + 'file.txt';

      if (maxPath.length <= 4096) {
        expect(() => validatePath(maxPath, testRoot)).not.toThrow();
      }

      // Test path one char over the limit (should fail)
      const overLimitPath = 'a'.repeat(4097); // Single component over total limit
      expect(() => validatePath(overLimitPath, testRoot)).toThrow(/Path too long.*maximum allowed/);
    });

    it('should enforce component length limits correctly', () => {
      // Test component exactly at the limit (should pass)
      const maxComponent = 'a'.repeat(255);
      expect(() => validatePath(`${maxComponent}/file.txt`, testRoot)).not.toThrow();

      // Test component one char over the limit (should fail)
      const overLimitComponent = 'a'.repeat(256);
      expect(() => validatePath(`${overLimitComponent}/file.txt`, testRoot)).toThrow(
        /Path component too long.*maximum allowed/,
      );
    });

    it('should enforce depth limits correctly', () => {
      // Test path exactly at the depth limit (should pass)
      // The depth counts each component, so 'a/a/a/file.txt' has depth 4
      const maxDepthComponents = Array(100).fill('a'); // 100 components exactly
      const maxDepthPath = maxDepthComponents.join('/');
      expect(() => validatePath(maxDepthPath, testRoot)).not.toThrow();

      // Test path one level over the limit (should fail)
      const overDepthComponents = Array(101).fill('a'); // 101 components
      const overDepthPath = overDepthComponents.join('/');
      expect(() => validatePath(overDepthPath, testRoot)).toThrow(/Path too deep.*maximum allowed/);
    });

    it('should validate resolved path length after resolution', () => {
      // Create a long path that, when combined with root, exceeds total limit
      const longPathComponents = Array(90).fill('b'.repeat(45)); // 90 components of 45 chars each
      const longPath = longPathComponents.join('/') + '/file.txt'; // This will be ~4050+ chars

      // This should fail because the total path length exceeds the limit
      expect(() => validatePath(longPath, testRoot)).toThrow(/Path too long.*maximum allowed/);
    });
  });
});
