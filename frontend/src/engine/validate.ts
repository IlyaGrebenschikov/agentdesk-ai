import type { ValidationResult, WorkflowGraph } from '../api/types';

export function validateGraph(graph: WorkflowGraph): ValidationResult {
  const issues: ValidationResult['issues'] = [];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const ids = new Set<string>();

  for (const node of graph.nodes) {
    if (ids.has(node.id)) {
      issues.push({ code: 'DUPLICATE_NODE_ID', message: `Duplicate node ID: ${node.id}`, node_id: node.id, severity: 'error' });
    }
    ids.add(node.id);
    if (!node.data.title.trim()) {
      issues.push({ code: 'NODE_TITLE_REQUIRED', message: 'Node title cannot be empty.', node_id: node.id, severity: 'error' });
    }
    if (node.data.kind === 'llm' && !String(node.data.config.prompt ?? '').trim()) {
      issues.push({ code: 'LLM_PROMPT_REQUIRED', message: 'Add a prompt before running this LLM node.', node_id: node.id, severity: 'error' });
    }
    if (node.data.kind === 'tool' && !String(node.data.config.tool_name ?? '').trim()) {
      issues.push({ code: 'TOOL_REQUIRED', message: 'Choose a tool for this node.', node_id: node.id, severity: 'error' });
    }
    if (node.data.kind === 'agent' && !String(node.data.config.model ?? '').trim()) {
      issues.push({ code: 'AGENT_MODEL_REQUIRED', message: 'Choose a model for this agent.', node_id: node.id, severity: 'error' });
    }
  }

  if (!graph.nodes.some((node) => node.data.kind === 'input')) {
    issues.push({ code: 'INPUT_REQUIRED', message: 'Add an Input node to define the workflow entry point.', severity: 'error' });
  }
  if (!graph.nodes.some((node) => node.data.kind === 'output')) {
    issues.push({ code: 'OUTPUT_REQUIRED', message: 'Add an Output node to return a result.', severity: 'error' });
  }

  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  graph.nodes.forEach((node) => { adjacency.set(node.id, []); indegree.set(node.id, 0); });
  for (const edge of graph.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      issues.push({ code: 'DANGLING_EDGE', message: 'Connection references a node that no longer exists.', edge_id: edge.id, severity: 'error' });
      continue;
    }
    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited += 1;
    for (const target of adjacency.get(id) ?? []) {
      const nextDegree = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, nextDegree);
      if (nextDegree === 0) queue.push(target);
    }
  }
  if (visited !== graph.nodes.length) {
    issues.push({ code: 'CYCLE_NOT_SUPPORTED', message: 'Cycles are not supported in MVP workflows. Remove the loop before running.', severity: 'error' });
  }

  const errors = issues.some((issue) => issue.severity === 'error');
  return { valid: !errors, issues, checked_at: new Date().toISOString() };
}
