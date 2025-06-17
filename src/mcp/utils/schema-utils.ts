/**
 * Shared utility functions for MCP schema handling
 */

import { z } from 'zod';

/**
 * Helper function to create a Zod type from a JSON schema property definition.
 * This is used for recursive processing of array items and nested objects.
 *
 * @param prop - The property definition from JSON schema
 * @returns A Zod type for the property
 */
function createZodTypeFromProperty(prop: any): z.ZodTypeAny {
  // Check for enum first, as it can apply to any type
  if (prop.enum && Array.isArray(prop.enum)) {
    return z.enum(prop.enum as [string, ...string[]]);
  }

  switch (prop.type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'array':
      // Handle array items recursively if available
      if (prop.items) {
        const itemSchema = createZodTypeFromProperty(prop.items);
        return z.array(itemSchema);
      } else {
        return z.array(z.any());
      }
    case 'object':
      return z.object({}).passthrough();
    default:
      return z.any();
  }
}

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

      // Use the helper function to create the Zod type
      zodType = createZodTypeFromProperty(prop);

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
