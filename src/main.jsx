import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Archive, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Circle,
  Clock3, Columns3, Grid2X2, Inbox, List, MoreHorizontal, Plus,
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
  const changeView = (next) => { setView(next); setProjectFilter(null); setSearch(''); setQuickCreate(false); };
  const clearFilters = () => setFilters({ status: '', priority: '', date: '', project: '', category: '' });
  const hasFilters = Object.values(filters).some(Boolean) || Boolean(projectFilter);
  const titleMap = { inbox: '收件箱', today: '今日', status: '任务', quadrant: '四象限', calendar: '日历', archive: '归档', project: '项目任务' };
  const title = projectFilter ? projects.find((item) => item.id === projectFilter)?.name || '项目' : titleMap[view];
  const subtitle = projectFilter ? '任务按状态组织，支持切换看板或列表浏览' : { status: '以状态为线索，快速掌握全部任务', inbox: '快速收集、集中处理，保持主工作区清爽', today: '今天需要推进和关注的任务', quadrant: '一掐四：用位置判断轻重缓急', calendar: '按计划与截止日期查看任务', archive: '已完成、取消或归档的记录' }[view];

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><b><Check size={15} strokeWidth={3} /></b><span>一掐四</span></div>
      <button className="primary sidebar-create" onClick={() => { setQuickStatus('收件箱'); setQuickCreate(true); }}><Plus size={16} />新建任务</button>
      <nav className="nav" aria-label="主导航">
        <NavButton icon={Inbox} label="收件箱" active={!projectFilter && view === 'inbox'} onClick={() => changeView('inbox')} count={tasks.filter((item) => active(item) && item.status === '收件箱' && !item.parent_id).length} />
        <NavButton icon={Columns3} label="状态视图" active={!projectFilter && view === 'status'} onClick={() => changeView('status')} />
        <NavButton icon={Clock3} label="今日" active={!projectFilter && view === 'today'} onClick={() => changeView('today')} />
        <NavButton icon={Grid2X2} label="四象限" active={!projectFilter && view === 'quadrant'} onClick={() => changeView('quadrant')} />
        <NavButton icon={CalendarDays} label="日历" active={!projectFilter && view === 'calendar'} onClick={() => changeView('calendar')} />
        <NavButton icon={Archive} label="归档" active={!projectFilter && view === 'archive'} onClick={() => changeView('archive')} />
      </nav>
      <div className="side-heading"><span>项目</span><button aria-label="新建项目" onClick={() => setAddingProject(true)}><Plus size={15} /></button></div>
      <div className="project-tree">
        {projects.map((project) => <button key={project.id} className={projectFilter === project.id ? 'project active' : 'project'} onClick={() => { setProjectFilter(project.id); setView('project'); setQuickCreate(false); }}><i style={{ background: project.color || '#5f7eea' }} /><span>{project.name}</span></button>)}
        {addingProject && <InlineName placeholder="项目名称，按 Enter 创建" onCancel={() => setAddingProject(false)} onSubmit={async (name) => { if (await createProject(name)) setAddingProject(false); }} />}
        {!projects.length && !addingProject && <p>还没有项目</p>}
      </div>
      <div className="side-heading category-heading"><span>分类</span><button aria-label="新建分类" onClick={() => projects.length ? setAddingCategory(true) : flash('请先创建项目')}><Plus size={15} /></button></div>
      <div className="category-tree">
        {categories.slice(0, 6).map((category) => <span key={category.id}><Tag size={12} />{category.name}</span>)}
        {addingCategory && <InlineCategory projects={projects} projectId={projectFilter} onCancel={() => setAddingCategory(false)} onSubmit={async (name, projectId) => { if (await createCategory(name, projectId)) setAddingCategory(false); }} />}
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="toolbar">
          <label className="search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索任务" /></label>
          {(view === 'status' || view === 'project') && <button className="toolbar-button work-count"><Circle size={12} />{visibleTasks.filter((task) => task.status === '进行中').length} 工作中</button>}
          <div className="filter-wrap"><button className={hasFilters ? 'toolbar-button active-filter' : 'toolbar-button'} onClick={() => setFilterOpen((open) => !open)}><SlidersHorizontal size={15} />筛选</button>{filterOpen && <FilterMenu filters={filters} setFilters={setFilters} projects={projects} categories={categories} onClear={clearFilters} onClose={() => setFilterOpen(false)} />}</div>
          {(view === 'status' || view === 'project') && <ViewSwitch mode={viewMode} setMode={setViewMode} />}
          <button className="icon-button" title="刷新数据" onClick={load}><RefreshCw size={16} /></button>
        </div>
      </header>
      {quickCreate && <QuickCreate projectId={projectFilter} status={quickStatus} projects={projects} onCancel={() => setQuickCreate(false)} onSubmit={async (title, projectId) => { if (await createTask({ title, projectId, status: quickStatus })) setQuickCreate(false); }} />}
      {hasFilters && <div className="filter-bar"><span>已应用筛选</span><button onClick={() => { clearFilters(); setProjectFilter(null); }}>清除全部</button></div>}
      <section className="content" aria-busy={loading}>
        {loading ? <div className="empty">正在载入任务…</div> : <ViewContent view={projectFilter ? 'project' : view} mode={viewMode} tasks={visibleTasks} month={month} setMonth={setMonth} onSelect={setSelected} onComplete={completeTask} onUpdate={updateTask} childrenByParent={childrenByParent} projects={projects} categories={categories} onQuickCreate={(status) => { setQuickStatus(status); setQuickCreate(true); }} />}
      </section>
    </main>

    <TaskSheet task={selected} projects={projects} categories={categories} childTasks={selected ? childrenByParent.get(selected.id) || [] : []} onClose={() => setSelected(null)} onSave={updateTask} onComplete={completeTask} onAddChild={() => selected && createTask({ title: '新的子任务', parentId: selected.id, projectId: selected.project_id })} />
    <nav className="mobile-nav" aria-label="移动导航"><button onClick={() => changeView('inbox')}>收件箱</button><button onClick={() => changeView('status')}>任务</button><button className="mobile-add" onClick={() => { setQuickStatus('收件箱'); setQuickCreate(true); }} aria-label="新建任务"><Plus size={22} /></button><button onClick={() => changeView('today')}>今日</button><button onClick={() => changeView('calendar')}>日历</button></nav>
    {notice && <div className="notice" role="status">{notice}</div>}
  </div>;
}

