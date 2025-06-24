import { z } from 'zod';
import * as toolSchemas from '../../mcp/schemas/unified-tool-schemas';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { Repository } from '../../types';
import { ensureAbsolutePath } from '../../utils/path.utils';
import { RepositoryAnalyzer } from '../../utils/repository-analyzer';
import { CoreService } from '../core/core.service';
import * as repositoryOps from '../memory-operations/repository.ops';

export class MemoryBankService extends CoreService {
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

      if (!seedResult.success) {
        logger.warn(
          `[MemoryBankService.initMemoryBank] Failed to seed metadata: ${seedResult.message}`,
        );
        // Continue despite metadata seeding failure
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
        message: `Memory bank initialized for ${repositoryName} (branch: ${branch})`,
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
      // Analyze the repository structure and characteristics
      const analyzer = new RepositoryAnalyzer(clientProjectRoot);
      const analysisResult = await analyzer.analyzeRepository();

      logger.info(
        `[MemoryBankService.seedIntelligentMetadata] Analysis complete for ${repositoryName}:${branch}`,
        {
          projectType: analysisResult.projectType,
          languages: analysisResult.techStack.languages,
          architecture: analysisResult.architecture.pattern,
        },
      );

      // Get the MetadataService and update metadata with analyzed data
      if (!this.memoryService || !this.memoryService.metadata) {
        throw new Error('MetadataService not initialized in MemoryService');
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

      const updateResult = await this.memoryService.metadata.updateMetadata(
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
