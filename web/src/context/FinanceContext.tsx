import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UserFinancials,
  RunwayData,
  PurchaseCheckResult,
  AuditLogEntry,
  AgentMessage,
  ImportTransaction,
  Subscription,
  NeedLevel,
  PermissionTier,
  AuditResult,
} from '../types/finance';
import {
  DEFAULT_ALEX_FINANCIALS,
  SHORTFALL_ALEX_FINANCIALS,
  INITIAL_IMPORTED_TRANSACTIONS,
  calculateFinancialRunway,
  getRunway,
  checkPurchase as apiCheckPurchase,
  sendChat as apiSendChat,
  importData as apiImportData,
  buildInitialAuditChain,
  createAuditEntry,
  verifyChain,
} from '../services/api';

export type DemoScenario = 'normal' | 'shortfall';

interface FinanceContextType {
  scenario: DemoScenario;
  setScenario: (sc: DemoScenario) => void;
  financials: UserFinancials;
  runwayData: RunwayData | null;
  isLoadingRunway: boolean;
  activeTab: 'home' | 'check' | 'insights' | 'agent' | 'security';
  setActiveTab: (tab: 'home' | 'check' | 'insights' | 'agent' | 'security') => void;
  darkMode: boolean;
  setDarkMode: (dm: boolean) => void;
  
  // Purchase Check
  currentCheck: PurchaseCheckResult | null;
  isCheckingPurchase: boolean;
  runPurchaseCheck: (item: string, price: number, needLevel: NeedLevel, isColdWeather?: boolean) => Promise<PurchaseCheckResult>;
  overridePurchaseVerdict: (checkId: string) => Promise<void>;
  
  // Agent Chat
  messages: AgentMessage[];
  isAgentThinking: boolean;
  sendMessage: (text: string) => Promise<void>;
  approveT3Action: (actionId: string, actionData: any) => Promise<void>;
  cancelAction: (actionId: string) => void;
  t3MovedToday: number;
  
  // T4 PIN modal
  isPinModalOpen: boolean;
  pendingT4Action: any | null;
  openPinModal: (action: any) => void;
  closePinModal: () => void;
  executeT4WithPin: (pin: string) => Promise<boolean>;
  
  // Audit Log & SHA-256 Hash Chain
  auditLogs: AuditLogEntry[];
  isChainValid: boolean;
  simulateTampering: () => Promise<void>;
  resetAuditChain: () => Promise<void>;
  downloadAuditLogJson: () => void;
  
  // Import & Coverage
  importedTransactions: ImportTransaction[];
  coverage: { alipay: boolean; wechat: boolean; sms: boolean };
  isImportModalOpen: boolean;
  setIsImportModalOpen: (open: boolean) => void;
  handleImport: (source: 'Alipay' | 'WeChat' | 'SMS', payload: string) => Promise<{ success: boolean; duplicateNotice?: string; injectionFlagged?: boolean; transactions?: ImportTransaction[] }>;
  updateTransactionCategory: (txId: string, newCategory: string) => void;
  
  // Onboarding
  isOnboardingOpen: boolean;
  setIsOnboardingOpen: (open: boolean) => void;
  completeOnboarding: (data: Partial<UserFinancials>) => void;
  
