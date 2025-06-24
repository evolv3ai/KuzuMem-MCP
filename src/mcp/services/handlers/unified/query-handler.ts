import { SdkToolHandler } from '../../../tool-handlers';
import { handleToolError, logToolExecution, validateSession } from '../../../utils/error-utils';

// TypeScript interfaces for query input parameters
interface BaseQueryParams {
  type: string;
  repository: string;
  branch?: string;
}

interface ContextQueryParams extends BaseQueryParams {
  type: 'context';
  latest?: boolean;
  limit?: number;
}

interface EntitiesQueryParams extends BaseQueryParams {
  type: 'entities';
  label?: string;
  limit?: number;
  offset?: number;
}

interface RelationshipsQueryParams extends BaseQueryParams {
  type: 'relationships';
  startItemId?: string;
  depth?: number;
  relationshipFilter?: string;
  targetNodeTypeFilter?: string;
}

interface DependenciesQueryParams extends BaseQueryParams {
  type: 'dependencies';
  componentId?: string;
  direction?: 'dependencies' | 'dependents';
}

interface GovernanceQueryParams extends BaseQueryParams {
  type: 'governance';
  componentId?: string;
}

interface HistoryQueryParams extends BaseQueryParams {
  type: 'history';
  itemId?: string;
  itemType?: string;
}

interface TagsQueryParams extends BaseQueryParams {
  type: 'tags';
  tagId?: string;
  entityType?: string;
}

type QueryParams =
  | ContextQueryParams
  | EntitiesQueryParams
  | RelationshipsQueryParams
  | DependenciesQueryParams
  | GovernanceQueryParams
  | HistoryQueryParams
  | TagsQueryParams;

/**
 * Unified query handler for all query types
 * Handles all types of graph and data queries
 */
export const queryHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Validate and extract parameters
  const validatedParams = params as unknown as QueryParams;

  // Basic validation
  if (!validatedParams.type) {
    throw new Error('type parameter is required');
  }
  if (!validatedParams.repository) {
    throw new Error('repository parameter is required');
  }

  const { type, repository, branch = 'main' } = validatedParams;

  // 2. Validate session and get clientProjectRoot
  const clientProjectRoot = validateSession(context, 'query');

  // 3. Log the operation
  logToolExecution(context, `query operation: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    type,
  });

  try {
    switch (type) {
      case 'context': {
        const { latest = false, limit } = validatedParams as ContextQueryParams;
        const contextService = await memoryService.context;
        const contexts = await contextService.getLatestContexts(
          context,
          clientProjectRoot,
          repository,
          branch,
          limit,
        );
        return { type: 'context', contexts };
      }

      case 'entities': {
        const { label, limit, offset } = validatedParams as EntitiesQueryParams;
        if (!label) {
          throw new Error('Required fields missing for the specified query type');
        }
        const graphQueryService = await memoryService.graphQuery;
        const result = await graphQueryService.listNodesByLabel(
          context,
          clientProjectRoot,
          repository,
          branch,
          label as string,
          limit || 50,
          offset || 0,
        );
        return {
          type: 'entities',
          label,
          entities: result.entities || [],
          limit: limit || 50,
          offset: offset || 0,
          totalCount: result.entities?.length || 0,
        };
      }

      case 'relationships': {
        const { startItemId, depth, relationshipFilter, targetNodeTypeFilter } =
          validatedParams as RelationshipsQueryParams;
        if (!startItemId) {
          throw new Error('Required fields missing for the specified query type');
        }
        const graphQueryService = await memoryService.graphQuery;
        const result = await graphQueryService.getRelatedItems(
          context,
          clientProjectRoot,
          repository,
          branch,
          startItemId,
          {
            depth: depth || 2,
            relationshipFilter: relationshipFilter || '',
            targetNodeTypeFilter: targetNodeTypeFilter,
          },
        );
        return {
          type: 'relationships',
          startItemId,
          relatedItems: result.relatedItems || [],
          relationshipFilter,
          depth: depth || 2,
        };
      }

      case 'dependencies': {
        const { componentId, direction } = validatedParams as DependenciesQueryParams;
        if (!componentId || !direction) {
          throw new Error('Required fields missing for the specified query type');
        }

        const graphQueryService = await memoryService.graphQuery;
        if (direction === 'dependencies') {
          const result = await graphQueryService.getComponentDependencies(
            context,
            clientProjectRoot,
            repository,
            branch,
            componentId,
          );
          return {
            type: 'dependencies',
            componentId,
            direction,
            components: result.dependencies || [],
          };
        } else {
          const result = await graphQueryService.getComponentDependents(
            context,
            clientProjectRoot,
            repository,
            branch,
            componentId,
          );
          return {
            type: 'dependencies',
            componentId,
            direction,
            components: result.dependents || [],
          };
        }
      }

      case 'governance': {
        const { componentId } = validatedParams as GovernanceQueryParams;
        if (!componentId) {
          throw new Error('Required fields missing for the specified query type');
        }
        const graphQueryService = await memoryService.graphQuery;
        const result = await graphQueryService.getGoverningItemsForComponent(
          context,
          clientProjectRoot,
          repository,
          branch,
          componentId,
        );
        return {
          type: 'governance',
          componentId,
          decisions: result.decisions || [],
          rules: result.rules || [],
        };
      }

      case 'history': {
        const { itemId, itemType } = validatedParams as HistoryQueryParams;
        if (!itemId || !itemType) {
          throw new Error('Required fields missing for the specified query type');
        }
        const graphQueryService = await memoryService.graphQuery;
        const result = await graphQueryService.getItemContextualHistory(
          context,
          clientProjectRoot,
          repository,
          branch,
          itemId,
          itemType as 'Component' | 'Decision' | 'Rule',
        );
        return {
          type: 'history',
          itemId,
          itemType,
          contextHistory: result.contextHistory || [],
        };
      }

      case 'tags': {
        const { tagId, entityType } = validatedParams as TagsQueryParams;
        if (!tagId) {
          throw new Error('Required fields missing for the specified query type');
        }
        const graphQueryService = await memoryService.graphQuery;
        const result = await graphQueryService.findItemsByTag(
          context,
          clientProjectRoot,
          repository,
          branch,
          tagId,
          entityType,
        );
        return {
          type: 'tags',
          tagId,
          items: result.items || [],
        };
      }

      default:
        throw new Error(
          "Invalid enum value. Expected 'context' | 'entities' | 'relationships' | 'dependencies' | 'governance' | 'history' | 'tags', received '" +
            type +
            "'",
        );
    }
  } catch (error) {
    await handleToolError(error, context, `${type} query`, 'query');
    throw error; // Re-throw the error instead of returning an error object
  }
};
