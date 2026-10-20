import React from 'react';
import { useFinance } from '../../context/FinanceContext';
import {
  ShieldAlert,
  ArrowRight,
  TrendingDown,
  Calendar,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2,
  Bot,
  CheckSquare,
  Sparkles,
} from 'lucide-react';

export const HomeScreen: React.FC = () => {
  const {
    financials,
    runwayData,
    isLoadingRunway,
    setActiveTab,
    setIsImportModalOpen,
    coverage,
    scenario,
    setScenario,
  } = useFinance();

  const isShortfall = financials.safeToSpend < 0;
  const safeToday = financials.safeToday;
  const safeUntilPayday = financials.safeToSpend;

  return (
    <div className="space-y-4 pb-6 animate-in fade-in duration-150">
      {/* 1. Data Coverage Banner (Tap to open Import) */}
      <button
        onClick={() => setIsImportModalOpen(true)}
        className="w-full text-left p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between gap-3 transition-colors hover:bg-amber-100/60 group"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Sources imported: {coverage.alipay ? 'Alipay' : 'None'}{coverage.sms ? ', SMS' : ''}. Missing: {!coverage.wechat ? 'WeChat' : 'None'}.
            </p>
            <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80">
              Totals are not complete. Tap to connect sources.
            </p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </button>

      {/* 2. Shortfall Warning Card (Shown when runway is negative) */}
      {isShortfall && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <h3 className="text-sm font-bold">Imminent Shortfall Detected</h3>
          </div>
          <p className="text-xs leading-relaxed text-rose-800 dark:text-rose-200">
            Current trajectory has a <span className="font-bold">¥{Math.abs(financials.safeToSpend)} deficit</span> before payday. Projected shortfall hits around{' '}
            <span className="font-semibold underline decoration-rose-400">{runwayData?.shortfallDate || 'Oct 23'}</span>.
          </p>
          <div className="pt-1 flex gap-2">
            <button
              onClick={() => setActiveTab('check')}
              className="text-xs px-3 py-1.5 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 transition-colors"
            >
              Check Alternatives
            </button>
            <button
              onClick={() => setActiveTab('agent')}
              className="text-xs px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700 font-medium text-rose-800 dark:text-rose-200 hover:bg-rose-50"
            >
              Ask Agent for Remedies
            </button>
          </div>
        </div>
      )}

      {/* 3. Primary Runway Card: Big Number */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Safe to spend per day
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 font-mono">
              ¥{safeToday.toFixed(safeToday % 1 === 0 ? 0 : 1)}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              / day · {financials.daysToPayday} days left
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Baseline food & transit (¥{financials.dailyBaseline}/day) is already locked in.
          </p>
        </div>

        {/* Daily Runway Visualization Bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-2">
            <span className="font-medium">Projected Daily Cash Balance</span>
            <span className="font-mono text-[11px]">Payday in {financials.daysToPayday}d</span>
          </div>

          <div className="grid grid-cols-10 gap-1.5 pt-1">
            {runwayData?.days.map((day) => {
              const isToday = day.dayNumber === 0;
              const isPayday = day.isPayday;
              return (
                <div key={day.dayNumber} className="flex flex-col items-center gap-1 group relative">
                  {/* Tooltip on hover */}
                  <div className="absolute -top-11 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                    <div className="px-2 py-1 bg-slate-900 text-white rounded text-[10px] whitespace-nowrap shadow-md font-mono">
                      {day.dateStr}: ¥{day.projectedBalance} {day.hasBill ? `(${day.billName} -¥${day.billAmount})` : ''}
                    </div>
                    <div className="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-1" />
                  </div>

                  {/* Bar */}
                  <div className="w-full h-16 bg-slate-100 dark:bg-slate-800 rounded-lg flex flex-col justify-end p-0.5 overflow-hidden">
                    <div
                      style={{
                        height: isShortfall
                          ? day.isDeficit ? '100%' : '50%'
                          : `${Math.min(100, Math.max(15, (day.projectedBalance / (financials.cash || 600)) * 100))}%`,
                      }}
                      className={`w-full rounded-md transition-all duration-300 ${
                        day.isDeficit
                          ? 'bg-rose-500'
                          : day.hasBill
                          ? 'bg-amber-500'
                          : isToday
                          ? 'bg-teal-700 dark:bg-teal-500'
                          : isPayday
                          ? 'bg-emerald-600'
                          : 'bg-teal-600/70 dark:bg-teal-600/60'
                      }`}
                    />
                  </div>

                  {/* Day label */}
                  <span className={`text-[10px] font-mono leading-none ${isToday ? 'font-bold text-teal-800 dark:text-teal-400' : 'text-slate-600 dark:text-slate-400'}`}>
                    {day.dayLabel}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80 mt-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-teal-700 inline-block" /> Safe buffer
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-amber-500 inline-block" /> Bills due
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-xs bg-emerald-600 inline-block" /> Payday
            </span>
          </div>
        </div>
      </div>

      {/* 4. Second Card: Safe until payday ¥175. Bills covered. */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Runway Status
          </span>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {isShortfall ? (
              <span className="text-rose-600 font-mono font-bold">Safe until payday: -¥{Math.abs(financials.safeToSpend)}</span>
            ) : (
              <span className="text-slate-900 dark:text-slate-100">
                Safe until payday: <span className="font-mono text-teal-800 dark:text-teal-400">¥{safeUntilPayday}</span>
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {isShortfall
              ? 'Shortfall exists. Bills require savings or cuts.'
              : `Bills covered (¥${financials.committedBills} reserved).`}
          </p>
        </div>

        <div className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
          isShortfall
            ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
            : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
        }`}>
          {isShortfall ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span>Deficit</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Protected</span>
            </>
          )}
        </div>
      </div>

      {/* 5. Account Balances Snapshot */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] text-slate-500">Cash on Hand</span>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
            ¥{financials.cash}
          </p>
          <span className="text-[10px] text-slate-400">Wallet & Bank</span>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span className="text-[11px] text-slate-500">Savings Pot</span>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
            ¥{financials.savingsPot}
          </p>
          <span className="text-[10px] text-teal-700 dark:text-teal-400">Goal: ¥{financials.savingsGoal}</span>
        </div>
      </div>

      {/* 6. Quick Action Buttons */}
      <div className="space-y-2 pt-1">
        <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 px-1">
          Quick Actions
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setActiveTab('check')}
            className="p-3 rounded-2xl bg-teal-800 dark:bg-teal-700 text-white flex flex-col items-center justify-center text-center gap-1.5 hover:bg-teal-900 transition-colors shadow-xs active:scale-98"
          >
            <CheckSquare className="w-5 h-5" />
            <span className="text-xs font-semibold leading-tight">Can I buy this?</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 flex flex-col items-center justify-center text-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs active:scale-98"
          >
            <FileSpreadsheet className="w-5 h-5 text-teal-800 dark:text-teal-400" />
            <span className="text-xs font-semibold leading-tight">Import data</span>
          </button>

          <button
            onClick={() => setActiveTab('agent')}
            className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 flex flex-col items-center justify-center text-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs active:scale-98"
          >
            <Bot className="w-5 h-5 text-teal-800 dark:text-teal-400" />
            <span className="text-xs font-semibold leading-tight">Ask agent</span>
          </button>
        </div>
      </div>
    </div>
  );
};
