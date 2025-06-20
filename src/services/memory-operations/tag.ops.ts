import { KuzuDBClient } from '../../db/kuzu';
import { ToolHandlerContext } from '../../mcp/types/sdk-custom';
import { RepositoryRepository, TagRepository } from '../../repositories';
import { Tag, TagInput } from '../../types';

// Result types for operations
interface TagOperationResult {
  success: boolean;
  message: string;
  tag?: Tag;
}

interface TagAssociationResult {
  success: boolean;
  message: string;
}

interface FindItemsResult {
  success: boolean;
  message: string;
  items: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

/**
 * Operation to add a new tag.
 */
export async function addTagOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  tagData: TagInput,
  repositoryRepo: RepositoryRepository,
  tagRepo: TagRepository,
): Promise<TagOperationResult> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.info(`[tag.ops] addTagOp called for tag ${tagData.name} in ${repoIdForLog}`);

  try {
    const repoNode = await repositoryRepo.findByName(repositoryName, branch);
    if (!repoNode || !repoNode.id) {
      logger.warn(`[tag.ops] Repository ${repoIdForLog} not found for addTagOp.`);
      return { success: false, message: `Repository ${repoIdForLog} not found.` };
    }

    // Transform input to internal Tag type
    const tagToCreate: Tag = {
      id: tagData.id,
      repository: repoNode.id,
      branch: branch,
      name: tagData.name,
      description: tagData.description || null,
      color: tagData.color || null,
      category: tagData.category || null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const createdTag = await tagRepo.upsertTagNode({
      ...tagToCreate,
      category: tagToCreate.category || undefined, // Convert null to undefined
    });

    if (!createdTag) {
      logger.error(`[tag.ops] TagRepository.upsertTagNode returned null for ${tagData.name}`);
      return { success: false, message: 'Failed to create tag in repository.' };
    }

    // Normalize the tag to ensure consistent structure
    const normalizedTag: Tag = {
      ...createdTag,
      repository: repositoryName,
      branch: branch,
    };

    logger.info(`[tag.ops] Tag ${createdTag.id} created successfully in ${repoIdForLog}`);
    return {
      success: true,
      message: 'Tag added successfully.',
      tag: normalizedTag,
    };
  } catch (error: any) {
    logger.error(`[tag.ops] Error in addTagOp for ${tagData.name}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
    });
    return {
      success: false,
      message: error.message || 'An unexpected error occurred while adding the tag.',
    };
  }
}

/**
 * Operation to associate a tag with an item (Component, Decision, Rule, or File).
 */
export async function tagItemOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  itemId: string,
  itemType: 'Component' | 'Decision' | 'Rule' | 'File' | 'Context',
  tagId: string,
  repositoryRepo: RepositoryRepository,
  tagRepo: TagRepository,
): Promise<TagAssociationResult> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.info(`[tag.ops] tagItemOp: ${itemType}:${itemId} with Tag:${tagId} in ${repoIdForLog}`);

  try {
    const repoNode = await repositoryRepo.findByName(repositoryName, branch);
    if (!repoNode || !repoNode.id) {
      logger.warn(`[tag.ops] Repository ${repoIdForLog} not found for tagItemOp.`);
      return { success: false, message: `Repository ${repoIdForLog} not found.` };
    }

    // Create relationship between item and tag
    const relationshipType = `TAGGED_${itemType.toUpperCase()}`;
    const success = await tagRepo.addItemTag(
      repoNode.id,
      branch,
      itemId,
      itemType,
      tagId,
      relationshipType,
    );

    if (!success) {
      logger.warn(`[tag.ops] tagRepo.addItemTag failed for ${itemType}:${itemId}, Tag:${tagId}`);
      return { success: false, message: 'Failed to associate tag with item.' };
    }

    logger.info(`[tag.ops] Tag ${tagId} successfully associated with ${itemType} ${itemId}.`);
    return { success: true, message: 'Item tagged successfully.' };
  } catch (error: any) {
    logger.error(
      `[tag.ops] Error in tagItemOp for ${itemType}:${itemId}, Tag:${tagId}: ${error.message}`,
      { error: error.toString(), stack: error.stack },
    );
    return { success: false, message: error.message || 'An unexpected error occurred.' };
  }
}

/**
 * Operation to find items by tag.
 */
export async function findItemsByTagOp(
  mcpContext: ToolHandlerContext,
  repositoryName: string,
  branch: string,
  tagId: string,
  repositoryRepo: RepositoryRepository,
  tagRepo: TagRepository,
  itemType?: 'Component' | 'Decision' | 'Rule' | 'File' | 'Context' | 'All',
): Promise<FindItemsResult> {
  const logger = mcpContext.logger;
  const repoIdForLog = `${repositoryName}:${branch}`;
  logger.info(`[tag.ops] findItemsByTagOp: Finding items with Tag:${tagId} in ${repoIdForLog}`);

  try {
    const repoNode = await repositoryRepo.findByName(repositoryName, branch);
    if (!repoNode || !repoNode.id) {
      logger.warn(`[tag.ops] Repository ${repoIdForLog} not found for findItemsByTagOp.`);
      return {
        success: false,
        message: `Repository ${repoIdForLog} not found.`,
        items: [],
      };
    }

    const items = await tagRepo.findItemsByTag(repoNode.id, branch, tagId, itemType);

    logger.info(`[tag.ops] Found ${items.length} items with tag ${tagId} in ${repoIdForLog}`);

    return {
      success: true,
      message: `Found ${items.length} items with tag.`,
      items: items,
    };
  } catch (error: any) {
    logger.error(`[tag.ops] Error in findItemsByTagOp for Tag:${tagId}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
    });
    return {
      success: false,
      message: error.message || 'An unexpected error occurred.',
      items: [],
    };
  }
}

export async function deleteTagOp(
  mcpContext: ToolHandlerContext,
  kuzuClient: KuzuDBClient,
  tagId: string,
): Promise<boolean> {
  const logger = mcpContext.logger;

  const deleteQuery = `
    MATCH (t:Tag {id: $tagId})
    DETACH DELETE t
    RETURN 1 as deletedCount
  `;

  const result = await kuzuClient.executeQuery(deleteQuery, { tagId });
  const deletedCount = result[0]?.deletedCount || 0;

  logger.info(`[tag.ops.deleteTagOp] Deleted ${deletedCount} tag(s) with ID ${tagId}`);
  return deletedCount > 0;
}
