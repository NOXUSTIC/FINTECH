import React, { useState, useEffect } from 'react';
import { useFinance } from '../../context/FinanceContext';
import { InsightsData } from '../../types/finance';
import { getInsights } from '../../services/api';
import {
  PieChart,
  Lock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

export const InsightsScreen: React.FC = () => {
  const { financials } = useFinance();
  const [selectedMonth, setSelectedMonth] = useState<string>('October 2026');
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    setIsLoading(true);
    getInsights(selectedMonth).then((data) => {
      setInsights(data);
      setIsLoading(false);
    });
  }, [selectedMonth]);

  if (isLoading || !insights) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-teal-800 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-500">Reconciling spending categories...</p>
      </div>
    );
  }

  // Calculate SVG donut slices
  const totalCategoryAmount = insights.categories.reduce((acc, c) => acc + c.amount, 0);
  let cumulativeAngle = 0;
  const slices = insights.categories.map((cat) => {
    const percentage = cat.amount / totalCategoryAmount;
    const strokeDasharray = `${percentage * 100} ${100 - percentage * 100}`;
    const strokeDashoffset = -cumulativeAngle * 100;
    cumulativeAngle += percentage;
    return {
      ...cat,
      percentage: Math.round(percentage * 100),
      strokeDasharray,
      strokeDashoffset,
    };
  });

  return (
    <div className="space-y-4 pb-6 animate-in fade-in duration-150">
      {/* Month Selector & Reconciliation Badge */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-sm font-bold text-slate-900 dark:text-slate-100 bg-transparent pr-4 cursor-pointer focus:outline-none"
          >
            <option value="October 2026">October 2026</option>
            <option value="September 2026">September 2026</option>
            <option value="August 2026">August 2026</option>
          </select>
        </div>

        {/* Reconciliation Check Badge */}
        {insights.reconciliationCheck.isBalanced ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Reconciliation: parts = total ✓</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs font-semibold">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Reconciliation: Parts do not match total</span>
          </div>
        )}
      </div>

      {/* 1. Category Spending Donut Chart */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Spending by Category
          </h3>
          <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
            Total: ¥{totalCategoryAmount}
          </span>
        </div>

        <div className="flex items-center justify-center gap-6 py-2">
          {/* SVG Donut */}
          <div className="relative w-36 h-36 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              {slices.map((slice, idx) => (
                <circle
                  key={idx}
                  cx="18"
                  cy="18"
                  r="15.915"
                  fill="transparent"
                  stroke={slice.color}
                  strokeWidth="3.8"
                  strokeDasharray={slice.strokeDasharray}
                  strokeDashoffset={slice.strokeDashoffset}
                  className="transition-all duration-500"
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] text-slate-500 font-medium">Monthly</span>
              <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
                ¥{totalCategoryAmount}
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-1.5 flex-1 min-w-0">
            {slices.map((cat, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    {cat.category}
                  </span>
                  {cat.isProtected && <Lock className="w-2.5 h-2.5 text-teal-700 shrink-0" />}
                </div>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 shrink-0 ml-2">
                  ¥{cat.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Bills vs Income Bar with 35% guideline reference line */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Bills vs Income
            </h3>
            <p className="text-[11px] text-slate-500">
              Committed bills (¥{insights.totalBills}) take {insights.billsRatioPercent}% of ¥{insights.totalIncome} income
            </p>
          </div>
          <span className="text-xs font-bold text-teal-800 dark:text-teal-400 font-mono">
            {insights.billsRatioPercent}%
          </span>
        </div>

        {/* Bar with 35% guideline marker */}
        <div className="space-y-1.5 pt-1">
          <div className="relative w-full h-6 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden p-0.5">
            {/* 35% reference line marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-amber-500 z-10"
              style={{ left: '35%' }}
            />
            {/* Actual bills bar */}
            <div
              className="h-full bg-teal-800 dark:bg-teal-600 rounded-lg transition-all duration-500"
              style={{ width: `${Math.min(100, (insights.totalBills / insights.totalIncome) * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>0%</span>
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              35% Reference Guide (Not a rigid rule)
            </span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* 3. Recurring Charges List with Price Change Flags */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Recurring Subscriptions
          </h3>
          <span className="text-[11px] text-slate-500">3 services active</span>
        </div>

        <div className="space-y-2">
          {financials.subscriptions.map((sub) => (
            <div
              key={sub.id}
              className={`p-3 rounded-2xl border transition-all ${
                sub.priceChangeAlert
                  ? 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20'
                  : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
              } flex items-center justify-between`}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {sub.name}
                  </span>
                  {sub.priceChangeAlert && (
                    <span className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-200 px-1.5 py-0.2 rounded-md flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-600" /> +¥{sub.price - (sub.previousPrice || 0)} Price hike
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Renews {sub.billingDate} · {sub.category}
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                  ¥{sub.price}/mo
                </span>
                {sub.previousPrice && (
                  <p className="text-[10px] text-slate-400 line-through">
                    ¥{sub.previousPrice}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Protected Spending (Lock icon: rent, utilities, food, health, transport) */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-teal-800 dark:text-teal-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Protected Spending
            </h3>
          </div>
          <span className="text-xs font-mono font-bold text-teal-800 dark:text-teal-400">
            ¥{insights.protectedSpending.total}
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Essential survival lines ringfenced from discretionary recommendations.
        </p>

        <div className="grid grid-cols-1 gap-1.5 pt-1">
          {insights.protectedSpending.items.map((item, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <Lock className="w-3 h-3 text-teal-700 dark:text-teal-400" />
                <span>{item.name}</span>
              </div>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                ¥{item.amount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
