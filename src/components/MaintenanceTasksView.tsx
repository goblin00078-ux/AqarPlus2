import React, { useState } from 'react';
import { Plus, Wrench, CheckSquare, ShieldCheck, X, Receipt } from 'lucide-react';
import { useAqar } from '../context/AqarContext';
import { MaintenanceTicket, TaskItem, TaskStatus, TicketPriority, TicketStatus } from '../types/aqar';
import { formatSar } from '../utils/formatters';
import { PrintViewButton } from './PrintViewButton';
import { MoveToArchiveButton } from './MoveToArchiveButton';
import { CreateTaskQuickButton } from './CreateTaskQuickModal';

export function MaintenanceTasksView() {
  const { state, currentUser, lang, hasPermission, mutate, pushToast } = useAqar();
  const [tab, setTab] = useState<'tickets' | 'tasks' | 'assets'>('tickets');
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [editingTicket, setEditingTicket] = useState<MaintenanceTicket | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [commentText, setCommentText] = useState('');

  const [ticketForm, setTicketForm] = useState({
    unitId: '',
    source: 'المشرف' as MaintenanceTicket['source'],
    category: 'تكييف وتبريد',
    priority: 'مرتفع' as TicketPriority,
    title: '',
    description: '',
    assignedTo: 'usr-tech',
    estimatedCost: 350,
    createLinkedTask: true,
  });

  const [ticketUpdate, setTicketUpdate] = useState({
    status: 'قيد التنفيذ' as TicketStatus,
    diagnosis: '',
    actualCost: 0,
    createExpenseInvoiceNo: '',
  });

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    type: 'فحص عقار',
    unitId: '',
    assignedTo: 'usr-tech',
    dueDate: '2026-11-18',
    priority: 'متوسط' as TicketPriority,
  });

  if (!state || !currentUser) return null;

  const activeTask = selectedTask ? state.tasks.find((t) => t.id === selectedTask.id) || null : null;

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitId = ticketForm.unitId || state.units[0]?.id;
    const unit = state.units.find((u) => u.id === unitId);
    if (!unit) return;
    const res = await mutate(
      'POST',
      '/api/tickets',
      {
        ...ticketForm,
        propertyId: unit.propertyId,
        unitId,
        actualCost: 0,
        status: ticketForm.assignedTo ? 'تم الإسناد' : 'جديد',
      },
      { offlineDescAr: `فتح بلاغ صيانة: ${ticketForm.title}` }
    );
    if (res) {
      pushToast('success', lang === 'ar' ? 'تم فتح البلاغ وتوليد مهمة للفني تلقائياً' : 'Ticket & task created');
      setShowNewTicket(false);
    }
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    const res = await mutate(
      'PATCH',
      `/api/tickets/${editingTicket.id}`,
      {
        status: ticketUpdate.status,
        diagnosis: ticketUpdate.diagnosis,
        actualCost: ticketUpdate.actualCost,
      },
      { offlineDescAr: `تحديث بلاغ ${editingTicket.ticketNumber}` }
    );

    if (res && ticketUpdate.createExpenseInvoiceNo.trim() && ticketUpdate.actualCost > 0 && !editingTicket.linkedExpenseId) {
      await mutate(
        'POST',
        '/api/expenses',
        {
          date: new Date().toISOString().slice(0, 10),
          category: 'صيانة',
          propertyId: editingTicket.propertyId,
          unitId: editingTicket.unitId,
          vendorId: editingTicket.vendorId,
          ticketId: editingTicket.id,
          invoiceNumber: ticketUpdate.createExpenseInvoiceNo.trim(),
          amount: ticketUpdate.actualCost,
          paymentMethod: 'تحويل بنكي',
          bearer: 'المالك',
          notes: `فاتورة تنفيذ بلاغ الصيانة ${editingTicket.ticketNumber}: ${editingTicket.title}`,
        },
        { offlineDescAr: `رفع فاتورة صيانة ${editingTicket.ticketNumber}` }
      );
      pushToast('success', 'تم تحديث البلاغ وربطه بمصروف رسمي في مسار الاعتماد والمحاسبة');
    } else if (res) {
      pushToast('success', 'تم تحديث بلاغ الصيانة');
    }
    setEditingTicket(null);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const unit = state.units.find((u) => u.id === taskForm.unitId);
    const res = await mutate(
      'POST',
      '/api/tasks',
      {
        ...taskForm,
        propertyId: unit?.propertyId,
        status: 'مسندة',
        checklist: [
          { text: 'بدء التنفيذ الميداني', done: false },
          { text: 'توثيق النتيجة وإغلاق المهمة', done: false },
        ],
      },
      { offlineDescAr: `إسناد مهمة ${taskForm.title}` }
    );
    if (res) {
      pushToast('success', 'تم إنشاء وإسناد المهمة بنجاح');
      setShowNewTask(false);
    }
  };

  const handleTaskStatus = async (taskId: string, status: TaskStatus) => {
    await mutate('PATCH', `/api/tasks/${taskId}`, { status }, { offlineDescAr: `تحديث مهمة إلى ${status}` });
  };

  const handleToggleChecklist = async (task: TaskItem, idx: number) => {
    const nextList = task.checklist.map((c, i) => (i === idx ? { ...c, done: !c.done } : c));
    await mutate('PATCH', `/api/tasks/${task.id}`, { checklist: nextList }, { offlineDescAr: 'تحديث خطوات المهمة' });
  };

  const handleAddTaskComment = async (task: TaskItem) => {
    if (!commentText.trim()) return;
    await mutate(
      'PATCH',
      `/api/tasks/${task.id}`,
      { commentText: commentText.trim() },
      { offlineDescAr: 'تعليق على مهمة' }
    );
    setCommentText('');
  };

  const taskColumns: { titleAr: string; statuses: TaskStatus[] }[] = [
    { titleAr: 'جديدة ومسندة', statuses: ['جديدة', 'مسندة'] },
    { titleAr: 'قيد التنفيذ', statuses: ['قيد التنفيذ', 'معلقة'] },
    { titleAr: 'بانتظار المراجعة', statuses: ['بانتظار المراجعة'] },
    { titleAr: 'مكتملة', statuses: ['مكتملة'] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/[0.06]">
          <button
            onClick={() => setTab('tickets')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              tab === 'tickets' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {lang === 'ar' ? `بلاغات الصيانة (${state.tickets.length})` : `Tickets (${state.tickets.length})`}
          </button>
          <button
            onClick={() => setTab('tasks')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              tab === 'tasks' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {lang === 'ar' ? `لوحة مهام الفريق (${state.tasks.length})` : `Team Tasks (${state.tasks.length})`}
          </button>
          <button
            onClick={() => setTab('assets')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              tab === 'assets' ? 'bg-white dark:bg-[#26478D] text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {lang === 'ar' ? `الأصول والضمانات (${state.assets.length})` : `Assets & Warranties`}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PrintViewButton />
          <CreateTaskQuickButton
            defaultType="صيانة"
            relatedLabel="مركز الصيانة والمهام"
            label={lang === 'ar' ? 'إسناد ذكي لمهمة' : 'Smart Assign Task'}
            compact
          />
          {hasPermission('manage_maintenance') && tab === 'tickets' && (
            <button
              onClick={() => setShowNewTicket(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'فتح بلاغ صيانة' : 'New Ticket'}</span>
            </button>
          )}
          {hasPermission('manage_tasks') && tab === 'tasks' && (
            <button
              onClick={() => setShowNewTask(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#26478D] text-white hover:bg-[#1e3a75] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'مهمة جديدة للفريق' : 'New Task'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Maintenance Tickets */}
      {tab === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {state.tickets.map((tkt) => {
            const prop = state.properties.find((p) => p.id === tkt.propertyId);
            const unit = state.units.find((u) => u.id === tkt.unitId);
            const assignee = state.users.find((u) => u.id === tkt.assignedTo);
            const linkedExp = state.expenses.find((e) => e.id === tkt.linkedExpenseId);
            return (
              <div key={tkt.id} className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500 font-mono-num">
                      {tkt.ticketNumber} · {tkt.category} · <span className={tkt.priority === 'عاجل' ? 'text-red-500 font-semibold' : 'text-amber-500 font-semibold'}>{tkt.priority}</span>
                    </div>
                    <h3 className="text-sm font-bold mt-1">{tkt.title}</h3>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {prop?.nameAr} · وحدة {unit?.unitNumber} · الفني: {assignee?.nameAr || 'غير مسند'}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#26478D] dark:text-blue-400 shrink-0">{tkt.status}</span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300">{tkt.description}</p>
                {tkt.diagnosis && (
                  <div className="text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10">
                    <strong>التشخيص الفني:</strong> {tkt.diagnosis}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-mono-num text-slate-500">
                    التقدير: {formatSar(tkt.estimatedCost, lang)} · الفعلي: {formatSar(tkt.actualCost, lang)}
                    {linkedExp && ` · مصروف ${linkedExp.expenseNumber} (${linkedExp.approvalStatus})`}
                  </div>
                  {hasPermission('execute_maintenance') && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => {
                          setEditingTicket(tkt);
                          setTicketUpdate({
                            status: tkt.status,
                            diagnosis: tkt.diagnosis || '',
                            actualCost: tkt.actualCost || tkt.estimatedCost,
                            createExpenseInvoiceNo: '',
                          });
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#26478D] text-white text-[11px] font-semibold cursor-pointer"
                      >
                        <Wrench className="w-3 h-3" />
                        <span>تحديث التنفيذ والتكلفة</span>
                      </button>
                      {!tkt.archivedAt && (tkt.status === 'مكتمل' || tkt.status === 'مغلق' || hasPermission('manage_properties')) && (
                        <MoveToArchiveButton
                          category="tickets"
                          entityId={tkt.id}
                          targetKind="ticket"
                          entityLabel={tkt.ticketNumber}
                          compact
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Team Tasks Kanban */}
      {tab === 'tasks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {taskColumns.map((col) => {
            const colTasks = state.tasks.filter((t) => col.statuses.includes(t.status));
            return (
              <div key={col.titleAr} className="p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold">{col.titleAr}</span>
                  <span className="text-xs font-mono-num text-slate-500">{colTasks.length}</span>
                </div>
                <div className="space-y-2.5">
                  {colTasks.map((task) => {
                    const assignee = state.users.find((u) => u.id === task.assignedTo);
                    const doneCount = task.checklist.filter((c) => c.done).length;
                    return (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]/60 hover:border-[#26478D]/50 cursor-pointer space-y-2"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>{task.type}</span>
                          <span className={task.priority === 'عاجل' ? 'text-red-500 font-semibold' : ''}>{task.priority}</span>
                        </div>
                        <div className="text-xs font-semibold">{task.title}</div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                          <span className="truncate max-w-[130px]">{assignee?.nameAr}</span>
                          <span className="font-mono-num">
                            {doneCount}/{task.checklist.length} · {task.dueDate}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: Assets & Warranties */}
      {tab === 'assets' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.assets.map((ast) => {
            const prop = state.properties.find((p) => p.id === ast.propertyId);
            const unit = state.units.find((u) => u.id === ast.unitId);
            return (
              <div key={ast.id} className="p-5 rounded-2xl border border-slate-200 dark:border-white/10 glass-surface flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-500">
                    {prop?.nameAr} · وحدة {unit?.unitNumber} · {ast.category}
                  </div>
                  <div className="text-sm font-bold mt-1">{ast.name}</div>
                  <div className="text-xs text-slate-500 font-mono-num mt-1">
                    SN: {ast.serialNumber} · {ast.brand} · شراء {ast.purchaseDate}
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>ضمان حتى {ast.warrantyExpiry}</span>
                  </div>
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">{ast.condition}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Update Ticket & Link Expense Modal */}
      {editingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleUpdateTicket}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">تحديث بلاغ الصيانة ({editingTicket.ticketNumber})</h3>
              <button type="button" onClick={() => setEditingTicket(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <select
                value={ticketUpdate.status}
                onChange={(e) => setTicketUpdate({ ...ticketUpdate, status: e.target.value as TicketStatus })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="تم الإسناد">تم الإسناد</option>
                <option value="قيد التشخيص">قيد التشخيص</option>
                <option value="بانتظار اعتماد التكلفة">بانتظار اعتماد التكلفة</option>
                <option value="قيد التنفيذ">قيد التنفيذ</option>
                <option value="مكتمل">مكتمل</option>
                <option value="مغلق">مغلق</option>
              </select>
              <textarea
                rows={2}
                placeholder="التشخيص الفني والأعمال المنفذة..."
                value={ticketUpdate.diagnosis}
                onChange={(e) => setTicketUpdate({ ...ticketUpdate, diagnosis: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="التكلفة الفعلية (ر.س)"
                  value={ticketUpdate.actualCost}
                  onChange={(e) => setTicketUpdate({ ...ticketUpdate, actualCost: Number(e.target.value) })}
                  className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                />
                {!editingTicket.linkedExpenseId && (
                  <input
                    placeholder="رقم فاتورة لربطها كمصروف (اختياري)"
                    value={ticketUpdate.createExpenseInvoiceNo}
                    onChange={(e) => setTicketUpdate({ ...ticketUpdate, createExpenseInvoiceNo: e.target.value })}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
                  />
                )}
              </div>
              {!editingTicket.linkedExpenseId && (
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5" />
                  <span>إدخال رقم فاتورة سيرفع التكلفة تلقائياً إلى دورة اعتماد المصروفات وكشف المالك.</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingTicket(null)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                حفظ التحديث
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Task Detail Modal */}
      {activeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500">
                  {activeTask.type} · تسليم <span className="font-mono-num">{activeTask.dueDate}</span>
                </div>
                <h3 className="text-base font-bold mt-0.5">{activeTask.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                {!activeTask.archivedAt && hasPermission('execute_maintenance') && (
                  <MoveToArchiveButton
                    category="tickets"
                    entityId={activeTask.id}
                    targetKind="task"
                    entityLabel={activeTask.title}
                    compact
                    onArchived={() => setSelectedTask(null)}
                  />
                )}
                <button onClick={() => setSelectedTask(null)} className="cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">{activeTask.description}</p>

            {/* Status Switch */}
            <div className="flex flex-wrap gap-1.5">
              {(['جديدة', 'مسندة', 'قيد التنفيذ', 'بانتظار المراجعة', 'مكتملة', 'معلقة'] as TaskStatus[]).map((st) => (
                <button
                  key={st}
                  onClick={() => handleTaskStatus(activeTask.id, st)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                    activeTask.status === st
                      ? 'bg-[#26478D] text-white border-[#26478D]'
                      : 'border-slate-200 dark:border-white/10'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>خطوات التنفيذ</span>
              </div>
              {activeTask.checklist.map((step, i) => (
                <label key={i} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={step.done} onChange={() => handleToggleChecklist(activeTask, i)} />
                  <span className={step.done ? 'line-through text-slate-400' : ''}>{step.text}</span>
                </label>
              ))}
            </div>

            {/* Comments */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <div className="text-xs font-semibold">التعليقات والمتابعة</div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {activeTask.comments.map((c) => (
                  <div key={c.id} className="text-xs p-2 rounded-lg bg-slate-50 dark:bg-white/[0.03]">
                    <strong>{c.authorName}:</strong> {c.text}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="أضف تحديثاً للفريق..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
                />
                <button
                  onClick={() => handleAddTaskComment(activeTask)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#26478D] text-white cursor-pointer"
                >
                  إرسال
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      {showNewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateTicket}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">فتح بلاغ صيانة رسمي</h3>
              <button type="button" onClick={() => setShowNewTicket(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <select
                value={ticketForm.unitId || state.units[0]?.id}
                onChange={(e) => setTicketForm({ ...ticketForm, unitId: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {state.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unitNumber}
                  </option>
                ))}
              </select>
              <select
                value={ticketForm.category}
                onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="تكييف وتبريد">تكييف وتبريد</option>
                <option value="سباكة">سباكة</option>
                <option value="كهرباء">كهرباء</option>
                <option value="أبواب وأقفال">أبواب وأقفال</option>
                <option value="نظافة">نظافة</option>
              </select>
              <input
                required
                placeholder="عنوان العطل"
                value={ticketForm.title}
                onChange={(e) => setTicketForm({ ...ticketForm, title: e.target.value })}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <textarea
                required
                rows={2}
                placeholder="وصف المشكلة..."
                value={ticketForm.description}
                onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <select
                value={ticketForm.priority}
                onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value as TicketPriority })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                <option value="عاجل">عاجل</option>
                <option value="مرتفع">مرتفع</option>
                <option value="متوسط">متوسط</option>
                <option value="منخفض">منخفض</option>
              </select>
              <input
                type="number"
                placeholder="التكلفة التقديرية"
                value={ticketForm.estimatedCost}
                onChange={(e) => setTicketForm({ ...ticketForm, estimatedCost: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewTicket(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                حفظ وإسناد للفني
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Task Modal */}
      {showNewTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateTask}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13192B] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">إضافة مهمة تشغيلية للفريق</h3>
              <button type="button" onClick={() => setShowNewTask(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <input
                required
                placeholder="عنوان المهمة"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <textarea
                rows={2}
                placeholder="التفاصيل"
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent"
              />
              <select
                value={taskForm.assignedTo}
                onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A0E1A]"
              >
                {state.users
                  .filter((u) => u.role !== 'owner')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nameAr} ({u.roleLabelAr})
                    </option>
                  ))}
              </select>
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-transparent font-mono-num"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowNewTask(false)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#26478D] text-white cursor-pointer">
                إسناد المهمة
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
