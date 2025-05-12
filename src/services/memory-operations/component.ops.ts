import { ComponentRepository, RepositoryRepository } from '../../repositories';
import { Component, ComponentInput } from '../../types';

/**
 * Input parameters for upserting a component.
 * Corresponds to the data expected by ComponentRepository.upsertComponent,
 * excluding repository_id which is resolved by the operation.
 */
interface UpsertComponentData {
  id: string;
  name: string;
  kind?: string;
  status?: 'active' | 'deprecated' | 'planned';
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
  componentRepo: ComponentRepository,
): Promise<Component | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository || !repository.id) {
    console.warn(`Repository not found: ${repositoryName}/${branch} in upsertComponentOp`);
    return null;
  }

  const inputForRepo: ComponentInput = {
    id: componentData.id,
    name: componentData.name,
    kind: componentData.kind,
    status: componentData.status || 'active',
    depends_on: componentData.depends_on || [],
    branch: branch,
  };

  return componentRepo.upsertComponent(repository.id, inputForRepo);
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
  componentId: string,
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository,
): Promise<Component[]> {
  return componentRepo.getComponentDependencies(repositoryName, componentId, branch);
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
  componentId: string,
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository,
): Promise<Component[]> {
  return componentRepo.getComponentDependents(repositoryName, componentId, branch);
}

/**
 * Retrieves all active components for a repository and branch.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param componentRepo - Instance of ComponentRepository.
 * @returns A Promise resolving to an array of active Component objects.
 */
export async function getActiveComponentsOp(
  repositoryNodeId: string,
  componentBranch: string,
  repositoryRepo: RepositoryRepository,
  componentRepo: ComponentRepository,
): Promise<Component[]> {
  return componentRepo.getActiveComponents(repositoryNodeId, componentBranch);
}
