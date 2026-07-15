import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import * as Select from '@radix-ui/react-select';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as RadioGroup from '@radix-ui/react-radio-group';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { DayPicker } from 'react-day-picker';
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Archive, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Circle,
  Clock3, Columns3, Folder, Grid2X2, Inbox, List, ListTodo, Plus,
  RefreshCw, Search, SlidersHorizontal, Tag, X
} from 'lucide-react';
import './styles.css';

const config = window.TODO_CONFIG || {};
const API_ROOT = (config.supabaseUrl || '').replace(/\/$/, '').includes('/rest/v1')
  ? `${(config.supabaseUrl || '').replace(/\/$/, '')}/`
  : `${(config.supabaseUrl || '').replace(/\/$/, '')}/rest/v1/`;
const STATUS_COLUMNS = [
  { key: '收件箱', label: '待规划', tone: 'plan' },
  { key: '待进行', label: '待办', tone: 'todo' },
  { key: '进行中', label: '进行中', tone: 'doing' },
  { key: '已完成', label: '已完成', tone: 'done' },
  { key: '阻塞', label: '已阻塞', tone: 'blocked' },
  { key: '已取消', label: '已取消', tone: 'cancelled' }
];
const STATUS_OPTIONS = STATUS_COLUMNS.map((item) => item.key);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const dateOnly = (value) => value?.slice(0, 10) || '';
const active = (task) => !task.archived_at && !['已完成', '已取消'].includes(task.status);
const displayStatus = (status) => STATUS_COLUMNS.find((item) => item.key === status)?.label || status;

