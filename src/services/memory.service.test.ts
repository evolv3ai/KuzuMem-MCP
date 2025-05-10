import { MemoryService } from "./memory.service";
import { Repository } from "../types";
import { RepositoryRepository } from "../repositories/repository.repository";
import { KuzuDBClient } from "../db/kuzu";

// Create a repository store to simulate a database
const repoStore: Repository[] = [];

// Mock the RepositoryRepository
jest.mock("../repositories/repository.repository", () => {
  return {
    RepositoryRepository: {
      getInstance: jest.fn().mockResolvedValue({
        // Mock find by name implementation
        findByName: jest.fn(async (name: string, branch: string = "main") => {
          const found = repoStore.find(
            (r) => r.name === name && r.branch === branch
          );
          return found || null;
        }),
        // Mock create implementation
        create: jest.fn(async (repository: Partial<Repository>) => {
          const newRepo = {
            id: repoStore.length + 1,
            name: repository.name || "default",
            branch: repository.branch || "main",
            created_at: new Date(),
            updated_at: new Date(),
          } as Repository;

          repoStore.push(newRepo);
          return newRepo;
        }),
        // Mock findAll implementation
        findAll: jest.fn(async (branch?: string) => {
          if (branch) {
            return repoStore.filter((r) => r.branch === branch);
          }
          return [...repoStore];
        }),
      }),
    },
  };
});

// Mock KuzuDB so we don't need a real database connection
jest.mock("../db/kuzu", () => {
  // Create a query result that matches the expected structure
  const createQueryResult = (data: any) => {
    return {
      getAll: async () => (Array.isArray(data) ? data : [data]),
      get: (idx: number) => data[idx],
      length: Array.isArray(data) ? data.length : data ? 1 : 0,
    };
  };

  return {
    KuzuDBClient: {
      getConnection: jest.fn().mockReturnValue({
        query: jest.fn(async (query: string, params?: any) => {
          // Return empty results for all queries since we mock the repositories directly
          return createQueryResult([]);
        }),
      }),
      executeQuery: jest.fn(async (query: string, params?: any) => {
        return createQueryResult([]);
      }),
    },
  };
});

// Also mock the other repository dependencies with branch-aware implementations
jest.mock("../repositories/metadata.repository", () => ({
  MetadataRepository: {
    getInstance: jest.fn().mockResolvedValue({
      getMetadataForRepository: jest.fn().mockResolvedValue(null),
      upsertMetadata: jest.fn().mockResolvedValue({ content: {} }),
    }),
  },
}));

jest.mock("../services/yaml.service", () => ({
  YamlService: {
    getInstance: jest.fn().mockResolvedValue({
      serializeMetadata: jest.fn().mockReturnValue("metadata yaml"),
      serializeContext: jest.fn().mockReturnValue("context yaml"),
      serializeComponent: jest.fn().mockImplementation((component) => {
        if (component.name && component.name.includes("Main")) {
          return "main branch component yaml";
        } else if (component.name && component.name.includes("Feature")) {
          return "feature branch component yaml";
        }
        return "default component yaml";
      }),
      serializeDecision: jest.fn().mockReturnValue("decision yaml"),
      serializeRule: jest.fn().mockReturnValue("rule yaml"),
      parseYaml: jest.fn().mockImplementation((yaml: string) => {
        if (yaml.includes("component")) {
          return {
            type: "component",
            name: "Test Component",
            data: {},
            repository: "test-repo",
            branch: "main",
          };
        }
        if (yaml.includes("rule")) {
          return {
            type: "rule",
            name: "Test Rule",
            data: {
              created: "2024-01-01",
              content: "Sample content",
              status: "active",
              triggers: ["foo"],
            },
            repository: "test-repo",
            branch: "main",
          };
        }
        if (yaml.includes("decision")) {
          return {
            type: "decision",
            name: "Test Decision",
            date: "2024-01-01",
            context: "Initial context",
            repository: "test-repo",
            branch: "main",
          };
        }
        if (yaml.includes("context")) {
          return { type: "context", name: "Test Context", data: {} };
        }
        if (yaml.includes("metadata")) {
          return { type: "metadata", name: "Test Metadata", data: {} };
        }
        return { type: "unknown", data: {} };
      }),
    }),
  },
}));

