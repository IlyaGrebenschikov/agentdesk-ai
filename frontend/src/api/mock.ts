import type {
  AgentDeskApi, CreateExecutionRequest, ExecutionTrace, NodeRun,
  TraceEvent, ToolDefinition, ValidationResult, WorkflowDocument, WorkflowGraph, WorkflowSummary,
} from './types';
import { createSeedWorkflow } from './seed';
import { validateGraph } from '../engine/validate';

const STORAGE = {
  workflows: 'agentdesk.mock.workflows.v1',
  traces: 'agentdesk.mock.traces.v1',
};

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const makeId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function seedFailedTrace(workflow: WorkflowDocument): ExecutionTrace {
  const executionId = 'exec_demo_failed';
  const nodeRuns: NodeRun[] = [
    {
      id: 'nr_demo_input', node_id: 'input_1', node_title: 'Incoming request', node_kind: 'input', status: 'succeeded', attempt: 1,
      started_at: iso(-72_000), finished_at: iso(-71_800), duration_ms: 200,
      input_snapshot: { service: 'checkout-api', time_range: '1h', environment: 'production' },
      output_snapshot: { service: 'checkout-api', from: '14:00', to: '15:00' },
    },
    {
      id: 'nr_demo_agent', node_id: 'agent_1', node_title: 'Incident analyst', node_kind: 'agent', status: 'succeeded', attempt: 1,
      started_at: iso(-71_700), finished_at: iso(-65_200), duration_ms: 6500,
      input_snapshot: { task: 'Find the cause of elevated checkout errors', available_tools: ['log_search', 'service_metrics'] },
      output_snapshot: { tool_calls_requested: 1, reasoning_summary: 'Search logs for errors around the incident window.' },
      usage: { input_tokens: 1140, output_tokens: 168, estimated_cost_usd: 0.0018, provider: 'OpenAI', model: 'gpt-4.1-mini' },
    },
    {
      id: 'nr_demo_tool', node_id: 'tool_1', node_title: 'Search logs', node_kind: 'tool', status: 'failed', attempt: 2,
      started_at: iso(-65_000), finished_at: iso(-34_000), duration_ms: 31_000,
      input_snapshot: { service: 'checkout-api', query: 'error OR timeout', since: '1h', limit: 50 },
      error: {
        category: 'timeout', code: 'TOOL_TIMEOUT', message: 'The log-search tool did not respond within 15 seconds.', retryable: true,
        stage: 'tool.execute', traceback: 'ToolTimeout: request exceeded 15000ms\n  at log_search (tools/log_search.py:84)\n  at ToolExecutor.execute (runtime/tools.py:119)\n  at AgentRunner.step (runtime/agent.py:207)',
      },
    },
    {
      id: 'nr_demo_condition', node_id: 'condition_1', node_title: 'Errors found?', node_kind: 'condition', status: 'skipped', attempt: 0,
      input_snapshot: { reason: 'Previous node failed before producing output' },
    },
    {
      id: 'nr_demo_llm', node_id: 'llm_1', node_title: 'Generate report', node_kind: 'llm', status: 'skipped', attempt: 0,
      input_snapshot: { reason: 'Dependency failed' },
    },
    {
      id: 'nr_demo_output', node_id: 'output_1', node_title: 'Incident report', node_kind: 'output', status: 'skipped', attempt: 0,
      input_snapshot: { reason: 'Dependency failed' },
    },
  ];
  const events: TraceEvent[] = [
    { id: 'evt_1', execution_id: executionId, node_id: 'input_1', node_run_id: 'nr_demo_input', timestamp: iso(-72_000), level: 'info', event_type: 'node.started', message: 'Input payload received', details: { payload_size_bytes: 94 } },
    { id: 'evt_2', execution_id: executionId, node_id: 'input_1', node_run_id: 'nr_demo_input', timestamp: iso(-71_800), level: 'success', event_type: 'node.completed', message: 'Input validated successfully' },
    { id: 'evt_3', execution_id: executionId, node_id: 'agent_1', node_run_id: 'nr_demo_agent', timestamp: iso(-71_700), level: 'info', event_type: 'llm.request', message: 'Agent requested tool: log_search', details: { model: 'gpt-4.1-mini', iteration: 1 } },
    { id: 'evt_4', execution_id: executionId, node_id: 'tool_1', node_run_id: 'nr_demo_tool', timestamp: iso(-65_000), level: 'info', event_type: 'tool.started', message: 'Calling log_search', details: { timeout_ms: 15000 } },
    { id: 'evt_5', execution_id: executionId, node_id: 'tool_1', node_run_id: 'nr_demo_tool', timestamp: iso(-49_000), level: 'warning', event_type: 'tool.retry_scheduled', message: 'Timeout; retry scheduled with backoff', details: { attempt: 2, backoff_ms: 1000 } },
    { id: 'evt_6', execution_id: executionId, node_id: 'tool_1', node_run_id: 'nr_demo_tool', timestamp: iso(-34_000), level: 'error', event_type: 'node.failed', message: 'Tool execution failed after retry', details: { error_code: 'TOOL_TIMEOUT', retryable: true, stage: 'tool.execute' } },
    { id: 'evt_7', execution_id: executionId, timestamp: iso(-33_900), level: 'warning', event_type: 'execution.failed', message: 'Execution stopped because a required node failed' },
  ];
  return {
    execution: {
      id: executionId, workflow_id: workflow.id, workflow_name: workflow.name, workflow_version: 3, status: 'failed', trigger: 'manual',
      created_at: iso(-72_000), started_at: iso(-72_000), finished_at: iso(-33_900), duration_ms: 38_100,
      total_tokens: 1308, estimated_cost_usd: 0.0018, failed_node_id: 'tool_1',
      input_preview: '{ service: "checkout-api", time_range: "1h" }', error_message: 'Tool execution failed: timeout after 15 seconds',
    },
    node_runs: nodeRuns,
    events,
  };
}

