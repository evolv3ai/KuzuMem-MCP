import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export interface TechStack {
  languages: string[];
  frameworks: string[];
  databases: string[];
  tools: string[];
  packageManager?: string;
  runtime?: string;
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

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async analyzeRepository(): Promise<RepositoryMetadata> {
    const [techStack, architecture, projectInfo] = await Promise.all([
      this.analyzeTechStack(),
      this.analyzeArchitecture(),
      this.analyzeProjectInfo(),
    ]);

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
      if (fs.existsSync(path.join(this.rootPath, 'pnpm-lock.yaml'))) {
        techStack.packageManager = 'pnpm';
      } else if (fs.existsSync(path.join(this.rootPath, 'yarn.lock'))) {
        techStack.packageManager = 'yarn';
      } else if (fs.existsSync(path.join(this.rootPath, 'package-lock.json'))) {
        techStack.packageManager = 'npm';
      }

      // Detect runtime
      if (packageJson.engines?.node) {
        techStack.runtime = `Node.js ${packageJson.engines.node}`;
      }

      // Analyze dependencies
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Languages
      if (allDeps.typescript || fs.existsSync(path.join(this.rootPath, 'tsconfig.json'))) {
        techStack.languages.push('TypeScript');
      }
      if (Object.keys(allDeps).length > 0) {
        techStack.languages.push('JavaScript');
      }

      // Frameworks and libraries
      const frameworkMap: Record<string, string> = {
        express: 'Express.js',
        fastify: 'Fastify',
        koa: 'Koa',
        react: 'React',
        vue: 'Vue.js',
        angular: 'Angular',
        'next.js': 'Next.js',
        nuxt: 'Nuxt.js',
        jest: 'Jest',
        vitest: 'Vitest',
        mocha: 'Mocha',
        cypress: 'Cypress',
        playwright: 'Playwright',
        '@modelcontextprotocol/sdk': 'MCP SDK',
      };

      Object.keys(allDeps).forEach((dep) => {
        if (frameworkMap[dep]) {
          techStack.frameworks.push(frameworkMap[dep]);
        }
      });

      // Databases
      const dbMap: Record<string, string> = {
        mongoose: 'MongoDB',
        pg: 'PostgreSQL',
        mysql2: 'MySQL',
        sqlite3: 'SQLite',
        redis: 'Redis',
        kuzu: 'KuzuDB',
      };

      Object.keys(allDeps).forEach((dep) => {
        if (dbMap[dep]) {
          techStack.databases.push(dbMap[dep]);
        }
      });

      // Tools
      const toolMap: Record<string, string> = {
        eslint: 'ESLint',
        prettier: 'Prettier',
        webpack: 'Webpack',
        vite: 'Vite',
        rollup: 'Rollup',
        commander: 'Commander.js',
      };

      Object.keys(allDeps).forEach((dep) => {
        if (toolMap[dep]) {
          techStack.tools.push(toolMap[dep]);
        }
      });
    } catch (error) {
      // package.json doesn't exist or is invalid
    }
  }

  private async analyzeConfigFiles(techStack: TechStack): Promise<void> {
    const configFiles = [
      { file: 'tsconfig.json', indicates: 'TypeScript' },
      { file: 'Cargo.toml', indicates: 'Rust' },
      { file: 'requirements.txt', indicates: 'Python' },
      { file: 'pyproject.toml', indicates: 'Python' },
      { file: 'Dockerfile', indicates: 'Docker' },
      { file: 'docker-compose.yml', indicates: 'Docker Compose' },
    ];

    for (const config of configFiles) {
      if (fs.existsSync(path.join(this.rootPath, config.file))) {
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
      const files = await this.getFileList(this.rootPath);
      const extensions = new Set<string>();

      files.forEach((file) => {
        const ext = path.extname(file).toLowerCase();
        if (ext) {
          extensions.add(ext);
        }
      });

      // Map extensions to languages
      const extMap: Record<string, string> = {
        '.ts': 'TypeScript',
        '.js': 'JavaScript',
        '.jsx': 'JavaScript',
        '.tsx': 'TypeScript',
        '.py': 'Python',
        '.rs': 'Rust',
        '.go': 'Go',
        '.java': 'Java',
        '.cpp': 'C++',
        '.c': 'C',
        '.cs': 'C#',
        '.php': 'PHP',
        '.rb': 'Ruby',
      };

      extensions.forEach((ext) => {
        if (extMap[ext] && !techStack.languages.includes(extMap[ext])) {
          techStack.languages.push(extMap[ext]);
        }
      });
    } catch (error) {
      // Error reading files
    }
  }

  private async analyzeArchitecture(): Promise<ArchitectureInfo> {
    const directories = await this.getDirectories(this.rootPath);
    const layers: string[] = [];
    const patterns: string[] = [];

    // Common architectural patterns
    const layerMap: Record<string, string> = {
      src: 'Source',
      lib: 'Library',
      services: 'Service Layer',
      controllers: 'Controller Layer',
      repositories: 'Repository Layer',
      models: 'Model Layer',
      utils: 'Utility Layer',
      components: 'Component Layer',
      handlers: 'Handler Layer',
      middleware: 'Middleware Layer',
      db: 'Database Layer',
      api: 'API Layer',
    };

    directories.forEach((dir) => {
      if (layerMap[dir.toLowerCase()]) {
        layers.push(layerMap[dir.toLowerCase()]);
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

    const complexity = this.assessComplexity(directories, layers);
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
        createdDate: stats.birthtime.toISOString(),
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
    if (techStack.tools.includes('Jest') || techStack.tools.includes('Vitest')) {
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

  private assessComplexity(
    directories: string[],
    layers: string[],
  ): 'simple' | 'moderate' | 'complex' {
    const complexityScore = directories.length + layers.length;
    if (complexityScore < 5) {
      return 'simple';
    }
    if (complexityScore < 10) {
      return 'moderate';
    }
    return 'complex';
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

  private async getFileList(dirPath: string, files: string[] = []): Promise<string[]> {
    try {
      const entries = await readdir(dirPath);

      for (const entry of entries) {
        if (entry.startsWith('.')) {
          continue;
        } // Skip hidden files/directories
        const entryPath = path.join(dirPath, entry);
        const entryStat = await stat(entryPath);

        if (entryStat.isDirectory()) {
          await this.getFileList(entryPath, files);
        } else {
          files.push(entryPath);
        }
      }

      return files;
    } catch (error) {
      return files;
    }
  }
}
