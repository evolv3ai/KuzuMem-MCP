/**
 * Shared utility functions for MCP schema handling
 */

import { z } from 'zod';

/**
 * Creates a Zod raw shape object for a tool's parameters based on its JSON schema definition.
 * 
 * This function converts JSON schema properties to Zod types for use with the MCP SDK's tool() method.
 * 
 * @param tool - The tool definition containing a JSON schema for parameters
 * @returns An object mapping parameter names to Zod types for schema validation
 */
export function createZodRawShape(tool: any): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  if (tool.parameters?.properties) {
    for (const [propName, propDef] of Object.entries(tool.parameters.properties)) {
      const prop = propDef as any;
      let zodType: z.ZodTypeAny;

      switch (prop.type) {
        case 'string':
          zodType = z.string();
          break;
        case 'number':
          zodType = z.number();
          break;
        case 'boolean':
          zodType = z.boolean();
          break;
        case 'array':
          zodType = z.array(z.any());
          break;
        case 'object':
          zodType = z.object({}).passthrough();
          break;
        default:
          zodType = z.any();
      }

      // Add description if available
      if (prop.description) {
        zodType = zodType.describe(prop.description);
      }

      // Handle optional fields
      if (!tool.parameters.required?.includes(propName)) {
        zodType = zodType.optional();
      }

      shape[propName] = zodType;
    }
  }

  return shape;
}
