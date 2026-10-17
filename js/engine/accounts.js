/**
 * Local Demo Accounts System
 * Manages multiple internal demo accounts, virtual deposits/withdrawals, balance history.
 */
import { eventBus } from '../core/eventBus.js';
import { audioManager } from '../core/audio.js';

export class AccountsManager {
  constructor(state, onStateChange) {
    this.accounts = state.accounts || [];
    this.activeAccountId = state.activeAccountId || (this.accounts[0] ? this.accounts[0].id : null);
    this.balanceHistory = state.balanceHistory || [];
    this.onStateChange = onStateChange;

    if (this.accounts.length === 0) {
      this.createAccount({
        name: 'Default Demo Account',
        balance: 1000,
        leverage: 100,
        currency: 'USD',
        hedging: true
      });
    }
  }

  getActiveAccount() {
    return this.accounts.find(a => a.id === this.activeAccountId) || this.accounts[0];
  }

  getAllAccounts() {
    return this.accounts;
  }

  switchAccount(accountId) {
    const acc = this.accounts.find(a => a.id === accountId);
    if (!acc) return false;
    this.activeAccountId = accountId;
    this.notifyChange();
    eventBus.emit('account:switched', acc);
    return true;
  }

  createAccount({ name, balance = 1000, leverage = 100, currency = 'USD', hedging = true }) {
    const initialBalance = parseFloat(balance) || 1000;
    const newAcc = {
      id: 'acc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      accountNumber: String(5000000 + Math.floor(Math.random() * 900000)),
      name: name.trim() || 'Demo Account',
      server: 'Local Demo',
      currency: currency.toUpperCase(),
      balance: initialBalance,
      initialBalance: initialBalance,
      leverage: parseInt(leverage, 10) || 100,
      hedging: Boolean(hedging),
      createdAt: new Date().toISOString()
    };

    this.accounts.push(newAcc);
    this.activeAccountId = newAcc.id;

    this.recordBalanceHistory({
      accountId: newAcc.id,
      type: 'INITIAL_DEPOSIT',
      amount: initialBalance,
      oldBalance: 0,
      newBalance: initialBalance,
      comment: 'Initial Demo Balance'
    });

    this.notifyChange();
    audioManager.playOk();
    eventBus.emit('account:created', newAcc);
    return newAcc;
  }

  updateAccountSettings(accountId, { name, leverage }) {
    const acc = this.accounts.find(a => a.id === accountId);
    if (!acc) return false;
    if (name) acc.name = name.trim();
    if (leverage) acc.leverage = parseInt(leverage, 10);
    this.notifyChange();
    eventBus.emit('account:updated', acc);
    return true;
  }

  deposit(accountId, amount, comment = 'Virtual Deposit') {
    const acc = this.accounts.find(a => a.id === accountId);
    const val = parseFloat(amount);
    if (!acc || isNaN(val) || val <= 0) return false;

    const oldBalance = acc.balance;
    acc.balance = parseFloat((oldBalance + val).toFixed(2));

    this.recordBalanceHistory({
      accountId: acc.id,
      type: 'DEPOSIT',
      amount: val,
      oldBalance,
      newBalance: acc.balance,
      comment: comment || 'Virtual Deposit'
    });

    this.notifyChange();
    audioManager.playOk();
    eventBus.emit('balance:changed', { account: acc, amount: val, type: 'DEPOSIT' });
    return true;
  }

  withdraw(accountId, amount, comment = 'Virtual Withdrawal') {
    const acc = this.accounts.find(a => a.id === accountId);
    const val = parseFloat(amount);
    if (!acc || isNaN(val) || val <= 0) return false;
    if (acc.balance < val) {
      audioManager.playError();
      return { success: false, error: 'Insufficient funds for withdrawal' };
    }

    const oldBalance = acc.balance;
    acc.balance = parseFloat((oldBalance - val).toFixed(2));

    this.recordBalanceHistory({
      accountId: acc.id,
      type: 'WITHDRAW',
      amount: -val,
      oldBalance,
      newBalance: acc.balance,
      comment: comment || 'Virtual Withdrawal'
    });

    this.notifyChange();
    audioManager.playOk();
    eventBus.emit('balance:changed', { account: acc, amount: -val, type: 'WITHDRAW' });
    return { success: true };
  }

  adjustBalance(accountId, newBalanceAmount, comment = 'Manual Balance Adjustment') {
    const acc = this.accounts.find(a => a.id === accountId);
    const target = parseFloat(newBalanceAmount);
    if (!acc || isNaN(target) || target < 0) return false;

    const oldBalance = acc.balance;
    const diff = parseFloat((target - oldBalance).toFixed(2));
    acc.balance = target;

    this.recordBalanceHistory({
      accountId: acc.id,
      type: 'ADJUSTMENT',
      amount: diff,
      oldBalance,
      newBalance: target,
      comment: comment || 'Manual Balance Adjustment'
    });

    this.notifyChange();
    audioManager.playOk();
    eventBus.emit('balance:changed', { account: acc, amount: diff, type: 'ADJUSTMENT' });
    return true;
  }

  resetAccount(accountId) {
    const acc = this.accounts.find(a => a.id === accountId);
    if (!acc) return false;

    const oldBalance = acc.balance;
    acc.balance = acc.initialBalance;

    this.recordBalanceHistory({
      accountId: acc.id,
      type: 'RESET',
      amount: acc.initialBalance - oldBalance,
      oldBalance,
      newBalance: acc.initialBalance,
      comment: 'Account Reset to Initial Balance'
    });

    this.notifyChange();
    audioManager.playOk();
    eventBus.emit('account:reset', { accountId });
    return true;
  }

  deleteAccount(accountId) {
    if (this.accounts.length <= 1) {
      return { success: false, error: 'Cannot delete the only remaining account' };
    }
    const idx = this.accounts.findIndex(a => a.id === accountId);
    if (idx === -1) return { success: false, error: 'Account not found' };

    const deleted = this.accounts.splice(idx, 1)[0];
    if (this.activeAccountId === accountId) {
      this.activeAccountId = this.accounts[0].id;
    }

    this.notifyChange();
    eventBus.emit('account:deleted', deleted);
    return { success: true };
  }

  recordBalanceHistory(entry) {
    this.balanceHistory.unshift({
      id: 'bh_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      ...entry
    });
  }

  getBalanceHistory(accountId) {
    if (!accountId) return this.balanceHistory;
    return this.balanceHistory.filter(h => h.accountId === accountId);
  }

  notifyChange() {
    if (this.onStateChange) {
      this.onStateChange({
        accounts: this.accounts,
        activeAccountId: this.activeAccountId,
        balanceHistory: this.balanceHistory
      });
    }
  }
}
