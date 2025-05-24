import { MemoryService } from '../../../services/memory.service';
import { ProgressHandler } from '../progress-handler';
import { McpServerRequestContext } from '@modelcontextprotocol/sdk';

/**
 * Operation class for retrieving governing items for a component with streaming support.
 * Governing items include related decisions, rules, and context history.
 */
export class GoverningItemsForComponentOperation {
  /**
   * Execute the operation with streaming support.
   */
  public static async execute(
    mcpContext: McpServerRequestContext,
    clientProjectRoot: string,
    repositoryName: string,
    branch: string,
    componentId: string,
    memoryService: MemoryService,
    progressHandler?: ProgressHandler,
  ): Promise<any> {
    const logger = mcpContext.logger || console;
    try {
      if (!repositoryName || !componentId) {
        logger.warn('[GoverningItemsForComponentOperation] Missing required parameters');
        return {
          error: 'Missing required parameters: repositoryName and componentId are required',
        };
      }

      if (progressHandler) {
        progressHandler.progress({
          status: 'initializing',
          message: `Starting retrieval of governing items for component ${componentId} in ${repositoryName}:${branch} (Project: ${clientProjectRoot})`,
        });
      }

      const governingItemsOutput = await memoryService.getGoverningItemsForComponent(
        mcpContext,
        clientProjectRoot,
        repositoryName,
        branch,
        componentId,
      );

      const decisions = governingItemsOutput?.decisions || [];
      const rules = governingItemsOutput?.rules || [];
      const resultStatus = governingItemsOutput?.status || 'error';
      // Context history is not part of GetGoverningItemsForComponentOutputSchema, handled by ItemContextualHistoryOperation

      const resultPayload = {
        status: resultStatus,
        clientProjectRoot,
        repository: repositoryName,
        branch,
        componentId,
        decisions,
        rules,
        message: governingItemsOutput?.message,
      };

      if (progressHandler) {
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${decisions.length} decision(s).`,
          dataType: 'decisions',
          decisionsCount: decisions.length,
          decisions: decisions,
        });
        progressHandler.progress({
          status: 'in_progress',
          message: `Retrieved ${rules.length} rule(s).`,
          dataType: 'rules',
          rulesCount: rules.length,
          rules: rules,
        });
        // Removed contextHistory progress update as it's not part of this operation's direct output

        // Send final progress event
        progressHandler.progress({ ...resultPayload, isFinal: true });

        // Send the final JSON-RPC response via progressHandler
        progressHandler.sendFinalResponse(resultPayload, false);
        return null; // Indicate response was sent via progressHandler
      }

      if (resultStatus === 'error' && !progressHandler) {
        logger.error(
          `[GoverningItemsForComponentOperation] Failed: ${resultPayload.message || 'Unknown error'}`,
        );
        throw new Error(resultPayload.message || 'Failed to get governing items in operation.');
      }

      return resultPayload;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get governing items for component: ${errorMessage}`);
    }
  }
}
