import { ComponentRepository, RepositoryRepository } from "../../repositories";
import { Component } from "../../types";

/**
 * Input parameters for upserting a component.
 * Corresponds to the data expected by ComponentRepository.upsertComponent,
 * excluding repository_id which is resolved by the operation.
 */
interface UpsertComponentData {
  yaml_id: string;
  name: string;
  kind?: string;
  status?: "active" | "deprecated" | "planned";
  depends_on?: string[];
  branch?: string; // Branch might be part of the component data for the repo layer
  // Add other fields from Component type as necessary, excluding repository_id
}

/**
 * Creates or updates a component in a repository.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param componentData - Data for the component to be upserted.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to the upserted Component object or null if repository not found.
 */
export async function upsertComponentOp(
  repositoryName: string,
  branch: string,
  componentData: UpsertComponentData,
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository
): Promise<Component | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(
      `Repository not found: ${repositoryName}/${branch} in upsertComponentOp`
    );
    return null;
  }

  // Construct dataForRepo ensuring all required fields of Component type are present.
  // The 'branch' for the component is taken from the function parameter, which is authoritative.
  const dataForRepo: Component = {
    repository: String(repository.id!),
    yaml_id: componentData.yaml_id,
    name: componentData.name,
    kind: componentData.kind,
    status: componentData.status || "active",
    depends_on: componentData.depends_on || [],
    branch: branch, // Use the function's branch parameter directly
  };

  return componentRepo.upsertComponent(dataForRepo);
}

/**
 * Retrieves all upstream dependencies for a component.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param componentId - The ID (yaml_id) of the component.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to an array of dependent Component objects.
 */
export async function getComponentDependenciesOp(
  repositoryName: string,
  branch: string,
  componentId: string, // This is yaml_id
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository
): Promise<Component[]> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(
      `Repository not found: ${repositoryName}/${branch} in getComponentDependenciesOp`
    );
    return [];
  }
  // ComponentRepository.getComponentDependencies expects the internal DB component ID if different from yaml_id
  // For now, assuming componentId (yaml_id) is used directly or resolved by the repo method.
  // The existing MemoryService.getComponentDependencies calls ComponentRepository.getComponentDependencies(String(repository.id!), componentId)
  // which suggests componentId there is indeed the yaml_id.
  return componentRepo.getComponentDependencies(
    String(repository.id!),
    componentId
  );
}

/**
 * Retrieves all downstream dependents of a component.
 * (Placeholder - implementation depends on ComponentRepository.getComponentDependents availability and signature)
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param componentId - The ID (yaml_id) of the component.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to an array of dependent Component objects.
 */
export async function getComponentDependentsOp(
  repositoryName: string,
  branch: string,
  componentId: string, // This is yaml_id
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository
): Promise<Component[]> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(
      `Repository not found: ${repositoryName}/${branch} in getComponentDependentsOp`
    );
    return [];
  }

  // This method is not yet in ComponentRepository from the provided snippets
  // Assuming a similar signature to getComponentDependencies if it were to be added.
  if (typeof componentRepo.getComponentDependents !== "function") {
    console.error(
      "ComponentRepository.getComponentDependents method is not implemented."
    );
    throw new Error(
      "ComponentRepository.getComponentDependents method is not implemented."
    );
    // return []; // Or throw error
  }
  // return componentRepo.getComponentDependents(String(repository.id!), componentId);
  return []; // Return empty until actual implementation in repo
}
