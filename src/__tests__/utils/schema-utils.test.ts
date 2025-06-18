/**
 * Tests for schema-utils.ts
 */

import { createZodRawShape } from '../../mcp/utils/schema-utils';

describe('createZodRawShape', () => {
  it('should handle integer type correctly', () => {
    const tool = {
      parameters: {
        properties: {
          size_bytes: {
            type: 'integer',
            description: 'File size in bytes',
          },
        },
        required: ['size_bytes'],
      },
    };

    const shape = createZodRawShape(tool);

    expect(shape.size_bytes).toBeDefined();

    // Test that it accepts integers
    const result = shape.size_bytes.safeParse(42);
    expect(result.success).toBe(true);

    // Test that it rejects non-integers
    const floatResult = shape.size_bytes.safeParse(42.5);
    expect(floatResult.success).toBe(false);
  });

  it('should handle enum values correctly', () => {
    const tool = {
      parameters: {
        properties: {
          itemType: {
            type: 'string',
            enum: ['Component', 'Decision', 'Rule', 'File', 'Context'],
            description: 'Type of the item',
          },
        },
        required: ['itemType'],
      },
    };

    const shape = createZodRawShape(tool);

    expect(shape.itemType).toBeDefined();

    // Test that it accepts valid enum values
    const validResult = shape.itemType.safeParse('Component');
    expect(validResult.success).toBe(true);

    // Test that it rejects invalid enum values
    const invalidResult = shape.itemType.safeParse('InvalidType');
    expect(invalidResult.success).toBe(false);
  });

  it('should handle array items correctly', () => {
    const tool = {
      parameters: {
        properties: {
          entityTypes: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Types of entities to search',
          },
        },
        required: ['entityTypes'],
      },
    };

    const shape = createZodRawShape(tool);

    expect(shape.entityTypes).toBeDefined();

    // Test that it accepts array of strings
    const validResult = shape.entityTypes.safeParse(['component', 'decision']);
    expect(validResult.success).toBe(true);

    // Test that it rejects array with wrong item types
    const invalidResult = shape.entityTypes.safeParse(['component', 123]);
    expect(invalidResult.success).toBe(false);
  });

  it('should handle array with enum items correctly', () => {
    const tool = {
      parameters: {
        properties: {
          nodeTableNames: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['Component', 'Decision', 'Rule'],
            },
            description: 'Node table names',
          },
        },
        required: ['nodeTableNames'],
      },
    };

    const shape = createZodRawShape(tool);

    expect(shape.nodeTableNames).toBeDefined();

    // Test that it accepts array of valid enum values
    const validResult = shape.nodeTableNames.safeParse(['Component', 'Decision']);
    expect(validResult.success).toBe(true);

    // Test that it rejects array with invalid enum values
    const invalidResult = shape.nodeTableNames.safeParse(['Component', 'InvalidType']);
    expect(invalidResult.success).toBe(false);
  });

  it('should handle optional fields correctly', () => {
    const tool = {
      parameters: {
        properties: {
          required_field: {
            type: 'string',
            description: 'Required field',
          },
          optional_field: {
            type: 'integer',
            description: 'Optional field',
          },
        },
        required: ['required_field'],
      },
    };

    const shape = createZodRawShape(tool);

    // Required field should not be optional
    const requiredResult = shape.required_field.safeParse(undefined);
    expect(requiredResult.success).toBe(false);

    // Optional field should accept undefined
    const optionalResult = shape.optional_field.safeParse(undefined);
    expect(optionalResult.success).toBe(true);

    // Optional field should also accept valid values
    const validOptionalResult = shape.optional_field.safeParse(42);
    expect(validOptionalResult.success).toBe(true);
  });

  it('should maintain fallback to z.any() for unknown types', () => {
    const tool = {
      parameters: {
        properties: {
          unknown_field: {
            type: 'unknown_type',
            description: 'Unknown type field',
          },
        },
        required: ['unknown_field'],
      },
    };

    const shape = createZodRawShape(tool);

    expect(shape.unknown_field).toBeDefined();

    // Should accept any value for unknown types
    const result1 = shape.unknown_field.safeParse('string');
    expect(result1.success).toBe(true);

    const result2 = shape.unknown_field.safeParse(123);
    expect(result2.success).toBe(true);

    const result3 = shape.unknown_field.safeParse({ object: true });
    expect(result3.success).toBe(true);
  });

  it('should handle complex nested structures', () => {
    const tool = {
      parameters: {
        properties: {
          metadata: {
            type: 'object',
            description: 'Metadata object',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Array of tags',
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive'],
            description: 'Status enum',
          },
          count: {
            type: 'integer',
            description: 'Count value',
          },
        },
        required: ['metadata', 'status'],
      },
    };

    const shape = createZodRawShape(tool);

    expect(Object.keys(shape)).toEqual(['metadata', 'tags', 'status', 'count']);

    // Test valid data
    const validData = {
      metadata: { key: 'value' },
      tags: ['tag1', 'tag2'],
      status: 'active',
      count: 5,
    };

    const metadataResult = shape.metadata.safeParse(validData.metadata);
    expect(metadataResult.success).toBe(true);

    const tagsResult = shape.tags.safeParse(validData.tags);
    expect(tagsResult.success).toBe(true);

    const statusResult = shape.status.safeParse(validData.status);
    expect(statusResult.success).toBe(true);

    const countResult = shape.count.safeParse(validData.count);
    expect(countResult.success).toBe(true);
  });
});
