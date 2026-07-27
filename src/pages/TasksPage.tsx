import React, { useState, useEffect } from 'react';
import { Plus, ClipboardList, Clock, CheckCircle2, Search, User, ChevronLeft } from 'lucide-react';
import { tasksService, type Task } from '../services/tasks.service';
import { useAuthStore } from '../hooks/useAuthStore';
import { CreateTaskModal } from '../components/Tasks/CreateTaskModal';
import { TaskDetailsModal } from '../components/Tasks/TaskDetailsModal';

export const TasksPage: React.FC = () => {
  const user = useAuthStore(s => s.user);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  type FilterTab = 'all' | 'mine' | 'open' | 'closed';
  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params: { status?: string; scope?: string } = {};
      if (statusFilter === 'mine') {
        params.scope = 'mine';
      } else if (statusFilter === 'open') {
        params.status = 'open';
      } else if (statusFilter === 'closed') {
        params.status = 'closed';
      }
      const data = await tasksService.getTasks(params);
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [statusFilter]);

  const filteredTasks = tasks.filter(t => 
    t.title.toLowerCase().includes(search.toLowerCase()) || 
    t.assigned_to_name?.toLowerCase().includes(search.toLowerCase())
  );

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'الكل' },
    ...(isAdmin ? [{ id: 'mine' as const, label: 'مهامي' }] : []),
    { id: 'open', label: 'مفتوحة' },
    { id: 'closed', label: 'مغلقة' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-500/20">
              <ClipboardList size={24} />
            </div>
            {isManager ? 'المهام المسؤل عنها' : 'مهامي المستلمة'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">إدارة ومتابعة المهام المسندة ونتائج التنفيذ</p>
        </div>
        {isManager && (
          <button 
            onClick={() => setShowCreateModal(true)}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/25 active:scale-95"
          >
            <Plus size={20} />
            إسناد مهمة جديدة
          </button>
        )}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <ClipboardList size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">إجمالي المهام</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white font-inter">{tasks.length}</div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
            <Clock size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">مهام مفتوحة</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white font-inter">
              {tasks.filter(t => t.status === 'open').length}
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">مهام مكتملة</div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white font-inter">
              {tasks.filter(t => t.status === 'closed').length}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="بحث في عنوان المهمة أو الموظف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-12 pl-4 py-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm dark:text-white"
          />
        </div>
        <div className="flex bg-white dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-5 py-2 text-xs font-bold rounded-xl transition-all ${
                statusFilter === tab.id 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold">جاري تحميل المهام...</p>
        </div>
      ) : filteredTasks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredTasks.map((task) => (
            <div 
              key={task.id}
              onClick={() => setSelectedTaskId(task.id)}
              className="group bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-xl hover:border-indigo-200 dark:hover:border-indigo-900 transition-all cursor-pointer overflow-hidden flex flex-col"
            >
              <div className="p-6 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                      task.status === 'open' 
                        ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' 
                        : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                    }`}>
                      {task.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                    </div>
                    {task.invoice_id && (
                      <div className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100 dark:border-blue-800/30">
                        فاتورة #{task.invoice_number || task.invoice_id}
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(task.created_at).toLocaleDateString('ar-SA')}
                  </div>
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2">{task.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs line-clamp-3 leading-relaxed mb-4">{task.description || 'بدون وصف إضافي'}</p>

                {task.invoice_id && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50 grid grid-cols-2 gap-3 text-xs bg-slate-50/50 dark:bg-slate-900/10 p-3 rounded-2xl">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">رقم البوليصة AWB:</span>
                      <span className="font-mono font-extrabold text-slate-800 dark:text-slate-200 select-all">{task.invoice_awb || '—'}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 text-left">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">قيمة الفاتورة:</span>
                      <span className="font-inter font-black text-indigo-600 dark:text-indigo-400">
                        {task.invoice_total !== undefined && task.invoice_total !== null ? `${parseFloat(task.invoice_total as any).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR` : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 col-span-2 mt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">حالة السداد:</span>
                      <div>
                        {(() => {
                          const statusMap: Record<number, { label: string; cls: string }> = {
                            0: { label: 'غير مدفوعة 🔴', cls: 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 border-red-100 dark:border-red-900/30' },
                            1: { label: 'دفعة جزئية 🟡', cls: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-950/20 dark:text-yellow-400 border-yellow-100 dark:border-yellow-900/30' },
                            2: { label: 'مدفوعة بالكامل ✅', cls: 'bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400 border-green-100 dark:border-green-900/30' },
                            3: { label: 'مرتجعة 🟣', cls: 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400 border-purple-100 dark:border-purple-900/30' },
                          };
                          const pStatus = task.invoice_payment_status ?? 0;
                          const s = statusMap[pStatus] || statusMap[0];
                          return (
                            <span className={`inline-flex px-2.5 py-1 rounded-xl text-[10px] font-black border ${s.cls}`}>
                              {s.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-50 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <User size={14} />
                  </div>
                  <div className="text-[11px]">
                    <div className="text-slate-400 font-bold uppercase scale-90 origin-right">المكلف بها</div>
                    <div className="text-slate-700 dark:text-slate-300 font-bold">{task.assigned_to_name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                  <span>التفاصيل</span>
                  <ChevronLeft size={14} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-20 flex flex-col items-center justify-center text-center">
          <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-full mb-4">
            <ClipboardList size={48} className="text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">لا توجد مهام حالياً</h3>
          <p className="text-slate-500 mt-2">ابدأ بإسناد أول مهمة للموظفين لمتابعة سير العمل</p>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateTaskModal 
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadTasks();
          }}
        />
      )}

      {selectedTaskId && (
        <TaskDetailsModal 
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={loadTasks}
        />
      )}
    </div>
  );
};
