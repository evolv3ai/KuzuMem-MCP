import { KuzuDBClient } from '../db/kuzu'; // Corrected path
import { File } from '../types'; // Internal domain types
import { RepositoryRepository } from './repository.repository'; // For context/scoping if needed

export class FileRepository {
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
    repoNodeId: string, // This is the actual PK of the Repository node in Kuzu
    branch: string,
    // Input data should be clean, matching internal File type structure for new node properties
    fileData: Omit<File, 'repository' | 'branch' | 'created_at' | 'updated_at'> & { id: string },
  ): Promise<File | null> {
    const now = new Date();
    const fileNodeProps = {
      ...fileData,
      id: fileData.id, // This is the logical ID used as Kuzu PK for File table
      repository: repoNodeId, // Link to the Repository node's PK
      branch: branch,
      created_at: now,
      updated_at: now,
      // Use properties that actually exist in File interface
      name: fileData.name,
      path: fileData.path,
      size: fileData.size || null,
      mime_type: fileData.mime_type || null,
    };

    const query = `
      CREATE (f:File $fileNodeProps)
      RETURN f
    `;
    // KuzuDB might require MERGE for unique PKs:
    // MERGE (f:File {id: $fileNodeProps.id, repository: $fileNodeProps.repository, branch: $fileNodeProps.branch})
    // ON CREATE SET f = $fileNodeProps
    // ON MATCH SET f += $fileNodeProps // Or specific properties to update
    // RETURN f
    // Simpler CREATE for now, assuming ID + repo + branch makes it unique or handled by PK constraint

    try {
      const result = await this.kuzuClient.executeQuery(query, { fileNodeProps });
      if (result && result.length > 0) {
        const createdNode = result[0].f.properties || result[0].f; // Kuzu specific result access
        return { ...createdNode, id: createdNode.id?.toString() } as File;
      }
      return null;
    } catch (error) {
      console.error(`[FileRepository] Error creating File node ${fileData.id}:`, error);
      return null;
    }
  }

  async findFileById(repoNodeId: string, branch: string, fileId: string): Promise<File | null> {
    const query = `MATCH (f:File {id: $fileId, repository: $repoNodeId, branch: $branch}) RETURN f;`;
    try {
      const result = await this.kuzuClient.executeQuery(query, { fileId, repoNodeId, branch });
      if (result && result.length > 0) {
        const foundNode = result[0].f.properties || result[0].f;
        return { ...foundNode, id: foundNode.id?.toString() } as File;
      }
      return null;
    } catch (error) {
      console.error(`[FileRepository] Error finding File node ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Creates a relationship between a Component and a File.
   * @param repoNodeId PK of the repository node
   * @param branch Branch name
   * @param componentId Logical ID of the Component
   * @param fileId Logical ID of the File
   * @param relationshipType e.g., COMPONENT_IMPLEMENTS_FILE
   */
  async linkComponentToFile(
    repoNodeId: string,
    branch: string,
    componentId: string,
    fileId: string,
    relationshipType: string = 'CONTAINS_FILE',
  ): Promise<boolean> {
    const safeRelType = relationshipType.replace(/[^a-zA-Z0-9_]/g, '');
    const query = `
      MATCH (c:Component {id: $componentId, repository: $repoNodeId, branch: $branch}), 
            (f:File {id: $fileId, repository: $repoNodeId, branch: $branch})
      MERGE (c)-[r:${safeRelType}]->(f)
      RETURN r
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, {
        componentId,
        fileId,
        repoNodeId,
        branch,
      });
      return result && result.length > 0;
    } catch (error) {
      console.error(
        `[FileRepository] Error linking C:${componentId} to F:${fileId} via ${safeRelType}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Finds files associated with a component via a specific relationship type.
   */
  async findFilesByComponent(
    repoNodeId: string,
    branch: string,
    componentId: string,
    relationshipType: string = 'COMPONENT_IMPLEMENTS_FILE',
  ): Promise<File[]> {
    const safeRelType = relationshipType.replace(/[^a-zA-Z0-9_]/g, '');
    const query = `
      MATCH (c:Component {id: $componentId, repository: $repoNodeId, branch: $branch})-[r:${safeRelType}]->(f:File)
      WHERE f.repository = $repoNodeId AND f.branch = $branch // Ensure file is also in same repo/branch
      RETURN f
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, { componentId, repoNodeId, branch });
      return result.map((row: any) => {
        const fileNode = row.f.properties || row.f;
        return { ...fileNode, id: fileNode.id?.toString() } as File;
      });
    } catch (error) {
      console.error(
        `[FileRepository] Error finding files for C:${componentId} via ${safeRelType}:`,
        error,
      );
      return [];
    }
  }

  // Add other methods like findComponentsByFile, updateFileNode, deleteFileNode as needed.
}
