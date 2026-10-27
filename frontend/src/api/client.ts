import type {
  AgentDeskApi, CreateExecutionRequest, ExecutionSummary, ExecutionTrace, ToolDefinition,
  ValidationResult, WorkflowDocument, WorkflowDocumentDto, WorkflowGraph, WorkflowGraphDto,
  WorkflowNode, WorkflowSummary,
} from './types';
import { mockApi } from './mock';
import { getAccessToken } from './auth';
import { createSeedGraph } from './seed';

const mode = import.meta.env.VITE_API_MODE ?? 'mock';
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1').replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json() as { detail?: string; message?: string };
      message = body.detail ?? body.message ?? message;
    } catch { /* response body was not JSON */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// Backend graph DTO intentionally differs from React Flow's UI model. This keeps
// canvas-only fields (selection, runtime status, viewport internals) out of API payloads.
export function toApiGraph(graph: WorkflowGraph): WorkflowGraphDto {
  return {
    schema_version: graph.schema_version ?? 1,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.data.kind,
      name: node.data.title,
      subtitle: node.data.subtitle,
      description: node.data.description,
      position: { x: node.position.x, y: node.position.y },
      config: { ...node.data.config },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: typeof edge.label === 'string' ? edge.label : undefined,
      type: edge.type,
      style: edge.style as unknown as Record<string, unknown> | undefined,
    })),
  };
}

export function fromApiGraph(graph: WorkflowGraphDto): WorkflowGraph {
  const fallback = createSeedGraph();
  const nodes: WorkflowNode[] = graph.nodes.map((node) => {
    const dataFallback = fallback.nodes.find((seedNode) => seedNode.data.kind === node.type)?.data;
    return {
      id: node.id,
      type: 'workflowNode',
      position: node.position ?? { x: 80, y: 80 },
      data: {
        kind: node.type,
        title: node.name || dataFallback?.title || node.type,
        subtitle: node.subtitle || dataFallback?.subtitle || node.type.toUpperCase(),
        description: node.description,
        config: node.config ?? {},
        status: 'idle',
      },
    };
  });
  return {
    schema_version: graph.schema_version ?? 1,
    nodes,
    edges: graph.edges.map((edge) => ({
      id: edge.id, source: edge.source, target: edge.target,
      sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
      label: edge.label, type: edge.type ?? 'smoothstep',
      style: edge.style as unknown as WorkflowGraph['edges'][number]['style'],
    })),
  };
}

function decodeWorkflow(dto: WorkflowDocumentDto): WorkflowDocument {
  return { ...dto, graph: fromApiGraph(dto.graph), node_count: dto.graph.nodes.length };
}

// Keep all backend calls here. If your FastAPI paths or response envelopes differ,
// adapt this module; the screens consume only the AgentDeskApi interface.
const httpApi: AgentDeskApi = {
  listWorkflows: () => request<WorkflowSummary[]>('/workflows'),
  async getWorkflow(workflowId) {
    return decodeWorkflow(await request<WorkflowDocumentDto>(`/workflows/${encodeURIComponent(workflowId)}`));
  },
  async saveWorkflowDraft(workflowId, graph, name) {
    const body = { graph: toApiGraph(graph), ...(name ? { name } : {}) };
    return decodeWorkflow(await request<WorkflowDocumentDto>(`/workflows/${encodeURIComponent(workflowId)}/draft`, { method: 'PUT', body: JSON.stringify(body) }));
  },
  async createWorkflow(name) {
    return decodeWorkflow(await request<WorkflowDocumentDto>('/workflows', { method: 'POST', body: JSON.stringify({ name }) }));
  },
  validateWorkflow: (graph) => request<ValidationResult>('/workflows/validate', { method: 'POST', body: JSON.stringify({ graph: toApiGraph(graph) }) }),
  async publishWorkflow(workflowId) {
    return decodeWorkflow(await request<WorkflowDocumentDto>(`/workflows/${encodeURIComponent(workflowId)}/publish`, { method: 'POST', body: '{}' }));
  },
  createExecution: (workflowId, body: CreateExecutionRequest) => request<ExecutionSummary>(`/workflows/${encodeURIComponent(workflowId)}/executions`, { method: 'POST', body: JSON.stringify(body) }),
  listExecutions: (workflowId) => request<ExecutionSummary[]>(`/executions${workflowId ? `?workflow_id=${encodeURIComponent(workflowId)}` : ''}`),
  getExecution: (executionId) => request<ExecutionSummary>(`/executions/${encodeURIComponent(executionId)}`),
  getExecutionTrace: (executionId) => request<ExecutionTrace>(`/executions/${encodeURIComponent(executionId)}/trace`),
  cancelExecution: (executionId) => request<ExecutionSummary>(`/executions/${encodeURIComponent(executionId)}/cancel`, { method: 'POST', body: '{}' }),
  retryNode: (executionId, nodeId) => request<ExecutionSummary>(`/executions/${encodeURIComponent(executionId)}/nodes/${encodeURIComponent(nodeId)}/retry`, { method: 'POST', body: '{}' }),
  listTools: () => request<ToolDefinition[]>('/tools'),
};

export const api: AgentDeskApi = mode === 'api' ? httpApi : mockApi;
export const apiMode = mode === 'api' ? 'API' : 'DEMO';
