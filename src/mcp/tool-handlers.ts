import { MemoryService } from '../services/memory.service';
// Minimal types needed for handler construction, assuming MemoryService methods handle full type details.
import { Context, Metadata } from '../types/index'; // For global types
import { ToolHandler } from './types'; // For MCP specific ToolHandler
import config from '../db/config'; // For constructing dbPath in init-memory-bank response
import path from 'path';

// Import Operation Classes
import {
  ComponentDependenciesOperation,
  ComponentDependentsOperation,
  ItemContextualHistoryOperation,
  GoverningItemsForComponentOperation,
  RelatedItemsOperation,
  ShortestPathOperation,
  KCoreDecompositionOperation,
  LouvainCommunityDetectionOperation,
  PageRankOperation,
  StronglyConnectedComponentsOperation,
  WeaklyConnectedComponentsOperation,
  SimpleEchoOperation,
} from './streaming/operations';

type ToolArgs = any;

const serviceMethodNotFoundError = (toolName: string, methodName: string) => {
  return new Error(
    `Tool '${toolName}' requires MemoryService.${methodName}, which is not implemented or exposed.`,
  );
};

// Helper to determine clientProjectRoot - to be made more robust in ToolExecutionService or via tool args
function determineClientProjectRoot(
  toolArgs: any,
  clientProjectRootFromExecContext?: string,
  toolName?: string,
): string {
  // For init-memory-bank, clientProjectRoot MUST come from its own arguments
  if (toolName === 'init-memory-bank') {
    const explicitPath = toolArgs.clientProjectRoot;
    if (explicitPath && typeof explicitPath === 'string' && path.isAbsolute(explicitPath)) {
      return explicitPath;
    }
    throw new Error(
      'For init-memory-bank, clientProjectRoot is a required absolute path in tool arguments.',
    );
  }

  // For other tools, prioritize clientProjectRootFromExecContext
  if (
    clientProjectRootFromExecContext &&
    typeof clientProjectRootFromExecContext === 'string' &&
    path.isAbsolute(clientProjectRootFromExecContext)
  ) {
    return clientProjectRootFromExecContext;
  }

  // Fallback to toolArgs.clientProjectRoot ONLY IF it's defined and absolute (e.g. if some other tools also adopt this param)
  // This makes the pattern consistent if other tools add clientProjectRoot to their schema.
  const explicitToolArgPath = toolArgs.clientProjectRoot;
  if (
    explicitToolArgPath &&
    typeof explicitToolArgPath === 'string' &&
    path.isAbsolute(explicitToolArgPath)
  ) {
    console.warn(
      `Tool '${toolName || 'unknown'}' using clientProjectRoot from toolArgs. Standard practice is for ToolExecutionService to provide this for non-init tools.`,
    );
    return explicitToolArgPath;
  }

  console.error(
    `determineClientProjectRoot: CRITICAL - clientProjectRoot could not be determined for tool '${toolName || 'unknown'}' or was not an absolute path. Context from TESS: '${clientProjectRootFromExecContext}', from toolArgs: '${toolArgs.clientProjectRoot}'`,
  );
  throw new Error('Client project root could not be determined or was not an absolute path.');
}

