import React, { useState, useEffect, useRef } from 'react';
import { X, Send, User, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react';
import { tasksService, type Task } from '../../services/tasks.service';
import { useAuthStore } from '../../hooks/useAuthStore';

interface TaskDetailsModalProps {
  taskId: number;
  onClose: () => void;
  onUpdate: () => void;
}

export const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ taskId, onClose, onUpdate }) => {
  const user = useAuthStore(s => s.user);
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadTask = async () => {
    try {
      const data = await tasksService.getTask(taskId);
      setTask(data);
    } catch (err) {
      console.error('Failed to load task:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTask();
    // Poll for new messages every 10 seconds
    const interval = setInterval(loadTask, 10000);
    return () => clearInterval(interval);
  }, [taskId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task?.messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const msg = await tasksService.addMessage(taskId, newMessage);
      setTask(prev => prev ? { ...prev, messages: [...(prev.messages || []), msg] } : null);
      setNewMessage('');
    } catch (err) {
      alert('فشل في إرسال الرسالة');
    } finally {
      setSending(false);
    }
  };

  const toggleStatus = async () => {
    if (!task) return;
    const newStatus = task.status === 'open' ? 'closed' : 'open';
    try {
      await tasksService.updateStatus(taskId, newStatus);
      setTask({ ...task, status: newStatus });
      onUpdate();
    } catch (err) {
      alert('فشل في تغيير حالة المهمة');
    }
  };

  if (loading) return null;
  if (!task) return null;

  const isManager = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 w-full max-w-2xl h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${task.status === 'open' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>
              <MessageSquare size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{task.title}</h2>
              <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><User size={14} /> من: {task.assigned_by_name}</span>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span className="flex items-center gap-1"><User size={14} /> إلى: {task.assigned_to_name}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Description */}
          <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">وصف المهمة</div>
            <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{task.description || 'لا يوجد وصف'}</p>
          </div>

          {/* Messages */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-700"></div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest px-4">المناقشات</span>
              <div className="h-px flex-1 bg-slate-100 dark:bg-slate-700"></div>
            </div>

            <div className="space-y-4">
              {task.messages?.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.user_id === user?.id ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                    msg.user_id === user?.id 
                      ? 'bg-indigo-600 text-white rounded-br-none shadow-lg shadow-indigo-200 dark:shadow-none' 
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'
                  }`}>
                    <div className="flex items-center gap-2 mb-1 opacity-70 text-[10px] font-bold">
                      <span>{msg.user_name}</span>
                      <span>•</span>
                      <span>{new Date(msg.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="leading-relaxed font-medium">{msg.message}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Status Toggle & Input */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 space-y-4">
          
          {/* Manager Actions */}
          {isManager && (
            <div className="flex items-center justify-between gap-4 p-3 bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${task.status === 'open' ? 'bg-indigo-500' : 'bg-green-500'}`}></div>
                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">
                  حالة المهمة: {task.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                </span>
              </div>
              <button 
                onClick={toggleStatus}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  task.status === 'open' 
                    ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                    : 'bg-green-50 text-green-600 hover:bg-green-100'
                }`}
              >
                {task.status === 'open' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                {task.status === 'open' ? 'إغلاق المهمة' : 'إعادة فتح المهمة'}
              </button>
            </div>
          )}

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="relative">
            <input 
              type="text" 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={task.status === 'closed' ? 'هذه المهمة مغلقة...' : 'اكتب تعليقك هنا...'}
              disabled={task.status === 'closed' && !isManager}
              className="w-full pl-14 pr-6 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
            />
            <button 
              type="submit" 
              disabled={!newMessage.trim() || sending || (task.status === 'closed' && !isManager)}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
