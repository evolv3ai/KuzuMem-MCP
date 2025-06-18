/**
 * Utility functions for repository and branch key management.
 * Centralizes the logic for creating consistent repository:branch keys.
 */

/**
 * Helper function to create consistent repository:branch keys.
 * Ensures that undefined or missing branch values default to "main" to prevent key mismatches.
 *
 * @param repository - The repository name
 * @param branch - The branch name (defaults to "main" if undefined)
 * @returns A consistent repository:branch key string
 */
export function createRepositoryBranchKey(repository: string, branch?: string): string {
  const normalizedBranch = branch || 'main';
  return `${repository}:${normalizedBranch}`;
}
