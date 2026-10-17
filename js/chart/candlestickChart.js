/**
 * MT5 Candlestick Chart Engine (Pure HTML5 Canvas)
 * High-performance, interactive chart supporting zoom, pan, crosshair, Bid/Ask lines,
 * and open position markers with drag-to-modify SL/TP lines.
 */
import { getSymbolSpec } from '../config/symbols.js';
import { eventBus } from '../core/eventBus.js';

export class CandlestickChart {
  constructor(canvasId, containerId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.symbol = 'EURUSD';
    this.timeframe = 'M5';
    this.candles = [];
    this.openPositions = [];

    // View state
    this.barWidth = 8;
    this.barSpacing = 3;
    this.offsetRight = 20; // Number of bars from the right edge
    this.chartType = 'candlestick'; // 'candlestick', 'bar', 'line'

    // Interaction state
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartOffset = 0;
    this.crosshairPos = null;

    // Line drag state (for dragging SL/TP)
    this.activeDragLine = null; // { position, type: 'SL'|'TP' }

    this.initEvents();
    this.resize();
  }

  setData(candles, symbol, timeframe, openPositions = []) {
    this.candles = candles || [];
    this.symbol = symbol || this.symbol;
    this.timeframe = timeframe || this.timeframe;
    this.openPositions = openPositions;
    this.render();
  }

  resize() {
    if (!this.canvas || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    this.width = this.canvas.width = rect.width;
    this.height = this.canvas.height = rect.height;
    this.render();
  }

  initEvents() {
    window.addEventListener('resize', () => this.resize());

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('mouseleave', () => {
      if (!this.isDragging && !this.activeDragLine) {
        this.crosshairPos = null;
        this.render();
      }
    });
  }

  onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if clicking near an SL/TP line
    const hitLine = this.findHitLine(mouseY);
    if (hitLine) {
      this.activeDragLine = hitLine;
      return;
    }

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartOffset = this.offsetRight;
  }

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (this.activeDragLine) {
      // Dragging SL/TP line
      const price = this.priceFromY(mouseY);
      const spec = getSymbolSpec(this.symbol);
      const roundedPrice = parseFloat(price.toFixed(spec.digits));

      if (this.activeDragLine.type === 'SL') {
        this.activeDragLine.position.sl = roundedPrice;
      } else {
        this.activeDragLine.position.tp = roundedPrice;
      }
      this.render();
      return;
    }

    if (this.isDragging) {
      const deltaX = e.clientX - this.dragStartX;
      const barsMoved = Math.round(deltaX / (this.barWidth + this.barSpacing));
      this.offsetRight = Math.max(0, this.dragStartOffset - barsMoved);
      this.render();
      return;
    }

