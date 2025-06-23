import { KuzuDBClient } from '../db/kuzu'; // Corrected path
import { File } from '../types'; // Internal domain types
import { formatGraphUniqueId } from '../utils/id.utils'; // Add missing import
import { RepositoryRepository } from './repository.repository'; // For context/scoping if needed
import { loggers } from '../utils/logger';

export class FileRepository {
  private logger = loggers.repository();
  private kuzuClient: KuzuDBClient;
  private repositoryRepo: RepositoryRepository; // Optional, for complex scoping or validation

  constructor(kuzuClient: KuzuDBClient, repositoryRepo: RepositoryRepository) {
    this.kuzuClient = kuzuClient;
    this.repositoryRepo = repositoryRepo;
  }

  /**
   * Creates a File node in KuzuDB.
   * @param repoNodeId - The internal ID (_id) of the parent Repository node.
   * @param branch - The branch name for scoping.
   * @param fileData - Data for the new file (should align with File type, excluding relational/generated fields).
   * @returns The created File object or null on failure.
   */
  async createFileNode(
    repoNodeId: string, // This is the synthetic ID like "test-repo:main"
    branch: string,
    // Input data should be clean, matching internal File type structure for new node properties
    fileData: Omit<File, 'repository' | 'branch' | 'created_at' | 'updated_at'> & { id: string },
  ): Promise<File | null> {
    // Extract repository name from synthetic ID
    const repositoryName = repoNodeId.split(':')[0];
    const now = new Date();

    // Use the same pattern as ComponentRepository - single MERGE query with repository relationship
    // Note: File table uses 'id' as PRIMARY KEY, not 'graph_unique_id'
    const upsertQuery = `
      MERGE (f:File {id: $fileId})
      ON CREATE SET
        f.name = $name,
        f.path = $path,
        f.mime_type = $mime_type,
        f.size = $size,
        f.repository = $repository,
        f.branch = $branch,
        f.lastModified = $now,
        f.checksum = $checksum,
        f.metadata = $metadata,
        f.created_at = $createdAt,
        f.updated_at = $now
      ON MATCH SET
        f.name = $name,
        f.path = $path,
        f.mime_type = $mime_type,
        f.size = $size,
        f.repository = $repository,
        f.branch = $branch,
        f.lastModified = $now,
        f.checksum = $checksum,
        f.metadata = $metadata,
        f.updated_at = $now
      MERGE (repo:Repository {id: $repositoryId})
      ON CREATE SET repo.name = $repository, repo.created_at = $now
      MERGE (f)-[:PART_OF]->(repo)
    `;

    try {
      await this.kuzuClient.executeQuery(upsertQuery, {
        fileId: fileData.id,
        name: fileData.name,
        path: fileData.path,
        mime_type: fileData.mime_type || 'unknown',
        size: fileData.size ?? 0,
        repository: repositoryName,
        repositoryId: repoNodeId,
        branch: branch,
        checksum: '', // Default empty checksum
        metadata: JSON.stringify({
          content: fileData.content || null,
          metrics: fileData.metrics || null,
        }),
        now: now,
        createdAt: now,
      });

      // Return the created file
      return {
        id: fileData.id,
        name: fileData.name,
        path: fileData.path,
        size: fileData.size ?? 0,
        mime_type: fileData.mime_type || 'unknown',
        content: fileData.content || null,
        metrics: fileData.metrics || null,
        repository: repositoryName,
        branch: branch,
        created_at: now,
        updated_at: now,
      } as File;
    } catch (error) {
      this.logger.error(`[FileRepository] Error creating File node ${fileData.id}:`, error);
      return null;
    }
  }