async function api(path, options = {}) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('尚未配置 Supabase 连接信息');
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: { apikey: config.supabaseAnonKey, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error((await response.text()) || '请求失败');
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [view, setView] = useState('status');
  const [viewMode, setViewMode] = useState('board');
  const [selected, setSelected] = useState(null);
  const [projectFilter, setProjectFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(() => new Date());
  const [filters, setFilters] = useState({ status: '', priority: '', date: '', project: '', category: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [quickCreate, setQuickCreate] = useState(false);
  const [quickStatus, setQuickStatus] = useState('收件箱');
  const [quickParent, setQuickParent] = useState(null);
  const [addingProject, setAddingProject] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const flash = (message) => {
    setNotice(message);
    window.clearTimeout(window.__todoNoticeTimer);
    window.__todoNoticeTimer = window.setTimeout(() => setNotice(''), 3200);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [nextTasks, nextProjects, nextCategories] = await Promise.all([
        api('tasks?user_id=is.null&select=*&order=manual_order.desc,created_at.desc'),
        api('projects?user_id=is.null&select=*&order=created_at.asc'),
        api('categories?user_id=is.null&select=*&order=created_at.asc')
      ]);
      setTasks(nextTasks || []); setProjects(nextProjects || []); setCategories(nextCategories || []);
      setSelected((current) => current ? (nextTasks || []).find((item) => item.id === current.id) || null : null);
    } catch (error) { flash(error.message || '加载失败，请稍后重试'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const childrenByParent = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => { if (task.parent_id) map.set(task.parent_id, [...(map.get(task.parent_id) || []), task]); });
    return map;
  }, [tasks]);

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    if (task.parent_id || (projectFilter && task.project_id !== projectFilter)) return false;
    if (filters.status && task.status !== filters.status) return false;
    if (filters.project && task.project_id !== filters.project) return false;
    if (filters.category && task.category_id !== filters.category) return false;
    if (filters.priority === 'important' && !task.importance) return false;
    if (filters.priority === 'urgent' && !task.urgency) return false;
    if (filters.date === 'overdue' && !(task.due_at && dateOnly(task.due_at) < today())) return false;
    if (filters.date === 'today' && dateOnly(task.due_at) !== today() && task.scheduled_for !== today()) return false;
    const term = search.trim().toLocaleLowerCase();
    if (!term) return true;
    const project = projects.find((item) => item.id === task.project_id)?.name || '';
    const category = categories.find((item) => item.id === task.category_id)?.name || '';
    return [task.title, task.description, project, category].join(' ').toLocaleLowerCase().includes(term);
  }), [tasks, projectFilter, filters, search, projects, categories]);

  const updateTask = async (id, patch, message = '已保存') => {
    try {
      const result = await api(`tasks?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      const updated = result?.[0];
      if (updated) { setTasks((items) => items.map((item) => item.id === id ? updated : item)); setSelected((item) => item?.id === id ? updated : item); }
      if (message) flash(message);
      return updated;
    } catch (error) { flash(error.message || '保存失败'); return null; }
  };
  const deleteTask = async (task) => {
    try {
      await api(`tasks?parent_id=eq.${task.id}`, { method: 'DELETE' });
      await api(`tasks?id=eq.${task.id}`, { method: 'DELETE' });
      setTasks((items) => items.filter((item) => item.id !== task.id && item.parent_id !== task.id));
      setSelected((current) => current?.id === task.id ? null : current);
      flash('任务已删除');
      return true;
    } catch (error) { flash(error.message || '删除失败'); return false; }
  };
  const createTask = async ({ title, projectId = projectFilter, parentId = null, status = '收件箱' }) => {
    const trimmed = title.trim(); if (!trimmed) return null;
    try {
      const result = await api('tasks', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ title: trimmed, status, project_id: projectId || null, parent_id: parentId, manual_order: Date.now() }) });
      const task = result?.[0]; if (task) setTasks((items) => [task, ...items]);
      flash(parentId ? '子任务已创建' : projectId ? '已加入当前项目' : '已加入收件箱');
      return task;
    } catch (error) { flash(error.message || '创建失败，请重试'); return null; }
  };
  const createProject = async (name) => {
    if (!name.trim()) return false;
    try { const data = await api('projects', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: name.trim(), color: '#5f7eea' }) }); setProjects((items) => [...items, data[0]]); flash('项目已创建'); return true; }
    catch (error) { flash(error.message || '创建项目失败'); return false; }
  };
  const createCategory = async (name, projectId) => {
    if (!name.trim() || !projectId) return false;
    try { const data = await api('categories', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: name.trim(), project_id: projectId }) }); setCategories((items) => [...items, data[0]]); flash('分类已创建'); return true; }
    catch (error) { flash(error.message || '创建分类失败'); return false; }
  };
  const completeTask = (task) => updateTask(task.id, { status: task.status === '已完成' ? '待进行' : '已完成' }, task.status === '已完成' ? '已恢复为待办' : '已完成');
  const changeView = (next) => { setView(next); setProjectFilter(null); setSearch(''); setQuickCreate(false); setQuickParent(null); };
  const clearFilters = () => setFilters({ status: '', priority: '', date: '', project: '', category: '' });
  const hasFilters = Object.values(filters).some(Boolean) || Boolean(projectFilter);
  const titleMap = { inbox: '收件箱', today: '今日', status: '任务', quadrant: '四象限', calendar: '日历', archive: '归档', project: '项目任务' };
  const title = projectFilter ? projects.find((item) => item.id === projectFilter)?.name || '项目' : titleMap[view];
  const subtitle = projectFilter ? '任务按状态组织，支持切换看板或列表浏览' : { status: '以状态为线索，快速掌握全部任务', inbox: '快速收集、集中处理，保持主工作区清爽', today: '今天需要推进和关注的任务', quadrant: '一掐四：用位置判断轻重缓急', calendar: '按计划与截止日期查看任务', archive: '已完成、取消或归档的记录' }[view];

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><b><ListTodo size={16} strokeWidth={2.5} /></b><span>任务</span></div>
      <button className="primary sidebar-create" onClick={() => { setQuickStatus('收件箱'); setQuickCreate(true); }}><Plus size={16} />新建任务</button>
      <nav className="nav" aria-label="主导航">
        <NavButton icon={Inbox} label="收件箱" active={!projectFilter && view === 'inbox'} onClick={() => changeView('inbox')} count={tasks.filter((item) => active(item) && item.status === '收件箱' && !item.parent_id).length} />
        <NavButton icon={Columns3} label="状态视图" active={!projectFilter && view === 'status'} onClick={() => changeView('status')} />
        <NavButton icon={Clock3} label="今日" active={!projectFilter && view === 'today'} onClick={() => changeView('today')} />
        <NavButton icon={Grid2X2} label="四象限" active={!projectFilter && view === 'quadrant'} onClick={() => changeView('quadrant')} />
        <NavButton icon={CalendarDays} label="日历" active={!projectFilter && view === 'calendar'} onClick={() => changeView('calendar')} />
        <NavButton icon={Archive} label="归档" active={!projectFilter && view === 'archive'} onClick={() => changeView('archive')} />
      </nav>
      <div className="side-heading"><span>项目与分类</span><button aria-label="新建节点" onClick={() => setAddingProject(true)}><Plus size={15} /></button></div>
      <div className="project-tree">
        {projects.map((project) => <div className="tree-project" key={project.id}><button className={projectFilter === project.id ? 'project active' : 'project'} onClick={() => { setProjectFilter(project.id); setView('project'); setQuickCreate(false); }}><i style={{ background: project.color || '#5f7eea' }} /><span>{project.name}</span></button>{categories.filter((category) => category.project_id === project.id).map((category) => <button className="tree-category" key={category.id} onClick={() => { setProjectFilter(project.id); setFilters((current) => ({ ...current, category: category.id })); setView('project'); }}><Tag size={12} />{category.name}</button>)}<button className="tree-add-category" onClick={() => { setProjectFilter(project.id); setAddingCategory(true); }}><Plus size={12} />新增分类</button></div>)}
        {addingProject && <InlineName placeholder="项目名称，按 Enter 创建" onCancel={() => setAddingProject(false)} onSubmit={async (name) => { if (await createProject(name)) setAddingProject(false); }} />}
        {!projects.length && !addingProject && <p>还没有项目</p>}
      </div>
      {addingCategory && <div className="category-tree"><InlineCategory projects={projects} projectId={projectFilter} onCancel={() => setAddingCategory(false)} onSubmit={async (name, projectId) => { if (await createCategory(name, projectId)) setAddingCategory(false); }} /></div>}
    </aside>

    <main className={view === 'inbox' && !projectFilter ? 'main inbox-main' : 'main'}>
      <header className={(view === 'status' || view === 'project') ? 'topbar task-topbar' : 'topbar'}>
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="toolbar task-toolbar">
          <label className="search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务" /></label>
          <div className="filter-wrap"><button className={hasFilters ? 'toolbar-button active-filter' : 'toolbar-button'} onClick={() => setFilterOpen((open) => !open)}><SlidersHorizontal size={15} />筛选</button>{filterOpen && <FilterMenu filters={filters} setFilters={setFilters} projects={projects} categories={categories} onClear={clearFilters} onClose={() => setFilterOpen(false)} />}</div>
          {(view === 'status' || view === 'project') && <ViewSwitch mode={viewMode} setMode={setViewMode} />}
          {(view === 'status' || view === 'project') && <button className="primary task-create" onClick={() => { setQuickParent(null); setQuickStatus('待进行'); setQuickCreate(true); }}><Plus size={15} />新建任务</button>}
          <button className="icon-button" title="刷新数据" onClick={load}><RefreshCw size={16} /></button>
        </div>
      </header>
      <CreateTaskSheet open={quickCreate} initialStatus={quickStatus} projectId={projectFilter} parentTask={quickParent} projects={projects} categories={categories} onOpenChange={(open) => { setQuickCreate(open); if (!open) setQuickParent(null); }} onSubmit={async (payload) => { const created = await createTask({ title: payload.title, projectId: payload.projectId, parentId: payload.parentId, status: payload.status }); if (created && payload.description) await updateTask(created.id, { description: payload.description }, '任务已创建'); return created; }} />
      {hasFilters && <div className="filter-bar filter-summary"><strong>当前筛选</strong>{filters.status && <span>状态 · {displayStatus(filters.status)}</span>}{filters.priority && <span>优先级 · {filters.priority === 'important' ? '重要' : '紧急'}</span>}{filters.date && <span>日期 · {filters.date === 'today' ? '今天' : '已逾期'}</span>}{filters.project && <span>项目 · {projects.find((item) => item.id === filters.project)?.name}</span>}{filters.category && <span>分类 · {categories.find((item) => item.id === filters.category)?.name}</span>}<button onClick={() => { clearFilters(); setProjectFilter(null); }}>清除全部</button></div>}
      <section className="content" aria-busy={loading}>
        {loading ? <div className="empty">正在载入任务…</div> : <ViewContent view={projectFilter ? 'project' : view} mode={viewMode} tasks={visibleTasks} month={month} setMonth={setMonth} onSelect={setSelected} onComplete={completeTask} onUpdate={updateTask} onDelete={deleteTask} onCreate={createTask} childrenByParent={childrenByParent} projects={projects} categories={categories} onQuickCreate={(status, parentTask = null) => { setQuickStatus(status); setQuickParent(parentTask); setQuickCreate(true); }} />}
      </section>
    </main>

    <TaskSheet task={selected} projects={projects} categories={categories} childTasks={selected ? childrenByParent.get(selected.id) || [] : []} onClose={() => setSelected(null)} onSave={updateTask} onDelete={deleteTask} onAddChild={() => selected && (() => { setQuickParent(selected); setQuickStatus('待进行'); setQuickCreate(true); })()} />
    <nav className="mobile-nav" aria-label="移动导航"><button onClick={() => changeView('inbox')}>收件箱</button><button onClick={() => changeView('status')}>任务</button><button className="mobile-add" onClick={() => { setQuickStatus('收件箱'); setQuickCreate(true); }} aria-label="新建任务"><Plus size={22} /></button><button onClick={() => changeView('today')}>今日</button><button onClick={() => changeView('calendar')}>日历</button></nav>
    {notice && <div className="notice" role="status">{notice}</div>}
  </div>;
}

function NavButton({ icon: Glyph, label, active, onClick, count }) { return <button className={active ? 'active' : ''} onClick={onClick}><Glyph size={16} /><span>{label}</span>{count !== undefined && <small>{count}</small>}</button>; }
function InlineName({ placeholder, onCancel, onSubmit }) { const [name, setName] = useState(''); return <form className="inline-name" onSubmit={(event) => { event.preventDefault(); onSubmit(name); }}><input autoFocus value={name} placeholder={placeholder} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }} /><button type="button" onClick={onCancel}><X size={13} /></button></form>; }
function InlineCategory({ projects, projectId, onCancel, onSubmit }) { const [name, setName] = useState(''); const [project, setProject] = useState(projectId || projects[0]?.id || ''); return <form className="inline-category" onSubmit={(event) => { event.preventDefault(); onSubmit(name, project); }}><input autoFocus value={name} placeholder="分类名称" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }} /><UiSelect value={project} onValueChange={setProject} placeholder="选择项目" options={projects.map((item) => ({ value: item.id, label: item.name }))} /><button type="button" onClick={onCancel}><X size={13} /></button></form>; }

function QuickCreate({ projectId, status, projects, onCancel, onSubmit }) { const [title, setTitle] = useState(''); const [project, setProject] = useState(projectId || ''); return <form className="quick-create" onSubmit={(event) => { event.preventDefault(); onSubmit(title, project || null); }}><Plus size={18} /><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`新增${displayStatus(status)}任务，按 Enter 保存`} /><UiSelect value={project} onValueChange={setProject} placeholder="收件箱" options={[{ value: '', label: '收件箱' }, ...projects.map((item) => ({ value: item.id, label: item.name }))]} /><button type="button" className="icon-button" onClick={onCancel}><X size={16} /></button><button className="primary" type="submit">添加</button></form>; }
function CreateTaskSheet({ open, initialStatus, projectId, parentTask, projects, categories, onOpenChange, onSubmit }) { const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [project, setProject] = useState(projectId || ''); const [status, setStatus] = useState(initialStatus || '收件箱'); useEffect(() => { if (open) { setProject(projectId || parentTask?.project_id || ''); setStatus(initialStatus || '收件箱'); setTitle(''); setDescription(''); } }, [open, initialStatus, projectId, parentTask]); const create = async (event) => { event.preventDefault(); const task = await onSubmit({ title, description, projectId: project || null, parentId: parentTask?.id || null, status }); if (task) onOpenChange(false); }; return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="task-overlay" /><Dialog.Content className="create-task-sheet" aria-describedby={undefined}><div className="sheet-top"><span>{parentTask ? '新建子任务' : '新建任务'}</span><Dialog.Close className="icon-button" aria-label="关闭"><X size={17} /></Dialog.Close></div><Dialog.Title className="sr-only">{parentTask ? '新建子任务' : '新建任务'}</Dialog.Title><form onSubmit={create}>{parentTask && <div className="parent-task-note"><span>父任务</span><strong>{parentTask.title}</strong></div>}<label className="create-title"><span>任务名称</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：整理周会纪要" /></label><label className="create-description"><span>说明</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="补充背景、下一步或备注…" rows="4" /></label><div className="create-field"><span>状态</span><StatusSwitch value={status} onValueChange={setStatus} /></div><div className="create-field"><span>归属项目</span><UiSelect value={project} onValueChange={setProject} placeholder="收件箱" options={[{ value: '', label: '收件箱' }, ...projects.map((item) => ({ value: item.id, label: item.name }))]} /></div><div className="create-actions"><Dialog.Close className="secondary" type="button">取消</Dialog.Close><button className="primary" type="submit" disabled={!title.trim()}>创建任务</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>; }

function FilterMenu({ filters, setFilters, projects, categories, onClear, onClose }) {
  const patch = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return <Popover.Root open onOpenChange={(open) => !open && onClose()}><Popover.Anchor asChild><span className="filter-anchor" /></Popover.Anchor><Popover.Portal><Popover.Content className="filter-menu" sideOffset={8} align="end" onOpenAutoFocus={(event) => event.preventDefault()}><div className="filter-menu-head"><strong>筛选任务</strong><button onClick={onClear}>清除</button></div><FilterSelect label="状态" value={filters.status} onChange={(value) => patch('status', value)} options={[{ value: '', label: '全部状态' }, ...STATUS_COLUMNS.map((item) => ({ value: item.key, label: item.label }))]} /><FilterSelect label="优先级" value={filters.priority} onChange={(value) => patch('priority', value)} options={[{ value: '', label: '不限' }, { value: 'important', label: '重要' }, { value: 'urgent', label: '紧急' }]} /><FilterSelect label="日期" value={filters.date} onChange={(value) => patch('date', value)} options={[{ value: '', label: '不限' }, { value: 'overdue', label: '已逾期' }, { value: 'today', label: '今天' }]} /><FilterSelect label="项目" value={filters.project} onChange={(value) => patch('project', value)} options={[{ value: '', label: '全部项目' }, ...projects.map((item) => ({ value: item.id, label: item.name }))]} /><FilterSelect label="标签 / 分类" value={filters.category} onChange={(value) => patch('category', value)} options={[{ value: '', label: '全部分类' }, ...categories.map((item) => ({ value: item.id, label: item.name }))]} /><button className="filter-done" onClick={onClose}>完成</button></Popover.Content></Popover.Portal></Popover.Root>;
}
function FilterSelect({ label, value, onChange, options }) { return <div className="filter-select"><span>{label}</span><UiSelect value={value} onValueChange={onChange} placeholder="不限" options={options} /></div>; }
function UiSelect({ value, onValueChange, placeholder, options, className = '' }) { return <Select.Root value={value || undefined} onValueChange={(next) => onValueChange(next === '__empty' ? '' : next)}><Select.Trigger className={`ui-select ${className}`}><Select.Value placeholder={placeholder} /><ChevronDown size={14} /></Select.Trigger><Select.Portal><Select.Content className="ui-select-content" position="popper" sideOffset={5}><Select.Viewport>{options.map((option) => <Select.Item className="ui-select-item" key={option.value || '__empty'} value={option.value || '__empty'}><Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator><Check size={13} /></Select.ItemIndicator></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>; }
function ViewSwitch({ mode, setMode }) { return <div className="view-switch"><button className={mode === 'board' ? 'selected' : ''} onClick={() => setMode('board')}><Columns3 size={15} />看板</button><button className={mode === 'list' ? 'selected' : ''} onClick={() => setMode('list')}><List size={15} />列表</button></div>; }

function ViewContent({ view, mode, tasks, month, setMonth, onSelect, onComplete, onUpdate, onDelete, onCreate, childrenByParent, projects, categories, onQuickCreate }) {
  const root = tasks.filter((task) => !task.parent_id);
  if (view === 'inbox') return <InboxWorkspace tasks={root.filter((task) => active(task) && task.status === '收件箱')} projects={projects} categories={categories} onSelect={onSelect} onComplete={onComplete} onSave={onUpdate} onDelete={onDelete} onAddChild={(task) => onQuickCreate('待进行', task)} childrenByParent={childrenByParent} />;
  if (view === 'archive') return <TaskList tasks={root.filter((task) => task.archived_at || ['已完成', '已取消'].includes(task.status))} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} childrenByParent={childrenByParent} projects={projects} categories={categories} empty="还没有归档记录" />;
  if (view === 'quadrant') return <Quadrants tasks={root.filter((task) => active(task) && task.status !== '阻塞')} onSelect={onSelect} childrenByParent={childrenByParent} />;
  if (view === 'calendar') return <Calendar tasks={root.filter(active)} month={month} setMonth={setMonth} onSelect={onSelect} />;
  if (view === 'status' || view === 'project') return mode === 'board' ? <StatusBoard tasks={root} projects={projects} categories={categories} childrenByParent={childrenByParent} onSelect={onSelect} onQuickCreate={onQuickCreate} /> : <StatusList tasks={root} projects={projects} categories={categories} childrenByParent={childrenByParent} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} />;
  const date = today(); const working = root.filter((task) => active(task) && task.status !== '阻塞');
  const late = working.filter((task) => task.due_at && dateOnly(task.due_at) <= date);
  const inProgress = working.filter((task) => task.status === '进行中' && !late.includes(task));
  const planned = working.filter((task) => task.scheduled_for === date && !late.includes(task) && !inProgress.includes(task));
  const future = working.filter((task) => task.due_at && dateOnly(task.due_at) > date && !late.includes(task) && !inProgress.includes(task) && !planned.includes(task));
  return <TodayWorkspace late={late} inProgress={inProgress} planned={planned} future={future} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} childrenByParent={childrenByParent} projects={projects} categories={categories} />;
}
function TodayWorkspace({ late, inProgress, planned, future, ...props }) { const groups = [{ title: '需要处理', hint: '逾期 / 今天截止', tasks: late, tone: 'attention' }, { title: '正在推进', hint: '进行中的任务', tasks: inProgress, tone: 'progress' }, { title: '今日计划', hint: '今天安排的任务', tasks: planned, tone: 'plan' }]; return <div className="today-workspace"><div className="today-summary">{groups.map((group) => <div key={group.title} className={`today-metric ${group.tone}`}><span>{group.title}</span><strong>{group.tasks.length}</strong><small>{group.hint}</small></div>)}</div><div className="today-lanes">{groups.map((group) => <section key={group.title} className={`today-lane ${group.tone}`}><header><div><strong>{group.title}</strong><span>{group.hint}</span></div><small>{group.tasks.length}</small></header><TaskList tasks={group.tasks} {...props} empty="暂无任务" /></section>)}</div>{future.length > 0 && <section className="today-upcoming"><header><strong>接下来截止</strong><span>未来有明确截止时间的任务</span></header><TaskList tasks={future.slice(0, 6)} {...props} /></section>}</div>; }
function Section({ title, tasks, ...props }) { return <section className="section"><div className="section-head"><h2>{title}</h2><span>{tasks.length} 项</span></div><TaskList tasks={tasks} {...props} /></section>; }
function TaskList({ tasks, onSelect, onComplete, onUpdate, childrenByParent, projects = [], categories = [], empty = '暂无任务', tree = false }) { return <div className={tree ? 'task-list task-tree' : 'task-list'}>{tasks.length ? tasks.map((task) => tree ? <TaskTreeNode key={task.id} task={task} depth={0} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} childrenByParent={childrenByParent} projects={projects} categories={categories} /> : <TaskRow key={task.id} task={task} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} children={childrenByParent.get(task.id) || []} project={projects.find((item) => item.id === task.project_id)} category={categories.find((item) => item.id === task.category_id)} />) : <div className="empty">{empty}</div>}</div>; }
function TaskTreeNode({ task, depth, onSelect, onComplete, onUpdate, childrenByParent, projects, categories }) { const children = childrenByParent.get(task.id) || []; const [open, setOpen] = useState(true); return <div className="tree-node" style={{ '--depth': depth }}><div className="tree-node-line">{children.length ? <button className="tree-toggle" aria-label={open ? '收起子任务' : '展开子任务'} onClick={() => setOpen((value) => !value)}><ChevronRight className={open ? 'open' : ''} size={14} /></button> : <span className="tree-spacer" />}<TaskRow task={task} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} children={children} project={projects.find((item) => item.id === task.project_id)} category={categories.find((item) => item.id === task.category_id)} /></div>{open && children.map((child) => <TaskTreeNode key={child.id} task={child} depth={depth + 1} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} childrenByParent={childrenByParent} projects={projects} categories={categories} />)}</div>; }
function TaskRow({ task, onSelect, onComplete, onUpdate, children, project, category }) {
  const due = dateOnly(task.due_at); const isLate = due && due < today();
  return <article className="task-row" tabIndex="0" onClick={() => onSelect(task)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(task); } }}><button className={task.status === '已完成' ? 'check done' : 'check'} aria-label={`${task.status === '已完成' ? '恢复' : '完成'}：${task.title}`} onClick={(event) => { event.stopPropagation(); onComplete(task); }}>{task.status === '已完成' && <Check size={12} strokeWidth={3} />}</button><div className="task-copy"><strong>{task.title}</strong><div className="task-meta"><span onClick={(event) => event.stopPropagation()}><StatusSwitch value={task.status} onValueChange={(status) => onUpdate(task.id, { status }, `已更新为${displayStatus(status)}`)} /></span>{project && <span className="row-project"><i style={{ background: project.color || '#8290aa' }} />{project.name}</span>}{category && <span className="row-category">#{category.name}</span>}{children.length > 0 && <span className="child-count"><Circle size={10} />{children.filter((item) => item.status === '已完成').length}/{children.length}</span>}</div></div><div className={isLate ? 'due overdue' : 'due'}>{isLate ? '已逾期' : due === today() ? '今天截止' : due ? `${due.slice(5).replace('-', '/')} 截止` : ''}</div></article>;
}

function StatusBoard({ tasks, projects, categories, childrenByParent, onSelect, onQuickCreate }) { return <div className="status-board">{STATUS_COLUMNS.map((column) => { const entries = tasks.filter((task) => task.status === column.key); return <section className={`board-column tone-${column.tone}`} key={column.key}><header><div><span className="status-dot" /><strong>{column.label}</strong><small>{entries.length}</small></div><button aria-label={`新建${column.label}任务`} onClick={() => onQuickCreate(column.key)}><Plus size={15} /></button></header><div className="board-cards">{entries.length ? entries.map((task) => <BoardCard key={task.id} task={task} project={projects.find((item) => item.id === task.project_id)} category={categories.find((item) => item.id === task.category_id)} children={childrenByParent.get(task.id) || []} onClick={() => onSelect(task)} />) : <button className="board-empty" onClick={() => onQuickCreate(column.key)}>+ 添加任务</button>}</div></section>; })}</div>; }
function BoardCard({ task, project, category, children, onClick }) { const due = dateOnly(task.due_at); return <button className="board-card" onClick={onClick}><strong>{task.title}</strong><div className="card-meta">{project && <span><i style={{ background: project.color || '#8290aa' }} />{project.name}</span>}{category && <span>#{category.name}</span>}</div><footer>{children.length > 0 && <span className="card-children"><Circle size={10} />{children.length}</span>}{due && <time className={due < today() ? 'overdue' : ''}>{due < today() ? '逾期' : due === today() ? '今天' : due.slice(5).replace('-', '/')}</time>}</footer></button>; }
function StatusList({ tasks, projects, categories, childrenByParent, onSelect, onComplete, onUpdate }) { return <div className="status-list">{STATUS_COLUMNS.map((column) => { const entries = tasks.filter((task) => task.status === column.key); return <Collapsible.Root key={column.key} className="status-group" defaultOpen><Collapsible.Trigger className="status-summary"><ChevronRight size={15} /><span className={`status-dot tone-${column.tone}`} /><strong>{column.label}</strong><small>{entries.length}</small></Collapsible.Trigger><Collapsible.Content><TaskList tree tasks={entries} projects={projects} categories={categories} childrenByParent={childrenByParent} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} empty="暂无任务" /></Collapsible.Content></Collapsible.Root>; })}</div>; }

function InboxWorkspace({ tasks, projects, categories, childrenByParent, onSelect, onComplete, onSave, onDelete, onAddChild }) {
  const [focused, setFocused] = useState(() => tasks[0] || null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  useEffect(() => setFocused((current) => tasks.find((task) => task.id === current?.id) || tasks[0] || null), [tasks]);
  useEffect(() => { if (!focused) setMobileDetailOpen(false); }, [focused]);
  const openTask = (task) => { setFocused(task); setMobileDetailOpen(true); };
  return <div className={mobileDetailOpen ? 'inbox-workspace mobile-detail-open' : 'inbox-workspace'}><aside className="inbox-list"><header><strong>收件箱</strong><span>{tasks.length} 项待处理</span></header>{tasks.length ? tasks.map((task) => <button key={task.id} className={focused?.id === task.id ? 'inbox-item selected' : 'inbox-item'} onClick={() => openTask(task)}><span className="inbox-item-icon"><Inbox size={14} /></span><div><strong>{task.title}</strong><small>{projects.find((item) => item.id === task.project_id)?.name || '未分类'} · {displayStatus(task.status)}</small></div><ChevronRight className="inbox-item-arrow" size={16} /></button>) : <div className="empty">收件箱已经清空</div>}</aside><section className="inbox-preview"><header className="inbox-mobile-detail-head"><button onClick={() => setMobileDetailOpen(false)} aria-label="返回收件箱"><ChevronLeft size={19} />收件箱</button><strong>任务详情</strong><span /></header>{focused ? <TaskEditor key={focused.id} task={focused} projects={projects} categories={categories} childTasks={childrenByParent.get(focused.id) || []} onSave={onSave} onComplete={onComplete} onDelete={onDelete} onAddChild={() => onAddChild(focused)} autoSave inbox /> : <div className="inbox-empty"><Inbox size={28} /><strong>收件箱已经清空</strong><span>记录新任务后会出现在这里。</span></div>}</section></div>;
}
function InboxEditor({ task, projects, categories, childCount, onSave, onOpen, onComplete }) {
  const [draft, setDraft] = useState({ ...task }); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(true);
  const set = (key, value) => { setSaved(false); setDraft((current) => ({ ...current, [key]: value })); };
  useEffect(() => { if (saved) return undefined; const timer = window.setTimeout(async () => { setSaving(true); const payload = { title: draft.title.trim() || task.title, description: draft.description || '', status: draft.status, project_id: draft.project_id || null, category_id: draft.category_id || null }; const updated = await onSave(task.id, payload, ''); if (updated) { setDraft(updated); setSaved(true); } setSaving(false); }, 650); return () => window.clearTimeout(timer); }, [draft, onSave, saved, task.id, task.title]);
  return <><div className="preview-crumb"><Inbox size={14} />收件箱 / 待处理 <span className={saving ? 'saving-state saving' : 'saving-state'}>{saving ? '正在保存' : saved ? '已保存' : '等待保存'}</span></div><div className="preview-head editor"><div><StatusSwitch value={draft.status} onValueChange={(value) => set('status', value)} /><input className="inbox-title-input" value={draft.title || ''} onChange={(event) => set('title', event.target.value)} aria-label="任务标题" /><textarea className="inbox-description-input" value={draft.description || ''} onChange={(event) => set('description', event.target.value)} placeholder="添加说明、想法或下一步…" rows="6" /></div></div><div className="preview-properties editor-properties"><TreeSelect projects={projects} categories={categories} projectId={draft.project_id} categoryId={draft.category_id} onValueChange={({ projectId, categoryId }) => { setSaved(false); setDraft((current) => ({ ...current, project_id: projectId, category_id: categoryId })); }} /><span>子任务 <b>{childCount} 项</b></span></div><div className="preview-actions"><button className="primary" onClick={() => onComplete(task)}><Check size={15} />完成</button></div></>;
}

function Quadrants({ tasks, onSelect, childrenByParent }) { const data = tasks.map((task, index) => ({ task, x: (task.urgency ? 68 : 22) + (index % 4) * 5, y: (task.importance ? 74 : 22) + (Math.floor(index / 4) % 4) * 5, parent: (childrenByParent.get(task.id) || []).length > 0 })); return <section className="quadrant-chart"><div className="quad-axis quad-axis-y">重要程度 ↑</div><div className="quad-axis quad-axis-x">不紧急 ← 紧急程度 →</div><div className="quad-label q-label-urgent">重要且紧急</div><div className="quad-label q-label-plan">重要但不紧急</div><div className="quad-label q-label-delegate">不重要但紧急</div><div className="quad-label q-label-later">不重要且不紧急</div><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 38, right: 42, bottom: 42, left: 42 }}><CartesianGrid stroke="#e8e8e5" strokeDasharray="0" /><ReferenceLine x={50} stroke="#aeb6c0" strokeWidth={1.4} /><ReferenceLine y={50} stroke="#aeb6c0" strokeWidth={1.4} /><XAxis type="number" dataKey="x" domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} tickFormatter={(value) => value === 0 ? '不紧急' : value === 100 ? '紧急' : ''} /><YAxis type="number" dataKey="y" domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} tickFormatter={(value) => value === 0 ? '不重要' : value === 100 ? '重要' : ''} /><Tooltip cursor={false} content={({ active: isActive, payload }) => isActive && payload?.[0] ? <div className="quad-tooltip">{payload[0].payload.task.title}</div> : null} /><Scatter data={data} shape={(props) => <TaskPoint {...props} onSelect={onSelect} />} /></ScatterChart></ResponsiveContainer></section>; }
function TaskPoint({ cx, cy, payload, onSelect }) { return <circle className={payload.parent ? 'chart-task-dot parent' : 'chart-task-dot'} cx={cx} cy={cy} r={payload.parent ? 8 : 6} onClick={() => onSelect(payload.task)} />; }
function Calendar({ tasks, month, setMonth, onSelect }) { const marked = tasks.reduce((map, task) => { const key = task.scheduled_for || dateOnly(task.due_at); if (key) map[key] = [...(map[key] || []), task]; return map; }, {}); const eventDays = Object.keys(marked).map((key) => new Date(`${key}T00:00:00`)); return <section className="calendar-library"><DayPicker mode="single" month={month} onMonthChange={setMonth} showOutsideDays modifiers={{ event: eventDays }} modifiersClassNames={{ event: 'day-with-task' }} components={{ DayButton: ({ day, modifiers, ...props }) => { const key = dateOnly(day.date.toISOString()); const entries = marked[key] || []; return <button {...props} className={modifiers.event ? 'rdp-day_button day-task-button' : 'rdp-day_button'}>{day.date.getDate()}{entries.length > 0 && <span className="day-task-count">{entries.length}</span>}</button>; } }} /><aside className="calendar-agenda"><h2>本月任务</h2>{tasks.filter((task) => { const key = task.scheduled_for || dateOnly(task.due_at); return key?.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`); }).slice(0, 12).map((task) => <button key={task.id} onClick={() => onSelect(task)}><span>{dateOnly(task.scheduled_for || task.due_at).slice(5).replace('-', '/')}</span>{task.title}</button>) || <p>本月没有任务</p>}</aside></section>; }

