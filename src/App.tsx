import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Plus, 
  Settings, 
  BookOpen, 
  Home, 
  Bell, 
  Trash2,
  CalendarDays,
  Import,
  X,
  AlertCircle,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ExternalLink,
  User,
  MapPin,
  ChevronDown
} from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { format, addDays, isSameDay, parseISO, addHours, differenceInCalendarWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, addMonths, subMonths } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from './lib/utils';
import { Plan, Course, ViewType } from './types';
import { WheelPicker } from './components/WheelPicker';

// Components
const Navbar = ({ activeView, setView }: { activeView: ViewType, setView: (v: ViewType) => void }) => {
  const items = [
    { type: 'today' as ViewType, icon: CalendarDays, label: '日程' },
    { type: 'timetable' as ViewType, icon: BookOpen, label: '课表' },
    { type: 'calendar' as ViewType, icon: LayoutDashboard, label: '学习' },
    { type: 'settings' as ViewType, icon: User, label: '我的' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-slate-100 flex justify-around items-center py-3 pb-8 px-4 z-50 select-none">
      {items.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          onClick={() => setView(type)}
          className={cn(
            "flex flex-col items-center gap-1 transition-all relative px-4 py-1 rounded-2xl cursor-pointer",
            activeView === type ? "text-indigo-600 bg-indigo-50/50" : "text-slate-400 hover:text-slate-600"
          )}
        >
          <Icon size={22} className={activeView === type ? "scale-110" : ""} />
          <span className="text-[10px] font-bold tracking-tight">{label}</span>
          {activeView === type && (
            <motion.div 
              layoutId="nav-active"
              className="absolute -top-1 w-1.5 h-1.5 bg-indigo-600 rounded-full"
            />
          )}
        </button>
      ))}
    </nav>
  );
};

// 校历基准日期：2026-03-02 (周一) 为第一周
const TERM_START = '2026-03-02';
const getTodayWeek = () => {
    const diff = differenceInCalendarWeeks(new Date(), parseISO(TERM_START), { weekStartsOn: 1 });
    return Math.max(1, diff + 1);
};

