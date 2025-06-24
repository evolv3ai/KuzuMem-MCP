import * as fs from 'fs';
import { z } from 'zod';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { Repository } from '../../types';
import { ensureAbsolutePath } from '../../utils/path.utils';
import { RepositoryAnalyzer } from '../../utils/repository-analyzer';
import { CoreService } from '../core/core.service';
import * as repositoryOps from '../memory-operations/repository.ops';

// Interface to avoid circular dependency
interface IMetadataService {
  updateMetadata(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    metadataContent: any,
    branch?: string,
  ): Promise<{ success: boolean; message?: string } | null>;
}

export class MemoryBankService extends CoreService {
  // Store metadata service reference separately to avoid circular dependency
  private metadataServiceRef?: IMetadataService;

  /**
   * Set metadata service reference after initialization to avoid circular dependency
   */
  setMetadataService(metadataService: IMetadataService): void {
    this.metadataServiceRef = metadataService;
  }

  async initMemoryBank(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<z.infer<typeof toolSchemas.InitMemoryBankOutputSchema>> {
    const logger = mcpContext.logger || console;
    logger.info(
      `[MemoryBankService.initMemoryBank] ENTERED. Repo: ${repositoryName}:${branch}, CPR: ${clientProjectRoot}`,
    );

    if (!this.repositoryProvider) {
      logger.error('[MemoryBankService.initMemoryBank] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    clientProjectRoot = ensureAbsolutePath(clientProjectRoot);
    logger.info(`[MemoryBankService.initMemoryBank] Absolute CPR: ${clientProjectRoot}`);

    try {
      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Validating database path for ${repositoryName}:${branch}...`,
        percent: 20,
      });

      // Initialize KuzuDB client and repositories
      const kuzuClient = await this.getKuzuClient(mcpContext, clientProjectRoot);
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Creating repository ${repositoryName}:${branch}...`,
        percent: 40,
      });

      // Create or get the repository
      const repository = await repositoryOps.getOrCreateRepositoryOp(
        mcpContext,
        repositoryName,
        branch,
        repositoryRepo,
      );

      if (!repository) {
        logger.error(
          `[MemoryBankService.initMemoryBank] Failed to create repository ${repositoryName}:${branch}`,
        );
        return {
          success: false,
          message: `Failed to create repository ${repositoryName}:${branch}`,
          path: clientProjectRoot,
        };
      }

      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Analyzing repository structure and generating metadata...`,
        percent: 70,
      });

      // Automatically seed intelligent metadata after repository creation
      const seedResult = await this.seedIntelligentMetadata(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
      );

      // CRITICAL FIX: Make metadata seeding failures more visible and configurable
      if (!seedResult.success) {
        const errorMessage = `Failed to seed metadata: ${seedResult.message}`;
        logger.error(`[MemoryBankService.initMemoryBank] ${errorMessage}`, {
          repositoryName,
          branch,
          clientProjectRoot,
          seedResult,
        });

        // Check if this is a critical metadata failure that should fail initialization
        const isCriticalMetadataFailure = this.isCriticalMetadataFailure(seedResult.message);

        if (isCriticalMetadataFailure) {
          logger.error(
            `[MemoryBankService.initMemoryBank] Critical metadata failure detected, failing initialization`,
            { errorMessage, repositoryName, branch },
          );
          return {
            success: false,
            message: `Memory bank initialization failed due to critical metadata error: ${seedResult.message}`,
            path: clientProjectRoot,
          };
        } else {
          // Non-critical failure - log as error but continue
          logger.warn(
            `[MemoryBankService.initMemoryBank] Non-critical metadata seeding failure, continuing with initialization`,
            { errorMessage, repositoryName, branch },
          );
        }
      } else {
        logger.info(
          `[MemoryBankService.initMemoryBank] Metadata seeding completed successfully for ${repositoryName}:${branch}`,
        );
      }

      await mcpContext.sendProgress({
        status: 'in_progress',
        message: `Memory bank initialization complete for ${repositoryName}:${branch}`,
        percent: 100,
      });

      logger.info(
        `[MemoryBankService.initMemoryBank] Successfully initialized memory bank for ${repositoryName}:${branch}`,
      );

      return {
        success: true,
        message: `Memory bank initialized for ${repositoryName} (branch: ${branch})${!seedResult.success ? ' (with metadata seeding warnings)' : ''}`,
        path: clientProjectRoot,
      };
    } catch (error: any) {
      logger.error(
        `[MemoryBankService.initMemoryBank] Error initializing memory bank for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return {
        success: false,
        message: `Failed to initialize memory bank: ${error.message}`,
        path: clientProjectRoot,
      };
    }
  }

  /**
   * Validates that the clientProjectRoot path exists and is accessible
   * @param clientProjectRoot - The path to validate
   * @param logger - Logger instance for error reporting
   * @throws Error if path is invalid or inaccessible
   */
  private async validateClientProjectRoot(clientProjectRoot: string, logger: any): Promise<void> {
    try {
      // Check if path exists and is readable in one operation
      await fs.promises.access(clientProjectRoot, fs.constants.F_OK | fs.constants.R_OK);

      // Check if path is a directory
      const stats = await fs.promises.stat(clientProjectRoot);
      if (!stats.isDirectory()) {
        const errorMessage = `Client project root path is not a directory: ${clientProjectRoot}`;
        logger.error(`[MemoryBankService.validateClientProjectRoot] ${errorMessage}`);
        throw new Error(errorMessage);
      }

      logger.info(
        `[MemoryBankService.validateClientProjectRoot] Path validation successful: ${clientProjectRoot}`,
      );
    } catch (error: any) {
      // Re-throw validation errors
      if (error.message.includes('Client project root path')) {
        throw error;
      }
      // Handle unexpected filesystem errors
      const errorMessage = `Failed to validate client project root path: ${error.message}`;
      logger.error(`[MemoryBankService.validateClientProjectRoot] ${errorMessage}`, {
        clientProjectRoot,
        error: error.toString(),
      });
      throw new Error(errorMessage);
    }
  }

  /**
   * Determine if a metadata failure is critical enough to fail the entire initialization
   * Critical failures include database connection issues, schema problems, etc.
   * Non-critical failures include analysis errors, missing files, etc.
   */
  private isCriticalMetadataFailure(errorMessage: string): boolean {
    const criticalPatterns = [
      'database connection',
      'schema error',
      'MetadataService not available',
      'MetadataService not initialized',
      'transaction failed',
      'connection timeout',
      'access denied',
      'permission denied',
      'disk full',
      'out of memory',
    ];

    const normalizedError = errorMessage.toLowerCase();
    return criticalPatterns.some((pattern) => normalizedError.includes(pattern));
  }

  /**
   * Seeds intelligent metadata by analyzing the actual repository structure and characteristics
   */
  async seedIntelligentMetadata(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string = 'main',
  ): Promise<{ success: boolean; message: string }> {
    const logger = mcpContext.logger || console;
    logger.info(
      `[MemoryBankService.seedIntelligentMetadata] Analyzing repository ${repositoryName}:${branch}`,
    );

    try {
      // Validate that clientProjectRoot exists and is accessible before analysis
      await this.validateClientProjectRoot(clientProjectRoot, logger);

      // Analyze the repository structure and characteristics
      const analyzer = new RepositoryAnalyzer(clientProjectRoot, logger);
      const analysisResult = await analyzer.analyzeRepository();

      logger.info(
        `[MemoryBankService.seedIntelligentMetadata] Analysis complete for ${repositoryName}:${branch}`,
        {
          projectType: analysisResult.projectType,
          languages: analysisResult.techStack.languages,
          architecture: analysisResult.architecture.pattern,
        },
      );

      // Check if metadata service is available
      if (!this.metadataServiceRef) {
        logger.warn(
          `[MemoryBankService.seedIntelligentMetadata] MetadataService not available - skipping metadata seeding`,
        );
        return {
          success: false,
          message: 'MetadataService not available for seeding metadata',
        };
      }

      const metadataContent = {
        id: `${repositoryName}-${branch}-metadata`,
        project: {
          name: repositoryName,
          created: analysisResult.createdDate,
          type: analysisResult.projectType,
          size: analysisResult.size,
        },
        tech_stack: {
          languages: analysisResult.techStack.languages,
          frameworks: analysisResult.techStack.frameworks,
          databases: analysisResult.techStack.databases,
          tools: analysisResult.techStack.tools,
          package_manager: analysisResult.techStack.packageManager,
          runtime: analysisResult.techStack.runtime,
        },
        architecture: analysisResult.architecture.pattern,
        architecture_details: {
          layers: analysisResult.architecture.layers,
          patterns: analysisResult.architecture.patterns,
          complexity: analysisResult.architecture.complexity,
        },
        memory_spec_version: '3.0.0',
        analysis_date: new Date().toISOString(),
      };

      const updateResult = await this.metadataServiceRef.updateMetadata(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        metadataContent,
        branch,
      );

      if (updateResult?.success) {
        logger.info(
          `[MemoryBankService.seedIntelligentMetadata] Successfully seeded metadata for ${repositoryName}:${branch}`,
        );
        return {
          success: true,
          message: `Intelligent metadata seeded for ${repositoryName}:${branch}`,
        };
      } else {
        const errorMessage = updateResult?.message || 'Unknown error during metadata update';
        logger.error(
          `[MemoryBankService.seedIntelligentMetadata] Failed to update metadata: ${errorMessage}`,
        );
        return {
          success: false,
          message: `Failed to seed metadata: ${errorMessage}`,
        };
      }
    } catch (error: any) {
      logger.error(
        `[MemoryBankService.seedIntelligentMetadata] Error seeding metadata for ${repositoryName}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      return {
        success: false,
        message: `Failed to analyze and seed metadata: ${error.message}`,
      };
    }
  }

  async getOrCreateRepository(
    mcpContext: ToolHandlerContext,
    clientProjectRoot: string,
    name: string,
    branch: string = 'main',
  ): Promise<Repository> {
    const logger = mcpContext.logger || console;
    if (!this.repositoryProvider) {
      logger.error('[MemoryBankService.getOrCreateRepository] RepositoryProvider not initialized');
      throw new Error('RepositoryProvider not initialized');
    }

    try {
      const repositoryRepo = this.repositoryProvider.getRepositoryRepository(clientProjectRoot);

      const repository = await repositoryOps.getOrCreateRepositoryOp(
        mcpContext,
        name,
        branch,
        repositoryRepo,
      );

      if (!repository) {
        const errorMessage = `Failed to create or retrieve repository ${name}:${branch}`;
        logger.error(`[MemoryBankService.getOrCreateRepository] ${errorMessage}`);
        throw new Error(errorMessage);
      }

      logger.info(
        `[MemoryBankService.getOrCreateRepository] Repository ${name}:${branch} retrieved/created successfully`,
      );

      return repository;
    } catch (error: any) {
      logger.error(
        `[MemoryBankService.getOrCreateRepository] Error for ${name}:${branch}: ${error.message}`,
        { error: error.toString() },
      );
      throw error;
    }
  }
}
