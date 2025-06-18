import { MemoryService } from '../services/memory.service';
import { ToolHandlerContext } from './types/sdk-custom';

// Import unified tool handlers
import { analyzeHandler } from './services/handlers/unified/analyze-handler';
import { associateHandler } from './services/handlers/unified/associate-handler';
import { bulkImportHandler } from './services/handlers/unified/bulk-import-handler';
import { contextHandler } from './services/handlers/unified/context-handler';
import { deleteHandler } from './services/handlers/unified/delete-handler';
import { detectHandler } from './services/handlers/unified/detect-handler';
import { entityHandler } from './services/handlers/unified/entity-handler';
import { introspectHandler } from './services/handlers/unified/introspect-handler';
import { memoryBankHandler } from './services/handlers/unified/memory-bank-handler';
import { memoryOptimizerHandler } from './services/handlers/unified/memory-optimizer-handler';
import { queryHandler } from './services/handlers/unified/query-handler';
import { searchHandler } from './services/handlers/unified/search-handler';

// Type-safe Handler Type for Official SDK Approach
export type SdkToolHandler<TParams = Record<string, unknown>, TResult = unknown> = (
  params: TParams,
  context: ToolHandlerContext,
  memoryService: MemoryService,
) => Promise<TResult>;

/**
 * Tool handlers mapping - only unified tools
 */
export const toolHandlers: Record<string, SdkToolHandler> = {
  'memory-bank': memoryBankHandler,
  entity: entityHandler,
  introspect: introspectHandler,
  context: contextHandler,
  query: queryHandler,
  associate: associateHandler,
  analyze: analyzeHandler,
  detect: detectHandler,
  'bulk-import': bulkImportHandler,
  search: searchHandler,
  delete: deleteHandler,
  'memory-optimizer': memoryOptimizerHandler,
};
