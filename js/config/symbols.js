/**
 * MT5 Local Demo Simulator - Symbol Specifications
 * Defines accurate trading specifications for Forex, Metals, Crypto, and Indices.
 */
export const SYMBOL_DEFINITIONS = {
  EURUSD: {
    symbol: 'EURUSD',
    name: 'Euro vs US Dollar',
    category: 'Forex',
    digits: 5,
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.0, // per lot per tick in USD
    spreadPoints: 12, // 1.2 pips
    minLot: 0.01,
    maxLot: 100.0,
    lotStep: 0.01,
    commissionPerLot: 7.0, // $7 round turn
    swapLong: -4.5, // points
    swapShort: 1.2,
    basePrice: 1.08500,
    volatility: 0.00015
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    name: 'Great Britain Pound vs US Dollar',
    category: 'Forex',
    digits: 5,
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.0,
    spreadPoints: 15, // 1.5 pips
    minLot: 0.01,
    maxLot: 100.0,
    lotStep: 0.01,
    commissionPerLot: 7.0,
    swapLong: -3.8,
    swapShort: 0.9,
    basePrice: 1.29500,
    volatility: 0.00020
  },
  USDJPY: {
    symbol: 'USDJPY',
    name: 'US Dollar vs Japanese Yen',
    category: 'Forex',
    digits: 3,
    contractSize: 100000,
    tickSize: 0.001,
    tickValue: 0.67, // normalized in USD
    spreadPoints: 14, // 1.4 pips
    minLot: 0.01,
    maxLot: 100.0,
    lotStep: 0.01,
    commissionPerLot: 7.0,
    swapLong: 6.5,
    swapShort: -9.2,
    basePrice: 149.500,
    volatility: 0.025
  },
  AUDUSD: {
    symbol: 'AUDUSD',
    name: 'Australian Dollar vs US Dollar',
    category: 'Forex',
    digits: 5,
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.0,
    spreadPoints: 14,
    minLot: 0.01,
    maxLot: 100.0,
    lotStep: 0.01,
    commissionPerLot: 7.0,
    swapLong: -2.1,
    swapShort: 0.4,
    basePrice: 0.66850,
    volatility: 0.00014
  },
  XAUUSD: {
    symbol: 'XAUUSD',
    name: 'Gold vs US Dollar',
    category: 'Metals',
    digits: 2,
    contractSize: 100, // 100 troy oz per 1 standard lot
    tickSize: 0.01,
    tickValue: 1.0, // 100 * 0.01 = $1 per 0.01 move per lot
    spreadPoints: 25, // $0.25 spread
    minLot: 0.01,
    maxLot: 50.0,
    lotStep: 0.01,
    commissionPerLot: 10.0,
    swapLong: -18.5,
    swapShort: 8.2,
    basePrice: 2650.00,
    volatility: 0.45
  },
  BTCUSD: {
    symbol: 'BTCUSD',
    name: 'Bitcoin vs US Dollar',
    category: 'Crypto',
    digits: 2,
    contractSize: 1, // 1 BTC per 1 lot
    tickSize: 0.1,
    tickValue: 0.1, // $0.1 per tick
    spreadPoints: 200, // $20.00 spread
    minLot: 0.01,
    maxLot: 10.0,
    lotStep: 0.01,
    commissionPerLot: 15.0,
    swapLong: -25.0,
    swapShort: -15.0,
    basePrice: 67500.00,
    volatility: 12.0
  },
  US30: {
    symbol: 'US30',
    name: 'Wall Street 30 (Dow Jones)',
    category: 'Indices',
    digits: 1,
    contractSize: 10,
    tickSize: 0.1,
    tickValue: 1.0,
    spreadPoints: 250, // 2.5 points
    minLot: 0.01,
    maxLot: 50.0,
    lotStep: 0.01,
    commissionPerLot: 8.0,
    swapLong: -12.0,
    swapShort: 4.5,
    basePrice: 42850.0,
    volatility: 7.5
  }
};

export function getSymbolSpec(symbol) {
  return SYMBOL_DEFINITIONS[symbol] || SYMBOL_DEFINITIONS.EURUSD;
}
