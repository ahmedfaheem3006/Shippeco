const fs = require('fs');
const file = 'a:/work/Full_Stack/Project/Shippeco/ShipPec/Frontend/src/pages/ReconcilePage.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add "الفواتير السابقة" button
const btnHtml = `
          <button 
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border border-indigo-100 dark:border-indigo-800/30 hover:bg-indigo-600 hover:text-white rounded-xl shadow-sm transition-all"
            onClick={() => { setHistoryModalOpen(true); void loadHistory(); }}
          >
            <ListTodo size={16} />
            الفواتير السابقة
          </button>
`;

code = code.replace(
  '{backfillLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}\n            استعادة البولايص المفقودة\n          </button>',
  '{backfillLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}\n            استعادة البولايص المفقودة\n          </button>\n' + btnHtml
);

// 2. Add History Modal at the bottom
const historyModalStr = `
      {/* ─── History Modal ─── */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setHistoryModalOpen(false)} />
          <div className="relative bg-white dark:bg-slate-800 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-100 dark:border-slate-700/50 flex justify-between items-center bg-gray-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <ListTodo size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg leading-tight">الفواتير السابقة</h3>
                  <p className="text-[11px] text-gray-500 font-medium mt-0.5">سجل مطابقات فواتير DHL السابقة المعتمدة</p>
                </div>
              </div>
              <button onClick={() => setHistoryModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30 dark:bg-slate-900/20">
              {historyLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 size={32} className="animate-spin text-indigo-500" />
                </div>
              ) : historyList.length === 0 ? (
                <div className="text-center py-12 text-gray-500 font-bold">لا يوجد فواتير سابقة</div>
              ) : (
                <div className="space-y-3">
                  {historyList.map(h => (
                    <div key={h.id} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:shadow-md transition-all">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">{h.file_name}</span>
                          <span className="text-[10px] bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-md text-gray-600 dark:text-gray-400 font-inter">{new Date(h.upload_date).toLocaleString('ar-EG')}</span>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs font-bold text-gray-600 dark:text-gray-300">
                          <div className="flex items-center gap-1.5"><span className="text-indigo-500">DHL:</span> <span className="font-inter">{Number(h.total_dhl_amount).toFixed(2)} ر.س</span></div>
                          <div className="flex items-center gap-1.5"><span className="text-blue-500">دفترة:</span> <span className="font-inter">{Number(h.total_platform_amount).toFixed(2)} ر.س</span></div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-500">الفرق:</span> 
                            <span className={\`font-inter \${Number(h.difference) < 0 ? 'text-red-500' : 'text-green-500'}\`}>
                              {Number(h.difference) > 0 ? '+' : ''}{Number(h.difference).toFixed(2)} ر.س
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <select 
                          value={h.assigned_client_id || ''}
                          onChange={async (e) => {
                            const val = e.target.value ? Number(e.target.value) : null;
                            try {
                              await reconcileApiService.assignClient(h.id, val);
                              setHistoryList(historyList.map(x => x.id === h.id ? { ...x, assigned_client_id: val } : x));
                            } catch(err) { console.error(err); alert('فشل تعيين العميل'); }
                          }}
                          className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold min-w-[150px]"
                        >
                          <option value="">-- تعيين عميل --</option>
                          {/* We don't have clientsList explicitly fetched here, so we use usersList for now, or you can add a clientsList state */}
                          {usersList.map(u => (
                            <option key={u.id} value={u.id}>{u.full_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
`;

code = code.replace('    </div>\n  )\n}\n', historyModalStr + '    </div>\n  )\n}\n');

fs.writeFileSync(file, code);
console.log('done');
