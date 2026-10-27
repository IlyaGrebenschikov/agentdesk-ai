import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  addEdge, Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider,
  useEdgesState, useNodesState, useReactFlow, type Connection,
} from '@xyflow/react';
import {
  Activity, AlertCircle, ArrowRight, ArrowUpRight, BadgeCheck, Bell, BookOpen, Bot, Braces,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Code2, Command, Copy,
  CreditCard, Database, FileCode2, FileOutput, Filter, Gauge, GitBranch, Globe, LayoutGrid, LogOut,
  ListFilter, LoaderCircle, Menu, MoreHorizontal, Network, Play, Plus, RefreshCw, Rocket, Search,
  Settings2, ShieldCheck, Sparkles, Square, Terminal, Trash2, Wrench, X, XCircle, Zap,
} from 'lucide-react';
import WorkflowNodeView from './components/WorkflowNodeView';
import AuthScreen from './components/AuthScreen';
import { authApi, getStoredSession, type AuthSession } from './api/auth';
import { api, apiMode, checkApiReadiness } from './api/client';
import { createSeedGraph } from './api/seed';
import type { ExecutionSummary, ExecutionTrace, NodeKind, NodeRun, ToolDefinition, ValidationResult, WorkflowDocument, WorkflowEdge, WorkflowGraph, WorkflowNode, WorkflowNodeData, WorkflowSummary } from './api/types';

const nodeTypes = { workflowNode: WorkflowNodeView };
type ViewKey = 'editor' | 'workflows' | 'runs' | 'tools' | 'templates' | 'settings';
type ToastType = 'success' | 'error' | 'info';
type Toast = { message: string; type: ToastType } | null;
type ApiHealth = 'checking' | 'connected' | 'unhealthy';

const nodePalette: { kind: NodeKind; label: string; description: string; icon: typeof Braces; tone: string }[] = [
  { kind: 'input', label: 'Input', description: 'Start with user data', icon: Braces, tone: 'violet' },
  { kind: 'llm', label: 'LLM', description: 'Call a language model', icon: Sparkles, tone: 'blue' },
  { kind: 'agent', label: 'AI Agent', description: 'Reason and use tools', icon: Bot, tone: 'purple' },
  { kind: 'tool', label: 'Tool', description: 'Call an external action', icon: Wrench, tone: 'cyan' },
  { kind: 'condition', label: 'Condition', description: 'Route based on data', icon: GitBranch, tone: 'amber' },
  { kind: 'output', label: 'Output', description: 'Return a result', icon: FileOutput, tone: 'green' },
];

const kindDefaults: Record<NodeKind, Pick<WorkflowNodeData, 'title' | 'subtitle' | 'description' | 'config'>> = {
  input: { title: 'Incoming request', subtitle: 'Input · JSON payload', description: 'Define the input accepted by the workflow.', config: { fields: 'question' } },
  llm: { title: 'LLM call', subtitle: 'LLM · GPT-4.1 mini', description: 'Generate text or structured output using a model.', config: { provider: 'OpenAI', model: 'gpt-4.1-mini', temperature: 0.2, max_output_tokens: 1200, prompt: 'Answer the user using the supplied context.' } },
  agent: { title: 'AI agent', subtitle: 'Agent · GPT-4.1 mini', description: 'Run a bounded agent loop using approved tools.', config: { provider: 'OpenAI', model: 'gpt-4.1-mini', max_iterations: 5, system_prompt: 'You are a helpful agent. Use tools when they improve the answer.' } },
  tool: { title: 'HTTP request', subtitle: 'Tool · http_request', description: 'Call an approved integration.', config: { tool_name: 'http_request', method: 'GET', timeout_ms: 10000 } },
  condition: { title: 'Check condition', subtitle: 'Condition · expression', description: 'Route execution based on a deterministic expression.', config: { expression: 'result.ok === true', true_label: 'Yes', false_label: 'No' } },
  output: { title: 'Final response', subtitle: 'Output · JSON', description: 'Map execution data to the final response.', config: { output_key: 'result', format: 'json' } },
};

