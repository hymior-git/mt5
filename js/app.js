/**
 * MT5 Local Demo Trading Simulator - Main Application Coordinator
 * Powers both 99% Authentic MT5 iOS Mobile and Desktop Terminal interfaces.
 */
import { SYMBOL_DEFINITIONS, getSymbolSpec } from './config/symbols.js';
import { storageManager } from './core/storage.js';
import { audioManager } from './core/audio.js';
import { eventBus } from './core/eventBus.js';
import { AccountsManager } from './engine/accounts.js';
import { marketFeed } from './engine/marketFeed.js';
import { RiskEngine } from './engine/riskEngine.js';
import { ExecutionEngine } from './engine/executionEngine.js';
import { PracticeModeEngine } from './engine/practiceMode.js';
import { analyticsEngine } from './analytics/analyticsEngine.js';
import { analyticsCharts } from './analytics/analyticsCharts.js';
import { JournalStore } from './journal/journalStore.js';
import { ICTClassifier, ICT_CONCEPTS } from './journal/ictClassifier.js';
import { DisciplineEngine } from './discipline/disciplineEngine.js';
import { CandlestickChart } from './chart/candlestickChart.js';

class MT5App {
  constructor() {
    this.selectedSymbol = 'EURUSD';
    this.selectedTimeframe = 'M5';

    // 1. Load persistent state
    this.state = storageManager.loadState() || {
      accounts: [storageManager.createDefaultAccount()],
      activeAccountId: null,
      openPositions: [],
      pendingOrders: [],
      closedTrades: [],
      balanceHistory: [],
      journalEntries: [],
      systemLogs: [],
      disciplineRules: null,
      disciplineViolations: []
    };

    // 2. Instantiate engines
    this.accounts = new AccountsManager(this.state, (s) => this.persistState(s));
    this.risk = new RiskEngine(this.accounts);
    this.execution = new ExecutionEngine(this.state, this.accounts, this.risk, (s) => this.persistState(s));
    this.practice = new PracticeModeEngine(marketFeed);
    this.journal = new JournalStore(this.state, (s) => this.persistState(s));
    this.discipline = new DisciplineEngine(this.state, (s) => this.persistState(s));

    // 3. Candlestick Charts (Desktop & iOS)
    this.desktopChart = new CandlestickChart('chartCanvas', 'chartContainer');
    this.iosChart = new CandlestickChart('iosChartCanvas', 'iosChartCanvasWrapper');

    // 4. Initialize
    this.init();
  }

  persistState(patch) {
    this.state = { ...this.state, ...patch };
    storageManager.saveState(this.state);
  }

  init() {
    this.initViewSwitcher();
    this.initIosTabNavigation();
    this.initIosQuotes();
    this.initUI();
    this.initMarketWatch();
    this.initEventBindings();
    this.initClock();

    // Start market ticks
    marketFeed.startLiveFeed(400);

    // Initial renders
    this.updateActiveAccountUI();
    this.updateToolboxTables();
    this.renderIosTradeScreen();
    this.renderIosHistoryScreen();
    this.refreshAllCharts();
    this.refreshAnalytics();
    this.refreshJournalList();
    this.refreshDisciplineUI();

    // Stop Out listener
    eventBus.on('risk:stop_out', () => {
      const active = this.accounts.getActiveAccount();
      if (active) this.execution.liquidateWorstPosition(active.id);
    });

    // Chart SL/TP drag complete handler
    eventBus.on('chart:line_drag_complete', ({ ticket, sl, tp }) => {
      this.execution.modifyPosition(ticket, sl, tp);
    });
  }

  initViewSwitcher() {
    const btnIos = document.getElementById('btnSwitchIos');
    const btnDesktop = document.getElementById('btnSwitchDesktop');

    btnIos?.addEventListener('click', () => {
      document.body.className = 'show-ios';
      btnIos.classList.add('active');
      btnDesktop.classList.remove('active');
      setTimeout(() => this.iosChart.resize(), 100);
    });

    btnDesktop?.addEventListener('click', () => {
      document.body.className = 'show-desktop';
      btnDesktop.classList.add('active');
      btnIos.classList.remove('active');
      setTimeout(() => this.desktopChart.resize(), 100);
    });
  }

