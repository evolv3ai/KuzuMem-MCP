import { MemoryService } from '../services/memory.service';
import { EnrichedRequestHandlerExtra } from './types/sdk-custom';

// Import unified tool handlers
import { memoryBankHandler } from './services/handlers/unified/memory-bank-handler';
import { entityHandler } from './services/handlers/unified/entity-handler';
import { introspectHandler } from './services/handlers/unified/introspect-handler';
import { contextHandler } from './services/handlers/unified/context-handler';
import { queryHandler } from './services/handlers/unified/query-handler';
import { associateHandler } from './services/handlers/unified/associate-handler';
import { analyzeHandler } from './services/handlers/unified/analyze-handler';
import { detectHandler } from './services/handlers/unified/detect-handler';
import { bulkImportHandler } from './services/handlers/unified/bulk-import-handler';
import { semanticSearchHandler } from './services/handlers/unified/semantic-search-handler';

// New Handler Type based on SDK
export type SdkToolHandler = (
  params: any,
  context: EnrichedRequestHandlerExtra,
  memoryService: MemoryService,
) => Promise<any>;

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
  'semantic-search': semanticSearchHandler,
};
