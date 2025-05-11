import { MemoryService } from '../services/memory.service';
// Minimal types needed for handler construction, assuming MemoryService methods handle full type details.
import { Context, Metadata } from '../types/index'; // For global types
import { ToolHandler } from './types'; // For MCP specific ToolHandler

// Import Operation Classes
import { ComponentDependenciesOperation } from './streaming/operations/component-dependencies.operation';
import { ComponentDependentsOperation } from './streaming/operations/component-dependents.operation';
import { ItemContextualHistoryOperation } from './streaming/operations/item-contextual-history.operation';
import { GoverningItemsForComponentOperation } from './streaming/operations/governing-items-for-component.operation';
import { RelatedItemsOperation } from './streaming/operations/related-items.operation';
import { ShortestPathOperation } from './streaming/operations/shortest-path.operation';
import { KCoreDecompositionOperation } from './streaming/operations/k-core-decomposition.operation';
import { LouvainCommunityDetectionOperation } from './streaming/operations/louvain-community-detection.operation';
import { PageRankOperation } from './streaming/operations/pagerank.operation';
import { StronglyConnectedComponentsOperation } from './streaming/operations/strongly-connected-components.operation';
import { WeaklyConnectedComponentsOperation } from './streaming/operations/weakly-connected-components.operation';
// ... (other operation class imports will be added here as we update their handlers)

type ToolArgs = any;

const serviceMethodNotFoundError = (toolName: string, methodName: string) => {
  return new Error(
    `Tool '${toolName}' requires MemoryService.${methodName}, which is not implemented or exposed.`,
  );
};

