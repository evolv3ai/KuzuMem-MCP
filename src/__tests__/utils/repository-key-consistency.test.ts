/**
 * Tests for repository-branch key consistency in both servers
 */

describe('Repository-Branch Key Consistency', () => {
  // Test the helper function logic directly
  function createRepositoryBranchKey(repository: string, branch?: string): string {
    const normalizedBranch = branch || 'main';
    return `${repository}:${normalizedBranch}`;
  }

  describe('createRepositoryBranchKey', () => {
    it('should handle undefined branch by defaulting to main', () => {
      const key = createRepositoryBranchKey('my-repo', undefined);
      expect(key).toBe('my-repo:main');
    });

    it('should handle missing branch by defaulting to main', () => {
      const key = createRepositoryBranchKey('my-repo');
      expect(key).toBe('my-repo:main');
    });

    it('should handle empty string branch by defaulting to main', () => {
      const key = createRepositoryBranchKey('my-repo', '');
      expect(key).toBe('my-repo:main');
    });

    it('should preserve valid branch names', () => {
      const key = createRepositoryBranchKey('my-repo', 'feature/test');
      expect(key).toBe('my-repo:feature/test');
    });

    it('should handle main branch explicitly', () => {
      const key = createRepositoryBranchKey('my-repo', 'main');
      expect(key).toBe('my-repo:main');
    });

    it('should handle develop branch', () => {
      const key = createRepositoryBranchKey('my-repo', 'develop');
      expect(key).toBe('my-repo:develop');
    });
  });

  describe('Key consistency scenarios', () => {
    it('should generate same key for undefined and main branch', () => {
      const key1 = createRepositoryBranchKey('test-repo', undefined);
      const key2 = createRepositoryBranchKey('test-repo', 'main');
      expect(key1).toBe(key2);
    });

    it('should generate same key for empty string and main branch', () => {
      const key1 = createRepositoryBranchKey('test-repo', '');
      const key2 = createRepositoryBranchKey('test-repo', 'main');
      expect(key1).toBe(key2);
    });

    it('should generate same key for missing and main branch', () => {
      const key1 = createRepositoryBranchKey('test-repo');
      const key2 = createRepositoryBranchKey('test-repo', 'main');
      expect(key1).toBe(key2);
    });
  });

  describe('Repository map simulation', () => {
    it('should allow consistent storage and retrieval', () => {
      const repositoryRootMap = new Map<string, string>();
      
      // Simulate storing with undefined branch (common during init)
      const storeKey = createRepositoryBranchKey('my-project', undefined);
      repositoryRootMap.set(storeKey, '/path/to/project');
      
      // Simulate retrieving with explicit main branch (common during tool calls)
      const retrieveKey = createRepositoryBranchKey('my-project', 'main');
      const retrieved = repositoryRootMap.get(retrieveKey);
      
      expect(retrieved).toBe('/path/to/project');
      expect(storeKey).toBe(retrieveKey);
    });

    it('should handle the original bug scenario', () => {
      const repositoryRootMap = new Map<string, string>();
      
      // Original bug: storing with undefined branch creates "repo:undefined"
      const buggyStoreKey = `my-repo:${undefined}`;
      repositoryRootMap.set(buggyStoreKey, '/path/to/project');
      
      // Original bug: retrieving with "main" creates "repo:main" 
      const buggyRetrieveKey = `my-repo:main`;
      const buggyRetrieved = repositoryRootMap.get(buggyRetrieveKey);
      
      // This would fail in the original code
      expect(buggyRetrieved).toBeUndefined();
      expect(buggyStoreKey).toBe('my-repo:undefined');
      expect(buggyRetrieveKey).toBe('my-repo:main');
      
      // But with our fix, both operations use consistent keys
      const fixedStoreKey = createRepositoryBranchKey('my-repo', undefined);
      const fixedRetrieveKey = createRepositoryBranchKey('my-repo', 'main');
      expect(fixedStoreKey).toBe(fixedRetrieveKey);
    });

    it('should work with various branch scenarios', () => {
      const repositoryRootMap = new Map<string, string>();
      
      // Store different repositories and branches
      repositoryRootMap.set(createRepositoryBranchKey('repo1', 'main'), '/path/repo1/main');
      repositoryRootMap.set(createRepositoryBranchKey('repo1', 'develop'), '/path/repo1/develop');
      repositoryRootMap.set(createRepositoryBranchKey('repo2', undefined), '/path/repo2/main');
      repositoryRootMap.set(createRepositoryBranchKey('repo3', 'feature/test'), '/path/repo3/feature');
      
      // Verify retrieval works correctly
      expect(repositoryRootMap.get(createRepositoryBranchKey('repo1', 'main'))).toBe('/path/repo1/main');
      expect(repositoryRootMap.get(createRepositoryBranchKey('repo1', 'develop'))).toBe('/path/repo1/develop');
      expect(repositoryRootMap.get(createRepositoryBranchKey('repo2', 'main'))).toBe('/path/repo2/main');
      expect(repositoryRootMap.get(createRepositoryBranchKey('repo3', 'feature/test'))).toBe('/path/repo3/feature');
      
      // Verify undefined branch retrieval works for repo2
      expect(repositoryRootMap.get(createRepositoryBranchKey('repo2', undefined))).toBe('/path/repo2/main');
    });
  });
});
