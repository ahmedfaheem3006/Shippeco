import React, { useState, useEffect } from 'react';
import { X, ClipboardList, Send, User } from 'lucide-react';
import { tasksService } from '../../services/tasks.service';
import { unifiedService } from '../../services/unifiedService';

interface CreateTaskModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ onClose, onCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState<number>(0);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await unifiedService.get<any>('/users/list');
        setUsers(res.success ? res.data : res);
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    };
    fetchUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !assignedTo) return;

    setLoading(true);
    try {
      await tasksService.createTask({
        title,
        description,
        assigned_to: assignedTo
      });
      onCreated();
    } catch (err) {
      alert('فشل في إنشاء المهمة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
        
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <ClipboardList size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">إسناد مهمة جديدة</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mr-1">عنوان المهمة</label>
            <input 
              type="text" 
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: مراجعة فواتير شركة ارامكس"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mr-1">الموظف المسئول</label>
            <div className="relative">
              <select 
                required
                value={assignedTo}
                onChange={(e) => setAssignedTo(Number(e.target.value))}
                className="w-full px-10 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none appearance-none transition-all dark:text-white"
              >
                <option value={0}>اختر الموظف...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                ))}
              </select>
              <User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mr-1">التفاصيل</label>
            <textarea 
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب تفاصيل المهمة هنا..."
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white resize-none"
            ></textarea>
          </div>

          <div className="pt-2">
            <button 
              type="submit" 
              disabled={loading || !title || !assignedTo}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50"
            >
              {loading ? 'جاري الإرسال...' : (
                <>
                  <Send size={18} />
                  إرسال المهمة للموظف
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
