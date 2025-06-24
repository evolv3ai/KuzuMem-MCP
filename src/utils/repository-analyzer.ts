import fs from 'fs';
import path from 'path';
import {
  COMPLEXITY_THRESHOLDS,
  CONFIG_FILE_MAPPINGS,
  DEPENDENCY_MAPPINGS,
  EXTENSION_LANGUAGE_MAPPINGS,
  LAYER_MAPPINGS,
} from './repository-analyzer-config';

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
  private logger?: { debug: (message: string) => void };

  constructor(rootPath: string, logger?: { debug: (message: string) => void }) {
    if (!rootPath || typeof rootPath !== 'string') {
      throw new Error('rootPath must be a non-empty string');
    }
    this.rootPath = rootPath;
    this.logger = logger;
  }

  /**
   * Asynchronously check if a file exists using fs.promises.access
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, fs.constants.F_OK);
      return true;
    } catch (error) {
      return false;
    }
  }

  async analyzeRepository(): Promise<RepositoryMetadata> {
    // Analyze tech stack and project info first to inform architecture analysis
    const [techStack, projectInfo] = await Promise.all([
      this.analyzeTechStack(),
      this.analyzeProjectInfo(),
    ]);

    // Analyze architecture with enhanced complexity assessment using tech stack and file count
    const architecture = await this.analyzeArchitecture(techStack, projectInfo.size.files);

    return {
      techStack,
      architecture,
      projectType: this.inferProjectType(techStack, architecture),
      size: projectInfo.size,
      createdDate: projectInfo.createdDate,
    };
  }

  private async analyzeTechStack(): Promise<TechStack> {
    const techStack: TechStack = {
      languages: [],
      frameworks: [],
      databases: [],
      tools: [],
    };

    // Analyze package.json for Node.js/TypeScript projects
    await this.analyzePackageJson(techStack);

    // Analyze other config files
    await this.analyzeConfigFiles(techStack);

    // Analyze file extensions
    await this.analyzeFileExtensions(techStack);

    return techStack;
  }

  private async analyzePackageJson(techStack: TechStack): Promise<void> {
    try {
      const packageJsonPath = path.join(this.rootPath, 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));

      // Detect package manager
      if (await this.fileExists(path.join(this.rootPath, 'pnpm-lock.yaml'))) {
        techStack.packageManager = 'pnpm';
      } else if (await this.fileExists(path.join(this.rootPath, 'yarn.lock'))) {
        techStack.packageManager = 'yarn';
      } else if (await this.fileExists(path.join(this.rootPath, 'package-lock.json'))) {
        techStack.packageManager = 'npm';
      }

      // Detect runtime
      if (packageJson.engines?.node) {
        techStack.runtime = `Node.js ${packageJson.engines.node}`;
      }

      // Capture package metadata for better project type inference
      techStack.packageMetadata = {
        hasMainField: !!packageJson.main,
        hasExportsField: !!packageJson.exports,
        hasTypesField: !!packageJson.types || !!packageJson.typings,
        hasBinField: !!packageJson.bin,
        isPrivate: !!packageJson.private,
      };

      // Analyze dependencies
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Languages
      if (
        allDeps.typescript ||
        (await this.fileExists(path.join(this.rootPath, 'tsconfig.json')))
      ) {
        techStack.languages.push('TypeScript');
      }
      if (Object.keys(allDeps).length > 0) {
        techStack.languages.push('JavaScript');
      }

      // Process all dependencies in a single iteration for better performance
      Object.keys(allDeps).forEach((dep) => {
        const framework =
          DEPENDENCY_MAPPINGS.frameworks[dep as keyof typeof DEPENDENCY_MAPPINGS.frameworks];
        const database =
          DEPENDENCY_MAPPINGS.databases[dep as keyof typeof DEPENDENCY_MAPPINGS.databases];
        const tool = DEPENDENCY_MAPPINGS.tools[dep as keyof typeof DEPENDENCY_MAPPINGS.tools];

        if (framework) {
          techStack.frameworks.push(framework);
        }
        if (database) {
          techStack.databases.push(database);
        }
        if (tool) {
          techStack.tools.push(tool);
        }
      });
    } catch (error) {
      // package.json doesn't exist or is invalid
      const errorMessage = `Failed to analyze package.json: ${error instanceof Error ? error.message : String(error)}`;
      if (this.logger) {
        this.logger.debug(errorMessage);
      } else {
        // Use structured logging format even when logger is not available
        console.error(`[RepositoryAnalyzer] ${errorMessage}`);
      }
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

  private async analyzeFileExtensions(techStack: TechStack, maxFiles = 1000): Promise<void> {
    try {
      const files = await this.getFileList(this.rootPath);
      const extensions = new Set<string>();
      const filesToAnalyze = files.slice(0, maxFiles);

      filesToAnalyze.forEach((file) => {
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
      // Error reading files
      const errorMessage = `Failed to analyze file extensions: ${error instanceof Error ? error.message : String(error)}`;
      if (this.logger) {
        this.logger.debug(errorMessage);
      } else {
        // Use structured logging format even when logger is not available
        console.error(`[RepositoryAnalyzer] ${errorMessage}`);
      }
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
      const files = await this.getFileList(this.rootPath);
      const stats = await stat(this.rootPath);

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

  private async getDirectories(dirPath: string): Promise<string[]> {
    try {
      const entries = await readdir(dirPath);
      const directories: string[] = [];

      for (const entry of entries) {
        if (entry.startsWith('.')) {
          continue;
        } // Skip hidden directories
        const entryPath = path.join(dirPath, entry);
        const entryStat = await stat(entryPath);
        if (entryStat.isDirectory()) {
          directories.push(entry);
        }
      }

      return directories;
    } catch (error) {
      return [];
    }
  }

  /**
   * Optimized iterative file traversal to avoid deep recursion for large directory structures.
   * Uses a queue-based approach instead of recursive calls for better performance.
   */
  private async getFileList(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const queue = [dirPath];

    while (queue.length > 0) {
      const currentPath = queue.shift()!;
      try {
        const entries = await readdir(currentPath);

        for (const entry of entries) {
          if (entry.startsWith('.')) {
            continue; // Skip hidden files/directories
          }
          const entryPath = path.join(currentPath, entry);
          const entryStat = await stat(entryPath);

          if (entryStat.isDirectory()) {
            queue.push(entryPath);
          } else {
            files.push(entryPath);
          }
        }
      } catch (error) {
        // Continue processing other directories
        const errorMessage = `Failed to read directory ${currentPath}: ${error instanceof Error ? error.message : String(error)}`;
        if (this.logger) {
          this.logger.debug(errorMessage);
        } else {
          // Use structured logging format even when logger is not available
          console.error(`[RepositoryAnalyzer] ${errorMessage}`);
        }
      }
    }

    return files;
  }
}
