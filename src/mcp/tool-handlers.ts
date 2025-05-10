import { MemoryService } from "../services/memory.service";
// Minimal types needed for handler construction, assuming MemoryService methods handle full type details.
import { Context, Metadata } from "../types";

type ToolArgs = any;

interface ToolHandler {
  (params: ToolArgs, memoryService: MemoryService): Promise<any>;
}

const serviceMethodNotFoundError = (toolName: string, methodName: string) => {
  return new Error(
    `Tool '${toolName}' requires MemoryService.${methodName}, which is not implemented or exposed.`
  );
};

export const toolHandlers: Record<string, ToolHandler> = {
  "init-memory-bank": async (toolArgs, memoryService) => {
    const { repository, branch = "main" } = toolArgs;
    if (!repository)
      throw new Error("Missing repository parameter for init-memory-bank");
    await memoryService.initMemoryBank(repository, branch);
    return {
      success: true,
      message: `Memory bank initialized for ${repository} (branch: ${branch})`,
    };
  },
  "get-metadata": async (toolArgs, memoryService) => {
    const { repository, branch = "main" } = toolArgs;
    if (!repository)
      throw new Error("Missing repository parameter for get-metadata");
    return memoryService.getMetadata(repository, branch);
  },
  "update-metadata": async (toolArgs, memoryService) => {
    const { repository, branch = "main", metadata } = toolArgs;
    if (!repository)
      throw new Error("Missing repository parameter for update-metadata");
    if (!metadata)
      throw new Error("Missing metadata parameter for update-metadata");
    await memoryService.updateMetadata(repository, metadata, branch);
    return {
      success: true,
      message: `Metadata updated for ${repository} (branch: ${branch})`,
    };
  },
  "get-context": async (toolArgs, memoryService) => {
    const { repository, branch = "main", latest, limit } = toolArgs;
    if (!repository)
      throw new Error("Missing repository parameter for get-context");
    const effectiveLimit = latest === true ? 1 : limit;
    return memoryService.getLatestContexts(repository, branch, effectiveLimit);
  },
  "update-context": async (toolArgs, memoryService) => {
    const {
      repository,
      branch = "main",
      summary,
      observation,
      decision,
      agent,
      issue,
    } = toolArgs;
    if (!repository)
      throw new Error("Missing repository parameter for update-context");
    if (!summary && !observation && !decision && !agent && !issue) {
      throw new Error(
        "At least one context field must be provided for update-context"
      );
    }
    await memoryService.updateContext({
      repository,
      branch,
      summary,
      observation,
      decision,
      agent,
      issue,
    });
    return {
      success: true,
      message: `Context updated for ${repository} (branch: ${branch})`,
    };
  },
  "add-component": async (toolArgs, memoryService) => {
    const {
      repository,
      branch = "main",
      id,
      name,
      kind,
      status,
      depends_on,
    } = toolArgs;
    if (!repository || !id || !name)
      throw new Error(
        "Missing required params for add-component (repository, id, name)"
      );
    if (typeof memoryService.upsertComponent !== "function") {
      throw serviceMethodNotFoundError("add-component", "upsertComponent");
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
  "add-decision": async (toolArgs, memoryService) => {
    const { repository, branch = "main", id, name, date, context } = toolArgs;
    if (!repository || !id || !name || !date)
      throw new Error(
        "Missing required params for add-decision (repository, id, name, date)"
      );
    if (typeof memoryService.upsertDecision !== "function") {
      throw serviceMethodNotFoundError("add-decision", "upsertDecision");
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
  "add-rule": async (toolArgs, memoryService) => {
    const {
      repository,
      branch = "main",
      id,
      name,
      created,
      content,
      status,
      triggers,
    } = toolArgs;
    if (!repository || !id || !name || !created)
      throw new Error(
        "Missing required params for add-rule (repository, id, name, created)"
      );
    if (typeof (memoryService as any).upsertRule !== "function") {
      throw serviceMethodNotFoundError("add-rule", "upsertRule");
    }
    await (memoryService as any).upsertRule(
      repository,
      { yaml_id: id, name, created, content, status, triggers },
      branch
    );
    return {
      success: true,
      message: `Rule '${name}' (id: ${id}) added/updated in ${repository} (branch: ${branch})`,
    };
  },
  "export-memory-bank": async (toolArgs, memoryService) => {
    const { repository, branch = "main" } = toolArgs;
    if (!repository)
      throw new Error("Missing repository for export-memory-bank");
    if (typeof memoryService.exportMemoryBank !== "function") {
      throw serviceMethodNotFoundError(
        "export-memory-bank",
        "exportMemoryBank"
      );
    }
    const result = await memoryService.exportMemoryBank(repository, branch);
    return {
      success: true,
      message: `Memory bank exported for ${repository} (branch: ${branch})`,
      data: result,
    };
  },
  "import-memory-bank": async (toolArgs, memoryService) => {
    const { repository, branch = "main", type, id, content } = toolArgs;
    if (!repository || !type || !id || !content)
      throw new Error("Missing required params for import-memory-bank");
    if (typeof memoryService.importMemoryBank !== "function") {
      throw serviceMethodNotFoundError(
        "import-memory-bank",
        "importMemoryBank"
      );
    }
    await memoryService.importMemoryBank(repository, content, type, id, branch);
    return {
      success: true,
      message: `Memory item '${id}' of type '${type}' imported to ${repository} (branch: ${branch})`,
    };
  },
  "get-component-dependencies": async (toolArgs, memoryService) => {
    const { repository, branch = "main", componentId } = toolArgs;
    if (!repository || !componentId)
      throw new Error("Missing params for get-component-dependencies");
    if (typeof memoryService.getComponentDependencies !== "function") {
      throw serviceMethodNotFoundError(
        "get-component-dependencies",
        "getComponentDependencies"
      );
    }
    return memoryService.getComponentDependencies(
      repository,
      branch,
      componentId
    );
  },
  "get-component-dependents": async (toolArgs, memoryService) => {
    const { repository, branch = "main", componentId } = toolArgs;
    if (!repository || !componentId)
      throw new Error("Missing params for get-component-dependents");
    if (typeof (memoryService as any).getComponentDependents !== "function") {
      throw serviceMethodNotFoundError(
        "get-component-dependents",
        "getComponentDependents"
      );
    }
    return (memoryService as any).getComponentDependents(
      repository,
      branch,
      componentId
    );
  },
  "get-item-contextual-history": async (toolArgs, memoryService) => {
    const { repository, branch = "main", itemId } = toolArgs;
    if (!repository || !itemId)
      throw new Error("Missing params for get-item-contextual-history");
    if (typeof (memoryService as any).getItemContextualHistory !== "function") {
      throw serviceMethodNotFoundError(
        "get-item-contextual-history",
        "getItemContextualHistory"
      );
    }
    return (memoryService as any).getItemContextualHistory(
      repository,
      branch,
      itemId
    );
  },
  "get-governing-items-for-component": async (toolArgs, memoryService) => {
    const { repository, branch = "main", componentId } = toolArgs;
    if (!repository || !componentId)
      throw new Error("Missing params for get-governing-items-for-component");
    if (
      typeof (memoryService as any).getGoverningItemsForComponent !== "function"
    ) {
      throw serviceMethodNotFoundError(
        "get-governing-items-for-component",
        "getGoverningItemsForComponent"
      );
    }
    return (memoryService as any).getGoverningItemsForComponent(
      repository,
      branch,
      componentId
    );
  },
  "get-related-items": async (toolArgs, memoryService) => {
    const {
      repository,
      branch = "main",
      itemId,
      relationshipTypes,
      depth,
      direction,
    } = toolArgs;
    if (!repository || !itemId)
      throw new Error("Missing params for get-related-items");
    if (typeof (memoryService as any).getRelatedItems !== "function") {
      throw serviceMethodNotFoundError("get-related-items", "getRelatedItems");
    }
    return (memoryService as any).getRelatedItems(
      repository,
      branch,
      itemId,
      relationshipTypes,
      depth,
      direction
    );
  },
  "k-core-decomposition": async (toolArgs, memoryService) => {
    const { repository, branch = "main", k } = toolArgs;
    if (!repository)
      throw new Error("Missing repository for k-core-decomposition");
    if (typeof (memoryService as any).kCoreDecomposition !== "function") {
      throw serviceMethodNotFoundError(
        "k-core-decomposition",
        "kCoreDecomposition"
      );
    }
    return (memoryService as any).kCoreDecomposition(repository, branch, k);
  },
  "louvain-community-detection": async (toolArgs, memoryService) => {
    const { repository, branch = "main" } = toolArgs;
    if (!repository)
      throw new Error("Missing repository for louvain-community-detection");
    if (
      typeof (memoryService as any).louvainCommunityDetection !== "function"
    ) {
      throw serviceMethodNotFoundError(
        "louvain-community-detection",
        "louvainCommunityDetection"
      );
    }
    return (memoryService as any).louvainCommunityDetection(repository, branch);
  },
  pagerank: async (toolArgs, memoryService) => {
    const { repository, branch = "main", dampingFactor, iterations } = toolArgs;
    if (!repository) throw new Error("Missing repository for pagerank");
    if (typeof (memoryService as any).pageRank !== "function") {
      throw serviceMethodNotFoundError("pagerank", "pageRank");
    }
    return (memoryService as any).pageRank(
      repository,
      branch,
      dampingFactor,
      iterations
    );
  },
  "strongly-connected-components": async (toolArgs, memoryService) => {
    const { repository, branch = "main" } = toolArgs;
    if (!repository)
      throw new Error("Missing repository for strongly-connected-components");
    if (
      typeof (memoryService as any).stronglyConnectedComponents !== "function"
    ) {
      throw serviceMethodNotFoundError(
        "strongly-connected-components",
        "stronglyConnectedComponents"
      );
    }
    return (memoryService as any).stronglyConnectedComponents(
      repository,
      branch
    );
  },
  "weakly-connected-components": async (toolArgs, memoryService) => {
    const { repository, branch = "main" } = toolArgs;
    if (!repository)
      throw new Error("Missing repository for weakly-connected-components");
    if (
      typeof (memoryService as any).weaklyConnectedComponents !== "function"
    ) {
      throw serviceMethodNotFoundError(
        "weakly-connected-components",
        "weaklyConnectedComponents"
      );
    }
    return (memoryService as any).weaklyConnectedComponents(repository, branch);
  },
  "shortest-path": async (toolArgs, memoryService) => {
    const {
      repository,
      branch = "main",
      startNodeId,
      endNodeId,
      relationshipTypes,
      direction,
      algorithm,
    } = toolArgs;
    if (!repository || !startNodeId || !endNodeId)
      throw new Error("Missing params for shortest-path");
    if (typeof (memoryService as any).shortestPath !== "function") {
      throw serviceMethodNotFoundError("shortest-path", "shortestPath");
    }
    return (memoryService as any).shortestPath(
      repository,
      branch,
      startNodeId,
      endNodeId,
      { relationshipTypes, direction, algorithm }
    );
  },
};
