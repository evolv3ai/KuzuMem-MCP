import { KuzuDBClient } from '../db/kuzu';
import { Tag } from '../types'; // Assuming all these types can be tagged
import { formatGraphUniqueId } from '../utils/id.utils';
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
    tagData: Omit<Tag, 'created_at'> & {
      id: string;
      name: string;
      repository?: string;
      branch?: string;
      category?: string;
    },
  ): Promise<Tag | null> {
    const now = new Date();

    // Build query conditionally based on whether repository is provided
    let query: string;
    let queryParams: Record<string, any>;

    if (tagData.repository) {
      // Atomic query that creates the Tag node and establishes PART_OF relationship if repository exists
      query = `
        OPTIONAL MATCH (repo:Repository {id: $repository})
        MERGE (t:Tag {id: $id})
        ON CREATE SET 
          t.name = $name, 
          t.color = $color, 
          t.description = $description,
          t.category = $category,
          t.repository = $repository,
          t.branch = $branch,
          t.created_at = $created_at
        ON MATCH SET 
          t.name = $name, 
          t.color = $color, 
          t.description = $description,
          t.category = $category,
          t.repository = $repository,
          t.branch = $branch
        WITH t, repo
        FOREACH (ignoreMe IN CASE WHEN repo IS NOT NULL THEN [1] ELSE [] END |
          MERGE (t)-[:PART_OF]->(repo)
        )
        RETURN t
      `;
      queryParams = {
        id: tagData.id,
        name: tagData.name,
        color: tagData.color || null,
        description: tagData.description || null,
        repository: tagData.repository,
        branch: tagData.branch || 'main',
        category: tagData.category || 'general',
        created_at: now,
      };
    } else {
      // Create global tag without repository relationship
      query = `
        MERGE (t:Tag {id: $id})
        ON CREATE SET 
          t.name = $name, 
          t.color = $color, 
          t.description = $description,
          t.category = $category,
          t.branch = $branch,
          t.created_at = $created_at
        ON MATCH SET 
          t.name = $name, 
          t.color = $color, 
          t.description = $description,
          t.category = $category,
          t.branch = $branch
        RETURN t
      `;
      queryParams = {
        id: tagData.id,
        name: tagData.name,
        color: tagData.color || null,
        description: tagData.description || null,
        branch: tagData.branch || 'main',
        category: tagData.category || 'general',
        created_at: now,
      };
    }

    try {
      const result = await this.kuzuClient.executeQuery(query, queryParams);
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
    const safeItemLabel = itemLabel.replace(/[^a-zA-Z0-9_]/g, '');

    // Extract repository name from repoNodeId for graph_unique_id construction
    const [repositoryName] = repoNodeId.split(':');

    // Schema-aware matching: Component, Decision, Rule, Context use graph_unique_id
    // File uses id, repository, branch
    let matchClause: string;
    let params: Record<string, any>;

    if (
      itemLabel === 'Component' ||
      itemLabel === 'Decision' ||
      itemLabel === 'Rule' ||
      itemLabel === 'Context'
    ) {
      // These entities use graph_unique_id as their primary key
      const graphUniqueId = formatGraphUniqueId(repositoryName, branch, itemId);
      matchClause = `(item:\`${safeItemLabel}\` {graph_unique_id: $graphUniqueId})`;
      params = {
        graphUniqueId,
        tagId,
      };
    } else {
      // File has repository property and uses id as primary key
      matchClause = `(item:\`${safeItemLabel}\` {id: $itemId, repository: $repoNodeId, branch: $branch})`;
      params = {
        itemId,
        repoNodeId,
        branch,
        tagId,
      };
    }

    // Use TAGGED_WITH relationship as defined in the schema - the relationshipType parameter is informational
    const query = `
      MATCH ${matchClause},
             (tag:Tag {id: $tagId})
      MERGE (item)-[r:TAGGED_WITH]->(tag)
      RETURN r
    `;

    try {
      const result = await this.kuzuClient.executeQuery(query, params);
      return result && result.length > 0;
    } catch (error) {
      console.error(
        `[TagRepository] Error tagging ${itemLabel} ${itemId} with Tag ${tagId} via TAGGED_WITH:`,
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
    // Extract repository name from repoNodeId for filtering
    const [repositoryName] = repoNodeId.split(':');

    // Build MATCH clause depending on filter
    const matchClause =
      itemTypeFilter && itemTypeFilter !== 'All'
        ? `(item:\`${itemTypeFilter.replace(/[^a-zA-Z0-9_]/g, '')}\`)`
        : '(item)';

    // Use TAGGED_WITH relationship and handle both graph_unique_id entities and id-based entities (File)
    const query = `
      MATCH ${matchClause}-[r:TAGGED_WITH]->(t:Tag {id: $tagId})
      WHERE 
        (
          (item.graph_unique_id IS NOT NULL AND item.graph_unique_id STARTS WITH $repoPrefix) OR
          (item.graph_unique_id IS NULL AND item.repository = $repoNodeId AND item.branch = $branch)
        )
      RETURN 
        CASE 
          WHEN item.graph_unique_id IS NOT NULL THEN item.id
          ELSE item.id 
        END AS id, 
        labels(item)[0] AS type, 
        item AS properties
    `;

    try {
      const repoPrefix = `${repositoryName}:${branch}:`;
      const result = await this.kuzuClient.executeQuery(query, {
        tagId,
        branch,
        repoNodeId,
        repoPrefix,
      });
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
