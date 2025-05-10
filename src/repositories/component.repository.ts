import { Component, Context, Decision, Rule } from "../types";
import { Mutex } from "../utils/mutex";
import { KuzuDBClient } from "../db/kuzu";

/**
 * Thread-safe singleton repository for Component, using KuzuDB and Cypher queries
 */
export class ComponentRepository {
  private static instance: ComponentRepository;
  private static lock = new Mutex();
  private conn: any;

  private constructor() {
    this.conn = KuzuDBClient.getConnection();
  }

  static async getInstance(): Promise<ComponentRepository> {
    const release = await ComponentRepository.lock.acquire();
    try {
      if (!ComponentRepository.instance) {
        ComponentRepository.instance = new ComponentRepository();
      }
      return ComponentRepository.instance;
    } finally {
      release();
    }
  }

  /**
   * Get all active components for a repository (status = 'active'), ordered by name
   */
  async getActiveComponents(repositoryId: string): Promise<Component[]> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (r:Repository {id: '${repositoryId}'})-[:HAS_COMPONENT]->(c:Component {status: 'active'}) RETURN c ORDER BY c.name ASC`
    );
    if (!result || typeof result.getAll !== "function") return [];
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return [];
    return rows.map((row: any) => row.c ?? row["c"] ?? row);
  }

  /**
   * Upsert a component by repository_id and yaml_id
   */
  /**
   * Creates or updates a component for a repository
   * Returns the upserted Component or null if not found
   */
  async upsertComponent(component: Component): Promise<Component | null> {
    const existing = await this.findByYamlId(
      String(component.repository),
      String(component.yaml_id)
    );
    if (existing) {
      await KuzuDBClient.executeQuery(
        `MATCH (r:Repository {id: '${component.repository}'})-[:HAS_COMPONENT]->(c:Component {yaml_id: '${component.yaml_id}'}) SET c.name = '${component.name}', c.kind = '${component.kind}', c.depends_on = '${component.depends_on}', c.status = '${component.status}' RETURN c`
      );
      return {
        ...existing,
        name: component.name,
        kind: component.kind,
        depends_on: component.depends_on,
        status: component.status,
      };
    } else {
      await KuzuDBClient.executeQuery(
        `MATCH (r:Repository {id: '${component.repository}'}) CREATE (r)-[:HAS_COMPONENT]->(c:Component {yaml_id: '${component.yaml_id}', name: '${component.name}', kind: '${component.kind}', depends_on: '${component.depends_on}', status: '${component.status}'}) RETURN c`
      );
      // Return the newly created component
      return this.findByYamlId(
        String(component.repository),
        String(component.yaml_id)
      );
    }
  }

  /**
   * Find a component by repository_id and yaml_id
   */
  async findByYamlId(
    repositoryId: string,
    yaml_id: string
  ): Promise<Component | null> {
    const result = await KuzuDBClient.executeQuery(
      `MATCH (r:Repository {id: '${repositoryId}'})-[:HAS_COMPONENT]->(c:Component {yaml_id: '${yaml_id}'}) RETURN c LIMIT 1`
    );
    if (!result || typeof result.getAll !== "function") return null;
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return null;
    return rows[0].c ?? rows[0]["c"] ?? rows[0];
  }

  /**
   * Get all upstream dependencies for a component (transitive DEPENDS_ON)
   */
  async getComponentDependencies(
    repositoryId: string,
    componentId: string
  ): Promise<Component[]> {
    // Traverse all DEPENDS_ON relationships (transitive closure)
    const query = `
      MATCH (r:Repository {id: '${repositoryId}'})-[:HAS_COMPONENT]->(c:Component {yaml_id: '${componentId}'})
      MATCH path = (c)-[:DEPENDS_ON*1..]->(dep:Component)
      RETURN DISTINCT dep
    `;
    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== "function") return [];
    const rows = await result.getAll();
    if (!rows || rows.length === 0) return [];
    // Each row.dep is a Component node
    return rows.map((row: any) => row.dep ?? row["dep"] ?? row);
  }

  /**
   * Get all downstream dependents for a component (transitive, i.e., components that depend on this one).
   * @param repositoryId The ID of the repository.
   * @param componentYamlId The yaml_id of the component for which to find dependents.
   * @returns A promise that resolves to an array of Component objects that depend on the specified component.
   */
  async getComponentDependents(
    repositoryId: string,
    componentYamlId: string
  ): Promise<Component[]> {
    // Find components (dependentComp) that have a DEPENDS_ON relationship pointing to targetComp.
    // Ensure all involved components belong to the specified repository.
    const query = `
      MATCH (r:Repository {id: '${repositoryId}'})-[:HAS_COMPONENT]->(targetComp:Component {yaml_id: '${componentYamlId}'})
      MATCH (dependentComp:Component)-[:DEPENDS_ON*1..]->(targetComp)
      WHERE (r)-[:HAS_COMPONENT]->(dependentComp) 
      RETURN DISTINCT dependentComp
    `;
    // It's important to also ensure dependentComp is linked to the repository 'r' if not implicitly handled by schema/query context.
    // The WHERE clause (r)-[:HAS_COMPONENT]->(dependentComp) should achieve this.

    const result = await KuzuDBClient.executeQuery(query);
    if (!result || typeof result.getAll !== "function") {
      console.warn(
        `Query for getComponentDependents for ${componentYamlId} in repo ${repositoryId} returned no result or invalid result type.`
      );
      return [];
    }
    const rows = await result.getAll();
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map(
      (row: any) => row.dependentComp ?? row["dependentComp"] ?? row
    );
  }

  /**
   * Get related items for a component based on specified relationship types, depth, and direction.
   * Currently assumes related items are also Components within the same repository.
   *
   * @param repositoryId The ID of the repository.
   * @param componentYamlId The yaml_id of the starting component.
   * @param relationshipTypes Optional array of relationship types to traverse. If undefined, all types are considered.
   * @param depth Optional maximum depth of traversal. Defaults to 3.
   * @param direction Optional direction of traversal ('INCOMING', 'OUTGOING', 'BOTH'). Defaults to 'OUTGOING'.
   * @returns A promise that resolves to an array of related Component objects.
   */
  async getRelatedItems(
    repositoryId: string,
    componentYamlId: string,
    relationshipTypes?: string[],
    depth?: number,
    direction?: "INCOMING" | "OUTGOING" | "BOTH"
  ): Promise<Component[]> {
    const currentDepth = depth && depth > 0 ? depth : 3;
    const currentDirection = direction || "OUTGOING";

    let relTypeFilter = "";
    if (relationshipTypes && relationshipTypes.length > 0) {
      const sanitizedTypes = relationshipTypes
        .map((rt) => rt.replace(/[^a-zA-Z0-9_]/g, ""))
        .filter((rt) => rt.length > 0);
      if (sanitizedTypes.length > 0) {
        relTypeFilter = ":" + sanitizedTypes.join("|");
      }
    }

    let pathDefinition = "";
    switch (currentDirection) {
      case "INCOMING":
        pathDefinition = `<-[r${relTypeFilter}*1..${currentDepth}]-(relatedItem:Component)`;
        break;
      case "BOTH":
        pathDefinition = `-[r${relTypeFilter}*1..${currentDepth}]-(relatedItem:Component)`;
        break;
      case "OUTGOING":
      default:
        pathDefinition = `-[r${relTypeFilter}*1..${currentDepth}]->(relatedItem:Component)`;
        break;
    }

    const safeComponentYamlId = componentYamlId.replace(/'/g, "\\'");
    const safeRepositoryId = repositoryId.replace(/'/g, "\\'");

    const query = `
      MATCH (startNode:Component {yaml_id: '${safeComponentYamlId}'}), (repo:Repository {id: '${safeRepositoryId}'})
      WHERE (repo)-[:HAS_COMPONENT]->(startNode)
      MATCH (startNode)${pathDefinition}
      WHERE (repo)-[:HAS_COMPONENT]->(relatedItem) 
      RETURN DISTINCT relatedItem
    `;

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== "function") {
        console.warn(
          `Query for getRelatedItems for ${componentYamlId} in repo ${repositoryId} returned no result or invalid result type.`
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map(
        (row: any) => row.relatedItem ?? row["relatedItem"] ?? row
      );
    } catch (error) {
      console.error(
        `Error executing getRelatedItems query for ${componentYamlId} in repo ${repositoryId}:`,
        error
      );
      console.error("Query was:", query);
      throw error;
    }
  }

  /**
   * Finds the shortest path between two components in a repository.
   *
   * @param repositoryId The ID of the repository.
   * @param startNodeYamlId The yaml_id of the starting component.
   * @param endNodeYamlId The yaml_id of the ending component.
   * @param params Optional parameters: { relationshipTypes?: string[], direction?: 'OUTGOING' | 'INCOMING' | 'BOTH' }.
   *               'direction' applies to the overall path from start to end if relationship types are undirected or mixed.
   *               Kùzu's shortest_path might have its own interpretation of directionality with typed relationships.
   * @returns A promise that resolves to an array representing the path (e.g., nodes or relationships), or empty if no path found.
   */
  async findShortestPath(
    repositoryId: string,
    startNodeYamlId: string,
    endNodeYamlId: string,
    params?: {
      relationshipTypes?: string[];
      direction?: "OUTGOING" | "INCOMING" | "BOTH";
    }
  ): Promise<any[]> {
    // Return type is generic as path can be nodes, rels, or mixed
    const relTypes = params?.relationshipTypes;
    // Kùzu's shortest_path typically uses `*` for any relationship type if not specified.
    // Or `*[:REL_TYPE_1|:REL_TYPE_2]` for specific types.
    let edgeSpec = "*"; // Default: any relationship, any direction (for shortest_path base case)
    if (relTypes && relTypes.length > 0) {
      const sanitizedTypes = relTypes
        .map((rt) => rt.replace(/[^a-zA-Z0-9_]/g, ""))
        .filter((rt) => rt.length > 0);
      if (sanitizedTypes.length > 0) {
        edgeSpec = "*[" + sanitizedTypes.map((rt) => `:${rt}`).join("|") + "]";
      }
    }

    // Directionality in Kùzu's shortest_path:
    // (a)-[<edge_spec>]->(b) for outgoing from a
    // (a)<-[<edge_spec>]-(b) for incoming to a
    // (a)-[<edge_spec>]-(b) for bidirectional/undirected search
    // The 'direction' param here is more a hint if edgeSpec itself is undirected (e.g. just '*')
    // If edgeSpec has directed types, those take precedence.
    // For simplicity, we build the arrow based on direction if types are generic or not specified.
    // If specific directed relationship types are given in relTypes (e.g. from a schema that defines :POINTS_TO>),
    // those should ideally be used directly without overriding arrow direction here.
    // This simple model assumes relTypes are undirected or the query engine handles mixed types.

    let pathPattern = "";
    const overallDirection = params?.direction || "OUTGOING"; // Default path direction

    // Note: KùzuDB shortest_path might implicitly find the shortest regardless of specified arrow direction if path involves mixed relationship directions.
    // The arrow here is more for simple cases or when relationship types are themselves undirected.
    // It's generally safer to use specific directed relationship types if the graph model has them.
    switch (overallDirection) {
      case "INCOMING": // Path from endNode to startNode (or startNode received from endNode)
        pathPattern = `shortest_path((startNode)-[${edgeSpec}]->(endNode))`; // Kuzu syntax might want (endNode)-...->(startNode)
        // Let's use standard (start)-...->(end) and rely on engine for paths
        break;
      case "BOTH":
        pathPattern = `shortest_path((startNode)-[${edgeSpec}]-(endNode))`;
        break;
      case "OUTGOING":
      default:
        pathPattern = `shortest_path((startNode)-[${edgeSpec}]->(endNode))`;
        break;
    }
    // For Kùzu, it is generally (node1)-[<edge_pattern_options>]->(node2) for the path predicate.
    // Let's assume Kuzu path is (startNode)-[rels*]->(endNode) if no types, or (startNode)-[rels* :Type1|:Type2]->(endNode)
    // The path directionality for shortest_path is determined by algorithm, not strict arrows like in MATCH usually.
    // A common way for typed shortest path:
    // MATCH p = shortest_path((startNode)-[:REL_A|REL_B*]->(endNode))
    // If relTypes is empty, it will be -[*]-> which Kùzu supports.

    let relationshipTypeSpec = "";
    if (relTypes && relTypes.length > 0) {
      const sanitizedTypes = relTypes
        .map((rt) => rt.replace(/[^a-zA-Z0-9_]/g, ""))
        .filter((rt) => rt.length > 0);
      if (sanitizedTypes.length > 0) {
        relationshipTypeSpec = ":" + sanitizedTypes.join("|");
      }
    }

    // Constructing the path for Kùzu's shortest_path function.
    // The arrow direction for the MATCH clause might not be strictly enforced by Kùzu's shortest_path algorithm,
    // which finds the shortest path regardless of traversal direction if relationships are bidirectional or mixed.
    // However, to guide it, especially if specific relationship directions are implied by schema:
    let kuzuPathDirection = "-";
    if (overallDirection === "OUTGOING") kuzuPathDirection = "->";
    // if (overallDirection === "INCOMING") kuzuPathDirection = "<-"; // Kùzu might not favor this in shortest_path as much as start/end node order

    const safeStartNodeYamlId = startNodeYamlId.replace(/'/g, "\\'");
    const safeEndNodeYamlId = endNodeYamlId.replace(/'/g, "\\'");
    const safeRepositoryId = repositoryId.replace(/'/g, "\\'");

    const query = `
      MATCH (startNode:Component {yaml_id: '${safeStartNodeYamlId}'}), 
            (endNode:Component {yaml_id: '${safeEndNodeYamlId}'}), 
            (repo:Repository {id: '${safeRepositoryId}'})
      WHERE (repo)-[:HAS_COMPONENT]->(startNode) AND (repo)-[:HAS_COMPONENT]->(endNode)
      MATCH p = shortest_path((startNode)${kuzuPathDirection}[r${relationshipTypeSpec}*]${kuzuPathDirection}(endNode))
      RETURN p
    `;

    // console.log("Executing findShortestPath query:", query);

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== "function") {
        console.warn(
          `Query for findShortestPath from ${startNodeYamlId} to ${endNodeYamlId} in repo ${repositoryId} returned no result or invalid result type.`
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return []; // No path found
      }
      // Each row contains a path 'p'. The structure of 'p' needs to be understood from Kùzu (list of nodes/rels).
      return rows.map((row: any) => row.p ?? row["p"] ?? row);
    } catch (error) {
      console.error(
        `Error executing findShortestPath query from ${startNodeYamlId} to ${endNodeYamlId} in repo ${repositoryId}:`,
        error
      );
      console.error("Query was:", query);
      throw error;
    }
  }

  // --- Placeholder Graph Algorithm Methods ---

  /**
   * Identifies components within a k-core in the repository.
   * This is a simplified version focusing on degree, actual k-core decomposition might be more complex.
   * @param repositoryId The ID of the repository.
   * @param k The minimum degree for a node to be part of the k-core.
   * @returns A promise that resolves to an array of nodes belonging to the k-core or a descriptive object.
   */
  async kCoreDecomposition(repositoryId: string, k: number): Promise<any> {
    // This query finds components that have at least 'k' DEPENDS_ON relationships (either incoming or outgoing)
    // with other components within the same repository. This is a k-degree filter, not a full decomposition.
    // A full k-core decomposition algorithm is typically iterative.
    const safeRepositoryId = repositoryId.replace(/'/g, "\\'");
    const query = `
      MATCH (repo:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(c:Component)
      WITH repo, c, k_value = ${k} // Kùzu might need parameter for k
      CALL {
          WITH c
          MATCH (c)-[r:DEPENDS_ON]-(peer:Component)
          WHERE (:Repository)-[:HAS_COMPONENT]->(peer) // Ensure peer is in some repository (ideally same, handled by outer match)
          RETURN count(DISTINCT peer) AS degree
      } 
      WHERE degree >= k_value
      RETURN c AS component, degree
    `;
    // Simpler degree check if Kùzu supports size() on pattern comprehensions or direct degree functions well.
    // Example using size on a pattern comprehension (syntax varies by DB):
    // MATCH (repo:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(c:Component)
    // LET degree = COUNT { (c)-[:DEPENDS_ON]-(other:Component) WHERE (repo)-[:HAS_COMPONENT]->(other) }
    // WHERE degree >= ${k}
    // RETURN c, degree
    // Kùzu documentation should be checked for optimal degree calculation and k-core support.

    console.warn(
      `kCoreDecomposition in ComponentRepository for repo ${repositoryId} with k=${k} is using a k-degree filter. Full decomposition requires further research on KùzuDB.`
    );

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== "function") {
        return {
          message: "kCoreDecomposition: No result or invalid result type",
          nodes: [],
        };
      }
      const rows = await result.getAll();
      return {
        message: `Components with degree >= ${k} (k-degree filter). Full k-core may differ.`,
        nodes: rows.map((row: any) => row.component ?? row["component"]),
        details: rows,
      };
    } catch (error) {
      console.error(
        `Error executing kCoreDecomposition query for repo ${repositoryId}, k=${k}:`,
        error
      );
      console.error("Query was:", query);
      throw error;
    }
  }

  async louvainCommunityDetection(repositoryId: string): Promise<any> {
    console.warn(
      `louvainCommunityDetection not yet implemented in ComponentRepository for repo ${repositoryId}. Research KùzuDB support.`
    );
    // throw new Error("louvainCommunityDetection not implemented");
    return {
      message: "louvainCommunityDetection not implemented",
      communities: [],
    }; // Placeholder result
  }

  async pageRank(
    repositoryId: string,
    dampingFactor?: number,
    iterations?: number
  ): Promise<any> {
    console.warn(
      `pageRank not yet implemented in ComponentRepository for repo ${repositoryId}. Research KùzuDB support.`
    );
    // throw new Error("pageRank not implemented");
    return { message: "pageRank not implemented", ranks: [] }; // Placeholder result
  }

  async getStronglyConnectedComponents(repositoryId: string): Promise<any> {
    console.warn(
      `getStronglyConnectedComponents not yet implemented in ComponentRepository for repo ${repositoryId}. Research KùzuDB support.`
    );
    // throw new Error("getStronglyConnectedComponents not implemented");
    return {
      message: "getStronglyConnectedComponents not implemented",
      components: [],
    }; // Placeholder result
  }

  async getWeaklyConnectedComponents(repositoryId: string): Promise<any> {
    console.warn(
      `getWeaklyConnectedComponents not yet implemented in ComponentRepository for repo ${repositoryId}. Research KùzuDB support.`
    );
    // throw new Error("getWeaklyConnectedComponents not implemented");
    return {
      message: "getWeaklyConnectedComponents not implemented",
      components: [],
    }; // Placeholder result
  }

  // --- Placeholder Advanced Traversal Methods ---

  /**
   * Retrieves the contextual history (Context nodes) for a given item (Component, Decision, or Rule).
   *
   * @param repositoryId The ID of the repository.
   * @param itemYamlId The yaml_id of the item.
   * @param itemType The type of the item ('Component', 'Decision', or 'Rule').
   * @returns A promise that resolves to an array of Context objects, ordered by creation date (descending).
   */
  async getItemContextualHistory(
    repositoryId: string,
    itemYamlId: string,
    itemType: "Component" | "Decision" | "Rule"
  ): Promise<Context[]> {
    const safeRepositoryId = repositoryId.replace(/'/g, "\\'");
    const safeItemYamlId = itemYamlId.replace(/'/g, "\\'");

    let itemMatchClause = "";
    let relationshipMatchClause = "";
    // Base clause to ensure item is in the target repository
    let repoItemEnsureClause = "";

    switch (itemType) {
      case "Component":
        itemMatchClause = `(item:Component {yaml_id: '${safeItemYamlId}'})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF]->(item)`;
        repoItemEnsureClause = `(repo)-[:HAS_COMPONENT]->(item)`;
        break;
      case "Decision":
        itemMatchClause = `(item:Decision {yaml_id: '${safeItemYamlId}'})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF_DECISION]->(item)`;
        repoItemEnsureClause = `(repo)-[:HAS_DECISION]->(item)`;
        break;
      case "Rule":
        itemMatchClause = `(item:Rule {yaml_id: '${safeItemYamlId}'})`;
        relationshipMatchClause = `(ctx)-[:CONTEXT_OF_RULE]->(item)`;
        repoItemEnsureClause = `(repo)-[:HAS_RULE]->(item)`;
        break;
      default:
        // Should be caught by TypeScript types, but as a safeguard:
        const exhaustiveCheck: never = itemType;
        console.error(
          `Unsupported itemType for getItemContextualHistory: ${exhaustiveCheck}`
        );
        return [];
    }

    const query = `
      MATCH (repo:Repository {id: '${safeRepositoryId}'}), ${itemMatchClause}
      WHERE ${repoItemEnsureClause} // Ensure the specific item is in the repo
      MATCH (repo)-[:HAS_CONTEXT]->(ctx:Context)
      MATCH ${relationshipMatchClause} // Link context to the specific item
      RETURN DISTINCT ctx
      ORDER BY ctx.created_at DESC
    `;

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== "function") {
        console.warn(
          `Query for getItemContextualHistory for ${itemYamlId} (${itemType}) in repo ${repositoryId} returned no result or invalid result type.`
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((row: any) => row.ctx ?? row["ctx"] ?? row);
    } catch (error) {
      console.error(
        `Error executing getItemContextualHistory for ${itemYamlId} (${itemType}) in repo ${repositoryId}:`,
        error
      );
      console.error("Query was:", query);
      throw error;
    }
  }

  /**
   * Retrieves Decision nodes that directly govern a specified Component.
   * Finding governing Rule nodes is more complex without a direct schema relationship (e.g., RULE_APPLIES_TO_COMPONENT).
   * This method currently focuses on Decisions via DECISION_ON.
   *
   * @param repositoryId The ID of the repository.
   * @param componentYamlId The yaml_id of the component.
   * @returns A promise that resolves to an array of Decision objects (or mixed types if Rules were included).
   */
  async getGoverningItemsForComponent(
    repositoryId: string,
    componentYamlId: string
  ): Promise<Decision[]> {
    const safeRepositoryId = repositoryId.replace(/'/g, "\\'");
    const safeComponentYamlId = componentYamlId.replace(/'/g, "\\'");

    // Query for Decisions directly governing the component
    const query = `
      MATCH (repo:Repository {id: '${safeRepositoryId}'})-[:HAS_COMPONENT]->(comp:Component {yaml_id: '${safeComponentYamlId}'})
      MATCH (repo)-[:HAS_DECISION]->(dec:Decision)
      MATCH (dec)-[:DECISION_ON]->(comp)
      RETURN DISTINCT dec
    `;

    // console.log("Executing getGoverningItemsForComponent query:", query);

    try {
      const result = await KuzuDBClient.executeQuery(query);
      if (!result || typeof result.getAll !== "function") {
        console.warn(
          `Query for getGoverningItemsForComponent for ${componentYamlId} in repo ${repositoryId} returned no result or invalid result type.`
        );
        return [];
      }
      const rows = await result.getAll();
      if (!rows || rows.length === 0) {
        return [];
      }
      return rows.map((row: any) => row.dec ?? row["dec"] ?? row);
    } catch (error) {
      console.error(
        `Error executing getGoverningItemsForComponent for ${componentYamlId} in repo ${repositoryId}:`,
        error
      );
      console.error("Query was:", query);
      throw error;
    }
  }
}
