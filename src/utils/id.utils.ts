/**
 * Generates a composite graph-unique ID for an entity.
 * Format: repositoryName:branchName:itemId
 * @param repositoryName The name of the repository.
 * @param branchName The name of the branch.
 * @param itemId The logical ID of the item within its scope.
 * @returns The composite graph-unique ID string.
 */
export function formatGraphUniqueId(
  repositoryName: string,
  branchName: string,
  itemId: string,
): string {
  if (!repositoryName || !branchName || !itemId) {
    throw new Error(
      'repositoryName, branchName, and itemId are required to format a graph-unique ID.',
    );
  }
  return `${repositoryName}:${branchName}:${itemId}`;
}

/**
 * Parses a composite graph-unique ID string back into its components.
 * Expected format: repositoryName:branchName:itemId
 * @param graphUniqueId The composite graph-unique ID string.
 * @returns An object containing repositoryName, branchName, and itemId.
 * @throws Error if the graphUniqueId is not in the expected format.
 */
export function parseGraphUniqueId(graphUniqueId: string): {
  repositoryName: string;
  branchName: string;
  itemId: string;
} {
  if (!graphUniqueId) {
    throw new Error('graphUniqueId cannot be empty.');
  }
  const parts = graphUniqueId.split(':');
  if (parts.length < 3) {
    // Allow item IDs to contain colons by joining the rest
    throw new Error(
      'Invalid graphUniqueId format. Expected at least 3 parts for repositoryName:branchName:itemId.',
    );
  }

  const repositoryName = parts[0];
  const branchName = parts[1];
  const itemId = parts.slice(2).join(':'); // Join the rest for itemId, in case itemId itself has colons

  if (!repositoryName || !branchName || !itemId) {
    // This check is a bit redundant given parts.length check, but good for safety
    throw new Error(
      'Invalid graphUniqueId format after parsing. repositoryName, branchName, or itemId is empty.',
    );
  }

  return {
    repositoryName,
    branchName,
    itemId,
  };
}
