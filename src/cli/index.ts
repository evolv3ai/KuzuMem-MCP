#!/usr/bin/env node
import { Command } from "commander";
import { MemoryService } from "../services/memory.service";
import fs from "fs/promises";
import path from "path";

// Create CLI program
const program = new Command();
let memoryService: MemoryService;

// Initialize the memory service
async function initializeMemoryService(): Promise<void> {
  try {
    memoryService = await MemoryService.getInstance();
  } catch (error) {
    console.error("Failed to initialize memory service:", error);
    process.exit(1);
  }
}

program
  .name("memory-bank-cli")
  .description("CLI tool for interacting with the distributed YAML memory bank")
  .version("1.0.0");

// Initialize a new memory bank
program
  .command("init")
  .description("Initialize a new memory bank for a repository")
  .argument("<repository>", "Repository name")
  .action(async (repository: string) => {
    try {
      await memoryService.initMemoryBank(repository);
      console.log(`✅ Memory bank initialized for repository: ${repository}`);
    } catch (error) {
      console.error("❌ Failed to initialize memory bank:", error);
      process.exit(1);
    }
  });

// Export memory bank to YAML files
program
  .command("export")
  .description("Export memory bank to YAML files")
  .argument("<repository>", "Repository name")
  .option("-o, --output <directory>", "Output directory", "./memory")
  .action(async (repository: string, options: { output: string }) => {
    try {
      const files = await memoryService.exportMemoryBank(repository);

      // Create directories and write files
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(options.output, filePath);
        const dir = path.dirname(fullPath);

        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, content);

        console.log(`Exported: ${fullPath}`);
      }

      console.log(`✅ Memory bank exported for repository: ${repository}`);
    } catch (error) {
      console.error("❌ Failed to export memory bank:", error);
      process.exit(1);
    }
  });

// Import memory bank from YAML files
program
  .command("import")
  .description("Import memory bank from YAML files")
  .argument("<repository>", "Repository name")
  .argument("<file>", "YAML file or directory to import")
  .action(async (repository: string, file: string) => {
    try {
      const stats = await fs.stat(file);

      if (stats.isDirectory()) {
        // Import directory
        const files = await processDirectory(file);

        for (const [filePath, content] of Object.entries(files)) {
          // Determine type and ID from file path
          const { type, id } = parseFilePath(filePath);

          if (type && id) {
            // Ensure type is a valid MemoryType
            const memoryType = type as
              | "metadata"
              | "context"
              | "component"
              | "decision"
              | "rule";
            await memoryService.importMemoryBank(
              repository,
              content,
              memoryType,
              id
            );
            console.log(`Imported: ${filePath}`);
          }
        }
      } else {
        // Import single file
        const content = await fs.readFile(file, "utf-8");
        const fileName = path.basename(file);
        const fileNameNoExt = fileName.replace(/\.[^/.]+$/, "");

        // Determine type from content
        const yamlType = getYamlType(content);

        if (yamlType) {
          // Ensure type is a valid MemoryType
          const memoryType = yamlType as
            | "metadata"
            | "context"
            | "component"
            | "decision"
            | "rule";
          await memoryService.importMemoryBank(
            repository,
            content,
            memoryType,
            fileNameNoExt
          );
          console.log(`Imported: ${file}`);
        } else {
          console.error(`❌ Could not determine YAML type for file: ${file}`);
        }
      }

      console.log(`✅ Memory bank imported for repository: ${repository}`);
    } catch (error) {
      console.error("❌ Failed to import memory bank:", error);
      process.exit(1);
    }
  });

// Helper function to process directory recursively
async function processDirectory(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const subFiles = await processDirectory(fullPath);
      Object.assign(files, subFiles);
    } else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
      const content = await fs.readFile(fullPath, "utf-8");
      files[fullPath] = content;
    }
  }

  return files;
}

// Helper function to parse file path and determine type and ID
function parseFilePath(filePath: string): {
  type: string | null;
  id: string | null;
} {
  const normalizedPath = path.normalize(filePath);

  // Check for metadata
  if (normalizedPath.includes("metadata.yaml")) {
    return { type: "metadata", id: "meta" };
  }

  // Check for context
  if (normalizedPath.includes("/context/")) {
    const fileName = path.basename(
      normalizedPath,
      path.extname(normalizedPath)
    );
    return { type: "context", id: fileName };
  }

  // Check for component
  if (normalizedPath.includes("/components/")) {
    const fileName = path.basename(
      normalizedPath,
      path.extname(normalizedPath)
    );
    return { type: "component", id: fileName };
  }

  // Check for decision
  if (normalizedPath.includes("/decisions/")) {
    const fileName = path.basename(
      normalizedPath,
      path.extname(normalizedPath)
    );
    return { type: "decision", id: fileName };
  }

  // Check for rule
  if (normalizedPath.includes("/rules/")) {
    const fileName = path.basename(
      normalizedPath,
      path.extname(normalizedPath)
    );
    return { type: "rule", id: fileName };
  }

  return { type: null, id: null };
}

