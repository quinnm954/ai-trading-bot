// ═══════════════════════════════════════════════════════════════════════════════
// 📚 ENTRY PLAYBOOK — the professional crypto-trading rule library
//
// Single source of truth for "is this a competent buy?". Every buy in the system
// — rule strategies, model decisions, grid/DCA fallbacks — is graded here, so no
// path can enter a trade on partial information again.
//
// The rules encode standard discipline that the engine previously applied only in
// scattered pieces:
//   1. Trigger candle must be UP (never catch a falling knife)
//   2. Short-term structure up (EMA9 ≥ EMA21, or a confirmed reclaim)
//   3. Momentum turning up (MACD histogram rising)
//   4. Higher-timeframe trend not hostile (1h EMA20 / slope)
//   5. Participation (volume on the trigger vs its own baseline)
//   6. Room to the target (not pinned to the upper Bollinger band)
//   7. Not extended / not a chase (no vertical 5m–15m spike)
//   8. Location (near support, not below it, not miles above it)
//   9. Tradeable volatility (not dead, not extreme)
//  10. VWAP context (buying below/at value, or reclaiming it)
//
// It also produces a stable `setupKey` fingerprint so real outcomes can be scored
// per setup type and losing setups can be benched automatically.
// ═══════════════════════════════════════════════════════════════════════════════

export interface PlaybookInput {
  symbol?: string;
  // Momentum
  change5m?: number;
  change15m?: number;
  change1h?: number;
  change24h?: number;
  // Oscillators / bands
  rsi14?: number;
  percentB?: number;
  bbWidth?: number;
  // Structure
  ema9?: number;
  ema21?: number;
  lastClose?: number;
  macdHist?: number;
  macdHistPrev?: number;
  vwap?: number;
  higherLows?: boolean;
  // Volume
  volumeRatio?: number; // recent candle volume vs its 20-candle average
  // Volatility
  atrPct?: number;
  swingAtrPct?: number;
  volClass?: 'dead' | 'low' | 'sweet' | 'high' | 'extreme';
  // Location
  supportContext?: 'at_support' | 'near_support' | 'mid_range' | 'far_above_support' | 'below_support';
  distanceToSupportPct?: number;
  // Higher timeframe (1h candles)
  htfAboveEma?: boolean;
  htfSlopePct?: number;
  // Context
  regime?: string;
  strategy?: string;
  targetPct?: number; // take-profit distance the trade needs to travel
}

export interface PlaybookVerdict {
  passed: boolean;
  score: number;             // 0–100 discipline score
  grade: 'A' | 'B' | 'C' | 'D';
  vetoes: string[];          // hard failures — any one blocks the trade
  confirmations: string[];   // rules that passed and why it's a good entry
  warnings: string[];        // soft demerits
  setupKey: string;          // stable fingerprint for outcome learning
  summary: string;           // one-line human explanation
}

/** Minimum discipline score an entry must earn. */
export const PLAYBOOK_MIN_SCORE = 55;

