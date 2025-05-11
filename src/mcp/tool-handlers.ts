import { MemoryService } from '../services/memory.service';
// Minimal types needed for handler construction, assuming MemoryService methods handle full type details.
import { Context, Metadata } from '../types';

type ToolArgs = any;

interface ToolHandler {
  (params: ToolArgs, memoryService: MemoryService): Promise<any>;
}

const serviceMethodNotFoundError = (toolName: string, methodName: string) => {
  return new Error(
    `Tool '${toolName}' requires MemoryService.${methodName}, which is not implemented or exposed.`,
  );
};

export const toolHandlers: Record<string, ToolHandler> = {
  'init-memory-bank': async (toolArgs, memoryService) => {
    const { repository, branch = 'main' } = toolArgs;
    if (!repository) {
      throw new Error('Missing repository parameter for init-memory-bank');
    }
    await memoryService.initMemoryBank(repository, branch);
    return {
      success: true,
      message: `Memory bank initialized for ${repository} (branch: ${branch})`,
    };
  },
  'get-metadata': async (toolArgs, memoryService) => {
    const { repository, branch = 'main' } = toolArgs;
    if (!repository) {
      throw new Error('Missing repository parameter for get-metadata');
    }
    return memoryService.getMetadata(repository, branch);
  },
  'update-metadata': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', metadata } = toolArgs;
    if (!repository) {
      throw new Error('Missing repository parameter for update-metadata');
    }
    if (!metadata) {
      throw new Error('Missing metadata parameter for update-metadata');
    }
    await memoryService.updateMetadata(repository, metadata, branch);
    return {
      success: true,
      message: `Metadata updated for ${repository} (branch: ${branch})`,
    };
  },
  'get-context': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', latest, limit } = toolArgs;
    if (!repository) {
      throw new Error('Missing repository parameter for get-context');
    }
    const effectiveLimit = latest === true ? 1 : limit;
    return memoryService.getLatestContexts(repository, branch, effectiveLimit);
  },
  'update-context': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', summary, agent, decision, observation, issue } = toolArgs;
    if (!repository) {
      throw new Error('Missing repository for update-context');
    }
    if (typeof memoryService.updateContext !== 'function') {
      throw serviceMethodNotFoundError('update-context', 'updateContext');
    }
    const updatedContext = await memoryService.updateContext({
      repository,
      branch,
      summary,
      agent,
      decision,
      observation,
      issue,
    });

    if (updatedContext) {
      return {
        success: true,
        message: `Context updated for ${repository} (branch: ${branch})`,
        context: updatedContext, // Optionally return the context
      };
    } else {
      return {
        success: false,
        error: `Failed to update context for ${repository} (branch: ${branch}). Repository or context not found, or an error occurred.`,
      };
    }
  },
  'add-component': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', id, name, kind, status, depends_on } = toolArgs;
    if (!repository || !id || !name) {
      throw new Error('Missing required params for add-component (repository, id, name)');
    }
    if (typeof memoryService.upsertComponent !== 'function') {
      throw serviceMethodNotFoundError('add-component', 'upsertComponent');
    }
    await memoryService.upsertComponent(repository, branch, {
      yaml_id: id,
      name,
      kind,
      status,
      depends_on: depends_on || [],
    });
    return {
      success: true,
      message: `Component '${name}' (id: ${id}) added/updated in ${repository} (branch: ${branch})`,
    };
  },
  'add-decision': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', id, name, date, context } = toolArgs;
    if (!repository || !id || !name || !date) {
      throw new Error('Missing required params for add-decision (repository, id, name, date)');
    }
    if (typeof memoryService.upsertDecision !== 'function') {
      throw serviceMethodNotFoundError('add-decision', 'upsertDecision');
    }
    await memoryService.upsertDecision(repository, branch, {
      yaml_id: id,
      name,
      date,
      context,
    });
    return {
      success: true,
      message: `Decision '${name}' (id: ${id}) added/updated in ${repository} (branch: ${branch})`,
    };
  },
  'add-rule': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', id, name, created, content, status, triggers } = toolArgs;
    if (!repository || !id || !name || !created) {
      throw new Error('Missing required params for add-rule (repository, id, name, created)');
    }
    if (typeof (memoryService as any).upsertRule !== 'function') {
      throw serviceMethodNotFoundError('add-rule', 'upsertRule');
    }
    await (memoryService as any).upsertRule(
      repository,
      { yaml_id: id, name, created, content, status, triggers },
      branch,
    );
    return {
      success: true,
      message: `Rule '${name}' (id: ${id}) added/updated in ${repository} (branch: ${branch})`,
    };
  },
  'get-component-dependencies': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', componentId } = toolArgs;
    if (!repository || !componentId) {
      throw new Error('Missing params for get-component-dependencies');
    }
    if (typeof memoryService.getComponentDependencies !== 'function') {
      throw serviceMethodNotFoundError('get-component-dependencies', 'getComponentDependencies');
    }
    return memoryService.getComponentDependencies(repository, branch, componentId);
  },
  'get-component-dependents': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', componentId } = toolArgs;
    if (!repository || !componentId) {
      throw new Error('Missing params for get-component-dependents');
    }
    if (typeof (memoryService as any).getComponentDependents !== 'function') {
      throw serviceMethodNotFoundError('get-component-dependents', 'getComponentDependents');
    }
    return (memoryService as any).getComponentDependents(repository, branch, componentId);
  },
  'get-item-contextual-history': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', itemId, itemType } = toolArgs;
    console.error(
      `DEBUG: tool-handlers.ts: Destructured itemType = >>>${itemType}<<<`,
      'Full toolArgs:',
      toolArgs,
    );
    if (!repository || !itemId || !itemType) {
      console.error(
        `DEBUG: tool-handlers.ts: Validation failed! Repo: ${repository}, ItemId: ${itemId}, ItemType: ${itemType}`,
      );
      throw new Error(
        'Missing params for get-item-contextual-history (repository, itemId, itemType)',
      );
    }

    return (memoryService as any).getItemContextualHistory(repository, branch, itemId, itemType);
  },
  'get-governing-items-for-component': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', componentId } = toolArgs;
    if (!repository || !componentId) {
      throw new Error('Missing params for get-governing-items-for-component');
    }
    if (typeof (memoryService as any).getGoverningItemsForComponent !== 'function') {
      throw serviceMethodNotFoundError(
        'get-governing-items-for-component',
        'getGoverningItemsForComponent',
      );
    }
    return (memoryService as any).getGoverningItemsForComponent(repository, branch, componentId);
  },
  'get-related-items': async (toolArgs, memoryService) => {
    const {
      repository,
      branch = 'main',
      startItemId,
      relationshipTypes,
      depth,
      direction,
    } = toolArgs;
    if (!repository || !startItemId) {
      throw new Error('Missing params for get-related-items (repository, startItemId)');
    }

    let relTypesArray: string[] | undefined;
    if (typeof relationshipTypes === 'string' && relationshipTypes.length > 0) {
      relTypesArray = relationshipTypes
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (Array.isArray(relationshipTypes)) {
      relTypesArray = relationshipTypes;
    }

    const serviceParams = {
      relationshipTypes: relTypesArray,
      depth,
      direction,
    };

    if (typeof (memoryService as any).getRelatedItems !== 'function') {
      throw serviceMethodNotFoundError('get-related-items', 'getRelatedItems');
    }
    return (memoryService as any).getRelatedItems(repository, branch, startItemId, serviceParams);
  },
  'k-core-decomposition': async (toolArgs, memoryService) => {
    const { repository, branch = 'main', k } = toolArgs;
    if (!repository) {
      throw new Error('Missing repository for k-core-decomposition');
    }
    if (typeof (memoryService as any).kCoreDecomposition !== 'function') {
      throw serviceMethodNotFoundError('k-core-decomposition', 'kCoreDecomposition');
    }
    return (memoryService as any).kCoreDecomposition(repository, branch, k);
  },
  'louvain-community-detection': async (toolArgs, memoryService) => {
    const { repository, branch = 'main' } = toolArgs;
    if (!repository) {
      throw new Error('Missing repository for louvain-community-detection');
    }
    if (typeof (memoryService as any).louvainCommunityDetection !== 'function') {
      throw serviceMethodNotFoundError('louvain-community-detection', 'louvainCommunityDetection');
    }
    return (memoryService as any).louvainCommunityDetection(repository, branch);
  },
  pagerank: async (toolArgs, memoryService) => {
    const { repository, branch = 'main', dampingFactor, iterations } = toolArgs;
    if (!repository) {
      throw new Error('Missing repository for pagerank');
    }
    if (typeof (memoryService as any).pageRank !== 'function') {
      throw serviceMethodNotFoundError('pagerank', 'pageRank');
    }
    return (memoryService as any).pageRank(repository, branch, dampingFactor, iterations);
  },
  'strongly-connected-components': async (toolArgs, memoryService) => {
    const { repository, branch = 'main' } = toolArgs;
    if (!repository) {
      throw new Error('Missing repository for strongly-connected-components');
    }
    if (typeof memoryService.getStronglyConnectedComponents !== 'function') {
      throw serviceMethodNotFoundError(
        'strongly-connected-components',
        'getStronglyConnectedComponents',
      );
    }
    return memoryService.getStronglyConnectedComponents(
      repository,
      branch,
      (toolArgs as any).maxIterations,
    );
  },
  'weakly-connected-components': async (toolArgs, memoryService) => {
    const { repository, branch = 'main' } = toolArgs;
    if (!repository) {
      throw new Error('Missing repository for weakly-connected-components');
    }
    if (typeof memoryService.getWeaklyConnectedComponents !== 'function') {
      throw serviceMethodNotFoundError(
        'weakly-connected-components',
        'getWeaklyConnectedComponents',
      );
    }
    return memoryService.getWeaklyConnectedComponents(
      repository,
      branch,
      (toolArgs as any).maxIterations,
    );
  },
  'shortest-path': async (toolArgs, memoryService) => {
    const {
      repository,
      branch = 'main',
      projectedGraphName,
      nodeTableNames,
      relationshipTableNames,
      startNodeId,
      endNodeId,
      relationshipTypes,
      direction,
      algorithm,
    } = toolArgs;

    if (
      !repository ||
      !branch ||
      !projectedGraphName ||
      !nodeTableNames ||
      !relationshipTableNames ||
      !startNodeId ||
      !endNodeId
    ) {
      throw new Error(
        'Missing required params for shortest-path (repository, branch, projectedGraphName, nodeTableNames, relationshipTableNames, startNodeId, endNodeId)',
      );
    }

    if (typeof (memoryService as any).shortestPath !== 'function') {
      throw serviceMethodNotFoundError('shortest-path', 'shortestPath');
    }
    return (memoryService as any).shortestPath(repository, branch, startNodeId, endNodeId, {
      relationshipTypes,
      direction,
      algorithm,
    });
  },
};