function NavButton({ icon: Glyph, label, active, onClick, count }) { return <button className={active ? 'active' : ''} onClick={onClick}><Glyph size={16} /><span>{label}</span>{count !== undefined && <small>{count}</small>}</button>; }
function InlineName({ placeholder, onCancel, onSubmit }) { const [name, setName] = useState(''); return <form className="inline-name" onSubmit={(event) => { event.preventDefault(); onSubmit(name); }}><input autoFocus value={name} placeholder={placeholder} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }} /><button type="button" onClick={onCancel}><X size={13} /></button></form>; }
function InlineCategory({ projects, projectId, onCancel, onSubmit }) { const [name, setName] = useState(''); const [project, setProject] = useState(projectId || projects[0]?.id || ''); return <form className="inline-category" onSubmit={(event) => { event.preventDefault(); onSubmit(name, project); }}><input autoFocus value={name} placeholder="分类名称" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }} /><select value={project} onChange={(event) => setProject(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={onCancel}><X size={13} /></button></form>; }

function QuickCreate({ projectId, status, projects, onCancel, onSubmit }) { const [title, setTitle] = useState(''); const [project, setProject] = useState(projectId || ''); return <form className="quick-create" onSubmit={(event) => { event.preventDefault(); onSubmit(title, project || null); }}><Plus size={18} /><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`新增${displayStatus(status)}任务，按 Enter 保存`} /><select aria-label="选择项目" value={project} onChange={(event) => setProject(event.target.value)}><option value="">收件箱</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className="icon-button" onClick={onCancel}><X size={16} /></button><button className="primary" type="submit">添加</button></form>; }