/** Grade an entry against the full rule library. */
export function evaluateEntryPlaybook(i: PlaybookInput): PlaybookVerdict {
  const vetoes: string[] = [];
  const confirmations: string[] = [];
  const warnings: string[] = [];
  let score = 50;

  const c5 = i.change5m;
  const c15 = i.change15m;
  const c1h = i.change1h;
  const c24 = i.change24h;

  // ── RULE 0: never trade blind ────────────────────────────────────────────────
  if (c5 === undefined || i.lastClose === undefined) {
    return {
      passed: false, score: 0, grade: 'D',
      vetoes: ['no candle data — refusing blind entry'],
      confirmations: [], warnings: [],
      setupKey: 'nodata',
      summary: 'No candle data — entry refused.',
    };
  }

  // ── RULE 1: trigger candle must be rising ────────────────────────────────────
  if (c5 <= 0) vetoes.push(`5m candle ${c5.toFixed(2)}% not rising`);
  else { score += 8; confirmations.push(`5m candle +${c5.toFixed(2)}%`); }

  // ── RULE 2: short-term structure ─────────────────────────────────────────────
  let structure = 'flat';
  if (i.ema9 !== undefined && i.ema21 !== undefined) {
    if (i.ema9 >= i.ema21) {
      structure = 'up';
      score += 10;
      confirmations.push('EMA9 above EMA21');
    } else if (c15 !== undefined && c15 > 0.3 && c5 > 0.15) {
      structure = 'reclaim';
      score += 3;
      warnings.push('EMA9 below EMA21 — treated as reclaim attempt');
    } else {
      structure = 'down';
      vetoes.push('EMA9 below EMA21 with no reclaim');
    }
  }

  // ── RULE 3: momentum turning up (MACD histogram) ─────────────────────────────
  let macdState = 'na';
  if (i.macdHist !== undefined && i.macdHistPrev !== undefined) {
    const rising = i.macdHist > i.macdHistPrev;
    macdState = rising ? (i.macdHist >= 0 ? 'pos_rising' : 'neg_rising') : 'falling';
    if (rising) { score += 8; confirmations.push('MACD histogram rising'); }
    else if (c15 !== undefined && c15 <= 0) vetoes.push('MACD histogram falling and 15m negative');
    else { score -= 6; warnings.push('MACD histogram falling'); }
  }

  // ── RULE 4: higher-timeframe trend must not be hostile ───────────────────────
  let htf = 'na';
  if (i.htfAboveEma !== undefined || i.htfSlopePct !== undefined) {
    const slope = i.htfSlopePct ?? 0;
    if (i.htfAboveEma && slope >= 0) { htf = 'up'; score += 12; confirmations.push(`1h trend up (slope ${slope.toFixed(2)}%)`); }
    else if (i.htfAboveEma) { htf = 'flat'; score += 3; warnings.push('above 1h EMA but slope flat/down'); }
    else if (slope < -0.25) { htf = 'down'; vetoes.push(`1h downtrend (slope ${slope.toFixed(2)}%, below 1h EMA)`); }
    else { htf = 'basing'; warnings.push('below 1h EMA — basing at best'); score -= 4; }
  }
  if (c1h !== undefined && c1h < -0.5) vetoes.push(`1h ${c1h.toFixed(2)}% rolling over`);

  // ── RULE 5: participation — volume must confirm ───────────────────────────────
  let volState = 'na';
  if (i.volumeRatio !== undefined) {
    if (i.volumeRatio >= 1.5) { volState = 'surge'; score += 12; confirmations.push(`volume ${i.volumeRatio.toFixed(2)}× average`); }
    else if (i.volumeRatio >= 1.0) { volState = 'ok'; score += 6; confirmations.push(`volume ${i.volumeRatio.toFixed(2)}× average`); }
    else if (i.volumeRatio >= 0.6) { volState = 'thin'; score -= 5; warnings.push(`thin volume ${i.volumeRatio.toFixed(2)}×`); }
    else { volState = 'dead'; vetoes.push(`no participation — volume ${i.volumeRatio.toFixed(2)}× average`); }
  }

  // ── RULE 6: room to the target ───────────────────────────────────────────────
  if (i.percentB !== undefined) {
    if (i.percentB > 0.85) vetoes.push(`%B ${i.percentB.toFixed(2)} pinned at upper band — no room to target`);
    else if (i.percentB < 0 && c5 <= 0.1) vetoes.push(`%B ${i.percentB.toFixed(2)} below lower band with no bounce`);
    else if (i.percentB <= 0.45) { score += 10; confirmations.push(`%B ${i.percentB.toFixed(2)} lower half — room to run`); }
    else if (i.percentB <= 0.7) { score += 4; }
    else { score -= 6; warnings.push(`%B ${i.percentB.toFixed(2)} upper half`); }
  }
  if (i.bbWidth !== undefined && i.targetPct !== undefined) {
    const bandRoomPct = i.bbWidth * 100;
    if (bandRoomPct < i.targetPct * 0.35) {
      warnings.push(`bands narrow (${bandRoomPct.toFixed(2)}%) vs ${i.targetPct.toFixed(2)}% target — needs expansion`);
      score -= 5;
    }
  }

  // ── RULE 7: not extended, not a chase ────────────────────────────────────────
  if (c5 > 3) vetoes.push(`5m +${c5.toFixed(2)}% vertical spike — chasing`);
  if (c15 !== undefined && c15 > 6) vetoes.push(`15m +${c15.toFixed(2)}% extended — chasing`);
  if (i.rsi14 !== undefined) {
    if (i.rsi14 > 70) vetoes.push(`RSI ${i.rsi14.toFixed(0)} overbought`);
    else if (i.rsi14 < 20 && c5 < 0.3) vetoes.push(`RSI ${i.rsi14.toFixed(0)} freefall with no reversal candle`);
    else if (i.rsi14 >= 35 && i.rsi14 <= 60) { score += 8; confirmations.push(`RSI ${i.rsi14.toFixed(0)} constructive`); }
    else if (i.rsi14 > 60) { score -= 5; warnings.push(`RSI ${i.rsi14.toFixed(0)} hot`); }
  }
  if (c24 !== undefined && c24 > 12) { score -= 8; warnings.push(`24h +${c24.toFixed(2)}% already run`); }

  // ── RULE 8: location relative to support ─────────────────────────────────────
  switch (i.supportContext) {
    case 'below_support': vetoes.push('price below support — structure broken'); break;
    case 'far_above_support': vetoes.push('far above support — poor risk placement'); break;
    case 'at_support': score += 12; confirmations.push('at support'); break;
    case 'near_support': score += 7; confirmations.push('near support'); break;
    default: break;
  }
  if (i.higherLows) { score += 6; confirmations.push('higher lows forming'); }

  // ── RULE 9: tradeable volatility ─────────────────────────────────────────────
  if (i.volClass === 'dead') vetoes.push('volatility dead — target unreachable');
  else if (i.volClass === 'extreme') vetoes.push('volatility extreme — stop will be run');
  else if (i.volClass === 'sweet') { score += 10; confirmations.push(`volatility sweet spot (ATR ${(i.atrPct ?? 0).toFixed(2)}%)`); }
  else if (i.volClass === 'high') { score += 2; }
  else if (i.volClass === 'low') { score -= 4; warnings.push('volatility low'); }

  // A 48h swing target has to be reachable by the coin's own hourly range.
  if (i.swingAtrPct !== undefined && i.targetPct !== undefined && i.swingAtrPct > 0) {
    const hoursToTarget = i.targetPct / i.swingAtrPct;
    if (hoursToTarget > 40) {
      vetoes.push(`too slow — needs ~${hoursToTarget.toFixed(0)}h of average range to reach ${i.targetPct.toFixed(2)}%`);
    } else if (hoursToTarget <= 12) {
      score += 6;
      confirmations.push(`target reachable in ~${hoursToTarget.toFixed(0)}h of average range`);
    }
  }

  // ── RULE 10: VWAP / value context ────────────────────────────────────────────
  let vwapState = 'na';
  if (i.vwap !== undefined && i.vwap > 0 && i.lastClose > 0) {
    const distPct = ((i.lastClose - i.vwap) / i.vwap) * 100;
    if (distPct <= -0.15) { vwapState = 'below'; score += 6; confirmations.push(`${distPct.toFixed(2)}% below VWAP — buying value`); }
    else if (distPct <= 0.6) { vwapState = 'at'; score += 4; confirmations.push('at VWAP'); }
    else if (distPct <= 2) { vwapState = 'above'; score -= 3; warnings.push(`${distPct.toFixed(2)}% above VWAP`); }
    else { vwapState = 'far_above'; score -= 10; warnings.push(`${distPct.toFixed(2)}% extended above VWAP`); }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade: PlaybookVerdict['grade'] = score >= 80 ? 'A' : score >= 68 ? 'B' : score >= PLAYBOOK_MIN_SCORE ? 'C' : 'D';
  const passed = vetoes.length === 0 && score >= PLAYBOOK_MIN_SCORE;

  const setupKey = [
    i.regime ?? 'na',
    i.strategy ?? 'na',
    `htf:${htf}`,
    `struct:${structure}`,
    `macd:${macdState}`,
    `vol:${volState}`,
    `loc:${i.supportContext ?? 'na'}`,
    `band:${i.percentB === undefined ? 'na' : i.percentB < 0.3 ? 'low' : i.percentB < 0.6 ? 'mid' : 'high'}`,
    `vwap:${vwapState}`,
    `atr:${i.volClass ?? 'na'}`,
  ].join('|');

  const summary = passed
    ? `📚 Playbook ${grade} (${score}): ${confirmations.slice(0, 4).join(' · ')}`
    : `📚 Playbook FAIL (${score}): ${(vetoes.length ? vetoes : ['score below floor']).join(', ')}`;

  return { passed, score, grade, vetoes, confirmations, warnings, setupKey, summary };
}
