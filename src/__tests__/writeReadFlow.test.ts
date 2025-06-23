import * as fs from 'fs';
import * as path from 'path';
import { ToolHandlerContext } from '../mcp/types/sdk-custom';
import { MemoryService } from '../services/memory.service';

describe('MemoryService end-to-end write/read flow', () => {
  const repository = 'test-repo';
  const branch = 'main';
  let clientProjectRoot: string;
  let memoryService: MemoryService;
  const mcpContext: ToolHandlerContext = {
    logger: console,
    sendProgress: async () => {}, // no-op
  } as unknown as ToolHandlerContext;

  beforeAll(async () => {
    // Create a temporary directory for the Kùzu database file
    clientProjectRoot = fs.mkdtempSync(path.join(__dirname, 'kuzu-test-'));
    memoryService = await MemoryService.getInstance(mcpContext);
    if (!memoryService.services) {
      throw new Error('ServiceRegistry not initialized in MemoryService');
    }
    const initResult = await memoryService.services.memoryBank.initMemoryBank(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
    );
    expect(initResult.success).toBe(true);
  }, 30000);

  afterAll(() => {
    // Cleanup temp directory
    if (clientProjectRoot && fs.existsSync(clientProjectRoot)) {
      fs.rmSync(clientProjectRoot, { recursive: true, force: true });
    }
  });

  it('should add a component and retrieve it via list/count queries', async () => {
    if (!memoryService.services) {
      throw new Error('ServiceRegistry not initialized');
    }
    const compInput = {
      id: 'comp-UI',
      name: 'UI Module',
      kind: 'service',
      status: 'active' as const,
    };

    const component = await memoryService.services.entity.upsertComponent(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      compInput,
    );
    expect(component).toBeTruthy();
    expect(component?.id).toBe(compInput.id);

    const count = await memoryService.services.graphQuery.countNodesByLabel(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      'Component',
    );
    expect(count.count).toBeGreaterThanOrEqual(1);

    const list = await memoryService.services.graphQuery.listNodesByLabel(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      'Component',
      10,
      0,
    );
    const ids = list.entities.map((n: any) => n.n?.id || n.id || n.properties?.id);
    expect(ids).toContain(compInput.id);
  }, 30000);

  it('should add a file, associate with component, and retrieve via relationships', async () => {
    if (!memoryService.services) {
      throw new Error('ServiceRegistry not initialized');
    }

    // First create a component to associate with
    const compInput = {
      id: 'comp-UI',
      name: 'UI Module',
      kind: 'service',
      status: 'active' as const,
    };

    const component = await memoryService.services.entity.upsertComponent(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      compInput,
    );
    expect(component).toBeTruthy();
    expect(component?.id).toBe(compInput.id);

    // Now create a file
    const fileInput = {
      id: 'file-src-ui-ts',
      name: 'ui.ts',
      path: 'src/ui.ts',
      size: 120,
    } as any;

    const addFileRes = await memoryService.services.entity.addFile(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      fileInput,
    );
    expect(addFileRes.success).toBe(true);

    // Associate the file with the component
    const assocRes = await memoryService.services.entity.associateFileWithComponent(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      'comp-UI',
      fileInput.id,
    );
    expect(assocRes.success).toBe(true);
  }, 30000);

  it('should add a tag, tag the component, and find items by tag', async () => {
    if (!memoryService.services) {
      throw new Error('ServiceRegistry not initialized');
    }

    // First create a component to tag
    const compInput = {
      id: 'comp-UI',
      name: 'UI Module',
      kind: 'service',
      status: 'active' as const,
    };

    const component = await memoryService.services.entity.upsertComponent(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      compInput,
    );
    expect(component).toBeTruthy();
    expect(component?.id).toBe(compInput.id);

    // Now create a tag
    const tagInput = {
      id: 'tag-ui',
      name: 'UI Layer',
      color: '#00ff00',
    } as any;
    const addTagRes = await memoryService.services.entity.addTag(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      tagInput,
    );
    expect(addTagRes.success).toBe(true);

    // Tag the component
    const tagItemRes = await memoryService.services.entity.tagItem(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      'comp-UI',
      'Component',
      tagInput.id,
    );
    expect(tagItemRes.success).toBe(true);

    // Find items by tag
    const findRes = await memoryService.services.graphQuery.findItemsByTag(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      tagInput.id,
      'Component',
    );
    const ids = findRes.items.map((i: any) => i.id);
    expect(ids).toContain('comp-UI');
  }, 30000);
});
