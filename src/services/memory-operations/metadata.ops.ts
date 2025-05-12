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
    console.warn(`Repository not found: ${repositoryName}/${branch} in updateMetadataOp`);
    return null;
  }

  const existingMetadataNode = await metadataRepo.findMetadata(repositoryName, branch, 'meta');
  const currentContentObject = existingMetadataNode?.content || {};

  // Start with a full default structure from the type, including optional fields for clarity during merge
  let baseContent: Metadata['content'] = {
    id: 'meta',
    project: {
      name: repositoryName,
      created: new Date().toISOString().split('T')[0],
      description: '', // Default empty description
    },
    tech_stack: { language: 'Unknown', framework: 'Unknown', datastore: 'Unknown' },
    architecture: 'unknown',
    memory_spec_version: '3.0.0',
  };

  // Layer 1: Merge existing content (if any) over the defaults
  if (existingMetadataNode && existingMetadataNode.content) {
    baseContent = {
      ...baseContent,
      ...(existingMetadataNode.content as Metadata['content']), // existingContent is an object
      project: {
        ...baseContent.project, // Defaults for project
        ...(existingMetadataNode.content.project || {}),
      },
      tech_stack: {
        ...baseContent.tech_stack, // Defaults for tech_stack
        ...(existingMetadataNode.content.tech_stack || {}),
      },
    };
  }

  // Layer 2: Merge the update payload over the combined default/existing content
  const newContentObject: Metadata['content'] = {
    ...baseContent,
    ...metadataUpdatePayload, // Spread update payload last for top-level simple fields
    project: {
      // Deep merge project again with update payload
      ...baseContent.project,
      ...(metadataUpdatePayload.project || {}),
    },
    tech_stack: {
      // Deep merge tech_stack again with update payload
      ...baseContent.tech_stack,
      ...(metadataUpdatePayload.tech_stack || {}),
    },
  };

  // Final enforcement of essential fields if somehow lost or not in payload
  newContentObject.id = newContentObject.id || 'meta';
  newContentObject.project.name = newContentObject.project.name || repositoryName;
  newContentObject.project.created =
    newContentObject.project.created || new Date().toISOString().split('T')[0];
  // description will be from metadataUpdatePayload.project, then baseContent.project, then default empty string
  newContentObject.memory_spec_version = newContentObject.memory_spec_version || '3.0.0';
  // architecture is now correctly prioritized from metadataUpdatePayload by the spread order over baseContent

  const finalMetadataToUpsert: Metadata = {
    id: existingMetadataNode?.id || 'meta',
    name: existingMetadataNode?.name || repositoryName,
    repository: repository.id,
    branch: branch,
    content: newContentObject,
  } as Metadata;

  return metadataRepo.upsertMetadata(finalMetadataToUpsert);
}
