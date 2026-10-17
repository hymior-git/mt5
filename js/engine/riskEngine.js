/**
 * Account & Risk Engine
 * Real-time calculation of Balance, Equity, Margin, Free Margin, Floating P/L, Margin Call & Stop Out.
 */
import { getSymbolSpec } from '../config/symbols.js';
import { eventBus } from '../core/eventBus.js';
import { audioManager } from '../core/audio.js';

export class RiskEngine {
  constructor(accountsManager) {
    this.accountsManager = accountsManager;
    this.peakEquity = {}; // { [accountId]: number }
    this.maxDrawdown = {}; // { [accountId]: { usd: number, percent: number } }
  }

  calculatePositionMargin(position, account) {
    const spec = getSymbolSpec(position.symbol);
    const leverage = account.leverage || 100;
    // MT5 Standard Forex/CFD Margin: (OpenPrice * Volume * ContractSize) / Leverage
    const margin = (position.openPrice * position.volume * spec.contractSize) / leverage;
    return parseFloat(margin.toFixed(2));
  }

  calculatePositionFloatingPL(position, currentQuote) {
    if (!currentQuote) return { profit: 0, netProfit: 0 };
    const spec = getSymbolSpec(position.symbol);

    let priceDiff = 0;
    if (position.type === 'BUY') {
      // Buy closes at Bid
      priceDiff = currentQuote.bid - position.openPrice;
    } else if (position.type === 'SELL') {
      // Sell closes at Ask
      priceDiff = position.openPrice - currentQuote.ask;
    }

    // Profit = PriceDiff * Volume * ContractSize
    const grossProfit = priceDiff * position.volume * spec.contractSize;
    const commission = position.commission || 0;
    const swap = position.swap || 0;
    const netProfit = grossProfit - commission - swap;

    return {
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      netProfit: parseFloat(netProfit.toFixed(2)),
      commission,
      swap
    };
  }

  calculateAccountMetrics(account, openPositions, quotes) {
    const accId = account.id;
    let usedMargin = 0;
    let totalFloatingPL = 0;
    let totalCommission = 0;
    let totalSwap = 0;

    const accPositions = openPositions.filter(p => p.accountId === accId);

    accPositions.forEach(pos => {
      const quote = quotes[pos.symbol];
      const pl = this.calculatePositionFloatingPL(pos, quote);
      totalFloatingPL += pl.netProfit;
      totalCommission += pos.commission || 0;
      totalSwap += pos.swap || 0;

      const posMargin = this.calculatePositionMargin(pos, account);
      pos.currentMargin = posMargin;
      pos.currentPL = pl.netProfit;
      pos.currentGrossPL = pl.grossProfit;
      usedMargin += posMargin;
    });

    const balance = account.balance;
    const equity = parseFloat((balance + totalFloatingPL).toFixed(2));
    const freeMargin = parseFloat((equity - usedMargin).toFixed(2));
    const marginLevel = usedMargin > 0 ? parseFloat(((equity / usedMargin) * 100).toFixed(2)) : 0;

    // Track Drawdown
    if (!this.peakEquity[accId] || equity > this.peakEquity[accId]) {
      this.peakEquity[accId] = equity;
    }
    const peak = this.peakEquity[accId];
    const ddUsd = peak > equity ? parseFloat((peak - equity).toFixed(2)) : 0;
    const ddPercent = peak > 0 ? parseFloat(((ddUsd / peak) * 100).toFixed(2)) : 0;

    if (!this.maxDrawdown[accId] || ddPercent > this.maxDrawdown[accId].percent) {
      this.maxDrawdown[accId] = { usd: ddUsd, percent: ddPercent };
    }

    return {
      balance,
      equity,
      usedMargin: parseFloat(usedMargin.toFixed(2)),
      freeMargin,
      marginLevel,
      floatingPL: parseFloat(totalFloatingPL.toFixed(2)),
      totalCommission: parseFloat(totalCommission.toFixed(2)),
      totalSwap: parseFloat(totalSwap.toFixed(2)),
      drawdownUsd: ddUsd,
      drawdownPercent: ddPercent,
      maxDrawdownUsd: this.maxDrawdown[accId] ? this.maxDrawdown[accId].usd : 0,
      maxDrawdownPercent: this.maxDrawdown[accId] ? this.maxDrawdown[accId].percent : 0,
      positionsCount: accPositions.length
    };
  }

  checkMarginAvailable(account, symbol, volume, openPrice, currentUsedMargin) {
    const spec = getSymbolSpec(symbol);
    const leverage = account.leverage || 100;
    const requiredMargin = (openPrice * volume * spec.contractSize) / leverage;
    const freeMargin = account.balance - currentUsedMargin; // conservative check

    if (freeMargin < requiredMargin) {
      return {
        allowed: false,
        requiredMargin: parseFloat(requiredMargin.toFixed(2)),
        freeMargin: parseFloat(freeMargin.toFixed(2)),
        reason: `Ký quỹ không đủ (Cần: $${requiredMargin.toFixed(2)}, Khả dụng: $${freeMargin.toFixed(2)})`
      };
    }

    return {
      allowed: true,
      requiredMargin: parseFloat(requiredMargin.toFixed(2))
    };
  }

  checkMarginHealth(metrics, onStopOut) {
    if (metrics.usedMargin <= 0) return;

    // Margin Call at <= 100%
    if (metrics.marginLevel <= 100 && metrics.marginLevel > 50) {
      eventBus.emit('risk:margin_call', {
        marginLevel: metrics.marginLevel,
        equity: metrics.equity,
        usedMargin: metrics.usedMargin
      });
    }

    // Stop Out at <= 50%
    if (metrics.marginLevel <= 50) {
      audioManager.playAlert();
      eventBus.emit('risk:stop_out', {
        marginLevel: metrics.marginLevel,
        equity: metrics.equity
      });
      if (typeof onStopOut === 'function') {
        onStopOut();
      }
    }
  }
}
