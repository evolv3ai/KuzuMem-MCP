import { SdkToolHandler } from '../../../tool-handlers';
import {
  BulkImportInputSchema,
  BulkImportOutputSchema,
} from '../../../schemas/unified-tool-schemas';
import { z } from 'zod';

/**
 * Bulk Import Handler
 * Handles bulk import of entities
 */
export const bulkImportHandler: SdkToolHandler = async (params, context, memoryService) => {
  // 1. Parse and validate parameters
  const validatedParams = BulkImportInputSchema.parse(params);
  const { type, repository, branch = 'main', overwrite = false } = validatedParams;

  // 2. Get clientProjectRoot from session
  const clientProjectRoot = context.session.clientProjectRoot as string | undefined;
  if (!clientProjectRoot) {
    throw new Error('No active session. Use memory-bank tool with operation "init" first.');
  }

  // 3. Log the operation
  context.logger.info(`Executing bulk import: ${type}`, {
    repository,
    branch,
    clientProjectRoot,
    overwrite,
  });

  // 4. Validate type-specific data exists
  const data = validatedParams[type];
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error(`No ${type} data provided for import`);
  }

  const errors: Array<{ id: string; error: string }> = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  try {
    await context.sendProgress({
      status: 'in_progress',
      message: `Starting bulk import of ${data.length} ${type}...`,
      percent: 10,
    });

    switch (type) {
      case 'components': {
        for (let i = 0; i < data.length; i++) {
          const component = data[i];
          try {
            // Check if exists
            if (!overwrite) {
              const existing = await memoryService.getComponent(
                context,
                clientProjectRoot,
                repository,
                branch,
                component.id,
              );
              if (existing) {
                skipped++;
                continue;
              }
            }

            // Import component
            await memoryService.upsertComponent(
              context,
              clientProjectRoot,
              repository,
              branch,
              {
                id: component.id,
                name: component.name,
                kind: component.kind,
                status: component.status,
                depends_on: component.depends_on,
              },
            );
            imported++;
          } catch (error) {
            failed++;
            errors.push({
              id: component.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Update progress
          const percent = Math.floor(10 + (i / data.length) * 80);
          await context.sendProgress({
            status: 'in_progress',
            message: `Importing components: ${i + 1}/${data.length}`,
            percent,
          });
        }
        break;
      }

      case 'decisions': {
        for (let i = 0; i < data.length; i++) {
          const decision = data[i];
          try {
            // Check if exists
            if (!overwrite) {
              const existing = await memoryService.getDecision(
                context,
                clientProjectRoot,
                repository,
                branch,
                decision.id,
              );
              if (existing) {
                skipped++;
                continue;
              }
            }

            // Import decision
            await memoryService.upsertDecision(
              context,
              clientProjectRoot,
              repository,
              branch,
              {
                id: decision.id,
                name: decision.name,
                date: decision.date,
                context: decision.context,
              },
            );
            imported++;
          } catch (error) {
            failed++;
            errors.push({
              id: decision.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Update progress
          const percent = Math.floor(10 + (i / data.length) * 80);
          await context.sendProgress({
            status: 'in_progress',
            message: `Importing decisions: ${i + 1}/${data.length}`,
            percent,
          });
        }
        break;
      }

      case 'rules': {
        for (let i = 0; i < data.length; i++) {
          const rule = data[i];
          try {
            // Check if exists
            if (!overwrite) {
              const existing = await memoryService.getRule(
                context,
                clientProjectRoot,
                repository,
                branch,
                rule.id,
              );
              if (existing) {
                skipped++;
                continue;
              }
            }

            // Import rule
            await memoryService.upsertRule(
              context,
              clientProjectRoot,
              repository,
              {
                id: rule.id,
                name: rule.name,
                created: rule.created,
                content: rule.content,
                triggers: rule.triggers,
                status: rule.status,
              },
              branch,
            );
            imported++;
          } catch (error) {
            failed++;
            errors.push({
              id: rule.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Update progress
          const percent = Math.floor(10 + (i / data.length) * 80);
          await context.sendProgress({
            status: 'in_progress',
            message: `Importing rules: ${i + 1}/${data.length}`,
            percent,
          });
        }
        break;
      }

      default:
        throw new Error(`Unknown import type: ${type}`);
    }

    await context.sendProgress({
      status: 'complete',
      message: `Bulk import complete: ${imported} imported, ${skipped} skipped, ${failed} failed`,
      percent: 100,
      isFinal: true,
    });

    return {
      type,
      status: 'complete',
      imported,
      failed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully imported ${imported} ${type}, skipped ${skipped}, failed ${failed}`,
    } satisfies z.infer<typeof BulkImportOutputSchema>;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`Bulk import failed: ${errorMessage}`, {
      type,
      error,
    });

    await context.sendProgress({
      status: 'error',
      message: `Failed to execute bulk import: ${errorMessage}`,
      percent: 100,
      isFinal: true,
    });

    throw error;
  }
};