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
    // Map the file data to match the database schema, handling undefined values properly
    // The database schema has: id, name, path, type, size, lastModified, checksum, metadata
    const fileNodeProps = {
      id: fileData.id,
      name: fileData.name,
      path: fileData.path,
      type: fileData.mime_type || 'unknown', // Map mime_type to type for DB schema
      size: fileData.size ?? 0, // Use nullish coalescing to handle undefined properly
      lastModified: new Date().toISOString(),
      checksum: '', // Not provided in File interface, use empty string
      metadata: JSON.stringify({
        branch: branch,
        repository: repoNodeId,
        content: fileData.content || null,
        metrics: fileData.metrics || null,
        mime_type: fileData.mime_type || null,
      }), // Store additional metadata as JSON string
    };

    // Query that creates/updates the File node and optionally establishes PART_OF relationship
    // Uses OPTIONAL MATCH to allow file creation even if repository doesn't exist yet
    const query = `
      OPTIONAL MATCH (repo:Repository {id: $repository})
      MERGE (f:File {id: $id})
      ON CREATE SET
        f.name = $name,
        f.path = $path,
        f.type = $type,
        f.size = $size,
        f.lastModified = $lastModified,
        f.checksum = $checksum,
        f.metadata = $metadata
      ON MATCH SET
        f.name = $name,
        f.path = $path,
        f.type = $type,
        f.size = $size,
        f.lastModified = $lastModified,
        f.checksum = $checksum,
        f.metadata = $metadata
      WITH f, repo
      WHERE repo IS NOT NULL
      MERGE (f)-[:PART_OF]->(repo)
      RETURN f
    `;

    try {
      const result = await this.kuzuClient.executeQuery(query, {
        id: fileNodeProps.id,
        repository: repoNodeId,
        name: fileNodeProps.name,
        path: fileNodeProps.path,
        type: fileNodeProps.type,
        size: fileNodeProps.size,
        lastModified: fileNodeProps.lastModified,
        checksum: fileNodeProps.checksum,
        metadata: fileNodeProps.metadata,
      });

      if (result && result.length > 0) {
        const createdNode = result[0].f.properties || result[0].f;

        // Parse metadata back to individual properties for the return object
        let parsedMetadata = {};
        try {
          parsedMetadata = JSON.parse(createdNode.metadata || '{}');
        } catch (e) {
          console.warn(`[FileRepository] Failed to parse metadata for file ${createdNode.id}`);
        }

        // Return a File object that matches our interface
        return {
          id: createdNode.id?.toString(),
          name: createdNode.name,
          path: createdNode.path,
          size: createdNode.size,
          mime_type: (parsedMetadata as any).mime_type,
          content: (parsedMetadata as any).content,
          metrics: (parsedMetadata as any).metrics,
          repository: repoNodeId,
          branch: branch,
          created_at: new Date(createdNode.lastModified),
          updated_at: new Date(createdNode.lastModified),
        } as File;
      }
      return null;
    } catch (error) {
      console.error(`[FileRepository] Error creating File node ${fileData.id}:`, error);
      return null;
    }
  }

  async findFileById(repoNodeId: string, branch: string, fileId: string): Promise<File | null> {
    const query = `
      MATCH (f:File {id: $fileId})-[:PART_OF]->(repo:Repository {id: $repoNodeId}) 
      RETURN f
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, { fileId, repoNodeId });
      if (result && result.length > 0) {
        const foundNode = result[0].f.properties || result[0].f;

        // Parse metadata back to individual properties
        let parsedMetadata = {};
        try {
          parsedMetadata = JSON.parse(foundNode.metadata || '{}');
        } catch (e) {
          console.warn(`[FileRepository] Failed to parse metadata for file ${foundNode.id}`);
        }

        // Return a File object that matches our interface
        return {
          id: foundNode.id?.toString(),
          name: foundNode.name,
          path: foundNode.path,
          size: foundNode.size,
          mime_type: (parsedMetadata as any).mime_type,
          content: (parsedMetadata as any).content,
          metrics: (parsedMetadata as any).metrics,
          repository: repoNodeId,
          branch: (parsedMetadata as any).branch || branch,
          created_at: new Date(foundNode.lastModified),
          updated_at: new Date(foundNode.lastModified),
        } as File;
      }
      return null;
    } catch (error) {
      console.error(`[FileRepository] Error finding File node ${fileId}:`, error);
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
    const safeRelType = relationshipType.replace(/[^a-zA-Z0-9_]/g, '');
    // Explicit direction: (Component)-[:IMPLEMENTS]->(File)
    // This means: Component implements functionality that is contained in File
    const query = `
      MATCH (c:Component {id: $componentId})-[:PART_OF]->(repo:Repository {id: $repoNodeId}), 
            (f:File {id: $fileId})-[:PART_OF]->(repo)
      MERGE (c)-[r:${safeRelType}]->(f)
      RETURN r
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, {
        componentId,
        fileId,
        repoNodeId,
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
   * Direction: (Component)-[:IMPLEMENTS]->(File) - Component implements functionality in File
   */
  async findFilesByComponent(
    repoNodeId: string,
    branch: string,
    componentId: string,
    relationshipType: string = 'IMPLEMENTS',
  ): Promise<File[]> {
    const safeRelType = relationshipType.replace(/[^a-zA-Z0-9_]/g, '');
    // Query expects: (Component)-[:IMPLEMENTS]->(File)
    // This finds Files that are implemented by the Component
    const query = `
      MATCH (c:Component {id: $componentId})-[:PART_OF]->(repo:Repository {id: $repoNodeId}),
            (c)-[r:${safeRelType}]->(f:File)
      WHERE (f)-[:PART_OF]->(repo)
      RETURN f
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, { componentId, repoNodeId });
      return result.map((row: any) => {
        const fileNode = row.f.properties || row.f;

        // Parse metadata back to individual properties
        let parsedMetadata = {};
        try {
          parsedMetadata = JSON.parse(fileNode.metadata || '{}');
        } catch (e) {
          console.warn(`[FileRepository] Failed to parse metadata for file ${fileNode.id}`);
        }

        return {
          id: fileNode.id?.toString(),
          name: fileNode.name,
          path: fileNode.path,
          size: fileNode.size,
          mime_type: (parsedMetadata as any).mime_type,
          content: (parsedMetadata as any).content,
          metrics: (parsedMetadata as any).metrics,
          repository: repoNodeId,
          branch: (parsedMetadata as any).branch || branch,
          created_at: new Date(fileNode.lastModified),
          updated_at: new Date(fileNode.lastModified),
        } as File;
      });
    } catch (error) {
      console.error(
        `[FileRepository] Error finding files for C:${componentId} via ${safeRelType}:`,
        error,
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
    // Query expects: (Component)-[:IMPLEMENTS]->(File)
    // This finds Components that implement the File
    const query = `
      MATCH (f:File {id: $fileId})-[:PART_OF]->(repo:Repository {id: $repoNodeId}),
            (c:Component)-[r:${safeRelType}]->(f)
      WHERE (c)-[:PART_OF]->(repo)
      RETURN c
    `;
    try {
      const result = await this.kuzuClient.executeQuery(query, { fileId, repoNodeId });
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
    } catch (error) {
      console.error(
        `[FileRepository] Error finding components for F:${fileId} via ${safeRelType}:`,
        error,
      );
      return [];
    }
  }

  // Add other methods like updateFileNode, deleteFileNode as needed.
}