function defaultTools(): ToolDefinition[] {
  return [
    { id: 'log_search', name: 'Search logs', description: 'Search demo service logs by text, level and time range.', category: 'Observability', kind: 'builtin', status: 'available', icon: 'search', input_schema: { service: 'string', query: 'string', since: 'string', limit: 'integer' } },
    { id: 'service_metrics', name: 'Get service metrics', description: 'Fetch latency, error rate and request volume for a service.', category: 'Observability', kind: 'builtin', status: 'available', icon: 'chart', input_schema: { service: 'string', window: 'string' } },
    { id: 'http_request', name: 'HTTP request', description: 'Call an allowlisted HTTP endpoint with a JSON payload.', category: 'Integrations', kind: 'builtin', status: 'available', icon: 'globe', input_schema: { method: 'string', url: 'string', body: 'object' } },
    { id: 'document_search', name: 'Search documents', description: 'Retrieve relevant passages from a demo knowledge base.', category: 'Knowledge', kind: 'builtin', status: 'available', icon: 'book', input_schema: { query: 'string', top_k: 'integer' } },
    { id: 'send_slack', name: 'Send Slack message', description: 'Send a message after an approval step is completed.', category: 'Integrations', kind: 'integration', status: 'coming_soon', icon: 'message', input_schema: { channel: 'string', text: 'string' } },
    { id: 'postgres_query', name: 'Read-only SQL query', description: 'Run a safe, parameterized read-only query.', category: 'Data', kind: 'integration', status: 'coming_soon', icon: 'database', input_schema: { query_id: 'string', params: 'object' } },
  ];
}

function bootstrap() {
  let workflows = readJson<WorkflowDocument[]>(STORAGE.workflows);
  if (!workflows?.length) {
    const workflow = createSeedWorkflow();
    workflows = [workflow];
    writeJson(STORAGE.workflows, workflows);
  }
  let traces = readJson<ExecutionTrace[]>(STORAGE.traces);
  if (!traces?.length) {
    traces = [seedFailedTrace(workflows[0])];
    writeJson(STORAGE.traces, traces);
  }
  return { workflows, traces };
}

function allWorkflows() { return bootstrap().workflows; }
function saveWorkflows(workflows: WorkflowDocument[]) { writeJson(STORAGE.workflows, workflows); }
function allTraces() { return bootstrap().traces; }
function saveTraces(traces: ExecutionTrace[]) { writeJson(STORAGE.traces, traces); }
function summary(workflow: WorkflowDocument): WorkflowSummary {
  return {
    id: workflow.id, name: workflow.name, description: workflow.description, status: workflow.status,
    updated_at: workflow.updated_at, published_version: workflow.published_version, node_count: workflow.graph.nodes.length,
    last_run_status: allTraces().find((trace) => trace.execution.workflow_id === workflow.id)?.execution.status,
  };
}

