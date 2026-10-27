import type { Edge, Node } from '@xyflow/react';

export type NodeKind = 'input' | 'llm' | 'agent' | 'tool' | 'condition' | 'output';
export type WorkflowStatus = 'draft' | 'published';
export type ExecutionStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type NodeRunStatus = 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'retrying' | 'cancelled';
export type TraceLevel = 'info' | 'warning' | 'error' | 'success';

export interface WorkflowNodeData extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
  subtitle: string;
  description?: string;
  status?: NodeRunStatus | 'idle';
  config: Record<string, unknown>;
  lastDurationMs?: number;
  lastTokens?: number;
}

export type WorkflowNode = Node<WorkflowNodeData, 'workflowNode'>;
export type WorkflowEdge = Edge;

export interface WorkflowGraph {
  schema_version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}


export interface WorkflowGraphNodeDto {
  id: string;
  type: NodeKind;
  name: string;
  subtitle?: string;
  description?: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface WorkflowGraphEdgeDto {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  type?: string;
  style?: Record<string, unknown>;
}

export interface WorkflowGraphDto {
  schema_version: number;
  nodes: WorkflowGraphNodeDto[];
  edges: WorkflowGraphEdgeDto[];
}

export interface WorkflowDocumentDto extends Omit<WorkflowDocument, 'graph'> {
  graph: WorkflowGraphDto;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  updated_at: string;
  published_version: number | null;
  node_count: number;
  last_run_status?: ExecutionStatus;
}

export interface WorkflowDocument extends WorkflowSummary {
  graph: WorkflowGraph;
  created_at: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  node_id?: string;
  edge_id?: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  checked_at: string;
}

export interface NodeRun {
  id: string;
  node_id: string;
  node_title: string;
  node_kind: NodeKind;
  status: NodeRunStatus;
  attempt: number;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  input_snapshot?: unknown;
  output_snapshot?: unknown;
  error?: {
    category: string;
    code: string;
    message: string;
    retryable: boolean;
    stage?: string;
    traceback?: string;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    estimated_cost_usd?: number;
    provider?: string;
    model?: string;
  };
}

export interface TraceEvent {
  id: string;
  execution_id: string;
  node_run_id?: string;
  node_id?: string;
  timestamp: string;
  level: TraceLevel;
  event_type: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ExecutionSummary {
  id: string;
  workflow_id: string;
  workflow_name: string;
  workflow_version: number | null;
  status: ExecutionStatus;
  trigger: 'manual' | 'api' | 'schedule';
  created_at: string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  total_tokens?: number;
  estimated_cost_usd?: number;
  failed_node_id?: string;
  input_preview?: string;
  output_preview?: string;
  error_message?: string;
}

export interface ExecutionTrace {
  execution: ExecutionSummary;
  node_runs: NodeRun[];
  events: TraceEvent[];
  output?: unknown;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: 'builtin' | 'integration';
  status: 'available' | 'coming_soon';
  icon: string;
  input_schema: Record<string, unknown>;
}

export interface CreateExecutionRequest {
  inputs: Record<string, unknown>;
}

export interface AgentDeskApi {
  listWorkflows(): Promise<WorkflowSummary[]>;
  getWorkflow(workflowId: string): Promise<WorkflowDocument>;
  saveWorkflowDraft(workflowId: string, graph: WorkflowGraph, name?: string): Promise<WorkflowDocument>;
  createWorkflow(name: string): Promise<WorkflowDocument>;
  validateWorkflow(graph: WorkflowGraph): Promise<ValidationResult>;
  publishWorkflow(workflowId: string): Promise<WorkflowDocument>;
  createExecution(workflowId: string, request: CreateExecutionRequest): Promise<ExecutionSummary>;
  listExecutions(workflowId?: string): Promise<ExecutionSummary[]>;
  getExecution(executionId: string): Promise<ExecutionSummary>;
  getExecutionTrace(executionId: string): Promise<ExecutionTrace>;
  cancelExecution(executionId: string): Promise<ExecutionSummary>;
  retryNode(executionId: string, nodeId: string): Promise<ExecutionSummary>;
  listTools(): Promise<ToolDefinition[]>;
}