// Create stores for each repository type for more realistic testing
const contextStore: any[] = [];
const componentStore: any[] = [];
const decisionStore: any[] = [];
const ruleStore: any[] = [];

jest.mock("../repositories/context.repository", () => ({
  ContextRepository: {
    getInstance: jest.fn().mockResolvedValue({
      getTodayContext: jest.fn().mockImplementation(async (repoId) => {
        return contextStore.find((c) => c.repository === repoId) || null;
      }),
      getLatestContexts: jest
        .fn()
        .mockImplementation(async (repoId, limit = 10) => {
          return contextStore
            .filter((c) => c.repository === repoId)
            .slice(0, limit);
        }),
      upsertContext: jest.fn().mockImplementation(async (context) => {
        const existingIndex = contextStore.findIndex(
          (c) =>
            c.repository === context.repository && c.yaml_id === context.yaml_id
        );

        if (existingIndex >= 0) {
          contextStore[existingIndex] = {
            ...contextStore[existingIndex],
            ...context,
          };
          return contextStore[existingIndex];
        }

        const newContext = { ...context, id: contextStore.length + 1 };
        contextStore.push(newContext);
        return newContext;
      }),
    }),
  },
}));

jest.mock("../repositories/component.repository", () => ({
  ComponentRepository: {
    getInstance: jest.fn().mockResolvedValue({
      upsertComponent: jest.fn().mockImplementation(async (component) => {
        const existingIndex = componentStore.findIndex(
          (c) =>
            c.repository === component.repository &&
            c.yaml_id === component.yaml_id
        );

        if (existingIndex >= 0) {
          componentStore[existingIndex] = {
            ...componentStore[existingIndex],
            ...component,
          };
          return componentStore[existingIndex];
        }

        const newComponent = { ...component, id: componentStore.length + 1 };
        componentStore.push(newComponent);
        return newComponent;
      }),
      getActiveComponents: jest.fn().mockImplementation(async (repoId) => {
        return componentStore.filter(
          (c) => c.repository === repoId && c.status === "active"
        );
      }),
    }),
  },
}));

jest.mock("../repositories/decision.repository", () => ({
  DecisionRepository: {
    getInstance: jest.fn().mockResolvedValue({
      upsertDecision: jest.fn().mockImplementation(async (decision) => {
        const existingIndex = decisionStore.findIndex(
          (d) =>
            d.repository === decision.repository &&
            d.yaml_id === decision.yaml_id
        );

        if (existingIndex >= 0) {
          decisionStore[existingIndex] = {
            ...decisionStore[existingIndex],
            ...decision,
          };
          return decisionStore[existingIndex];
        }

        const newDecision = { ...decision, id: decisionStore.length + 1 };
        decisionStore.push(newDecision);
        return newDecision;
      }),
      getDecisionsByDateRange: jest
        .fn()
        .mockImplementation(async (repoId, startDate, endDate) => {
          return decisionStore.filter((d) => d.repository === repoId);
        }),
    }),
  },
}));

jest.mock("../repositories/rule.repository", () => ({
  RuleRepository: {
    getInstance: jest.fn().mockResolvedValue({
      upsertRule: jest.fn().mockImplementation(async (rule) => {
        const existingIndex = ruleStore.findIndex(
          (r) => r.repository === rule.repository && r.yaml_id === rule.yaml_id
        );

        if (existingIndex >= 0) {
          ruleStore[existingIndex] = { ...ruleStore[existingIndex], ...rule };
          return ruleStore[existingIndex];
        }

        const newRule = { ...rule, id: ruleStore.length + 1 };
        ruleStore.push(newRule);
        return newRule;
      }),
      getActiveRules: jest.fn().mockImplementation(async (repoId) => {
        return ruleStore.filter(
          (r) => r.repository === repoId && r.status === "active"
        );
      }),
    }),
  },
}));