  // Demo Help Draft modal
  draftHelpText: string | null;
  setDraftHelpText: (text: string | null) => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scenario, setScenarioState] = useState<DemoScenario>('normal');
  const [financials, setFinancials] = useState<UserFinancials>(DEFAULT_ALEX_FINANCIALS);
  const [runwayData, setRunwayData] = useState<RunwayData | null>(null);
  const [isLoadingRunway, setIsLoadingRunway] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'home' | 'check' | 'insights' | 'agent' | 'security'>('home');
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Purchase check state
  const [currentCheck, setCurrentCheck] = useState<PurchaseCheckResult | null>(null);
  const [isCheckingPurchase, setIsCheckingPurchase] = useState<boolean>(false);

  // Agent chat state
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'init-1',
      sender: 'agent',
      text: 'Hello Alex. I am ProAct, your pre-spend assistant. Your cash runway is ¥175 across 9 days until payday. How can I help you decide today?',
      timestamp: '09:00',
      tier: 'T0',
    },
  ]);
  const [isAgentThinking, setIsAgentThinking] = useState<boolean>(false);

  // T3 Sandbox moved today tracker (Daily cap ¥500)
  const [t3MovedToday, setT3MovedToday] = useState<number>(0);

  // PIN modal
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [pendingT4Action, setPendingT4Action] = useState<any | null>(null);

  // Cryptographic Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isChainValid, setIsChainValid] = useState<boolean>(true);

  // Import & Coverage
  const [importedTransactions, setImportedTransactions] = useState<ImportTransaction[]>(INITIAL_IMPORTED_TRANSACTIONS);
  const [coverage, setCoverage] = useState({ alipay: true, wechat: false, sms: true });
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Onboarding
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);

  // Draft Help Text
  const [draftHelpText, setDraftHelpText] = useState<string | null>(null);

  // Build initial SHA-256 chain on startup
  useEffect(() => {
    buildInitialAuditChain().then((chain) => {
      setAuditLogs(chain);
      verifyChain(chain).then((res) => setIsChainValid(res.isValid));
    });
  }, []);

  // Toggle Dark Mode on HTML body
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Recalculate runway whenever financials change
  useEffect(() => {
    setIsLoadingRunway(true);
    getRunway(financials).then((data) => {
      setRunwayData(data);
      setIsLoadingRunway(false);
    });
  }, [financials]);

  // Helper to append an entry with cryptographic SHA-256 linkage
  const appendAuditLog = async (
    action: string,
    tier: PermissionTier,
    ruleUsed: string,
    result: AuditResult,
    details?: string
  ): Promise<AuditLogEntry> => {
    const lastEntry = auditLogs.length > 0 ? auditLogs[auditLogs.length - 1] : null;
    const newEntry = await createAuditEntry(lastEntry, action, tier, ruleUsed, result, details);
    const nextLogs = [...auditLogs, newEntry];
    setAuditLogs(nextLogs);
    const verifyRes = await verifyChain(nextLogs);
    setIsChainValid(verifyRes.isValid);
    return newEntry;
  };

  // Switch between Normal (¥175 safe) and Shortfall (-¥85 safe) scenarios
  const setScenario = (sc: DemoScenario) => {
    setScenarioState(sc);
    if (sc === 'shortfall') {
      const sf = SHORTFALL_ALEX_FINANCIALS;
      const res = calculateFinancialRunway(
        sf.cash,
        sf.daysToPayday,
        sf.committedBills,
        sf.dailyBaseline,
        sf.savingsPot,
        sf.savingsGoal,
        sf.monthlyIncome,
        sf.spendingStyle,
        sf.subscriptions
      );
      setFinancials(res.financials);
    } else {
      const def = DEFAULT_ALEX_FINANCIALS;
      const res = calculateFinancialRunway(
        def.cash,
        def.daysToPayday,
        def.committedBills,
        def.dailyBaseline,
        def.savingsPot,
        def.savingsGoal,
        def.monthlyIncome,
        def.spendingStyle,
        def.subscriptions
      );
      setFinancials(res.financials);
    }
  };

  // Run Purchase Check
  const runPurchaseCheck = async (
    item: string,
    price: number,
    needLevel: NeedLevel,
    isColdWeather = false
  ): Promise<PurchaseCheckResult> => {
    setIsCheckingPurchase(true);
    try {
      const result = await apiCheckPurchase(item, price, needLevel, financials, isColdWeather);
      setCurrentCheck(result);

      // Append cryptographically chained audit log
      await appendAuditLog(
        `Evaluate pre-purchase: "${item}" (¥${price})`,
        'T0',
        `R-PURCHASE-${needLevel.toUpperCase()}_EVALUATOR`,
        'approved',
        `Need: ${needLevel}. Verdict: ${result.verdictChip}. Can afford: ${result.canAfford}.`
      );

      return result;
    } finally {
      setIsCheckingPurchase(false);
    }
  };

  // Override Purchase Verdict
  const overridePurchaseVerdict = async (checkId: string) => {
    if (!currentCheck || currentCheck.id !== checkId) return;

    setCurrentCheck({
      ...currentCheck,
      overridden: true,
      verdictChip: 'Buy',
      aiExplanation: `${currentCheck.aiExplanation} (Override logged by user: We won't nag again.)`,
    });

    await appendAuditLog(
      `User Overrode Verdict on "${currentCheck.item}"`,
      'T2',
      'R99-HUMAN_OVERRIDE_AUTONOMY',
      'overridden',
      'User acknowledged wait guidance and chose to override. Action logged permanently.'
    );
  };

  // Send message in Agent Chat
  const sendMessage = async (text: string) => {
    const userMsg: AgentMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsAgentThinking(true);

    try {
      const response = await apiSendChat(text, financials);
      setMessages((prev) => [...prev, response]);

      // If injection attempt was blocked
      if (response.isInjectionFlagged) {
        await appendAuditLog(
          'Prompt Injection Defense Blocked',
          'T4',
          'R-DEFENSE-PROMPT_INJECTION_SHIELD',
          'blocked',
          'Rule-based filter caught attempt: Treated as data. No action taken.'
        );
      }
    } finally {
      setIsAgentThinking(false);
    }
  };

  // Approve T3 Sandbox Action (e.g. Move ¥300 to savings) with Daily Cap ¥500 enforcement
  const approveT3Action = async (actionId: string, actionData: any) => {
    setIsAgentThinking(true);
    try {
      const transferAmt = actionData.amount || 300;

      // Requirement 3: When approval would push total moved today above 500, block it!
      if (t3MovedToday + transferAmt > 500) {
        await appendAuditLog(
          'Blocked: Exceeds Daily Sandbox Cap',
          'T3',
          'R12-INTERNAL_SANDBOX_TRANSFER_CAP',
          'blocked',
          `Daily sandbox cap of ¥500 reached. Move of ¥${transferAmt} blocked (already used ¥${t3MovedToday} today).`
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.actionData?.actionId === actionId
              ? {
                  ...m,
                  text: `Daily sandbox cap of ¥500 reached. Cannot move ¥${transferAmt}. Already moved ¥${t3MovedToday} of ¥500 today.`,
                  actionData: undefined,
                  isBlocked: true,
                }
              : m
          )
        );
        return;
      }

      // Cap not exceeded -> approve and update tracking
      const newUsed = t3MovedToday + transferAmt;
      setT3MovedToday(newUsed);

      await appendAuditLog(
        `Transfer ¥${transferAmt} to Savings Pot`,
        'T3',
        'R12-INTERNAL_SANDBOX_TRANSFER_CAP',
        'approved',
        `User approved transfer of ¥${transferAmt}. Used today: ¥${newUsed}/¥500.`
      );

      const newCash = Math.max(0, financials.cash - transferAmt);
      const newSavings = financials.savingsPot + transferAmt;
      const recalc = calculateFinancialRunway(
        newCash,
        financials.daysToPayday,
        financials.committedBills,
        financials.dailyBaseline,
        newSavings,
        financials.savingsGoal,
        financials.monthlyIncome,
        financials.spendingStyle,
        financials.subscriptions
      );
      setFinancials(recalc.financials);

      setMessages((prev) =>
        prev.map((m) =>
          m.actionData?.actionId === actionId
            ? {
                ...m,
                text: `Completed: ¥${transferAmt} has been moved to your Savings Pot (New pot: ¥${newSavings}). Runway updated. Used today ¥${newUsed} of ¥500.`,
                actionData: { ...m.actionData, isApproved: true },
              }
            : m
        )
      );
    } finally {
      setIsAgentThinking(false);
    }
  };

  const cancelAction = (actionId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.actionData?.actionId === actionId
          ? {
              ...m,
              text: 'Action cancelled by user. No money was moved.',
              actionData: undefined,
            }
          : m
      )
    );
  };

  // T4 PIN Execution
  const openPinModal = (action: any) => {
    setPendingT4Action(action);
    setIsPinModalOpen(true);
  };

  const closePinModal = () => {
    setIsPinModalOpen(false);
    setPendingT4Action(null);
  };

  const executeT4WithPin = async (pin: string): Promise<boolean> => {
    if (pin.length !== 6) return false;

    if (pendingT4Action) {
      const billAmt = pendingT4Action.amount || 120;
      const newCash = Math.max(0, financials.cash - billAmt);
      const newBills = Math.max(0, financials.committedBills - billAmt);

      const recalc = calculateFinancialRunway(
        newCash,
        financials.daysToPayday,
        newBills,
        financials.dailyBaseline,
        financials.savingsPot,
        financials.savingsGoal,
        financials.monthlyIncome,
        financials.spendingStyle,
        financials.subscriptions
      );
      setFinancials(recalc.financials);

      await appendAuditLog(
        `Execute Payment: ¥${billAmt} to ${pendingT4Action.recipient || 'Vendor'}`,
        'T4',
        'R20-SIMULATED_PIN_VERIFIED_PAYMENT',
        'approved',
        'User authenticated with 6-digit PIN. External draft released.'
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          sender: 'agent',
          text: `Payment of ¥${billAmt} to ${pendingT4Action.recipient} confirmed with PIN. Your committed bills are now ¥${newBills}.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          tier: 'T4',
        },
      ]);
    }

    closePinModal();
    return true;
  };

  // Simulate in-memory tampering to test cryptographic verification
  const simulateTampering = async () => {
    if (auditLogs.length < 2) return;
    const tampered = auditLogs.map((entry, idx) =>
      idx === 1
        ? { ...entry, action: 'Unauthorized Wire ¥50,000 to Unknown Account' }
        : entry
    );
    setAuditLogs(tampered);
    const verifyRes = await verifyChain(tampered);
    setIsChainValid(verifyRes.isValid);
  };

  // Reset audit log back to verified chain
  const resetAuditChain = async () => {
    const freshChain = await buildInitialAuditChain();
    setAuditLogs(freshChain);
    const verifyRes = await verifyChain(freshChain);
    setIsChainValid(verifyRes.isValid);
  };

  // Download execution log as JSON
  const downloadAuditLogJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(auditLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `proact_audit_execution_log_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import & Coverage handler
  const handleImport = async (source: 'Alipay' | 'WeChat' | 'SMS', payload: string) => {
    const result = await apiImportData(source, payload);

    if (result.transactions.length > 0) {
      setImportedTransactions((prev) => [...result.transactions, ...prev]);
    }

    if (source === 'Alipay') setCoverage((prev) => ({ ...prev, alipay: true }));
    if (source === 'WeChat') setCoverage((prev) => ({ ...prev, wechat: true }));
    if (source === 'SMS') setCoverage((prev) => ({ ...prev, sms: true }));

    // Rule 5: If injection attempt in bank SMS or merchant name, log blocked audit entry
    if (result.injectionFlagged) {
      await appendAuditLog(
        `Blocked Ingestion of Adversarial Input in ${source}`,
        'T4',
        'R-DEFENSE-PROMPT_INJECTION_SHIELD',
        'blocked',
        'Rule-based filter: Ingestion payload contained prompt injection directive. Treated as data, no execution, flagged.'
      );
    }

    return {
      success: result.success,
      duplicateNotice: result.duplicateNotice,
      injectionFlagged: result.injectionFlagged,
      transactions: result.transactions,
    };
  };

  const updateTransactionCategory = (txId: string, newCategory: string) => {
    setImportedTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, category: newCategory, needsReview: false } : t))
    );
  };

  // Onboarding completion
  const completeOnboarding = (data: Partial<UserFinancials>) => {
    const updated = { ...financials, ...data };
    const recalc = calculateFinancialRunway(
      updated.cash,
      updated.daysToPayday,
      updated.committedBills,
      updated.dailyBaseline,
      updated.savingsPot,
      updated.savingsGoal,
      updated.monthlyIncome,
      updated.spendingStyle,
      updated.subscriptions
    );
    setFinancials(recalc.financials);
    setIsOnboardingOpen(false);
  };

  return (
    <FinanceContext.Provider
      value={{
        scenario,
        setScenario,
        financials,
        runwayData,
        isLoadingRunway,
        activeTab,
        setActiveTab,
        darkMode,
        setDarkMode,
        currentCheck,
        isCheckingPurchase,
        runPurchaseCheck,
        overridePurchaseVerdict,
        messages,
        isAgentThinking,
        sendMessage,
        approveT3Action,
        cancelAction,
        t3MovedToday,
        isPinModalOpen,
        pendingT4Action,
        openPinModal,
        closePinModal,
        executeT4WithPin,
        auditLogs,
        isChainValid,
        simulateTampering,
        resetAuditChain,
        downloadAuditLogJson,
        importedTransactions,
        coverage,
        isImportModalOpen,
        setIsImportModalOpen,
        handleImport,
        updateTransactionCategory,
        isOnboardingOpen,
        setIsOnboardingOpen,
        completeOnboarding,
        draftHelpText,
        setDraftHelpText,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
};
