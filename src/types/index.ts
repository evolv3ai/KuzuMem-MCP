import { z } from 'zod';

// Base entity type
export interface BaseEntity {
  id: string;
  created_at?: Date;
  updated_at?: Date;
  repository: string;
  branch: string;
}

// Repository type
export interface Repository {
  id: string;
  name: string;
  branch: string;
  created_at?: Date;
  updated_at?: Date;
}

// Metadata type
export interface Metadata extends BaseEntity {
  name: string;
  content: {
    id: string;
    project?: {
      name: string;
      created?: string;
      description?: string;
    };
    tech_stack?: Record<string, string>;
    architecture?: string;
    memory_spec_version?: string;
  };
  created_at?: Date;
  updated_at?: Date;
}

// Context type
export interface Context extends BaseEntity {
  name: string;
  iso_date: string;
  agent?: string | null;
  related_issue?: string;
  summary?: string | null;
  observation?: string | null; // Added for compatibility
  decisions?: string[];
  observations?: string[];
}

// Component type
export interface Component extends BaseEntity {
  name: string;
  kind?: string | null;
  depends_on?: string[] | null;
  status?: 'active' | 'deprecated' | 'planned' | null;
}

// Explicitly export ComponentStatus for use in ComponentInput and elsewhere
export type ComponentStatus = 'active' | 'deprecated' | 'planned';

export interface ComponentInput {
  id: string;
  name: string;
  branch?: string;
  kind?: string;
  status?: ComponentStatus;
  content?: string | Record<string, any> | null;
  depends_on?: string[] | null;
  dependsOn?: string[] | null; // Alternative casing used by tools
  created_at?: string;
}

// Decision type
export type DecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'deprecated' | 'superseded';

export interface Decision extends BaseEntity {
  name: string;
  context?: string | null;
  date: string;
  status?: DecisionStatus;
}

// Rule type
export interface Rule extends BaseEntity {
  name: string;
  created: string;
  triggers?: string[] | null;
  content?: string | null;
  status?: 'active' | 'deprecated' | 'proposed' | null;
}

// Rule status type
export type RuleStatus = 'active' | 'deprecated' | 'proposed';

// Memory type (union of all memory types)
export type MemoryType = 'metadata' | 'context' | 'component' | 'decision' | 'rule';

// Memory item (union of all memory item types)
export type MemoryItem = Metadata | Context | Component | Decision | Rule;

// Zod schemas for validation
export const repositorySchema = z.object({
  name: z.string().min(1),
  branch: z.string().min(1),
});

export const metadataSchema = z.object({
  id: z.string().min(1),
  repository: z.string().min(1),
  branch: z.string().min(1),
  name: z.string().min(1),
  content: z.object({
    id: z.string().min(1),
    project: z.object({
      name: z.string().min(1),
      created: z.string(),
      description: z.string().optional(),
    }),
    tech_stack: z.record(z.string()),
    architecture: z.string(),
    memory_spec_version: z.string(),
  }),
});

export const contextSchema = z.object({
  id: z.string().min(1),
  repository: z.string().min(1),
  branch: z.string().min(1),
  name: z.string().min(1),
  iso_date: z.string(),
  agent: z.string().optional(),
  related_issue: z.string().optional(),
  summary: z.string().optional(),
  decisions: z.array(z.string()).optional(),
  observations: z.array(z.string()).optional(),
});

export const componentSchema = z.object({
  id: z.string().min(1),
  repository: z.string().min(1),
  branch: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  status: z.enum(['active', 'deprecated', 'planned']).default('active'),
});

export const decisionSchema = z.object({
  id: z.string().min(1),
  repository: z.string().min(1),
  branch: z.string().min(1),
  name: z.string().min(1),
  context: z.string().optional(),
  date: z.string(),
});

export const ruleSchema = z.object({
  id: z.string().min(1),
  repository: z.string().min(1),
  branch: z.string().min(1),
  name: z.string().min(1),
  created: z.string(),
  triggers: z.array(z.string()).optional(),
  content: z.string().optional(),
  status: z.enum(['active', 'deprecated']).default('active'),
});

// Tag type
export interface Tag extends BaseEntity {
  name: string;
  color?: string | null;
  description?: string | null;
  category?: string | null;
}

// File type
export interface File extends BaseEntity {
  name: string;
  path: string;
  size?: number; // in bytes
  mime_type?: string;
  content?: string | null;
  metrics?: Record<string, any> | null;
}

// FileRecord is an alias for File (used in some operations)
export type FileRecord = File;

// Input types for operations
export interface ContextInput {
  repository: string;
  branch: string;
  agent: string;
  summary: string;
  observation?: string;
}

export interface DecisionInput {
  id: string;
  repository: string;
  branch: string;
  name: string;
  date: string;
  context?: string;
}

export interface RuleInput {
  id: string;
  repository: string;
  branch: string;
  name: string;
  created: string;
  content?: string;
  status?: RuleStatus;
  triggers?: string[];
}

export interface FileInput {
  id: string;
  repository: string;
  branch: string;
  name: string;
  path: string;
  content?: string;
  metrics?: Record<string, any>;
}

export interface TagInput {
  id: string;
  repository: string;
  branch: string;
  name: string;
  description?: string;
  color?: string;
  category?: string;
}