const serializeComponentMock = jest.fn().mockImplementation((component) => {
  if (component.name && component.name.includes("Main")) {
    return "main branch component yaml";
  } else if (component.name && component.name.includes("Feature")) {
    return "feature branch component yaml";
  }
  return "default component yaml";
});

// (rest of the file continues as before)

describe("MemoryService KuzuDB Initialization", () => {
  let memoryService: MemoryService;

  beforeEach(async () => {
    // Clear all stores before each test for isolation
    repoStore.length = 0;
    contextStore.length = 0;
    componentStore.length = 0;
    decisionStore.length = 0;
    ruleStore.length = 0;

    // Get a fresh instance with our mocked KuzuDB
    memoryService = await MemoryService.getInstance();
  });

  it("should initialize a memory bank and create a repository node for the specified branch", async () => {
    const repoName = "test-repo-init";
    const branch = "feature/test-branch";

    // Should initialize without throwing
    await memoryService.initMemoryBank(repoName, branch);

    // Should create or find the repository
    const repo = await memoryService.getOrCreateRepository(repoName, branch);
    expect(repo).toBeTruthy();
    expect(repo?.name).toBe(repoName);
    expect(repo?.branch).toBe(branch);
    expect(repo?.id).toBeDefined();
  });

  it("should not duplicate repository nodes for the same name and branch", async () => {
    const repoName = "test-repo-init-2";
    const branch = "feature/test-branch";

    // Create repository first time
    await memoryService.initMemoryBank(repoName, branch);

    // Get the repository twice
    const repo1 = await memoryService.getOrCreateRepository(repoName, branch);
    const repo2 = await memoryService.getOrCreateRepository(repoName, branch);

    expect(repo1).toBeTruthy();
    expect(repo2).toBeTruthy();

    // Both should have the same ID (same object)
    if (repo1 && repo2) {
      expect(repo1.id).toBe(repo2.id);
    }
  });

  it("should properly isolate repositories with different branches", async () => {
    const repoName = "multi-branch-repo";
    const mainBranch = "main";
    const featureBranch = "feature/new-feature";

    // Initialize both repositories with same name but different branches
    await memoryService.initMemoryBank(repoName, mainBranch);
    await memoryService.initMemoryBank(repoName, featureBranch);

    // Get both repositories
    const mainRepo = await memoryService.getOrCreateRepository(
      repoName,
      mainBranch
    );
    const featureRepo = await memoryService.getOrCreateRepository(
      repoName,
      featureBranch
    );

    // Both should exist but have different IDs
    expect(mainRepo).toBeTruthy();
    expect(featureRepo).toBeTruthy();
    expect(mainRepo?.id).not.toBe(featureRepo?.id);

    // Branch properties should be set correctly
    expect(mainRepo?.branch).toBe(mainBranch);
    expect(featureRepo?.branch).toBe(featureBranch);
  });
});

describe("MemoryService Branch-Aware Component Operations", () => {
  let memoryService: MemoryService;
  let mainRepo: Repository | null;
  let featureRepo: Repository | null;

  beforeEach(async () => {
    // Clear all stores before each test for isolation
    repoStore.length = 0;
    componentStore.length = 0;

    memoryService = await MemoryService.getInstance();

    // Setup test repositories with different branches
    const repoName = "component-test-repo";
    await memoryService.initMemoryBank(repoName, "main");
    await memoryService.initMemoryBank(repoName, "feature/component-test");

    mainRepo = await memoryService.getOrCreateRepository(repoName, "main");
    featureRepo = await memoryService.getOrCreateRepository(
      repoName,
      "feature/component-test"
    );
  });

  it("should create components for different branches with isolation", async () => {
    // Skip if repository setup failed
    if (!mainRepo || !featureRepo) {
      fail("Repository setup failed");
      return;
    }

    // Create a component in main branch
    const mainComponent = await memoryService.upsertComponent(
      mainRepo.name,
      "shared-component",
      {
        name: "Test Component",
        kind: "service",
        status: "active",
        repository: "test-repo",
        branch: "main",
      },
      "main"
    );

    // Create a different component with same ID in feature branch
    const featureComponent = await memoryService.upsertComponent(
      featureRepo.name,
      "shared-component",
      {
        name: "Modified Test Component",
        kind: "microservice",
        status: "active",
        repository: "test-repo",
        branch: "feature/component-test",
      },
      "feature/component-test"
    );

    // Both should exist
    expect(mainComponent).toBeTruthy();
    expect(featureComponent).toBeTruthy();

    // But they should have different values despite same yaml_id
    expect(mainComponent?.name).toBe("Test Component");
    expect(featureComponent?.name).toBe("Modified Test Component");
    expect(mainComponent?.kind).toBe("service");
    expect(featureComponent?.kind).toBe("microservice");

    // They should be linked to different repositories
    expect(mainComponent?.repository).toBe(mainRepo.id);
    expect(featureComponent?.repository).toBe(featureRepo.id);
  });
});