function FilterMenu({ filters, setFilters, projects, categories, onClear, onClose }) {
  const patch = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return <div className="filter-menu" role="dialog" aria-label="筛选任务"><div className="filter-menu-head"><strong>筛选任务</strong><button onClick={onClear}>清除</button></div><FilterSelect label="状态" value={filters.status} onChange={(value) => patch('status', value)}><option value="">全部状态</option>{STATUS_COLUMNS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</FilterSelect><FilterSelect label="优先级" value={filters.priority} onChange={(value) => patch('priority', value)}><option value="">不限</option><option value="important">重要</option><option value="urgent">紧急</option></FilterSelect><FilterSelect label="日期" value={filters.date} onChange={(value) => patch('date', value)}><option value="">不限</option><option value="overdue">已逾期</option><option value="today">今天</option></FilterSelect><FilterSelect label="项目" value={filters.project} onChange={(value) => patch('project', value)}><option value="">全部项目</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterSelect><FilterSelect label="标签 / 分类" value={filters.category} onChange={(value) => patch('category', value)}><option value="">全部分类</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterSelect><button className="filter-done" onClick={onClose}>完成</button></div>;
}
function FilterSelect({ label, value, onChange, children }) { return <label className="filter-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>; }
function ViewSwitch({ mode, setMode }) { return <div className="view-switch"><button className={mode === 'board' ? 'selected' : ''} onClick={() => setMode('board')}><Columns3 size={15} />看板</button><button className={mode === 'list' ? 'selected' : ''} onClick={() => setMode('list')}><List size={15} />列表</button></div>; }

function ViewContent({ view, mode, tasks, month, setMonth, onSelect, onComplete, onUpdate, childrenByParent, projects, categories, onQuickCreate }) {
  const root = tasks.filter((task) => !task.parent_id);
  if (view === 'inbox') return <InboxWorkspace tasks={root.filter((task) => active(task) && task.status === '收件箱')} projects={projects} categories={categories} onSelect={onSelect} onComplete={onComplete} childrenByParent={childrenByParent} />;
  if (view === 'archive') return <TaskList tasks={root.filter((task) => task.archived_at || ['已完成', '已取消'].includes(task.status))} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} childrenByParent={childrenByParent} projects={projects} categories={categories} empty="还没有归档记录" />;
  if (view === 'quadrant') return <Quadrants tasks={root.filter((task) => active(task) && task.status !== '阻塞')} onSelect={onSelect} childrenByParent={childrenByParent} />;
  if (view === 'calendar') return <Calendar tasks={root.filter(active)} month={month} setMonth={setMonth} onSelect={onSelect} />;
  if (view === 'status' || view === 'project') return mode === 'board' ? <StatusBoard tasks={root} projects={projects} categories={categories} childrenByParent={childrenByParent} onSelect={onSelect} onQuickCreate={onQuickCreate} /> : <StatusList tasks={root} projects={projects} categories={categories} childrenByParent={childrenByParent} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} />;
  const date = today(); const working = root.filter((task) => active(task) && task.status !== '阻塞');
  const late = working.filter((task) => task.due_at && dateOnly(task.due_at) <= date);
  const inProgress = working.filter((task) => task.status === '进行中' && !late.includes(task));
  const planned = working.filter((task) => task.scheduled_for === date && !late.includes(task) && !inProgress.includes(task));
  const future = working.filter((task) => task.due_at && dateOnly(task.due_at) > date && !late.includes(task) && !inProgress.includes(task) && !planned.includes(task));
  return <div className="today-list"><Section title="已逾期 / 今天截止" tasks={late} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} childrenByParent={childrenByParent} projects={projects} categories={categories} /><Section title="进行中" tasks={inProgress} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} childrenByParent={childrenByParent} projects={projects} categories={categories} /><Section title="计划今天" tasks={planned} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} childrenByParent={childrenByParent} projects={projects} categories={categories} /><Section title="未来有截止时间" tasks={future} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} childrenByParent={childrenByParent} projects={projects} categories={categories} /></div>;
}
function Section({ title, tasks, ...props }) { return <section className="section"><div className="section-head"><h2>{title}</h2><span>{tasks.length} 项</span></div><TaskList tasks={tasks} {...props} /></section>; }
function TaskList({ tasks, onSelect, onComplete, onUpdate, childrenByParent, projects = [], categories = [], empty = '暂无任务' }) { return <div className="task-list">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} children={childrenByParent.get(task.id) || []} project={projects.find((item) => item.id === task.project_id)} category={categories.find((item) => item.id === task.category_id)} />) : <div className="empty">{empty}</div>}</div>; }
function TaskRow({ task, onSelect, onComplete, onUpdate, children, project, category }) {
  const due = dateOnly(task.due_at); const isLate = due && due < today();
  return <article className="task-row" tabIndex="0" onClick={() => onSelect(task)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(task); } }}><button className={task.status === '已完成' ? 'check done' : 'check'} aria-label={`${task.status === '已完成' ? '恢复' : '完成'}：${task.title}`} onClick={(event) => { event.stopPropagation(); onComplete(task); }}>{task.status === '已完成' && <Check size={12} strokeWidth={3} />}</button><div className="task-copy"><strong>{task.title}</strong><div className="task-meta"><span className={`status-badge status-${task.status}`}>{displayStatus(task.status)}</span>{project && <span className="row-project"><i style={{ background: project.color || '#8290aa' }} />{project.name}</span>}{category && <span className="row-category">#{category.name}</span>}{children.length > 0 && <span className="child-count"><Circle size={10} />{children.filter((item) => item.status === '已完成').length}/{children.length}</span>}</div></div><div className={isLate ? 'due overdue' : 'due'}>{isLate ? '已逾期' : due === today() ? '今天截止' : due ? `${due.slice(5).replace('-', '/')} 截止` : ''}</div></article>;
}