export const toolHandlers: Record<string, ToolHandler> = {
  'init-memory-bank': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main' } = toolArgs as any;
    if (!repository) {
      throw new Error('Missing repository parameter for init-memory-bank');
    }
    await memoryService.initMemoryBank(repository, branch);
    return {
      success: true,
      message: `Memory bank initialized for ${repository} (branch: ${branch})`,
    };
  },
  'get-metadata': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main' } = toolArgs as any;
    if (!repository) {
      throw new Error('Missing repository parameter for get-metadata');
    }
    return memoryService.getMetadata(repository, branch);
  },
  'update-metadata': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', metadata } = toolArgs as any;
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
  'get-context': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', latest, limit } = toolArgs as any;
    if (!repository) {
      throw new Error('Missing repository parameter for get-context');
    }
    const effectiveLimit = latest === true ? 1 : limit;
    return memoryService.getLatestContexts(repository, branch, effectiveLimit);
  },
  'update-context': async (toolArgs, memoryService, progressHandler) => {
    const {
      repository,
      branch = 'main',
      summary,
      agent,
      decision,
      observation,
      issue,
    } = toolArgs as any;
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
  'add-component': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', id, name, kind, status, depends_on } = toolArgs as any;
    if (!repository || !id || !name) {
      throw new Error('Missing required params for add-component (repository, id, name)');
    }
    if (typeof memoryService.upsertComponent !== 'function') {
      throw serviceMethodNotFoundError('add-component', 'upsertComponent');
    }
    await memoryService.upsertComponent(repository, branch, {
      id: id,
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
  'add-decision': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', id, name, date, context } = toolArgs as any;
    if (!repository || !id || !name || !date) {
      throw new Error('Missing required params for add-decision (repository, id, name, date)');
    }
    if (typeof memoryService.upsertDecision !== 'function') {
      throw serviceMethodNotFoundError('add-decision', 'upsertDecision');
    }
    await memoryService.upsertDecision(repository, branch, {
      id: id,
      name,
      date,
      context,
    });
    return {
      success: true,
      message: `Decision '${name}' (id: ${id}) added/updated in ${repository} (branch: ${branch})`,
    };
  },
  'add-rule': async (toolArgs, memoryService, progressHandler) => {
    const {
      repository,
      branch = 'main',
      id,
      name,
      created,
      content,
      status,
      triggers,
    } = toolArgs as any;
    if (!repository || !id || !name || !created) {
      throw new Error('Missing required params for add-rule (repository, id, name, created)');
    }
    if (typeof (memoryService as any).upsertRule !== 'function') {
      throw serviceMethodNotFoundError('add-rule', 'upsertRule');
    }
    await (memoryService as any).upsertRule(
      repository,
      { id: id, name, created, content, status, triggers },
      branch,
    );
    return {
      success: true,
      message: `Rule '${name}' (id: ${id}) added/updated in ${repository} (branch: ${branch})`,
    };
  },
  'get-component-dependencies': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', componentId, depth = 1 } = toolArgs as any;

    if (!repository || !componentId) {
      const errorMsg =
        'Missing required parameters for get-component-dependencies: repository and componentId are required';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const resultFromOperation = await ComponentDependenciesOperation.execute(
      repository,
      branch,
      componentId,
      depth,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        // Send the entire wrapper object
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
  'get-component-dependents': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', componentId } = toolArgs as any;

    if (!repository || !componentId) {
      const errorMsg =
        'Missing required parameters for get-component-dependents: repository and componentId are required';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const resultFromOperation = await ComponentDependentsOperation.execute(
      repository,
      branch,
      componentId,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        // Send the entire wrapper object
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
  'get-item-contextual-history': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', itemId, itemType } = toolArgs as any;

    if (!repository || !itemId || !itemType) {
      const errorMsg =
        'Missing required parameters for get-item-contextual-history: repository, itemId, and itemType are required';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }
    const validItemTypes = ['Component', 'Decision', 'Rule'];
    if (!validItemTypes.includes(itemType)) {
      const errorMsg = `Invalid itemType: ${itemType}. Must be one of ${validItemTypes.join(', ')}`;
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const resultFromOperation = await ItemContextualHistoryOperation.execute(
      repository,
      branch,
      itemId,
      itemType,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        // Send the entire wrapper object
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
  'get-governing-items-for-component': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', componentId } = toolArgs as any;

    if (!repository || !componentId) {
      const errorMsg =
        'Missing required parameters for get-governing-items-for-component: repository and componentId are required';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const resultFromOperation = await GoverningItemsForComponentOperation.execute(
      repository,
      branch,
      componentId,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        // Send the entire wrapper object (it was already like this, just confirming)
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
  'get-related-items': async (toolArgs, memoryService, progressHandler) => {
    const {
      repository,
      branch = 'main',
      startItemId,
      relationshipTypes,
      depth,
      direction,
      params,
    } = toolArgs as any;

    if (!repository || !startItemId) {
      const errorMsg =
        'Missing required parameters for get-related-items: repository and startItemId are required';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const operationParams = params || {
      relationshipTypes,
      depth,
      direction,
    };
    if (operationParams.depth === undefined && depth !== undefined) {
      operationParams.depth = depth;
    }
    if (operationParams.relationshipTypes === undefined && relationshipTypes !== undefined) {
      operationParams.relationshipTypes = relationshipTypes;
    }
    if (operationParams.direction === undefined && direction !== undefined) {
      operationParams.direction = direction;
    }

    const resultFromOperation = await RelatedItemsOperation.execute(
      repository,
      branch,
      startItemId,
      operationParams,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        // Send the entire wrapper object
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
  'k-core-decomposition': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', k } = toolArgs as any;

    if (!repository) {
      const errorMsg = 'Missing required parameter for k-core-decomposition: repository';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const resultFromOperation = await KCoreDecompositionOperation.execute(
      repository,
      branch,
      k,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        // Send the entire wrapper object
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
  'louvain-community-detection': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main' } = toolArgs as any;

    if (!repository) {
      const errorMsg = 'Missing required parameter for louvain-community-detection: repository';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const resultFromOperation = await LouvainCommunityDetectionOperation.execute(
      repository,
      branch,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        // Send the entire wrapper object
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
  pagerank: async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', dampingFactor, iterations } = toolArgs as any;

    if (!repository) {
      const errorMsg = 'Missing required parameter for pagerank: repository';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const resultFromOperation = await PageRankOperation.execute(
      repository,
      branch,
      dampingFactor,
      iterations,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        // Send the entire wrapper object
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
  'strongly-connected-components': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', maxIterations } = toolArgs as any;

    if (!repository) {
      const errorMsg = 'Missing required parameter for strongly-connected-components: repository';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const resultFromOperation = await StronglyConnectedComponentsOperation.execute(
      repository,
      branch,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        // Send the entire wrapper object
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
  'weakly-connected-components': async (toolArgs, memoryService, progressHandler) => {
    const { repository, branch = 'main', maxIterations } = toolArgs as any;

    if (!repository) {
      const errorMsg = 'Missing required parameter for weakly-connected-components: repository';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const resultFromOperation = await WeaklyConnectedComponentsOperation.execute(
      repository,
      branch,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        // Send the entire wrapper object
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
  'shortest-path': async (toolArgs, memoryService, progressHandler) => {
    const {
      repository,
      branch = 'main',
      startNodeId,
      endNodeId,
      relationshipTypes,
      direction,
      algorithm,
      params,
    } = toolArgs as any;

    if (!repository || !startNodeId || !endNodeId) {
      const errorMsg =
        'Missing required parameters for shortest-path: repository, startNodeId, and endNodeId are required';
      if (progressHandler) {
        progressHandler.sendFinalProgress({ error: errorMsg, status: 'error' });
        progressHandler.sendFinalResponse({ error: errorMsg }, true);
        return null;
      }
      return { error: errorMsg };
    }

    const operationParams = params || {
      relationshipTypes,
      direction,
      algorithm,
    };
    if (operationParams.relationshipTypes === undefined && relationshipTypes !== undefined) {
      operationParams.relationshipTypes = relationshipTypes;
    }
    if (operationParams.direction === undefined && direction !== undefined) {
      operationParams.direction = direction;
    }
    if (operationParams.algorithm === undefined && algorithm !== undefined) {
      operationParams.algorithm = algorithm;
    }

    const resultFromOperation = await ShortestPathOperation.execute(
      repository,
      branch,
      startNodeId,
      endNodeId,
      operationParams,
      memoryService,
      progressHandler,
    );

    if (progressHandler) {
      if (resultFromOperation?.error) {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, true);
      } else {
        progressHandler.sendFinalProgress(resultFromOperation);
        progressHandler.sendFinalResponse(resultFromOperation, false);
      }
      return null;
    }
    return resultFromOperation;
  },
};
