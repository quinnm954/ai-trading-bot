/**
 * =============================================================================
 * STOCK MARKET HOURS DETECTION MODULE
 * =============================================================================
 * 
 * PATENT REFERENCE: Asset-Aware Intelligence (Patent Claim 2)
 * 
 * This module implements equity-specific trading logic by detecting US stock
 * market hours and trading sessions. Unlike crypto which trades 24/7, stocks
 * require market-hours awareness for proper trade execution.
 * 
 * SUPPORTED MARKETS:
 * - NYSE (New York Stock Exchange)
 * - NASDAQ
 * - Future: LSE, TSE, HKEX, etc.
 * 
 * TRADING SESSIONS:
 * - Pre-market: 4:00 AM - 9:30 AM ET
 * - Regular: 9:30 AM - 4:00 PM ET
 * - After-hours: 4:00 PM - 8:00 PM ET
 * 
 * =============================================================================
 */

export interface MarketSession {
  isOpen: boolean;
  session: 'pre-market' | 'regular' | 'after-hours' | 'closed';
  opensAt: Date | null;
  closesAt: Date | null;
  nextRegularOpen: Date;
  message: string;
}

export interface MarketHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  earlyClose?: boolean; // Some holidays have early 1pm close
}

// US Stock Market Holidays for 2024-2025
const MARKET_HOLIDAYS: MarketHoliday[] = [
  // 2024
  { date: '2024-01-01', name: "New Year's Day" },
  { date: '2024-01-15', name: 'Martin Luther King Jr. Day' },
  { date: '2024-02-19', name: "Presidents' Day" },
  { date: '2024-03-29', name: 'Good Friday' },
  { date: '2024-05-27', name: 'Memorial Day' },
  { date: '2024-06-19', name: 'Juneteenth' },
  { date: '2024-07-04', name: 'Independence Day' },
  { date: '2024-09-02', name: 'Labor Day' },
  { date: '2024-11-28', name: 'Thanksgiving' },
  { date: '2024-12-25', name: 'Christmas' },
  // Early closes
  { date: '2024-07-03', name: 'Day Before Independence Day', earlyClose: true },
  { date: '2024-11-29', name: 'Day After Thanksgiving', earlyClose: true },
  { date: '2024-12-24', name: 'Christmas Eve', earlyClose: true },
  // 2025
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-20', name: 'Martin Luther King Jr. Day' },
  { date: '2025-02-17', name: "Presidents' Day" },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-05-26', name: 'Memorial Day' },
  { date: '2025-06-19', name: 'Juneteenth' },
  { date: '2025-07-04', name: 'Independence Day' },
  { date: '2025-09-01', name: 'Labor Day' },
  { date: '2025-11-27', name: 'Thanksgiving' },
  { date: '2025-12-25', name: 'Christmas' },
];

/**
 * Convert a date to Eastern Time
 */
function toEasternTime(date: Date): Date {
  // Get the offset for Eastern Time (accounts for DST automatically)
  const easternOffset = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const easternDate = new Date(easternOffset);
  
  // Calculate offset difference
  const localOffset = date.getTimezoneOffset();
  const easternOffsetMinutes = -5 * 60; // EST is UTC-5, EDT is UTC-4
  
  // Adjust for DST
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  const isDST = date.getTimezoneOffset() < stdOffset;
  
  const etOffset = isDST ? -4 * 60 : -5 * 60;
  const diff = localOffset - etOffset;
  
  return new Date(date.getTime() + diff * 60 * 1000);
}

/**
 * Format a date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Check if a given date is a market holiday
 */
export function isMarketHoliday(date: Date): MarketHoliday | null {
  const dateStr = formatDate(date);
  return MARKET_HOLIDAYS.find(h => h.date === dateStr) || null;
}

/**
 * Check if it's a weekend
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Get the current market session status
 * 
 * @returns MarketSession object with current status and timing info
 */
