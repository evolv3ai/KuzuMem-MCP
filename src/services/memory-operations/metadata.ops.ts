import { MetadataRepository, RepositoryRepository } from "../../repositories";
import { Metadata } from "../../types";

/**
 * Retrieves metadata for a given repository and branch.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param metadataRepo - Instance of MetadataRepository.
 * @returns A Promise resolving to the Metadata object or null if not found.
 */
export async function getMetadataOp(
  repositoryName: string,
  branch: string,
  repositoryRepo: RepositoryRepository,
  metadataRepo: MetadataRepository
): Promise<Metadata | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(
      `Repository not found: ${repositoryName}/${branch} in getMetadataOp`
    );
    return null;
  }
  const metadata = await metadataRepo.getMetadataForRepository(
    String(repository.id!),
    branch
  );
  if (!metadata) {
    // console.warn(`Metadata not found for repository ID: ${repository.id} branch: ${branch}`);
    // It's valid for metadata not to exist initially, so a warning might be too noisy here.
    // The caller (MemoryService) can decide how to handle a null result.
  }
  return metadata ?? null;
}

/**
 * Updates metadata for a given repository and branch.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param metadataUpdate - Partial metadata content to update.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param metadataRepo - Instance of MetadataRepository.
 * @returns A Promise resolving to the updated Metadata object or null if update failed or repo/metadata not found.
 */
export async function updateMetadataOp(
  repositoryName: string,
  branch: string,
  metadataUpdate: Partial<Metadata["content"]>, // Ensure this matches MemoryService call
  repositoryRepo: RepositoryRepository,
  metadataRepo: MetadataRepository
): Promise<Metadata | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(
      `Repository not found: ${repositoryName}/${branch} in updateMetadataOp`
    );
    return null;
  }

  const existingMetadata = await metadataRepo.getMetadataForRepository(
    String(repository.id!),
    branch
  );

  if (!existingMetadata) {
    console.warn(
      `Cannot update: Metadata not found for ${repositoryName}/${branch}. Create metadata first.`
    );
    // Or, should this Op attempt to create if not exists?
    // For now, strictly update, consistent with current MemoryService.updateMetadata
    return null;
  }

  // Construct the full content for upsert, merging existing with the partial update
  const newContent = { ...existingMetadata.content, ...metadataUpdate };

  const updatedMetadata = await metadataRepo.upsertMetadata({
    repository: String(repository.id!), // Matches expected field by repository
    yaml_id: existingMetadata.yaml_id || "meta", // Use existing yaml_id, or default to 'meta'
    name: repositoryName, // Keep the repository name as the name for the metadata entry
    branch,
    content: newContent,
  });

  return updatedMetadata ?? null;
}
