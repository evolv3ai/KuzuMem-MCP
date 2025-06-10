import * as fs from 'fs';
import * as path from 'path';
import { EnrichedRequestHandlerExtra } from '../mcp/types/sdk-custom';
import { MemoryService } from '../services/memory.service';

describe('MemoryService end-to-end write/read flow', () => {
  const repository = 'test-repo';
  const branch = 'main';
  let clientProjectRoot: string;
  let memoryService: MemoryService;
  const mcpContext: EnrichedRequestHandlerExtra = {
    logger: console,
    sendProgress: async () => {}, // no-op
  } as unknown as EnrichedRequestHandlerExtra;

  beforeAll(async () => {
    // Create a temporary directory for the Kùzu database file
    clientProjectRoot = fs.mkdtempSync(path.join(__dirname, 'kuzu-test-'));
    memoryService = await MemoryService.getInstance(mcpContext);
    const initResult = await memoryService.initMemoryBank(
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
    const compInput = {
      id: 'comp-UI',
      name: 'UI Module',
      kind: 'service',
      status: 'active' as const,
    };

    const component = await memoryService.upsertComponent(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      compInput,
    );
    expect(component).toBeTruthy();
    expect(component?.id).toBe(compInput.id);

    const count = await memoryService.countNodesByLabel(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      'Component',
    );
    expect(count.count).toBeGreaterThanOrEqual(1);

    const list = await memoryService.listNodesByLabel(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      'Component',
      10,
      0,
    );
    const ids = list.entities.map((n: any) => n.id || n.properties?.id);
    expect(ids).toContain(compInput.id);
  }, 30000);

  it('should add a file, associate with component, and retrieve via relationships', async () => {
    const fileInput = {
      id: 'file-src-ui-ts',
      name: 'ui.ts',
      path: 'src/ui.ts',
      size_bytes: 120,
    } as any;

    const addFileRes = await memoryService.addFile(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      fileInput,
    );
    expect(addFileRes.success).toBe(true);

    const assocRes = await memoryService.associateFileWithComponent(
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
    const tagInput = {
      id: 'tag-ui',
      name: 'UI Layer',
      color: '#00ff00',
    } as any;
    const addTagRes = await memoryService.addTag(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      tagInput,
    );
    expect(addTagRes.success).toBe(true);

    const tagItemRes = await memoryService.tagItem(
      mcpContext,
      clientProjectRoot,
      repository,
      branch,
      'comp-UI',
      'Component',
      tagInput.id,
    );
    expect(tagItemRes.success).toBe(true);

    const findRes = await memoryService.findItemsByTag(
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
