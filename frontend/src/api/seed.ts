import type { Edge, Node } from '@xyflow/react';
import type { WorkflowDocument, WorkflowGraph, WorkflowNodeData } from './types';

export const createSeedGraph = (): WorkflowGraph => {
  const nodes: Node<WorkflowNodeData, 'workflowNode'>[] = [
    {
      id: 'input_1', type: 'workflowNode', position: { x: 70, y: 205 },
      data: { kind: 'input', title: 'Incoming request', subtitle: 'Input · JSON payload', description: 'Validate incoming incident details.', config: { fields: 'service, time_range, environment' }, status: 'idle' },
    },
    {
      id: 'agent_1', type: 'workflowNode', position: { x: 325, y: 205 },
      data: { kind: 'agent', title: 'Incident analyst', subtitle: 'Agent · GPT-4.1 mini', description: 'Investigates the incident using approved tools.', config: { provider: 'OpenAI', model: 'gpt-4.1-mini', max_iterations: 5, system_prompt: 'You are an experienced SRE. Investigate the incident using available tools. Cite evidence and do not invent facts.' }, status: 'idle' },
    },
    {
      id: 'tool_1', type: 'workflowNode', position: { x: 620, y: 65 },
      data: { kind: 'tool', title: 'Search logs', subtitle: 'Tool · demo.log_search', description: 'Search recent service logs for matching errors.', config: { tool_name: 'log_search', window: '1h', max_results: 50 }, status: 'idle' },
    },
    {
      id: 'condition_1', type: 'workflowNode', position: { x: 625, y: 360 },
      data: { kind: 'condition', title: 'Errors found?', subtitle: 'Condition · has_errors', description: 'Choose the output path based on matching errors.', config: { expression: 'results.count > 0', true_label: 'Errors found', false_label: 'No errors' }, status: 'idle' },
    },
    {
      id: 'llm_1', type: 'workflowNode', position: { x: 925, y: 230 },
      data: { kind: 'llm', title: 'Generate report', subtitle: 'LLM · GPT-4.1 mini', description: 'Turn evidence into a concise incident report.', config: { provider: 'OpenAI', model: 'gpt-4.1-mini', temperature: 0.2, max_output_tokens: 1200, prompt: 'Summarize the incident, cite log evidence, explain likely causes, and suggest next diagnostic steps.' }, status: 'idle' },
    },
    {
      id: 'output_1', type: 'workflowNode', position: { x: 1220, y: 230 },
      data: { kind: 'output', title: 'Incident report', subtitle: 'Output · Markdown', description: 'Return a report to the caller.', config: { output_key: 'report', format: 'markdown' }, status: 'idle' },
    },
  ];
  const edges: Edge[] = [
    { id: 'e-input-agent', source: 'input_1', target: 'agent_1', animated: false },
    { id: 'e-agent-tool', source: 'agent_1', target: 'tool_1', label: 'tool call', type: 'smoothstep' },
    { id: 'e-tool-condition', source: 'tool_1', target: 'condition_1', type: 'smoothstep' },
    { id: 'e-condition-llm', source: 'condition_1', sourceHandle: 'true', target: 'llm_1', label: 'Errors found', type: 'smoothstep' },
    { id: 'e-llm-output', source: 'llm_1', target: 'output_1', type: 'smoothstep' },
    { id: 'e-condition-output', source: 'condition_1', sourceHandle: 'false', target: 'output_1', label: 'No errors', type: 'smoothstep', style: { strokeDasharray: '5 4' } },
  ];
  return { schema_version: 1, nodes, edges };
};

export const createSeedWorkflow = (): WorkflowDocument => {
  const now = new Date().toISOString();
  return {
    id: 'wf_error_analyst',
    name: 'Error Analyst',
    description: 'Analyze service errors and generate an incident report.',
    status: 'draft',
    updated_at: now,
    created_at: now,
    published_version: null,
    node_count: 6,
    graph: createSeedGraph(),
  };
};
