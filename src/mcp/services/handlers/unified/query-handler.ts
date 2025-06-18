import { QueryInputSchema } from '../../../schemas/unified-tool-schemas';
import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, validateSession, logToolExecution } from '../../../utils/error-utils';

// TypeScript interfaces for query parameters
interface QueryParams {
  type:
    | 'context'
    | 'entities'
    | 'relationships'
    | 'dependencies'
    | 'governance'
    | 'history'
    | 'tags';
  repository: string;
  branch?: string;
  limit?: number;
  offset?: number;
  label?: string;
  startItemId?: string;
  depth?: number;
  relationshipFilter?: string;
  targetNodeTypeFilter?: string;
  componentId?: string;
  direction?: 'dependencies' | 'dependents';
  itemId?: string;
  itemType?: string;
  tagId?: string;
  entityType?: string;
}

/**
 * Query Handler
 * Handles all search and query operations across 7 different query types
 */
export const queryHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters using Zod (includes all type-specific validation)
  const validatedParams = QueryInputSchema.parse(params);

  const { type, repository, branch = 'main' } = validatedParams;

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'query');

  // 3. Log the operation
  logToolExecution(context, `query type: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
  });

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
          contexts: result.map((ctx: any) => ({
            id: ctx.id,
            iso_date: ctx.iso_date,
            agent: ctx.agent || null,
            summary: ctx.summary || null,
            observation: ctx.observation || null,
            repository: ctx.repository,
            branch: ctx.branch,
            created_at: ctx.created_at || null,
            updated_at: ctx.updated_at || null,
          })),
        };
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
          message: `Found ${result.entities.length} entities`,
          percent: 100,
          isFinal: true,
        });

        return {
          type: 'entities' as const,
          label: result.label,
          entities: result.entities,
          limit: result.limit,
          offset: result.offset,
          totalCount: result.totalCount,
        };
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
        };
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
        };
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
        };
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
          validatedParams.itemType! as 'Component' | 'Decision' | 'Rule',
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
        };
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
        };
      }

      default:
        throw new Error(`Unknown query type: ${type}`);
    }
  } catch (error) {
    await handleToolError(error, context, `${type} query`, type);
    throw error;
  }
};