export const toolHandlers: Record<string, ToolHandler> = {
  'init-memory-bank': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const { repository, branch = 'main', clientProjectRoot } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'init-memory-bank',
    );
    if (!repository) {
      throw new Error('Missing repository parameter for init-memory-bank');
    }

    // In implementation, use only repository and branch parameters as these are what the service expects
    await memoryService.initMemoryBank(actualClientProjectRoot, repository, branch);

    // Return the information that would be useful for client display
    return {
      success: true,
      message: `Memory bank initialized for ${repository} (branch: ${branch})`,
      dbPath: actualClientProjectRoot ? actualClientProjectRoot : 'unknown', // Include path info from environment
    };
  },
  'get-metadata': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const { repository, branch = 'main' } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'get-metadata',
    );
    if (!repository) {
      throw new Error('Missing repository parameter for get-metadata');
    }
    // Method now takes clientProjectRoot, repositoryName and branch
    return memoryService.getMetadata(actualClientProjectRoot, repository, branch);
  },
  'update-metadata': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const { repository, branch = 'main', metadata } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'update-metadata',
    );
    if (!repository) {
      throw new Error('Missing repository parameter for update-metadata');
    }
    if (!metadata) {
      throw new Error('Missing metadata parameter for update-metadata');
    }
    // Method now takes clientProjectRoot, repositoryName, metadata, and branch
    await memoryService.updateMetadata(actualClientProjectRoot, repository, metadata, branch);
    return {
      success: true,
      message: `Metadata updated for ${repository} (branch: ${branch})`,
    };
  },
  'get-context': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const { repository, branch = 'main', latest, limit } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'get-context',
    );
    if (!repository) {
      throw new Error('Missing repository parameter for get-context');
    }
    // Method now takes clientProjectRoot, repositoryName, branch, and limit
    return memoryService.getLatestContexts(
      actualClientProjectRoot,
      repository,
      branch,
      latest === true ? 1 : limit,
    );
  },
  'update-context': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const {
      summary,
      agent,
      decision,
      observation,
      issue,
      id,
      repository,
      branch = 'main',
    } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'update-context',
    );
    if (!repository) {
      throw new Error('Missing repository for update-context');
    }

    // updateContext method now takes clientProjectRoot and a params object
    const updatedContext = await memoryService.updateContext(actualClientProjectRoot, {
      repository,
      branch,
      summary,
      agent,
      decision,
      observation,
      issue,
      id,
    });

    if (updatedContext) {
      return {
        success: true,
        message: `Context updated for ${repository} (branch: ${branch})`,
        context: updatedContext,
      };
    } else {
      return {
        success: false,
        error: `Failed to update context for ${repository} (branch: ${branch}).`,
      };
    }
  },
  'add-component': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const { repository, branch = 'main', id, name, kind, status, depends_on } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'add-component',
    );
    if (!repository || !id || !name) {
      throw new Error('Missing required params for add-component (repository, id, name)');
    }

    // upsertComponent now takes clientProjectRoot, repositoryName, branch and component data
    await memoryService.upsertComponent(actualClientProjectRoot, repository, branch, {
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
  'add-decision': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const { repository, branch = 'main', id, name, date, context } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'add-decision',
    );
    if (!repository || !id || !name || !date) {
      throw new Error('Missing required params for add-decision (repository, id, name, date)');
    }

    // upsertDecision now takes clientProjectRoot, repositoryName, branch and decision data
    await memoryService.upsertDecision(actualClientProjectRoot, repository, branch, {
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
  'add-rule': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
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
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'add-rule',
    );
    if (!repository || !id || !name || !created) {
      throw new Error('Missing required params for add-rule (repository, id, name, created)');
    }

    // upsertRule now takes clientProjectRoot, repositoryName, rule data object, and branch
    await memoryService.upsertRule(
      actualClientProjectRoot,
      repository,
      { id, name, created, content, status, triggers },
      branch,
    );
    return {
      success: true,
      message: `Rule '${name}' (id: ${id}) added/updated in ${repository} (branch: ${branch})`,
    };
  },
  'get-component-dependencies': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const { repository, branch = 'main', componentId, depth = 1 } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'get-component-dependencies',
    );
    if (!repository || !componentId) {
      return { error: 'Missing required parameters: repository and componentId' };
    }

    return ComponentDependenciesOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      componentId,
      depth,
      memoryService,
      progressHandler,
    );
  },
  'get-component-dependents': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const {
      repository,
      clientProjectRoot: explicitClientProjectRoot,
      branch = 'main',
      componentId,
    } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'get-component-dependents',
    );
    if (!repository || !componentId) {
      return { error: 'Missing required parameters: repository and componentId are required' };
    }

    return ComponentDependentsOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      componentId,
      memoryService,
      progressHandler,
    );
  },
  'get-item-contextual-history': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const { repository, branch = 'main', itemId, itemType } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'get-item-contextual-history',
    );

    if (!repository || !itemId || !itemType) {
      return { error: 'Missing required params: repository, itemId, itemType' };
    }
    const validItemTypes = ['Component', 'Decision', 'Rule'];
    if (!validItemTypes.includes(itemType)) {
      return {
        error: `Invalid itemType: ${itemType}. Must be one of ${validItemTypes.join(', ')}`,
      };
    }

    return ItemContextualHistoryOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      itemId,
      itemType,
      memoryService,
      progressHandler,
    );
  },
  'get-governing-items-for-component': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const { repository, branch = 'main', componentId } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'get-governing-items-for-component',
    );
    if (!repository || !componentId) {
      return { error: 'Missing required params: repository and componentId' };
    }

    return GoverningItemsForComponentOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      componentId,
      memoryService,
      progressHandler,
    );
  },
  'get-related-items': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const {
      repository,
      branch = 'main',
      startItemId,
      depth = 1,
      relationshipFilter,
      targetNodeTypeFilter,
    } = toolArgs as any;

    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'get-related-items',
    );
    if (!repository || !startItemId) {
      return { error: 'Missing required params: repository and startItemId' };
    }

    const operationParams = {
      depth: typeof depth === 'number' ? depth : 1,
      relationshipFilter: typeof relationshipFilter === 'string' ? relationshipFilter : undefined,
      targetNodeTypeFilter:
        typeof targetNodeTypeFilter === 'string' ? targetNodeTypeFilter : undefined,
    };

    return RelatedItemsOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      startItemId,
      operationParams,
      memoryService,
      progressHandler,
    );
  },
  'k-core-decomposition': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const {
      repository,
      branch = 'main',
      k,
      projectedGraphName = 'component-graph',
      nodeTableNames = ['Component'],
      relationshipTableNames = ['DEPENDS_ON'],
    } = toolArgs as any;

    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'k-core-decomposition',
    );
    if (!repository) {
      return { error: 'Missing required parameter: repository' };
    }

    return KCoreDecompositionOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      projectedGraphName,
      nodeTableNames,
      relationshipTableNames,
      k || 1, // Default to k=1 if not specified
      memoryService,
      progressHandler,
    );
  },
  'louvain-community-detection': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const {
      repository,
      branch = 'main',
      projectedGraphName = 'component-graph',
      nodeTableNames = ['Component'],
      relationshipTableNames = ['DEPENDS_ON'],
    } = toolArgs as any;

    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'louvain-community-detection',
    );
    if (!repository) {
      return { error: 'Missing required parameter: repository' };
    }

    return LouvainCommunityDetectionOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      projectedGraphName,
      nodeTableNames,
      relationshipTableNames,
      memoryService,
      progressHandler,
    );
  },
  pagerank: async (toolArgs, memoryService, progressHandler, clientProjectRootFromExecContext) => {
    const {
      repository,
      branch = 'main',
      dampingFactor,
      maxIterations,
      projectedGraphName = 'component-graph',
      nodeTableNames = ['Component'],
      relationshipTableNames = ['DEPENDS_ON'],
    } = toolArgs as any;

    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'pagerank',
    );
    if (!repository) {
      return { error: 'Missing required parameter: repository' };
    }

    return PageRankOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      projectedGraphName,
      nodeTableNames,
      relationshipTableNames,
      dampingFactor,
      maxIterations,
      memoryService,
      progressHandler,
    );
  },
  'strongly-connected-components': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const {
      repository,
      branch = 'main',
      projectedGraphName = 'component-graph',
      nodeTableNames = ['Component'],
      relationshipTableNames = ['DEPENDS_ON'],
    } = toolArgs as any;

    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'strongly-connected-components',
    );
    if (!repository) {
      return { error: 'Missing required parameter: repository' };
    }

    return StronglyConnectedComponentsOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      projectedGraphName,
      nodeTableNames,
      relationshipTableNames,
      memoryService,
      progressHandler,
    );
  },
  'weakly-connected-components': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const {
      repository,
      branch = 'main',
      projectedGraphName = 'component-graph',
      nodeTableNames = ['Component'],
      relationshipTableNames = ['DEPENDS_ON'],
    } = toolArgs as any;

    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'weakly-connected-components',
    );
    if (!repository) {
      return { error: 'Missing required parameter: repository' };
    }

    return WeaklyConnectedComponentsOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      projectedGraphName,
      nodeTableNames,
      relationshipTableNames,
      memoryService,
      progressHandler,
    );
  },
  'shortest-path': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const {
      repository,
      branch = 'main',
      startNodeId,
      endNodeId,
      params = {},
      projectedGraphName = 'component-graph',
      nodeTableNames = ['Component'],
      relationshipTableNames = ['DEPENDS_ON'],
    } = toolArgs as any;

    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'shortest-path',
    );
    if (!repository || !startNodeId || !endNodeId) {
      return { error: 'Missing required params: repository, startNodeId, endNodeId' };
    }

    return ShortestPathOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      projectedGraphName,
      nodeTableNames,
      relationshipTableNames,
      startNodeId,
      endNodeId,
      params,
      memoryService,
      progressHandler,
    );
  },
  'simple-echo-tool': async (
    toolArgs,
    memoryService,
    progressHandler,
    clientProjectRootFromExecContext,
  ) => {
    const { repository, branch = 'main', ...echoArgs } = toolArgs as any;
    const actualClientProjectRoot = determineClientProjectRoot(
      toolArgs,
      clientProjectRootFromExecContext,
      'simple-echo-tool',
    );
    if (!repository) {
      return { error: 'Missing required parameter: repository for simple-echo-tool' };
    }
    // Ensure memoryService is defined, even if not strictly used by the simple echo
    if (!memoryService) {
      return { error: 'MemoryService instance is required' };
    }

    return SimpleEchoOperation.execute(
      actualClientProjectRoot,
      repository,
      branch,
      echoArgs, // Pass remaining args to be echoed
      memoryService,
      progressHandler,
    );
  },
};