function sortEvents(events: TraceEvent[]) {
  return [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function simulateExecution(executionId: string) {
  const initialTrace = allTraces().find((item) => item.execution.id === executionId);
  if (!initialTrace) return;
  const timeline = initialTrace.node_runs.map((nodeRun) => nodeRun.node_id);
  const titles: Record<string, string> = Object.fromEntries(initialTrace.node_runs.map((nodeRun) => [nodeRun.node_id, nodeRun.node_title]));
  for (let i = 0; i < timeline.length; i += 1) {
    await wait(900);
    const traces = allTraces();
    const trace = traces.find((item) => item.execution.id === executionId);
    if (!trace || ['cancelled', 'failed', 'succeeded'].includes(trace.execution.status)) return;
    const nodeId = timeline[i];
    const node = trace.node_runs.find((item) => item.node_id === nodeId);
    if (!node) continue;
    const now = new Date().toISOString();
    if (i > 0) {
      const previous = trace.node_runs.find((item) => item.node_id === timeline[i - 1]);
      if (previous && previous.status === 'running') {
        previous.status = 'succeeded'; previous.finished_at = now; previous.duration_ms = 900;
        previous.output_snapshot = mockOutput(previous.node_id);
        trace.events.push({ id: makeId('evt'), execution_id: executionId, node_id: previous.node_id, node_run_id: previous.id, timestamp: now, level: 'success', event_type: 'node.completed', message: `${previous.node_title} completed successfully` });
      }
    }
    node.status = 'running'; node.attempt = Math.max(1, node.attempt); node.started_at = node.started_at ?? now;
    if (i > 0 && node.input_snapshot === undefined) node.input_snapshot = mockOutput(timeline[i - 1]);
    trace.execution.status = 'running'; trace.execution.started_at = trace.execution.started_at ?? now;
    trace.events.push({ id: makeId('evt'), execution_id: executionId, node_id: nodeId, node_run_id: node.id, timestamp: now, level: 'info', event_type: 'node.started', message: `Started ${titles[nodeId]}`, details: { attempt: node.attempt } });
    if (nodeId === 'agent_1') {
      node.usage = { input_tokens: 860, output_tokens: 124, estimated_cost_usd: 0.0011, provider: 'OpenAI', model: 'gpt-4.1-mini' };
      trace.execution.total_tokens = 984;
      trace.execution.estimated_cost_usd = 0.0011;
    }
    if (nodeId === 'tool_1') {
      node.input_snapshot = { service: 'checkout-api', query: 'error OR timeout', since: '1h', limit: 50 };
    }
    saveTraces(traces);
  }
  await wait(900);
  const traces = allTraces();
  const trace = traces.find((item) => item.execution.id === executionId);
  if (!trace || trace.execution.status === 'cancelled') return;
  const finalNode = trace.node_runs.find((item) => item.node_id === timeline[timeline.length - 1]);
  const now = new Date().toISOString();
  if (finalNode) {
    finalNode.status = 'succeeded'; finalNode.finished_at = now; finalNode.duration_ms = 120; finalNode.output_snapshot = mockOutput('output_1');
  }
  trace.execution.status = 'succeeded'; trace.execution.finished_at = now; trace.execution.duration_ms = Math.max(1000, Date.now() - new Date(trace.execution.created_at).getTime());
  trace.execution.output_preview = 'Incident summary generated. 12 errors found, most likely cause: connection pool exhaustion.';
  trace.output = { report: '# Incident report\n\n**Service:** checkout-api\n\n**Finding:** Connection pool exhaustion is the most likely cause.\n\n**Evidence:** Repeated timeout errors and elevated p95 latency.\n\n**Next steps:** Inspect pool saturation and slow queries.' };
  trace.events.push({ id: makeId('evt'), execution_id: executionId, node_id: 'output_1', node_run_id: finalNode?.id, timestamp: now, level: 'success', event_type: 'execution.completed', message: 'Workflow completed successfully' });
  saveTraces(traces);
}

function mockOutput(nodeId: string): unknown {
  const outputs: Record<string, unknown> = {
    input_1: { service: 'checkout-api', time_range: '1h', environment: 'production' },
    agent_1: { action: 'log_search', query: 'connection timeout checkout-api' },
    tool_1: { count: 12, top_errors: ['connection pool exhausted', 'request timeout'], sample_ids: ['log_1942', 'log_1951'] },
    condition_1: { result: true, branch: 'errors_found' },
    llm_1: { summary: 'The errors are consistent with connection pool exhaustion.', confidence: 0.82 },
    output_1: { report: '# Incident report\n\nMost likely cause: connection pool exhaustion.' },
  };
  return outputs[nodeId] ?? {};
}

function normalizeGraph(graph: WorkflowGraph): WorkflowGraph {
  return {
    schema_version: graph.schema_version ?? 1,
    nodes: graph.nodes.map((node) => ({ ...node, data: { ...node.data, status: 'idle' } })),
    edges: graph.edges.map((edge) => ({ ...edge, animated: false })),
  };
}

export const mockApi: AgentDeskApi = {
  async listWorkflows() {
    await wait(120);
    return allWorkflows().map(summary).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  async getWorkflow(workflowId) {
    await wait(80);
    const workflow = allWorkflows().find((item) => item.id === workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    return workflow;
  },
  async saveWorkflowDraft(workflowId, graph, name) {
    await wait(220);
    const workflows = allWorkflows();
    const index = workflows.findIndex((item) => item.id === workflowId);
    if (index < 0) throw new Error(`Workflow ${workflowId} not found`);
    workflows[index] = { ...workflows[index], name: name?.trim() || workflows[index].name, graph: normalizeGraph(graph), node_count: graph.nodes.length, updated_at: new Date().toISOString(), status: 'draft' };
    saveWorkflows(workflows);
    return workflows[index];
  },
  async createWorkflow(name) {
    await wait(180);
    const workflows = allWorkflows();
    const source = createSeedWorkflow();
    const inputId = makeId('node');
    const outputId = makeId('node');
    const workflow: WorkflowDocument = {
      ...source, id: makeId('wf'), name: name.trim() || 'Untitled workflow', description: 'New workflow created in AgentDesk.', status: 'draft', published_version: null,
      graph: { schema_version: 1, nodes: [
        { id: inputId, type: 'workflowNode', position: { x: 160, y: 200 }, data: { kind: 'input', title: 'Incoming request', subtitle: 'Input · JSON payload', config: { fields: 'question' }, status: 'idle' } },
        { id: outputId, type: 'workflowNode', position: { x: 510, y: 200 }, data: { kind: 'output', title: 'Final response', subtitle: 'Output · JSON', config: { output_key: 'result', format: 'json' }, status: 'idle' } },
      ], edges: [{ id: makeId('edge'), source: inputId, target: outputId, type: 'smoothstep' }] },
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), node_count: 2,
    };
    workflows.unshift(workflow); saveWorkflows(workflows); return workflow;
  },
  async validateWorkflow(graph): Promise<ValidationResult> {
    await wait(140);
    return validateGraph(graph);
  },
  async publishWorkflow(workflowId) {
    await wait(180);
    const workflows = allWorkflows();
    const index = workflows.findIndex((item) => item.id === workflowId);
    if (index < 0) throw new Error(`Workflow ${workflowId} not found`);
    const validation = validateGraph(workflows[index].graph);
    if (!validation.valid) throw new Error('Workflow has validation errors. Fix them before publishing.');
    const nextVersion = (workflows[index].published_version ?? 0) + 1;
    workflows[index] = { ...workflows[index], status: 'published', published_version: nextVersion, updated_at: new Date().toISOString() };
    saveWorkflows(workflows); return workflows[index];
  },
  async createExecution(workflowId, request: CreateExecutionRequest) {
    await wait(160);
    const workflow = allWorkflows().find((item) => item.id === workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    const validation = validateGraph(workflow.graph);
    if (!validation.valid) throw new Error(validation.issues.filter((item) => item.severity === 'error').map((item) => item.message).join(' '));
    const id = makeId('exec');
    const now = new Date().toISOString();
    const nodeRuns: NodeRun[] = workflow.graph.nodes.map((node) => ({
      id: makeId('nr'), node_id: node.id, node_title: node.data.title, node_kind: node.data.kind, status: 'pending', attempt: 0,
      input_snapshot: node.data.kind === 'input' ? request.inputs : undefined,
    }));
    const trace: ExecutionTrace = {
      execution: { id, workflow_id: workflow.id, workflow_name: workflow.name, workflow_version: workflow.published_version, status: 'queued', trigger: 'manual', created_at: now, input_preview: JSON.stringify(request.inputs).slice(0, 180) },
      node_runs: nodeRuns,
      events: [{ id: makeId('evt'), execution_id: id, timestamp: now, level: 'info', event_type: 'execution.queued', message: 'Execution accepted and queued for a worker', details: { queue: 'agentdesk.executions' } }],
    };
    const traces = allTraces(); traces.unshift(trace); saveTraces(traces);
    window.setTimeout(() => { void simulateExecution(id); }, 250);
    return trace.execution;
  },
  async listExecutions(workflowId) {
    await wait(100);
    return allTraces().map((trace) => trace.execution).filter((execution) => !workflowId || execution.workflow_id === workflowId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getExecution(executionId) {
    await wait(70);
    const trace = allTraces().find((item) => item.execution.id === executionId);
    if (!trace) throw new Error(`Execution ${executionId} not found`);
    return trace.execution;
  },
  async getExecutionTrace(executionId) {
    await wait(80);
    const trace = allTraces().find((item) => item.execution.id === executionId);
    if (!trace) throw new Error(`Execution ${executionId} not found`);
    return { ...trace, events: sortEvents(trace.events) };
  },
  async cancelExecution(executionId) {
    const traces = allTraces(); const trace = traces.find((item) => item.execution.id === executionId);
    if (!trace) throw new Error(`Execution ${executionId} not found`);
    if (!['queued', 'running'].includes(trace.execution.status)) return trace.execution;
    const now = new Date().toISOString();
    trace.execution.status = 'cancelled'; trace.execution.finished_at = now;
    trace.node_runs.filter((node) => ['queued', 'running', 'pending'].includes(node.status)).forEach((node) => { node.status = 'cancelled'; node.finished_at = now; });
    trace.events.push({ id: makeId('evt'), execution_id: executionId, timestamp: now, level: 'warning', event_type: 'execution.cancelled', message: 'Execution cancelled by user' });
    saveTraces(traces); await wait(100); return trace.execution;
  },
  async retryNode(executionId, nodeId) {
    const traces = allTraces(); const original = traces.find((item) => item.execution.id === executionId);
    if (!original) throw new Error(`Execution ${executionId} not found`);
    const node = original.node_runs.find((item) => item.node_id === nodeId);
    if (!node?.error?.retryable && node?.status !== 'failed') throw new Error('This node cannot be retried from its current state.');
    const workflow = allWorkflows().find((item) => item.id === original.execution.workflow_id);
    const newId = makeId('exec'); const now = new Date().toISOString();
    const retryRuns = original.node_runs.map((item) => ({ ...item, id: makeId('nr'), status: item.node_id === nodeId ? 'queued' as const : 'skipped' as const, attempt: item.node_id === nodeId ? item.attempt + 1 : 0, started_at: undefined, finished_at: undefined, duration_ms: undefined, error: undefined }));
    const trace: ExecutionTrace = {
      execution: { id: newId, workflow_id: original.execution.workflow_id, workflow_name: original.execution.workflow_name, workflow_version: original.execution.workflow_version, status: 'queued', trigger: 'manual', created_at: now, input_preview: original.execution.input_preview },
      node_runs: retryRuns,
      events: [{ id: makeId('evt'), execution_id: newId, node_id: nodeId, timestamp: now, level: 'warning', event_type: 'node.retry_requested', message: `Retry requested for ${node?.node_title ?? nodeId}`, details: { source_execution_id: executionId, node_id: nodeId, replay_mode: 'captured_input' } }],
    };
    traces.unshift(trace); saveTraces(traces);
    if (workflow) {
      window.setTimeout(async () => {
        await wait(400);
        const curr = allTraces().find((item) => item.execution.id === newId);
        if (!curr) return;
        const nodeRun = curr.node_runs.find((item) => item.node_id === nodeId);
        const finished = new Date().toISOString();
        if (nodeRun) { nodeRun.status = 'succeeded'; nodeRun.started_at = now; nodeRun.finished_at = finished; nodeRun.duration_ms = 1340; nodeRun.output_snapshot = mockOutput(nodeId); nodeRun.input_snapshot = node?.input_snapshot; }
        curr.execution.status = 'succeeded'; curr.execution.started_at = now; curr.execution.finished_at = finished; curr.execution.duration_ms = 1340; curr.execution.output_preview = 'Node replay finished. Captured input was reused.';
        curr.events.push({ id: makeId('evt'), execution_id: newId, node_id: nodeId, node_run_id: nodeRun?.id, timestamp: finished, level: 'success', event_type: 'node.replay_completed', message: 'Replay completed using the captured input' });
        saveTraces(allTraces());
      }, 200);
    }
    return trace.execution;
  },
  async listTools() { await wait(100); return defaultTools(); },
};