describe("MemoryService Branch-Aware Rules and Decisions", () => {
  let memoryService: MemoryService;
  let mainRepo: Repository | null;
  let featureRepo: Repository | null;

  beforeEach(async () => {
    // Clear all stores before each test for isolation
    repoStore.length = 0;
    ruleStore.length = 0;
    decisionStore.length = 0;

    memoryService = await MemoryService.getInstance();

    // Setup test repositories with different branches
    const repoName = "rules-decisions-repo";
    await memoryService.initMemoryBank(repoName, "main");
    await memoryService.initMemoryBank(repoName, "feature/rules-test");

    mainRepo = await memoryService.getOrCreateRepository(repoName, "main");
    featureRepo = await memoryService.getOrCreateRepository(
      repoName,
      "feature/rules-test"
    );
  });

  it("should handle rules with branch isolation", async () => {
    // Skip if repository setup failed
    if (!mainRepo || !featureRepo) {
      fail("Repository setup failed");
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    // Create a rule in main branch
    const mainRule = await memoryService.upsertRule(
      mainRepo.name,
      "important-rule",
      {
        name: "Important Rule",
        created: today,
        content: "Follow this rule",
        status: "active",
        triggers: ["event1", "event2"],
        repository: "test-repo",
        branch: "main",
      },
      "main"
    );

    // Create a different rule with same ID in feature branch
    const featureRule = await memoryService.upsertRule(
      featureRepo.name,
      "important-rule",
      {
        name: "Modified Rule",
        created: today,
        content: "New implementation",
        status: "active",
        triggers: ["event3"],
        repository: "test-repo",
        branch: "feature/rules-test",
      },
      "feature/rules-test"
    );

    // Both should exist with different content
    expect(mainRule).toBeTruthy();
    expect(featureRule).toBeTruthy();
    expect(mainRule?.content).toBe("Follow this rule");
    expect(featureRule?.content).toBe("New implementation");

    // Should be isolated by repository
    expect(mainRule?.repository).toBe(mainRepo.id);
    expect(featureRule?.repository).toBe(featureRepo.id);
  });

  it("should handle decisions with branch isolation", async () => {
    // Skip if repository setup failed
    if (!mainRepo || !featureRepo) {
      fail("Repository setup failed");
      return;
    }

    const today = new Date().toISOString().split("T")[0];

    // Create a decision in main branch
    const mainDecision = await memoryService.upsertDecision(
      mainRepo.name,
      "architecture-decision",
      {
        name: "Architecture Decision",
        date: today,
        context: "We decided to use microservices",
        repository: "test-repo",
        branch: "main",
      },
      "main"
    );

    // Create a different decision with same ID in feature branch
    const featureDecision = await memoryService.upsertDecision(
      featureRepo.name,
      "architecture-decision",
      {
        name: "Alternative Architecture",
        date: today,
        context: "We decided to use monolith",
        repository: "test-repo",
        branch: "feature/rules-test",
      },
      "feature/rules-test"
    );

    // Both should exist with different content
    expect(mainDecision).toBeTruthy();
    expect(featureDecision).toBeTruthy();
    expect(mainDecision?.name).toBe("Architecture Decision");
    expect(featureDecision?.name).toBe("Alternative Architecture");

    // Should be isolated by repository
    expect(mainDecision?.repository).toBe(mainRepo.id);
    expect(featureDecision?.repository).toBe(featureRepo.id);
  });
});

describe("MemoryService Export and Import with Branch Awareness", () => {
  let memoryService: MemoryService;

  beforeEach(async () => {
    // Clear all stores
    repoStore.length = 0;
    componentStore.length = 0;
    decisionStore.length = 0;
    ruleStore.length = 0;

    memoryService = await MemoryService.getInstance();
  });

  it("should export memory bank with branch awareness", async () => {
    // Initialize repos with different branches
    const repoName = "export-test-repo";
    await memoryService.initMemoryBank(repoName, "main");
    await memoryService.initMemoryBank(repoName, "feature/export-test");

    const mainRepo = await memoryService.getOrCreateRepository(
      repoName,
      "main"
    );
    const featureRepo = await memoryService.getOrCreateRepository(
      repoName,
      "feature/export-test"
    );

    if (!mainRepo || !featureRepo) {
      fail("Repository setup failed");
      return;
    }

    // Add some components to each branch
    await memoryService.upsertComponent(
      repoName,
      "component1",
      {
        name: "Minimal Component",
        status: "active",
        repository: "test-repo",
        branch: "main",
      },
      "main"
    );
    await memoryService.upsertComponent(
      repoName,
      "component1",
      {
        name: "Test Rule",
        status: "active",
        repository: "test-repo",
        branch: "feature/export-test",
      },
      "feature/export-test"
    );

    // Export from main branch
    const mainExport = await memoryService.exportMemoryBank(repoName, "main");

    // Export from feature branch
    const featureExport = await memoryService.exportMemoryBank(
      repoName,
      "feature/export-test"
    );

    // Both should have exported something
    expect(Object.keys(mainExport).length).toBeGreaterThan(0);
    expect(Object.keys(featureExport).length).toBeGreaterThan(0);

    // Different branches should result in different exports
    expect(mainExport).not.toEqual(featureExport);
  });

  it("should import memory bank with branch awareness", async () => {
    // Initialize repos with different branches
    const repoName = "import-test-repo";
    await memoryService.initMemoryBank(repoName, "main");
    await memoryService.initMemoryBank(repoName, "feature/import-test");

    // Import component to main branch with proper structure including required fields
    const mainImportSuccess = await memoryService.importMemoryBank(
      repoName,
      `component:
        name: "Test Component"
        status: "active"
        kind: "service"
        repository: "test-repo"
        branch: "main"`,
      "component",
      "imported-component",
      "main"
    );

    // Import component to feature branch with proper structure including required fields
    const featureImportSuccess = await memoryService.importMemoryBank(
      repoName,
      `component:
        name: "Test Rule 2"
        created: "2024-01-02"
        status: "active"
        triggers: ["bar"]
        repository: "test-repo"
        branch: "feature/import-test"`,
      "component",
      "imported-component",
      "feature/import-test"
    );

    // Both imports should succeed
    expect(mainImportSuccess).toBe(true);
    expect(featureImportSuccess).toBe(true);

    // Verify isolation by looking at the component store
    const mainRepo = await memoryService.getOrCreateRepository(
      repoName,
      "main"
    );
    const featureRepo = await memoryService.getOrCreateRepository(
      repoName,
      "feature/import-test"
    );

    if (!mainRepo || !featureRepo) {
      fail("Repository setup failed");
      return;
    }

    const mainComponents = await memoryService.getActiveComponents(
      repoName,
      "main"
    );
    const featureComponents = await memoryService.getActiveComponents(
      repoName,
      "feature/import-test"
    );

    // Should have components in both branches, but with different repositories
    expect(mainComponents.length).toBeGreaterThan(0);
    expect(featureComponents.length).toBeGreaterThan(0);

    // Different components should be in different repositories
    if (mainComponents.length > 0 && featureComponents.length > 0) {
      expect(mainComponents[0].repository).toBe(mainRepo.id);
      expect(featureComponents[0].repository).toBe(featureRepo.id);
    }
  });
});