function formatRelative(value?: string) {
  if (!value) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDuration(ms?: number) {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatCost(value?: number) {
  if (value == null) return '—';
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: 'Queued', running: 'Running', succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled',
    pending: 'Pending', skipped: 'Skipped', retrying: 'Retrying', idle: 'Not run',
  };
  return labels[status] ?? status;
}

function kindIcon(kind: NodeKind, size = 16) {
  const iconProps = { size, strokeWidth: 2 };
  if (kind === 'input') return <Braces {...iconProps} />;
  if (kind === 'llm') return <Sparkles {...iconProps} />;
  if (kind === 'agent') return <Bot {...iconProps} />;
  if (kind === 'tool') return <Wrench {...iconProps} />;
  if (kind === 'condition') return <GitBranch {...iconProps} />;
  return <FileOutput {...iconProps} />;
}

function statusIcon(status: string, size = 14) {
  if (status === 'succeeded') return <CheckCircle2 size={size} />;
  if (status === 'failed') return <XCircle size={size} />;
  if (status === 'running' || status === 'queued' || status === 'retrying') return <LoaderCircle size={size} className={status === 'running' ? 'spin' : ''} />;
  if (status === 'cancelled') return <Square size={size} />;
  return <Clock3 size={size} />;
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${status}`}><span className="status-pill-icon">{statusIcon(status, 12)}</span>{statusLabel(status)}</span>;
}

function JsonBlock({ value, empty = 'No data captured for this step.' }: { value: unknown; empty?: string }) {
  if (value === undefined || value === null) return <div className="empty-json">{empty}</div>;
  return <pre className="json-block">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>;
}

function AppInner() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredSession());
  const [view, setView] = useState<ViewKey>('editor');
  const [workflow, setWorkflow] = useState<WorkflowDocument | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'config' | 'debug'>('debug');
  const [runs, setRuns] = useState<ExecutionSummary[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [trace, setTrace] = useState<ExecutionTrace | null>(null);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [busyAction, setBusyAction] = useState<'save' | 'validate' | 'publish' | 'run' | null>(null);
  const [runInput, setRunInput] = useState(`{
  "service": "checkout-api",
  "time_range": "1h",
  "environment": "production"
}`);
  const [showRunInput, setShowRunInput] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [apiHealth, setApiHealth] = useState<ApiHealth>('checking');
  const [search, setSearch] = useState('');
  const [nodeFilter, setNodeFilter] = useState<'all' | 'failed' | 'slow'>('all');
  const { screenToFlowPosition } = useReactFlow();

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedNodeRun = trace?.node_runs.find((run) => run.node_id === selectedNodeId) ?? null;
  const failedNodes = trace?.node_runs.filter((node) => node.status === 'failed') ?? [];

  const notify = useCallback((message: string, type: ToastType = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3600);
  }, []);

  const refreshRuns = useCallback(async (workflowId?: string) => {
    try {
      const latest = await api.listExecutions(workflowId);
      setRuns(latest);
      return latest;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not load runs.', 'error');
      return [];
    }
  }, [notify]);

  const openWorkflow = useCallback(async (workflowId: string) => {
    try {
      const result = await api.getWorkflow(workflowId);
      setWorkflow(result);
      setNodes(result.graph.nodes);
      setEdges(result.graph.edges);
      setSelectedNodeId(result.graph.nodes[0]?.id ?? null);
      setValidation(null);
      setIsDirty(false);
      setView('editor');
      setRightTab('debug');
      setMobileNavOpen(false);
      const workflowRuns = await refreshRuns(result.id);
      setSelectedExecutionId(workflowRuns[0]?.id ?? null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not open workflow.', 'error');
    }
  }, [notify, refreshRuns, setEdges, setNodes]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!authSession) return;
      try {
        const [workflowList, toolList, runList] = await Promise.all([api.listWorkflows(), api.listTools(), api.listExecutions()]);
        if (cancelled) return;
        setWorkflows(workflowList);
        setTools(toolList);
        setRuns(runList);
        const firstWorkflow = workflowList[0];
        if (firstWorkflow) {
          const document = await api.getWorkflow(firstWorkflow.id);
          if (cancelled) return;
          setWorkflow(document);
          setNodes(document.graph.nodes);
          setEdges(document.graph.edges);
          setIsDirty(false);
          setSelectedNodeId(runList[0]?.failed_node_id ?? document.graph.nodes[1]?.id ?? document.graph.nodes[0]?.id ?? null);
        }
        if (runList[0]) setSelectedExecutionId(runList[0].id);
      } catch (error) {
        if (!cancelled) notify(error instanceof Error ? error.message : 'Unable to initialize AgentDesk.', 'error');
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, [authSession, notify, setEdges, setNodes]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function pollReadiness() {
      const healthy = await checkApiReadiness(controller.signal);
      if (active) setApiHealth(healthy ? 'connected' : 'unhealthy');
    }

    void pollReadiness();
    const timer = window.setInterval(() => void pollReadiness(), 15000);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!authSession || !selectedExecutionId) { setTrace(null); return; }
    let cancelled = false;
    async function loadTrace() {
      try {
        const result = await api.getExecutionTrace(selectedExecutionId!);
        if (!cancelled) setTrace(result);
      } catch {
        if (!cancelled) setTrace(null);
      }
    }
    void loadTrace();
    return () => { cancelled = true; };
  }, [authSession, selectedExecutionId]);

  useEffect(() => {
    const isLive = authSession && trace && ['queued', 'running'].includes(trace.execution.status);
    if (!isLive || !selectedExecutionId) return;
    const timer = window.setInterval(async () => {
      try {
        const nextTrace = await api.getExecutionTrace(selectedExecutionId);
        setTrace(nextTrace);
        await refreshRuns(nextTrace.execution.workflow_id);
      } catch { /* keep last known trace while polling */ }
    }, 950);
    return () => window.clearInterval(timer);
  }, [authSession, trace?.execution.status, selectedExecutionId, refreshRuns]);

  // Overlay execution state on the graph. The saved graph itself stays independent of run history.
  useEffect(() => {
    if (!authSession || !trace || !workflow || trace.execution.workflow_id !== workflow.id) return;
    const runByNodeId = new Map<string, NodeRun>(trace.node_runs.map((run) => [run.node_id, run] as const));
    setNodes((current) => current.map((node) => {
      const run = runByNodeId.get(node.id);
      if (!run) return node;
      return { ...node, data: { ...node.data, status: run.status, lastDurationMs: run.duration_ms, lastTokens: (run.usage?.input_tokens ?? 0) + (run.usage?.output_tokens ?? 0) } };
    }));
  }, [authSession, trace, workflow, setNodes]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, type: 'default', animated: false }, current));
    setValidation(null);
    setIsDirty(true);
  }, [setEdges]);

  const addNode = (kind: NodeKind, position?: { x: number; y: number }) => {
    const defaults = kindDefaults[kind];
    const nodeId = `${kind}_${Math.random().toString(36).slice(2, 7)}`;
    const newNode: WorkflowNode = {
      id: nodeId, type: 'workflowNode', position: position ?? { x: 260 + Math.random() * 170, y: 180 + Math.random() * 250 },
      data: { kind, ...defaults, status: 'idle' },
    };
    setNodes((current) => [...current, newNode]);
    setSelectedNodeId(nodeId);
    setRightTab('config');
    setValidation(null);
    setIsDirty(true);
  };

  const handlePaletteDragStart = (event: DragEvent<HTMLButtonElement>, kind: NodeKind) => {
    event.dataTransfer.setData('application/agentdesk-node', kind);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleCanvasDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleCanvasDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/agentdesk-node') as NodeKind;
    if (!Object.prototype.hasOwnProperty.call(kindDefaults, kind)) return;
    addNode(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  const updateSelectedData = (key: keyof WorkflowNodeData | string, value: unknown) => {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => {
      if (node.id !== selectedNodeId) return node;
      if (key === 'title' || key === 'subtitle' || key === 'description') return { ...node, data: { ...node.data, [key]: value } };
      return { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value } } };
    }));
    setValidation(null);
  };

  const updateWorkflowName = (name: string) => {
    setWorkflow((current) => current ? { ...current, name } : current);
    setIsDirty(true);
  };

  const saveWorkflow = async (quiet = false) => {
    if (!workflow) return null;
    setBusyAction('save');
    try {
      const graph: WorkflowGraph = { schema_version: 1, nodes, edges };
      const saved = await api.saveWorkflowDraft(workflow.id, graph, workflow.name);
      setWorkflow(saved);
      setIsDirty(false);
      setWorkflows((current) => [
        { id: saved.id, name: saved.name, description: saved.description, status: saved.status, updated_at: saved.updated_at, published_version: saved.published_version, node_count: saved.graph.nodes.length },
        ...current.filter((item) => item.id !== saved.id),
      ]);
      if (!quiet) notify('Draft saved', 'success');
      return saved;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save workflow.', 'error');
      return null;
    } finally {
      setBusyAction(null);
    }
  };

  const validateCurrent = async () => {
    setBusyAction('validate');
    try {
      const result = await api.validateWorkflow({ schema_version: 1, nodes, edges });
      setValidation(result);
      if (result.valid) notify('Workflow is valid — ready to run', 'success');
      else notify(`${result.issues.filter((issue) => issue.severity === 'error').length} validation issue(s) found`, 'error');
      if (!result.valid) {
        const firstNodeIssue = result.issues.find((issue) => issue.node_id)?.node_id;
        if (firstNodeIssue) { setSelectedNodeId(firstNodeIssue); setRightTab('config'); }
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Validation failed.', 'error');
    } finally { setBusyAction(null); }
  };

  const publishWorkflow = async () => {
    if (!workflow) return;
    setBusyAction('publish');
    try {
      const checked = await api.validateWorkflow({ schema_version: 1, nodes, edges });
      setValidation(checked);
      if (!checked.valid) {
        notify('Fix validation errors before publishing', 'error');
        setRightTab('config');
        return;
      }
      await saveWorkflow(true);
      const published = await api.publishWorkflow(workflow.id);
      setWorkflow(published);
      notify(`Published version ${published.published_version ?? 1}`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not publish workflow.', 'error');
    } finally { setBusyAction(null); }
  };

  const runWorkflow = async () => {
    if (!workflow) return;
    setBusyAction('run');
    try {
      let inputs: Record<string, unknown>;
      try { inputs = JSON.parse(runInput) as Record<string, unknown>; }
      catch { notify('Run input must be valid JSON', 'error'); return; }
      const checked = await api.validateWorkflow({ schema_version: 1, nodes, edges });
      setValidation(checked);
      if (!checked.valid) {
        notify('Workflow has validation errors. Fix them before running.', 'error');
        setRightTab('config');
        return;
      }
      const saved = await saveWorkflow(true);
      if (!saved) return;
      const created = await api.createExecution(workflow.id, { inputs });
      setSelectedExecutionId(created.id);
      setRightTab('debug');
      setView('editor');
      setShowRunInput(false);
      await refreshRuns(workflow.id);
      notify('Execution queued — opening live trace', 'info');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start workflow.', 'error');
    } finally { setBusyAction(null); }
  };

  const createWorkflow = async () => {
    try {
      const created = await api.createWorkflow(`Untitled workflow ${workflows.length + 1}`);
      setWorkflows((current) => [{ id: created.id, name: created.name, description: created.description, status: created.status, updated_at: created.updated_at, published_version: created.published_version, node_count: created.graph.nodes.length }, ...current]);
      await openWorkflow(created.id);
      notify('New workflow created', 'success');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not create workflow.', 'error'); }
  };

  const createFromTemplate = async (templateName: string) => {
    try {
      const created = await api.createWorkflow(templateName);
      const graph = createTemplateGraph(templateName);
      await api.saveWorkflowDraft(created.id, graph, templateName);
      const refreshed = await api.listWorkflows();
      setWorkflows(refreshed);
      await openWorkflow(created.id);
      notify(`Created workflow from “${templateName}”`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create workflow from template.', 'error');
    }
  };

  const openExecution = async (executionId: string) => {
    try {
      const execution = runs.find((item) => item.id === executionId) ?? await api.getExecution(executionId);
      if (workflow?.id !== execution.workflow_id) await openWorkflow(execution.workflow_id);
      setSelectedExecutionId(executionId);
      setRightTab('debug');
      setView('editor');
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not open execution trace.', 'error'); }
  };

  const retrySelectedNode = async (nodeRun: NodeRun) => {
    if (!selectedExecutionId) return;
    try {
      const retry = await api.retryNode(selectedExecutionId, nodeRun.node_id);
      setSelectedExecutionId(retry.id);
      setRightTab('debug');
      notify(`Retry started for ${nodeRun.node_title}`, 'info');
      await refreshRuns(retry.workflow_id);
    } catch (error) { notify(error instanceof Error ? error.message : 'Could not retry node.', 'error'); }
  };

  const handleAuthenticated = useCallback((session: AuthSession) => {
    setAuthSession(session);
    setToast({ message: `Welcome, ${session.user.full_name.split(' ')[0]}`, type: 'success' });
  }, []);

  const handleSignOut = useCallback(async () => {
    await authApi.signOut();
    setAuthSession(null);
    setWorkflow(null);
    setWorkflows([]);
    setNodes([]);
    setEdges([]);
    setRuns([]);
    setTrace(null);
    setSelectedExecutionId(null);
    setSelectedNodeId(null);
    setView('editor');
  }, [setEdges, setNodes]);

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      if (nodeFilter === 'failed') return node.data.status === 'failed';
      if (nodeFilter === 'slow') return (node.data.lastDurationMs ?? 0) > 1000;
      return true;
    });
  }, [nodes, nodeFilter]);

  const graphNodeCount = nodes.length;
  const traceDuration = trace?.execution.duration_ms;
  const healthStatus = apiHealth === 'connected'
    ? { label: 'API CONNECTED', footer: 'API connected', tone: 'connected' }
    : apiHealth === 'unhealthy'
      ? { label: 'API UNAVAILABLE', footer: 'API unavailable', tone: 'unhealthy' }
      : { label: 'CHECKING API', footer: 'Checking API…', tone: 'checking' };
  const environmentStatus = apiMode === 'DEMO' ? { label: 'DEMO MODE', tone: 'demo' } : healthStatus;
  const footerStatus = apiMode === 'DEMO' ? `Demo data · ${healthStatus.footer}` : healthStatus.footer;

  if (!authSession) return <AuthScreen onAuthenticated={handleAuthenticated} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Network size={21} strokeWidth={2.4} /></div>
          <div className="brand-copy"><span>agentdesk</span><small>WORKFLOW STUDIO</small></div>
          <button className="icon-button mobile-nav-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={17} /></button>
        </div>
        <button className="workspace-switcher">
          <div className="workspace-avatar">AD</div>
          <div className="workspace-copy"><strong>Personal workspace</strong><small>Free plan</small></div>
          <ChevronDown size={15} className="muted-icon" />
        </button>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="main-nav">
          <button className={`nav-item ${view === 'workflows' || view === 'editor' ? 'active' : ''}`} onClick={() => { setView('workflows'); setMobileNavOpen(false); }}><LayoutGrid size={17} /><span>Workflows</span><span className="nav-counter">{workflows.length}</span></button>
          <button className={`nav-item ${view === 'runs' ? 'active' : ''}`} onClick={() => { setView('runs'); setMobileNavOpen(false); }}><Activity size={17} /><span>Runs & traces</span>{runs.some((run) => run.status === 'failed') && <span className="nav-alert" />}</button>
          <button className={`nav-item ${view === 'tools' ? 'active' : ''}`} onClick={() => { setView('tools'); setMobileNavOpen(false); }}><Wrench size={17} /><span>Tools & integrations</span></button>
          <button className={`nav-item ${view === 'templates' ? 'active' : ''}`} onClick={() => { setView('templates'); setMobileNavOpen(false); }}><BookOpen size={17} /><span>Templates</span></button>
        </nav>
        <div className="sidebar-section-label sidebar-label-spaced">OBSERVABILITY</div>
        <nav className="main-nav">
          <button className="nav-item" onClick={() => { setView('runs'); setNodeFilter('failed'); setMobileNavOpen(false); }}><AlertCircle size={17} /><span>Error explorer</span><span className="nav-count-red">{runs.filter((run) => run.status === 'failed').length}</span></button>
          <button className="nav-item" onClick={() => { setRightTab('debug'); setView('editor'); setMobileNavOpen(false); }}><Terminal size={17} /><span>Live debugger</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="usage-card">
            <div className="usage-card-top"><span>Monthly usage</span><span className="usage-percent">23%</span></div>
            <div className="usage-bar"><span style={{ width: '23%' }} /></div>
            <div className="usage-caption"><span>11.4k / 50k tokens</span><button onClick={() => setView('settings')}>Manage</button></div>
          </div>
          <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => { setView('settings'); setMobileNavOpen(false); }}><Settings2 size={17} /><span>Settings</span></button>
          <div className="user-profile">
            <div className="user-avatar">{authSession.user.full_name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>
            <div className="user-copy"><strong>{authSession.user.full_name}</strong><small>{authSession.user.email}</small></div>
            <button className="profile-signout" title="Sign out" aria-label="Sign out" onClick={() => void handleSignOut()}><LogOut size={15} /></button>
          </div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={18} /></button>
            <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><span>{view === 'editor' ? 'Workflows' : navTitle(view)}</span>{view === 'editor' && workflow && <><ChevronRight size={14} /><strong>{workflow.name}</strong></>}</div>
          </div>
          <div className="topbar-actions">
            <div className={`environment-badge ${environmentStatus.tone}`}><span className="status-dot" />{environmentStatus.label}</div>
            <button className="icon-button" title="Keyboard shortcuts" onClick={() => notify('Shortcuts: ⌘/Ctrl + S to save · Drag nodes to move · Connect handles to create edges', 'info')}><Command size={17} /></button>
            <button className="icon-button notification-button" title="Notifications" onClick={() => setView('runs')}><Bell size={17} /><span /></button>
            <div className="topbar-divider" />
            <button className="topbar-help" onClick={() => notify('AgentDesk MVP · Visual workflow editor + execution debugger', 'info')}><CircleHelp size={16} /><span>Help</span></button>
          </div>
        </header>

        {view === 'editor' && workflow && (
          <div className="editor-page">
            <div className="workflow-toolbar">
              <div className="workflow-heading">
                <div className="workflow-title-row">
                  <input className="workflow-name-input" aria-label="Workflow name" value={workflow.name} onChange={(event) => updateWorkflowName(event.target.value)} />
                  <span className={`draft-badge ${workflow.status}`}>{workflow.status === 'published' ? <><BadgeCheck size={12} /> Published v{workflow.published_version}</> : <><span className="draft-dot" /> Draft</>}</span>
                </div>
                <div className="workflow-subline"><span className="workflow-id"><Code2 size={12} /> {workflow.id}</span><span className="subline-separator">·</span><span>Edited {formatRelative(workflow.updated_at)}</span><span className="subline-separator">·</span><span>{graphNodeCount} nodes</span></div>
              </div>
              <div className="workflow-actions">
                <button className="button button-ghost button-sm" onClick={() => void saveWorkflow()} disabled={busyAction !== null}><span className="button-icon">{busyAction === 'save' ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}</span>Save draft</button>
                <button className="button button-outline button-sm" onClick={() => void validateCurrent()} disabled={busyAction !== null}><ShieldCheck size={15} />{busyAction === 'validate' ? 'Checking…' : 'Validate'}</button>
                <button className="button button-primary button-sm" onClick={() => setShowRunInput((open) => !open)} disabled={busyAction !== null}><Play size={14} fill="currentColor" />Run workflow</button>
                <button className="icon-button toolbar-more" title="Publish workflow" onClick={() => void publishWorkflow()} disabled={busyAction !== null}><Rocket size={16} /></button>
              </div>
            </div>
            {showRunInput && <div className="run-input-drawer"><div className="run-input-head"><div><strong>Run input</strong><p>Provide a JSON payload for this execution.</p></div><button className="icon-button" onClick={() => setShowRunInput(false)} aria-label="Close run input"><X size={16} /></button></div><textarea className="run-input-editor" value={runInput} onChange={(event) => setRunInput(event.target.value)} spellCheck={false} /><div className="run-input-footer"><span><Braces size={13} /> JSON payload</span><button className="button button-primary button-sm" disabled={busyAction !== null} onClick={() => void runWorkflow()}>{busyAction === 'run' ? <LoaderCircle size={14} className="spin" /> : <Play size={13} fill="currentColor" />}Execute workflow</button></div></div>}
            <div className="editor-workspace">
              <aside className="node-library">
                <div className="panel-heading"><div><span className="eyebrow">BUILD</span><h3>Node library</h3></div><button className="tiny-icon-button" onClick={() => notify('Node search is ready to be connected to the backend registry.', 'info')}><Search size={15} /></button></div>
                <div className="node-search"><Search size={14} /><input placeholder="Find a node…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>/</kbd></div>
                <div className="node-group-label">CORE NODES <span>6</span></div>
                <div className="node-library-list">
                  {nodePalette.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(search.toLowerCase())).map((item) => {
                    const Icon = item.icon;
                    return <button key={item.kind} className="palette-node" draggable onDragStart={(event) => handlePaletteDragStart(event, item.kind)} onClick={() => addNode(item.kind)}><span className={`palette-icon tone-${item.tone}`}><Icon size={16} /></span><span className="palette-copy"><strong>{item.label}</strong><small>{item.description}</small></span><Plus size={14} className="palette-add" /></button>;
                  })}
                </div>
                <div className="library-tip"><div className="tip-icon"><Zap size={14} /></div><div><strong>Quick tip</strong><p>Drag from a node handle to connect steps. Select a node to configure it.</p></div></div>
                <div className="library-footer"><span className={`green-indicator ${healthStatus.tone}`} />{footerStatus}</div>
              </aside>

              <section className="canvas-section">
                <div className="canvas-toolbar">
                  <div className="canvas-view-controls"><button className="view-tab active"><Network size={14} />Canvas</button><button className="view-tab" onClick={() => notify('Raw workflow JSON view is planned for the next iteration.', 'info')}><Code2 size={14} />JSON</button></div>
                  <div className="canvas-toolbar-right"><span className={`canvas-saved ${isDirty ? 'dirty' : 'clean'}`}><span className="saved-dot" />{isDirty ? 'Unsaved changes' : 'All changes saved'}</span><button className="icon-button compact" title="Fit graph" onClick={() => notify('Use the fit-view control at the bottom-left of the canvas.', 'info')}><ArrowUpRight size={15} /></button><button className="icon-button compact" title="Canvas options" onClick={() => notify('Canvas settings: snap-to-grid and minimap visibility are planned.', 'info')}><MoreHorizontal size={16} /></button></div>
                </div>
                <div className="reactflow-wrapper" onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop}>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={(changes) => { onNodesChange(changes); if (changes.some((change) => change.type === 'position' || change.type === 'remove' || change.type === 'add' || change.type === 'replace')) setIsDirty(true); }}
                    onEdgesChange={(changes) => { onEdgesChange(changes); if (changes.some((change) => change.type === 'remove' || change.type === 'add' || change.type === 'replace')) setIsDirty(true); setValidation(null); }}
                    onConnect={onConnect}
                    onNodeDragStart={(_, node) => { setSelectedNodeId(node.id); setRightTab('config'); }}
                    onNodeDragStop={() => setIsDirty(true)}
                    onNodeClick={(_, node) => { setSelectedNodeId(node.id); setRightTab('config'); }}
                    onPaneClick={() => setSelectedNodeId(null)}
                    fitView
                    fitViewOptions={{ padding: 0.22 }}
                    autoPanOnNodeDrag
                    elevateNodesOnSelect
                    minZoom={0.25}
                    maxZoom={1.3}
                    defaultEdgeOptions={{ type: 'default', style: { stroke: '#4b4c5c', strokeWidth: 1.7 }, labelStyle: { fill: '#9a9baa', fontSize: 10 }, labelBgStyle: { fill: '#191a22', fillOpacity: 0.92 }, labelBgPadding: [6, 3], labelBgBorderRadius: 4 }}
                    deleteKeyCode={['Backspace', 'Delete']}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#30313d" />
                    <Controls position="bottom-left" showInteractive={false} />
                    <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => {
                      const data = node.data as WorkflowNodeData;
                      if (data.status === 'failed') return '#ef656c';
                      if (data.status === 'succeeded') return '#48b987';
                      return data.kind === 'agent' ? '#8b6df2' : data.kind === 'tool' ? '#39acc0' : data.kind === 'condition' ? '#e7ae58' : '#6558ae';
                    }} maskColor="rgba(13, 14, 20, 0.76)" />
                    <Panel position="top-right" className="canvas-floating-panel"><span className="canvas-zoom-hint"><Command size={11} /> + scroll to zoom</span><span className="canvas-divider" /><span>{nodes.length} nodes · {edges.length} connections</span></Panel>
                  </ReactFlow>
                </div>
                <div className="canvas-footer"><div className="canvas-footer-left"><span><span className="footer-legend legend-success" />Completed</span><span><span className="footer-legend legend-running" />Running</span><span><span className="footer-legend legend-failed" />Failed</span></div><div className="canvas-footer-right"><span><kbd>Space</kbd> + drag to pan</span><span><kbd>⌘</kbd><kbd>S</kbd> save</span></div></div>
              </section>

              <aside className="inspector-panel">
                <div className="inspector-tabs"><button className={rightTab === 'config' ? 'active' : ''} onClick={() => setRightTab('config')}><Settings2 size={14} />Configure</button><button className={rightTab === 'debug' ? 'active' : ''} onClick={() => setRightTab('debug')}><Activity size={14} />Debugger{failedNodes.length > 0 && <span className="tab-count error-count">{failedNodes.length}</span>}</button></div>
                {rightTab === 'config' ? (
                  <div className="inspector-scroll">
                    {selectedNode ? <NodeConfiguration node={selectedNode} onUpdate={updateSelectedData} onDelete={() => { setNodes((current) => current.filter((node) => node.id !== selectedNode.id)); setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)); setSelectedNodeId(null); setValidation(null); setIsDirty(true); }} onReset={() => { const defaults = kindDefaults[selectedNode.data.kind as NodeKind]; setNodes((current) => current.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, ...defaults } } : node)); setValidation(null); setIsDirty(true); }} /> : <div className="inspector-empty"><div className="inspector-empty-icon"><Settings2 size={20} /></div><strong>Select a node</strong><p>Choose a node on the canvas to view and edit its configuration.</p></div>}
                    {validation && <ValidationBox validation={validation} onSelect={(id) => setSelectedNodeId(id)} />}
                  </div>
                ) : (
                  <div className="inspector-scroll debug-scroll">
                    <div className="debug-run-header"><div className="debug-run-title"><div><span className="eyebrow">EXECUTION TRACE</span><h3>{trace?.execution.id ? trace.execution.id.slice(0, 17) : 'No execution selected'}</h3></div>{trace && <StatusPill status={trace.execution.status} />}</div><div className="debug-run-meta"><span><Clock3 size={12} />{formatDuration(traceDuration)}</span><span><Zap size={12} />{trace?.execution.total_tokens?.toLocaleString() ?? 0} tokens</span><span><CreditCard size={12} />{formatCost(trace?.execution.estimated_cost_usd)}</span></div></div>
                    {trace?.execution.status === 'failed' && <div className="failure-callout"><div className="failure-callout-icon"><AlertCircle size={17} /></div><div><strong>Execution failed</strong><p>{trace.execution.error_message ?? 'A node failed before the workflow could finish.'}</p><button onClick={() => { const id = trace.execution.failed_node_id ?? trace.node_runs.find((item) => item.status === 'failed')?.node_id; if (id) { setSelectedNodeId(id); setNodeFilter('failed'); } }}>Jump to failing node <ArrowRight size={12} /></button></div></div>}
                    <div className="debug-section-heading"><span>NODE EXECUTION</span><div className="debug-filter-wrap"><button className={`debug-filter-button ${nodeFilter !== 'all' ? 'filter-active' : ''}`} onClick={() => setNodeFilter((current) => current === 'all' ? 'failed' : current === 'failed' ? 'slow' : 'all')}><Filter size={12} />{nodeFilter === 'all' ? 'All nodes' : nodeFilter === 'failed' ? 'Failed only' : 'Slow only'}<ChevronDown size={12} /></button></div></div>
                    <div className="node-execution-list">
                      {filteredNodes.map((node) => {
                        const nodeRun = trace?.node_runs.find((run) => run.node_id === node.id);
                        return <button key={node.id} className={`node-execution-row ${selectedNodeId === node.id ? 'selected' : ''} ${nodeRun?.status === 'failed' ? 'failed-row' : ''}`} onClick={() => { setSelectedNodeId(node.id); setRightTab('debug'); }}><span className={`execution-node-icon kind-${node.data.kind}`}>{kindIcon(node.data.kind, 14)}</span><span className="execution-node-info"><strong>{node.data.title}</strong><small>{nodeRun?.attempt ? `Attempt ${nodeRun.attempt}` : node.data.subtitle}</small></span><span className={`execution-row-status ${nodeRun?.status ?? 'pending'}`}>{statusIcon(nodeRun?.status ?? 'pending', 13)}</span><span className="execution-node-duration">{formatDuration(nodeRun?.duration_ms)}</span></button>;
                      })}
                      {filteredNodes.length === 0 && <div className="empty-filter"><CheckCircle2 size={17} /><span>No nodes match this filter.</span><button onClick={() => setNodeFilter('all')}>Clear filter</button></div>}
                    </div>
                    <div className="debug-divider" />
                    {selectedNodeRun ? <NodeTraceDetails nodeRun={selectedNodeRun} onRetry={() => void retrySelectedNode(selectedNodeRun)} /> : <div className="trace-empty"><Activity size={19} /><strong>Select a node to inspect</strong><p>Input, output, timing and error details will appear here.</p></div>}
                    {trace && <div className="event-timeline"><div className="debug-section-heading"><span>TRACE EVENTS</span><span className="event-count">{trace.events.length} events</span></div>{trace.events.slice(-8).reverse().map((event) => <div className={`trace-event ${event.level}`} key={event.id}><span className="trace-event-dot" /><div className="trace-event-content"><div className="trace-event-title"><strong>{event.message}</strong><time>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div><small>{event.event_type}{event.node_id ? ` · ${event.node_id}` : ''}</small></div></div>)}</div>}
                  </div>
                )}
              </aside>
            </div>
          </div>
        )}

        {view === 'workflows' && <WorkflowsPage workflows={workflows} onOpen={openWorkflow} onCreate={() => void createWorkflow()} onRefresh={() => void api.listWorkflows().then(setWorkflows)} />}
        {view === 'runs' && <RunsPage runs={runs} onOpen={openExecution} onRefresh={() => void refreshRuns()} onCancel={(id) => void api.cancelExecution(id).then(() => refreshRuns())} />}
        {view === 'tools' && <ToolsPage tools={tools} />}
        {view === 'templates' && <TemplatesPage onUse={(templateName) => void createFromTemplate(templateName)} />}
        {view === 'settings' && <SettingsPage />}
      </main>

      {toast && <div className={`toast toast-${toast.type}`}><span className="toast-icon">{toast.type === 'error' ? <AlertCircle size={16} /> : toast.type === 'info' ? <Activity size={16} /> : <CheckCircle2 size={16} />}</span><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={14} /></button></div>}
    </div>
  );
}

function navTitle(view: ViewKey) {
  const titles: Record<ViewKey, string> = { editor: 'Workflow editor', workflows: 'Workflows', runs: 'Runs & traces', tools: 'Tools & integrations', templates: 'Templates', settings: 'Settings' };
  return titles[view];
}

function NodeConfiguration({ node, onUpdate, onDelete, onReset }: { node: WorkflowNode; onUpdate: (key: string, value: unknown) => void; onDelete: () => void; onReset: () => void }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const data = node.data;
  const config = data.config ?? {};
  const setConfig = (key: string, value: unknown) => onUpdate(key, value);
  const textField = (label: string, key: string, placeholder = '', multiline = false) => {
    const value = key === 'title' || key === 'subtitle' || key === 'description' ? data[key] : config[key];
    return <label className={`form-field ${multiline ? 'full' : ''}`} key={key}><span>{label}</span>{multiline ? <textarea value={String(value ?? '')} onChange={(event) => setConfig(key, event.target.value)} placeholder={placeholder} rows={4} spellCheck={false} /> : <input value={String(value ?? '')} onChange={(event) => setConfig(key, event.target.value)} placeholder={placeholder} />}</label>;
  };
  const selectField = (label: string, key: string, options: string[]) => <label className="form-field" key={key}><span>{label}</span><div className="select-wrap"><select value={String(config[key] ?? options[0])} onChange={(event) => setConfig(key, event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={13} /></div></label>;
  const numberField = (label: string, key: string, min: number, max: number, step = 1) => <label className="form-field" key={key}><span>{label}</span><input type="number" min={min} max={max} step={step} value={Number(config[key] ?? min)} onChange={(event) => setConfig(key, Number(event.target.value))} /></label>;

  return <div className="node-config-content">
    <div className="selected-node-heading"><span className={`selected-node-icon kind-${data.kind}`}>{kindIcon(data.kind, 17)}</span><div><span className="eyebrow">NODE CONFIGURATION</span><h3>{data.title}</h3></div><button className="icon-button danger-icon" title="Delete node" onClick={onDelete}><Trash2 size={15} /></button></div>
    <div className="node-id-line"><span>ID</span><code>{node.id}</code><button className="tiny-icon-button" title="Copy ID" onClick={() => { void navigator.clipboard?.writeText(node.id); }}><Copy size={12} /></button></div>
    <div className="config-form">
      {textField('Display name', 'title', 'Node name')}
      <label className="form-field"><span>Node type</span><div className="read-only-field">{kindIcon(data.kind, 14)}<span>{data.kind.charAt(0).toUpperCase() + data.kind.slice(1)}</span><span className="read-only-tag">CORE</span></div></label>
      {textField('Subtitle', 'subtitle', 'Short description')}
      <div className="form-divider" />
      {data.kind === 'input' && <>{textField('Input fields', 'fields', 'question, context')}<div className="field-help"><CircleHelp size={12} />Comma-separated fields exposed to the first node.</div></>}
      {data.kind === 'agent' && <>{selectField('Provider', 'provider', ['OpenAI', 'Anthropic', 'Google'])}{textField('Model', 'model', 'gpt-4.1-mini')}{numberField('Max iterations', 'max_iterations', 1, 20)}{textField('System instructions', 'system_prompt', 'Define how the agent should behave…', true)}<div className="field-help"><ShieldCheck size={12} />Only tools connected to this agent and allowed by policy can be called.</div></>}
      {data.kind === 'llm' && <>{selectField('Provider', 'provider', ['OpenAI', 'Anthropic', 'Google'])}{textField('Model', 'model', 'gpt-4.1-mini')}{numberField('Temperature', 'temperature', 0, 2, 0.1)}{numberField('Max output tokens', 'max_output_tokens', 64, 8192)}{textField('Prompt', 'prompt', 'Write your prompt…', true)}</>}
      {data.kind === 'tool' && <>{selectField('Tool', 'tool_name', ['log_search', 'service_metrics', 'http_request', 'document_search'])}{selectField('HTTP method', 'method', ['GET', 'POST', 'PUT', 'DELETE'])}{numberField('Timeout (ms)', 'timeout_ms', 500, 120000)}{textField('Search window', 'window', '1h')}{numberField('Max results', 'max_results', 1, 500)}<div className="field-help"><ShieldCheck size={12} />Tools execute in a restricted runtime, never as arbitrary Python.</div></>}
      {data.kind === 'condition' && <>{textField('Expression', 'expression', 'result.ok === true')}{textField('True branch label', 'true_label', 'Yes')}{textField('False branch label', 'false_label', 'No')}<div className="branch-preview"><span className="branch-yes"><span />True → next node</span><span className="branch-no"><span />False → next node</span></div></>}
      {data.kind === 'output' && <>{textField('Output key', 'output_key', 'result')}{selectField('Output format', 'format', ['json', 'markdown', 'text'])}</>}
      <button className="advanced-toggle" onClick={() => setShowAdvanced((value) => !value)}><ChevronRight size={14} className={showAdvanced ? 'rotate-90' : ''} />Advanced settings<span>Optional</span></button>
      {showAdvanced && <div className="advanced-section">{textField('Description', 'description', 'Internal notes about this node…', true)}<label className="checkbox-row"><input type="checkbox" defaultChecked /> Capture input and output snapshots</label><label className="checkbox-row"><input type="checkbox" defaultChecked /> Include node in trace timeline</label><div className="field-help"><ShieldCheck size={12} />Secrets should be referenced by ID and redacted from stored snapshots.</div></div>}
    </div>
    <div className="config-panel-footer"><span><span className="saved-dot" />Changes not saved</span><button className="button button-outline button-sm" onClick={onReset}>Reset node</button></div>
  </div>;
}

function ValidationBox({ validation, onSelect }: { validation: ValidationResult; onSelect: (id: string) => void }) {
  return <div className={`validation-box ${validation.valid ? 'valid' : 'invalid'}`}><div className="validation-box-title">{validation.valid ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}<strong>{validation.valid ? 'Validation passed' : 'Validation issues'}</strong><span>{validation.issues.length}</span></div>{validation.issues.length ? validation.issues.map((issue, index) => <button key={`${issue.code}-${index}`} className="validation-issue" onClick={() => issue.node_id && onSelect(issue.node_id)}><span className={`issue-severity ${issue.severity}`} /><span>{issue.message}</span>{issue.node_id && <ChevronRight size={12} />}</button>) : <p>Graph structure and node configuration look good.</p>}</div>;
}

function NodeTraceDetails({ nodeRun, onRetry }: { nodeRun: NodeRun; onRetry: () => void }) {
  const [detailTab, setDetailTab] = useState<'input' | 'output' | 'error'>('input');
  useEffect(() => { setDetailTab(nodeRun.status === 'failed' ? 'error' : 'input'); }, [nodeRun.id, nodeRun.status]);
  return <div className="node-trace-details"><div className="node-trace-heading"><div><span className="eyebrow">SELECTED NODE</span><h3>{nodeRun.node_title}</h3></div><StatusPill status={nodeRun.status} /></div><div className="node-metrics-grid"><div><span>Duration</span><strong>{formatDuration(nodeRun.duration_ms)}</strong></div><div><span>Attempt</span><strong>{nodeRun.attempt || '—'}</strong></div><div><span>Tokens</span><strong>{((nodeRun.usage?.input_tokens ?? 0) + (nodeRun.usage?.output_tokens ?? 0)).toLocaleString() || '0'}</strong></div></div><div className="snapshot-tabs"><button className={detailTab === 'input' ? 'active' : ''} onClick={() => setDetailTab('input')}>Input</button><button className={detailTab === 'output' ? 'active' : ''} onClick={() => setDetailTab('output')}>Output</button>{nodeRun.error && <button className={`error-snapshot-tab ${detailTab === 'error' ? 'active' : ''}`} onClick={() => setDetailTab('error')}>Error</button>}</div>{detailTab === 'input' && <JsonBlock value={nodeRun.input_snapshot} />}{detailTab === 'output' && <JsonBlock value={nodeRun.output_snapshot} />}{detailTab === 'error' && nodeRun.error && <div className="error-detail"><div className="error-code-row"><span className="error-code">{nodeRun.error.code}</span><span className="error-category">{nodeRun.error.category}</span></div><strong>{nodeRun.error.message}</strong><div className="error-stage">Stage <code>{nodeRun.error.stage ?? 'unknown'}</code></div><pre className="traceback-block">{nodeRun.error.traceback ?? 'No traceback recorded.'}</pre><div className="error-actions"><span className={nodeRun.error.retryable ? 'retryable' : 'not-retryable'}>{nodeRun.error.retryable ? <RefreshCw size={12} /> : <ShieldCheck size={12} />}{nodeRun.error.retryable ? 'Retryable error' : 'Not safe to retry'}</span>{nodeRun.error.retryable && <button className="button button-outline button-xs" onClick={onRetry}><RefreshCw size={12} />Retry node</button>}</div></div>}{nodeRun.usage && <div className="usage-detail"><div className="usage-detail-heading"><Sparkles size={13} /><strong>Model usage</strong></div><div><span>Provider / model</span><strong>{nodeRun.usage.provider} · {nodeRun.usage.model}</strong></div><div><span>Input tokens</span><strong>{nodeRun.usage.input_tokens?.toLocaleString() ?? '—'}</strong></div><div><span>Output tokens</span><strong>{nodeRun.usage.output_tokens?.toLocaleString() ?? '—'}</strong></div><div><span>Estimated cost</span><strong>{formatCost(nodeRun.usage.estimated_cost_usd)}</strong></div></div>}</div>;
}

function WorkflowsPage({ workflows, onOpen, onCreate, onRefresh }: { workflows: WorkflowSummary[]; onOpen: (id: string) => void; onCreate: () => void; onRefresh: () => void }) {
  const [filter, setFilter] = useState('');
  const filtered = workflows.filter((workflow) => `${workflow.name} ${workflow.description}`.toLowerCase().includes(filter.toLowerCase()));
  return <div className="content-page"><div className="page-heading-row"><div><span className="eyebrow">WORKSPACE</span><h1>Workflows</h1><p>Build, test and observe AI workflows in one place.</p></div><div className="page-heading-actions"><button className="button button-outline" onClick={onRefresh}><RefreshCw size={15} />Refresh</button><button className="button button-primary" onClick={onCreate}><Plus size={16} />New workflow</button></div></div><div className="page-stats-grid"><div className="page-stat-card"><div className="page-stat-icon violet"><Network size={17} /></div><span>Total workflows</span><strong>{workflows.length}</strong><small>Across your workspace</small></div><div className="page-stat-card"><div className="page-stat-icon green"><Rocket size={17} /></div><span>Published</span><strong>{workflows.filter((item) => item.status === 'published').length}</strong><small>Ready for production</small></div><div className="page-stat-card"><div className="page-stat-icon amber"><Activity size={17} /></div><span>Recent failures</span><strong>{workflows.filter((item) => item.last_run_status === 'failed').length}</strong><small>Need investigation</small></div><div className="page-stat-card"><div className="page-stat-icon blue"><Clock3 size={17} /></div><span>Last updated</span><strong>{workflows[0] ? formatRelative(workflows[0].updated_at) : '—'}</strong><small>Most recent changes</small></div></div><div className="table-card"><div className="table-card-toolbar"><div className="table-search"><Search size={15} /><input placeholder="Search workflows…" value={filter} onChange={(event) => setFilter(event.target.value)} /></div><button className="button button-ghost button-sm"><ListFilter size={14} />Filter <ChevronDown size={13} /></button></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>WORKFLOW</th><th>STATUS</th><th>NODES</th><th>LAST RUN</th><th>LAST MODIFIED</th><th /></tr></thead><tbody>{filtered.map((workflow) => <tr key={workflow.id} onClick={() => onOpen(workflow.id)} className="clickable-row"><td><div className="workflow-table-name"><span className="workflow-row-icon"><Network size={16} /></span><span><strong>{workflow.name}</strong><small>{workflow.description}</small></span></div></td><td><span className={`draft-badge ${workflow.status}`}>{workflow.status === 'published' ? <BadgeCheck size={12} /> : <span className="draft-dot" />}{workflow.status === 'published' ? `v${workflow.published_version}` : 'Draft'}</span></td><td>{workflow.node_count}</td><td>{workflow.last_run_status ? <StatusPill status={workflow.last_run_status} /> : <span className="muted-cell">Never run</span>}</td><td>{formatRelative(workflow.updated_at)}</td><td><button className="icon-button compact" onClick={(event) => { event.stopPropagation(); onOpen(workflow.id); }}><ArrowRight size={15} /></button></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="page-empty"><Search size={23} /><strong>No workflows found</strong><p>Try a different search term or create a new workflow.</p></div>}</div></div></div>;
}

function RunsPage({ runs, onOpen, onRefresh, onCancel }: { runs: ExecutionSummary[]; onOpen: (id: string) => void; onRefresh: () => void; onCancel: (id: string) => void }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const filtered = runs.filter((run) => (statusFilter === 'all' || run.status === statusFilter) && `${run.workflow_name} ${run.id} ${run.error_message ?? ''}`.toLowerCase().includes(searchFilter.toLowerCase()));
  return <div className="content-page"><div className="page-heading-row"><div><span className="eyebrow">OBSERVABILITY</span><h1>Runs & traces</h1><p>Investigate each execution with node-level input, output and diagnostics.</p></div><div className="page-heading-actions"><button className="button button-outline" onClick={onRefresh}><RefreshCw size={15} />Refresh</button></div></div><div className="run-summary-strip"><div><span className="summary-strip-icon green"><CheckCircle2 size={16} /></span><span>Successful</span><strong>{runs.filter((run) => run.status === 'succeeded').length}</strong></div><div><span className="summary-strip-icon red"><XCircle size={16} /></span><span>Failed</span><strong>{runs.filter((run) => run.status === 'failed').length}</strong></div><div><span className="summary-strip-icon blue"><Activity size={16} /></span><span>Running</span><strong>{runs.filter((run) => run.status === 'running' || run.status === 'queued').length}</strong></div><div><span className="summary-strip-icon violet"><Zap size={16} /></span><span>Total tokens</span><strong>{runs.reduce((sum, run) => sum + (run.total_tokens ?? 0), 0).toLocaleString()}</strong></div></div><div className="table-card"><div className="table-card-toolbar"><div className="table-search"><Search size={15} /><input placeholder="Search runs, workflows or errors…" value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} /></div><div className="toolbar-filters"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="running">Running</option><option value="queued">Queued</option><option value="cancelled">Cancelled</option></select></div></div><div className="data-table-wrap"><table className="data-table runs-table"><thead><tr><th>EXECUTION</th><th>WORKFLOW</th><th>STATUS</th><th>DURATION</th><th>TOKENS / COST</th><th>STARTED</th><th /></tr></thead><tbody>{filtered.map((run) => <tr className="clickable-row" key={run.id} onClick={() => onOpen(run.id)}><td><div className="run-id-cell"><span className={`run-status-icon ${run.status}`}>{statusIcon(run.status, 14)}</span><span><strong>{run.id.slice(0, 18)}</strong><small>{run.trigger} trigger · v{run.workflow_version ?? 'draft'}</small></span></div></td><td>{run.workflow_name}</td><td><StatusPill status={run.status} />{run.error_message && <div className="run-error-preview">{run.error_message}</div>}</td><td>{formatDuration(run.duration_ms)}</td><td><strong>{(run.total_tokens ?? 0).toLocaleString()}</strong><small className="table-subvalue">{formatCost(run.estimated_cost_usd)}</small></td><td>{formatRelative(run.created_at)}</td><td><div className="row-actions"><button className="icon-button compact" onClick={(event) => { event.stopPropagation(); onOpen(run.id); }} title="Open trace"><ArrowUpRight size={14} /></button>{['running', 'queued'].includes(run.status) && <button className="icon-button compact danger-icon" onClick={(event) => { event.stopPropagation(); onCancel(run.id); }} title="Cancel execution"><Square size={13} /></button>}</div></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="page-empty"><Activity size={23} /><strong>No executions found</strong><p>Run a workflow to see its trace here.</p></div>}</div></div><div className="hint-banner"><div><div className="hint-banner-icon"><Sparkles size={17} /></div><div><strong>Made for debugging, not just monitoring</strong><p>Open any run to inspect every node's input/output snapshots, retries, provider usage, stack trace and chronological events.</p></div></div><button onClick={() => runs[0] && onOpen(runs[0].id)}>Open latest trace <ArrowRight size={14} /></button></div></div>;
}

function ToolsPage({ tools }: { tools: ToolDefinition[] }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const filtered = tools.filter((tool) => (filter === 'all' || tool.category === filter) && `${tool.name} ${tool.description}`.toLowerCase().includes(search.toLowerCase()));
  const categories = ['all', ...new Set(tools.map((tool) => tool.category))];
  const iconFor = (icon: string) => icon === 'database' ? <Database size={18} /> : icon === 'globe' ? <Globe size={18} /> : icon === 'book' ? <BookOpen size={18} /> : icon === 'chart' ? <Gauge size={18} /> : icon === 'message' ? <Activity size={18} /> : <Search size={18} />;
  return <div className="content-page"><div className="page-heading-row"><div><span className="eyebrow">TOOL REGISTRY</span><h1>Tools & integrations</h1><p>Manage the actions that AI agents can request during execution.</p></div><button className="button button-primary" onClick={() => window.dispatchEvent(new CustomEvent('agentdesk-toast', { detail: { message: 'Custom tool registration is planned after the MVP.', type: 'info' } }))}><Plus size={15} />Register tool</button></div><div className="tools-page-toolbar"><div className="table-search"><Search size={15} /><input placeholder="Search tools…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="tool-filters">{categories.map((category) => <button key={category} className={filter === category ? 'active' : ''} onClick={() => setFilter(category)}>{category === 'all' ? 'All tools' : category}</button>)}</div></div><div className="tools-grid">{filtered.map((tool) => <div className="tool-card" key={tool.id}><div className="tool-card-top"><div className="tool-card-icon">{iconFor(tool.icon)}</div><span className={`tool-availability ${tool.status}`}>{tool.status === 'available' ? <><span />Available</> : 'Coming soon'}</span></div><div className="tool-card-title"><h3>{tool.name}</h3><span className="tool-kind-tag">{tool.kind}</span></div><p>{tool.description}</p><div className="tool-schema-preview"><span>INPUT SCHEMA</span><code>{Object.keys(tool.input_schema).join(' · ') || 'No input'}</code></div><div className="tool-card-footer"><span>{tool.category}</span><button className="button button-ghost button-xs" onClick={() => window.dispatchEvent(new CustomEvent('agentdesk-toast', { detail: { message: `${tool.name}: schema editor will be connected to the tool registry endpoint.`, type: 'info' } }))}>Configure <ChevronRight size={13} /></button></div></div>)}</div></div>;
}

function createTemplateGraph(templateName: string): WorkflowGraph {
  if (templateName === 'Error Analyst') return createSeedGraph();
  const specs: { id: string; kind: NodeKind; title: string; subtitle: string; config: Record<string, unknown> }[] = templateName === 'Support Triage'
    ? [
        { id: 'input_ticket', kind: 'input', title: 'Incoming ticket', subtitle: 'Input · JSON payload', config: { fields: 'ticket_id, subject, message, priority' } },
        { id: 'agent_triage', kind: 'agent', title: 'Ticket triage', subtitle: 'Agent · GPT-4.1 mini', config: { provider: 'OpenAI', model: 'gpt-4.1-mini', max_iterations: 3, system_prompt: 'Classify the support ticket, identify urgency, and use only supplied context. Do not invent facts.' } },
        { id: 'llm_reply', kind: 'llm', title: 'Draft response', subtitle: 'LLM · GPT-4.1 mini', config: { provider: 'OpenAI', model: 'gpt-4.1-mini', temperature: 0.3, max_output_tokens: 800, prompt: 'Draft a concise helpful support response. Return the category and suggested response as JSON.' } },
        { id: 'output_ticket', kind: 'output', title: 'Triage result', subtitle: 'Output · JSON', config: { output_key: 'triage', format: 'json' } },
      ]
    : [
        { id: 'input_document', kind: 'input', title: 'Document input', subtitle: 'Input · JSON payload', config: { fields: 'document_text, target_schema' } },
        { id: 'llm_extract', kind: 'llm', title: 'Extract fields', subtitle: 'LLM · GPT-4.1 mini', config: { provider: 'OpenAI', model: 'gpt-4.1-mini', temperature: 0, max_output_tokens: 1600, prompt: 'Extract only fields supported by the document. Return valid JSON matching the requested schema; use null for missing values.' } },
        { id: 'output_document', kind: 'output', title: 'Structured result', subtitle: 'Output · JSON', config: { output_key: 'extracted', format: 'json' } },
      ];
  const nodes: WorkflowNode[] = specs.map((spec, index) => ({
    id: spec.id, type: 'workflowNode', position: { x: 120 + index * 280, y: 190 },
    data: { kind: spec.kind, title: spec.title, subtitle: spec.subtitle, description: `Template node for ${templateName}.`, config: spec.config, status: 'idle' },
  }));
  const edges: WorkflowEdge[] = specs.slice(0, -1).map((spec, index) => ({
    id: `edge_${spec.id}_${specs[index + 1].id}`, source: spec.id, target: specs[index + 1].id, type: 'smoothstep',
  }));
  return { schema_version: 1, nodes, edges };
}

function TemplatesPage({ onUse }: { onUse: (templateName: string) => void }) {
  const templates = [
    { title: 'Error Analyst', category: 'Observability', description: 'Investigate service logs and produce an incident report.', icon: Activity, nodes: 6, tone: 'violet' },
    { title: 'Support Triage', category: 'Customer support', description: 'Classify an incoming ticket and draft a grounded response.', icon: BookOpen, nodes: 5, tone: 'blue' },
    { title: 'Document Extractor', category: 'Data extraction', description: 'Extract structured fields from a document using JSON output.', icon: FileCode2, nodes: 4, tone: 'green' },
  ];
  return <div className="content-page"><div className="page-heading-row"><div><span className="eyebrow">GET STARTED</span><h1>Workflow templates</h1><p>Start from a working pattern, then customize it for your use case.</p></div></div><div className="template-grid">{templates.map((template) => { const Icon = template.icon; return <div className="template-card" key={template.title}><div className={`template-icon tone-${template.tone}`}><Icon size={21} /></div><div className="template-category">{template.category}</div><h3>{template.title}</h3><p>{template.description}</p><div className="template-card-meta"><span><Network size={13} />{template.nodes} nodes</span><span><ShieldCheck size={13} />Debug-ready</span></div><button className="button button-outline" onClick={() => onUse(template.title)}>Use template <ArrowRight size={14} /></button></div>; })}</div></div>;
}

function SettingsPage() {
  const [traceSnapshots, setTraceSnapshots] = useState(true);
  const [rawTraceback, setRawTraceback] = useState(true);
  const [retention, setRetention] = useState('30 days');
  const [budget, setBudget] = useState('2.00');
  return <div className="content-page"><div className="page-heading-row"><div><span className="eyebrow">WORKSPACE</span><h1>Settings</h1><p>Configure safe defaults for workflow execution and debugging.</p></div><button className="button button-primary" onClick={() => window.dispatchEvent(new CustomEvent('agentdesk-toast', { detail: { message: 'Settings are local UI placeholders until the backend settings endpoint is connected.', type: 'info' } }))}><Check size={15} />Save settings</button></div><div className="settings-layout"><div className="settings-nav"><button className="active"><Settings2 size={15} />General</button><button><ShieldCheck size={15} />Security & privacy</button><button><Gauge size={15} />Execution limits</button><button><CreditCard size={15} />Usage & billing</button></div><div className="settings-content"><section className="settings-section"><div className="settings-section-heading"><div><h3>Execution defaults</h3><p>Limits applied to new workflow runs unless overridden.</p></div><span className="settings-section-icon"><Activity size={17} /></span></div><label className="settings-field"><span><strong>Default execution budget</strong><small>Maximum estimated model cost per run.</small></span><div className="input-with-prefix"><span>$</span><input type="number" value={budget} min="0.01" step="0.25" onChange={(event) => setBudget(event.target.value)} /></div></label><label className="settings-field"><span><strong>Trace retention</strong><small>How long run details remain available.</small></span><div className="select-wrap compact-select"><select value={retention} onChange={(event) => setRetention(event.target.value)}><option>7 days</option><option>30 days</option><option>90 days</option></select><ChevronDown size={13} /></div></label><label className="settings-field"><span><strong>Capture node snapshots</strong><small>Record masked node inputs and outputs for debugging.</small></span><button className={`toggle-switch ${traceSnapshots ? 'on' : ''}`} onClick={() => setTraceSnapshots((value) => !value)} aria-label="Toggle node snapshots"><span /></button></label><label className="settings-field"><span><strong>Store developer tracebacks</strong><small>Keep safe internal stack traces for failed nodes.</small></span><button className={`toggle-switch ${rawTraceback ? 'on' : ''}`} onClick={() => setRawTraceback((value) => !value)} aria-label="Toggle tracebacks"><span /></button></label></section><section className="settings-section"><div className="settings-section-heading"><div><h3>Runtime safety</h3><p>Guardrails that prevent runaway execution.</p></div><span className="settings-section-icon green"><ShieldCheck size={17} /></span></div><div className="safety-setting"><div className="safety-setting-icon"><Clock3 size={16} /></div><div><strong>Node timeout</strong><small>Default maximum duration for an individual node.</small></div><span className="safety-value">30 seconds</span></div><div className="safety-setting"><div className="safety-setting-icon"><RefreshCw size={16} /></div><div><strong>Automatic retries</strong><small>Retry transient failures only, with exponential backoff.</small></div><span className="safety-value">2 attempts</span></div><div className="safety-setting"><div className="safety-setting-icon"><Network size={16} /></div><div><strong>Agent iteration limit</strong><small>Maximum tool-calling loops within a single agent node.</small></div><span className="safety-value">8 iterations</span></div></section><div className="settings-note"><ShieldCheck size={16} /><span><strong>Safe by default.</strong> Secrets should never be stored in workflow JSON. Reference credentials by ID and redact sensitive fields before saving trace snapshots.</span></div></div></div></div>;
}

export default function App() {
  useEffect(() => {
    const handleToast = (event: Event) => {
      const custom = event as CustomEvent<{ message: string; type?: ToastType }>;
      const node = document.createElement('div');
      node.className = `transient-toast toast-${custom.detail.type ?? 'info'}`;
      node.textContent = custom.detail.message;
      document.body.appendChild(node);
      window.setTimeout(() => node.remove(), 3000);
    };
    window.addEventListener('agentdesk-toast', handleToast);
    return () => window.removeEventListener('agentdesk-toast', handleToast);
  }, []);
  return <ReactFlowProvider><AppInner /></ReactFlowProvider>;
}
