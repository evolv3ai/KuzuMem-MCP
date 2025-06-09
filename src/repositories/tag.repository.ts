import { KuzuDBClient } from '../db/kuzu';
import { Tag } from '../types'; // Assuming all these types can be tagged
import { RepositoryRepository } from './repository.repository';

// Define a union type for all items that can be tagged, based on schema_evolution.md and TagItemInputSchema
export type TaggableItemType = 'Component' | 'Rule' | 'Context' | 'File' | 'Decision'; // Added Decision

export class TagRepository {
  private kuzuClient: KuzuDBClient;
  private repositoryRepo: RepositoryRepository; // For context, if tags are ever repo-scoped or queries need it

  constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo;
  }

  /**
   * Creates or updates a Tag node. Tags are assumed to be global based on current schema.
   * @param tagData - Data for the tag (id, name, color, description).
   * @returns The upserted Tag object or null on failure.
   */
  async upsertTagNode(
    // Internal Tag type might not have created_at if DB handles it, but Omit is safer.
    tagData: Omit<Tag, 'created_at'> & { id: string; name: string },
  ): Promise<Tag | null> {
    const now = new Date();
    const tagNodeProps = {
      ...tagData,
      id: tagData.id, // Kuzu PK for Tag table
      name: tagData.name,
      color: tagData.color || null,
      description: tagData.description || null,
      created_at: now, // Set created_at on initial creation
      // updated_at: now, // Kuzu MERGE ON MATCH can handle updates if needed
    };

    // MERGE is good for upserting based on a unique property (id for Tag)
    // KuzuDB doesn't support setting properties from a map parameter, so we set them individually
    const query = `
      MERGE (t:Tag {id: $id})
      ON CREATE SET t.id = $id, t.name = $name, t.color = $color, t.description = $description, t.created_at = $created_at
      ON MATCH SET t.name = $name, t.color = $color, t.description = $description
      RETURN t
    `;

    try {
      const result = await this.kuzuClient.executeQuery(query, {
        id: tagNodeProps.id,
        name: tagNodeProps.name,
        color: tagNodeProps.color,
        description: tagNodeProps.description,
        created_at: tagNodeProps.created_at,
      });
      if (result && result.length > 0) {
        const node = result[0].t.properties || result[0].t;
        return { ...node, id: node.id?.toString() } as Tag;
      }
      return null;
    } catch (error) {
      console.error(`[TagRepository] Error upserting Tag node ${tagData.id}:`, error);
      return null;
    }
  }

  async findTagById(tagId: string): Promise<Tag | null> {
    const query = `MATCH (t:Tag {id: $tagId}) RETURN t;`;
    try {
      const result = await this.kuzuClient.executeQuery(query, { tagId });
      if (result && result.length > 0) {
        const node = result[0].t.properties || result[0].t;
        return { ...node, id: node.id?.toString() } as Tag;
      }
      return null;
    } catch (error) {
      console.error(`[TagRepository] Error finding Tag node by ID ${tagId}:`, error);
      return null;
    }
  }

  async findTagByName(tagName: string): Promise<Tag | null> {
    // Assuming 'name' property on Tag node is indexed for efficient lookup
    const query = `MATCH (t:Tag {name: $tagName}) RETURN t LIMIT 1;`;
    try {
      const result = await this.kuzuClient.executeQuery(query, { tagName });
      if (result && result.length > 0) {
        const node = result[0].t.properties || result[0].t;
        return { ...node, id: node.id?.toString() } as Tag;
      }
      return null;
    } catch (error) {
      console.error(`[TagRepository] Error finding Tag node by name ${tagName}:`, error);
      return null;
    }
  }

  /**
   * Applies a tag to an item by creating a relationship.
   * Assumes item nodes have 'id', 'repository', and 'branch' properties for matching.
   * @param repoNodeId PK of the repository (e.g., format 'repoName:branch')
   * @param branch Branch name (can be part of repoNodeId or separate for clarity)
   * @param itemId Logical ID of the item to tag
   * @param itemLabel KuzuDB Label of the item (e.g., 'Component', 'File')
   * @param tagId Logical ID of the Tag
   * @param relationshipType e.g., TAGGED_COMPONENT, TAGGED_FILE
   */
  async addItemTag(
    repoNodeId: string, // Format: 'repositoryName:branchName'
    branch: string, // For explicit branch matching if not fully covered by repoNodeId in item properties
    itemId: string,
    itemLabel: TaggableItemType, // Use the TaggableItemType
    tagId: string,
    relationshipType: string, // e.g., TAGGED_COMPONENT, TAGGED_FILE - construct this carefully
  ): Promise<boolean> {
    const safeRelType = relationshipType.replace(/[^a-zA-Z0-9_]/g, '');
    const safeItemLabel = itemLabel.replace(/[^a-zA-Z0-9_]/g, '');

    // Ensure item is matched within its specific repository and branch context
    const query = `
      MATCH (item:\`${safeItemLabel}\` {id: $itemId, repository: $repoNodeId, branch: $branch}),
             (tag:Tag {id: $tagId})
      MERGE (item)-[r:${safeRelType}]->(tag)
      RETURN r
    `;
    // If tags are global and item's repo/branch context is sufficient:
    // const query = \`
    //   MATCH (item:\\\`${safeItemLabel}\\\` {id: $itemId, repository: $repoNodeId, branch: $branch}),
    //         (tag:Tag {id: $tagId})
    //   MERGE (item)-[:IS_TAGGED_WITH]->(tag) // Using a single generic relationship type
    //   RETURN r
    // \`;
    try {
      const result = await this.kuzuClient.executeQuery(query, {
        itemId,
        repoNodeId,
        branch,
        tagId,
      });
      return result && result.length > 0;
    } catch (error) {
      console.error(
        `[TagRepository] Error tagging ${itemLabel} ${itemId} with Tag ${tagId} via ${safeRelType}:`,
        error,
      );
      return false;
    }
  }

  async findItemsByTag(
    repoNodeId: string,
    branch: string,
    tagId: string,
    itemTypeFilter?: TaggableItemType | 'All', // Use the TaggableItemType
  ): Promise<any[]> {
    // Build MATCH clause depending on filter
    const matchClause =
      itemTypeFilter && itemTypeFilter !== 'All'
        ? `(item:\`${itemTypeFilter.replace(/[^a-zA-Z0-9_]/g, '')}\`)`
        : '(item)';

    const query = `
      MATCH ${matchClause}-[:IS_TAGGED_WITH]->(t:Tag {id: $tagId})
      WHERE item.repository = $repoNodeId AND item.branch = $branch
      RETURN item.id AS id, labels(item)[0] AS type, item AS properties
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, { tagId, repoNodeId, branch });
      if (Array.isArray(result)) {
        return result.map((row: any) => {
          const props = row.properties.properties || row.properties;
          return { id: row.id?.toString(), type: row.type, ...props };
        });
      }
      return [];
    } catch (error) {
      console.error(`[TagRepository] Error finding items for Tag ${tagId}:`, error);
      return [];
    }
  }

  // Add findTagsByItem, removeTagFromItem etc. as needed
}
