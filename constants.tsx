import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
} from 'recharts';
import { GoogleGenAI, Type } from "@google/genai";
import { Habit, DashboardState, WeekColor, VoiceNote } from './types';
import { INITIAL_HABITS } from './constants';

interface UndoState {
  habitId: string;
  dayIndex?: number;
  previousHabits: Habit[];
  habitName: string;
  type: 'toggle' | 'delete';
}

interface AIAnalysis {
  performanceReview: string;
  weakPoints: string;
  nextMonthStrategy: string;
  translatedReview?: string;
  translatedWeakPoints?: string;
  translatedStrategy?: string;
}

const App: React.FC = () => {
  const now = new Date();
  const currentMonthName = now.toLocaleString('default', { month: 'long' }).toUpperCase();
  const currentDayNumber = now.getDate();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth();

  const daysInMonth = useMemo(() => new Date(currentYear, currentMonthIdx + 1, 0).getDate(), [currentYear, currentMonthIdx]);
  const startDayOfMonth = new Date(currentYear, currentMonthIdx, 1).getDay();
  const DAYS_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const [state, setState] = useState<DashboardState>(() => {
    const saved = localStorage.getItem('looser_habits');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        habits: parsed.habits.map((h: Habit) => ({
          ...h,
          completions: h.completions.length === daysInMonth ? h.completions : Array(daysInMonth).fill(false),
          color: h.color || '#64748b',
          category: h.category || 'GEN',
          categoryColor: h.categoryColor || '#1e293b'
        })),
        voiceNotes: parsed.voiceNotes || []
      };
    }
    return {
      habits: INITIAL_HABITS.map(h => ({ 
        ...h, 
        completions: Array(daysInMonth).fill(false), 
        color: h.color || '#64748b', 
        category: 'GEN',
        categoryColor: '#1e293b'
      })),
      voiceNotes: [],
      month: currentMonthName,
      year: currentYear,
      userName: 'FAHAD ADNAN'
    };
  });

  const [darkMode, setDarkMode] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [isAddingHabit, setIsAddingHabit] = useState(false);
  const [deletingHabit, setDeletingHabit] = useState<Habit | null>(null);
  
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitGoal, setNewHabitGoal] = useState(15);
  const [newHabitColor, setNewHabitColor] = useState('#64748b');
  const [newHabitCategory, setNewHabitCategory] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#1e293b');

  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showBengali, setShowBengali] = useState(false);

  const [undoInfo, setUndoInfo] = useState<UndoState | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  // Audio Recorder State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    localStorage.setItem('looser_habits', JSON.stringify(state));
  }, [state]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const newNote: VoiceNote = {
          id: Date.now().toString(),
          url: url,
          timestamp: Date.now()
        };
        setState(prev => ({
          ...prev,
          voiceNotes: [newNote, ...(prev.voiceNotes || [])].slice(0, 50)
        }));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const deleteVoiceNote = (id: string) => {
    setState(prev => ({
      ...prev,
      voiceNotes: prev.voiceNotes.filter(vn => vn.id !== id)
    }));
  };

  const toggleHabit = (habitId: string, dayIndex: number) => {
    if (dayIndex + 1 < currentDayNumber) {
      alert("FAILED PROTOCOL: Past days are locked for history. You cannot alter your legacy.");
      return;
    }

    const targetHabit = state.habits.find(h => h.id === habitId);
    if (!targetHabit) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    
    setUndoInfo({
      habitId,
      dayIndex,
      previousHabits: JSON.parse(JSON.stringify(state.habits)),
      habitName: targetHabit.name,
      type: 'toggle'
    });
    
    setState(prev => ({
      ...prev,
      habits: prev.habits.map(h => 
        h.id === habitId 
          ? { ...h, completions: h.completions.map((c, i) => i === dayIndex ? !c : c) }
          : h
      )
    }));
    undoTimerRef.current = window.setTimeout(() => setUndoInfo(null), 5000) as unknown as number;
  };

  const initiateDelete = (habit: Habit) => {
    setDeletingHabit(habit);
  };

  const confirmDelete = () => {
    if (!deletingHabit) return;
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);

    setUndoInfo({
      habitId: deletingHabit.id,
      previousHabits: JSON.parse(JSON.stringify(state.habits)),
      habitName: deletingHabit.name,
      type: 'delete'
    });

    setState(prev => ({
      ...prev,
      habits: prev.habits.filter(h => h.id !== deletingHabit.id)
    }));
    
    setDeletingHabit(null);
    undoTimerRef.current = window.setTimeout(() => setUndoInfo(null), 5000) as unknown as number;
  };

  const handleUndo = () => {
    if (undoInfo) {
      setState(prev => ({ ...prev, habits: undoInfo.previousHabits }));
      setUndoInfo(null);
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    }
  };

  const addHabit = () => {
    if (!newHabitName.trim()) return;
    const cat = newHabitCategory.trim().toUpperCase() || 'GEN';
    const newHabit: Habit = {
      id: Date.now().toString(),
      name: newHabitName.trim(),
      goal: Math.max(1, Math.min(daysInMonth, newHabitGoal)),
      completions: Array(daysInMonth).fill(false),
      color: newHabitColor,
      category: cat,
      categoryColor: newCategoryColor
    };
    setState(prev => ({ ...prev, habits: [...prev.habits, newHabit] }));
    setNewHabitName('');
    setNewHabitCategory('');
    setIsAddingHabit(false);
  };

  const updateGoal = (habitId: string, newGoal: number) => {
    const clampedGoal = Math.max(1, Math.min(daysInMonth, newGoal));
    setState(prev => ({
      ...prev,
      habits: prev.habits.map(h => h.id === habitId ? { ...h, goal: clampedGoal } : h)
    }));
    setEditingGoalId(null);
  };

  const updateNameOnly = (habitId: string, newName: string) => {
    setState(prev => ({
      ...prev,
      habits: prev.habits.map(h => h.id === habitId ? { ...h, name: newName.trim() || h.name } : h)
    }));
  };

  const totalPossibleSlots = useMemo(() => state.habits.length * daysInMonth, [state.habits.length, daysInMonth]);
  const totalCompleted = useMemo(() => state.habits.reduce((acc, h) => acc + h.completions.filter(Boolean).length, 0), [state.habits]);
  const globalProgress = totalPossibleSlots > 0 ? Math.round((totalCompleted / totalPossibleSlots) * 100) : 0;

  const missedPotential = useMemo(() => {
    if (state.habits.length === 0) return 0;
    let missedCount = 0;
    state.habits.forEach(habit => {
      for (let i = 0; i < currentDayNumber - 1; i++) {
        if (!habit.completions[i]) missedCount++;
      }
    });
    return totalPossibleSlots > 0 ? Math.round((missedCount / totalPossibleSlots) * 100) : 0;
  }, [state.habits, currentDayNumber, totalPossibleSlots]);

  const weeklyData = useMemo(() => {
    const weeksCount = Math.ceil(daysInMonth / 7);
    const weeks = Array.from({ length: weeksCount }, (_, idx) => {
      const start = idx * 7;
      const end = Math.min((idx + 1) * 7, daysInMonth);
      return { name: `W${idx + 1}`, completed: 0, total: state.habits.length * (end - start) };
    });
    state.habits.forEach(h => {
      h.completions.forEach((c, i) => {
        if (c) {
          const weekIdx = Math.floor(i / 7);
          if (weeks[weekIdx]) weeks[weekIdx].completed++;
        }
      });
    });
    return weeks.map(w => ({ ...w, progress: w.total > 0 ? Math.round((w.completed / w.total) * 100) : 0 }));
  }, [state.habits, daysInMonth]);

  const topHabits = useMemo(() => {
    return [...state.habits]
      .map(h => ({ ...h, perf: Math.round((h.completions.filter(Boolean).length / daysInMonth) * 100) }))
      .sort((a, b) => b.perf - a.perf)
      .slice(0, 10);
  }, [state.habits, daysInMonth]);

  const getStreak = (completions: boolean[]) => {
    let current = 0, longest = 0, temp = 0;
    for (const c of completions) {
      if (c) temp++;
      else { longest = Math.max(longest, temp); temp = 0; }
    }
    longest = Math.max(longest, temp);
    for (let i = completions.length - 1; i >= 0; i--) { if (completions[i]) current++; else break; }
    return { current, longest };
  };

  const generateAIAnalysis = async () => {
    setIsAiLoading(true);
    setAiAnalysis(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const currentStats = state.habits.map(h => ({
        name: h.name,
        done: h.completions.filter(Boolean).length,
        goal: h.goal,
        daysPassed: currentDayNumber
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze habit stats: ${JSON.stringify(currentStats)}. Calculating lost potential based on missed goals vs current day (${currentDayNumber}/${daysInMonth}). 
        Total Lost Potential: ${missedPotential}%. 
        Provide a JSON object with: 1. performanceReview (English), 2. weakPoints (English), 3. nextMonthStrategy (English), 4. translatedReview (Bengali translation), 5. translatedWeakPoints (Bengali translation), 6. translatedStrategy (Bengali translation). 
        Mention the ${missedPotential}% specifically.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              performanceReview: { type: Type.STRING },
              weakPoints: { type: Type.STRING },
              nextMonthStrategy: { type: Type.STRING },
              translatedReview: { type: Type.STRING },
              translatedWeakPoints: { type: Type.STRING },
              translatedStrategy: { type: Type.STRING }
            },
            required: ["performanceReview", "weakPoints", "nextMonthStrategy", "translatedReview", "translatedWeakPoints", "translatedStrategy"]
          }
        }
      });
      setAiAnalysis(JSON.parse(response.text));
      setShowBengali(false);
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsAiLoading(false); 
    }
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 transition-colors duration-300 relative ${darkMode ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* Undo Snackbar */}
      {undoInfo && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-bounce-short">
          <div className={`flex flex-col overflow-hidden shadow-2xl rounded-2xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} min-w-[350px]`}>
            <div className="flex items-center justify-between p-4 gap-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${undoInfo.type === 'delete' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                  <i className={`fas ${undoInfo.type === 'delete' ? 'fa-trash-restore' : 'fa-history'}`}></i>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 leading-none mb-1">{undoInfo.type === 'delete' ? 'Habit Expunged' : 'State Reverted'}</p>
                  <p className="text-sm font-bold truncate max-w-[160px]">{undoInfo.habitName}</p>
                </div>
              </div>
              <button onClick={handleUndo} className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-black px-4 py-2 rounded-lg hover:scale-105 transition-transform uppercase tracking-tighter">Undo Action</button>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700">
              <div className={`h-full animate-shrink-width ${undoInfo.type === 'delete' ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ animationDuration: '5s' }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingHabit && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-sm rounded-[2rem] p-8 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)] border transition-all scale-100 animate-in zoom-in-95 duration-200 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h3 className="text-2xl font-black text-center mb-2 tracking-tighter uppercase">Exile Habit?</h3>
            <p className="text-slate-400 text-center text-sm font-medium mb-8 leading-relaxed">
              Are you sure about removing <span className="font-bold text-slate-800 dark:text-slate-200 underline decoration-rose-500/30">"{deletingHabit.name}"</span>? Permanent loss protocol starts in 5s.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmDelete} className="w-full bg-rose-500 hover:bg-rose-600 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-rose-500/20 transition-all active:scale-95">CONFIRM EXPULSION</button>
              <button onClick={() => setDeletingHabit(null)} className={`w-full py-4 rounded-2xl font-bold text-sm transition-all ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-100 hover:bg-slate-200'}`}>CANCEL</button>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
        <div className="text-center md:text-left">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-1">NO MORE TIME</h1>
          <p className="text-lg md:text-xl font-medium text-slate-400 tracking-widest uppercase">IMAGINE YOUR FAILURES</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Commander</p>
            <p className="text-2xl font-black tracking-tight">{state.userName}</p>
          </div>
          <button onClick={() => setDarkMode(!darkMode)} className="w-12 h-12 rounded-full flex items-center justify-center bg-white shadow-lg text-slate-800 hover:scale-110 transition-transform">
            <i className={`fas ${darkMode ? 'fa-sun' : 'fa-moon'}`}></i>
          </button>
        </div>
      </header>

      <div className={`rounded-3xl shadow-2xl overflow-hidden border transition-colors ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className={`p-4 border-b flex items-center gap-2 ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-rose-400"></div>
            <div className="w-3 h-3 rounded-full bg-amber-400"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
          </div>
          <div className="mx-auto font-bold tracking-widest text-sm text-slate-400 uppercase">- {currentMonthName} SYSTEM -</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
          <div className="lg:col-span-4 border-r border-slate-200 p-6 flex flex-col gap-6">
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="flex-1 w-full space-y-4">
                <div className={`p-4 rounded-xl flex justify-between items-center ${darkMode ? 'bg-emerald-900/20' : 'bg-emerald-50'}`}>
                  <span className="font-bold text-xs uppercase text-emerald-600">Captured</span>
                  <span className="text-2xl font-black text-emerald-600">{globalProgress}%</span>
                </div>
                <div className={`p-4 rounded-xl flex justify-between items-center ${darkMode ? 'bg-rose-900/20' : 'bg-rose-50'}`}>
                  <span className="font-bold text-xs uppercase text-rose-600">Permanently Lost</span>
                  <span className="text-2xl font-black text-rose-600">{missedPotential}%</span>
                </div>
                <div className={`p-4 rounded-xl flex justify-between items-center ${darkMode ? 'bg-slate-900/40' : 'bg-slate-100'}`}>
                  <span className="font-bold text-xs uppercase text-slate-500">Day Vector</span>
                  <span className="text-2xl font-black text-slate-500">{currentDayNumber}</span>
                </div>
              </div>

              <div className="relative w-40 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[{ name: 'Captured', value: globalProgress }, { name: 'Lost', value: missedPotential }, { name: 'Void', value: 100 - (globalProgress + missedPotential) }]} innerRadius={50} outerRadius={70} startAngle={90} endAngle={450} dataKey="value">
                      <Cell fill="#10b981" />
                      <Cell fill="#f43f5e" />
                      <Cell fill={darkMode ? "#334155" : "#f1f5f9"} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black">{globalProgress}%</span>
                  <span className="text-[8px] font-black uppercase text-slate-400">Captured</span>
                </div>
              </div>
            </div>

            <div className={`p-5 rounded-2xl border border-dashed transition-all relative ${darkMode ? 'bg-indigo-900/10 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-indigo-500 flex items-center gap-2">
                    <i className="fas fa-brain animate-pulse"></i> AI CORE AUDIT
                  </h3>
                  {aiAnalysis && (
                    <button 
                      onClick={() => setShowBengali(!showBengali)}
                      className={`text-[9px] font-black px-2 py-1 rounded border transition-all ${showBengali ? 'bg-indigo-500 text-white border-indigo-500' : 'text-slate-400 border-slate-300 hover:border-indigo-400'}`}
                    >
                      {showBengali ? 'ENGLISH' : 'TRANSLATE (বাংলা)'}
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                   {aiAnalysis && (
                     <button onClick={() => setAiAnalysis(null)} className="text-slate-400 hover:text-rose-500 transition-colors p-1">
                       <i className="fas fa-times text-[10px]"></i>
                     </button>
                   )}
                   <button 
                     onClick={generateAIAnalysis}
                     disabled={isAiLoading}
                     className="text-[10px] font-black bg-indigo-500 text-white px-3 py-1.5 rounded-full hover:bg-indigo-600 disabled:opacity-50 transition-all flex items-center gap-1 shadow-lg shadow-indigo-500/20"
                   >
                     {isAiLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-bolt"></i>}
                     {isAiLoading ? 'SCANNING...' : 'RUN AUDIT'}
                   </button>
                </div>
              </div>

              {aiAnalysis ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
                  <div className="bg-rose-500/10 p-2 rounded-lg border border-rose-500/20 mb-2">
                    <span className="text-[10px] font-black text-rose-600 uppercase">MONTHLY LOSS METRIC</span>
                    <p className="text-sm font-black text-rose-600">{missedPotential}% Potential Permanently Destroyed</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-black text-emerald-500 uppercase block mb-1">Performance Insight</span>
                    <p className="text-[11px] leading-relaxed font-medium">
                      {showBengali ? aiAnalysis.translatedReview : aiAnalysis.performanceReview}
                    </p>
                  </div>
                  <div className="border-t border-indigo-200/30 pt-3">
                    <span className="text-[9px] font-black text-rose-500 uppercase block mb-1">Structural Weaknesses</span>
                    <p className="text-[11px] leading-relaxed font-medium">
                      {showBengali ? aiAnalysis.translatedWeakPoints : aiAnalysis.weakPoints}
                    </p>
                  </div>
                  <div className="border-t border-indigo-200/30 pt-3">
                    <span className="text-[9px] font-black text-indigo-500 uppercase block mb-1">Tactical Pivot</span>
                    <p className="text-[11px] leading-relaxed font-medium">
                      {showBengali ? aiAnalysis.translatedStrategy : aiAnalysis.nextMonthStrategy}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  {isAiLoading ? (
                    <div className="space-y-2">
                      <div className="w-full h-2 bg-slate-200 animate-pulse rounded"></div>
                      <div className="w-4/5 h-2 bg-slate-200 animate-pulse rounded mx-auto"></div>
                      <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-4">Analyzing your failures...</p>
                    </div>
                  ) : (
                    <p className="text-[10px] font-bold text-slate-400 uppercase italic tracking-tighter">Monitoring potential leaks...</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-black text-sm uppercase tracking-widest text-slate-400">Week-over-Week Vector</h3>
              <div className="flex items-end justify-between h-20 px-2 gap-2">
                {weeklyData.map((w, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                    <span className="text-[10px] font-black opacity-0 group-hover:opacity-100 transition-opacity">{w.progress}%</span>
                    <div 
                      className="w-full rounded-t-lg transition-all duration-700 ease-out shadow-sm"
                      style={{ 
                        height: `${w.progress}%`, 
                        backgroundColor: Object.values(WeekColor)[idx] || WeekColor.Week1 
                      }}
                    />
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{w.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Motivation Corner: Persistent Audio Vault */}
            <div className={`p-4 rounded-2xl border transition-all ${darkMode ? 'bg-slate-900/40 border-slate-700' : 'bg-slate-100/50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                  <i className="fas fa-microphone-alt"></i> Vow Vault ({state.voiceNotes?.length || 0})
                </h3>
                {isRecording && (
                   <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></div>
                      <span className="text-[8px] font-black text-rose-500 uppercase">Live</span>
                   </div>
                )}
              </div>
              
              <div className="flex items-center gap-3 mb-4">
                {!isRecording ? (
                  <button 
                    onClick={startRecording}
                    className="w-12 h-12 rounded-2xl bg-slate-800 text-white dark:bg-white dark:text-slate-900 flex items-center justify-center hover:scale-110 transition-transform active:scale-95 shadow-xl shadow-slate-500/20 shrink-0"
                  >
                    <i className="fas fa-microphone text-sm"></i>
                  </button>
                ) : (
                  <button 
                    onClick={stopRecording}
                    className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center animate-pulse hover:scale-110 transition-transform active:scale-95 shadow-xl shadow-rose-500/20 shrink-0"
                  >
                    <i className="fas fa-stop text-sm"></i>
                  </button>
                )}
                
                <div className="flex-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase leading-tight">Vocal Affirmation</p>
                  <p className="text-[9px] font-bold text-slate-300 uppercase italic">Speak your mission into the void</p>
                </div>
              </div>

              {/* Scrollable Vault */}
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1 no-scrollbar border-t border-slate-200/30 dark:border-slate-700/30 pt-3">
                {state.voiceNotes?.length > 0 ? (
                   state.voiceNotes.map(note => (
                     <div key={note.id} className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-2 flex items-center justify-between gap-2 border border-slate-200 dark:border-slate-700">
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                           <span className="text-[8px] font-black text-slate-400 uppercase">
                             {new Date(note.timestamp).toLocaleDateString()} @ {new Date(note.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                           </span>
                           <audio src={note.url} controls className="h-5 w-full scale-90 -ml-2 opacity-80" />
                        </div>
                        <button onClick={() => deleteVoiceNote(note.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-1 shrink-0">
                           <i className="fas fa-times text-[10px]"></i>
                        </button>
                     </div>
                   ))
                ) : (
                  <div className="py-4 text-center opacity-30">
                     <i className="fas fa-ghost text-xl mb-1"></i>
                     <p className="text-[9px] font-black uppercase tracking-tighter">The vault is silent</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 flex flex-col">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 border-b border-slate-200">
               <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Ranked Efficiency</h3>
                  <div className="space-y-2">
                    {topHabits.map((h, i) => (
                      <div key={h.id} className="flex items-center gap-3 text-[10px]">
                        <span className="w-4 font-black text-slate-300">{i+1}</span>
                        <span className="flex-1 font-bold truncate uppercase tracking-tight" style={{ color: h.color }}>{h.name}</span>
                        <div className="flex gap-0.5">
                          {Array.from({length: 10}).map((_, j) => (
                            <div key={j} className={`w-1.5 h-3 rounded-sm ${j < h.perf/10 ? '' : 'bg-slate-200'}`} style={j < h.perf/10 ? { backgroundColor: h.color } : {}}></div>
                          ))}
                        </div>
                        <span className="w-8 text-right font-black">{h.perf}%</span>
                      </div>
                    ))}
                  </div>
               </div>
               <div className="flex flex-col justify-center items-center text-center p-6">
                 <h2 className="text-4xl font-black mb-1 uppercase tracking-tighter">LOST POTENTIAL</h2>
                 <p className="text-rose-500 font-black uppercase tracking-widest text-xs mb-4">Permanent Failure Score</p>
                 <div className="relative">
                   <div className="text-8xl font-black text-rose-500 animate-pulse">{missedPotential}%</div>
                   <div className="absolute -top-4 -right-10 bg-rose-500 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase tracking-tighter">Irréversible</div>
                 </div>
               </div>
            </div>

            <div className={`px-6 py-4 border-b flex items-center justify-between gap-4 h-auto min-h-[72px] ${darkMode ? 'bg-slate-800/50' : 'bg-white'}`}>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Deployment Grid</h3>
              
              {!isAddingHabit ? (
                <button onClick={() => setIsAddingHabit(true)} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-all shadow-xl shadow-emerald-500/20 active:scale-95">
                  <i className="fas fa-plus text-xs"></i>
                  <span className="text-xs font-black uppercase tracking-widest">DEPLOY NEW HABIT</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-end gap-3 animate-in fade-in slide-in-from-right-4 duration-300 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Habit Name</span>
                    <div className="flex items-center gap-2">
                      <input autoFocus type="text" placeholder="Reading..." value={newHabitName} onChange={(e) => setNewHabitName(e.target.value)} className={`text-xs font-bold px-3 py-2 rounded-lg border outline-none min-w-[140px] ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                      <input type="color" value={newHabitColor} onChange={(e) => setNewHabitColor(e.target.value)} className="w-8 h-8 p-0 border-0 cursor-pointer bg-transparent" title="Habit Text Color" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Category</span>
                    <div className="flex items-center gap-2">
                      <input type="text" placeholder="Health" value={newHabitCategory} onChange={(e) => setNewHabitCategory(e.target.value)} className={`text-xs font-bold px-3 py-2 rounded-lg border outline-none w-[90px] ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                      <input type="color" value={newCategoryColor} onChange={(e) => setNewCategoryColor(e.target.value)} className="w-8 h-8 p-0 border-0 cursor-pointer bg-transparent" title="Badge Color" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Goal</span>
                    <input type="number" min="1" max={daysInMonth} value={newHabitGoal} onChange={(e) => setNewHabitGoal(parseInt(e.target.value) || 1)} className={`text-xs font-bold px-3 py-2 rounded-lg border outline-none w-[65px] ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                  </div>
                  <div className="flex items-center gap-2 h-10">
                    <button onClick={addHabit} className="bg-emerald-500 text-white h-full px-4 rounded-lg shadow-lg hover:bg-emerald-600 transition-colors active:scale-95"><i className="fas fa-check"></i></button>
                    <button onClick={() => setIsAddingHabit(false)} className="bg-slate-200 dark:bg-slate-700 h-full px-4 rounded-lg hover:bg-rose-500 hover:text-white transition-colors"><i className="fas fa-times"></i></button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-x-auto p-4 no-scrollbar">
              <div className="min-w-[1100px]">
                <div className="grid grid-cols-[300px_repeat(var(--days),_1fr)_120px] gap-1.5 items-center mb-3" style={{ "--days": daysInMonth } as React.CSSProperties}>
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Habit Unit</div>
                   {Array.from({ length: daysInMonth }).map((_, i) => (
                     <div key={i} className="text-center">
                        <div className="text-[8px] font-black text-slate-300 uppercase leading-none mb-0.5">{DAYS_LABELS[(startDayOfMonth + i) % 7]}</div>
                        <div className={`text-[10px] font-black ${i + 1 === currentDayNumber ? 'text-emerald-500 font-extrabold ring-1 ring-emerald-500/20 rounded-full w-5 h-5 flex items-center justify-center mx-auto' : ''}`}>{i + 1}</div>
                     </div>
                   ))}
                   <div className="text-[10px] font-black text-slate-400 text-right uppercase tracking-widest">Efficiency</div>
                </div>
                <div className="space-y-2">
                  {state.habits.map((habit, habitIdx) => {
                    const { current, longest } = getStreak(habit.completions);
                    const completedCount = habit.completions.filter(Boolean).length;
                    const completionPct = Math.round((completedCount / daysInMonth) * 100);
                    const catBadge = (habit.category || 'GEN').slice(0, 3).toUpperCase();
                    
                    return (
                      <div key={habit.id} className="grid grid-cols-[300px_repeat(var(--days),_1fr)_120px] gap-1.5 items-center group/row py-2 border-b border-transparent hover:bg-slate-50/50 dark:hover:bg-slate-800/30 rounded-xl transition-all" style={{ "--days": daysInMonth } as React.CSSProperties}>
                        <div className="flex flex-col pr-3 overflow-hidden">
                           <div className="flex items-center gap-3 group/name relative">
                             {editingNameId === habit.id ? (
                               <input 
                                 autoFocus 
                                 type="text" 
                                 defaultValue={habit.name} 
                                 className={`text-lg font-black p-0 border-b-2 border-rose-400 bg-transparent outline-none flex-1 ${darkMode ? 'text-white' : 'text-slate-800'}`} 
                                 onBlur={(e) => setEditingNameId(null)} 
                                 onChange={(e) => updateNameOnly(habit.id, e.target.value)}
                                 onKeyDown={(e) => e.key === 'Enter' && setEditingNameId(null)} 
                               />
                             ) : (
                               <div className="flex items-center justify-between flex-1 gap-3 overflow-hidden">
                                 <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-[10px] font-black px-2 py-1 rounded shadow-sm shrink-0 uppercase tracking-tighter" style={{ backgroundColor: habit.categoryColor || '#1e293b', color: '#fff' }}>
                                      {catBadge}
                                    </span>
                                    <span 
                                      onClick={() => setEditingNameId(habit.id)} 
                                      className="text-lg font-black truncate cursor-pointer hover:opacity-70 transition-all tracking-tight uppercase"
                                      style={{ color: habit.color || 'inherit' }}
                                    >
                                      {habit.name}
                                    </span>
                                 </div>
                                  <button onClick={() => initiateDelete(habit)} className="opacity-0 group-hover/row:opacity-100 transition-opacity text-rose-400 hover:text-rose-600 p-1.5 flex items-center justify-center shrink-0">
                                    <i className="fas fa-trash-alt text-sm"></i>
                                  </button>
                               </div>
                             )}
                           </div>
                           <div className="flex items-center gap-2 mt-1 pl-1">
                             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">GOAL:</span>
                             {editingGoalId === habit.id ? (
                               <input 
                                 autoFocus 
                                 type="number" 
                                 min="1" 
                                 max={daysInMonth} 
                                 defaultValue={habit.goal} 
                                 className={`w-16 text-xs font-black px-1 rounded border-b-2 outline-none ${darkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}`} 
                                 style={{ borderColor: habit.color || '#64748b' }}
                                 onBlur={(e) => updateGoal(habit.id, parseInt(e.target.value) || habit.goal)} 
                                 onKeyDown={(e) => e.key === 'Enter' && updateGoal(habit.id, parseInt((e.target as HTMLInputElement).value) || habit.goal)} 
                               />
                             ) : (
                               <button 
                                 onClick={() => setEditingGoalId(habit.id)} 
                                 className="text-xs font-black hover:opacity-80 px-2 py-0.5 rounded transition-colors uppercase tracking-widest bg-slate-100 dark:bg-slate-700/50"
                                 style={{ color: habit.color || '#64748b' }}
                               >
                                 {habit.goal} / {daysInMonth} DAYS
                               </button>
                             )}
                           </div>
                        </div>
                        {habit.completions.map((isDone, dayIdx) => {
                          const isLocked = dayIdx + 1 < currentDayNumber;
                          return (
                            <div 
                                key={dayIdx} 
                                className={`aspect-square rounded flex items-center justify-center transition-all ${isLocked ? 'cursor-not-allowed grayscale-[0.5]' : 'cursor-pointer hover:scale-110'} ${isDone ? 'shadow-md' : 'border border-slate-200 dark:border-slate-700'} ${dayIdx + 1 === currentDayNumber ? 'ring-2 ring-emerald-500/40' : ''}`} 
                                style={{ 
                                    backgroundColor: isDone ? habit.color || '#64748b' : 'transparent',
                                    opacity: isDone ? 1 : (isLocked ? 0.3 : 0.6) 
                                }} 
                                onClick={() => toggleHabit(habit.id, dayIdx)}
                            >
                              {isDone ? (
                                <i className="fas fa-check text-[10px] text-white"></i>
                              ) : isLocked ? (
                                <i className="fas fa-lock text-[8px] text-slate-400 opacity-50"></i>
                              ) : null}
                            </div>
                          );
                        })}
                        <div className="flex justify-end gap-3 items-center">
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-black">{completionPct}%</span>
                            <div className="flex gap-0.5 mt-1">
                                {Array.from({length: 4}).map((_, i) => (
                                    <div 
                                        key={i} 
                                        className={`w-4 h-1 rounded-full ${completionPct >= (i+1)*25 ? '' : 'bg-slate-200 dark:bg-slate-700'}`}
                                        style={completionPct >= (i+1)*25 ? { backgroundColor: habit.color || '#10b981' } : {}}
                                    ></div>
                                ))}
                            </div>
                          </div>
                          <div className="text-[10px] text-right font-black text-slate-400 leading-tight border-l pl-3 border-slate-200 dark:border-slate-700">ST: {current}<br/>MAX: {longest}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={`p-4 border-t flex justify-between items-center ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex gap-5">
                 {[1, 2, 3, 4, 5].map(w => <div key={w} className="flex items-center gap-2"><div className="w-4 h-4 rounded shadow-inner" style={{ backgroundColor: Object.values(WeekColor)[w-1] || WeekColor.Week1 }}></div><span className="text-[10px] font-black uppercase text-slate-400">W{w}</span></div>)}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>
                <p className="text-[10px] font-black italic text-rose-500 tracking-[0.2em] uppercase">VOID PROTOCOL ACTIVE</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <footer className="mt-8 text-center text-slate-400 text-xs font-black opacity-40 uppercase tracking-[0.3em]">
        <p>&copy; {currentYear} LOOSER LABS - TIME IS THE ONLY CURRENCY.</p>
      </footer>
    </div>
  );
};

export default App;
