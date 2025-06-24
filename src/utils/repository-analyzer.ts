import * as fs from 'fs';
import * as path from 'path';
import {
  COMPLEXITY_THRESHOLDS,
  CONFIG_FILE_MAPPINGS,
  DEPENDENCY_MAPPINGS,
  EXTENSION_LANGUAGE_MAPPINGS,
  LAYER_MAPPINGS,
} from './repository-analyzer-config';
import {
  DEFAULT_SECURITY_CONFIG,
  MemoryMonitor,
  ResourceManager,
  SecurityConfig,
  validatePath,
} from './security.utils';

const { readFile, readdir, stat, access } = fs.promises;

export interface TechStack {
  languages: string[];
  frameworks: string[];
  databases: string[];
  tools: string[];
  packageManager?: string;
  runtime?: string;
  packageMetadata?: {
    hasMainField?: boolean;
    hasExportsField?: boolean;
    hasTypesField?: boolean;
    hasBinField?: boolean;
    isPrivate?: boolean;
  };
}

export interface ArchitectureInfo {
  pattern: string;
  layers: string[];
  patterns: string[];
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface RepositoryMetadata {
  techStack: TechStack;
  architecture: ArchitectureInfo;
  projectType: string;
  size: {
    files: number;
    linesOfCode?: number;
  };
  createdDate: string;
}

export class RepositoryAnalyzer {
  private rootPath: string;
  private logger?: {
    debug: (message: string) => void;
    error: (message: string, context?: any) => void;
  };
  private securityConfig: SecurityConfig;
  private resourceManager: ResourceManager;

  constructor(
    rootPath: string,
    logger?: { debug: (message: string) => void; error: (message: string, context?: any) => void },
    securityConfig: SecurityConfig = DEFAULT_SECURITY_CONFIG,
  ) {
    // Validate and normalize root path to prevent traversal
    this.rootPath = path.resolve(rootPath);
    this.logger = logger;
    this.securityConfig = securityConfig;
    this.resourceManager = new ResourceManager();
  }

