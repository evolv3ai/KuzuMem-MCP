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
  // No need to fetch Repository node if findMetadata uses logical repositoryName
  // const repository = await repositoryRepo.findByName(repositoryName, branch);
  // if (!repository || !repository.id) {
  //   console.warn(`Repository not found: ${repositoryName}/${branch} in getMetadataOp`);
  //   return null;
  // }

  // metadataRepo.findMetadata expects repositoryName, branch, and logical metadataId ('meta')
  const metadata = await metadataRepo.findMetadata(repositoryName, branch, 'meta');
  // if (!metadata) {
  //   console.warn(`Metadata not found for repository ${repositoryName}, branch ${branch}`);
  // }
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
  if (!repository || !repository.id) {
    // Ensure repository.id is checked
    console.warn(`Repository not found: ${repositoryName}/${branch} in updateMetadataOp`);
    return null;
  }

  // findMetadata takes repositoryName and branch
  const existingMetadata = await metadataRepo.findMetadata(repositoryName, branch, 'meta');

  if (!existingMetadata) {
    console.warn(
      `No existing metadata found for ${repositoryName}/${branch} to update. Will attempt to create.`,
    );
  }

  // If existingMetadata is null, newContentObject will base off an empty content structure or defaults.
  // existingMetadata.content is already an object, no need to parse it from string here.
  const currentContentObject: Partial<Metadata['content']> = existingMetadata
    ? existingMetadata.content
    : {
        project: { name: repositoryName, created: new Date().toISOString().split('T')[0] },
        tech_stack: {},
        id: 'meta',
        memory_spec_version: '3.0.0',
      };
  // Removed the check for typeof existingMetadata.content !== 'string' as it should be an object.

  const newContentObject: Metadata['content'] = {
    ...(currentContentObject as Metadata['content']), // Cast to full type after defaulting
    ...metadataUpdatePayload,
    project: {
      ...((currentContentObject as Metadata['content']).project || {
        name: repositoryName,
        created: new Date().toISOString().split('T')[0],
      }), // Ensure project object and its fields exist
      ...(metadataUpdatePayload.project || {}),
    },
    tech_stack: {
      ...((currentContentObject as Metadata['content']).tech_stack || {}),
      ...(metadataUpdatePayload.tech_stack || {}),
    },
    // Ensure required fields for Metadata['content'] are present
    id: currentContentObject.id || metadataUpdatePayload.id || 'meta',
    memory_spec_version:
      currentContentObject.memory_spec_version ||
      metadataUpdatePayload.memory_spec_version ||
      '3.0.0',
    architecture:
      currentContentObject.architecture || metadataUpdatePayload.architecture || 'unknown',
  };
  // Ensure project.name and project.created are always set if not provided
  if (!newContentObject.project.name) {
    newContentObject.project.name = repositoryName;
  }
  if (!newContentObject.project.created) {
    newContentObject.project.created = new Date().toISOString().split('T')[0];
  }

  const finalMetadataToUpsert: Metadata = {
    id: existingMetadata?.id || 'meta', // Logical ID
    name: existingMetadata?.name || repositoryName, // Default name to repo name
    repository: repository.id, // Repository Node PK
    branch: branch, // Branch for this metadata instance
    content: newContentObject,
    // created_at, updated_at will be handled by repository
  } as Metadata; // Cast as Omit<...> is complex here

  return metadataRepo.upsertMetadata(finalMetadataToUpsert);
}