function StatusBoard({ tasks, projects, categories, childrenByParent, onSelect, onQuickCreate }) { return <div className="status-board">{STATUS_COLUMNS.map((column) => { const entries = tasks.filter((task) => task.status === column.key); return <section className={`board-column tone-${column.tone}`} key={column.key}><header><div><span className="status-dot" /><strong>{column.label}</strong><small>{entries.length}</small></div><div><button aria-label={`新建${column.label}任务`} onClick={() => onQuickCreate(column.key)}><Plus size={15} /></button><button aria-label="更多"><MoreHorizontal size={16} /></button></div></header><div className="board-cards">{entries.length ? entries.map((task) => <BoardCard key={task.id} task={task} project={projects.find((item) => item.id === task.project_id)} category={categories.find((item) => item.id === task.category_id)} children={childrenByParent.get(task.id) || []} onClick={() => onSelect(task)} />) : <button className="board-empty" onClick={() => onQuickCreate(column.key)}>+ 添加任务</button>}</div></section>; })}</div>; }
function BoardCard({ task, project, category, children, onClick }) { const due = dateOnly(task.due_at); return <button className="board-card" onClick={onClick}><strong>{task.title}</strong><div className="card-meta">{project && <span><i style={{ background: project.color || '#8290aa' }} />{project.name}</span>}{category && <span>#{category.name}</span>}</div><footer>{children.length > 0 && <span className="card-children"><Circle size={10} />{children.length}</span>}{due && <time className={due < today() ? 'overdue' : ''}>{due < today() ? '逾期' : due === today() ? '今天' : due.slice(5).replace('-', '/')}</time>}</footer></button>; }
function StatusList({ tasks, projects, categories, childrenByParent, onSelect, onComplete, onUpdate }) { return <div className="status-list">{STATUS_COLUMNS.map((column) => { const entries = tasks.filter((task) => task.status === column.key); return <details key={column.key} open><summary><span className={`status-dot tone-${column.tone}`} /><strong>{column.label}</strong><small>{entries.length}</small><ChevronDown size={15} /></summary><TaskList tasks={entries} projects={projects} categories={categories} childrenByParent={childrenByParent} onSelect={onSelect} onComplete={onComplete} onUpdate={onUpdate} empty="暂无任务" /></details>; })}</div>; }

function InboxWorkspace({ tasks, projects, categories, childrenByParent, onSelect, onComplete }) { const [focused, setFocused] = useState(() => tasks[0] || null); useEffect(() => setFocused((current) => tasks.find((task) => task.id === current?.id) || tasks[0] || null), [tasks]); return <div className="inbox-workspace"><aside className="inbox-list"><header><strong>收件箱</strong><span>{tasks.length}</span></header>{tasks.length ? tasks.map((task) => <button key={task.id} className={focused?.id === task.id ? 'inbox-item selected' : 'inbox-item'} onClick={() => setFocused(task)}><span className="inbox-item-icon"><Inbox size={14} /></span><div><strong>{task.title}</strong><small>{projects.find((item) => item.id === task.project_id)?.name || '未分类'} · {displayStatus(task.status)}</small></div></button>) : <div className="empty">收件箱已经清空</div>}</aside><section className="inbox-preview">{focused ? <><div className="preview-crumb"><Inbox size={14} />收件箱 / 待处理</div><div className="preview-head"><div><span className="status-badge status-收件箱">待规划</span><h2>{focused.title}</h2><p>{focused.description || '还没有说明。先让任务进入收件箱，再在合适的时机整理。'}</p></div><button className="icon-button" onClick={() => onSelect(focused)} aria-label="打开任务详情"><MoreHorizontal size={18} /></button></div><div className="preview-properties"><span>项目 <b>{projects.find((item) => item.id === focused.project_id)?.name || '未设置'}</b></span><span>分类 <b>{categories.find((item) => item.id === focused.category_id)?.name || '未设置'}</b></span><span>子任务 <b>{(childrenByParent.get(focused.id) || []).length} 项</b></span></div><div className="preview-actions"><button className="secondary" onClick={() => onSelect(focused)}>编辑任务</button><button className="primary" onClick={() => onComplete(focused)}><Check size={15} />完成</button></div></> : <div className="inbox-empty"><Inbox size={28} /><strong>收件箱已经清空</strong><span>记录新任务后会出现在这里。</span></div>}</section></div>; }

function Quadrants({ tasks, onSelect, childrenByParent }) { const cells = [[true, true, '重要且紧急', 'q1'], [true, false, '重要但不紧急', 'q2'], [false, true, '不重要但紧急', 'q3'], [false, false, '不重要且不紧急', 'q4']]; return <div className="quad">{cells.map(([importance, urgency, label, style]) => { const entries = tasks.filter((task) => task.importance === importance && task.urgency === urgency); return <section className={`quadrant ${style}`} key={label}><div className="quad-title"><span>{label}</span><small>{entries.length}</small></div><div className="dot-area">{entries.length ? entries.map((task) => <button key={task.id} className={`task-dot ${(childrenByParent.get(task.id) || []).length ? 'parent-dot' : ''}`} aria-label={`打开任务：${task.title}`} title={task.title} onClick={() => onSelect(task)} />) : <span>暂无任务</span>}</div><div className="quad-preview">{entries.slice(0, 2).map((task) => <button key={task.id} onClick={() => onSelect(task)}>{task.title}</button>)}</div></section>; })}</div>; }
function Calendar({ tasks, month, setMonth, onSelect }) { const year = month.getFullYear(); const monthIndex = month.getMonth(); const first = new Date(year, monthIndex, 1).getDay(); const days = new Date(year, monthIndex + 1, 0).getDate(); const cells = Array.from({ length: first + days }, (_, index) => index < first ? null : index - first + 1); const dateKey = (day) => `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; return <section className="calendar"><div className="calendar-head"><button aria-label="上个月" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft size={18} /></button><strong>{year} 年 {monthIndex + 1} 月</strong><button aria-label="下个月" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight size={18} /></button></div><div className="weekdays">{['日', '一', '二', '三', '四', '五', '六'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => { if (!day) return <div className="calendar-day blank" key={`b-${index}`} />; const value = dateKey(day); const planned = tasks.filter((task) => task.scheduled_for === value); const due = tasks.filter((task) => dateOnly(task.due_at) === value && task.scheduled_for !== value); const items = [...due.map((task) => ({ task, type: 'due' })), ...planned.map((task) => ({ task, type: 'plan' }))]; return <div className={value === today() ? 'calendar-day today' : 'calendar-day'} key={value}><span>{day}</span>{items.slice(0, 2).map(({ task, type }) => <button key={task.id} className={type} onClick={() => onSelect(task)}>{task.title}</button>)}{items.length > 2 && <em>+{items.length - 2} 项</em>}</div>; })}</div></section>; }

function TaskSheet({ task, projects, categories, childTasks, onClose, onSave, onComplete, onAddChild }) { return <Dialog.Root open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>{task && <Dialog.Portal><Dialog.Overlay className="task-overlay" /><Dialog.Content className="task-sheet" aria-describedby={undefined}><div className="sheet-top"><span>任务详情</span><Dialog.Close className="icon-button" aria-label="关闭详情"><X size={17} /></Dialog.Close></div><Dialog.Title className="sr-only">编辑任务</Dialog.Title><TaskEditor key={task.id} task={task} projects={projects} categories={categories} childTasks={childTasks} onSave={onSave} onComplete={onComplete} onAddChild={onAddChild} /></Dialog.Content></Dialog.Portal>}</Dialog.Root>; }
function TaskEditor({ task, projects, categories, childTasks, onSave, onComplete, onAddChild }) { const [draft, setDraft] = useState({ ...task, due_at: task.due_at ? task.due_at.slice(0, 16) : '' }); const [saving, setSaving] = useState(false); const set = (key, value) => setDraft((item) => ({ ...item, [key]: value })); const save = async () => { setSaving(true); const payload = { title: draft.title.trim() || task.title, status: draft.status, importance: draft.importance, urgency: draft.urgency, description: draft.description || '', scheduled_for: draft.scheduled_for || null, due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null, project_id: draft.project_id || null, category_id: draft.category_id || null }; await onSave(task.id, payload, '已保存'); setSaving(false); }; return <div className="detail"><div className="detail-heading"><input className="detail-title" aria-label="任务名称" value={draft.title || ''} onChange={(event) => set('title', event.target.value)} /><span className={`status-badge status-${draft.status}`}>{displayStatus(draft.status)}</span></div><textarea className="detail-description" value={draft.description || ''} onChange={(event) => set('description', event.target.value)} placeholder="添加说明…" rows="4" /><section className="detail-section"><h3>属性</h3><div className="property-list"><label><span>状态</span><select value={draft.status} onChange={(event) => set('status', event.target.value)}>{STATUS_OPTIONS.map((item) => <option key={item}>{displayStatus(item)}</option>)}</select></label><label><span>项目</span><select value={draft.project_id || ''} onChange={(event) => set('project_id', event.target.value)}><option value="">未设置</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>分类</span><select value={draft.category_id || ''} onChange={(event) => set('category_id', event.target.value)}><option value="">未设置</option>{categories.filter((item) => !draft.project_id || item.project_id === draft.project_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>计划日期</span><input type="date" value={draft.scheduled_for || ''} onChange={(event) => set('scheduled_for', event.target.value)} /></label><label><span>截止时间</span><input type="datetime-local" value={draft.due_at || ''} onChange={(event) => set('due_at', event.target.value)} /></label></div></section><section className="detail-section"><h3>优先级</h3><div className="priority-controls"><label><span>重要度</span><select value={String(draft.importance)} onChange={(event) => set('importance', event.target.value === 'true')}><option value="true">重要</option><option value="false">不重要</option></select></label><label><span>紧急度</span><select value={String(draft.urgency)} onChange={(event) => set('urgency', event.target.value === 'true')}><option value="true">紧急</option><option value="false">不紧急</option></select></label></div></section><section className="detail-section children-section"><div className="children-head"><h3>子任务 <em>{childTasks.filter((item) => item.status === '已完成').length}/{childTasks.length}</em></h3><button onClick={onAddChild}><Plus size={14} />添加</button></div>{childTasks.length ? childTasks.map((child) => <div className="child" key={child.id}><span className={child.status === '已完成' ? 'child-check done' : 'child-check'}>{child.status === '已完成' && <Check size={10} strokeWidth={3} />}</span>{child.title}</div>) : <p className="child-empty">拆成小步骤，会更容易推进。</p>}</section><div className="detail-actions"><button className="secondary" onClick={() => onComplete(task)}>{task.status === '已完成' ? '恢复任务' : '完成任务'}</button><button className="primary" onClick={save}>{saving ? '保存中…' : '保存更改'}</button></div></div>; }

createRoot(document.getElementById('root')).render(<App />);
