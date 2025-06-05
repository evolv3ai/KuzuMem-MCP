import { ComponentRepository, RepositoryRepository } from '../../repositories';
import { Component, ComponentInput } from '../../types';
import { z } from 'zod';
import { AddComponentInputSchema, ComponentSchema } from '../../mcp/schemas/tool-schemas';
import { EnrichedRequestHandlerExtra } from '../../mcp/types/sdk-custom';

// Helper function to parse timestamps from BaseEntity (Date | undefined) to string | null
function parseBaseEntityTimestamp(timestamp: Date | undefined): string | null {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  return null;
}

/**
 * Creates or updates a component in a repository.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param componentDataFromTool - Data for the component to be upserted.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to the upserted Component object or null if repository not found.
 */
export async function upsertComponentOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  componentDataFromTool: z.infer<typeof AddComponentInputSchema>,
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository,
): Promise<z.infer<typeof ComponentSchema> | null> {
  const logger = mcpContext.logger; // Prefer direct usage, fallback handled by McpServer typically

  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(
      `[component.ops.upsertComponentOp] Repository not found: ${repositoryName}/${branch}`,
    );
    return null;
  }

  const inputForRepo: ComponentInput = {
    id: componentDataFromTool.id,
    name: componentDataFromTool.name,
    kind: componentDataFromTool.kind,
    status: componentDataFromTool.status || 'active',
    depends_on:
      componentDataFromTool.depends_on === null ? undefined : componentDataFromTool.depends_on,
    branch: branch, // branch is part of ComponentInput for repository context
  };

  logger.debug(
    `[component.ops.upsertComponentOp] Calling componentRepo.upsertComponent for ${inputForRepo.id} in repo ${repository.id}`,
    { inputForRepo },
  );
  const upsertedComponent = await componentRepo.upsertComponent(repository.id, inputForRepo);
  if (!upsertedComponent) {
    logger.warn(
      `[component.ops.upsertComponentOp] componentRepo.upsertComponent returned null for ${componentDataFromTool.id} in ${repositoryName}:${branch}`,
    );
    return null;
  }
  logger.info(
    `[component.ops.upsertComponentOp] Component ${upsertedComponent.id} upserted successfully in ${repositoryName}:${branch}.`,
  );
  return transformToZodComponent(upsertedComponent, repositoryName, branch, logger);
}

/**
 * Retrieves all upstream dependencies for a component.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param componentId - The ID (yaml_id) of the component.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to an array of dependent Component objects.
 */
export async function getComponentDependenciesOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  componentId: string,
  repositoryRepo: RepositoryRepository, // Included for consistency, though not directly used if componentRepo handles repo context
  componentRepo: ComponentRepository,
): Promise<z.infer<typeof ComponentSchema>[]> {
  const logger = mcpContext.logger;
  logger.debug(
    `[component.ops.getComponentDependenciesOp] For component ${componentId} in ${repositoryName}:${branch}`,
  );

  // Assuming componentRepo.getComponentDependencies can operate with repositoryName and branch context
  const dependencies = await componentRepo.getComponentDependencies(
    repositoryName,
    componentId,
    branch,
  );
  logger.debug(
    `[component.ops.getComponentDependenciesOp] Found ${dependencies.length} dependencies for ${componentId}.`,
  );
  return dependencies.map((comp) => transformToZodComponent(comp, repositoryName, branch, logger));
}

/**
 * Retrieves all downstream dependents of a component.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param componentId - The ID (yaml_id) of the component.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to an array of dependent Component objects.
 */
export async function getComponentDependentsOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string,
  branch: string,
  componentId: string,
  repositoryRepo: RepositoryRepository, // Included for consistency
  componentRepo: ComponentRepository,
): Promise<z.infer<typeof ComponentSchema>[]> {
  const logger = mcpContext.logger;
  logger.debug(
    `[component.ops.getComponentDependentsOp] For component ${componentId} in ${repositoryName}:${branch}`,
  );

  const dependents = await componentRepo.getComponentDependents(
    repositoryName,
    componentId,
    branch,
  );
  logger.debug(
    `[component.ops.getComponentDependentsOp] Found ${dependents.length} dependents for ${componentId}.`,
  );
  return dependents.map((comp) => transformToZodComponent(comp, repositoryName, branch, logger));
}

/**
 * Retrieves all active components for a repository and branch.
 *
 * @param mcpContext - The MCP server request context.
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to an array of active Component objects.
 */
export async function getActiveComponentsOp(
  mcpContext: EnrichedRequestHandlerExtra,
  repositoryName: string, // Changed from repositoryId to repositoryName for consistency
  branch: string,
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository,
): Promise<z.infer<typeof ComponentSchema>[]> {
  const logger = mcpContext.logger;

  logger.debug(`[component.ops.getActiveComponentsOp] For ${repositoryName}:${branch}`);
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    logger.warn(
      `[component.ops.getActiveComponentsOp] Repository not found: ${repositoryName}/${branch}`,
    );
    return [];
  }
  // componentRepo.getActiveComponents now takes repositoryId (which is repository.id)
  const activeComponents = await componentRepo.getActiveComponents(repository.id, branch);
  logger.debug(
    `[component.ops.getActiveComponentsOp] Found ${activeComponents.length} active components for ${repositoryName}:${branch}.`,
  );
  return activeComponents.map((comp) =>
    transformToZodComponent(comp, repositoryName, branch, logger),
  );
}

// Helper function to transform internal Component to Zod ComponentSchema
function transformToZodComponent(
  component: Component,
  repositoryName: string,
  branch: string,
  logger: EnrichedRequestHandlerExtra['logger'], // Changed type here to match context's logger
): z.infer<typeof ComponentSchema> {
  if (!component) {
    // This case should ideally not happen if called after successful DB ops.
    // If it does, it's an issue, and returning an empty/default object might hide problems.
    // Consider throwing an error or logging a more severe warning.
    logger.error(
      '[component.ops.transformToZodComponent] Received null or undefined component. This indicates an issue upstream.',
    );
    // Returning a structure that matches the schema but indicates an error or empty state.
    // However, the schema might not allow for all fields to be truly optional or error-indicative.
    // For now, let's assume this path is highly unlikely if logic prior is correct.
    // Throwing an error might be safer to make issues visible.
    throw new Error('transformToZodComponent received null or undefined component');
  }
  // Ensure all required fields by ComponentSchema are present
  return {
    id: component.id, // Assuming component.id is always present and string
    name: component.name, // Assuming component.name is always present and string
    kind: component.kind || null, // ComponentSchema allows kind to be string | null
    status: component.status || 'active', // ComponentSchema allows status to be string | null
    depends_on:
      component.depends_on && component.depends_on.length > 0 ? component.depends_on : null, // ComponentSchema allows array or null
    repository: `${repositoryName}:${branch}`, // Constructed repository string ID
    branch: branch, // Branch is part of schema
    created_at: parseBaseEntityTimestamp(component.created_at), // Handles Date -> string | null
    updated_at: parseBaseEntityTimestamp(component.updated_at), // Handles Date -> string | null
    // Ensure any other fields required by ComponentSchema are included here.
    // If ComponentSchema has more required fields not in the internal Component type,
    // they need to be added or the types/schemas need alignment.
  };
}
