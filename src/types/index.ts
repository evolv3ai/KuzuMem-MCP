import { z } from 'zod';

// Base entity type
export interface BaseEntity {
  id?: number;
  repository_id: number;
  yaml_id: string;
  created_at?: Date;
  updated_at?: Date;
}

// Repository type
export interface Repository {
  id?: number;
  name: string;
  branch: string;
  created_at?: Date;
  updated_at?: Date;
}

// Metadata type
export interface Metadata extends BaseEntity {
  yaml_id: string;
  name: string;
  content: {
    id: string;
    project: {
      name: string;
      created: string;
    };
    tech_stack: Record<string, string>;
    architecture: string;
    memory_spec_version: string;
  };
  created_at?: Date;
  updated_at?: Date;
}

// Context type
export interface Context extends BaseEntity {
  iso_date: string;
  agent?: string;
  related_issue?: string;
  summary?: string;
  decisions?: string[];
  observations?: string[];
}

// Component type
export interface Component extends BaseEntity {
  name: string;
  kind?: string;
  depends_on?: string[];
  status: 'active' | 'deprecated' | 'planned';
}

// Decision type
export interface Decision extends BaseEntity {
  name: string;
  context?: string;
  date: string;
}

// Rule type
export interface Rule extends BaseEntity {
  name: string;
  created: string;
  triggers?: string[];
  content?: string;
  status: 'active' | 'deprecated';
}

// Memory type (union of all memory types)
export type MemoryType = 'metadata' | 'context' | 'component' | 'decision' | 'rule';

// Memory item (union of all memory item types)
export type MemoryItem = Metadata | Context | Component | Decision | Rule;

// Zod schemas for validation
export const repositorySchema = z.object({
  name: z.string().min(1),
});

export const metadataSchema = z.object({
  yaml_id: z.string().min(1),
  content: z.object({
    id: z.string().min(1),
    project: z.object({
      name: z.string().min(1),
      created: z.string(),
    }),
    tech_stack: z.record(z.string()),
    architecture: z.string(),
    memory_spec_version: z.string(),
  }),
});

export const contextSchema = z.object({
  yaml_id: z.string().min(1),
  iso_date: z.string(),
  agent: z.string().optional(),
  related_issue: z.string().optional(),
  summary: z.string().optional(),
  decisions: z.array(z.string()).optional(),
  observations: z.array(z.string()).optional(),
});

export const componentSchema = z.object({
  yaml_id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  status: z.enum(['active', 'deprecated', 'planned']).default('active'),
});

export const decisionSchema = z.object({
  yaml_id: z.string().min(1),
  name: z.string().min(1),
  context: z.string().optional(),
  date: z.string(),
});

export const ruleSchema = z.object({
  yaml_id: z.string().min(1),
  name: z.string().min(1),
  created: z.string(),
  triggers: z.array(z.string()).optional(),
  content: z.string().optional(),
  status: z.enum(['active', 'deprecated']).default('active'),
});