function TaskSheet({ task, projects, categories, childTasks, onClose, onSave, onDelete, onAddChild }) { return <Dialog.Root open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>{task && <Dialog.Portal><Dialog.Overlay className="task-overlay" /><Dialog.Content className="task-sheet" aria-describedby={undefined}><div className="sheet-top"><span>任务详情</span><Dialog.Close className="icon-button" aria-label="关闭详情"><X size={17} /></Dialog.Close></div><Dialog.Title className="sr-only">编辑任务</Dialog.Title><TaskEditor key={task.id} task={task} projects={projects} categories={categories} childTasks={childTasks} onSave={onSave} onDelete={onDelete} onAddChild={onAddChild} autoSave /></Dialog.Content></Dialog.Portal>}</Dialog.Root>; }
function TaskEditor({ task, projects, categories, childTasks, onSave, onDelete, onAddChild, autoSave = false, inbox = false }) {
  const [draft, setDraft] = useState({ ...task, due_at: task.due_at ? task.due_at.slice(0, 16) : '' }); const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false);
  const set = (key, value) => { setDirty(true); setDraft((item) => ({ ...item, [key]: value })); };
  const save = async () => { setSaving(true); const payload = { title: draft.title.trim() || task.title, status: draft.status, importance: draft.importance, urgency: draft.urgency, description: draft.description || '', scheduled_for: draft.scheduled_for || null, due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null, project_id: draft.project_id || null, category_id: draft.category_id || null }; const updated = await onSave(task.id, payload, autoSave ? '' : '已保存'); if (updated) setDirty(false); setSaving(false); };
  useEffect(() => { if (!autoSave || !dirty) return undefined; const timer = window.setTimeout(save, 650); return () => window.clearTimeout(timer); }, [autoSave, dirty, draft]);
  return <div className={inbox ? 'detail inbox-detail' : 'detail'}><div className="detail-heading"><input className="detail-title" aria-label="任务名称" value={draft.title || ''} onChange={(event) => set('title', event.target.value)} /><StatusSwitch value={draft.status} onValueChange={(value) => set('status', value)} /></div><textarea className="detail-description" value={draft.description || ''} onChange={(event) => set('description', event.target.value)} placeholder="添加说明…" rows="4" /><section className="detail-section"><h3>归属</h3><TreeSelect projects={projects} categories={categories} projectId={draft.project_id} categoryId={draft.category_id} onValueChange={({ projectId, categoryId }) => { setDirty(true); setDraft((current) => ({ ...current, project_id: projectId, category_id: categoryId })); }} /></section><section className="detail-section"><h3>时间</h3><div className="property-list"><DatePickerField label="计划日期" value={draft.scheduled_for || ''} onValueChange={(value) => set('scheduled_for', value)} /><DatePickerField label="截止时间" value={draft.due_at || ''} includeTime onValueChange={(value) => set('due_at', value)} /></div></section><section className="detail-section"><h3>优先级</h3><PriorityRadio value={draft.importance && draft.urgency ? 'important-urgent' : draft.importance ? 'important' : draft.urgency ? 'urgent' : 'normal'} onValueChange={(value) => { set('importance', ['important', 'important-urgent'].includes(value)); set('urgency', ['urgent', 'important-urgent'].includes(value)); }} /></section><section className="detail-section children-section"><div className="children-head"><h3>子任务 <em>{childTasks.filter((item) => item.status === '已完成').length}/{childTasks.length}</em></h3><button onClick={onAddChild}><Plus size={14} />添加子任务</button></div>{childTasks.length ? childTasks.map((child) => <div className="child" key={child.id}><span className={child.status === '已完成' ? 'child-check done' : 'child-check'}>{child.status === '已完成' && <Check size={10} strokeWidth={3} />}</span>{child.title}</div>) : <p className="child-empty">拆成小步骤，会更容易推进。</p>}</section><div className="detail-actions"><DeleteTaskButton task={task} onDelete={onDelete} />{!autoSave && <button className="primary" onClick={save}>{saving ? '保存中…' : '保存更改'}</button>}{autoSave && <span className="autosave-note">{saving ? '正在保存…' : dirty ? '正在保存…' : '已自动保存'}</span>}</div></div>;
}
function StatusSwitch({ value, onValueChange }) { return <Popover.Root><Popover.Trigger asChild><button className={`status-badge status-${value} status-switch`}><span>{displayStatus(value)}</span><ChevronDown size={12} /></button></Popover.Trigger><Popover.Portal><Popover.Content className="status-menu" sideOffset={6} align="end">{STATUS_COLUMNS.map((item) => <button key={item.key} className={item.key === value ? 'selected' : ''} onClick={() => onValueChange(item.key)}><span className={`status-dot tone-${item.tone}`} />{item.label}{item.key === value && <Check size={13} />}</button>)}</Popover.Content></Popover.Portal></Popover.Root>; }
function PriorityRadio({ value, onValueChange }) { const choices = [{ value: 'normal', label: '普通' }, { value: 'important', label: '重要' }, { value: 'urgent', label: '紧急' }, { value: 'important-urgent', label: '重要且紧急' }]; return <RadioGroup.Root className="priority-radio" value={value} onValueChange={onValueChange}>{choices.map((choice) => <label key={choice.value}><RadioGroup.Item value={choice.value} aria-label={choice.label}><RadioGroup.Indicator className="priority-radio-indicator" /></RadioGroup.Item><span>{choice.label}</span></label>)}</RadioGroup.Root>; }
function DeleteTaskButton({ task, onDelete }) { return <AlertDialog.Root><AlertDialog.Trigger asChild><button className="danger-button">删除</button></AlertDialog.Trigger><AlertDialog.Portal><AlertDialog.Overlay className="task-overlay" /><AlertDialog.Content className="delete-dialog"><AlertDialog.Title>删除任务？</AlertDialog.Title><AlertDialog.Description>“{task.title}”及其子任务将被删除，此操作无法撤销。</AlertDialog.Description><div><AlertDialog.Cancel className="secondary">取消</AlertDialog.Cancel><AlertDialog.Action className="danger-button" onClick={() => onDelete(task)}>删除任务</AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>; }
function DatePickerField({ label, value, onValueChange, includeTime = false }) { const selected = value ? new Date(`${value.slice(0, 10)}T12:00:00`) : undefined; const time = includeTime && value ? value.slice(11, 16) : '09:00'; const commitDate = (date) => { const day = date.toLocaleDateString('en-CA'); onValueChange(includeTime ? `${day}T${time}` : day); }; const timeOptions = Array.from({ length: 24 }, (_, hour) => ['00', '30'].map((minute) => ({ value: `${String(hour).padStart(2, '0')}:${minute}`, label: `${String(hour).padStart(2, '0')}:${minute}` }))).flat(); return <div className="date-picker-field"><span>{label}</span><Popover.Root><Popover.Trigger asChild><button className="date-picker-trigger"><CalendarDays size={14} /><span>{value ? (includeTime ? value.replace('T', ' ') : value) : '选择日期'}</span></button></Popover.Trigger><Popover.Portal><Popover.Content className="date-picker-popover" sideOffset={6} align="end"><DayPicker mode="single" selected={selected} onSelect={(date) => date && commitDate(date)} /><div className="date-picker-time">{includeTime && <UiSelect value={time} onValueChange={(next) => onValueChange(value ? `${value.slice(0, 10)}T${next}` : `${today()}T${next}`)} placeholder="时间" options={timeOptions} />}</div></Popover.Content></Popover.Portal></Popover.Root></div>; }
function TreeSelect({ projects, categories, projectId, categoryId, onValueChange }) { const value = categoryId ? `category:${categoryId}` : projectId ? `project:${projectId}` : ''; const options = [{ value: '', label: '未设置归属' }, ...projects.flatMap((project) => [{ value: `project:${project.id}`, label: `项目 · ${project.name}` }, ...categories.filter((category) => category.project_id === project.id).map((category) => ({ value: `category:${category.id}`, label: `　分类 · ${category.name}` }))])]; return <div className="tree-select"><span><Folder size={14} />归属</span><UiSelect value={value} placeholder="选择项目或分类" options={options} onValueChange={(next) => { if (!next) return onValueChange({ projectId: null, categoryId: null }); const [kind, id] = next.split(':'); if (kind === 'project') onValueChange({ projectId: id, categoryId: null }); else { const category = categories.find((item) => item.id === id); onValueChange({ projectId: category?.project_id || null, categoryId: id }); } }} /></div>; }

createRoot(document.getElementById('root')).render(<App />);