export default function App() {
  const [activeView, setActiveView] = useState<ViewType>('today');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [autoSyncCourses, setAutoSyncCourses] = useState(false);
  const [autoCompleteSynced, setAutoCompleteSynced] = useState(false);

  const [currentWeek, setCurrentWeek] = useState(getTodayWeek()); 
  const gridRef = useRef<HTMLDivElement>(null);
  
  // 自动滚动到今天 (移动端体验优化)
  useEffect(() => {
    if (activeView === 'timetable' && gridRef.current) {
        const timer = setTimeout(() => {
            const today = new Date().getDay(); // 0-6 (Sun-Sat)
            const dayIndex = today === 0 ? 6 : today - 1; // 0-6 (Mon-Sun)
            if (gridRef.current) {
                const scrollWidth = gridRef.current.scrollWidth;
                const clientWidth = gridRef.current.clientWidth;
                // 计算滚动比例：时间轴占了一部分宽度
                const dayColumnWidth = (scrollWidth - 48) / 7; 
                const targetScroll = (dayIndex * dayColumnWidth);
                gridRef.current.scrollTo({ left: targetScroll - (clientWidth / 2) + (dayColumnWidth / 2), behavior: 'smooth' });
            }
        }, 300);
        return () => clearTimeout(timer);
    }
  }, [activeView]);

  // Load from LocalStorage
  useEffect(() => {
    const initNotifications = async () => {
      try {
        const permission = await LocalNotifications.requestPermissions();
        if (permission.display === 'granted') {
          setNotificationsEnabled(true);
        }
      } catch (e) {
        console.warn('LocalNotifications not supported', e);
      }
    };
    
    const savedPlans = localStorage.getItem('plans');
    const savedCourses = localStorage.getItem('courses');
    const savedSettings = localStorage.getItem('settings');

    if (savedPlans) setPlans(JSON.parse(savedPlans));
    if (savedCourses) setCourses(JSON.parse(savedCourses));
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setNotificationsEnabled(settings.notifications);
      setAutoSyncCourses(settings.autoSync || false);
      setAutoCompleteSynced(settings.autoComplete || false);
    }

    if (savedSettings && JSON.parse(savedSettings).notifications) {
      initNotifications();
    }
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('plans', JSON.stringify(plans));
  }, [plans]);

  useEffect(() => {
    localStorage.setItem('courses', JSON.stringify(courses));
    localStorage.setItem('currentWeek', currentWeek.toString());
  }, [courses, currentWeek]);

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify({ 
      notifications: notificationsEnabled,
      autoSync: autoSyncCourses,
      autoComplete: autoCompleteSynced
    }));
  }, [notificationsEnabled, autoSyncCourses, autoCompleteSynced]);

  // Reminder Logic
  useEffect(() => {
    if (!notificationsEnabled) {
      // If disabled, cancel all pending
      LocalNotifications.cancel({ notifications: [] }).catch(() => {});
      return;
    }

    const scheduleNotifications = async () => {
      try {
        // Cancel first to avoid duplicates
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length > 0) {
          await LocalNotifications.cancel(pending);
        }

        const notificationList = plans
          .filter(p => !p.isCompleted && !p.reminded)
          .map(plan => {
            const startTime = parseISO(plan.startTime);
            const remindTime = new Date(startTime.getTime() - 5 * 60000); // 5 mins before
            
            if (remindTime > new Date()) {
              return {
                title: '智时日程提醒',
                body: `你的计划 "${plan.title}" 即将开始`,
                id: Math.floor(Math.random() * 1000000),
                schedule: { at: remindTime },
                sound: 'default'
              };
            }
            return null;
          })
          .filter(Boolean) as any[];

        if (notificationList.length > 0) {
          await LocalNotifications.schedule({
            notifications: notificationList
          });
        }
      } catch (e) {
        console.warn('Capacitor notifications failed, falling back to Web API', e);
        // Fallback to Web Notification if available (existing logic)
      }
    };

    scheduleNotifications();

    const interval = setInterval(() => {
      const now = new Date();
      plans.forEach(plan => {
        if (!plan.isCompleted && !plan.reminded) {
          const startTime = parseISO(plan.startTime);
          const diffMinutes = (startTime.getTime() - now.getTime()) / (1000 * 60);
          
          if (diffMinutes > 0 && diffMinutes <= 5) {
            // Web Notification Fallback
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("智时日程提醒", {
                body: `你的计划 "${plan.title}" 即将开始`,
                icon: "/favicon.ico"
              });
            }
            
            setPlans(current => 
              current.map(p => p.id === plan.id ? { ...p, reminded: true } : p)
            );
          }
        }
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [plans, notificationsEnabled]);

  // 课程自动同步逻辑
  useEffect(() => {
    if (!autoSyncCourses || courses.length === 0) return;
    
    // 我们假设当前的 academic week 已经由 currentWeek 状态确定
    const today = new Date();
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1-7 (Mon-Sun)
    const formattedDay = format(today, 'yyyy-MM-dd');
    
    const todayCourses = courses.filter(c => {
      const matchesDay = c.dayOfWeek === dayOfWeek;
      const matchesWeek = c.weeks && c.weeks.length > 0 ? c.weeks.includes(currentWeek) : true;
      return matchesDay && matchesWeek;
    });
    
    if (todayCourses.length === 0) return;
    
    setPlans(prev => {
      let changed = false;
      const updatedPlans = [...prev];
      
      todayCourses.forEach(course => {
        // 创建一个基于课程ID和日期的稳定唯一标识
        const syncId = `sync-course-${course.id}-${formattedDay}`;
        
        // 检查是否已经添加过 (避免重复添加)
        const alreadyExists = updatedPlans.find(p => p.id === syncId);
        
        if (!alreadyExists) {
          // 估算课程开始时间
          // 节次对应小时：1->8, 2->9, 3->10, 4->11, 5->14, 6->15...
          let h = 8;
          if (course.startSection <= 4) h = 7 + course.startSection;
          else if (course.startSection <= 8) h = 13 + (course.startSection - 4);
          else h = 18 + (course.startSection - 8);

          const startTime = new Date(today);
          startTime.setHours(h, 0, 0, 0);

          updatedPlans.push({
            id: syncId,
            title: `课程: ${course.name}`,
            location: course.location,
            startTime: startTime.toISOString(),
            isCompleted: autoCompleteSynced, // 要求的自动完成功能
            priority: 'medium',
            reminded: false,
            isFromCourse: true
          });
          changed = true;
        }
      });
      
      return changed ? updatedPlans : prev;
    });
  }, [courses, currentWeek, autoSyncCourses, autoCompleteSynced]);

  const addPlan = (title: string, date: string, time: string, priority: 'low' | 'medium' | 'high') => {
    // Robust date parsing for mobile devices
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const dateObj = new Date(year, month - 1, day, hour, minute);
    
    if (isNaN(dateObj.getTime())) {
      alert("日期或时间选择不完整，请检查后再试。");
      return;
    }

    const newPlan: Plan = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      startTime: dateObj.toISOString(),
      isCompleted: false,
      priority,
      reminded: false
    };
    setPlans(current => [...current, newPlan]);
    setIsAddModalOpen(false);
  };

  const togglePlan = (id: string) => {
    setPlans(plans.map(p => p.id === id ? { ...p, isCompleted: !p.isCompleted } : p));
  };

  const deletePlan = (id: string) => {
    setPlans(plans.filter(p => p.id !== id));
  };

  const views: ViewType[] = ['today', 'timetable', 'calendar', 'settings'];
  const handleDragEnd = (event: any, info: any) => {
    const threshold = 50;
    const velocityThreshold = 100;
    const currentIndex = views.indexOf(activeView);

    if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) {
      if (currentIndex < views.length - 1) {
        setActiveView(views[currentIndex + 1]);
      }
    } else if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
      if (currentIndex > 0) {
        setActiveView(views[currentIndex - 1]);
      }
    }
  };

  const renderView = () => {
    switch (activeView) {
      case 'today': return <TodayView plans={plans} togglePlan={togglePlan} deletePlan={deletePlan} />;
      case 'calendar': return <CalendarView plans={plans} togglePlan={togglePlan} deletePlan={deletePlan} setView={setActiveView} />;
      case 'timetable': return <TimetableView gridRef={gridRef} courses={courses} setCourses={setCourses} currentWeek={currentWeek} setCurrentWeek={setCurrentWeek} setView={setActiveView} />;
      case 'settings': return <SettingsView 
          notificationsEnabled={notificationsEnabled} 
          setNotificationsEnabled={setNotificationsEnabled} 
          autoSyncCourses={autoSyncCourses}
          setAutoSyncCourses={setAutoSyncCourses}
          autoCompleteSynced={autoCompleteSynced}
          setAutoCompleteSynced={setAutoCompleteSynced}
          setView={setActiveView} 
      />;
      default: return <TodayView plans={plans} togglePlan={togglePlan} deletePlan={deletePlan} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-32 selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden relative">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeView}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ 
            duration: 0.3,
            ease: [0.23, 1, 0.32, 1]
          }}
          className="w-full h-full"
        >
          {renderView()}
        </motion.div>
      </AnimatePresence>

      {/* Global FAB */}
      {(activeView === 'today' || activeView === 'calendar') && (
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="fixed right-6 bottom-28 bg-slate-900 text-white p-5 rounded-full shadow-2xl shadow-slate-300 active:scale-95 transition-all z-40 group hover:pr-8"
        >
          <div className="flex items-center gap-2">
            <Plus size={24} />
            <span className="max-w-0 overflow-hidden group-hover:max-w-[100px] transition-all font-bold whitespace-nowrap text-sm text-white">创建计划</span>
          </div>
        </button>
      )}

      <Navbar activeView={activeView} setView={setActiveView} />

      <AnimatePresence>
        {isAddModalOpen && (
          <AddPlanModal 
            onClose={() => setIsAddModalOpen(false)} 
            onAdd={addPlan} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub views
const TodayView = ({ plans, togglePlan, deletePlan }: { 
  plans: Plan[], 
  togglePlan: (id: string) => void, 
  deletePlan: (id: string) => void,
}) => {
  const today = new Date();
  const todayPlans = plans.filter(p => isSameDay(parseISO(p.startTime), today))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  
  const completedCount = todayPlans.filter(p => p.isCompleted).length;
  const progressPercent = todayPlans.length > 0 ? Math.round((completedCount / todayPlans.length) * 100) : 0;

  return (
    <div className="px-6 pt-12 sm:pt-12 max-w-2xl mx-auto">
      <header className="mb-10 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-1">我的日程</h1>
          <p className="text-slate-400 text-sm font-medium">{format(today, 'yyyy年M月d日, EEEE', { locale: zhCN })}</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 mb-1 justify-end">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">今日任务进度</span>
            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{progressPercent}%</span>
          </div>
          <div className="w-24 sm:w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full bg-indigo-600 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.4)]"
            />
          </div>
        </div>
      </header>

      <section>
        <h3 className="text-[11px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-6">日程清单</h3>
        <div className="space-y-4">
          {todayPlans.length > 0 ? (
            todayPlans.map(plan => (
              <PlanCard key={plan.id} plan={plan} onToggle={() => togglePlan(plan.id)} onDelete={() => deletePlan(plan.id)} />
            ))
          ) : (
            <div className="bg-white rounded-[32px] p-10 flex flex-col items-center justify-center text-center border border-slate-100 shadow-sm">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 text-indigo-500">
                <LayoutDashboard size={32} />
              </div>
              <p className="text-slate-800 font-bold text-lg">开启高效的一天</p>
              <p className="text-slate-400 text-sm mt-2 max-w-[200px]">点击右下角按钮添加您的第一个今日计划</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const MonthPickerModal = ({ 
  currentDate, 
  onSelect, 
  onClose,
  plans 
}: { 
  currentDate: Date, 
  onSelect: (d: Date) => void, 
  onClose: () => void,
  plans: any[]
}) => {
  const [viewDate, setViewDate] = useState(startOfMonth(currentDate));

  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    plans.forEach(p => {
      const dateKey = format(parseISO(p.startTime), 'yyyy-MM-dd');
      counts[dateKey] = (counts[dateKey] || 0) + 1;
    });
    return counts;
  }, [plans]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewDate]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl border border-slate-100"
      >
        <div className="p-6 bg-slate-900 text-white">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-black tracking-tight">{format(viewDate, 'yyyy年 M月')}</h3>
            <div className="flex gap-1">
              <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center">
            {['一', '二', '三', '四', '五', '六', '日'].map(d => (
              <span key={d} className="text-[10px] font-black text-white/30 uppercase py-2">{d}</span>
            ))}
          </div>
        </div>

        <div className="p-4 grid grid-cols-7 gap-1">
          {days.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, viewDate);
            const isSelected = isSameDay(day, currentDate);
            const isToday = isSameDay(day, new Date());
            const count = taskCounts[format(day, 'yyyy-MM-dd')] || 0;

            return (
              <button
                key={idx}
                onClick={() => {
                  onSelect(day);
                  onClose();
                }}
                className={cn(
                  "aspect-square flex flex-col items-center justify-center rounded-xl relative transition-all text-xs font-bold",
                  !isCurrentMonth ? "opacity-10 text-slate-300" : "text-slate-700 hover:bg-slate-50",
                  isSelected && "bg-slate-900 text-white shadow-lg",
                  isToday && !isSelected && "text-indigo-600 bg-indigo-50"
                )}
              >
                {format(day, 'd')}
                {count > 0 && (
                  <div className={cn(
                    "w-1 h-1 rounded-full absolute bottom-1.5",
                    isSelected ? "bg-white/50" : count > 3 ? "bg-amber-400" : "bg-indigo-300"
                  )} />
                )}
              </button>
            );
          })}
        </div>
        
        <div className="p-4 border-t border-slate-50 flex justify-end">
            <button onClick={onClose} className="text-xs font-black text-slate-400 bg-slate-50 px-4 py-2 rounded-xl hover:bg-slate-100 transition-colors">取消</button>
        </div>
      </motion.div>
    </div>
  );
};

