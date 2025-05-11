// src/services/memory-operations/metadata.ops.ts
// Re-saving to try and clear any potential ts-node/jest cache issues.
import { MetadataRepository, RepositoryRepository } from '../../repositories';
import { Metadata } from '../../types';

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
  metadataRepo: MetadataRepository,
): Promise<Metadata | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(`Repository not found: ${repositoryName}/${branch} in getMetadataOp`);
    return null;
  }
  const metadata = await metadataRepo.getMetadataForRepository(String(repository.id!));
  if (!metadata) {
    // console.warn(`Metadata not found for repository ID: ${repository.id}`);
  }
  return metadata ?? null;
}

/**
 * Updates metadata for a given repository and branch.
 *
 * @param repositoryName - The name of the repository.
 * @param branch - The branch of the repository.
 * @param metadataUpdatePayload - Partial metadata content to update.
 * @param repositoryRepo - Instance of RepositoryRepository.
 * @param metadataRepo - Instance of MetadataRepository.
 * @returns A Promise resolving to the updated Metadata object or null if update failed or repo/metadata not found.
 */
export async function updateMetadataOp(
  repositoryName: string,
  branch: string,
  metadataUpdatePayload: Partial<Metadata['content']>,
  repositoryRepo: RepositoryRepository,
  metadataRepo: MetadataRepository,
): Promise<Metadata | null> {
  const repository = await repositoryRepo.findByName(repositoryName, branch);
  if (!repository) {
    console.warn(`Repository not found: ${repositoryName}/${branch} in updateMetadataOp`);
    return null;
  }

  const existingMetadata = await metadataRepo.getMetadataForRepository(String(repository.id!));

  if (!existingMetadata || typeof existingMetadata.content !== 'string') {
    console.warn(
      `Cannot update: Existing metadata or its content string not found for ${repositoryName}/${branch}. Create metadata first.`,
    );
    return null;
  }

  let currentContentObject: Metadata['content'];
  try {
    currentContentObject = JSON.parse(existingMetadata.content);
  } catch (e) {
    console.error('Failed to parse existing metadata content string:', existingMetadata.content, e);
    return null; // Cannot update if existing content is malformed
  }

  // Perform a deep merge of metadataUpdatePayload into currentContentObject
  // This is a simplified deep merge. For true deep merge, a library or recursive function is better.
  const newContentObject: Metadata['content'] = {
    ...currentContentObject,
    ...metadataUpdatePayload, // Overwrite top-level keys
    project: {
      ...(currentContentObject.project || {}),
      ...(metadataUpdatePayload.project || {}),
    },
    tech_stack: {
      ...(currentContentObject.tech_stack || {}),
      ...(metadataUpdatePayload.tech_stack || {}),
    },
  };
  // Ensure all required fields of Metadata["content"] are present if necessary, or rely on their optionality
  // For example, ensure 'id' from original content is preserved if not in payload
  newContentObject.id = currentContentObject.id || metadataUpdatePayload.id || 'meta';

  const metadataToUpsert: Metadata = {
    // Base properties from existing, do not spread ...existingMetadata directly if it contains outdated repo/branch info
    yaml_id: existingMetadata.yaml_id, // Keep original yaml_id
    name: existingMetadata.name, // Keep original name from metadata
    repository: String(repository.id!), // Use current repository context
    branch: branch, // Use current branch context
    content: newContentObject, // Pass the merged object, repo will stringify it via escapeJsonProp
    // This assumes metadataRepo.upsertMetadata expects content as an object
    // based on the Metadata type, and it will handle stringification.
    // Let's verify upsertMetadata signature in MetadataRepository.
  } as Metadata; // Cast needed because content is an object here but Metadata type might expect string in some contexts
  // However, upsertMetadata in repo takes `metadata: Metadata`, and `Metadata.content` IS an object.
  // The repository's `escapeJsonProp` handles the stringification.

  // The line `delete (metadataToUpsert as any).branch;` was in the original provided code.
  // This suggests that the `metadataRepo.upsertMetadata` might not want a branch property directly on the object it receives,
  // if the branch is implicitly handled by the repositoryId or a separate parameter (not the case here).
  // Let's check the `upsertMetadata` method in `MetadataRepository`.
  // `upsertMetadata(metadata: Metadata)` -> `metadata.branch` is part of `BaseEntity` in `Metadata` type.
  // So, it should be fine to pass it.

  // The actual type for Metadata.content is an object. Repository's escapeJsonProp handles stringification.
  // So, metadataToUpsert should be:
  const finalMetadataToUpsert: Omit<Metadata, 'created_at' | 'updated_at'> & {
    content: object;
  } = {
    yaml_id: existingMetadata.yaml_id,
    name: existingMetadata.name,
    repository: String(repository.id!),
    branch: branch,
    content: newContentObject,
  };

  return metadataRepo.upsertMetadata(finalMetadataToUpsert as Metadata); // Cast back to Metadata for the call
}