    // Update crosshair
    if (mouseX >= 0 && mouseX <= this.width && mouseY >= 0 && mouseY <= this.height) {
      this.crosshairPos = { x: mouseX, y: mouseY };
      this.render();
    }
  }

  onMouseUp() {
    if (this.activeDragLine) {
      // Emit position modified event
      eventBus.emit('chart:line_drag_complete', {
        ticket: this.activeDragLine.position.ticket,
        sl: this.activeDragLine.position.sl,
        tp: this.activeDragLine.position.tp
      });
      this.activeDragLine = null;
    }
    this.isDragging = false;
  }

  onWheel(e) {
    e.preventDefault();
    const zoomIn = e.deltaY < 0;
    if (zoomIn) {
      this.barWidth = Math.min(30, this.barWidth + 1.5);
    } else {
      this.barWidth = Math.max(2.5, this.barWidth - 1.5);
    }
    this.render();
  }

  render() {
    if (!this.ctx || !this.width || !this.height) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // 1. Dark MT5 background
    ctx.fillStyle = '#161920';
    ctx.fillRect(0, 0, w, h);

    if (this.candles.length === 0) {
      ctx.fillStyle = '#656d81';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Đang tải dữ liệu biểu đồ...', w / 2, h / 2);
      return;
    }

    const priceScaleWidth = 72;
    const timeScaleHeight = 26;
    const plotW = w - priceScaleWidth;
    const plotH = h - timeScaleHeight;

    // Calculate visible candles range
    const step = this.barWidth + this.barSpacing;
    const visibleCount = Math.ceil(plotW / step) + 2;
    const endIndex = Math.max(0, this.candles.length - 1 - this.offsetRight);
    const startIndex = Math.max(0, endIndex - visibleCount);
    const visibleCandles = this.candles.slice(startIndex, endIndex + 1);

    if (visibleCandles.length === 0) return;

    // Min & Max prices
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    visibleCandles.forEach(c => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    });

    // Also include open positions in scale if close
    this.openPositions.forEach(p => {
      if (p.symbol === this.symbol) {
        if (p.openPrice < minPrice) minPrice = p.openPrice;
        if (p.openPrice > maxPrice) maxPrice = p.openPrice;
        if (p.sl && p.sl < minPrice) minPrice = p.sl;
        if (p.tp && p.tp > maxPrice) maxPrice = p.tp;
      }
    });

    const pricePadding = (maxPrice - minPrice) * 0.1 || 0.001;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = maxPrice - minPrice;

    this.minPrice = minPrice;
    this.maxPrice = maxPrice;
    this.plotH = plotH;
    this.plotW = plotW;

    const yFromPrice = (p) => plotH - ((p - minPrice) / priceRange) * plotH;
    this.yFromPrice = yFromPrice;
    this.priceFromY = (y) => minPrice + ((plotH - y) / plotH) * priceRange;

    // 2. Draw Grid
    ctx.strokeStyle = '#202430';
    ctx.lineWidth = 1;

    // Horizontal price grid lines
    const gridRows = 8;
    for (let i = 0; i <= gridRows; i++) {
      const y = (plotH / gridRows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();

      const priceVal = this.priceFromY(y);
      const spec = getSymbolSpec(this.symbol);
      ctx.fillStyle = '#7a8599';
      ctx.font = '10px Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(priceVal.toFixed(spec.digits), plotW + 8, y + 3.5);
    }

    // 3. Draw Candlesticks
    visibleCandles.forEach((c, i) => {
      const idxFromEnd = visibleCandles.length - 1 - i;
      const x = plotW - (idxFromEnd * step) - (this.barWidth / 2) - 15;
      if (x < -this.barWidth || x > plotW + this.barWidth) return;

      const isBullish = c.close >= c.open;
      const candleColor = isBullish ? '#00c853' : '#ff3d00';
      const wickColor = isBullish ? '#00e676' : '#ff5252';

      const openY = yFromPrice(c.open);
      const closeY = yFromPrice(c.close);
      const highY = yFromPrice(c.high);
      const lowY = yFromPrice(c.low);

      // Wick
      ctx.strokeStyle = wickColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1.5, Math.abs(openY - closeY));
      ctx.fillStyle = candleColor;
      ctx.fillRect(x - this.barWidth / 2, bodyTop, this.barWidth, bodyHeight);
    });

    // 4. Draw Live Bid / Ask Lines
    const quote = window.__currentQuotes ? window.__currentQuotes[this.symbol] : null;
    if (quote) {
      const bidY = yFromPrice(quote.bid);
      const askY = yFromPrice(quote.ask);

      // Bid Line (Gray/Blue)
      ctx.strokeStyle = '#4a90e2';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, bidY);
      ctx.lineTo(plotW, bidY);
      ctx.stroke();

      // Ask Line (Red)
      ctx.strokeStyle = '#ff3d00';
      ctx.beginPath();
      ctx.moveTo(0, askY);
      ctx.lineTo(plotW, askY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price Tag on Right scale
      const spec = getSymbolSpec(this.symbol);
      ctx.fillStyle = '#4a90e2';
      ctx.fillRect(plotW, bidY - 8, priceScaleWidth, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Consolas, monospace';
      ctx.fillText(quote.bid.toFixed(spec.digits), plotW + 5, bidY + 4);

      ctx.fillStyle = '#ff3d00';
      ctx.fillRect(plotW, askY - 8, priceScaleWidth, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(quote.ask.toFixed(spec.digits), plotW + 5, askY + 4);
    }

    // 5. Draw Open Positions & SL/TP lines
    this.openPositions.forEach(pos => {
      if (pos.symbol !== this.symbol) return;

      const openY = yFromPrice(pos.openPrice);
      const isBuy = pos.type === 'BUY';
      const lineColor = isBuy ? '#00e676' : '#ff5252';

      // Entry line
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, openY);
      ctx.lineTo(plotW, openY);
      ctx.stroke();

      // Entry badge
      ctx.fillStyle = isBuy ? '#008535' : '#b71c1c';
      ctx.fillRect(5, openY - 9, 130, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${pos.type} ${pos.volume.toFixed(2)} #${pos.ticket}`, 10, openY + 3.5);

      // Stop Loss Line
      if (pos.sl) {
        const slY = yFromPrice(pos.sl);
        ctx.strokeStyle = '#ff3d00';
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(0, slY);
        ctx.lineTo(plotW, slY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#d32f2f';
        ctx.fillRect(5, slY - 8, 85, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`SL: ${pos.sl}`, 10, slY + 3.5);
      }

      // Take Profit Line
      if (pos.tp) {
        const tpY = yFromPrice(pos.tp);
        ctx.strokeStyle = '#00c853';
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(0, tpY);
        ctx.lineTo(plotW, tpY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#2e7d32';
        ctx.fillRect(5, tpY - 8, 85, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`TP: ${pos.tp}`, 10, tpY + 3.5);
      }
    });

    // 6. Draw Crosshair & OHLC Header
    if (this.crosshairPos) {
      const cx = this.crosshairPos.x;
      const cy = this.crosshairPos.y;

      if (cx <= plotW && cy <= plotH) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);

        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, plotH);
        ctx.moveTo(0, cy);
        ctx.lineTo(plotW, cy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price badge at crosshair Y
        const chPrice = this.priceFromY(cy);
        const spec = getSymbolSpec(this.symbol);
        ctx.fillStyle = '#2a2e3d';
        ctx.fillRect(plotW, cy - 8, priceScaleWidth, 16);
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Consolas, monospace';
        ctx.fillText(chPrice.toFixed(spec.digits), plotW + 5, cy + 3.5);
      }
    }

    // Top Header info (Symbol, Timeframe, Last OHLC)
    const last = visibleCandles[visibleCandles.length - 1];
    if (last) {
      const spec = getSymbolSpec(this.symbol);
      ctx.fillStyle = '#a0aab8';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${this.symbol}, ${this.timeframe}  |  O: ${last.open.toFixed(spec.digits)}  H: ${last.high.toFixed(spec.digits)}  L: ${last.low.toFixed(spec.digits)}  C: ${last.close.toFixed(spec.digits)}  V: ${last.volume}`,
        15, 18
      );
    }
  }

  findHitLine(mouseY) {
    for (const pos of this.openPositions) {
      if (pos.symbol !== this.symbol) continue;
      if (pos.sl) {
        const slY = this.yFromPrice(pos.sl);
        if (Math.abs(mouseY - slY) < 6) {
          return { position: pos, type: 'SL' };
        }
      }
      if (pos.tp) {
        const tpY = this.yFromPrice(pos.tp);
        if (Math.abs(mouseY - tpY) < 6) {
          return { position: pos, type: 'TP' };
        }
      }
    }
    return null;
  }
}
