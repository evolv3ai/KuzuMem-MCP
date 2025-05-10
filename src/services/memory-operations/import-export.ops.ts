import {
  RepositoryRepository,
  MetadataRepository,
  ContextRepository,
  ComponentRepository,
  DecisionRepository,
  RuleRepository,
} from "../../repositories";
import { YamlService } from "../yaml.service"; // YamlService is in '../' relative to memory-operations
import { MemoryType } from "../../types";

/**
 * Exports the memory bank for a repository to a collection of YAML file contents.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param metadataRepo - Instance of MetadataRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @param decisionRepo - Instance of DecisionRepository.
 * @param ruleRepo - Instance of RuleRepository.
 * @param yamlService - Instance of YamlService.
 * @returns A Promise resolving to a Record where keys are file paths and values are YAML string contents.
 */
export async function exportMemoryBankOp(
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
  metadataRepo: MetadataRepository,
  contextRepo: ContextRepository,
  componentRepo: ComponentRepository,
  decisionRepo: DecisionRepository,
  ruleRepo: RuleRepository,
  yamlService: YamlService
): Promise<Record<string, string>> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(
      `Repository not found: ${repositoryName}/${branch} in exportMemoryBankOp`
    );
    return {};
  }

  const files: Record<string, string> = {};
  const repoId = String(repository.id!);

  // Export metadata
  const metadata = await metadataRepo.getMetadataForRepository(repoId, branch);
  if (metadata) {
    files["memory/metadata.yaml"] = yamlService.serializeMetadata(metadata);
  }

  // Export contexts (limit to a reasonable number for export, e.g., 1000)
  const contexts = await contextRepo.getLatestContexts(repoId, branch, 1000);
  for (const context of contexts) {
    files[`memory/context/${context.yaml_id}.yaml`] =
      yamlService.serializeContext(context);
  }

  // Export components
  const components = await componentRepo.getActiveComponents(repoId);
  for (const component of components) {
    files[`memory/graph/components/${component.yaml_id}.yaml`] =
      yamlService.serializeComponent(component);
  }

  // Export decisions
  const decisions = await decisionRepo.getAllDecisions(repoId, branch); // Assuming getAllDecisions
  for (const decision of decisions) {
    files[`memory/graph/decisions/${decision.yaml_id}.yaml`] =
      yamlService.serializeDecision(decision);
  }

  // Export rules
  const rules = await ruleRepo.getAllRules(repoId, branch); // Assuming getAllRules
  for (const rule of rules) {
    files[`memory/graph/rules/${rule.yaml_id}.yaml`] =
      yamlService.serializeRule(rule);
  }

  return files;
}

/**
 * Imports YAML content into a specific memory type for a repository.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param yamlContent - The YAML string content to import.
 * @param type - The type of memory item to import.
 * @param id - The ID (yaml_id) of the memory item.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param metadataRepo - Instance of MetadataRepository.
 * @param contextRepo - Instance of ContextRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @param decisionRepo - Instance of DecisionRepository.
 * @param ruleRepo - Instance of RuleRepository.
 * @param yamlService - Instance of YamlService.
 * @returns A Promise resolving to true if import was successful, false otherwise.
 */
export async function importMemoryBankOp(
  repositoryName: string,
  branch: string,
  yamlContent: string,
  type: MemoryType,
  id: string, // This is yaml_id
  repositoryRepo: RepositoryRepository,
  metadataRepo: MetadataRepository,
  contextRepo: ContextRepository,
  componentRepo: ComponentRepository,
  decisionRepo: DecisionRepository,
  ruleRepo: RuleRepository,
  yamlService: YamlService
): Promise<boolean> {
  // Use getOrCreateRepository from MemoryService or replicate logic if needed
  // For simplicity, assuming repositoryRepo.findByName and then create if not exists,
  // or MemoryService will pass a Repository object directly.
  // For this Op, we will use findByName and create, mirroring MemoryService.getOrCreateRepository internal logic.
  let repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    try {
      repository = await repositoryRepo.create({
        name: repositoryName,
        branch,
      });
    } catch (error) {
      console.error(
        `Failed to create repository ${repositoryName}/${branch} during import:`,
        error
      );
      return false;
    }
  }
  if (!repository) return false; // Should not happen if create succeeded

  const repoId = String(repository.id!);

  try {
    const { data } = yamlService.parseYaml(yamlContent);

    switch (type) {
      case MemoryType.METADATA:
        await metadataRepo.upsertMetadata({
          repository: repoId,
          yaml_id: id,
          name: repositoryName,
          content: data,
          branch,
        });
        break;
      case MemoryType.CONTEXT:
        await contextRepo.upsertContext({
          repository: repoId,
          yaml_id: id,
          iso_date: data.iso_date,
          agent: data.agent,
          related_issue: data.related_issue as any,
          summary: data.summary,
          decisions: data.decisions as any,
          observations: data.observations as any,
          branch,
        });
        break;
      case MemoryType.COMPONENT:
        await componentRepo.upsertComponent({
          repository: repoId,
          yaml_id: id,
          name: data.name,
          kind: data.kind,
          depends_on: data.depends_on,
          status: data.status || "active",
          branch,
        });
        break;
      case MemoryType.DECISION:
        await decisionRepo.upsertDecision({
          repository: repoId,
          yaml_id: id,
          name: data.name,
          context: data.context,
          date: data.date,
          branch,
        });
        break;
      case MemoryType.RULE:
        await ruleRepo.upsertRule({
          repository: repoId,
          yaml_id: id,
          name: data.name,
          created: data.created,
          triggers: data.triggers,
          content: data.content,
          status: data.status || "active",
          branch,
        });
        break;
      default:
        console.error(`Unsupported memory type for import: ${type}`);
        return false;
    }
    return true;
  } catch (error) {
    console.error(
      `Error importing memory bank item type '${type}', id '${id}':`,
      error
    );
    return false;
  }
}
