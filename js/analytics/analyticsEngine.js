/**
 * Trading Analytics Engine
 * Computes KPIs, Win Rate, Profit Factor, Expectancy, Drawdown, Streaks, and Session Breakdown.
 */
export class AnalyticsEngine {
  constructor() {}

  computeMetrics(closedTrades, filterOptions = {}) {
    let trades = [...closedTrades];

    // Filter by Account
    if (filterOptions.accountId) {
      trades = trades.filter(t => t.accountId === filterOptions.accountId);
    }
    // Filter by Symbol
    if (filterOptions.symbol && filterOptions.symbol !== 'ALL') {
      trades = trades.filter(t => t.symbol === filterOptions.symbol);
    }
    // Filter by Date Range
    if (filterOptions.startDate) {
      trades = trades.filter(t => new Date(t.closeTime) >= new Date(filterOptions.startDate));
    }
    if (filterOptions.endDate) {
      trades = trades.filter(t => new Date(t.closeTime) <= new Date(filterOptions.endDate));
    }
    // Filter by Session
    if (filterOptions.session && filterOptions.session !== 'ALL') {
      trades = trades.filter(t => this.determineSession(t.closeTime) === filterOptions.session);
    }

    const totalTrades = trades.length;
    if (totalTrades === 0) {
      return this.emptyMetrics();
    }

    // Sort chronologically
    trades.sort((a, b) => new Date(a.closeTime) - new Date(b.closeTime));

    let winningTrades = 0;
    let losingTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalHoldingTimeMs = 0;

    let currentWinStreak = 0;
    let maxWinStreak = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;

    // Equity curve points
    const equityCurve = [];
    let runningNetProfit = 0;
    let peakProfit = 0;
    let maxDrawdownUsd = 0;

    trades.forEach((t, idx) => {
      const p = t.netProfit || 0;
      runningNetProfit += p;

      if (runningNetProfit > peakProfit) {
        peakProfit = runningNetProfit;
      }
      const dd = peakProfit - runningNetProfit;
      if (dd > maxDrawdownUsd) {
        maxDrawdownUsd = dd;
      }

      equityCurve.push({
        tradeIndex: idx + 1,
        time: t.closeTime,
        ticket: t.ticket,
        profit: p,
        cumulativeProfit: parseFloat(runningNetProfit.toFixed(2))
      });

      if (p > 0) {
        winningTrades++;
        grossProfit += p;
        currentWinStreak++;
        currentLossStreak = 0;
        if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
      } else if (p < 0) {
        losingTrades++;
        grossLoss += Math.abs(p);
        currentLossStreak++;
        currentWinStreak = 0;
        if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
      }

      // Holding time
      if (t.openTime && t.closeTime) {
        const hold = new Date(t.closeTime) - new Date(t.openTime);
        if (hold > 0) totalHoldingTimeMs += hold;
      }
    });

    const netProfit = parseFloat((grossProfit - grossLoss).toFixed(2));
    const winRate = parseFloat(((winningTrades / totalTrades) * 100).toFixed(1));
    const avgWin = winningTrades > 0 ? parseFloat((grossProfit / winningTrades).toFixed(2)) : 0;
    const avgLoss = losingTrades > 0 ? parseFloat((grossLoss / losingTrades).toFixed(2)) : 0;
    const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : (grossProfit > 0 ? 99.99 : 0);
    const rrRatio = avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : 0;

    // Mathematical Expectancy = (WinRate% * AvgWin) - (LossRate% * AvgLoss)
    const winProb = winningTrades / totalTrades;
    const lossProb = losingTrades / totalTrades;
    const expectancy = parseFloat((winProb * avgWin - lossProb * avgLoss).toFixed(2));

    const avgHoldingMinutes = totalTrades > 0 ? Math.round(totalHoldingTimeMs / totalTrades / 60000) : 0;

    // Breakdown by Symbol
    const profitBySymbol = {};
    trades.forEach(t => {
      if (!profitBySymbol[t.symbol]) profitBySymbol[t.symbol] = { trades: 0, profit: 0, wins: 0 };
      profitBySymbol[t.symbol].trades++;
      profitBySymbol[t.symbol].profit = parseFloat((profitBySymbol[t.symbol].profit + t.netProfit).toFixed(2));
      if (t.netProfit > 0) profitBySymbol[t.symbol].wins++;
    });

    // Breakdown by Trading Session
    const profitBySession = { Asian: 0, London: 0, 'New York': 0 };
    trades.forEach(t => {
      const sess = this.determineSession(t.closeTime);
      profitBySession[sess] = parseFloat((profitBySession[sess] + t.netProfit).toFixed(2));
    });

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      grossLoss: parseFloat(grossLoss.toFixed(2)),
      netProfit,
      avgWin,
      avgLoss,
      profitFactor,
      riskRewardRatio: rrRatio,
      expectancy,
      maxDrawdownUsd: parseFloat(maxDrawdownUsd.toFixed(2)),
      consecutiveWins: maxWinStreak,
      consecutiveLosses: maxLossStreak,
      avgHoldingMinutes,
      equityCurve,
      profitBySymbol,
      profitBySession
    };
  }

  determineSession(isoString) {
    const d = new Date(isoString);
    const utcHours = d.getUTCHours();
    // Asian: 00:00 - 08:00 UTC
    if (utcHours >= 0 && utcHours < 8) return 'Asian';
    // London: 08:00 - 13:00 UTC
    if (utcHours >= 8 && utcHours < 13) return 'London';
    // New York: 13:00 - 21:00 UTC
    if (utcHours >= 13 && utcHours < 21) return 'New York';
    return 'Asian';
  }

  emptyMetrics() {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      grossProfit: 0,
      grossLoss: 0,
      netProfit: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      riskRewardRatio: 0,
      expectancy: 0,
      maxDrawdownUsd: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      avgHoldingMinutes: 0,
      equityCurve: [],
      profitBySymbol: {},
      profitBySession: { Asian: 0, London: 0, 'New York': 0 }
    };
  }
}

export const analyticsEngine = new AnalyticsEngine();