export function getMarketSession(now: Date = new Date()): MarketSession {
  const eastern = toEasternTime(now);
  const hours = eastern.getHours();
  const minutes = eastern.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Market timing constants (in minutes from midnight ET)
  const PRE_MARKET_OPEN = 4 * 60;      // 4:00 AM ET
  const REGULAR_OPEN = 9 * 60 + 30;    // 9:30 AM ET
  const REGULAR_CLOSE = 16 * 60;       // 4:00 PM ET
  const AFTER_HOURS_CLOSE = 20 * 60;   // 8:00 PM ET
  
  // Check for weekend
  if (isWeekend(eastern)) {
    const nextMonday = new Date(eastern);
    const daysUntilMonday = eastern.getDay() === 0 ? 1 : 2;
    nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
    nextMonday.setHours(9, 30, 0, 0);
    
    return {
      isOpen: false,
      session: 'closed',
      opensAt: null,
      closesAt: null,
      nextRegularOpen: nextMonday,
      message: `Market closed for weekend. Opens Monday at 9:30 AM ET.`,
    };
  }
  
  // Check for holidays
  const holiday = isMarketHoliday(eastern);
  if (holiday && !holiday.earlyClose) {
    const tomorrow = new Date(eastern);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 30, 0, 0);
    
    // Skip to next trading day if tomorrow is also closed
    while (isWeekend(tomorrow) || isMarketHoliday(tomorrow)) {
      tomorrow.setDate(tomorrow.getDate() + 1);
    }
    
    return {
      isOpen: false,
      session: 'closed',
      opensAt: null,
      closesAt: null,
      nextRegularOpen: tomorrow,
      message: `Market closed for ${holiday.name}. Opens ${tomorrow.toLocaleDateString()}.`,
    };
  }
  
  // Early close days (1:00 PM ET close)
  const earlyCloseTime = 13 * 60; // 1:00 PM ET
  const effectiveClose = holiday?.earlyClose ? earlyCloseTime : REGULAR_CLOSE;
  
  // Determine current session
  if (timeInMinutes < PRE_MARKET_OPEN) {
    // Before pre-market
    const opensAt = new Date(eastern);
    opensAt.setHours(4, 0, 0, 0);
    
    return {
      isOpen: false,
      session: 'closed',
      opensAt,
      closesAt: null,
      nextRegularOpen: new Date(eastern.setHours(9, 30, 0, 0)),
      message: 'Pre-market opens at 4:00 AM ET.',
    };
  } else if (timeInMinutes < REGULAR_OPEN) {
    // Pre-market session
    const closesAt = new Date(eastern);
    closesAt.setHours(9, 30, 0, 0);
    
    return {
      isOpen: true,
      session: 'pre-market',
      opensAt: null,
      closesAt,
      nextRegularOpen: closesAt,
      message: 'Pre-market session. Regular trading starts at 9:30 AM ET.',
    };
  } else if (timeInMinutes < effectiveClose) {
    // Regular trading hours
    const closesAt = new Date(eastern);
    closesAt.setHours(Math.floor(effectiveClose / 60), effectiveClose % 60, 0, 0);
    
    const closeTime = holiday?.earlyClose ? '1:00 PM' : '4:00 PM';
    
    return {
      isOpen: true,
      session: 'regular',
      opensAt: null,
      closesAt,
      nextRegularOpen: closesAt,
      message: `Regular market hours${holiday?.earlyClose ? ' (early close)' : ''}. Closes at ${closeTime} ET.`,
    };
  } else if (timeInMinutes < AFTER_HOURS_CLOSE && !holiday?.earlyClose) {
    // After-hours session
    const closesAt = new Date(eastern);
    closesAt.setHours(20, 0, 0, 0);
    
    const tomorrow = new Date(eastern);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 30, 0, 0);
    
    return {
      isOpen: true,
      session: 'after-hours',
      opensAt: null,
      closesAt,
      nextRegularOpen: tomorrow,
      message: 'After-hours session. Limited liquidity. Closes at 8:00 PM ET.',
    };
  } else {
    // Market closed for the day
    const tomorrow = new Date(eastern);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 30, 0, 0);
    
    // Skip weekends and holidays
    while (isWeekend(tomorrow) || isMarketHoliday(tomorrow)) {
      tomorrow.setDate(tomorrow.getDate() + 1);
    }
    
    return {
      isOpen: false,
      session: 'closed',
      opensAt: null,
      closesAt: null,
      nextRegularOpen: tomorrow,
      message: `Market closed. Opens ${tomorrow.toLocaleDateString()} at 9:30 AM ET.`,
    };
  }
}

/**
 * Check if stock trading is allowed right now
 * 
 * @param allowExtendedHours - Whether to allow pre-market and after-hours trading
 * @returns boolean
 */
export function canTradeStocks(allowExtendedHours: boolean = false): boolean {
  const session = getMarketSession();
  
  if (session.session === 'regular') return true;
  if (allowExtendedHours && (session.session === 'pre-market' || session.session === 'after-hours')) {
    return true;
  }
  
  return false;
}

/**
 * Get time until market opens (in milliseconds)
 */
export function timeUntilMarketOpen(): number {
  const session = getMarketSession();
  if (session.isOpen) return 0;
  return session.nextRegularOpen.getTime() - Date.now();
}

/**
 * Format market status for display
 */
export function formatMarketStatus(): string {
  const session = getMarketSession();
  
  if (session.session === 'regular') {
    return '🟢 Market Open';
  } else if (session.session === 'pre-market') {
    return '🟡 Pre-Market';
  } else if (session.session === 'after-hours') {
    return '🟠 After-Hours';
  } else {
    return '🔴 Market Closed';
  }
}
