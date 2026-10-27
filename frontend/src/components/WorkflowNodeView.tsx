import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Bot, Braces, Check, CircleDot, FileOutput, Search, Sparkles, XCircle } from 'lucide-react';
import type { WorkflowNodeData } from '../api/types';

const kindMeta = {
  input: { label: 'INPUT', icon: Braces, color: 'violet' },
  agent: { label: 'AI AGENT', icon: Bot, color: 'purple' },
  llm: { label: 'LLM CALL', icon: Sparkles, color: 'blue' },
  tool: { label: 'TOOL', icon: Search, color: 'cyan' },
  condition: { label: 'CONDITION', icon: CircleDot, color: 'amber' },
  output: { label: 'OUTPUT', icon: FileOutput, color: 'green' },
} as const;

const statusText: Record<string, string> = {
  idle: 'Not run', pending: 'Pending', queued: 'Queued', running: 'Running', succeeded: 'Succeeded',
  failed: 'Failed', skipped: 'Skipped', retrying: 'Retrying', cancelled: 'Cancelled',
};

export default function WorkflowNodeView({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData;
  const meta = kindMeta[nodeData.kind] ?? kindMeta.agent;
  const Icon = meta.icon;
  const status = nodeData.status ?? 'idle';
  const isDone = status === 'succeeded';
  const isFailed = status === 'failed';
  const isRunning = status === 'running' || status === 'retrying';
  return (
    <div className={`workflow-node ${selected ? 'is-selected' : ''} node-${meta.color} node-status-${status}`}>
      <Handle type="target" position={Position.Left} className="flow-handle" />
      {nodeData.kind === 'condition' ? (
        <>
          <Handle type="source" position={Position.Right} id="true" className="flow-handle handle-branch handle-branch-true" />
          <Handle type="source" position={Position.Right} id="false" className="flow-handle handle-branch handle-branch-false" />
        </>
      ) : <Handle type="source" position={Position.Right} className="flow-handle" />}
      <div className="workflow-node-topline">
        <span className={`node-icon icon-${meta.color}`}><Icon size={15} strokeWidth={2.1} /></span>
        <span className="node-type-label">{meta.label}</span>
        <span className={`node-state-dot ${isDone ? 'done' : ''} ${isFailed ? 'failed' : ''} ${isRunning ? 'running' : ''}`} title={statusText[status]}>
          {isDone ? <Check size={10} /> : isFailed ? <XCircle size={11} /> : isRunning ? <span className="pulse-dot" /> : null}
        </span>
      </div>
      <div className="workflow-node-title">{nodeData.title}</div>
      <div className="workflow-node-subtitle">{nodeData.subtitle}</div>
      {status !== 'idle' && (
        <div className={`workflow-node-status status-${status}`}>
          <span className="status-dot" /> {statusText[status]}
          {nodeData.lastDurationMs ? <span className="node-duration">{(nodeData.lastDurationMs / 1000).toFixed(2)}s</span> : null}
        </div>
      )}
    </div>
  );
}