const CalendarView = ({ plans, togglePlan, deletePlan, setView }: {
  plans: Plan[],
  togglePlan: (id: string) => void,
  deletePlan: (id: string) => void,
  setView: (v: ViewType) => void
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLButtonElement>(null);
  
  // Create a larger range of dates: 30 days back, 90 days forward for a better timeline feel
  const dateRange = useMemo(() => {
    return Array.from({ length: 120 }, (_, i) => addDays(new Date(), i - 30));
  }, []);

  // Calculate task density for each day in range
  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    plans.forEach(p => {
      const dateKey = format(parseISO(p.startTime), 'yyyy-MM-dd');
      counts[dateKey] = (counts[dateKey] || 0) + 1;
    });
    return counts;
  }, [plans]);

  // Auto-scroll to today on initial mount
  useEffect(() => {
    if (todayRef.current) {
        todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, []);

  const filteredPlans = plans.filter(p => isSameDay(parseISO(p.startTime), selectedDate))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="px-5 pt-12 sm:pt-8 max-w-2xl mx-auto pb-20">
      <header className="mb-6">
        <div className="flex items-center justify-between mb-8 px-1">
          <div className="flex items-center gap-3">
             <div className="bg-indigo-600 w-1.5 h-6 rounded-full" />
             <button 
                onClick={() => setShowDatePicker(true)}
                className="group flex items-center gap-2 hover:bg-slate-50 px-2 py-1 -ml-2 rounded-xl transition-all"
             >
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">学习计划</h1>
                <ChevronDown size={18} className="text-slate-300 group-hover:text-indigo-500 transition-colors mt-1" />
             </button>
          </div>
          <div className="flex gap-2">
            <button 
                onClick={() => setShowDatePicker(true)}
                className="p-2 text-slate-400 bg-white border border-slate-100 rounded-xl shadow-sm hover:text-indigo-600 transition-colors"
            >
                <CalendarDays size={18} />
            </button>
            <button 
                onClick={() => {
                    setSelectedDate(new Date());
                    todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }}
                className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors"
            >
                回到今天
            </button>
          </div>
        </div>

        <AnimatePresence>
            {showDatePicker && (
                <MonthPickerModal 
                    currentDate={selectedDate}
                    plans={plans}
                    onClose={() => setShowDatePicker(false)}
                    onSelect={(d) => {
                        setSelectedDate(d);
                    }}
                />
            )}
        </AnimatePresence>
        
        <div className="relative group">
             <div className="bg-white/70 backdrop-blur-md rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
                <div 
                    ref={scrollRef}
                    className="flex overflow-x-auto no-scrollbar snap-x py-5 px-3"
                    style={{ scrollBehavior: 'smooth' }}
                >
                    {dateRange.map((date, i) => {
                        const isSelected = isSameDay(date, selectedDate);
                        const isToday = isSameDay(date, new Date());
                        const dateKey = format(date, 'yyyy-MM-dd');
                        const count = taskCounts[dateKey] || 0;
                        
                        return (
                        <button
                            key={i}
                            ref={isToday ? todayRef : null}
                            onClick={() => setSelectedDate(date)}
                            className={cn(
                            "flex flex-col items-center justify-center min-w-[58px] py-3 rounded-2xl transition-all duration-300 snap-center mx-1.5 relative",
                            isSelected 
                                ? "bg-slate-900 text-white shadow-xl shadow-slate-200 scale-105" 
                                : isToday 
                                    ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100" 
                                    : "text-slate-500 hover:bg-slate-50"
                            )}
                        >
                            <span className={cn(
                                "text-[9px] uppercase font-black tracking-widest mb-1.5 opacity-60",
                                isSelected ? "text-indigo-200" : isToday ? "text-indigo-400" : ""
                            )}>
                                {format(date, 'eee', { locale: zhCN })}
                            </span>
                            <span className="text-lg font-black leading-none">{format(date, 'd')}</span>
                            
                            {/* Task Density Indicator */}
                            {count > 0 && !isSelected && (
                                <div className="absolute top-2 right-2 flex gap-0.5">
                                    <div className={cn(
                                        "w-1 h-1 rounded-full",
                                        count > 3 ? "bg-amber-500 animate-pulse" : isToday ? "bg-indigo-600" : "bg-slate-300"
                                    )} />
                                </div>
                            )}

                            {/* Intensity Glow/Bar */}
                            {count > 0 && (
                                <div className={cn(
                                    "absolute bottom-2 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all",
                                    isSelected ? "bg-indigo-400 w-4" : "bg-indigo-600/20 w-1",
                                    count >= 3 ? "bg-amber-400" : ""
                                )} />
                            )}

                            {isToday && isSelected && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 border-2 border-white rounded-full z-10" />
                            )}
                        </button>
                        );
                    })}
                </div>
            </div>
            {/* Side Masks */}
            <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-slate-50 to-transparent pointer-events-none z-10 lg:hidden"></div>
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-50 to-transparent pointer-events-none z-10 lg:hidden"></div>
        </div>
      </header>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2 mb-6">
            <h2 className="text-sm font-black text-slate-800">
                {isSameDay(selectedDate, new Date()) ? "今天" : format(selectedDate, 'M月d日')}
                <span className="ml-2 font-bold text-slate-400 text-xs">{format(selectedDate, 'EEEE', { locale: zhCN })}</span>
            </h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                {filteredPlans.length} 计划
            </p>
        </div>

        <div className="space-y-4">
            {filteredPlans.length > 0 ? (
            filteredPlans.map((plan, index) => (
                <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                >
                    <PlanCard plan={plan} onToggle={() => togglePlan(plan.id)} onDelete={() => deletePlan(plan.id)} />
                </motion.div>
            ))
            ) : (
                <div className="bg-white/40 backdrop-blur-sm rounded-[40px] py-16 flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-100">
                    <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-300">
                        <Calendar size={28} />
                    </div>
                    <p className="text-slate-400 font-bold text-sm">此日暂无日程安排</p>
                    <button 
                        onClick={() => {/* Trigger fab logic if needed */}}
                        className="mt-4 text-xs font-black text-indigo-600 hover:underline"
                    >
                        立即规划明天?
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

const TimetableView = ({ courses, setCourses, currentWeek, setCurrentWeek, setView, gridRef }: { 
  courses: Course[], 
  setCourses: (c: Course[]) => void,
  currentWeek: number,
  setCurrentWeek: (n: number) => void,
  setView: (v: ViewType) => void,
  gridRef: React.RefObject<HTMLDivElement>
}) => {
  const [importUrl, setImportUrl] = useState('');
  const [importJson, setImportJson] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'standard' | 'urp'>('urp');
  const [isImportCollapsed, setIsImportCollapsed] = useState(true);

  const handleJsonImport = () => {
    const rawData = importJson.trim();
    if (!rawData) {
        alert("请先粘贴 JSON 数据");
        return;
    }
    
    try {
      // 尝试处理各种格式的 JSON
      let data;
      if (rawData.startsWith('[') || rawData.startsWith('{')) {
        data = JSON.parse(rawData);
      } else if (rawData.includes('{') && rawData.includes('}')) {
        // 尝试提取 JSON 片段
        const match = rawData.match(/\{.*\}/s);
        if (match) data = JSON.parse(match[0]);
      } else {
        throw new Error('未识别的 JSON 格式');
      }

      let parsedCourses: Course[] = [];
      if (importMode === 'urp' || (data && (data.dateList || data.ksjc || data.KCM))) {
        parsedCourses = parseURP(data);
      } else if (Array.isArray(data)) {
        parsedCourses = data.map((c: any) => ({ id: Math.random().toString(36).substr(2, 9), ...c }));
      }

      if (parsedCourses.length > 0) {
        setCourses(parsedCourses);
        setImportJson('');
        alert(`成功识别并导入 ${parsedCourses.length} 门课程！`);
      } else {
        alert('解析失败：未能在返回的数据中找到有效的课程信息。');
      }
    } catch (e) {
      console.error(e);
      alert('解析失败：粘贴的数据不是有效的 JSON 格式。');
    }
  };

  const parseURP = (data: any): Course[] => {
    const list = data.dateList || data.list || (Array.isArray(data) ? data : []);
    if (!Array.isArray(list)) return [];

    console.log("Parsing URP data:", list.length, "items found");

    const colors = [
        "bg-rose-50 border-rose-100 text-rose-700",
        "bg-amber-50 border-amber-100 text-amber-700",
        "bg-emerald-50 border-emerald-100 text-emerald-700",
        "bg-sky-50 border-sky-100 text-sky-700",
        "bg-indigo-50 border-indigo-100 text-indigo-700",
        "bg-violet-50 border-violet-100 text-violet-700",
        "bg-fuchsia-50 border-fuchsia-100 text-fuchsia-700"
    ];

    const parseWeekRange = (weekStr: string): { weeks: number[], type: 'all' | 'odd' | 'even' } => {
      const weeks: number[] = [];
      let type: 'all' | 'odd' | 'even' = 'all';
      if (!weekStr) return { weeks: [], type: 'all' };

      const cleanStr = weekStr.replace(/第/g, '').replace(/周/g, '').trim();
      if (cleanStr.includes('单')) type = 'odd';
      else if (cleanStr.includes('双')) type = 'even';

      const parts = cleanStr.replace(/[单双]/g, '').split(/[,，]/);
      parts.forEach(part => {
        if (part.includes('-')) {
          const match = part.match(/(\d+)\D*(-)\D*(\d+)/);
          if (match) {
            const start = parseInt(match[1]);
            const end = parseInt(match[3]);
            for (let i = start; i <= end; i++) {
              if (type === 'odd' && i % 2 === 0) continue;
              if (type === 'even' && i % 2 !== 0) continue;
              weeks.push(i);
            }
          }
        } else {
          const w = parseInt(part.replace(/\D/g, ''));
          if (!isNaN(w)) weeks.push(w);
        }
      });
      return { weeks, type };
    };

    const parsedResults: Course[] = [];

    list.forEach((item: any) => {
      // 提取星期：根据 header 文本精确判断，如果没有 header 则回退到 day 逻辑
      let day = 1;
      const headerText = item.header || "";
      if (headerText.includes('一')) day = 1;
      else if (headerText.includes('二')) day = 2;
      else if (headerText.includes('三')) day = 3;
      else if (headerText.includes('四')) day = 4;
      else if (headerText.includes('五')) day = 5;
      else if (headerText.includes('六')) day = 6;
      else if (headerText.includes('日') || headerText.includes('天')) day = 7;
      else {
        const rawDay = typeof item.day === 'number' ? item.day : 1;
        day = rawDay;
        // 注意：URP 抓取时，如果 Col 0 是时间，Col 1 是周一，则 day=1 是正确的。
        // 如果 day=0，通常代表周日。
        if (day === 0) day = 7;
      }

      const text = typeof item === 'string' ? item : (item.text || "");
      if (!text) return;

      const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l);
      const sectionIndices = lines.map((l, idx) => l.includes('节') ? idx : -1).filter(idx => idx !== -1);
      
      sectionIndices.forEach((sIdx, i) => {
        const sectionLine = lines[sIdx];
        let weekLine = "";
        let wIdx = -1;
        const searchStart = i === 0 ? 0 : sectionIndices[i-1] + 1;
        
        for (let j = sIdx - 1; j >= searchStart; j--) {
           if (lines[j].includes('周')) {
               weekLine = lines[j];
               wIdx = j;
               break;
           }
        }
        if (!weekLine) return;

        // 提取名称和教师：过滤掉可能混入的地点信息（特别是多块拼接时）
        const potentialNameBlock = lines.slice(searchStart, wIdx);
        const realNameLines = potentialNameBlock.filter(line => 
          !line.includes('周') && !line.includes('节') && 
          !(line.includes('楼') || line.includes('室') || line.includes('教学') || line.includes('实训') || line.includes('中心')) &&
          !/^[A-Z]\d+/.test(line) // 过滤类似 B409 这种纯教室号
        );

        const name = realNameLines[0] || "未知课程";
        const teacher = realNameLines.slice(1).join(' ') || "";

        const nextLimit = i === sectionIndices.length - 1 ? lines.length : sectionIndices[i+1];
        let location = "";
        for (let k = sIdx + 1; k < nextLimit; k++) {
           if (lines[k].includes('周')) break;
           location += (location ? " " : "") + lines[k];
        }

        const weekData = parseWeekRange(weekLine);
        const allNums = sectionLine.match(/\d+/g);
        if (allNums && allNums.length >= 1) {
            const start = parseInt(allNums[0]);
            const end = allNums.length >= 2 ? parseInt(allNums[1]) : start;
            
            parsedResults.push({
                id: Math.random().toString(36).substr(2, 9) + i,
                name,
                teacher,
                location: location || "未知地点",
                // 彻底修复错位：根据反馈将所有课程集体向前修正一天 (周一变周日, 周二变周一...)
                dayOfWeek: day === 1 ? 7 : day - 1, 
                startSection: start,
                endSection: end,
                weeks: weekData.weeks,
                color: colors[parsedResults.length % colors.length]
            });
        }
      });
    });

    return parsedResults;
  };

  const timeSlots = [
    { label: '1', start: '08:00', end: '08:50' },
    { label: '2', start: '09:00', end: '09:50' },
    { label: '3', start: '10:00', end: '10:50' },
    { label: '4', start: '11:00', end: '11:50' },
    { label: 'spacer', labelExtra: '午休' },
    { label: '5', start: '14:00', end: '14:50' },
    { label: '6', start: '15:00', end: '15:50' },
    { label: '7', start: '16:00', end: '16:50' },
    { label: '8', start: '17:00', end: '17:50' },
    { label: 'spacer', labelExtra: '晚饭' },
    { label: '9', start: '18:30', end: '19:20' },
    { label: '10', start: '19:30', end: '20:20' },
    { label: '11', start: '20:30', end: '21:20' },
    { label: '12', start: '21:30', end: '22:20' },
  ];

  // 计算当前周的日期
  const getWeekDates = (week: number) => {
    // 假设学期开始日期是 2026-03-02
    const termStartStr = "2026-03-02";
    const startDate = parseISO(termStartStr);
    // 第一天是周一
    const firstDayOfWeek = addDays(startDate, (week - 1) * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(firstDayOfWeek, i));
  };

  const weekDates = getWeekDates(currentWeek);

  const importTimetable = async () => {
    if (!importUrl) return;
    setIsImporting(true);
    
    try {
      const res = await fetch(`/api/proxy-import?url=${encodeURIComponent(importUrl)}`);
      const contentType = res.headers.get("content-type");
      
      if (!res.ok) throw new Error('网络请求失败');
      
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (text.trim().startsWith('<')) {
          throw new Error('教务系统返回了 HTML 页面（可能是需要登录或链接失效），而不是数据。');
        }
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error('解析课程数据失败：返回的数据不是有效的 JSON 格式。');
        }
      }
      
      let parsedCourses: Course[] = [];
      if (importMode === 'urp') {
        parsedCourses = parseURP(data);
      } else if (Array.isArray(data)) {
        parsedCourses = data.map(c => ({ id: Math.random().toString(36).substr(2, 9), ...c }));
      }

      if (parsedCourses.length > 0) {
        setCourses(parsedCourses);
        setImportUrl('');
        alert(`成功导入 ${parsedCourses.length} 门课程！`);
      } else {
        alert('解析失败：未能在返回的数据中找到有效的课程信息。请确保选择了正确的导入模式。');
      }
    } catch (err: any) {
      console.error('Import failed', err);
      alert(err.message || '导入失败，请检查 URL。');
    } finally {
      setIsImporting(false);
    }
  };

  const loadSample = () => {
    const sample = [
      { name: "高等数学", dayOfWeek: 1, startSection: 1, endSection: 2, location: "教1-101", teacher: "张老师", weekType: 'all', color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
      { name: "大学物理", dayOfWeek: 1, startSection: 3, endSection: 4, location: "理1-204", teacher: "李老师", weekType: 'all', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
      { name: "英语听说", dayOfWeek: 2, startSection: 1, endSection: 2, location: "语言中心", teacher: "Wang", weekType: 'odd', color: 'bg-amber-50 text-amber-700 border-amber-100' },
      { name: "综合英语", dayOfWeek: 2, startSection: 1, endSection: 2, location: "语言中心", teacher: "Wang", weekType: 'even', color: 'bg-rose-50 text-rose-700 border-rose-100' },
      { name: "体育(羽毛球)", dayOfWeek: 2, startSection: 7, endSection: 8, location: "体育馆", teacher: "赵教练", weekType: 'all', color: 'bg-violet-50 text-violet-700 border-violet-100' },
      { name: "计算机网络", dayOfWeek: 3, startSection: 3, endSection: 5, location: "信2-302", teacher: "刘教授", weekType: 'all', color: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
      { name: "马克思原理", dayOfWeek: 4, startSection: 1, endSection: 2, location: "教3-101", teacher: "陈老师", weekType: 'odd', color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
      { name: "数据库系统", dayOfWeek: 4, startSection: 5, endSection: 6, location: "信2-101", teacher: "孙老师", weekType: 'all', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
      { name: "电路分析", dayOfWeek: 5, startSection: 1, endSection: 3, location: "电工基地", teacher: "周老师", weekType: 'all', color: 'bg-amber-50 text-amber-700 border-amber-100' },
    ];
    setCourses(sample.map(c => ({ id: Math.random().toString(36).substr(2, 9), ...c } as Course)));
  };

  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const sections = Array.from({ length: 12 }, (_, i) => i + 1);
  const isOddWeek = currentWeek % 2 !== 0;

  const filteredCourses = courses.filter(c => {
    // 如果有具体的周数数组，优先使用
    if (c.weeks && c.weeks.length > 0) {
      return c.weeks.includes(currentWeek);
    }
    // 否则回退到单双周逻辑
    if (!c.weekType || c.weekType === 'all') return true;
    if (isOddWeek) return c.weekType === 'odd';
    return c.weekType === 'even';
  });

  return (
    <div className="min-h-screen bg-slate-50/50 pb-32 pt-12 sm:pt-2">
      {/* 1. Import Section at the very top (Collapsible) */}
      <div className="w-full max-w-7xl mx-auto px-2">
        <div className="bg-slate-900 rounded-[24px] overflow-hidden shadow-xl transition-all duration-300 ring-1 ring-white/5">
            <button 
                onClick={() => setIsImportCollapsed(!isImportCollapsed)}
                className="w-full px-4 py-2 flex items-center justify-between text-white/90 hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Import size={16} className="text-indigo-400" />
                    <span className="text-xs font-black tracking-tight">课表内容导入</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] text-white/30 font-bold hidden sm:inline">JSON / URL</span>
                    <div className={cn("transition-transform duration-300", isImportCollapsed ? "" : "rotate-90")}>
                        <ChevronRight size={14} />
                    </div>
                </div>
            </button>

            <motion.div 
                initial={false}
                animate={{ height: isImportCollapsed ? 0 : 'auto', opacity: isImportCollapsed ? 0 : 1 }}
                className="overflow-hidden"
            >
                <div className="px-4 pb-4 text-white relative">
                    <div className="relative z-10 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <p className="text-[9px] text-white/30 uppercase tracking-widest font-black">支持 URL 或 JSON 数据粘贴</p>
                            <button 
                                onClick={() => setShowHelp(true)}
                                className="text-indigo-400 text-[9px] font-bold flex items-center gap-1 hover:text-indigo-300"
                            >
                                <AlertCircle size={12} />
                                导入指南
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="教务系统 API URL..." 
                                value={importUrl}
                                onChange={(e) => setImportUrl(e.target.value)}
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-white/20 placeholder:text-slate-700"
                            />
                            <button 
                                onClick={importTimetable}
                                disabled={isImporting}
                                className="bg-white text-slate-900 px-4 rounded-xl font-bold text-[10px]"
                            >
                                {isImporting ? <Clock className="animate-spin" size={14} /> : "URL导入"}
                            </button>
                        </div>

                        <div className="relative">
                            <textarea 
                                placeholder="或者粘贴控制台运行脚本后的 JSON 内容..." 
                                value={importJson}
                                onChange={(e) => setImportJson(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-[9px] font-mono h-20 focus:outline-none focus:border-white/20 no-scrollbar placeholder:text-slate-700"
                            ></textarea>
                            {importJson && (
                                <button 
                                    onClick={handleJsonImport}
                                    className="absolute bottom-2 right-2 bg-indigo-600 text-white px-3 py-1 rounded-lg text-[9px] font-bold shadow-lg"
                                >
                                    立即解析
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
      </div>

      {/* 2. Navigation Header (Moved to just above individual timetable) */}
      <div className="w-full max-w-7xl mx-auto px-2 mt-2">
        <header className="flex items-center justify-between gap-2 bg-white/60 backdrop-blur-md px-4 py-2 rounded-[24px] border border-white shadow-sm mb-2">
            <div className="flex items-center gap-2">
                <motion.button 
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setCurrentWeek(getTodayWeek())}
                    title="回到本周"
                    className="p-1.5 hover:bg-indigo-50 rounded-full transition-colors group"
                >
                    <RotateCcw size={16} className="text-slate-400 group-hover:text-indigo-600 group-active:rotate-[-45deg] transition-all" />
                </motion.button>
                <div className="leading-tight">
                    <h1 className="text-sm font-black text-slate-900 leading-none">第 {currentWeek} 周</h1>
                    <p className="text-[8px] font-bold text-slate-400 mt-0.5">
                        {format(weekDates[0], 'M.d')} - {format(weekDates[6], 'M.d')}
                        <span className="ml-1 text-indigo-500 uppercase">{isOddWeek ? '单' : '双'}</span>
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-1.5">
                <div className="flex items-center bg-slate-50/80 p-0.5 rounded-full border border-slate-100">
                    <button 
                        onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}
                        className="p-1.5 hover:bg-white rounded-full transition-all text-slate-400"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <span className="text-[9px] font-black px-1.5 text-slate-300">切换</span>
                    <button 
                        onClick={() => setCurrentWeek(currentWeek + 1)}
                        className="p-1.5 hover:bg-white rounded-full transition-all text-slate-400"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>

                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center gap-1 bg-slate-900 text-white px-3 py-2 rounded-full shadow-lg shadow-slate-200 active:scale-95 transition-all text-[10px] font-black"
                >
                    <Plus size={12} />
                    <span>自定义</span>
                </button>
            </div>
        </header>
      </div>

      {/* Main Timetable Content - Scrollable on mobile */}
      <div className="w-full max-w-full px-1 md:px-4 pb-20 mt-2">
        <div className="bg-white rounded-[32px] md:rounded-[48px] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden relative">
          <div ref={gridRef} className="overflow-x-auto no-scrollbar scroll-smooth">
            <div className="min-w-[460px] md:min-w-full">
              
              {/* Header Days */}
              <div className="flex border-b border-slate-100 bg-slate-50/80 sticky top-0 z-30 backdrop-blur-md">
                <div className="w-12 shrink-0 border-r border-slate-100 flex items-center justify-center">
                  <div className="text-[10px] font-black text-slate-300 uppercase vertical-text">
                    {format(weekDates[0], 'MM', { locale: zhCN })}月
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-7">
                  {days.map((day, i) => {
                    const date = weekDates[i];
                    const isToday = isSameDay(date, new Date());
                    return (
                      <div key={i} className="flex flex-col items-center py-1.5 border-r border-slate-100 last:border-r-0">
                        <span className={cn(
                          "text-[9px] font-bold mb-0.5",
                          isToday ? "text-indigo-600" : "text-slate-400"
                        )}>
                          {day.replace('星期', '')}
                        </span>
                        <div className={cn(
                          "text-xs font-black w-6 h-6 flex items-center justify-center rounded-full transition-all",
                          isToday ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" : "text-slate-800"
                        )}>
                          {format(date, 'd')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Grid Body */}
              <div className="flex relative">
                {/* Time Center Column */}
                <div className="w-12 shrink-0 bg-slate-50/50 border-r border-slate-100 divide-y divide-slate-100">
                  {timeSlots.map((slot, i) => (
                    <div key={i} className={cn(
                      "flex flex-col items-center justify-center",
                      slot.label === 'spacer' ? "h-8 bg-slate-100/30" : "h-16"
                    )}>
                      {slot.label === 'spacer' ? (
                        <span className="text-[8px] font-black text-slate-300 vertical-text">{slot.labelExtra}</span>
                      ) : (
                        <>
                          <span className="text-[11px] font-black text-slate-700 leading-none mb-1">{slot.label}</span>
                          <span className="text-[8px] font-bold text-slate-400 tracking-tighter leading-none">{slot.start}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Day Columns */}
                <div className="flex-1 grid grid-cols-7 relative">
                  {days.map((_, dayIndex) => {
                    const dayNum = dayIndex + 1;
                    return (
                      <div key={dayIndex} className="col-span-1 border-r border-slate-50 relative min-h-full last:border-r-0">
                        {/* Background Lines */}
                        {timeSlots.map((slot, k) => (
                          <div key={k} className={cn(
                            "w-full border-b border-slate-50",
                            slot.label === 'spacer' ? "h-8 bg-slate-100/5" : "h-16"
                          )} />
                        ))}

                        {/* Courses */}
                        {filteredCourses.filter(c => c.dayOfWeek === dayNum).map(course => {
                          let topOffset = 0;
                          let height = 0;
                          const getSlotIndex = (label: string) => timeSlots.findIndex(s => s.label === label);
                          const startIdx = getSlotIndex(course.startSection.toString());
                          const endIdx = getSlotIndex(course.endSection.toString());
                          
                          if (startIdx !== -1 && endIdx !== -1) {
                            for (let i = 0; i < startIdx; i++) {
                              topOffset += timeSlots[i].label === 'spacer' ? 32 : 64;
                            }
                            for (let i = startIdx; i <= endIdx; i++) {
                              height += timeSlots[i].label === 'spacer' ? 32 : 64;
                            }
                          }

                          return (
                            <motion.div
                              key={course.id}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={cn(
                                "absolute left-[1.5px] right-[1.5px] rounded-lg p-1 flex flex-col overflow-hidden shadow-sm ring-1 ring-black/5 z-10 select-none group transition-all hover:shadow-xl hover:z-20 active:scale-[0.98]",
                                course.color || "bg-indigo-50 text-indigo-700"
                              )}
                              style={{ 
                                top: `${topOffset + 1}px`, 
                                height: `${height - 2}px`,
                                backgroundColor: course.color ? undefined : 'rgba(238, 242, 255, 0.95)',
                                backdropFilter: 'blur(8px)'
                              }}
                            >
                              <div className="text-[7px] font-bold leading-tight mb-1 break-words whitespace-normal">
                                {course.name}
                              </div>
                              <div className="mt-auto space-y-0.5 border-t border-black/5 pt-0.5">
                                <div className="flex items-start gap-0.5 opacity-90">
                                  <MapPin size={5} className="shrink-0 mt-0.5" />
                                  <div className="text-[6px] font-bold leading-tight flex flex-col">
                                    {(() => {
                                      const loc = course.location.replace('北区', '北').replace('南区', '南');
                                      // 增强的拆分逻辑：匹配 字母+数字 或 连续3位数字
                                      const match = loc.match(/^(.+?)([A-Za-z]\d+.*|\d{3,}.*)$/);
                                      if (match) {
                                        return (
                                          <>
                                            <span className="truncate">{match[1]}</span>
                                            <span className="text-indigo-600/80">{match[2]}</span>
                                          </>
                                        );
                                      }
                                      return <span className="break-words">{loc}</span>
                                    })()}
                                  </div>
                                </div>
                                {course.teacher && (
                                  <div className="flex items-start gap-0.5 opacity-70">
                                    <User size={5} className="shrink-0 mt-0.5" />
                                    <span className="text-[6px] font-medium break-words leading-tight">{course.teacher}</span>
                                  </div>
                                )}
                              </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCourses(courses.filter(c => c.id !== course.id));
                                }}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 bg-white/50 rounded-full hover:bg-white text-slate-400 transition-all md:block hidden"
                              >
                                <X size={10} />
                              </button>
                            </motion.div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


      <AnimatePresence>
        {isAddModalOpen && (
          <AddCourseModal 
            onClose={() => setIsAddModalOpen(false)}
            onAdd={(course) => {
                setCourses([...courses, { ...course, id: Math.random().toString(36).substr(2, 9) }]);
                setIsAddModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-6">
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="bg-white rounded-[40px] p-8 max-w-lg w-full shadow-2xl relative overflow-y-auto max-h-[90vh] no-scrollbar"
            >
              <button onClick={() => setShowHelp(false)} className="absolute top-8 right-8 text-slate-400"><X size={24}/></button>
              <h3 className="text-2xl font-black text-slate-900 mb-6 tracking-tight">课表导入说明</h3>
              
              <div className="space-y-5 text-[13px] text-slate-600 font-medium leading-relaxed">
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl">
                    <p className="text-indigo-900 text-xs font-bold leading-relaxed">
                        适配最新 URP 系统。请按照以下步骤操作：
                    </p>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black shrink-0">1</span>
                    <p>在电脑浏览器中登录教务系统，进入【本学期课表】或【选课结果查询】页面。</p>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                    <p>按下 <kbd className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono text-[10px]">F12</kbd> (或右键-检查) 打开控制台(Console)。</p>
                  </div>              <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black shrink-0">3</span>
                    <div className="flex-1 min-w-0">
                        <p className="mb-2">复制并运行下方脚本（适配大部分 URP 系统）：</p>
                        <button 
                            onClick={() => {
                                const script = `(async function() {
  console.log("正在执行[语义识别]抓取脚本...");
  const table = document.querySelector('table.grid-table') || document.querySelector('table');
  if(!table) {
    alert("未找到课表表格，请确保您在【教务系统-本学期课表】页面。");
    return;
  }
  
  // 1. 获取表头，建立列索引到星期的映射
  const headers = Array.from(table.rows[0].cells).map(c => c.innerText.trim());
  const colToDayMap = {};
  headers.forEach((h, idx) => {
    if (h.includes('一')) colToDayMap[idx] = 1;
    else if (h.includes('二')) colToDayMap[idx] = 2;
    else if (h.includes('三')) colToDayMap[idx] = 3;
    else if (h.includes('四')) colToDayMap[idx] = 4;
    else if (h.includes('五')) colToDayMap[idx] = 5;
    else if (h.includes('六')) colToDayMap[idx] = 6;
    else if (h.includes('日') || h.includes('天')) colToDayMap[idx] = 7;
  });

  const result = [];
  const rowSpanMap = {}; 
  const rows = Array.from(table.rows);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let virtualCol = 0;
    
    for (let c = 0; c < row.cells.length; c++) {
      while (rowSpanMap[r + "_" + virtualCol]) { virtualCol++; }
      
      const cell = row.cells[c];
      const text = cell.innerText.trim();
      
      if (text && text.includes('周') && text.includes('节')) {
        // 关键修复：如果表头有明确的“星期几”，以表头为准
        const dayFromHeader = colToDayMap[virtualCol];
        result.push({ text, day: dayFromHeader || virtualCol, header: headers[virtualCol] });
      }
      
      const rs = cell.rowSpan || 1;
      const cs = cell.colSpan || 1;
      for (let i = 0; i < rs; i++) {
        for (let j = 0; j < cs; j++) {
          if (i > 0 || j > 0) rowSpanMap[(r + i) + "_" + (virtualCol + j)] = true;
        }
      }
      virtualCol += cs;
    }
  }
  
  if(result.length > 0) {
    copy(JSON.stringify(result));
    alert("【探测成功】识别到 " + result.length + " 个课节块！已复制到剪贴板，请返回粘贴。");
  } else {
    alert("未能探测到课程信息。");
  }
})();`;
                                navigator.clipboard.writeText(script);
                                alert("【深度兼容抓取脚本】已复制！请前往控制台粘贴。");
                            }}
                            className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all"
                        >
                            复制[万能坐标修正]脚本
                        </button>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black shrink-0">4</span>
                    <p>回到本页面，点击黑色标题栏展开“导入”，在文本框中<span className="text-indigo-600 font-bold">粘贴并解析</span>即可。</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AddCourseModal = ({ onClose, onAdd }: { 
    onClose: () => void, 
    onAdd: (c: Omit<Course, 'id'>) => void 
}) => {
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [dayOfWeek, setDayOfWeek] = useState(1);
    const [startSection, setStartSection] = useState(1);
    const [endSection, setEndSection] = useState(2);
    const [weekType, setWeekType] = useState<'all' | 'odd' | 'even'>('all');

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[40px] shadow-2xl relative flex flex-col max-h-[95vh]"
            >
                <div className="flex items-center justify-between p-6 sm:p-8 pb-4 border-b border-slate-50">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">添加课程</h2>
                    <button onClick={onClose} className="text-slate-400 bg-slate-100 p-2 rounded-full hover:bg-slate-200 transition-colors"><X size={18}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto no-scrollbar p-6 sm:p-8 pt-4 space-y-5">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">课程名称</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 rounded-2xl py-3 px-5 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700" placeholder="例如：高等数学" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">上课地点</label>
                        <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full bg-slate-50 rounded-2xl py-3 px-5 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700" placeholder="例如：教1-101" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">星期</label>
                            <select value={dayOfWeek} onChange={e => setDayOfWeek(Number(e.target.value))} className="w-full bg-slate-50 rounded-2xl py-3 px-5 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700">
                                <option value={1}>周一</option>
                                <option value={2}>周二</option>
                                <option value={3}>周三</option>
                                <option value={4}>周四</option>
                                <option value={5}>周五</option>
                                <option value={6}>周六</option>
                                <option value={7}>周日</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">周类型</label>
                            <div className="flex bg-slate-50 p-1 rounded-2xl">
                                {(['all', 'odd', 'even'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setWeekType(t)}
                                        className={cn(
                                            "flex-1 py-2 text-[10px] font-bold rounded-xl transition-all",
                                            weekType === t ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"
                                        )}
                                    >
                                        {t === 'all' ? '全部' : t === 'odd' ? '单周' : '双周'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">节次（起）</label>
                            <input type="number" min="1" max="12" value={startSection} onChange={e => setStartSection(Number(e.target.value))} className="w-full bg-slate-50 rounded-2xl py-3 px-5 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">节次（止）</label>
                            <input type="number" min="1" max="12" value={endSection} onChange={e => setEndSection(Number(e.target.value))} className="w-full bg-slate-50 rounded-2xl py-3 px-5 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700" />
                        </div>
                    </div>
                </div>

                <div className="p-6 sm:p-8 pt-0 mt-auto">
                    <button 
                        onClick={() => onAdd({ name, location, dayOfWeek, startSection, endSection, weekType })}
                        disabled={!name}
                        className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-slate-200 active:scale-[0.98] transition-all disabled:opacity-50 text-sm"
                    >
                        添加课程
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const SettingsView = ({ 
  notificationsEnabled, setNotificationsEnabled, 
  autoSyncCourses, setAutoSyncCourses,
  autoCompleteSynced, setAutoCompleteSynced,
  setView 
}: {
  notificationsEnabled: boolean,
  setNotificationsEnabled: (b: boolean) => void,
  autoSyncCourses: boolean,
  setAutoSyncCourses: (b: boolean) => void,
  autoCompleteSynced: boolean,
  setAutoCompleteSynced: (b: boolean) => void,
  setView: (v: ViewType) => void
}) => {
  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationsEnabled(true);
    }
  };

  return (
    <div className="px-6 pt-12 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-10">
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setView('today')}
          className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 text-slate-400"
        >
          <ChevronLeft size={20} />
        </motion.button>
        <h1 className="text-2xl font-bold text-slate-900">个人中心</h1>
      </div>
      
      <div className="space-y-4">
        {/* 通知设置 */}
        <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600">
              <Bell size={22} />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">提醒通知</p>
              <p className="text-[10px] text-slate-400">计划开始前5分钟提醒</p>
            </div>
          </div>
          <button 
            onClick={notificationsEnabled ? () => setNotificationsEnabled(false) : requestPermission}
            className={cn(
              "w-12 h-6 rounded-full transition-all relative p-1",
              notificationsEnabled ? "bg-indigo-600" : "bg-slate-200"
            )}
          >
            <motion.div 
              animate={{ x: notificationsEnabled ? 24 : 0 }}
              className="w-4 h-4 bg-white rounded-full shadow-md"
            />
          </button>
        </div>

        {/* 自动化设置 */}
        <div className="bg-white rounded-[40px] px-6 py-2 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between py-6 border-b border-slate-50">
                <div className="flex items-center gap-4">
                    <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600">
                        <Calendar size={22} />
                    </div>
                    <div>
                        <p className="font-bold text-slate-900 text-sm">自动同步今日课表</p>
                        <p className="text-[10px] text-slate-400">将今日课程自动导入日程列表</p>
                    </div>
                </div>
                <button 
                    onClick={() => setAutoSyncCourses(!autoSyncCourses)}
                    className={cn(
                        "w-12 h-6 rounded-full transition-all relative p-1",
                        autoSyncCourses ? "bg-emerald-500" : "bg-slate-200"
                    )}
                >
                    <motion.div 
                        animate={{ x: autoSyncCourses ? 24 : 0 }}
                        className="w-4 h-4 bg-white rounded-full shadow-md"
                    />
                </button>
            </div>

            <div className="flex items-center justify-between py-6">
                <div className="flex items-center gap-4">
                    <div className="bg-amber-50 p-3 rounded-2xl text-amber-600">
                        <CheckCircle2 size={22} />
                    </div>
                    <div>
                        <p className="font-bold text-slate-900 text-sm">同步后自动完成</p>
                        <p className="text-[10px] text-slate-400">导入的课程自动标记为已完成状态</p>
                    </div>
                </div>
                <button 
                    disabled={!autoSyncCourses}
                    onClick={() => setAutoCompleteSynced(!autoCompleteSynced)}
                    className={cn(
                        "w-12 h-6 rounded-full transition-all relative p-1",
                        autoCompleteSynced ? "bg-amber-500" : "bg-slate-200",
                        !autoSyncCourses && "opacity-30 cursor-not-allowed"
                    )}
                >
                    <motion.div 
                        animate={{ x: autoCompleteSynced ? 24 : 0 }}
                        className="w-4 h-4 bg-white rounded-full shadow-md"
                    />
                </button>
            </div>
        </div>

        <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-50">
            <AlertCircle className="text-slate-400" size={20} />
            <h3 className="font-bold text-slate-900 tracking-tight">智时日程助手信息</h3>
          </div>
          <div className="space-y-6 text-sm text-slate-500">
            <div className="flex justify-between items-center">
              <span className="font-medium">当前版本</span>
              <span className="font-bold text-slate-900 bg-slate-50 px-3 py-1 rounded-full text-[10px] uppercase tracking-wider">v1.2.0 Stable</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">数据安全</span>
              <span className="font-bold text-slate-900">本地加密存储</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">视觉主题</span>
              <span className="font-bold text-indigo-600">Professional Polish Theme</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Utils components
const PlanCard: React.FC<{ 
  plan: Plan, 
  onToggle: () => void, 
  onDelete: () => void,
}> = ({ plan, onToggle, onDelete }) => {
  const time = format(parseISO(plan.startTime), 'HH:mm');
  const isHigh = plan.priority === 'high';
  
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      className={cn(
        "bg-white rounded-[26px] p-5 flex items-center gap-4 border transition-all group",
        plan.isCompleted ? "border-transparent bg-slate-50/50 opacity-60" : "border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-50/50 hover:border-indigo-100"
      )}
    >
      <button 
        onClick={onToggle}
        className={cn(
          "transition-all duration-300 p-0.5 outline-none",
          plan.isCompleted ? "text-emerald-500" : "text-slate-300 hover:text-indigo-500"
        )}
      >
        {plan.isCompleted ? <CheckCircle2 size={26} strokeWidth={2.5} /> : <Circle size={26} strokeWidth={1.5} />}
      </button>
      
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className={cn(
            "font-bold transition-all text-base tracking-tight leading-tight break-words",
            plan.isCompleted ? "line-through text-slate-400" : "text-slate-900"
          )}>
            {plan.title}
          </p>
          {isHigh && <span className="flex-shrink-0 bg-red-50 text-red-500 text-[9px] px-2 py-1 rounded-full font-black uppercase tracking-tighter shadow-sm border border-red-100/50 mt-0.5">重要</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          <span className="flex items-center gap-1.5 shrink-0"><Clock size={12} className="text-slate-300" /> {time}</span>
          {plan.location && (
            <span className="flex items-start gap-1.5 text-slate-500 min-w-0">
              <MapPin size={12} className="text-indigo-400/60 shrink-0 mt-0.5" /> 
              <span className="break-words leading-tight">{plan.location}</span>
            </span>
          )}
          {plan.reminded && <span className="flex items-center gap-1.5 text-indigo-500 bg-indigo-50/50 px-2 py-0.5 rounded-full lowercase tracking-normal font-medium shrink-0"><Bell size={10} /> 已提醒</span>}
        </div>
      </div>

      <button 
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-2 bg-slate-50 rounded-xl"
      >
        <Trash2 size={18} />
      </button>
    </motion.div>
  );
};

const AddPlanModal = ({ onClose, onAdd }: { onClose: () => void, onAdd: (t: string, d: string, tm: string, p: 'low' | 'medium' | 'high') => void }) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  
  // Custom Time Selection state
  const initialTime = addHours(new Date(), 1);
  const [hour, setHour] = useState(initialTime.getHours());
  const [minute, setMinute] = useState(0);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  const handleCreate = () => {
    if (!title.trim()) {
      alert("请输入日程名称");
      return;
    }
    const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    onAdd(title.trim(), date, timeString, priority);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div 
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[40px] shadow-2xl relative flex flex-col max-h-[95vh]"
      >
        <div className="flex items-center justify-between p-6 sm:p-8 pb-4 border-b border-slate-50">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">添加新日程</h2>
            <button onClick={onClose} className="text-slate-400 bg-slate-100 p-2 rounded-full hover:bg-slate-200 transition-colors"><X size={18}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar p-6 sm:p-8 pt-4 space-y-5">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">任务名称</label>
            <input 
              autoFocus
              type="text" 
              placeholder="计划做点什么？" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl py-3 px-5 focus:ring-2 focus:ring-indigo-500 outline-none text-base font-medium placeholder:text-slate-300 shadow-inner"
            />
          </div>

          <div className="bg-slate-50 rounded-3xl p-4 sm:p-6 shadow-inner border border-slate-100">
            <div className="flex flex-col gap-6 items-center">
              <div className="w-full">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block text-center">日期选择</label>
                <div className="relative">
                    <input 
                      type="date" 
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-white border border-slate-100 rounded-xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700 shadow-sm text-center"
                    />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <WheelPicker 
                  label="小时"
                  options={hours} 
                  value={hour} 
                  onChange={setHour} 
                />
                <div className="flex flex-col pt-8">
                  <span className="text-xl font-black text-slate-300">:</span>
                </div>
                <WheelPicker 
                  label="分钟"
                  options={minutes} 
                  value={minute} 
                  onChange={setMinute} 
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">重要程度</label>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                    priority === p ? {
                      'low': "bg-emerald-50 border-emerald-500/30 text-emerald-700",
                      'medium': "bg-indigo-50 border-indigo-500/30 text-indigo-700",
                      'high': "bg-red-50 border-red-500/30 text-red-700"
                    }[p] : "bg-slate-50 border-transparent text-slate-400 hover:border-slate-200"
                  )}
                >
                  {p === 'low' ? '低' : p === 'medium' ? '中' : '高'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 pt-0 mt-auto">
            <button 
                disabled={!title}
                onClick={handleCreate}
                className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-slate-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none text-sm tracking-tight"
            >
                确认创建日程
            </button>
        </div>
      </motion.div>
    </div>
  );
};
