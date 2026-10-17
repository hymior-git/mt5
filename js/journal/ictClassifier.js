/**
 * ICT (Inner Circle Trader) Strategy Classifier & Analytics
 * Provides standardized ICT concepts, tagging taxonomy, and strategy performance aggregation.
 */

export const ICT_CONCEPTS = [
  { id: 'FVG', name: 'Fair Value Gap (FVG)', category: 'Imbalance' },
  { id: 'OB', name: 'Order Block (OB)', category: 'Institutional' },
  { id: 'LIQ_SWEEP', name: 'Liquidity Sweep', category: 'Liquidity' },
  { id: 'MSS', name: 'Market Structure Shift (MSS)', category: 'Structure' },
  { id: 'BOS', name: 'Break of Structure (BOS)', category: 'Structure' },
  { id: 'CHOCH', name: 'Change of Character (CHoCH)', category: 'Structure' },
  { id: 'BSL', name: 'Buy-Side Liquidity (BSL)', category: 'Liquidity' },
  { id: 'SSL', name: 'Sell-Side Liquidity (SSL)', category: 'Liquidity' },
  { id: 'PREM_DISC', name: 'Premium / Discount Zone', category: 'Pricing' },
  { id: 'OTE', name: 'Optimal Trade Entry (OTE 62-79%)', category: 'Fibonacci' },
  { id: 'KZ_LONDON', name: 'London Open Kill Zone (02:00-05:00 EST)', category: 'Kill Zone' },
  { id: 'KZ_NY_OPEN', name: 'New York Open Kill Zone (07:00-10:00 EST)', category: 'Kill Zone' },
  { id: 'KZ_NY_CLOSE', name: 'London Close / NY PM (10:00-12:00 EST)', category: 'Kill Zone' },
  { id: 'KZ_ASIAN', name: 'Asian Kill Zone (20:00-00:00 EST)', category: 'Kill Zone' }
];

export class ICTClassifier {
  static getConcepts() {
    return ICT_CONCEPTS;
  }

  static computeICTPerformance(journalEntries) {
    const stats = {};
    ICT_CONCEPTS.forEach(c => {
      stats[c.id] = { id: c.id, name: c.name, trades: 0, wins: 0, profit: 0, grossProfit: 0, grossLoss: 0 };
    });

    journalEntries.forEach(entry => {
      const tags = entry.ictTags || [];
      const p = entry.netProfit || 0;

      tags.forEach(tagId => {
        if (!stats[tagId]) {
          stats[tagId] = { id: tagId, name: tagId, trades: 0, wins: 0, profit: 0, grossProfit: 0, grossLoss: 0 };
        }
        const s = stats[tagId];
        s.trades++;
        s.profit = parseFloat((s.profit + p).toFixed(2));
        if (p > 0) {
          s.wins++;
          s.grossProfit = parseFloat((s.grossProfit + p).toFixed(2));
        } else if (p < 0) {
          s.grossLoss = parseFloat((s.grossLoss + Math.abs(p)).toFixed(2));
        }
      });
    });

    // Compute Win Rate & Profit Factor per ICT setup
    return Object.values(stats)
      .filter(s => s.trades > 0)
      .map(s => {
        const winRate = parseFloat(((s.wins / s.trades) * 100).toFixed(1));
        const profitFactor = s.grossLoss > 0 ? parseFloat((s.grossProfit / s.grossLoss).toFixed(2)) : (s.grossProfit > 0 ? 99.99 : 0);
        return {
          ...s,
          winRate,
          profitFactor
        };
      })
      .sort((a, b) => b.trades - a.trades);
  }
}
