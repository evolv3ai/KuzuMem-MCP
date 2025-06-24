import { ContextService } from '../domain/context.service';
import { EntityService } from '../domain/entity.service';
import { GraphAnalysisService } from '../domain/graph-analysis.service';
import { GraphQueryService } from '../domain/graph-query.service';
import { MemoryBankService } from '../domain/memory-bank.service';
import { MetadataService } from '../domain/metadata.service';
import { IServiceContainer } from './service-container.interface';

export class ServiceRegistry {
  public readonly memoryBank: MemoryBankService;
  public readonly metadata: MetadataService;
  public readonly context: ContextService;
  public readonly entity: EntityService;
  public readonly graphAnalysis: GraphAnalysisService;
  public readonly graphQuery: GraphQueryService;

  constructor(serviceContainer: IServiceContainer) {
    this.memoryBank = new MemoryBankService(serviceContainer);
    this.metadata = new MetadataService(serviceContainer);
    this.context = new ContextService(serviceContainer);
    this.entity = new EntityService(serviceContainer);
    this.graphAnalysis = new GraphAnalysisService(serviceContainer);
    this.graphQuery = new GraphQueryService(serviceContainer);
  }
}
