/**
 * Utility functions for repository and branch key management.
 * Centralizes the logic for creating consistent repository:branch keys.
 */

/**
 * Helper function to create consistent repository:branch keys.
 * Ensures that undefined or null branch values default to "main" to prevent key mismatches.
 * Validates that neither repository nor branch contains colons to prevent key collisions.
 *
 * @param repository - The repository name (must not contain colons)
 * @param branch - The branch name (defaults to "main" if undefined or null, but allows empty strings)
 * @returns A consistent repository:branch key string
 * @throws Error if repository or branch contains colons
 */
export function createRepositoryBranchKey(repository: string, branch?: string | null): string {
  // Validate that repository doesn't contain colons
  if (repository.includes(':')) {
    throw new Error(`Repository name cannot contain colons: "${repository}"`);
  }

  // Only default to 'main' if branch is undefined or null, allow empty strings
  const normalizedBranch = branch === undefined || branch === null ? 'main' : branch;

  // Validate that branch doesn't contain colons
  if (normalizedBranch.includes(':')) {
    throw new Error(`Branch name cannot contain colons: "${normalizedBranch}"`);
  }

  return `${repository}:${normalizedBranch}`;
}
