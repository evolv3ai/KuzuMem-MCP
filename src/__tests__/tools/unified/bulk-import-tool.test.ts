import { bulkImportHandler } from '../../../mcp/services/handlers/unified/bulk-import-handler';
import { MemoryService } from '../../../services/memory.service';
import { EnrichedRequestHandlerExtra } from '../../../mcp/types/sdk-custom';

describe('Bulk Import Tool Tests', () => {
  let mockMemoryService: jest.Mocked<MemoryService>;
  let mockContext: jest.Mocked<EnrichedRequestHandlerExtra>;

  beforeEach(() => {
    mockMemoryService = {
      getComponent: jest.fn(),
      getDecision: jest.fn(),
      getRule: jest.fn(),
      upsertComponent: jest.fn(),
      upsertDecision: jest.fn(),
      upsertRule: jest.fn(),
    } as any;

    // Mock context with session
    mockContext = {
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      },
      session: {
        clientProjectRoot: '/test/project',
      },
      sendProgress: jest.fn(),
      request: {} as any,
      meta: {} as any,
      signal: {} as any,
    } as any;
  });

  describe('Component Import', () => {
    it('should bulk import components successfully', async () => {
      mockMemoryService.getComponent.mockResolvedValue(null);
      mockMemoryService.upsertComponent.mockResolvedValue({} as any);

      const result = await bulkImportHandler(
        {
          type: 'components',
          repository: 'test-repo',
          branch: 'main',
          components: [
            { id: 'comp-1', name: 'Component 1', kind: 'service' },
            { id: 'comp-2', name: 'Component 2', status: 'active' },
            { id: 'comp-3', name: 'Component 3', depends_on: ['comp-1'] },
          ],
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('components');
      expect(result.imported).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockMemoryService.upsertComponent).toHaveBeenCalledTimes(3);
    });

    it('should skip existing components when overwrite is false', async () => {
      mockMemoryService.getComponent
        .mockResolvedValueOnce({ id: 'comp-1' } as any) // exists
        .mockResolvedValueOnce(null) // doesn't exist
        .mockResolvedValueOnce({ id: 'comp-3' } as any); // exists

      const result = await bulkImportHandler(
        {
          type: 'components',
          repository: 'test-repo',
          components: [
            { id: 'comp-1', name: 'Component 1' },
            { id: 'comp-2', name: 'Component 2' },
            { id: 'comp-3', name: 'Component 3' },
          ],
          overwrite: false,
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockMemoryService.upsertComponent).toHaveBeenCalledTimes(1);
    });

    it('should overwrite existing components when overwrite is true', async () => {
      mockMemoryService.upsertComponent.mockResolvedValue({} as any);

      const result = await bulkImportHandler(
        {
          type: 'components',
          repository: 'test-repo',
          components: [
            { id: 'comp-1', name: 'Component 1' },
            { id: 'comp-2', name: 'Component 2' },
          ],
          overwrite: true,
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(mockMemoryService.getComponent).not.toHaveBeenCalled();
    });

    it('should handle import errors gracefully', async () => {
      mockMemoryService.getComponent.mockResolvedValue(null);
      mockMemoryService.upsertComponent
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({} as any);

      const result = await bulkImportHandler(
        {
          type: 'components',
          repository: 'test-repo',
          components: [
            { id: 'comp-1', name: 'Component 1' },
            { id: 'comp-2', name: 'Component 2' },
            { id: 'comp-3', name: 'Component 3' },
          ],
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.imported).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toEqual({
        id: 'comp-2',
        error: 'DB error',
      });
    });
  });

  describe('Decision Import', () => {
    it('should bulk import decisions successfully', async () => {
      mockMemoryService.getDecision.mockResolvedValue(null);
      mockMemoryService.upsertDecision.mockResolvedValue({} as any);

      const result = await bulkImportHandler(
        {
          type: 'decisions',
          repository: 'test-repo',
          decisions: [
            { id: 'dec-1', name: 'Decision 1', date: '2024-01-01' },
            { id: 'dec-2', name: 'Decision 2', date: '2024-01-02', context: 'Some context' },
          ],
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('decisions');
      expect(result.imported).toBe(2);
      expect(mockMemoryService.upsertDecision).toHaveBeenCalledTimes(2);
    });
  });

  describe('Rule Import', () => {
    it('should bulk import rules successfully', async () => {
      mockMemoryService.getRule.mockResolvedValue(null);
      mockMemoryService.upsertRule.mockResolvedValue({} as any);

      const result = await bulkImportHandler(
        {
          type: 'rules',
          repository: 'test-repo',
          rules: [
            {
              id: 'rule-1',
              name: 'Rule 1',
              created: '2024-01-01',
              content: 'Rule content',
              triggers: ['trigger1'],
            },
            {
              id: 'rule-2',
              name: 'Rule 2',
              created: '2024-01-02',
              content: 'Rule content 2',
              status: 'active',
            },
          ],
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.type).toBe('rules');
      expect(result.imported).toBe(2);
      expect(mockMemoryService.upsertRule).toHaveBeenCalledTimes(2);
    });
  });

  describe('Validation', () => {
    it('should throw error if no active session', async () => {
      const contextNoSession = {
        logger: {
          info: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        },
        session: {},
        sendProgress: jest.fn(),
        request: {} as any,
        meta: {} as any,
        signal: {} as any,
      } as any;

      await expect(
        bulkImportHandler(
          {
            type: 'components',
            repository: 'test-repo',
            components: [{ id: 'comp-1', name: 'Component 1' }],
          },
          contextNoSession,
          mockMemoryService,
        ),
      ).rejects.toThrow('No active session for bulk-import tool');
    });

    it('should throw error if no data provided', async () => {
      await expect(
        bulkImportHandler(
          {
            type: 'components',
            repository: 'test-repo',
            components: [],
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('No components data provided for import');
    });

    it('should throw error if wrong data type provided', async () => {
      await expect(
        bulkImportHandler(
          {
            type: 'components',
            repository: 'test-repo',
            // Missing components array
          },
          mockContext,
          mockMemoryService,
        ),
      ).rejects.toThrow('No components data provided for import');
    });
  });

  describe('Progress Reporting', () => {
    it('should report progress during import', async () => {
      mockMemoryService.getComponent.mockResolvedValue(null);
      mockMemoryService.upsertComponent.mockResolvedValue({} as any);

      await bulkImportHandler(
        {
          type: 'components',
          repository: 'test-repo',
          components: [
            { id: 'comp-1', name: 'Component 1' },
            { id: 'comp-2', name: 'Component 2' },
          ],
        },
        mockContext,
        mockMemoryService,
      );

      // Check progress calls
      expect(mockContext.sendProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'in_progress',
          message: 'Starting bulk import of 2 components...',
          percent: 10,
        }),
      );

      expect(mockContext.sendProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'complete',
          message: 'Bulk import complete: 2 imported, 0 skipped, 0 failed',
          percent: 100,
          isFinal: true,
        }),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle component-level errors and continue processing', async () => {
      mockMemoryService.getComponent
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValue(null);
      mockMemoryService.upsertComponent.mockResolvedValue({} as any);

      const result = await bulkImportHandler(
        {
          type: 'components',
          repository: 'test-repo',
          components: [
            { id: 'comp-1', name: 'Component 1' },
            { id: 'comp-2', name: 'Component 2' },
          ],
        },
        mockContext,
        mockMemoryService,
      );

      expect(result.failed).toBe(1);
      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]).toEqual({
        id: 'comp-1',
        error: 'Service unavailable',
      });
    });
  });
});
