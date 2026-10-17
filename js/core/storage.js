/**
 * Local Storage & Data Integrity Manager
 * Handles persistent state, debounced auto-save, JSON export/import backup.
 */
const STORAGE_KEY = 'MT5_SIMULATOR_STATE_V1';

class StorageManager {
  constructor() {
    this.saveTimeout = null;
  }

  loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw);
      return this.validateIntegrity(state);
    } catch (err) {
      console.error('Failed to parse saved state from localStorage:', err);
      return null;
    }
  }

  saveState(state) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      try {
        const validated = this.validateIntegrity(state);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
      } catch (err) {
        console.error('Failed to save state to localStorage:', err);
      }
    }, 250);
  }

  saveStateImmediately(state) {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    try {
      const validated = this.validateIntegrity(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
    } catch (err) {
      console.error('Immediate save failed:', err);
    }
  }

  validateIntegrity(state) {
    if (!state || typeof state !== 'object') {
      state = {};
    }

    if (!Array.isArray(state.accounts) || state.accounts.length === 0) {
      state.accounts = [this.createDefaultAccount()];
      state.activeAccountId = state.accounts[0].id;
    }

    if (!state.activeAccountId || !state.accounts.find(a => a.id === state.activeAccountId)) {
      state.activeAccountId = state.accounts[0].id;
    }

    if (!Array.isArray(state.openPositions)) state.openPositions = [];
    if (!Array.isArray(state.pendingOrders)) state.pendingOrders = [];
    if (!Array.isArray(state.closedTrades)) state.closedTrades = [];
    if (!Array.isArray(state.balanceHistory)) state.balanceHistory = [];
    if (!Array.isArray(state.journalEntries)) state.journalEntries = [];
    if (!Array.isArray(state.systemLogs)) state.systemLogs = [];
    if (!Array.isArray(state.disciplineViolations)) state.disciplineViolations = [];

    if (!state.disciplineRules || typeof state.disciplineRules !== 'object') {
      state.disciplineRules = {
        maxRiskPerTradePercent: 2.0, // 2%
        maxDailyLossPercent: 5.0, // 5%
        maxTradesPerDay: 10,
        maxConsecutiveLosses: 3,
        minRiskRewardRatio: 1.5,
        mandatoryStopLoss: true,
        allowedSessions: ['London', 'New York', 'Asian']
      };
    }

    return state;
  }

  createDefaultAccount() {
    return {
      id: 'acc_' + Date.now(),
      accountNumber: '5001293',
      name: 'Main Demo Account',
      server: 'Local Demo',
      currency: 'USD',
      balance: 1000.0,
      initialBalance: 1000.0,
      leverage: 100, // 1:100
      hedging: true, // true: Hedging, false: Netting
      createdAt: new Date().toISOString()
    };
  }

  exportBackup(state) {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `MT5_Demo_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  async importBackup(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const validated = this.validateIntegrity(parsed);
          this.saveStateImmediately(validated);
          resolve(validated);
        } catch (err) {
          reject(new Error('Invalid backup file JSON'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}

export const storageManager = new StorageManager();
