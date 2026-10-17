/**
 * MT5 Trading Execution Engine
 * Handles 10 order types, pending order matching, SL/TP execution, partial close, trailing stops.
 */
import { getSymbolSpec } from '../config/symbols.js';
import { audioManager } from '../core/audio.js';
import { eventBus } from '../core/eventBus.js';

export class ExecutionEngine {
  constructor(state, accountsManager, riskEngine, onStateChange) {
    this.openPositions = state.openPositions || [];
    this.pendingOrders = state.pendingOrders || [];
    this.closedTrades = state.closedTrades || [];
    this.systemLogs = state.systemLogs || [];
    this.accountsManager = accountsManager;
    this.riskEngine = riskEngine;
    this.onStateChange = onStateChange;

    this.ticketCounter = state.ticketCounter || 1000100;

    // Listen to market ticks to evaluate SL/TP and pending orders
    eventBus.on('market:tick', (quote) => this.onMarketTick(quote));
  }

  nextTicket() {
    this.ticketCounter += 1;
    return this.ticketCounter;
  }

  log(message, type = 'INFO') {
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      time: new Date().toISOString(),
      type,
      message
    };
    this.systemLogs.unshift(entry);
    if (this.systemLogs.length > 500) this.systemLogs.pop();
    eventBus.emit('system:log', entry);
    this.notifyChange();
  }

  /**
   * Open Market Order (Buy Market or Sell Market)
   */
  openMarketOrder({ accountId, symbol, type, volume, sl = null, tp = null, deviation = 10, comment = '' }) {
    const account = this.accountsManager.getAllAccounts().find(a => a.id === accountId) || this.accountsManager.getActiveAccount();
    if (!account) return { success: false, error: 'Tài khoản không hợp lệ' };

    const spec = getSymbolSpec(symbol);
    const vol = parseFloat(volume);

    if (isNaN(vol) || vol < spec.minLot || vol > spec.maxLot) {
      audioManager.playError();
      return { success: false, error: `Khối lượng không hợp lệ (${spec.minLot} - ${spec.maxLot})` };
    }

    // Get current live quote
    const quote = window.__currentQuotes ? window.__currentQuotes[symbol] : null;
    if (!quote) {
      audioManager.playError();
      return { success: false, error: 'Không có dữ liệu giá thị trường cho ' + symbol };
    }

    // Buy opens at Ask; Sell opens at Bid
    const executionPrice = type === 'BUY' ? quote.ask : quote.bid;

    // Check margin
    const currentUsedMargin = this.calculateAccountUsedMargin(account.id);
    const marginCheck = this.riskEngine.checkMarginAvailable(account, symbol, vol, executionPrice, currentUsedMargin);
    if (!marginCheck.allowed) {
      audioManager.playError();
      this.log(`Đặt lệnh thất bại: ${marginCheck.reason}`, 'ERROR');
      return { success: false, error: marginCheck.reason };
    }

    // Commission: e.g. $7 per standard lot
    const commission = parseFloat(((spec.commissionPerLot || 7.0) * vol).toFixed(2));

    // Handle Netting if account.hedging is false
    if (!account.hedging) {
      const existingOpposite = this.openPositions.find(p => p.accountId === account.id && p.symbol === symbol && p.type !== type);
      if (existingOpposite) {
        return this.handleNettingOrder(account, existingOpposite, type, vol, executionPrice, commission);
      }
    }

    const ticket = this.nextTicket();
    const position = {
      ticket,
      accountId: account.id,
      symbol,
      type, // 'BUY' or 'SELL'
      volume: vol,
      openPrice: executionPrice,
      openTime: new Date().toISOString(),
      sl: sl ? parseFloat(sl) : null,
      tp: tp ? parseFloat(tp) : null,
      commission,
      swap: 0,
      comment: comment || 'Market Order',
      trailingStopPoints: null
    };

    this.openPositions.push(position);
    this.notifyChange();
    audioManager.playOk();
    this.log(`Khớp lệnh #${ticket} ${type} ${vol.toFixed(2)} ${symbol} tại ${executionPrice}`);
    eventBus.emit('order:opened', position);

    return { success: true, position };
  }

  handleNettingOrder(account, existing, newType, newVol, executionPrice, commission) {
    if (existing.volume === newVol) {
      // Closes existing position completely
      return this.closePosition(existing.ticket, newVol, 'Netting close');
    } else if (existing.volume > newVol) {
      // Partial close of existing position
      return this.partialClosePosition(existing.ticket, newVol);
    } else {
      // Closes existing and opens remaining in new direction
      const diffVol = parseFloat((newVol - existing.volume).toFixed(2));
      this.closePosition(existing.ticket, existing.volume, 'Netting close & flip');
      return this.openMarketOrder({
        accountId: account.id,
        symbol: existing.symbol,
        type: newType,
        volume: diffVol,
        comment: 'Netting flip'
      });
    }
  }

  /**
   * Place Pending Order
   */
  placePendingOrder({ accountId, symbol, type, volume, price, stopLimitPrice = null, sl = null, tp = null, expiration = null, comment = '' }) {
    const account = this.accountsManager.getAllAccounts().find(a => a.id === accountId) || this.accountsManager.getActiveAccount();
    if (!account) return { success: false, error: 'Tài khoản không hợp lệ' };

    const spec = getSymbolSpec(symbol);
    const vol = parseFloat(volume);
    const orderPrice = parseFloat(price);

    if (isNaN(vol) || vol < spec.minLot || vol > spec.maxLot) {
      audioManager.playError();
      return { success: false, error: `Khối lượng không hợp lệ (${spec.minLot} - ${spec.maxLot})` };
    }

    if (isNaN(orderPrice) || orderPrice <= 0) {
      audioManager.playError();
      return { success: false, error: 'Mức giá đặt lệnh không hợp lệ' };
    }

    const ticket = this.nextTicket();
    const order = {
      ticket,
      accountId: account.id,
      symbol,
      type, // 'BUY_LIMIT', 'SELL_LIMIT', 'BUY_STOP', 'SELL_STOP', 'BUY_STOP_LIMIT', 'SELL_STOP_LIMIT'
      volume: vol,
      price: orderPrice,
      stopLimitPrice: stopLimitPrice ? parseFloat(stopLimitPrice) : null,
      placedTime: new Date().toISOString(),
      sl: sl ? parseFloat(sl) : null,
      tp: tp ? parseFloat(tp) : null,
      expiration: expiration || null,
      comment: comment || 'Pending Order'
    };

    this.pendingOrders.push(order);
    this.notifyChange();
    audioManager.playOk();
    this.log(`Đặt lệnh chờ #${ticket} ${type} ${vol.toFixed(2)} ${symbol} tại ${orderPrice}`);
    eventBus.emit('order:pending_placed', order);

    return { success: true, order };
  }

  /**
   * Cancel Pending Order
   */
  cancelPendingOrder(ticket) {
    const idx = this.pendingOrders.findIndex(o => o.ticket === ticket);
    if (idx === -1) return { success: false, error: 'Lệnh chờ không tồn tại' };

    const order = this.pendingOrders.splice(idx, 1)[0];
    this.notifyChange();
    audioManager.playOk();
    this.log(`Hủy lệnh chờ #${ticket} ${order.type} ${order.symbol}`);
    eventBus.emit('order:pending_cancelled', order);
    return { success: true, order };
  }

  /**
   * Close Full Position
   */
  closePosition(ticket, closePriceOverride = null, reason = 'Client close') {
    const idx = this.openPositions.findIndex(p => p.ticket === ticket);
    if (idx === -1) return { success: false, error: 'Vị thế không tồn tại' };

    const pos = this.openPositions[idx];
    const account = this.accountsManager.getAllAccounts().find(a => a.id === pos.accountId);
    if (!account) return { success: false, error: 'Tài khoản không tìm thấy' };

    const quote = window.__currentQuotes ? window.__currentQuotes[pos.symbol] : null;
    let exitPrice = closePriceOverride;
    if (!exitPrice && quote) {
      exitPrice = pos.type === 'BUY' ? quote.bid : quote.ask;
    }
    if (!exitPrice) exitPrice = pos.openPrice;

    const spec = getSymbolSpec(pos.symbol);
    const priceDiff = pos.type === 'BUY' ? (exitPrice - pos.openPrice) : (pos.openPrice - exitPrice);
    const grossProfit = parseFloat((priceDiff * pos.volume * spec.contractSize).toFixed(2));
    const netProfit = parseFloat((grossProfit - (pos.commission || 0) - (pos.swap || 0)).toFixed(2));

    // Update account balance
    account.balance = parseFloat((account.balance + netProfit).toFixed(2));

    // Remove from open
    this.openPositions.splice(idx, 1);

    // Add to closed trades
    const closedRecord = {
      ticket: pos.ticket,
      accountId: pos.accountId,
      symbol: pos.symbol,
      type: pos.type,
      volume: pos.volume,
      openPrice: pos.openPrice,
      openTime: pos.openTime,
      closePrice: exitPrice,
      closeTime: new Date().toISOString(),
      sl: pos.sl,
      tp: pos.tp,
      commission: pos.commission || 0,
      swap: pos.swap || 0,
      grossProfit,
      netProfit,
      reason: reason || 'Manual Close',
      comment: pos.comment
    };
    this.closedTrades.unshift(closedRecord);

    this.notifyChange();
    audioManager.playOk();
    this.log(`Đóng vị thế #${pos.ticket} ${pos.type} ${pos.volume.toFixed(2)} ${pos.symbol} tại ${exitPrice} | Lợi nhuận: $${netProfit.toFixed(2)} (${reason})`);
    eventBus.emit('order:closed', closedRecord);

    return { success: true, trade: closedRecord };
  }

  /**
   * Partial Close
   * e.g. Close 0.40 lots of a 1.00 lot position.
   */
  partialClosePosition(ticket, closeLots) {
    const pos = this.openPositions.find(p => p.ticket === ticket);
    if (!pos) return { success: false, error: 'Vị thế không tồn tại' };

    const toClose = parseFloat(closeLots);
    if (isNaN(toClose) || toClose <= 0 || toClose >= pos.volume) {
      return { success: false, error: `Khối lượng đóng một phần phải nhỏ hơn ${pos.volume.toFixed(2)}` };
    }

    const account = this.accountsManager.getAllAccounts().find(a => a.id === pos.accountId);
    if (!account) return { success: false, error: 'Tài khoản không tìm thấy' };

    const quote = window.__currentQuotes ? window.__currentQuotes[pos.symbol] : null;
    const exitPrice = quote ? (pos.type === 'BUY' ? quote.bid : quote.ask) : pos.openPrice;
    const spec = getSymbolSpec(pos.symbol);

    // Calculate profit and commission for the closed fraction
    const fraction = toClose / pos.volume;
    const priceDiff = pos.type === 'BUY' ? (exitPrice - pos.openPrice) : (pos.openPrice - exitPrice);
    const grossProfit = parseFloat((priceDiff * toClose * spec.contractSize).toFixed(2));
    const closedCommission = parseFloat(((pos.commission || 0) * fraction).toFixed(2));
    const closedSwap = parseFloat(((pos.swap || 0) * fraction).toFixed(2));
    const netProfit = parseFloat((grossProfit - closedCommission - closedSwap).toFixed(2));

    // Update remaining position
    pos.volume = parseFloat((pos.volume - toClose).toFixed(2));
    pos.commission = parseFloat(((pos.commission || 0) - closedCommission).toFixed(2));
    pos.swap = parseFloat(((pos.swap || 0) - closedSwap).toFixed(2));

    // Book realized profit into balance
    account.balance = parseFloat((account.balance + netProfit).toFixed(2));

    const closedRecord = {
      ticket: this.nextTicket(),
      parentTicket: pos.ticket,
      accountId: pos.accountId,
      symbol: pos.symbol,
      type: pos.type,
      volume: toClose,
      openPrice: pos.openPrice,
      openTime: pos.openTime,
      closePrice: exitPrice,
      closeTime: new Date().toISOString(),
      sl: pos.sl,
      tp: pos.tp,
      commission: closedCommission,
      swap: closedSwap,
      grossProfit,
      netProfit,
      reason: `Đóng một phần #${pos.ticket}`,
      comment: pos.comment
    };
    this.closedTrades.unshift(closedRecord);

    this.notifyChange();
    audioManager.playOk();
    this.log(`Đóng một phần #${pos.ticket}: ${toClose.toFixed(2)} lot tại ${exitPrice} | Lãi/Lỗ: $${netProfit.toFixed(2)} | Còn lại: ${pos.volume.toFixed(2)} lot`);
    eventBus.emit('order:partial_closed', { remainingPosition: pos, closedRecord });

    return { success: true, remainingPosition: pos, closedRecord };
  }

  /**
   * Modify Position SL/TP
   */
  modifyPosition(ticket, sl, tp, trailingStopPoints = null) {
    const pos = this.openPositions.find(p => p.ticket === ticket);
    if (!pos) return { success: false, error: 'Vị thế không tồn tại' };

    pos.sl = sl !== null && sl !== '' ? parseFloat(sl) : null;
    pos.tp = tp !== null && tp !== '' ? parseFloat(tp) : null;
    if (trailingStopPoints !== null) {
      pos.trailingStopPoints = parseInt(trailingStopPoints, 10) || null;
    }

    this.notifyChange();
    audioManager.playOk();
    this.log(`Chỉnh sửa vị thế #${pos.ticket}: SL = ${pos.sl || 'None'}, TP = ${pos.tp || 'None'}`);
    eventBus.emit('order:modified', pos);
    return { success: true, position: pos };
  }

  /**
   * Evaluate tick for SL/TP and pending orders
   */
  onMarketTick(quote) {
    // 1. Evaluate Open Positions for SL / TP
    for (let i = this.openPositions.length - 1; i >= 0; i--) {
      const pos = this.openPositions[i];
      if (pos.symbol !== quote.symbol) continue;

      const spec = getSymbolSpec(pos.symbol);

      if (pos.type === 'BUY') {
        // Buy closes at Bid
        if (pos.sl && quote.bid <= pos.sl) {
          audioManager.playAlert();
          this.closePosition(pos.ticket, quote.bid, 'Stop Loss triggered');
          continue;
        }
        if (pos.tp && quote.bid >= pos.tp) {
          audioManager.playAlert();
          this.closePosition(pos.ticket, quote.tp, 'Take Profit triggered');
          continue;
        }
        // Trailing Stop logic
        if (pos.trailingStopPoints) {
          const stepPrice = pos.trailingStopPoints * spec.tickSize;
          if (quote.bid - pos.openPrice >= stepPrice) {
            const proposedSL = parseFloat((quote.bid - stepPrice).toFixed(spec.digits));
            if (!pos.sl || proposedSL > pos.sl) {
              pos.sl = proposedSL;
              this.log(`Trailing Stop dời SL vị thế #${pos.ticket} lên ${pos.sl}`);
              this.notifyChange();
              eventBus.emit('order:modified', pos);
            }
          }
        }
      } else if (pos.type === 'SELL') {
        // Sell closes at Ask
        if (pos.sl && quote.ask >= pos.sl) {
          audioManager.playAlert();
          this.closePosition(pos.ticket, quote.ask, 'Stop Loss triggered');
          continue;
        }
        if (pos.tp && quote.ask <= pos.tp) {
          audioManager.playAlert();
          this.closePosition(pos.ticket, quote.tp, 'Take Profit triggered');
          continue;
        }
        // Trailing Stop logic
        if (pos.trailingStopPoints) {
          const stepPrice = pos.trailingStopPoints * spec.tickSize;
          if (pos.openPrice - quote.ask >= stepPrice) {
            const proposedSL = parseFloat((quote.ask + stepPrice).toFixed(spec.digits));
            if (!pos.sl || proposedSL < pos.sl) {
              pos.sl = proposedSL;
              this.log(`Trailing Stop dời SL vị thế #${pos.ticket} xuống ${pos.sl}`);
              this.notifyChange();
              eventBus.emit('order:modified', pos);
            }
          }
        }
      }
    }

    // 2. Evaluate Pending Orders for triggers
    for (let j = this.pendingOrders.length - 1; j >= 0; j--) {
      const order = this.pendingOrders[j];
      if (order.symbol !== quote.symbol) continue;

      let triggered = false;
      let orderToOpenType = null;
      let fillPrice = order.price;

      switch (order.type) {
        case 'BUY_LIMIT':
          // Triggers when Ask drops to or below limit price
          if (quote.ask <= order.price) {
            triggered = true;
            orderToOpenType = 'BUY';
            fillPrice = quote.ask;
          }
          break;
        case 'SELL_LIMIT':
          // Triggers when Bid rises to or above limit price
          if (quote.bid >= order.price) {
            triggered = true;
            orderToOpenType = 'SELL';
            fillPrice = quote.bid;
          }
          break;
        case 'BUY_STOP':
          // Triggers when Ask rises to or above stop price
          if (quote.ask >= order.price) {
            triggered = true;
            orderToOpenType = 'BUY';
            fillPrice = quote.ask;
          }
          break;
        case 'SELL_STOP':
          // Triggers when Bid drops to or below stop price
          if (quote.bid <= order.price) {
            triggered = true;
            orderToOpenType = 'SELL';
            fillPrice = quote.bid;
          }
          break;
        case 'BUY_STOP_LIMIT':
          // When Ask reaches stop price, convert to Buy Limit at stopLimitPrice
          if (quote.ask >= order.price) {
            order.type = 'BUY_LIMIT';
            order.price = order.stopLimitPrice;
            this.log(`Lệnh chờ #${order.ticket} Buy Stop Limit đã kích hoạt thành Buy Limit tại ${order.price}`);
            this.notifyChange();
            eventBus.emit('order:pending_converted', order);
          }
          break;
        case 'SELL_STOP_LIMIT':
          // When Bid reaches stop price, convert to Sell Limit at stopLimitPrice
          if (quote.bid <= order.price) {
            order.type = 'SELL_LIMIT';
            order.price = order.stopLimitPrice;
            this.log(`Lệnh chờ #${order.ticket} Sell Stop Limit đã kích hoạt thành Sell Limit tại ${order.price}`);
            this.notifyChange();
            eventBus.emit('order:pending_converted', order);
          }
          break;
      }

      if (triggered && orderToOpenType) {
        this.pendingOrders.splice(j, 1);
        this.log(`Khớp lệnh chờ #${order.ticket} ${order.type} thành ${orderToOpenType} tại ${fillPrice}`);
        this.openMarketOrder({
          accountId: order.accountId,
          symbol: order.symbol,
          type: orderToOpenType,
          volume: order.volume,
          sl: order.sl,
          tp: order.tp,
          comment: `Fill Pending #${order.ticket}`
        });
      }
    }
  }

  /**
   * Stop Out Liquidation: closes the most losing position
   */
  liquidateWorstPosition(accountId) {
    const accPositions = this.openPositions.filter(p => p.accountId === accountId);
    if (accPositions.length === 0) return;

    // Find position with lowest currentPL
    accPositions.sort((a, b) => (a.currentPL || 0) - (b.currentPL || 0));
    const worst = accPositions[0];
    if (worst) {
      this.log(`[STOP OUT] Thanh lý cưỡng chế vị thế #${worst.ticket} ${worst.symbol} do chạm mức dừng 50%`, 'ERROR');
      this.closePosition(worst.ticket, null, 'STOP OUT Liquidation');
    }
  }

  calculateAccountUsedMargin(accountId) {
    const account = this.accountsManager.getAllAccounts().find(a => a.id === accountId);
    if (!account) return 0;
    return this.openPositions
      .filter(p => p.accountId === accountId)
      .reduce((sum, p) => sum + (p.currentMargin || this.riskEngine.calculatePositionMargin(p, account)), 0);
  }

  notifyChange() {
    if (this.onStateChange) {
      this.onStateChange({
        openPositions: this.openPositions,
        pendingOrders: this.pendingOrders,
        closedTrades: this.closedTrades,
        systemLogs: this.systemLogs,
        ticketCounter: this.ticketCounter
      });
    }
  }
}