// Helper function to determine YAML type from content
function getYamlType(content: string): string | null {
  const firstLine = content.split("\n")[0];
  const match = firstLine.match(/---\s+!(\w+)/);

  if (match) {
    const type = match[1].toLowerCase();

    switch (type) {
      case "metadata":
        return "metadata";
      case "context":
        return "context";
      case "component":
        return "component";
      case "decision":
        return "decision";
      case "rule":
        return "rule";
      default:
        return null;
    }
  }

  return null;
}

// Add today's context entry
program
  .command("add-context")
  .description("Add an entry to today's context")
  .argument("<repository>", "Repository name")
  .option("-a, --agent <agent>", "Agent name")
  .option("-i, --issue <issue>", "Related issue number")
  .option("-s, --summary <summary>", "Context summary")
  .option("-d, --decision <decision>", "Add a decision")
  .option("-o, --observation <observation>", "Add an observation")
  .action(async (repository: string, options) => {
    try {
      const context = await memoryService.getTodayContext(repository);

      if (!context) {
        console.error("❌ Failed to get today's context");
        process.exit(1);
      }

      const update: any = {};

      if (options.agent) update.agent = options.agent;
      if (options.issue) update.related_issue = options.issue;
      if (options.summary) update.summary = options.summary;

      if (options.decision) {
        update.decisions = [...(context.decisions || []), options.decision];
      }

      if (options.observation) {
        update.observations = [
          ...(context.observations || []),
          options.observation,
        ];
      }

      await memoryService.updateTodayContext(repository, update);
      console.log(`✅ Added to today's context for repository: ${repository}`);
    } catch (error) {
      console.error("❌ Failed to add to context:", error);
      process.exit(1);
    }
  });

// Add a component
program
  .command("add-component")
  .description("Add or update a component")
  .argument("<repository>", "Repository name")
  .argument("<id>", "Component ID")
  .requiredOption("-n, --name <name>", "Component name")
  .option("-k, --kind <kind>", "Component kind")
  .option(
    "-d, --depends <dependencies>",
    "Comma-separated list of dependencies"
  )
  .option(
    "-s, --status <status>",
    "Component status (active, deprecated, planned)",
    "active"
  )
  .action(async (repository: string, id: string, options) => {
    try {
      const component = {
        name: options.name,
        kind: options.kind,
        depends_on: options.depends ? options.depends.split(",") : undefined,
        status: options.status as "active" | "deprecated" | "planned",
        repository,
        branch: "main",
      };
      await memoryService.upsertComponent(repository, id, component, "main");
      console.log(`✅ Component ${id} added to repository: ${repository}`);
    } catch (error) {
      console.error("❌ Failed to add component:", error);
      process.exit(1);
    }
  });

// Add a decision
program
  .command("add-decision")
  .description("Add or update a decision")
  .argument("<repository>", "Repository name")
  .argument("<id>", "Decision ID")
  .requiredOption("-n, --name <name>", "Decision name")
  .option("-c, --context <context>", "Decision context")
  .requiredOption("-d, --date <date>", "Decision date (YYYY-MM-DD)")
  .action(async (repository: string, id: string, options) => {
    try {
      const decision = {
        name: options.name,
        context: options.context,
        date: options.date,
        repository,
        branch: "main",
      };
      await memoryService.upsertDecision(repository, id, decision, "main");
      console.log(`✅ Decision ${id} added to repository: ${repository}`);
    } catch (error) {
      console.error("❌ Failed to add decision:", error);
      process.exit(1);
    }
  });

// Add a rule
program
  .command("add-rule")
  .description("Add or update a rule")
  .argument("<repository>", "Repository name")
  .argument("<id>", "Rule ID")
  .requiredOption("-n, --name <name>", "Rule name")
  .requiredOption("-c, --created <date>", "Rule creation date (YYYY-MM-DD)")
  .option("-t, --triggers <triggers>", "Comma-separated list of triggers")
  .option("-o, --content <content>", "Rule content")
  .option("-s, --status <status>", "Rule status (active, deprecated)", "active")
  .action(async (repository: string, id: string, options) => {
    try {
      const rule = {
        name: options.name,
        created: options.created,
        triggers: options.triggers ? options.triggers.split(",") : undefined,
        content: options.content,
        status: options.status as "active" | "deprecated",
        repository,
        branch: "main",
      };
      await memoryService.upsertRule(repository, id, rule, "main");
      console.log(`✅ Rule ${id} added to repository: ${repository}`);
    } catch (error) {
      console.error("❌ Failed to add rule:", error);
      process.exit(1);
    }
  });

// Helper to run async action handlers
const runAsyncAction = async <T>(
  action: () => Promise<T>
): Promise<T | void> => {
  try {
    // Ensure memory service is initialized
    if (!memoryService) {
      await initializeMemoryService();
    }
    return await action();
  } catch (error) {
    console.error("Error executing command:", error);
    process.exit(1);
  }
};

// Wrap all command actions to ensure memory service is initialized
program.commands.forEach((cmd) => {
  const originalAction = cmd.action;
  cmd.action(function (...args) {
    // Create a new function that initializes memory service first
    const actionFn = async () => {
      // @ts-ignore - we know this is the original action callback
      return originalAction.apply(this, args);
    };
    // The return type doesn't matter here since we're not using it
    void runAsyncAction(actionFn);
  });
});

// Parse command line arguments
program.parse(process.argv);

// Display help if no arguments provided
if (process.argv.length <= 2) {
  program.help();
}
