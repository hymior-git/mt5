/**
 * Market Data & Price Feed Engine
 * Maintains real-time Bid/Ask quotes, spreads, and multi-timeframe OHLC candles.
 */
import { SYMBOL_DEFINITIONS } from '../config/symbols.js';
import { eventBus } from '../core/eventBus.js';

export class MarketFeedEngine {
  constructor() {
    this.quotes = {};
    this.candles = {}; // { [symbol]: { M1: [], M5: [], M15: [], H1: [], D1: [] } }
    this.isLiveRunning = true;
    this.timer = null;
    this.initSymbols();
  }

  initSymbols() {
    Object.values(SYMBOL_DEFINITIONS).forEach(spec => {
      const spread = spec.spreadPoints * spec.tickSize;
      const bid = spec.basePrice;
      const ask = parseFloat((bid + spread).toFixed(spec.digits));

      this.quotes[spec.symbol] = {
        symbol: spec.symbol,
        bid,
        ask,
        spreadPoints: spec.spreadPoints,
        high: parseFloat((bid + spread * 10).toFixed(spec.digits)),
        low: parseFloat((bid - spread * 10).toFixed(spec.digits)),
        digits: spec.digits,
        time: Date.now()
      };

      this.candles[spec.symbol] = {
        M1: this.generateHistoricalCandles(spec, 60, 250),
        M5: this.generateHistoricalCandles(spec, 300, 200),
        M15: this.generateHistoricalCandles(spec, 900, 150),
        M30: this.generateHistoricalCandles(spec, 1800, 150),
        H1: this.generateHistoricalCandles(spec, 3600, 120),
        H4: this.generateHistoricalCandles(spec, 14400, 100),
        D1: this.generateHistoricalCandles(spec, 86400, 90)
      };
    });
  }

  generateHistoricalCandles(spec, periodSec, count) {
    const candles = [];
    const now = Math.floor(Date.now() / 1000);
    const spread = spec.spreadPoints * spec.tickSize;
    let currentClose = spec.basePrice;

    for (let i = count; i >= 0; i--) {
      const time = (now - (i * periodSec)) * 1000;
      const change = (Math.random() - 0.495) * spec.volatility * Math.sqrt(periodSec / 60) * 15;
      const open = currentClose;
      const close = parseFloat((open + change).toFixed(spec.digits));
      const high = parseFloat((Math.max(open, close) + Math.random() * spec.volatility * 10).toFixed(spec.digits));
      const low = parseFloat((Math.min(open, close) - Math.random() * spec.volatility * 10).toFixed(spec.digits));
      const volume = Math.floor(50 + Math.random() * 400);

      candles.push({ time, open, high, low, close, volume });
      currentClose = close;
    }
    return candles;
  }

  startLiveFeed(intervalMs = 400) {
    if (this.timer) clearInterval(this.timer);
    this.isLiveRunning = true;

    this.timer = setInterval(() => {
      if (!this.isLiveRunning) return;
      this.generateLiveTick();
    }, intervalMs);
  }

  stopLiveFeed() {
    this.isLiveRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  generateLiveTick(targetSymbol = null) {
    const symbolKeys = targetSymbol ? [targetSymbol] : Object.keys(SYMBOL_DEFINITIONS);
    // Pick 1-2 random symbols to tick if not specified
    const symbolsToUpdate = targetSymbol 
      ? symbolKeys 
      : symbolKeys.sort(() => 0.5 - Math.random()).slice(0, 3);

    symbolsToUpdate.forEach(sym => {
      const spec = SYMBOL_DEFINITIONS[sym];
      const quote = this.quotes[sym];
      const delta = (Math.random() - 0.498) * spec.volatility * 2;
      let newBid = parseFloat((quote.bid + delta).toFixed(spec.digits));
      const spread = spec.spreadPoints * spec.tickSize;
      let newAsk = parseFloat((newBid + spread).toFixed(spec.digits));

      quote.bid = newBid;
      quote.ask = newAsk;
      quote.high = Math.max(quote.high, newBid);
      quote.low = Math.min(quote.low, newBid);
      quote.time = Date.now();

      // Update current M1 candle
      const m1Candles = this.candles[sym].M1;
      const lastCandle = m1Candles[m1Candles.length - 1];
      const now = Date.now();
      const currentMinute = Math.floor(now / 60000) * 60000;

      if (!lastCandle || currentMinute > lastCandle.time) {
        m1Candles.push({
          time: currentMinute,
          open: newBid,
          high: newBid,
          low: newBid,
          close: newBid,
          volume: 1
        });
        if (m1Candles.length > 500) m1Candles.shift();
      } else {
        lastCandle.high = Math.max(lastCandle.high, newBid);
        lastCandle.low = Math.min(lastCandle.low, newBid);
        lastCandle.close = newBid;
        lastCandle.volume += 1;
      }

      eventBus.emit('market:tick', {
        symbol: sym,
        bid: newBid,
        ask: newAsk,
        spreadPoints: spec.spreadPoints,
        digits: spec.digits,
        time: quote.time
      });
    });
  }

  getQuote(symbol) {
    return this.quotes[symbol] || null;
  }

  getCandles(symbol, timeframe = 'M1') {
    if (!this.candles[symbol]) return [];
    return this.candles[symbol][timeframe] || this.candles[symbol].M1;
  }
}

export const marketFeed = new MarketFeedEngine();
