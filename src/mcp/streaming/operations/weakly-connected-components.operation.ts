// DEPRECATED: This file is deprecated and scheduled for removal.
// The functionality has been moved to tool handlers in src/mcp/tool-handlers.ts
// This file only exists to prevent breaking test imports until tests are updated.

export class WeaklyConnectedComponentsOperation {
  public static async execute(): Promise<any> {
    throw new Error('WeaklyConnectedComponentsOperation is deprecated. Use tool handlers instead.');
  }
}
