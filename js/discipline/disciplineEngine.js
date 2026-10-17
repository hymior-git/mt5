/**
 * Trading Discipline System
 * Real-time risk rule enforcement, violation detection, and Discipline Score calculation.
 */
import { getSymbolSpec } from '../config/symbols.js';
import { audioManager } from '../core/audio.js';
import { eventBus } from '../core/eventBus.js';

export class DisciplineEngine {
  constructor(state, onStateChange) {
    this.rules = state.disciplineRules || {
      maxRiskPerTradePercent: 2.0, // 2%
      maxDailyLossPercent: 5.0, // 5%
      maxTradesPerDay: 8,
      maxConsecutiveLosses: 3,
      minRiskRewardRatio: 1.5,
      mandatoryStopLoss: true,
      allowedSessions: ['Asian', 'London', 'New York']
    };
    this.violations = state.disciplineViolations || [];
    this.onStateChange = onStateChange;
  }

  updateRules(newRules) {
    this.rules = { ...this.rules, ...newRules };
    this.notifyChange();
    eventBus.emit('discipline:rules_updated', this.rules);
    return this.rules;
  }

  /**
   * Pre-trade validation check
   * Returns { passed: boolean, warnings: string[], violations: object[] }
   */
  validateOrder({ account, symbol, type, volume, price, sl, tp, todaysTradesCount = 0, todaysRealizedLoss = 0 }) {
    const warnings = [];
    const detectedViolations = [];
    const spec = getSymbolSpec(symbol);
    const balance = account.balance || 1000;

    // 1. Mandatory Stop Loss Check
    if (this.rules.mandatoryStopLoss && (!sl || parseFloat(sl) <= 0)) {
      const msg = 'Quy tắc bắt buộc: Lệnh phải có Cắt lỗ (Stop Loss)';
      warnings.push(msg);
      detectedViolations.push({
        rule: 'MANDATORY_STOP_LOSS',
        severity: 'CRITICAL',
        message: msg
      });
    }

    // 2. Maximum Risk Per Trade Check
    if (sl && parseFloat(sl) > 0) {
      const slPrice = parseFloat(sl);
      const riskPerUnit = Math.abs(price - slPrice);
      const totalRiskUsd = riskPerUnit * volume * spec.contractSize;
      const riskPercent = (totalRiskUsd / balance) * 100;

      if (riskPercent > this.rules.maxRiskPerTradePercent) {
        const msg = `Rủi ro lệnh (${riskPercent.toFixed(1)}% vốn = $${totalRiskUsd.toFixed(2)}) vượt mức quy tắc (${this.rules.maxRiskPerTradePercent}%)`;
        warnings.push(msg);
        detectedViolations.push({
          rule: 'MAX_RISK_PER_TRADE',
          severity: 'HIGH',
          message: msg,
          actualValue: riskPercent,
          limitValue: this.rules.maxRiskPerTradePercent
        });
      }

      // 3. Minimum Risk/Reward Ratio Check
      if (tp && parseFloat(tp) > 0) {
        const tpPrice = parseFloat(tp);
        const rewardPerUnit = Math.abs(tpPrice - price);
        const rr = riskPerUnit > 0 ? (rewardPerUnit / riskPerUnit) : 0;
        if (rr < this.rules.minRiskRewardRatio) {
          const msg = `Tỷ lệ R:R dự kiến (${rr.toFixed(2)}) thấp hơn mức tối thiểu quy định (${this.rules.minRiskRewardRatio}:1)`;
          warnings.push(msg);
          detectedViolations.push({
            rule: 'MIN_RR_RATIO',
            severity: 'MEDIUM',
            message: msg,
            actualValue: rr,
            limitValue: this.rules.minRiskRewardRatio
          });
        }
      }
    }

    // 4. Overtrading Check (Max Trades per Day)
    if (todaysTradesCount >= this.rules.maxTradesPerDay) {
      const msg = `Cảnh báo Overtrading: Đã đạt số lệnh tối đa trong ngày (${todaysTradesCount}/${this.rules.maxTradesPerDay})`;
      warnings.push(msg);
      detectedViolations.push({
        rule: 'MAX_TRADES_PER_DAY',
        severity: 'HIGH',
        message: msg
      });
    }

    // 5. Daily Max Loss Check
    const dailyLossPercent = (Math.abs(todaysRealizedLoss) / balance) * 100;
    if (todaysRealizedLoss < 0 && dailyLossPercent >= this.rules.maxDailyLossPercent) {
      const msg = `Cảnh báo Max Daily Loss: Mức lỗ hôm nay (${dailyLossPercent.toFixed(1)}%) đã chạm trần ${this.rules.maxDailyLossPercent}%`;
      warnings.push(msg);
      detectedViolations.push({
        rule: 'MAX_DAILY_LOSS',
        severity: 'CRITICAL',
        message: msg
      });
    }

    // Record violations if any
    if (detectedViolations.length > 0) {
      detectedViolations.forEach(v => {
        this.recordViolation({
          accountId: account.id,
          symbol,
          time: new Date().toISOString(),
          ...v
        });
      });
      audioManager.playError();
      eventBus.emit('discipline:violation_detected', { warnings, violations: detectedViolations });
    }

    return {
      passed: detectedViolations.length === 0,
      warnings,
      violations: detectedViolations
    };
  }

  recordViolation(entry) {
    this.violations.unshift({
      id: 'viol_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      ...entry
    });
    if (this.violations.length > 200) this.violations.pop();
    this.notifyChange();
  }

  computeDisciplineScore(totalClosedTradesCount = 0) {
    // Base score is 100
    let score = 100;
    const recentViolations = this.violations.slice(0, 30);

    recentViolations.forEach(v => {
      if (v.severity === 'CRITICAL') score -= 15;
      else if (v.severity === 'HIGH') score -= 10;
      else score -= 5;
    });

    // Score cannot drop below 0
    score = Math.max(0, Math.min(100, Math.round(score)));

    const complianceRate = totalClosedTradesCount > 0 
      ? Math.max(0, Math.round(((totalClosedTradesCount - this.violations.length) / totalClosedTradesCount) * 100))
      : score;

    return {
      score,
      totalViolations: this.violations.length,
      recentViolations: this.violations.slice(0, 10),
      complianceRate
    };
  }

  notifyChange() {
    if (this.onStateChange) {
      this.onStateChange({
        disciplineRules: this.rules,
        disciplineViolations: this.violations
      });
    }
  }
}