  async findFileById(repoNodeId: string, branch: string, fileId: string): Promise<File | null> {
    const query = `
      MATCH (f:File {id: $fileId})-[:PART_OF]->(repo:Repository {id: $repoNodeId}) 
      WHERE json_extract(f.metadata, 'branch') = $branch
      RETURN f, repo
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, { fileId, repoNodeId, branch });
      if (result && result.length > 0) {
        const foundNode = result[0].f.properties || result[0].f;
        const repoNode = result[0].repo.properties || result[0].repo;
        const parsedMetadata = this._parseFileMetadata(foundNode.metadata, foundNode.id);

        // Verify branch matches (additional safety check)
        if (parsedMetadata.branch !== branch) {
          this.logger.warn(
            `[FileRepository] Branch mismatch for file ${fileId}: expected ${branch}, got ${parsedMetadata.branch}`,
          );
          return null;
        }

        // Return a File object that matches our interface
        return {
          id: foundNode.id?.toString(),
          name: foundNode.name,
          path: foundNode.path,
          size: foundNode.size,
          mime_type: parsedMetadata.mime_type,
          content: parsedMetadata.content,
          metrics: parsedMetadata.metrics,
          repository: repoNode.name, // Use the actual repository name from the graph
          branch: parsedMetadata.branch || branch,
          created_at: new Date(foundNode.lastModified),
          updated_at: new Date(foundNode.lastModified),
        } as File;
      }
      return null;
    } catch (error) {
      this.logger.error(`[FileRepository] Error finding File node ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Creates a relationship between a Component and a File.
   * Direction: (Component)-[:IMPLEMENTS]->(File) - Component implements functionality in File
   * @param repoNodeId PK of the repository node
   * @param branch Branch name
   * @param componentId Logical ID of the Component
   * @param fileId Logical ID of the File
   * @param relationshipType e.g., IMPLEMENTS (default)
   */
  async linkComponentToFile(
    repoNodeId: string,
    branch: string,
    componentId: string,
    fileId: string,
    relationshipType: string = 'IMPLEMENTS',
  ): Promise<boolean> {
    // Component schema: uses graph_unique_id as primary key (format: repo:branch:id)
    // File schema: stores repository and branch in metadata JSON field and uses PART_OF relationship
    const repositoryName = repoNodeId.split(':')[0]; // Consistent repository name extraction
    const componentGraphUniqueId = formatGraphUniqueId(repositoryName, branch, componentId);
    const safeRelType = relationshipType.replace(/[^a-zA-Z0-9_]/g, '');

    if (!safeRelType) {
      this.logger.error(
        `[FileRepository] Invalid relationshipType: "${relationshipType}". Sanitized version is empty.`,
      );
      return false;
    }

    // Create the relationship: (Component)-[:IMPLEMENTS]->(File)
    // This means: Component implements functionality that is contained in File
    // Use PART_OF relationship and metadata JSON extraction to find the correct file
    const query = `
      MATCH (c:Component {graph_unique_id: $componentGraphUniqueId})
      MATCH (f:File {id: $fileId})-[:PART_OF]->(repo:Repository {id: $repoNodeId})
      WHERE json_extract(f.metadata, 'branch') = $branch
      MERGE (c)-[r:${safeRelType}]->(f)
      RETURN r
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, {
        componentGraphUniqueId,
        fileId,
        repoNodeId,
        branch,
      });
      return result && result.length > 0;
    } catch (error) {
      this.logger.error(
        `[FileRepository] Error linking C:${componentId} to F:${fileId} via ${relationshipType}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Finds files associated with a component via a specific relationship type.
   * Direction: (Component)-[:IMPLEMENTS]->(File) - Component implements functionality in File
   */
  async findFilesByComponent(
    repoNodeId: string,
    branch: string,
    componentId: string,
    relationshipType: string = 'IMPLEMENTS',
  ): Promise<File[]> {
    const repositoryName = repoNodeId.split(':')[0]; // Consistent repository name extraction
    const componentGraphUniqueId = formatGraphUniqueId(repositoryName, branch, componentId);
    const safeRelType = relationshipType.replace(/[^a-zA-Z0-9_]/g, '');

    if (!safeRelType) {
      this.logger.error(
        `[FileRepository] Invalid relationshipType: "${relationshipType}". Sanitized version is empty.`,
      );
      return [];
    }

    // Query expects: (Component)-[:IMPLEMENTS]->(File)
    // This finds Files that are implemented by the Component, filtered by branch using metadata JSON
    const query = `
      MATCH (c:Component {graph_unique_id: $componentGraphUniqueId})
      MATCH (c)-[r:${safeRelType}]->(f:File)
      MATCH (f)-[:PART_OF]->(repo:Repository {id: $repoNodeId})
      WHERE json_extract(f.metadata, 'branch') = $branch
      RETURN f, repo
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, {
        componentGraphUniqueId,
        repoNodeId,
        branch,
      });

      return result
        .map((row: any) => {
          const fileNode = row.f.properties || row.f;
          const repoNode = row.repo.properties || row.repo;
          const parsedMetadata = this._parseFileMetadata(fileNode.metadata, fileNode.id);

          // Verify branch matches (additional safety check)
          if (parsedMetadata.branch !== branch) {
            return null;
          }

          return {
            id: fileNode.id?.toString(),
            name: fileNode.name,
            path: fileNode.path,
            size: fileNode.size,
            mime_type: parsedMetadata.mime_type,
            content: parsedMetadata.content,
            metrics: parsedMetadata.metrics,
            repository: repoNode.name, // Use the actual repository name from the graph
            branch: parsedMetadata.branch || branch,
            created_at: new Date(fileNode.lastModified),
            updated_at: new Date(fileNode.lastModified),
          } as File;
        })
        .filter(Boolean); // Filter out null results from branch mismatch
    } catch (error: any) {
      this.logger.error(
        `[FileRepository] Error finding files for C:${componentId} via ${relationshipType}: ${error.message}`,
        { error, stack: error.stack },
      );
      return [];
    }
  }

  /**
   * Finds components that implement a specific file via a relationship type.
   * Direction: (Component)-[:IMPLEMENTS]->(File) - Component implements functionality in File
   */
  async findComponentsByFile(
    repoNodeId: string,
    branch: string,
    fileId: string,
    relationshipType: string = 'IMPLEMENTS',
  ): Promise<any[]> {
    const safeRelType = relationshipType.replace(/[^a-zA-Z0-9_]/g, '');

    if (!safeRelType) {
      this.logger.error(
        `[FileRepository] Invalid relationshipType: "${relationshipType}". Sanitized version is empty.`,
      );
      return [];
    }
    // Query expects: (Component)-[:IMPLEMENTS]->(File)
    // This finds Components that implement the File, filtered by branch
    // Use proper JSON extraction instead of fragile CONTAINS on JSON string
    const query = `
      MATCH (f:File {id: $fileId})-[:PART_OF]->(repo:Repository {id: $repoNodeId})
      MATCH (c:Component)-[r:${safeRelType}]->(f)
      WHERE c.branch = $branch
      RETURN c
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, {
        fileId,
        repoNodeId,
        branch,
      });
      return result.map((row: any) => {
        const componentNode = row.c.properties || row.c;
        return {
          id: componentNode.id?.toString(),
          name: componentNode.name,
          kind: componentNode.kind,
          status: componentNode.status,
          branch: componentNode.branch || branch,
          repository: repoNodeId,
          depends_on: componentNode.depends_on || [],
          created_at: new Date(componentNode.created_at || Date.now()),
          updated_at: new Date(componentNode.updated_at || Date.now()),
        };
      });
    } catch (error: any) {
      this.logger.error(
        `[FileRepository] Error finding components for F:${fileId} via ${safeRelType}: ${error.message}`,
        { error, stack: error.stack },
      );
      return [];
    }
  }

  // Add other methods like updateFileNode, deleteFileNode as needed.

  /**
   * Safely parses the metadata JSON string from a File node.
   * @param metadataString The raw metadata JSON string.
   * @param fileId The ID of the file for logging purposes.
   * @returns A structured object with metadata properties.
   */
  private _parseFileMetadata(
    metadataString: string | undefined,
    fileId: string,
  ): {
    branch: string | null;
    content: string | null;
    metrics: any | null;
    mime_type: string | null;
  } {
    const defaults = {
      branch: null,
      content: null,
      metrics: null,
      mime_type: null,
    };

    if (!metadataString) {
      return defaults;
    }

    try {
      const parsed = JSON.parse(metadataString);
      return { ...defaults, ...parsed };
    } catch (e) {
      this.logger.warn(`[FileRepository] Failed to parse metadata for file ${fileId}`);
      return defaults;
    }
  }
}