  initIosTabNavigation() {
    const tabButtons = document.querySelectorAll('.ios-tab-bar .ios-tab-item');
    const tabPages = document.querySelectorAll('.ios-tab-page');
    const navTitle = document.getElementById('iosNavTitle');
    const navRightBtn = document.getElementById('iosNavRightBtn');

    const titlesMap = {
      iosTabQuotes: 'Bảng giá',
      iosTabCharts: 'Biểu đồ',
      iosTabTrade: 'Giao dịch',
      iosTabHistory: 'Lịch sử',
      iosTabSettings: 'Cài đặt'
    };

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        tabPages.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.dataset.iostab;
        const page = document.getElementById(targetId);
        if (page) page.classList.add('active');

        if (navTitle) navTitle.textContent = titlesMap[targetId] || 'MetaTrader 5';

        // Right button on top nav
        if (navRightBtn) {
          if (targetId === 'iosTabQuotes' || targetId === 'iosTabTrade') {
            navRightBtn.style.visibility = 'visible';
            navRightBtn.textContent = '+';
            navRightBtn.onclick = () => this.openNewOrderModal();
          } else {
            navRightBtn.style.visibility = 'hidden';
          }
        }

        // Tab specific actions
        if (targetId === 'iosTabCharts') {
          setTimeout(() => {
            this.iosChart.resize();
            this.refreshAllCharts();
          }, 80);
        } else if (targetId === 'iosTabTrade') {
          this.renderIosTradeScreen();
        } else if (targetId === 'iosTabHistory') {
          this.renderIosHistoryScreen();
        }
      });
    });

    // iOS Chart Timeframe button cycle
    const tfs = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
    document.getElementById('iosTfBtn')?.addEventListener('click', (e) => {
      const currentIdx = tfs.indexOf(this.selectedTimeframe);
      const nextIdx = (currentIdx + 1) % tfs.length;
      this.selectedTimeframe = tfs[nextIdx];
      e.target.textContent = this.selectedTimeframe + ' ▾';
      this.refreshAllCharts();
    });

    // iOS Quick One Click Buy / Sell
    document.getElementById('iosQuickBuy')?.addEventListener('click', () => this.handleQuickTrade('BUY', 'iosQuickLot'));
    document.getElementById('iosQuickSell')?.addEventListener('click', () => this.handleQuickTrade('SELL', 'iosQuickLot'));

    // iOS Practice Mode Controls
    document.getElementById('iosBtnPracticePlay')?.addEventListener('click', () => {
      if (!this.practice.isActive) this.practice.startSession(this.selectedSymbol, this.selectedTimeframe);
      this.practice.play();
      this.updatePracticeUI(true);
    });
    document.getElementById('iosBtnPracticePause')?.addEventListener('click', () => {
      this.practice.pause();
      this.updatePracticeUI(false);
    });
    document.getElementById('iosBtnPracticeStep')?.addEventListener('click', () => {
      if (!this.practice.isActive) this.practice.startSession(this.selectedSymbol, this.selectedTimeframe);
      this.practice.stepForward();
    });

    // iOS Settings Cells
    document.getElementById('iosCellAccounts')?.addEventListener('click', () => this.openAccountsModal());
    document.getElementById('iosCellAnalytics')?.addEventListener('click', () => {
      document.getElementById('btnSwitchDesktop').click();
      document.querySelector('[data-tab="tabAnalytics"]')?.click();
    });
    document.getElementById('iosCellJournal')?.addEventListener('click', () => {
      document.getElementById('btnSwitchDesktop').click();
      document.querySelector('[data-tab="tabJournal"]')?.click();
    });
    document.getElementById('iosCellDiscipline')?.addEventListener('click', () => this.openDisciplineModal());
    document.getElementById('iosCellExportIpa')?.addEventListener('click', () => {
      document.getElementById('btnDirectDownloadIpa').click();
    });
    document.getElementById('iosCellExportBackup')?.addEventListener('click', () => {
      storageManager.exportBackup(this.state);
    });
  }

  initIosQuotes() {
    const list = document.getElementById('iosQuotesList');
    if (!list) return;
    list.innerHTML = '';

    Object.values(SYMBOL_DEFINITIONS).forEach(spec => {
      const row = document.createElement('div');
      row.className = 'quote-row';
      row.id = `ios_quote_${spec.symbol}`;

      const quote = marketFeed.getQuote(spec.symbol);
      const bid = quote ? quote.bid : spec.basePrice;
      const ask = quote ? quote.ask : (spec.basePrice + spec.spreadPoints * spec.tickSize);

      const formattedBid = this.formatIosBigPrice(bid, spec.digits);
      const formattedAsk = this.formatIosBigPrice(ask, spec.digits);

      row.innerHTML = `
        <div class="quote-left">
          <span class="quote-symbol">${spec.symbol}</span>
          <span class="quote-time-spread">${new Date().toISOString().slice(11, 19)} &nbsp; Spread: ${spec.spreadPoints}</span>
        </div>
        <div class="quote-right">
          <div class="quote-price-box">
            <span class="big-price" id="ios_bid_${spec.symbol}">${formattedBid}</span>
            <span class="quote-low-high">L: ${(bid * 0.999).toFixed(spec.digits)}</span>
          </div>
          <div class="quote-price-box">
            <span class="big-price" id="ios_ask_${spec.symbol}">${formattedAsk}</span>
            <span class="quote-low-high">H: ${(ask * 1.001).toFixed(spec.digits)}</span>
          </div>
        </div>
      `;

      row.addEventListener('click', () => this.openIosActionSheet(spec.symbol));
      list.appendChild(row);
    });

    // Close action sheet on Cancel
    document.getElementById('asBtnCancel')?.addEventListener('click', () => {
      document.getElementById('iosActionSheet').classList.remove('active');
    });
  }

  formatIosBigPrice(price, digits) {
    const str = price.toFixed(digits);
    if (digits >= 4) {
      // e.g. 1.08502 -> main: 1.08, pips: 50, fraction: 2
      const main = str.slice(0, str.length - 3);
      const pips = str.slice(str.length - 3, str.length - 1);
      const frac = str.slice(str.length - 1);
      return `${main}<span class="pips">${pips}</span><span class="fraction">${frac}</span>`;
    } else if (digits === 2 || digits === 3) {
      const main = str.slice(0, str.length - 2);
      const pips = str.slice(str.length - 2);
      return `${main}<span class="pips">${pips}</span>`;
    }
    return str;
  }

  openIosActionSheet(symbol) {
    this.actionSheetSymbol = symbol;
    const sheet = document.getElementById('iosActionSheet');
    const title = document.getElementById('actionSheetTitle');
    const spec = getSymbolSpec(symbol);
    if (title) title.textContent = `${symbol} — ${spec.name}`;

    document.getElementById('asBtnTrade').onclick = () => {
      sheet.classList.remove('active');
      this.selectedSymbol = symbol;
      this.openNewOrderModal();
    };

    document.getElementById('asBtnChart').onclick = () => {
      sheet.classList.remove('active');
      this.selectedSymbol = symbol;
      document.querySelector('[data-iostab="iosTabCharts"]')?.click();
    };

    document.getElementById('asBtnDetails').onclick = () => {
      alert(`Thông số ${spec.symbol}:\n- Contract Size: ${spec.contractSize}\n- Spread: ${spec.spreadPoints} points\n- Min Lot: ${spec.minLot}\n- Commission: $${spec.commissionPerLot}/lot`);
      sheet.classList.remove('active');
    };

    sheet.classList.add('active');
  }

  initEventBindings() {
    eventBus.on('market:tick', (data) => {
      if (!window.__currentQuotes) window.__currentQuotes = {};
      window.__currentQuotes[data.symbol] = {
        symbol: data.symbol,
        bid: data.bid,
        ask: data.ask,
        spreadPoints: data.spreadPoints,
        digits: data.digits,
        time: data.time
      };

      this.updateMarketWatchRow(data);
      this.updateIosQuoteRow(data);

      if (data.symbol === this.selectedSymbol) {
        this.updateQuickTradeButtons(data);
        this.updateIosQuickTradeButtons(data);
        this.updateStatusBar(data);
        this.refreshAllCharts();
      }

      this.recalculateAccountMetrics();
    });

    eventBus.on('account:switched', () => {
      this.updateActiveAccountUI();
      this.updateToolboxTables();
      this.renderIosTradeScreen();
      this.renderIosHistoryScreen();
      this.refreshAllCharts();
      this.refreshAnalytics();
      this.refreshJournalList();
      this.refreshDisciplineUI();
    });

    eventBus.on('account:created', () => this.updateActiveAccountUI());
    eventBus.on('account:reset', () => {
      this.updateActiveAccountUI();
      this.updateToolboxTables();
      this.renderIosTradeScreen();
      this.renderIosHistoryScreen();
      this.refreshAnalytics();
    });

    eventBus.on('order:opened', () => {
      this.updateToolboxTables();
      this.renderIosTradeScreen();
      this.refreshAllCharts();
      this.recalculateAccountMetrics();
    });

    eventBus.on('order:closed', () => {
      this.updateToolboxTables();
      this.renderIosTradeScreen();
      this.renderIosHistoryScreen();
      this.refreshAllCharts();
      this.recalculateAccountMetrics();
      this.refreshAnalytics();
      this.refreshJournalList();
      this.refreshDisciplineUI();
    });

    eventBus.on('order:partial_closed', () => {
      this.updateToolboxTables();
      this.renderIosTradeScreen();
      this.renderIosHistoryScreen();
      this.refreshAllCharts();
      this.recalculateAccountMetrics();
      this.refreshAnalytics();
    });

    eventBus.on('order:modified', () => {
      this.updateToolboxTables();
      this.renderIosTradeScreen();
      this.refreshAllCharts();
    });

    eventBus.on('system:log', () => this.renderSystemLogs());
  }

  updateIosQuoteRow(data) {
    const bidEl = document.getElementById(`ios_bid_${data.symbol}`);
    const askEl = document.getElementById(`ios_ask_${data.symbol}`);
    if (bidEl && askEl) {
      bidEl.innerHTML = this.formatIosBigPrice(data.bid, data.digits);
      askEl.innerHTML = this.formatIosBigPrice(data.ask, data.digits);
    }
  }

  updateIosQuickTradeButtons(data) {
    const buyPrice = document.getElementById('iosQuickBuyPrice');
    const sellPrice = document.getElementById('iosQuickSellPrice');
    if (buyPrice && sellPrice) {
      buyPrice.textContent = data.ask.toFixed(data.digits);
      sellPrice.textContent = data.bid.toFixed(data.digits);
    }
    const symTitle = document.getElementById('iosChartSymbolTitle');
    if (symTitle) symTitle.textContent = `${data.symbol}, ${this.selectedTimeframe}`;
  }

  refreshAllCharts() {
    let candles = [];
    if (this.practice.isActive) {
      candles = this.practice.getVisibleCandles();
    } else {
      candles = marketFeed.getCandles(this.selectedSymbol, this.selectedTimeframe);
    }
    const activeAcc = this.accounts.getActiveAccount();
    const positions = activeAcc ? this.execution.openPositions.filter(p => p.accountId === activeAcc.id) : [];

    this.desktopChart.setData(candles, this.selectedSymbol, this.selectedTimeframe, positions);
    this.iosChart.setData(candles, this.selectedSymbol, this.selectedTimeframe, positions);
  }

  renderIosTradeScreen() {
    const activeAcc = this.accounts.getActiveAccount();
    if (!activeAcc) return;

    const quotes = window.__currentQuotes || {};
    const metrics = this.risk.calculateAccountMetrics(activeAcc, this.execution.openPositions, quotes);

    // Update Header Cards
    const totalPlEl = document.getElementById('iosTradeTotalPL');
    if (totalPlEl) {
      const pl = metrics.floatingPL;
      totalPlEl.textContent = (pl >= 0 ? '+$' : '-$') + Math.abs(pl).toFixed(2);
      totalPlEl.style.color = pl >= 0 ? '#0a84ff' : '#ff453a';
    }

    document.getElementById('iosTradeBalance').textContent = metrics.balance.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ' + activeAcc.currency;
    document.getElementById('iosTradeEquity').textContent = metrics.equity.toLocaleString('en-US', { minimumFractionDigits: 2 });
    document.getElementById('iosTradeMargin').textContent = metrics.usedMargin.toLocaleString('en-US', { minimumFractionDigits: 2 });
    document.getElementById('iosTradeFreeMargin').textContent = metrics.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2 });
    document.getElementById('iosTradeMarginLevel').textContent = metrics.marginLevel.toFixed(2) + '%';

    // Positions List
    const posList = document.getElementById('iosPositionsList');
    if (posList) {
      posList.innerHTML = '';
      const positions = this.execution.openPositions.filter(p => p.accountId === activeAcc.id);

      if (positions.length === 0) {
        posList.innerHTML = '<div style="padding:16px; color:#636366; font-size:13px; text-align:center;">Không có vị thế mở</div>';
      } else {
        positions.forEach(pos => {
          const div = document.createElement('div');
          div.className = 'position-item';
          const quote = quotes[pos.symbol];
          const curPrice = quote ? (pos.type === 'BUY' ? quote.bid : quote.ask).toFixed(quote.digits) : pos.openPrice;
          const pl = pos.currentPL || 0;
          const isWin = pl >= 0;

          div.innerHTML = `
            <div class="pos-row-1">
              <span class="pos-title">${pos.symbol}, ${pos.type.toLowerCase()} ${pos.volume.toFixed(2)}</span>
              <span class="pos-pl ${isWin ? 'blue' : 'red'}">${isWin ? '+' : ''}${pl.toFixed(2)}</span>
            </div>
            <div class="pos-row-2">
              <span>${pos.openPrice} → ${curPrice}</span>
              <span>SL: ${pos.sl || '-'} &nbsp; TP: ${pos.tp || '-'}</span>
            </div>
          `;

          div.addEventListener('click', () => {
            if (confirm(`Đóng vị thế #${pos.ticket} ${pos.symbol} với lợi nhuận: $${pl.toFixed(2)}?`)) {
              this.execution.closePosition(pos.ticket);
            }
          });

          posList.appendChild(div);
        });
      }
    }
  }

  renderIosHistoryScreen() {
    const activeAcc = this.accounts.getActiveAccount();
    if (!activeAcc) return;

    const closed = this.execution.closedTrades.filter(t => t.accountId === activeAcc.id);
    const totalProfit = closed.reduce((sum, t) => sum + (t.netProfit || 0), 0);

    const histPl = document.getElementById('iosHistProfit');
    if (histPl) {
      histPl.textContent = (totalProfit >= 0 ? '+$' : '-$') + Math.abs(totalProfit).toFixed(2) + ' ' + activeAcc.currency;
      histPl.style.color = totalProfit >= 0 ? '#0a84ff' : '#ff453a';
    }
    document.getElementById('iosHistBalance').textContent = '$' + activeAcc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 });

    const histList = document.getElementById('iosHistoryList');
    if (histList) {
      histList.innerHTML = '';
      if (closed.length === 0) {
        histList.innerHTML = '<div style="padding:16px; color:#636366; font-size:13px; text-align:center;">Chưa có giao dịch đã đóng</div>';
      } else {
        closed.forEach(t => {
          const div = document.createElement('div');
          div.className = 'position-item';
          const isWin = (t.netProfit || 0) >= 0;
          div.innerHTML = `
            <div class="pos-row-1">
              <span class="pos-title">${t.symbol}, ${t.type.toLowerCase()} ${t.volume.toFixed(2)}</span>
              <span class="pos-pl ${isWin ? 'blue' : 'red'}">${isWin ? '+' : ''}${(t.netProfit || 0).toFixed(2)}</span>
            </div>
            <div class="pos-row-2">
              <span>${t.openPrice} → ${t.closePrice}</span>
              <span>${t.closeTime.slice(11, 19)}</span>
            </div>
          `;
          histList.appendChild(div);
        });
      }
    }
  }

  initUI() {
    // Desktop Toolbox Tabs
    document.querySelectorAll('.toolbox-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.toolbox-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.toolbox-content .tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) {
          target.classList.add('active');
          if (btn.dataset.tab === 'tabAnalytics') this.refreshAnalytics();
          if (btn.dataset.tab === 'tabJournal') this.refreshJournalList();
          if (btn.dataset.tab === 'tabDiscipline') this.refreshDisciplineUI();
          if (btn.dataset.tab === 'tabExposure') this.renderExposureTable();
        }
      });
    });

    // Timeframe Buttons Desktop
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedTimeframe = btn.dataset.tf;
        this.refreshAllCharts();
      });
    });

    // Zoom Buttons
    document.getElementById('btnZoomIn')?.addEventListener('click', () => {
      this.desktopChart.barWidth = Math.min(30, this.desktopChart.barWidth + 2);
      this.desktopChart.render();
    });
    document.getElementById('btnZoomOut')?.addEventListener('click', () => {
      this.desktopChart.barWidth = Math.max(2.5, this.desktopChart.barWidth - 2);
      this.desktopChart.render();
    });

    // Desktop Quick One Click
    document.getElementById('btnQuickBuy')?.addEventListener('click', () => this.handleQuickTrade('BUY', 'quickLotInput'));
    document.getElementById('btnQuickSell')?.addEventListener('click', () => this.handleQuickTrade('SELL', 'quickLotInput'));

    // Modal Triggers
    document.getElementById('btnNewOrder')?.addEventListener('click', () => this.openNewOrderModal());
    document.getElementById('btnOpenAccounts')?.addEventListener('click', () => this.openAccountsModal());
    document.getElementById('btnOpenDisciplineRules')?.addEventListener('click', () => this.openDisciplineModal());
    document.getElementById('btnEditDisciplineRules')?.addEventListener('click', () => this.openDisciplineModal());

    // Desktop Practice Mode Controls
    document.getElementById('btnPracticePlay')?.addEventListener('click', () => {
      if (!this.practice.isActive) this.practice.startSession(this.selectedSymbol, this.selectedTimeframe);
      this.practice.play();
      this.updatePracticeUI(true);
    });
    document.getElementById('btnPracticePause')?.addEventListener('click', () => {
      this.practice.pause();
      this.updatePracticeUI(false);
    });
    document.getElementById('btnPracticeNext')?.addEventListener('click', () => {
      if (!this.practice.isActive) this.practice.startSession(this.selectedSymbol, this.selectedTimeframe);
      this.practice.stepForward();
    });
    document.getElementById('practiceSpeedSelect')?.addEventListener('change', (e) => {
      this.practice.setSpeed(parseInt(e.target.value, 10));
    });

    // Modal Close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = document.getElementById(btn.dataset.close);
        if (modal) modal.classList.remove('active');
      });
    });

    // Order type change toggle
    document.getElementById('orderTypeSelect')?.addEventListener('change', (e) => {
      const isPending = e.target.value.includes('LIMIT') || e.target.value.includes('STOP');
      const isStopLimit = e.target.value.includes('STOP_LIMIT');
      document.getElementById('pendingPriceGroup').style.display = isPending ? 'flex' : 'none';
      document.getElementById('stopLimitGroup').style.display = isStopLimit ? 'flex' : 'none';
    });

    document.getElementById('btnSubmitOrder')?.addEventListener('click', () => this.submitNewOrder());

    // Accounts management modal buttons
    document.getElementById('btnCreateAccountOpenModal')?.addEventListener('click', () => {
      document.getElementById('modalCreateAccount').classList.add('active');
    });
    document.getElementById('newAccInitialBalance')?.addEventListener('change', (e) => {
      document.getElementById('newAccCustomBalance').style.display = e.target.value === 'CUSTOM' ? 'block' : 'none';
    });
    document.getElementById('btnSubmitCreateAccount')?.addEventListener('click', () => this.submitCreateAccount());
    document.getElementById('btnApplyBalanceChange')?.addEventListener('click', () => this.applyBalanceChange());

    // Partial Close
    document.getElementById('btnSubmitPartialClose')?.addEventListener('click', () => this.submitPartialClose());

    // Journal Entry Edit
    document.getElementById('btnSaveJournalEntry')?.addEventListener('click', () => this.saveJournalEntry());
    document.getElementById('journalSearchInput')?.addEventListener('input', () => this.refreshJournalList());
    document.getElementById('journalIctFilter')?.addEventListener('change', () => this.refreshJournalList());

    // Discipline Rules Save
    document.getElementById('btnSaveDisciplineRules')?.addEventListener('click', () => this.saveDisciplineRules());

    // Backup & Restore
    document.getElementById('btnExportBackup')?.addEventListener('click', () => storageManager.exportBackup(this.state));
    document.getElementById('btnImportBackup')?.addEventListener('click', () => document.getElementById('fileImportBackup').click());
    document.getElementById('fileImportBackup')?.addEventListener('change', async (e) => {
      if (e.target.files && e.target.files[0]) {
        try {
          await storageManager.importBackup(e.target.files[0]);
          location.reload();
        } catch (err) {
          alert('Lỗi nhập dữ liệu backup: ' + err.message);
        }
      }
    });

    // Populate ICT filter & modal checkboxes
    const ictFilter = document.getElementById('journalIctFilter');
    if (ictFilter) {
      ICT_CONCEPTS.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        ictFilter.appendChild(opt);
      });
    }

    const ictChecklist = document.getElementById('ictChecklistContainer');
    if (ictChecklist) {
      ICT_CONCEPTS.forEach(c => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '6px';
        div.innerHTML = `<input type="checkbox" id="ict_cb_${c.id}" value="${c.id}"><label for="ict_cb_${c.id}" style="color:#d1d5db; font-size:11px; cursor:pointer;">${c.name}</label>`;
        ictChecklist.appendChild(div);
      });
    }
  }

  initMarketWatch() {
    const tbody = document.getElementById('marketWatchBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    Object.values(SYMBOL_DEFINITIONS).forEach(spec => {
      const tr = document.createElement('tr');
      tr.id = `mw_row_${spec.symbol}`;
      if (spec.symbol === this.selectedSymbol) tr.classList.add('selected');

      const quote = marketFeed.getQuote(spec.symbol);
      const bid = quote ? quote.bid.toFixed(spec.digits) : spec.basePrice.toFixed(spec.digits);
      const ask = quote ? quote.ask.toFixed(spec.digits) : (spec.basePrice + spec.spreadPoints * spec.tickSize).toFixed(spec.digits);

      tr.innerHTML = `
        <td>${spec.symbol}</td>
        <td id="mw_bid_${spec.symbol}">${bid}</td>
        <td id="mw_ask_${spec.symbol}">${ask}</td>
        <td id="mw_spread_${spec.symbol}">${spec.spreadPoints}</td>
      `;

      tr.addEventListener('click', () => {
        document.querySelectorAll('#marketWatchBody tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
        this.selectedSymbol = spec.symbol;
        this.refreshAllCharts();
        const curQ = marketFeed.getQuote(spec.symbol);
        if (curQ) {
          this.updateQuickTradeButtons(curQ);
          this.updateIosQuickTradeButtons(curQ);
          this.updateStatusBar(curQ);
        }
      });

      tbody.appendChild(tr);
    });

    const orderSymSelect = document.getElementById('orderSymbolSelect');
    if (orderSymSelect) {
      orderSymSelect.innerHTML = '';
      Object.values(SYMBOL_DEFINITIONS).forEach(spec => {
        const opt = document.createElement('option');
        opt.value = spec.symbol;
        opt.textContent = `${spec.symbol} (${spec.name})`;
        orderSymSelect.appendChild(opt);
      });
    }
  }

  updateMarketWatchRow(data) {
    const bidEl = document.getElementById(`mw_bid_${data.symbol}`);
    const askEl = document.getElementById(`mw_ask_${data.symbol}`);
    const spreadEl = document.getElementById(`mw_spread_${data.symbol}`);

    if (bidEl && askEl) {
      const prevBid = parseFloat(bidEl.textContent);
      bidEl.textContent = data.bid.toFixed(data.digits);
      askEl.textContent = data.ask.toFixed(data.digits);
      if (spreadEl) spreadEl.textContent = data.spreadPoints;

      if (!isNaN(prevBid)) {
        if (data.bid > prevBid) {
          bidEl.className = 'price-up';
          askEl.className = 'price-up';
        } else if (data.bid < prevBid) {
          bidEl.className = 'price-down';
          askEl.className = 'price-down';
        }
      }
    }
  }

  updateQuickTradeButtons(data) {
    const buyPrice = document.getElementById('quickBuyPrice');
    const sellPrice = document.getElementById('quickSellPrice');
    if (buyPrice && sellPrice) {
      buyPrice.textContent = data.ask.toFixed(data.digits);
      sellPrice.textContent = data.bid.toFixed(data.digits);
    }
  }

  updateStatusBar(data) {
    const symbolEl = document.getElementById('statusCurrentSymbol');
    const tickEl = document.getElementById('statusTickInfo');
    if (symbolEl) symbolEl.textContent = `${data.symbol}, ${this.selectedTimeframe}`;
    if (tickEl) tickEl.textContent = `Bid: ${data.bid.toFixed(data.digits)} | Ask: ${data.ask.toFixed(data.digits)} (Spread: ${data.spreadPoints} pts)`;
  }

  recalculateAccountMetrics() {
    const activeAcc = this.accounts.getActiveAccount();
    if (!activeAcc) return;

    const quotes = window.__currentQuotes || {};
    const metrics = this.risk.calculateAccountMetrics(activeAcc, this.execution.openPositions, quotes);

    // Desktop bar
    const barBal = document.getElementById('barBalance');
    if (barBal) {
      barBal.textContent = '$' + metrics.balance.toLocaleString('en-US', { minimumFractionDigits: 2 });
      document.getElementById('barEquity').textContent = '$' + metrics.equity.toLocaleString('en-US', { minimumFractionDigits: 2 });
      document.getElementById('barMargin').textContent = '$' + metrics.usedMargin.toLocaleString('en-US', { minimumFractionDigits: 2 });
      document.getElementById('barFreeMargin').textContent = '$' + metrics.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2 });
      document.getElementById('barMarginLevel').textContent = metrics.marginLevel.toFixed(2) + '%';
    }

    // iOS Header summary
    this.renderIosTradeScreen();

    // Health check (Stop Out)
    this.risk.checkMarginHealth(metrics, () => {
      this.execution.liquidateWorstPosition(activeAcc.id);
    });

    this.updateTradeTablePL(activeAcc.id);
  }

  updateTradeTablePL(accountId) {
    const accPositions = this.execution.openPositions.filter(p => p.accountId === accountId);
    accPositions.forEach(pos => {
      const plEl = document.getElementById(`pos_pl_${pos.ticket}`);
      const curEl = document.getElementById(`pos_cur_${pos.ticket}`);
      if (plEl && curEl) {
        const quote = window.__currentQuotes ? window.__currentQuotes[pos.symbol] : null;
        if (quote) {
          curEl.textContent = (pos.type === 'BUY' ? quote.bid : quote.ask).toFixed(quote.digits);
        }
        const pl = pos.currentPL || 0;
        plEl.textContent = (pl >= 0 ? '+$' : '-$') + Math.abs(pl).toFixed(2);
        plEl.className = pl >= 0 ? 'price-up' : 'price-down';
      }
    });
  }

  updateActiveAccountUI() {
    const acc = this.accounts.getActiveAccount();
    if (!acc) return;

    document.getElementById('titleAccNumber').textContent = acc.accountNumber;
    document.getElementById('titleAccName').textContent = acc.name;
    document.getElementById('titleAccCurrency').textContent = acc.currency;
    document.getElementById('titleAccLeverage').textContent = acc.leverage;

    // iOS Settings Card
    const iosName = document.getElementById('iosSettingsAccName');
    if (iosName) {
      iosName.textContent = acc.name;
      document.getElementById('iosSettingsAccNumber').textContent = acc.accountNumber;
      document.getElementById('iosSettingsAccLeverage').textContent = '1:' + acc.leverage;
    }

    // Navigator list
    const navList = document.getElementById('navAccountsList');
    if (navList) {
      navList.innerHTML = '';
      this.accounts.getAllAccounts().forEach(a => {
        const div = document.createElement('div');
        div.className = `nav-tree-item ${a.id === acc.id ? 'active' : ''}`;
        div.style.paddingLeft = '10px';
        div.innerHTML = `👤 ${a.name} (${a.accountNumber}) - $${a.balance.toFixed(0)}`;
        div.addEventListener('click', () => this.accounts.switchAccount(a.id));
        navList.appendChild(div);
      });
    }
  }

  handleQuickTrade(type, lotInputId = 'quickLotInput') {
    const activeAcc = this.accounts.getActiveAccount();
    if (!activeAcc) return;

    const lotInput = document.getElementById(lotInputId);
    const volume = parseFloat(lotInput ? lotInput.value : 0.10) || 0.10;

    const quote = window.__currentQuotes ? window.__currentQuotes[this.selectedSymbol] : null;
    const price = quote ? (type === 'BUY' ? quote.ask : quote.bid) : getSymbolSpec(this.selectedSymbol).basePrice;

    const todayTrades = this.execution.closedTrades.filter(t => t.accountId === activeAcc.id);
    const validation = this.discipline.validateOrder({
      account: activeAcc,
      symbol: this.selectedSymbol,
      type,
      volume,
      price,
      sl: null,
      tp: null,
      todaysTradesCount: todayTrades.length
    });

    if (!validation.passed && this.discipline.rules.mandatoryStopLoss) {
      alert('Kỷ luật giao dịch: ' + validation.warnings.join('\n') + '\nVui lòng dùng cửa sổ New Order để cài đặt Stop Loss!');
      return;
    }

    this.execution.openMarketOrder({
      accountId: activeAcc.id,
      symbol: this.selectedSymbol,
      type,
      volume,
      comment: 'One-Click Trade'
    });
  }

  openNewOrderModal() {
    const modal = document.getElementById('modalNewOrder');
    if (!modal) return;
    document.getElementById('orderSymbolSelect').value = this.selectedSymbol;
    document.getElementById('orderTypeSelect').value = 'BUY_MARKET';
    document.getElementById('pendingPriceGroup').style.display = 'none';
    document.getElementById('stopLimitGroup').style.display = 'none';
    document.getElementById('orderDisciplineWarning').style.display = 'none';
    modal.classList.add('active');
  }

  submitNewOrder() {
    const activeAcc = this.accounts.getActiveAccount();
    if (!activeAcc) return;

    const symbol = document.getElementById('orderSymbolSelect').value;
    const typeVal = document.getElementById('orderTypeSelect').value;
    const volume = parseFloat(document.getElementById('orderVolumeInput').value);
    const sl = document.getElementById('orderSlInput').value;
    const tp = document.getElementById('orderTpInput').value;

    const quote = window.__currentQuotes ? window.__currentQuotes[symbol] : null;
    const isPending = typeVal.includes('LIMIT') || typeVal.includes('STOP');
    const orderPrice = isPending ? parseFloat(document.getElementById('orderPriceInput').value) : (quote ? (typeVal === 'BUY_MARKET' ? quote.ask : quote.bid) : 0);

    const todayTrades = this.execution.closedTrades.filter(t => t.accountId === activeAcc.id);
    const validation = this.discipline.validateOrder({
      account: activeAcc,
      symbol,
      type: typeVal,
      volume,
      price: orderPrice,
      sl,
      tp,
      todaysTradesCount: todayTrades.length
    });

    if (!validation.passed) {
      const warnBox = document.getElementById('orderDisciplineWarning');
      warnBox.textContent = 'Cảnh báo kỷ luật: ' + validation.warnings.join(' | ');
      warnBox.style.display = 'block';

      if (this.discipline.rules.mandatoryStopLoss && (!sl || parseFloat(sl) <= 0)) {
        return;
      }
    }

    let result;
    if (isPending) {
      const stopLimitPrice = document.getElementById('orderStopLimitInput').value;
      result = this.execution.placePendingOrder({
        accountId: activeAcc.id,
        symbol,
        type: typeVal,
        volume,
        price: orderPrice,
        stopLimitPrice,
        sl,
        tp,
        comment: 'Pending Order'
      });
    } else {
      result = this.execution.openMarketOrder({
        accountId: activeAcc.id,
        symbol,
        type: typeVal === 'BUY_MARKET' ? 'BUY' : 'SELL',
        volume,
        sl,
        tp,
        comment: 'Market Order'
      });
    }

    if (result.success) {
      document.getElementById('modalNewOrder').classList.remove('active');
    } else {
      alert('Lỗi đặt lệnh: ' + result.error);
    }
  }

  updateToolboxTables() {
    const activeAcc = this.accounts.getActiveAccount();
    if (!activeAcc) return;

    // Open Positions
    const posBody = document.getElementById('openPositionsBody');
    if (posBody) {
      posBody.innerHTML = '';
      const positions = this.execution.openPositions.filter(p => p.accountId === activeAcc.id);
      document.getElementById('openPositionsBadge').textContent = positions.length;

      positions.forEach(pos => {
        const tr = document.createElement('tr');
        const quote = window.__currentQuotes ? window.__currentQuotes[pos.symbol] : null;
        const curPrice = quote ? (pos.type === 'BUY' ? quote.bid : quote.ask).toFixed(quote.digits) : pos.openPrice;
        const pl = pos.currentPL || 0;

        tr.innerHTML = `
          <td>${pos.ticket}</td>
          <td>${pos.openTime.slice(11, 19)}</td>
          <td style="color:${pos.type === 'BUY' ? '#00e676' : '#ff5252'}; font-weight:600;">${pos.type}</td>
          <td>${pos.volume.toFixed(2)}</td>
          <td>${pos.symbol}</td>
          <td>${pos.openPrice}</td>
          <td>${pos.sl || '-'}</td>
          <td>${pos.tp || '-'}</td>
          <td id="pos_cur_${pos.ticket}">${curPrice}</td>
          <td>-$${(pos.commission || 0).toFixed(2)}</td>
          <td>$${(pos.swap || 0).toFixed(2)}</td>
          <td id="pos_pl_${pos.ticket}" class="${pl >= 0 ? 'price-up' : 'price-down'}">${pl >= 0 ? '+$' : '-$'}${Math.abs(pl).toFixed(2)}</td>
          <td>
            <button class="btn btn-secondary" style="padding:2px 6px; font-size:10px;" id="btn_partial_${pos.ticket}">Đóng 1 phần</button>
            <button class="btn btn-danger" style="padding:2px 6px; font-size:10px; margin-left:4px;" id="btn_close_${pos.ticket}">Đóng</button>
          </td>
        `;

        posBody.appendChild(tr);

        document.getElementById(`btn_close_${pos.ticket}`)?.addEventListener('click', () => this.execution.closePosition(pos.ticket));
        document.getElementById(`btn_partial_${pos.ticket}`)?.addEventListener('click', () => this.openPartialCloseModal(pos));
      });
    }

    // Pending Orders
    const pending = this.execution.pendingOrders.filter(o => o.accountId === activeAcc.id);
    pending.forEach(ord => {
      const tr = document.createElement('tr');
      tr.style.opacity = '0.75';
      tr.innerHTML = `
        <td>${ord.ticket}</td><td>${ord.placedTime.slice(11, 19)}</td>
        <td style="color:#64b5f6;">${ord.type}</td><td>${ord.volume.toFixed(2)}</td>
        <td>${ord.symbol}</td><td>${ord.price}</td><td>${ord.sl || '-'}</td><td>${ord.tp || '-'}</td>
        <td>-</td><td>-</td><td>-</td><td>(Chờ khớp)</td>
        <td><button class="btn btn-secondary" style="padding:2px 6px; font-size:10px;" id="btn_cancel_${ord.ticket}">Hủy</button></td>
      `;
      posBody.appendChild(tr);
      document.getElementById(`btn_cancel_${ord.ticket}`)?.addEventListener('click', () => this.execution.cancelPendingOrder(ord.ticket));
    });

    // History
    const historyBody = document.getElementById('historyBody');
    if (historyBody) {
      historyBody.innerHTML = '';
      const closed = this.execution.closedTrades.filter(t => t.accountId === activeAcc.id);
      document.getElementById('closedTradesBadge').textContent = closed.length;

      closed.forEach(t => {
        const tr = document.createElement('tr');
        const p = t.netProfit || 0;
        tr.innerHTML = `
          <td>${t.ticket}</td><td>${t.openTime.slice(11, 19)}</td>
          <td style="color:${t.type === 'BUY' ? '#00e676' : '#ff5252'};">${t.type}</td>
          <td>${t.volume.toFixed(2)}</td><td>${t.symbol}</td><td>${t.openPrice}</td>
          <td>${t.sl || '-'}</td><td>${t.tp || '-'}</td><td>${t.closeTime.slice(11, 19)}</td>
          <td>${t.closePrice}</td><td>-$${(t.commission || 0).toFixed(2)}</td><td>$${(t.swap || 0).toFixed(2)}</td>
          <td class="${p >= 0 ? 'price-up' : 'price-down'}">${p >= 0 ? '+$' : '-$'}${Math.abs(p).toFixed(2)}</td>
          <td>${t.reason || t.comment || '-'}</td>
        `;
        historyBody.appendChild(tr);
      });
    }

    this.renderSystemLogs();
  }

  openPartialCloseModal(pos) {
    const modal = document.getElementById('modalPartialClose');
    if (!modal) return;
    document.getElementById('partialCloseTicketBadge').textContent = '#' + pos.ticket;
    document.getElementById('partialCloseSymbolBadge').textContent = pos.symbol;
    document.getElementById('partialCloseCurrentVol').textContent = pos.volume.toFixed(2);
    document.getElementById('partialCloseVolumeInput').value = (pos.volume / 2).toFixed(2);
    document.getElementById('partialCloseVolumeInput').max = (pos.volume - 0.01).toFixed(2);
    this.activePartialPosition = pos;
    modal.classList.add('active');
  }

  submitPartialClose() {
    if (!this.activePartialPosition) return;
    const vol = parseFloat(document.getElementById('partialCloseVolumeInput').value);
    const res = this.execution.partialClosePosition(this.activePartialPosition.ticket, vol);
    if (res.success) {
      document.getElementById('modalPartialClose').classList.remove('active');
      this.activePartialPosition = null;
    } else {
      alert('Lỗi: ' + res.error);
    }
  }

  openAccountsModal() {
    const modal = document.getElementById('modalAccounts');
    if (!modal) return;
    const tbody = document.getElementById('accountsListBody');
    if (tbody) {
      tbody.innerHTML = '';
      const active = this.accounts.getActiveAccount();
      this.accounts.getAllAccounts().forEach(acc => {
        const tr = document.createElement('tr');
        if (acc.id === active.id) tr.style.background = '#1e2638';
        tr.innerHTML = `
          <td><strong>${acc.accountNumber}</strong></td>
          <td>${acc.name} ${acc.id === active.id ? '⭐' : ''}</td>
          <td style="color:#00e676; font-weight:700;">$${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td>1:${acc.leverage}</td><td>${acc.currency}</td><td>${acc.hedging ? 'Hedging' : 'Netting'}</td>
          <td>
            ${acc.id !== active.id ? `<button class="btn btn-primary" style="padding:2px 8px; font-size:10px;" id="btn_switch_${acc.id}">Chọn</button>` : ''}
            <button class="btn btn-secondary" style="padding:2px 8px; font-size:10px;" id="btn_reset_${acc.id}">Reset</button>
            <button class="btn btn-danger" style="padding:2px 8px; font-size:10px;" id="btn_del_${acc.id}">Xóa</button>
          </td>
        `;
        tbody.appendChild(tr);

        document.getElementById(`btn_switch_${acc.id}`)?.addEventListener('click', () => {
          this.accounts.switchAccount(acc.id);
          this.openAccountsModal();
        });
        document.getElementById(`btn_reset_${acc.id}`)?.addEventListener('click', () => {
          if (confirm(`Reset tài khoản ${acc.name} về $${acc.initialBalance}?`)) {
            this.accounts.resetAccount(acc.id);
            this.openAccountsModal();
          }
        });
        document.getElementById(`btn_del_${acc.id}`)?.addEventListener('click', () => {
          if (confirm(`Xóa tài khoản ${acc.name}?`)) {
            const res = this.accounts.deleteAccount(acc.id);
            if (!res.success) alert(res.error);
            else this.openAccountsModal();
          }
        });
      });
    }
    modal.classList.add('active');
  }

  submitCreateAccount() {
    const name = document.getElementById('newAccName').value;
    const balSelect = document.getElementById('newAccInitialBalance').value;
    let balance = parseFloat(balSelect);
    if (balSelect === 'CUSTOM') {
      balance = parseFloat(document.getElementById('newAccCustomBalance').value);
    }
    const leverage = parseInt(document.getElementById('newAccLeverage').value, 10);
    const currency = document.getElementById('newAccCurrency').value;
    const hedging = document.getElementById('newAccHedging').value === 'true';

    this.accounts.createAccount({ name, balance, leverage, currency, hedging });
    document.getElementById('modalCreateAccount').classList.remove('active');
    this.openAccountsModal();
  }

  applyBalanceChange() {
    const active = this.accounts.getActiveAccount();
    if (!active) return;

    const action = document.getElementById('quickBalanceAction').value;
    const suggested = document.getElementById('suggestedBalanceAmounts').value;
    let amount = parseFloat(suggested);
    if (suggested === 'CUSTOM' || isNaN(amount)) {
      amount = parseFloat(document.getElementById('customAmountInput').value);
    }

    if (isNaN(amount) || amount <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ!');
      return;
    }

    if (action === 'DEPOSIT') {
      this.accounts.deposit(active.id, amount, 'Virtual Deposit via Settings');
    } else if (action === 'WITHDRAW') {
      const res = this.accounts.withdraw(active.id, amount, 'Virtual Withdrawal via Settings');
      if (!res.success) alert(res.error);
    } else {
      this.accounts.adjustBalance(active.id, amount, 'Balance Adjustment via Settings');
    }

    this.openAccountsModal();
  }

  refreshAnalytics() {
    const activeAcc = this.accounts.getActiveAccount();
    if (!activeAcc) return;

    const metrics = analyticsEngine.computeMetrics(this.execution.closedTrades, { accountId: activeAcc.id });

    document.getElementById('kpiTotalTrades').textContent = metrics.totalTrades;
    document.getElementById('kpiWinRate').textContent = metrics.winRate + '%';
    document.getElementById('kpiProfitFactor').textContent = metrics.profitFactor.toFixed(2);
    document.getElementById('kpiNetProfit').textContent = (metrics.netProfit >= 0 ? '+$' : '-$') + Math.abs(metrics.netProfit).toFixed(2);
    document.getElementById('kpiNetProfit').className = 'kpi-val ' + (metrics.netProfit >= 0 ? 'green' : 'red');
    document.getElementById('kpiExpectancy').textContent = (metrics.expectancy >= 0 ? '+$' : '-$') + Math.abs(metrics.expectancy).toFixed(2);
    document.getElementById('kpiMaxDrawdown').textContent = '-$' + metrics.maxDrawdownUsd.toFixed(2);

    const canvasEq = document.getElementById('canvasEquityCurve');
    if (canvasEq) analyticsCharts.renderEquityCurve(canvasEq, metrics.equityCurve, activeAcc.initialBalance);

    const canvasSess = document.getElementById('canvasSessionBars');
    if (canvasSess) analyticsCharts.renderSessionBars(canvasSess, metrics.profitBySession);
  }

  refreshJournalList() {
    const activeAcc = this.accounts.getActiveAccount();
    if (!activeAcc) return;

    const query = document.getElementById('journalSearchInput')?.value || '';
    const ictTag = document.getElementById('journalIctFilter')?.value || 'ALL';

    const entries = this.journal.getEntries({
      accountId: activeAcc.id,
      searchQuery: query,
      ictTag
    });

    const container = document.getElementById('journalEntriesContainer');
    if (!container) return;
    container.innerHTML = '';

    if (entries.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:#656d81;">Chưa có nhật ký giao dịch.</div>`;
      return;
    }

    entries.forEach(e => {
      const card = document.createElement('div');
      card.className = 'journal-card';
      const isWin = (e.netProfit || 0) >= 0;
      const tagsHtml = (e.ictTags || []).map(t => `<span class="tag-ict">${t}</span>`).join('');

      card.innerHTML = `
        <div class="journal-meta">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-weight:700; color:#fff;">#${e.ticket} ${e.symbol} — ${e.type} ${e.volume} lot</span>
            <span style="font-weight:700; color:${isWin ? '#00e676' : '#ff5252'};">${isWin ? '+$' : '-$'}${Math.abs(e.netProfit || 0).toFixed(2)}</span>
          </div>
          <div style="color:#8a94a6; font-size:11px;">Vào: ${e.openPrice} | Thoát: ${e.closePrice} | ${e.session} Session</div>
          <div class="journal-badge-row">${tagsHtml}</div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  openDisciplineModal() {
    const modal = document.getElementById('modalDisciplineRules');
    if (!modal) return;
    const r = this.discipline.rules;
    document.getElementById('ruleMaxRiskInput').value = r.maxRiskPerTradePercent;
    document.getElementById('ruleMaxDailyLossInput').value = r.maxDailyLossPercent;
    document.getElementById('ruleMaxTradesInput').value = r.maxTradesPerDay;
    document.getElementById('ruleMinRRInput').value = r.minRiskRewardRatio;
    document.getElementById('ruleMandatorySL').checked = Boolean(r.mandatoryStopLoss);
    modal.classList.add('active');
  }

  saveDisciplineRules() {
    const newRules = {
      maxRiskPerTradePercent: parseFloat(document.getElementById('ruleMaxRiskInput').value),
      maxDailyLossPercent: parseFloat(document.getElementById('ruleMaxDailyLossInput').value),
      maxTradesPerDay: parseInt(document.getElementById('ruleMaxTradesInput').value, 10),
      minRiskRewardRatio: parseFloat(document.getElementById('ruleMinRRInput').value),
      mandatoryStopLoss: document.getElementById('ruleMandatorySL').checked
    };
    this.discipline.updateRules(newRules);
    document.getElementById('modalDisciplineRules').classList.remove('active');
    this.refreshDisciplineUI();
  }

  refreshDisciplineUI() {
    const scoreData = this.discipline.computeDisciplineScore(this.execution.closedTrades.length);
    const circle = document.getElementById('disciplineScoreCircle');
    if (circle) circle.textContent = scoreData.score + '%';

    const compEl = document.getElementById('disciplineComplianceRate');
    if (compEl) compEl.textContent = `Tuân thủ: ${scoreData.complianceRate}% (${scoreData.totalViolations} lỗi)`;
  }

  renderExposureTable() {
    const tbody = document.getElementById('exposureBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const active = this.accounts.getActiveAccount();
    if (!active) return;

    const positions = this.execution.openPositions.filter(p => p.accountId === active.id);
    const assetTotals = {};
    let totalUsd = 0;

    positions.forEach(p => {
      const spec = getSymbolSpec(p.symbol);
      const usdValue = p.openPrice * p.volume * spec.contractSize;
      if (!assetTotals[p.symbol]) assetTotals[p.symbol] = { volume: 0, usd: 0, rate: p.openPrice };
      assetTotals[p.symbol].volume += p.volume;
      assetTotals[p.symbol].usd += usdValue;
      totalUsd += usdValue;
    });

    Object.entries(assetTotals).forEach(([sym, data]) => {
      const share = totalUsd > 0 ? ((data.usd / totalUsd) * 100).toFixed(1) : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${sym}</strong></td><td>${data.volume.toFixed(2)}</td><td>${data.rate}</td>
        <td>$${data.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td>${share}%</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderSystemLogs() {
    const tbody = document.getElementById('systemLogBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    this.execution.systemLogs.slice(0, 30).forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:#7a8599;">${log.time.slice(11, 19)}</td>
        <td style="color:${log.type === 'ERROR' ? '#ff5252' : '#64b5f6'}; font-weight:600;">${log.type}</td>
        <td>${log.message}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  updatePracticeUI(isRunning) {
    const dot = document.getElementById('practiceStatusDot');
    const iosDot = document.getElementById('iosPracticeDot');
    if (dot) dot.className = `practice-status-dot ${isRunning ? 'running' : ''}`;
    if (iosDot) iosDot.className = `practice-status-dot ${isRunning ? 'running' : ''}`;
  }

  initClock() {
    const update = () => {
      const now = new Date();
      const timeStr = now.toISOString().slice(11, 19) + ' UTC';
      const clock = document.getElementById('liveClock');
      if (clock) clock.textContent = timeStr;

      const iosClock = document.getElementById('iosClock');
      if (iosClock) {
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        iosClock.textContent = `${hours}:${minutes}`;
      }
    };
    update();
    setInterval(update, 1000);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__mt5App = new MT5App();
});
