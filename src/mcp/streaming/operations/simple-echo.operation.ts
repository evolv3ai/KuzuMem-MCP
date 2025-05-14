import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';

export class SimpleEchoOperation {
  public static async execute(
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    args: any,
    memoryService?: MemoryService, // Optional for this simple tool
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    console.log('[SimpleEchoOperation] Executing with args:', args);
    if (progressHandler) {
      progressHandler.progress({
        status: 'initializing',
        message: 'SimpleEchoOperation initializing',
      });
      progressHandler.progress({
        status: 'complete',
        message: 'SimpleEchoOperation complete',
        echo: args,
        isFinal: true,
      });
    }
    // For JSON response, this is what matters
    return {
      tool: 'simple-echo-tool',
      received_args: args,
      processed_at: new Date().toISOString(),
      clientProjectRoot_used: clientProjectRoot,
      repositoryName_used: repositoryName,
      branch_used: branch,
    };
  }
}
