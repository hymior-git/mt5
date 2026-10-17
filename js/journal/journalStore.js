/**
 * Trading Journal Store
 * Automatically journals closed trades and stores editable trade rationales, ICT tags, and chart screenshots.
 */
import { eventBus } from '../core/eventBus.js';

export class JournalStore {
  constructor(state, onStateChange) {
    this.entries = state.journalEntries || [];
    this.onStateChange = onStateChange;

    // Listen to closed trades to automatically generate journal entry
    eventBus.on('order:closed', (closedTrade) => this.autoJournalTrade(closedTrade));
  }

  autoJournalTrade(trade) {
    // Check if already journaled
    if (this.entries.find(e => e.ticket === trade.ticket)) return;

    // Estimate Risk/Reward Ratio if SL is present
    let rrRatio = 0;
    if (trade.sl) {
      const risk = Math.abs(trade.openPrice - trade.sl);
      if (risk > 0) {
        const reward = Math.abs((trade.closePrice || trade.openPrice) - trade.openPrice);
        rrRatio = parseFloat((reward / risk).toFixed(2));
      }
    }

    const session = this.determineSession(trade.closeTime);

    // Try capturing current chart screenshot if available
    let chartSnapshot = null;
    try {
      const chartCanvas = document.getElementById('chartCanvas');
      if (chartCanvas) {
        chartSnapshot = chartCanvas.toDataURL('image/jpeg', 0.65);
      }
    } catch (e) {
      // Ignore snapshot error
    }

    const entry = {
      id: 'jn_' + Date.now() + '_' + trade.ticket,
      ticket: trade.ticket,
      accountId: trade.accountId,
      symbol: trade.symbol,
      type: trade.type,
      volume: trade.volume,
      openPrice: trade.openPrice,
      closePrice: trade.closePrice,
      openTime: trade.openTime,
      closeTime: trade.closeTime,
      sl: trade.sl,
      tp: trade.tp,
      netProfit: trade.netProfit,
      riskRewardRatio: rrRatio,
      session,
      strategy: 'ICT / Price Action',
      entryReason: '',
      exitReason: trade.reason || 'Take Profit / Stop Loss / Manual',
      notes: '',
      ictTags: [],
      chartSnapshot
    };

    this.entries.unshift(entry);
    this.notifyChange();
    eventBus.emit('journal:entry_added', entry);
  }

  updateEntry(entryId, { strategy, entryReason, exitReason, notes, ictTags }) {
    const entry = this.entries.find(e => e.id === entryId);
    if (!entry) return false;

    // Update ONLY user notes and classification metadata
    if (strategy !== undefined) entry.strategy = strategy;
    if (entryReason !== undefined) entry.entryReason = entryReason;
    if (exitReason !== undefined) entry.exitReason = exitReason;
    if (notes !== undefined) entry.notes = notes;
    if (Array.isArray(ictTags)) entry.ictTags = ictTags;

    this.notifyChange();
    eventBus.emit('journal:entry_updated', entry);
    return true;
  }

  getEntries(filter = {}) {
    let result = [...this.entries];
    if (filter.accountId) {
      result = result.filter(e => e.accountId === filter.accountId);
    }
    if (filter.symbol && filter.symbol !== 'ALL') {
      result = result.filter(e => e.symbol === filter.symbol);
    }
    if (filter.ictTag && filter.ictTag !== 'ALL') {
      result = result.filter(e => e.ictTags && e.ictTags.includes(filter.ictTag));
    }
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      result = result.filter(e => 
        e.symbol.toLowerCase().includes(q) ||
        (e.strategy && e.strategy.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        (e.entryReason && e.entryReason.toLowerCase().includes(q))
      );
    }
    return result;
  }

  determineSession(isoString) {
    const d = new Date(isoString);
    const h = d.getUTCHours();
    if (h >= 0 && h < 8) return 'Asian';
    if (h >= 8 && h < 13) return 'London';
    if (h >= 13 && h < 21) return 'New York';
    return 'Asian';
  }

  notifyChange() {
    if (this.onStateChange) {
      this.onStateChange({ journalEntries: this.entries });
    }
  }
}
