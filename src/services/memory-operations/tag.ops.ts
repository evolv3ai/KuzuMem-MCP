import { McpServerRequestContext } from '@modelcontextprotocol/sdk';
import { z } from 'zod';
import {
  RepositoryRepository,
  TagRepository /*, other needed Item Repositories for tagItemOp */,
} from '../../repositories';
import {
  TagNodeSchema,
  AddTagInputSchema,
  AddTagOutputSchema,
  TagItemInputSchema,
  TagItemOutputSchema,
  FindItemsByTagInputSchema,
  FindItemsByTagOutputSchema,
  RelatedItemBaseSchema,
} from '../../mcp/schemas/tool-schemas';
import {
  Tag /* Component, Decision, Rule, File, Context - if used for casting */,
} from '../../types'; // Internal Tag type

/**
 * Operation to add or update a tag node.
 */
export async function addTagOp(
  mcpContext: McpServerRequestContext,
  repositoryName: string, // Used for logging/context, even if tags are global
  branch: string, // Used for logging/context
  tagDataFromTool: z.infer<typeof AddTagInputSchema>,
  repositoryRepo: RepositoryRepository, // Potentially for validating repo context if tags were scoped
  tagRepo: TagRepository,
): Promise<z.infer<typeof AddTagOutputSchema>> {
  const logger = mcpContext.logger || console;
  logger.info(
    `[tag.ops] addTagOp called for tag ID: ${tagDataFromTool.id}, Name: ${tagDataFromTool.name}`,
  );

  try {
    // Assuming TagRepository.upsertTagNode expects data aligned with internal Tag type,
    // (omitting created_at as DB might handle it, or pass it if repo expects it)
    const tagToUpsert: Omit<Tag, 'created_at'> & { id: string; name: string } = {
      id: tagDataFromTool.id,
      name: tagDataFromTool.name,
      color: tagDataFromTool.color,
      description: tagDataFromTool.description,
      // If tags were repo/branch scoped, add repository/branch fields here from params
    };

    const upsertedTagNode = await tagRepo.upsertTagNode(tagToUpsert);

    if (!upsertedTagNode) {
      logger.error(
        `[tag.ops] TagRepository.upsertTagNode returned null for tag ID ${tagDataFromTool.id}`,
      );
      return { success: false, message: 'Failed to create/update tag node in repository.' };
    }

    // Transform internal Tag node to Zod TagNodeSchema for the output
    const zodTagNode: z.infer<typeof TagNodeSchema> = {
      ...upsertedTagNode,
      id: upsertedTagNode.id,
      name: upsertedTagNode.name,
      color: upsertedTagNode.color || null,
      description: upsertedTagNode.description || null,
      created_at: upsertedTagNode.created_at
        ? upsertedTagNode.created_at instanceof Date
          ? upsertedTagNode.created_at.toISOString()
          : upsertedTagNode.created_at.toString()
        : null,
    };

    logger.info(
      `[tag.ops] Tag node ${upsertedTagNode.id} (${upsertedTagNode.name}) upserted successfully.`,
    );
    return { success: true, message: 'Tag added/updated successfully.', tag: zodTagNode };
  } catch (error: any) {
    logger.error(`[tag.ops] Error in addTagOp for tag ID ${tagDataFromTool.id}: ${error.message}`, {
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
 * Operation to apply a tag to an item.
 */
export async function tagItemOp(
  mcpContext: McpServerRequestContext,
  repositoryName: string,
  branch: string,
  itemId: string,
  itemType: z.infer<typeof TagItemInputSchema>['itemType'], // From Zod schema
  tagId: string,
  repositoryRepo: RepositoryRepository,
  tagRepo: TagRepository,
  // May need other item-specific repositories if TagRepository.addItemTag is not generic enough
): Promise<z.infer<typeof TagItemOutputSchema>> {
  const logger = mcpContext.logger || console;
  const repoId = `${repositoryName}:${branch}`;
  logger.info(`[tag.ops] tagItemOp: Item ${itemType}:${itemId} with Tag:${tagId} in ${repoId}`);

  try {
    const repoNode = await repositoryRepo.findByName(repositoryName, branch);
    if (!repoNode || !repoNode.id) {
      logger.warn(`[tag.ops] Repository ${repoId} not found for tagItemOp.`);
      return { success: false, message: `Repository ${repoId} not found.` };
    }

    // Construct the specific relationship type, e.g., TAGGED_COMPONENT, TAGGED_FILE
    // This should align with DDL and TagRepository.addItemTag expectations
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
      logger.warn(
        `[tag.ops] tagRepo.addItemTag failed for Item ${itemType}:${itemId}, Tag:${tagId}`,
      );
      return { success: false, message: 'Failed to apply tag to item in repository.' };
    }

    logger.info(`[tag.ops] Item ${itemType}:${itemId} successfully tagged with ${tagId}.`);
    return { success: true, message: 'Item tagged successfully.' };
  } catch (error: any) {
    logger.error(
      `[tag.ops] Error in tagItemOp for Item ${itemType}:${itemId}, Tag:${tagId}: ${error.message}`,
      { error: error.toString(), stack: error.stack },
    );
    return {
      success: false,
      message: error.message || 'An unexpected error occurred while tagging the item.',
    };
  }
}

/**
 * Operation to find items associated with a specific tag.
 */
export async function findItemsByTagOp(
  mcpContext: McpServerRequestContext,
  repositoryName: string,
  branch: string,
  tagId: string,
  itemTypeFilter: z.infer<typeof FindItemsByTagInputSchema>['itemTypeFilter'],
  repositoryRepo: RepositoryRepository,
  tagRepo: TagRepository,
): Promise<z.infer<typeof FindItemsByTagOutputSchema>> {
  const logger = mcpContext.logger || console;
  const repoId = `${repositoryName}:${branch}`;
  logger.info(
    `[tag.ops] findItemsByTagOp for Tag:${tagId} in ${repoId}, Filter: ${itemTypeFilter}`,
  );

  try {
    const repoNode = await repositoryRepo.findByName(repositoryName, branch);
    if (!repoNode || !repoNode.id) {
      logger.warn(`[tag.ops] Repository ${repoId} not found for findItemsByTagOp.`);
      return { tagId, items: [] }; // Return empty items as per schema if repo not found
    }

    // tagRepo.findItemsByTag is expected to return internal item representations
    const itemsInternal = await tagRepo.findItemsByTag(repoNode.id, branch, tagId, itemTypeFilter);

    // Transform internal items to Zod RelatedItemBaseSchema (or a more specific union type if defined)
    const zodItems: z.infer<typeof RelatedItemBaseSchema>[] = itemsInternal.map((item: any) => ({
      id: item.id?.toString(),
      type: item.type || (Array.isArray(item.labels) ? item.labels[0] : 'Unknown'), // Assuming type/label info is available
      ...(item.properties || item), // Spread other properties
    }));

    logger.info(`[tag.ops] Found ${zodItems.length} items for Tag:${tagId} in ${repoId}`);
    return { tagId, items: zodItems };
  } catch (error: any) {
    logger.error(`[tag.ops] Error in findItemsByTagOp for Tag:${tagId}: ${error.message}`, {
      error: error.toString(),
      stack: error.stack,
    });
    return { tagId, items: [] }; // Return empty items on error as per schema
  }
}
