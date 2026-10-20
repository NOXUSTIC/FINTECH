export type NeedLevel = 'essential' | 'needed_soon' | 'want';

export type VerdictChip =
  | 'Buy'
  | 'Wait 24 hours'
  | 'Wait until payday'
  | 'Cheaper option'
  | 'Spend more here (buy it for life)';

export type PermissionTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export type AuditResult = 'approved' | 'blocked' | 'overridden' | 'draft';

export interface Subscription {
  id: string;
  name: string;
  price: number;
  previousPrice?: number;
  priceChangeAlert?: boolean;
  billingDate: string;
  category: string;
  isProtected: boolean;
}

export interface UserFinancials {
  cash: number;
  daysToPayday: number;
  committedBills: number;
  dailyBaseline: number;
  safeToSpend: number;
  safeToday: number;
  savingsPot: number;
  savingsGoal: number;
  monthlyIncome: number;
  spendingStyle: 'Frugal Saver' | 'Balanced' | 'Luxury Lover';
  subscriptions: Subscription[];
}

export interface RunwayDay {
  dayNumber: number;
  dayLabel: string;
  dateStr: string;
  projectedBalance: number;
  isPayday: boolean;
  hasBill: boolean;
  billAmount?: number;
  billName?: string;
  isDeficit: boolean;
}

export interface RunwayData {
  financials: UserFinancials;
  days: RunwayDay[];
  shortfallDate?: string;
  isShortfall: boolean;
  shortfallGap: number;
  sourcesCoverage: {
    alipay: boolean;
    wechat: boolean;
    sms: boolean;
  };
}

export interface FundingOption {
  tier: 'second_hand' | 'adequate' | 'premium';
  label: string;
  price: number;
  runwayAfter: number;
  isAffordable: boolean;
  note: string;
  isRecommended?: boolean;
}

export interface PurchaseCheckRequest {
  item: string;
  price: number;
  needLevel: NeedLevel;
  isColdWeather?: boolean;
}

export interface PurchaseCheckResult {
  id: string;
  item: string;
  price: number;
  needLevel: NeedLevel;
  canAfford: boolean;
  shouldBuy: boolean;
  verdictChip: VerdictChip;
  timingRecommendation?: string;
  fundingPlan?: FundingOption[];
  shortfallGap?: number;
  remediationOptions?: string[];
  aiExplanation: string;
  aiProviderBadge: string;
  confidence: 'High' | 'Medium' | 'Low';
  referenceTransactions: string[];
  fundedFrom?: string;
  overridden?: boolean;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  tier: PermissionTier;
  ruleUsed: string;
  result: AuditResult;
  hash: string;
  prevHash: string;
  details?: string;
}

export interface AgentActionPayload {
  actionId: string;
  type: 'transfer_savings' | 'pay_bill' | 'pause_sub' | 'style_change';
  amount?: number;
  target?: string;
  dailyCap?: number;
  recipient?: string;
  isApproved?: boolean;
  isDraft?: boolean;
}

export interface AgentMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  tier?: PermissionTier;
  actionData?: AgentActionPayload;
  isInjectionFlagged?: boolean;
  isBlocked?: boolean;
  isOverridden?: boolean;
  provider?: string;
}

export interface ImportTransaction {
  id: string;
  rawText?: string;
  date: string;
  merchant: string;
  amount: number;
  category: string;
  confidence: 'High' | 'Medium' | 'Low';
  source: 'Alipay' | 'WeChat' | 'SMS';
  mergedWith?: string;
  needsReview?: boolean;
  isFlaggedInjection?: boolean;
}

export interface CategorySpending {
  category: string;
  amount: number;
  color: string;
  isProtected: boolean;
  transactionCount: number;
}

export interface InsightsData {
  month: string;
  totalIncome: number;
  totalBills: number;
  totalVariable: number;
  categories: CategorySpending[];
  billsRatioPercent: number; // e.g. 23.5% vs 35% guideline
  reconciliationCheck: {
    partsTotal: number;
    accountTotal: number;
    isBalanced: boolean;
  };
  protectedSpending: {
    items: { name: string; amount: number; icon: string }[];
    total: number;
  };
}
