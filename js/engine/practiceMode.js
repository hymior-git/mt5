/**
 * Market Practice Mode (Forward-Only Replay Simulator)
 * Strictly enforces forward time progression. No backward playback, no rewind, no peek ahead.
 */
import { eventBus } from '../core/eventBus.js';
import { getSymbolSpec } from '../config/symbols.js';

export class PracticeModeEngine {
  constructor(marketFeed) {
    this.marketFeed = marketFeed;
    this.isActive = false;
    this.isPlaying = false;
    this.speed = 1; // 1x, 2x, 5x, 10x, 20x, 50x
    this.currentTimeframe = 'M5';
    this.currentSymbol = 'EURUSD';

    this.timer = null;
    this.currentIndex = 0;
    this.historicalDataset = []; // Full recorded timeline
    this.visibleCandles = [];    // Strictly what has been revealed so far
  }

  startSession(symbol = 'EURUSD', timeframe = 'M5', startIndex = 50) {
    this.currentSymbol = symbol;
    this.currentTimeframe = timeframe;
    this.isActive = true;
    this.isPlaying = false;
    if (this.timer) clearInterval(this.timer);

    // Stop live random ticks while in practice mode
    this.marketFeed.stopLiveFeed();

    // Prepare forward timeline
    const fullCandles = this.marketFeed.getCandles(symbol, timeframe);
    this.historicalDataset = [...fullCandles];

    // Ensure we start with at least 30 candles visible, and the rest will be revealed forward
    const startPos = Math.max(20, Math.min(startIndex, this.historicalDataset.length - 20));
    this.currentIndex = startPos;
    this.visibleCandles = this.historicalDataset.slice(0, startPos);

    this.emitCurrentState();
    eventBus.emit('practice:started', {
      symbol,
      timeframe,
      speed: this.speed,
      visibleCandlesCount: this.visibleCandles.length
    });
  }

  play() {
    if (!this.isActive) return;
    this.isPlaying = true;
    if (this.timer) clearInterval(this.timer);

    const baseDelay = 1000; // 1000ms per step at 1x
    const interval = Math.max(50, Math.floor(baseDelay / this.speed));

    this.timer = setInterval(() => {
      if (!this.isPlaying) return;
      this.stepForward();
    }, interval);

    eventBus.emit('practice:playback_change', { isPlaying: true, speed: this.speed });
  }

  pause() {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    eventBus.emit('practice:playback_change', { isPlaying: false, speed: this.speed });
  }

  setSpeed(multiplier) {
    const validSpeeds = [1, 2, 5, 10, 20, 50];
    if (validSpeeds.includes(multiplier)) {
      this.speed = multiplier;
      if (this.isPlaying) {
        this.play(); // Restart timer with new interval
      }
    }
  }

  /**
   * Advance exactly one step FORWARD.
   * STRICT NOTE: There is intentionally NO stepBackward() or rewind() method.
   */
  stepForward() {
    if (this.currentIndex >= this.historicalDataset.length) {
      // Generate next synthetic candle forward in time
      const last = this.historicalDataset[this.historicalDataset.length - 1];
      const spec = getSymbolSpec(this.currentSymbol);
      const delta = (Math.random() - 0.495) * spec.volatility * 10;
      const open = last.close;
      const close = parseFloat((open + delta).toFixed(spec.digits));
      const high = parseFloat((Math.max(open, close) + Math.random() * spec.volatility * 5).toFixed(spec.digits));
      const low = parseFloat((Math.min(open, close) - Math.random() * spec.volatility * 5).toFixed(spec.digits));
      const periodSec = this.getPeriodSeconds(this.currentTimeframe);

      const nextCandle = {
        time: last.time + periodSec * 1000,
        open, high, low, close,
        volume: Math.floor(80 + Math.random() * 300)
      };

      this.historicalDataset.push(nextCandle);
    }

    const nextCandle = this.historicalDataset[this.currentIndex];
    this.visibleCandles.push(nextCandle);
    this.currentIndex += 1;

    // Simulate multi-tick movement inside the candle
    this.emitCandleAsTicks(nextCandle);
  }

  emitCandleAsTicks(candle) {
    const spec = getSymbolSpec(this.currentSymbol);
    const spread = spec.spreadPoints * spec.tickSize;
    const bid = candle.close;
    const ask = parseFloat((bid + spread).toFixed(spec.digits));

    // Update global quotes
    if (!window.__currentQuotes) window.__currentQuotes = {};
    window.__currentQuotes[this.currentSymbol] = {
      symbol: this.currentSymbol,
      bid,
      ask,
      spreadPoints: spec.spreadPoints,
      high: candle.high,
      low: candle.low,
      digits: spec.digits,
      time: candle.time
    };

    eventBus.emit('market:tick', {
      symbol: this.currentSymbol,
      bid,
      ask,
      spreadPoints: spec.spreadPoints,
      digits: spec.digits,
      time: candle.time,
      isPractice: true
    });

    eventBus.emit('practice:candle_revealed', {
      symbol: this.currentSymbol,
      candle,
      visibleCandles: this.visibleCandles
    });
  }

  getVisibleCandles() {
    return this.visibleCandles;
  }

  exitPracticeMode() {
    this.pause();
    this.isActive = false;
    this.marketFeed.startLiveFeed();
    eventBus.emit('practice:stopped');
  }

  getPeriodSeconds(tf) {
    const map = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 };
    return map[tf] || 300;
  }

  emitCurrentState() {
    if (this.visibleCandles.length > 0) {
      const last = this.visibleCandles[this.visibleCandles.length - 1];
      this.emitCandleAsTicks(last);
    }
  }
}
