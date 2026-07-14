import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, CalendarDays, Check, ChevronLeft, ChevronRight, Circle, Clock3, Grid2X2, Inbox, Plus, RefreshCw, Search, X } from 'lucide-react';
import './styles.css';

const config = window.TODO_CONFIG || {};
const API_ROOT = (config.supabaseUrl || '').replace(/\/$/, '').includes('/rest/v1')
  ? `${(config.supabaseUrl || '').replace(/\/$/, '')}/`
  : `${(config.supabaseUrl || '').replace(/\/$/, '')}/rest/v1/`;

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const dateOnly = (value) => value?.slice(0, 10) || '';
const active = (task) => !task.archived_at && !['已完成', '已取消'].includes(task.status);
const esc = (value = '') => value;

async function api(path, options = {}) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('尚未配置 Supabase 连接信息');
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseAnonKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error((await response.text()) || '请求失败');
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function Icon({ children }) { return <span className="icon" aria-hidden="true">{children}</span>; }

function App() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [view, setView] = useState('today');
  const [selected, setSelected] = useState(null);
  const [projectFilter, setProjectFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(() => new Date());
  const [modal, setModal] = useState(null);
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
      setTasks(nextTasks || []);
      setProjects(nextProjects || []);
      setCategories(nextCategories || []);
      setSelected((current) => current ? (nextTasks || []).find((item) => item.id === current.id) || null : null);
    } catch (error) {
      flash(error.message || '加载失败，请稍后重试');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const childrenByParent = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      if (!task.parent_id) return;
      map.set(task.parent_id, [...(map.get(task.parent_id) || []), task]);
    });
    return map;
  }, [tasks]);

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    if (task.parent_id) return false;
    if (projectFilter && task.project_id !== projectFilter) return false;
    const term = search.trim().toLocaleLowerCase();
    if (!term) return true;
    const project = projects.find((item) => item.id === task.project_id)?.name || '';
    const category = categories.find((item) => item.id === task.category_id)?.name || '';
    return [task.title, task.description, project, category].join(' ').toLocaleLowerCase().includes(term);
  }), [tasks, projectFilter, search, projects, categories]);

  const updateTask = async (id, patch, message = '已保存') => {
    try {
      const result = await api(`tasks?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch)
      });
      const updated = result?.[0];
      if (updated) {
        setTasks((current) => current.map((item) => item.id === id ? updated : item));
        setSelected((current) => current?.id === id ? updated : current);
      }
      flash(message);
      return updated;
    } catch (error) { flash(error.message || '保存失败'); return null; }
  };

  const createTask = async ({ title, projectId = projectFilter, parentId = null }) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const result = await api('tasks', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ title: trimmed, status: '收件箱', project_id: projectId || null, parent_id: parentId, manual_order: Date.now() })
      });
      const task = result?.[0];
      if (task) setTasks((current) => [task, ...current]);
      setModal(null);
      flash(projectId ? '已加入当前项目' : '已加入收件箱');
    } catch (error) { flash(error.message || '创建失败，请重试'); }
  };

  const completeTask = async (task) => {
    const done = task.status === '已完成';
    await updateTask(task.id, { status: done ? '待进行' : '已完成' }, done ? '已恢复为待进行' : '已完成 · 已移入归档');
  };

  const changeView = (next) => { setView(next); setProjectFilter(null); setSearch(''); };
  const title = projectFilter ? projects.find((item) => item.id === projectFilter)?.name || '项目' : ({ inbox: '收件箱', today: '今日', quadrant: '四象限', calendar: '日历', archive: '归档' }[view]);
  const subtitle = projectFilter ? '查看这个项目中的全部任务' : ({ inbox: '先记下来，之后再整理', today: '今天可以推进和需要关注的任务', quadrant: '一掐四：用位置判断优先级', calendar: '按计划日期与截止日期查看', archive: '已经完成、取消或归档的任务' }[view]);

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><b><Check size={16} strokeWidth={3} /></b><span>一掐四</span></div>
      <button className="primary" onClick={() => setModal('task')}><Plus size={16} />新建任务</button>
      <nav className="nav" aria-label="主导航">
        <NavButton icon={Inbox} label="收件箱" active={!projectFilter && view === 'inbox'} onClick={() => changeView('inbox')} count={tasks.filter((item) => active(item) && item.status === '收件箱' && !item.parent_id).length} />
        <NavButton icon={Clock3} label="今日" active={!projectFilter && view === 'today'} onClick={() => changeView('today')} />
        <NavButton icon={Grid2X2} label="四象限" active={!projectFilter && view === 'quadrant'} onClick={() => changeView('quadrant')} />
        <NavButton icon={CalendarDays} label="日历" active={!projectFilter && view === 'calendar'} onClick={() => changeView('calendar')} />
        <NavButton icon={Archive} label="归档" active={!projectFilter && view === 'archive'} onClick={() => changeView('archive')} />
      </nav>
      <div className="side-heading"><span>项目</span><button aria-label="新建项目" onClick={() => setModal('project')}><Plus size={15} /></button></div>
      <div className="project-tree">
        {projects.length ? projects.map((project) => <button key={project.id} className={projectFilter === project.id ? 'project active' : 'project'} onClick={() => { setProjectFilter(project.id); setView('project'); setSearch(''); }}><i style={{ background: project.color || '#6482e8' }} /><span>{project.name}</span></button>) : <p>还没有项目</p>}
      </div>
      <button className="new-category" onClick={() => projects.length ? setModal('category') : flash('请先创建项目')}><Plus size={14} /> 新建分类</button>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        <div className="toolbar"><label className="search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索全部任务" /></label><button className="secondary" onClick={load}><RefreshCw size={15} />刷新</button></div>
      </header>
      {projectFilter && <div className="filter-bar"><span>正在查看项目</span><button onClick={() => { setProjectFilter(null); setView('today'); }}>清除筛选</button></div>}
      <section className="content" aria-busy={loading}>
        {loading ? <div className="empty">正在载入任务…</div> : projectFilter ? <TaskList tasks={visibleTasks.filter(active)} onSelect={setSelected} onComplete={completeTask} childrenByParent={childrenByParent} selectedId={selected?.id} empty="这个项目还没有未完成任务" /> : <ViewContent view={view} tasks={visibleTasks} month={month} setMonth={setMonth} onSelect={setSelected} onComplete={completeTask} childrenByParent={childrenByParent} selectedId={selected?.id} />}
      </section>
    </main>

    <aside className="detail-panel" aria-label="任务详情">
      {selected ? <TaskDetail key={selected.id} task={selected} projects={projects} categories={categories} childTasks={childrenByParent.get(selected.id) || []} onSave={updateTask} onComplete={completeTask} onClose={() => setSelected(null)} onAddChild={() => createTask({ title: '新的子任务', parentId: selected.id, projectId: selected.project_id })} /> : <div className="detail-empty"><strong>选择一个任务</strong><span>查看详情或快速整理</span></div>}
    </aside>

    <nav className="mobile-nav" aria-label="移动导航">
      <button onClick={() => changeView('inbox')}>收件箱</button><button onClick={() => changeView('today')}>今日</button><button onClick={() => setModal('task')} className="mobile-add" aria-label="新建任务"><Plus size={23} /></button><button onClick={() => changeView('quadrant')}>四象限</button><button onClick={() => changeView('calendar')}>日历</button>
    </nav>
    {modal && <Modal kind={modal} projects={projects} projectId={projectFilter} onClose={() => setModal(null)} onTask={createTask} onProject={async (name) => { const data = await api('projects', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name, color: '#6482e8' }) }); setProjects((items) => [...items, data[0]]); setModal(null); flash('项目已创建'); }} onCategory={async (name, projectId) => { const data = await api('categories', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name, project_id: projectId }) }); setCategories((items) => [...items, data[0]]); setModal(null); flash('分类已创建'); }} />}
    {notice && <div className="notice" role="status">{notice}</div>}
  </div>;
}

function NavButton({ icon: Glyph, label, active, onClick, count }) { return <button className={active ? 'active' : ''} onClick={onClick}><Icon><Glyph size={16} strokeWidth={1.9} /></Icon><span>{label}</span>{count !== undefined && <small>{count}</small>}</button>; }

function ViewContent({ view, tasks, month, setMonth, onSelect, onComplete, childrenByParent, selectedId }) {
  const root = tasks.filter((task) => !task.parent_id);
  if (view === 'inbox') return <TaskList tasks={root.filter((task) => active(task) && task.status === '收件箱')} onSelect={onSelect} onComplete={onComplete} childrenByParent={childrenByParent} selectedId={selectedId} empty="收件箱已经清空" />;
  if (view === 'archive') return <TaskList tasks={root.filter((task) => task.archived_at || ['已完成', '已取消'].includes(task.status))} onSelect={onSelect} onComplete={onComplete} childrenByParent={childrenByParent} selectedId={selectedId} empty="还没有归档记录" />;
  if (view === 'quadrant') return <Quadrants tasks={root.filter((task) => active(task) && task.status !== '阻塞')} onSelect={onSelect} childrenByParent={childrenByParent} />;
  if (view === 'calendar') return <Calendar tasks={root.filter(active)} month={month} setMonth={setMonth} onSelect={onSelect} />;
  const date = today();
  const working = root.filter((task) => active(task) && task.status !== '阻塞');
  const late = working.filter((task) => task.due_at && dateOnly(task.due_at) <= date);
  const inProgress = working.filter((task) => task.status === '进行中' && !late.includes(task));
  const planned = working.filter((task) => task.scheduled_for === date && !late.includes(task) && !inProgress.includes(task));
  const future = working.filter((task) => task.due_at && dateOnly(task.due_at) > date && !late.includes(task) && !inProgress.includes(task) && !planned.includes(task));
  return <div className="today-grid"><Section title="已逾期 / 今天截止" tasks={late} onSelect={onSelect} onComplete={onComplete} childrenByParent={childrenByParent} selectedId={selectedId} /><Section title="进行中" tasks={inProgress} onSelect={onSelect} onComplete={onComplete} childrenByParent={childrenByParent} selectedId={selectedId} /><Section title="计划今天" tasks={planned} onSelect={onSelect} onComplete={onComplete} childrenByParent={childrenByParent} selectedId={selectedId} /><Section title="未来有截止时间" hint="所有未来截止任务都会列出" tasks={future} onSelect={onSelect} onComplete={onComplete} childrenByParent={childrenByParent} selectedId={selectedId} /></div>;
}

function Section({ title, hint, tasks, ...props }) { return <section className="section"><div className="section-head"><h2>{title}</h2><span>{tasks.length ? `${tasks.length} 项` : hint}</span></div><TaskList tasks={tasks} {...props} /></section>; }
function TaskList({ tasks, onSelect, onComplete, childrenByParent, selectedId, empty = '暂无任务' }) { return <div className="task-list">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onSelect={onSelect} onComplete={onComplete} children={childrenByParent.get(task.id) || []} selected={task.id === selectedId} />) : <div className="empty">{empty}</div>}</div>; }

function TaskRow({ task, onSelect, onComplete, children, selected }) {
  const due = dateOnly(task.due_at); const isLate = due && due < today();
  return <article className={selected ? 'task-row selected' : 'task-row'} tabIndex="0" onClick={() => onSelect(task)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(task); } }}>
    <button className={task.status === '已完成' ? 'check done' : 'check'} aria-label={`${task.status === '已完成' ? '恢复' : '完成'}：${task.title}`} onClick={(event) => { event.stopPropagation(); onComplete(task); }}>{task.status === '已完成' && <Check size={12} strokeWidth={3} />}</button>
    <div className="task-copy"><strong>{esc(task.title)}</strong><div className="task-meta"><span>{task.status}</span>{children.length > 0 && <span className="child-count"><Circle size={10} /> {children.filter((item) => item.status === '已完成').length}/{children.length} 子任务</span>}</div></div>
    <div className={isLate ? 'due overdue' : 'due'}>{isLate ? '已逾期' : due === today() ? '今天截止' : due ? `${due.slice(5).replace('-', '/')} 截止` : ''}</div>
  </article>;
}

function Quadrants({ tasks, onSelect, childrenByParent }) {
  const cells = [[true, true, '重要且紧急', 'q1'], [true, false, '重要但不紧急', 'q2'], [false, true, '不重要但紧急', 'q3'], [false, false, '不重要且不紧急', 'q4']];
  return <div className="quad">{cells.map(([importance, urgency, label, style]) => { const entries = tasks.filter((task) => task.importance === importance && task.urgency === urgency); return <section className={`quadrant ${style}`} key={label}><div className="quad-title"><span>{label}</span><small>{entries.length}</small></div><div className="dot-area">{entries.length ? entries.map((task) => <button key={task.id} className={`task-dot ${(childrenByParent.get(task.id) || []).length ? 'parent-dot' : ''}`} aria-label={`打开任务：${task.title}`} title={task.title} onClick={() => onSelect(task)} />) : <span>暂无任务</span>}</div><div className="quad-preview">{entries.slice(0, 2).map((task) => <button key={task.id} onClick={() => onSelect(task)}>{task.title}</button>)}</div></section>; })}</div>;
}

function Calendar({ tasks, month, setMonth, onSelect }) {
  const year = month.getFullYear(); const monthIndex = month.getMonth(); const first = new Date(year, monthIndex, 1).getDay(); const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: first + days }, (_, index) => index < first ? null : index - first + 1);
  const dateKey = (day) => `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return <section className="calendar"><div className="calendar-head"><button aria-label="上个月" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft size={18} /></button><strong>{year} 年 {monthIndex + 1} 月</strong><button aria-label="下个月" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight size={18} /></button></div><div className="weekdays">{['日', '一', '二', '三', '四', '五', '六'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => { if (!day) return <div className="calendar-day blank" key={`b-${index}`} />; const value = dateKey(day); const planned = tasks.filter((task) => task.scheduled_for === value); const due = tasks.filter((task) => dateOnly(task.due_at) === value && task.scheduled_for !== value); const items = [...due.map((task) => ({ task, type: 'due' })), ...planned.map((task) => ({ task, type: 'plan' }))]; return <div className={value === today() ? 'calendar-day today' : 'calendar-day'} key={value}><span>{day}</span>{items.slice(0, 2).map(({ task, type }) => <button key={task.id} className={type} onClick={() => onSelect(task)}>{task.title}</button>)}{items.length > 2 && <em>+{items.length - 2} 项</em>}</div>; })}</div></section>;
}

function TaskDetail({ task, projects, categories, childTasks, onSave, onComplete, onClose, onAddChild }) {
  const [draft, setDraft] = useState({ ...task, due_at: task.due_at ? task.due_at.slice(0, 16) : '' });
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => { const updated = await onSave(task.id, { title: draft.title.trim() || task.title, status: draft.status, importance: draft.importance, urgency: draft.urgency, description: draft.description || '', scheduled_for: draft.scheduled_for || null, due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null, project_id: draft.project_id || null, category_id: draft.category_id || null }); if (updated) setDraft({ ...updated, due_at: updated.due_at ? updated.due_at.slice(0, 16) : '' }); };
  const completedChildren = childTasks.filter((item) => item.status === '已完成').length;
  return <div className="detail">
    <div className="detail-top"><span>任务详情</span><button aria-label="关闭详情" onClick={onClose}><X size={17} /></button></div>
    <div className="detail-heading"><input className="detail-title" aria-label="任务名称" value={draft.title || ''} onChange={(event) => set('title', event.target.value)} /><span className={`status-pill status-${draft.status}`}>{draft.status}</span></div>
    <textarea className="detail-description" value={draft.description || ''} onChange={(event) => set('description', event.target.value)} placeholder="添加说明…" rows="3" />
    <section className="detail-section"><h3>属性</h3><div className="property-list">
      <label><span>状态</span><select value={draft.status} onChange={(event) => set('status', event.target.value)}>{['收件箱', '待进行', '进行中', '已完成', '已取消', '阻塞'].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>项目</span><select value={draft.project_id || ''} onChange={(event) => set('project_id', event.target.value)}><option value="">未设置</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>分类</span><select value={draft.category_id || ''} onChange={(event) => set('category_id', event.target.value)}><option value="">未设置</option>{categories.filter((item) => !draft.project_id || item.project_id === draft.project_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>计划日期</span><input type="date" value={draft.scheduled_for || ''} onChange={(event) => set('scheduled_for', event.target.value)} /></label>
      <label><span>截止时间</span><input type="datetime-local" value={draft.due_at || ''} onChange={(event) => set('due_at', event.target.value)} /></label>
    </div></section>
    <section className="detail-section priority-section"><h3>优先级</h3><div className="priority-controls"><label><span>重要度</span><select value={String(draft.importance)} onChange={(event) => set('importance', event.target.value === 'true')}><option value="true">重要</option><option value="false">不重要</option></select></label><label><span>紧急度</span><select value={String(draft.urgency)} onChange={(event) => set('urgency', event.target.value === 'true')}><option value="true">紧急</option><option value="false">不紧急</option></select></label></div></section>
    <section className="detail-section children-section"><div className="children-head"><h3>子任务 <em>{completedChildren}/{childTasks.length}</em></h3><button onClick={onAddChild}><Plus size={14} />添加</button></div>{childTasks.length ? childTasks.map((child) => <div className="child" key={child.id}><span className={child.status === '已完成' ? 'child-check done' : 'child-check'}>{child.status === '已完成' && <Check size={10} strokeWidth={3} />}</span>{child.title}</div>) : <p className="child-empty">拆成小步骤，会更容易推进。</p>}</section>
    <div className="detail-actions"><button className="secondary" onClick={() => onComplete(task)}>{task.status === '已完成' ? '恢复任务' : '完成任务'}</button><button className="primary save" onClick={save}>保存更改</button></div>
  </div>;
}

function Modal({ kind, projects, projectId, onClose, onTask, onProject, onCategory }) {
  const [title, setTitle] = useState(''); const [selectedProject, setSelectedProject] = useState(projectId || projects[0]?.id || '');
  const submit = (event) => { event.preventDefault(); if (kind === 'task') onTask({ title }); if (kind === 'project') onProject(title); if (kind === 'category') onCategory(title, selectedProject); };
  const heading = kind === 'task' ? '新建任务' : kind === 'project' ? '新建项目' : '新建分类';
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}><X size={17} /></button><h2>{heading}</h2><p>{kind === 'task' ? '先快速记下，之后再补充细节。' : '名称可以在创建后继续调整。'}</p><label>名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === 'task' ? '例如：整理周会纪要' : '输入名称'} /></label>{kind === 'category' && <label>归属项目<select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<button className="primary save" type="submit">创建</button></form></div>;
}

createRoot(document.getElementById('root')).render(<App />);
