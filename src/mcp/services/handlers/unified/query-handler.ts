import { SdkToolHandler } from '../../../tool-handlers';
import {
  QueryInputSchema,
  ContextQueryOutputSchema,
  EntitiesQueryOutputSchema,
  RelationshipsQueryOutputSchema,
  DependenciesQueryOutputSchema,
  GovernanceQueryOutputSchema,
  HistoryQueryOutputSchema,
  TagsQueryOutputSchema,
} from '../../../schemas/unified-tool-schemas';
import { z } from 'zod';

/**
 * Query Handler
 * Handles all search and query operations across 7 different query types
 */
export const queryHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters
  const validatedParams = QueryInputSchema.parse(params);
  const { type, repository, branch = 'main' } = validatedParams;

  // 2. Get clientProjectRoot from session
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  if (!clientProjectRoot) {
    throw new Error('No active session. Use memory-bank tool with operation "init" first.');
  }

  // 3. Log the operation
  context.logger.info(`Executing query type: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
  });

  // 4. Validate type-specific required parameters
  switch (type) {
    case 'entities':
      if (!validatedParams.label) {
        throw new Error('Label is required for entities query');
      }
      break;
    case 'relationships':
      if (!validatedParams.startItemId) {
        throw new Error('startItemId is required for relationships query');
      }
      break;
    case 'dependencies':
      if (!validatedParams.componentId || !validatedParams.direction) {
        throw new Error('componentId and direction are required for dependencies query');
      }
      break;
    case 'governance':
      if (!validatedParams.componentId) {
        throw new Error('componentId is required for governance query');
      }
      break;
    case 'history':
      if (!validatedParams.itemId || !validatedParams.itemType) {
        throw new Error('itemId and itemType are required for history query');
      }
      break;
    case 'tags':
      if (!validatedParams.tagId) {
        throw new Error('tagId is required for tags query');
      }
      break;
  }

  try {
    switch (type) {
      case 'context': {
        await context.sendProgress({
          status: 'in_progress',
          message: 'Retrieving contexts...',
          percent: 50,
        });

        const result = await memoryService.getLatestContexts(
          context,
          clientProjectRoot,
          repository,
          branch,
          validatedParams.limit,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Retrieved ${result.length} contexts`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'context' as const,
          contexts: result.map((ctx) => ({
            id: ctx.id,
            iso_date: ctx.iso_date,
            agent: ctx.agent || null,
            summary: ctx.summary || null,
            observation: (ctx as any).observation || null,
            repository: ctx.repository,
            branch: ctx.branch,
            created_at: ctx.created_at || null,
            updated_at: ctx.updated_at || null,
          })),
        } satisfies z.infer<typeof ContextQueryOutputSchema>;
      }

      case 'entities': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Listing entities with label: ${validatedParams.label}`,
          percent: 50,
        });

        const result = await memoryService.listNodesByLabel(
          context,
          clientProjectRoot,
          repository,
          branch,
          validatedParams.label!,
          validatedParams.limit || 100,
          validatedParams.offset || 0,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.nodes.length} entities`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'entities' as const,
          label: result.label,
          entities: result.nodes,
          limit: result.limit,
          offset: result.offset,
          totalCount: result.totalInLabel,
        } satisfies z.infer<typeof EntitiesQueryOutputSchema>;
      }

      case 'relationships': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Finding related items for: ${validatedParams.startItemId}`,
          percent: 50,
        });

        const result = await memoryService.getRelatedItems(
          context,
          clientProjectRoot,
          repository,
          branch,
          validatedParams.startItemId!,
          {
            depth: validatedParams.depth,
            relationshipFilter: validatedParams.relationshipFilter,
            targetNodeTypeFilter: validatedParams.targetNodeTypeFilter,
          },
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.relatedItems.length} related items`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'relationships' as const,
          startItemId: validatedParams.startItemId!,
          relatedItems: result.relatedItems,
          relationshipFilter: validatedParams.relationshipFilter,
          depth: validatedParams.depth,
        } satisfies z.infer<typeof RelationshipsQueryOutputSchema>;
      }

      case 'dependencies': {
        const direction = validatedParams.direction!;
        await context.sendProgress({
          status: 'in_progress',
          message: `Getting ${direction} for component: ${validatedParams.componentId}`,
          percent: 50,
        });

        const result =
          direction === 'dependencies'
            ? await memoryService.getComponentDependencies(
                context,
                clientProjectRoot,
                repository,
                branch,
                validatedParams.componentId!,
              )
            : await memoryService.getComponentDependents(
                context,
                clientProjectRoot,
                repository,
                branch,
                validatedParams.componentId!,
              );

        const components =
          direction === 'dependencies' ? (result as any).dependencies : (result as any).dependents;

        await context.sendProgress({
          status: 'complete',
          message: `Found ${components.length} ${direction}`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'dependencies' as const,
          componentId: validatedParams.componentId!,
          direction,
          components,
        } satisfies z.infer<typeof DependenciesQueryOutputSchema>;
      }

      case 'governance': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Getting governing items for component: ${validatedParams.componentId}`,
          percent: 50,
        });

        const result = await memoryService.getGoverningItemsForComponent(
          context,
          clientProjectRoot,
          repository,
          branch,
          validatedParams.componentId!,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.decisions.length} decisions and ${result.rules.length} rules`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'governance' as const,
          componentId: validatedParams.componentId!,
          decisions: result.decisions,
          rules: result.rules,
        } satisfies z.infer<typeof GovernanceQueryOutputSchema>;
      }

      case 'history': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Getting contextual history for ${validatedParams.itemType}: ${validatedParams.itemId}`,
          percent: 50,
        });

        const result = await memoryService.getItemContextualHistory(
          context,
          clientProjectRoot,
          repository,
          branch,
          validatedParams.itemId!,
          validatedParams.itemType!,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.contextHistory.length} historical contexts`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'history' as const,
          itemId: validatedParams.itemId!,
          itemType: validatedParams.itemType!,
          contextHistory: result.contextHistory,
        } satisfies z.infer<typeof HistoryQueryOutputSchema>;
      }

      case 'tags': {
        await context.sendProgress({
          status: 'in_progress',
          message: `Finding items tagged with: ${validatedParams.tagId}`,
          percent: 50,
        });

        const result = await memoryService.findItemsByTag(
          context,
          clientProjectRoot,
          repository,
          branch,
          validatedParams.tagId!,
          validatedParams.entityType,
        );

        await context.sendProgress({
          status: 'complete',
          message: `Found ${result.items.length} tagged items`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'tags' as const,
          tagId: result.tagId,
          items: result.items.map((item: any) => ({
            id: item.id,
            type: item.type || 'Unknown',
            ...item,
          })),
        } satisfies z.infer<typeof TagsQueryOutputSchema>;
      }

      default:
        throw new Error(`Unknown query type: ${type}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`Query failed: ${errorMessage}`, {
      type,
      error,
    });

    await context.sendProgress({
      status: 'error',
      message: `Failed to execute ${type} query: ${errorMessage}`,
      percent: 100,
      isFinal: true,
    });

    throw error;
  }
};