  /**
   * Asynchronously check if a file exists using fs.promises.access
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      // Validate path before checking existence
      const safePath = validatePath(filePath, this.rootPath);
      await access(safePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async analyzeRepository(): Promise<RepositoryMetadata> {
    const memoryMonitor = new MemoryMonitor();

    try {
      const techStack = await this.analyzeTechStack();

      // Check memory usage after tech stack analysis
      memoryMonitor.checkMemoryUsage();

      const files = await this.getFileListSecurely();
      const architecture = await this.analyzeArchitecture(techStack, files.length);

      // Check memory usage after file analysis
      memoryMonitor.checkMemoryUsage();

      const projectInfo = await this.analyzeProjectInfo();
      const projectType = this.inferProjectType(techStack, architecture);

      return {
        techStack,
        architecture,
        projectType,
        size: projectInfo.size,
        createdDate: projectInfo.createdDate,
      };
    } finally {
      // Always clean up resources
      await this.resourceManager.cleanup();
    }
  }

  private async analyzeTechStack(): Promise<TechStack> {
    const techStack: TechStack = {
      languages: [],
      frameworks: [],
      databases: [],
      tools: [],
    };

    await this.analyzePackageJsonSecurely(techStack);
    await this.analyzeConfigFiles(techStack);
    await this.analyzeFileExtensions(techStack);

    return techStack;
  }

  private async analyzePackageJsonSecurely(techStack: TechStack): Promise<void> {
    try {
      const packageJsonPath = path.join(this.rootPath, 'package.json');

      // Use secure file reading with resource management
      const packageJsonContent = await this.resourceManager.readFileSecurely(packageJsonPath);

      // Use safe JSON parsing with validation
      const packageJson = this.safeParsePackageJson(packageJsonContent);

      if (!packageJson) {
        return; // Failed to parse, continue without package.json data
      }

      // Detect package manager securely
      if (await this.fileExists(path.join(this.rootPath, 'pnpm-lock.yaml'))) {
        techStack.packageManager = 'pnpm';
      } else if (await this.fileExists(path.join(this.rootPath, 'yarn.lock'))) {
        techStack.packageManager = 'yarn';
      } else if (await this.fileExists(path.join(this.rootPath, 'package-lock.json'))) {
        techStack.packageManager = 'npm';
      }

      // Detect runtime and dependencies
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      this.extractFrameworksFromDependencies(dependencies, techStack);
      this.extractDatabasesFromDependencies(dependencies, techStack);
      this.extractToolsFromDependencies(dependencies, techStack);

      // Extract package metadata securely
      techStack.packageMetadata = {
        hasMainField: Boolean(packageJson.main),
        hasExportsField: Boolean(packageJson.exports),
        hasTypesField: Boolean(packageJson.types || packageJson.typings),
        hasBinField: Boolean(packageJson.bin),
        isPrivate: Boolean(packageJson.private),
      };

      // Detect TypeScript if present
      if (
        dependencies.typescript ||
        dependencies['@types/node'] ||
        (await this.fileExists(path.join(this.rootPath, 'tsconfig.json')))
      ) {
        if (!techStack.languages.includes('TypeScript')) {
          techStack.languages.push('TypeScript');
        }
      }

      // Detect JavaScript (always present if package.json exists)
      if (!techStack.languages.includes('JavaScript')) {
        techStack.languages.push('JavaScript');
      }

      // Detect Node.js runtime
      if (dependencies['@types/node'] || packageJson.engines?.node) {
        techStack.runtime = 'Node.js';
      }
    } catch (error) {
      // Enhanced error handling
      const errorMessage = `Failed to analyze package.json: ${error instanceof Error ? error.message : String(error)}`;
      if (this.logger) {
        this.logger.error(`[RepositoryAnalyzer] ${errorMessage}`, {
          error: error instanceof Error ? error.toString() : String(error),
          rootPath: this.rootPath,
        });
      } else {
        // Skip logging when no logger is available to maintain consistency
      }
    }
  }

  /**
   * Safely parse package.json with comprehensive validation
   */
  private safeParsePackageJson(content: string): any {
    try {
      // Basic validation
      if (!content || typeof content !== 'string') {
        return null;
      }

      // Length validation (package.json should not be huge)
      if (content.length > 1024 * 1024) {
        // 1MB max
        throw new Error('package.json file too large');
      }

      const parsed = JSON.parse(content);

      // Validate it's an object with expected structure
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      return parsed;
    } catch (error) {
      if (this.logger) {
        this.logger.error('[RepositoryAnalyzer] Failed to parse package.json', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    }
  }

  private async analyzeConfigFiles(techStack: TechStack): Promise<void> {
    for (const config of CONFIG_FILE_MAPPINGS) {
      if (await this.fileExists(path.join(this.rootPath, config.file))) {
        if (config.file === 'tsconfig.json' && !techStack.languages.includes('TypeScript')) {
          techStack.languages.push('TypeScript');
        } else if (config.file.startsWith('Cargo') && !techStack.languages.includes('Rust')) {
          techStack.languages.push('Rust');
        } else if (config.file.includes('requirements') || config.file.includes('pyproject')) {
          if (!techStack.languages.includes('Python')) {
            techStack.languages.push('Python');
          }
        } else if (config.file.includes('Docker')) {
          techStack.tools.push(config.indicates);
        }
      }
    }
  }

  private async analyzeFileExtensions(techStack: TechStack): Promise<void> {
    try {
      const files = await this.getFileListSecurely();
      const extensions = new Set<string>();

      // Use security config maxFiles instead of hardcoded limit
      const maxFiles = this.securityConfig.maxFiles;
      const filesToAnalyze = files.slice(0, maxFiles);

      // Warn if we're truncating analysis due to file limit
      if (files.length > maxFiles) {
        const warningMessage = `Repository analysis truncated: ${files.length} files found, analyzing only first ${maxFiles} files. Consider increasing maxFiles limit for complete analysis.`;
        if (this.logger) {
          this.logger.debug(`[RepositoryAnalyzer] ${warningMessage}`);
        }
      }

      filesToAnalyze.forEach((file: string) => {
        const ext = path.extname(file).toLowerCase();
        if (ext) {
          extensions.add(ext);
        }
      });

      // Map extensions to languages using externalized mappings
      extensions.forEach((ext) => {
        const language =
          EXTENSION_LANGUAGE_MAPPINGS[ext as keyof typeof EXTENSION_LANGUAGE_MAPPINGS];
        if (language && !techStack.languages.includes(language)) {
          techStack.languages.push(language);
        }
      });
    } catch (error) {
      // Critical error - fail analysis rather than continue silently
      const errorMessage = `Failed to analyze file extensions: ${error instanceof Error ? error.message : String(error)}`;
      if (this.logger) {
        this.logger.error(`[RepositoryAnalyzer] ${errorMessage}`, {
          error: error instanceof Error ? error.toString() : String(error),
          rootPath: this.rootPath,
        });
      }

      // Throw error to prevent incomplete analysis from being treated as complete
      throw new Error(`Repository analysis failed during file extension analysis: ${errorMessage}`);
    }
  }

  private async analyzeArchitecture(
    techStack?: TechStack,
    fileCount?: number,
  ): Promise<ArchitectureInfo> {
    const directories = await this.getDirectories(this.rootPath);
    const layers: string[] = [];
    const patterns: string[] = [];

    // Common architectural patterns using externalized mappings
    directories.forEach((dir) => {
      const layer = LAYER_MAPPINGS[dir.toLowerCase() as keyof typeof LAYER_MAPPINGS];
      if (layer) {
        layers.push(layer);
      }
    });

    // Detect patterns
    if (directories.some((d) => d.includes('service'))) {
      patterns.push('Service-Oriented');
    }
    if (directories.includes('mcp') || directories.includes('tools')) {
      patterns.push('MCP Server');
    }
    if (directories.includes('cli')) {
      patterns.push('CLI Application');
    }
    if (directories.some((d) => d.includes('component'))) {
      patterns.push('Component-Based');
    }
    if (layers.length >= 4) {
      patterns.push('Layered Architecture');
    }

    const complexity = this.assessComplexity(directories, layers, techStack, fileCount);
    const pattern = this.inferArchitecturalPattern(patterns, layers);

    return {
      pattern,
      layers,
      patterns,
      complexity,
    };
  }

  private async analyzeProjectInfo(): Promise<{ size: { files: number }; createdDate: string }> {
    try {
      const files = await this.getFileListSecurely();
      const stats = await fs.promises.stat(this.rootPath);

      return {
        size: {
          files: files.length,
        },
        createdDate: (stats.birthtime || stats.ctime).toISOString(),
      };
    } catch (error) {
      return {
        size: { files: 0 },
        createdDate: new Date().toISOString(),
      };
    }
  }

  private inferProjectType(techStack: TechStack, architecture: ArchitectureInfo): string {
    if (architecture.patterns.includes('MCP Server')) {
      return 'MCP Server';
    }
    if (architecture.patterns.includes('CLI Application')) {
      return 'CLI Tool';
    }

    // Check for CLI tool indicators
    if (techStack.packageMetadata?.hasBinField) {
      return 'CLI Tool';
    }

    if (
      techStack.frameworks.some(
        (f) => f.includes('React') || f.includes('Vue') || f.includes('Angular'),
      )
    ) {
      return 'Web Application';
    }
    if (techStack.frameworks.some((f) => f.includes('Express') || f.includes('Fastify'))) {
      return 'Web Server';
    }

    // Refined library/framework detection with additional criteria
    const hasTestingTools = techStack.tools.includes('Jest') || techStack.tools.includes('Vitest');
    const hasLibraryIndicators =
      techStack.packageMetadata?.hasMainField ||
      techStack.packageMetadata?.hasExportsField ||
      techStack.packageMetadata?.hasTypesField;
    const isNotPrivate = !techStack.packageMetadata?.isPrivate;

    // More sophisticated library detection: testing tools + library indicators + not private
    if (hasTestingTools && hasLibraryIndicators && isNotPrivate) {
      return 'Library/Framework';
    }

    return 'Application';
  }

  private inferArchitecturalPattern(patterns: string[], layers: string[]): string {
    if (patterns.includes('MCP Server')) {
      return 'MCP Server Architecture';
    }
    if (patterns.includes('Service-Oriented')) {
      return 'Service-Oriented Architecture';
    }
    if (patterns.includes('Layered Architecture')) {
      return 'Layered Architecture';
    }
    if (patterns.includes('Component-Based')) {
      return 'Component-Based Architecture';
    }
    return 'Modular Architecture';
  }

  /**
   * Assess project complexity based on directory structure and architectural layers.
   * Uses externalized thresholds with documented rationale.
   * Enhanced with dependency and file count factors for more nuanced assessment.
   */
  private assessComplexity(
    directories: string[],
    layers: string[],
    techStack?: TechStack,
    fileCount?: number,
  ): 'simple' | 'moderate' | 'complex' {
    // Enhanced complexity scoring with multiple factors
    let complexityScore = directories.length + layers.length;

    // Add dependency complexity factor
    if (techStack) {
      const totalDeps =
        techStack.frameworks.length + techStack.databases.length + techStack.tools.length;
      complexityScore += Math.floor(totalDeps / 3); // Weight dependencies less heavily
    }

    // Add file count factor for very large projects
    if (fileCount && fileCount > 500) {
      complexityScore += Math.floor(fileCount / 250);
    }

    if (complexityScore <= COMPLEXITY_THRESHOLDS.simple.max) {
      return 'simple'; // Small projects with minimal structure (< 5 components)
    }
    if (complexityScore <= COMPLEXITY_THRESHOLDS.moderate.max) {
      return 'moderate'; // Typical applications with clear structure (5-9 components)
    }
    return 'complex'; // Enterprise/monolithic applications with extensive structure (10+ components)
  }

  /**
   * Securely get directory list with path validation
   */
  private async getDirectories(dirPath: string): Promise<string[]> {
    try {
      // Validate directory path
      const safeDirPath = validatePath(dirPath, this.rootPath);
      const entries = await readdir(safeDirPath);
      const directories: string[] = [];

      for (const entry of entries) {
        if (entry.startsWith('.')) {
          continue; // Skip hidden directories
        }

        try {
          const entryPath = path.join(safeDirPath, entry);

          // Additional security check - ensure we don't traverse outside root
          validatePath(entryPath, this.rootPath);

          const entryStat = await stat(entryPath);
          if (entryStat.isDirectory()) {
            directories.push(entry);
          }
        } catch (error) {
          // Skip entries that cause errors (could be permission issues or invalid paths)
          continue;
        }
      }

      return directories;
    } catch (error) {
      return [];
    }
  }

  /**
   * Secure file list traversal with memory limits and path validation
   */
  private async getFileListSecurely(): Promise<string[]> {
    const files: string[] = [];
    const queue = [this.rootPath];
    const memoryMonitor = new MemoryMonitor(200); // 200MB limit for file listing
    let fileCount = 0;
    let criticalErrors = 0;
    const maxCriticalErrors = 5; // Fail after 5 critical errors
    const currentDepth = 0;

    while (queue.length > 0 && fileCount < this.securityConfig.maxFiles) {
      const currentPath = queue.shift()!;

      // Check memory usage periodically
      if (fileCount % 100 === 0) {
        memoryMonitor.checkMemoryUsage();
      }

      // Calculate current depth to prevent infinite recursion
      const relativePath = path.relative(this.rootPath, currentPath);
      const depth = relativePath ? relativePath.split(path.sep).length : 0;

      if (depth > this.securityConfig.maxDirectoryDepth) {
        continue; // Skip directories that are too deep
      }

      try {
        // Validate current path
        validatePath(currentPath, this.rootPath);

        const entries = await readdir(currentPath);

        for (const entry of entries) {
          if (entry.startsWith('.')) {
            continue; // Skip hidden files/directories
          }

          try {
            const entryPath = path.join(currentPath, entry);

            // Validate entry path and check if it should be ignored
            validatePath(entryPath, this.rootPath);

            const relativeEntryPath = path.relative(this.rootPath, entryPath);
            if (this.resourceManager.shouldIgnorePath(relativeEntryPath, this.securityConfig)) {
              continue;
            }

            const entryStat = await stat(entryPath);

            if (entryStat.isDirectory()) {
              queue.push(entryPath);
            } else if (entryStat.isFile()) {
              // Check file size before adding to list
              if (entryStat.size <= this.securityConfig.maxFileSize) {
                files.push(entryPath);
                fileCount++;

                // Check if we've hit the file limit
                if (fileCount >= this.securityConfig.maxFiles) {
                  if (this.logger) {
                    this.logger.debug(
                      `[RepositoryAnalyzer] Hit file limit (${this.securityConfig.maxFiles}), stopping traversal`,
                    );
                  }
                  break;
                }
              }
            }
          } catch (entryError) {
            // Skip problematic entries but continue processing
            continue;
          }
        }
      } catch (error) {
        criticalErrors++;
        const errorMessage = `Failed to read directory ${currentPath}: ${error instanceof Error ? error.message : String(error)}`;

        if (this.logger) {
          this.logger.error(`[RepositoryAnalyzer] ${errorMessage}`, {
            error: error instanceof Error ? error.toString() : String(error),
            currentPath,
            rootPath: this.rootPath,
            criticalErrors,
          });
        }

        // Fail fast if too many critical errors occur
        if (criticalErrors >= maxCriticalErrors) {
          const failureMessage = `Repository analysis failed: ${criticalErrors} critical directory read errors encountered. This may indicate file system corruption, permission issues, or other serious problems.`;
          if (this.logger) {
            this.logger.error(`[RepositoryAnalyzer] ${failureMessage}`);
          }
          throw new Error(failureMessage);
        }
      }
    }

    if (this.logger && fileCount >= this.securityConfig.maxFiles) {
      this.logger.debug(
        `[RepositoryAnalyzer] File traversal completed with limit: ${fileCount} files processed`,
      );
    }

    // Report final statistics
    if (this.logger && (criticalErrors > 0 || fileCount >= this.securityConfig.maxFiles)) {
      this.logger.debug(
        `[RepositoryAnalyzer] Traversal completed: ${fileCount} files found, ${criticalErrors} directory errors encountered`,
      );
    }

    return files;
  }

  /**
   * Extract frameworks from dependencies with validation
   */
  private extractFrameworksFromDependencies(
    dependencies: Record<string, any>,
    techStack: TechStack,
  ): void {
    if (!dependencies || typeof dependencies !== 'object') {
      return;
    }

    Object.keys(dependencies).forEach((dep) => {
      const framework =
        DEPENDENCY_MAPPINGS.frameworks[dep as keyof typeof DEPENDENCY_MAPPINGS.frameworks];
      if (framework && !techStack.frameworks.includes(framework)) {
        techStack.frameworks.push(framework);
      }
    });
  }

  /**
   * Extract databases from dependencies with validation
   */
  private extractDatabasesFromDependencies(
    dependencies: Record<string, any>,
    techStack: TechStack,
  ): void {
    if (!dependencies || typeof dependencies !== 'object') {
      return;
    }

    Object.keys(dependencies).forEach((dep) => {
      const database =
        DEPENDENCY_MAPPINGS.databases[dep as keyof typeof DEPENDENCY_MAPPINGS.databases];
      if (database && !techStack.databases.includes(database)) {
        techStack.databases.push(database);
      }
    });
  }

  /**
   * Extract tools from dependencies with validation
   */
  private extractToolsFromDependencies(
    dependencies: Record<string, any>,
    techStack: TechStack,
  ): void {
    if (!dependencies || typeof dependencies !== 'object') {
      return;
    }

    Object.keys(dependencies).forEach((dep) => {
      const tool = DEPENDENCY_MAPPINGS.tools[dep as keyof typeof DEPENDENCY_MAPPINGS.tools];
      if (tool && !techStack.tools.includes(tool)) {
        techStack.tools.push(tool);
      }
    });
  }
}
