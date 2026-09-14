// ═══════════════════════════════════════════════════════════════════════════════
// 📚 ENTRY PLAYBOOK — the professional crypto-trading rule library
//
// Single source of truth for "is this a competent buy?". Every buy in the system
// — rule strategies, model decisions, grid/DCA fallbacks — is graded here, so no
// path can enter a trade on partial information again.
//
// The rules encode standard discipline:
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
// SCORING — recalibrated. The previous additive scheme started at 50 and added
// bonuses, so almost every entry landed at 84–100 and every closed trade was graded
// "A" while losing: the score carried no information. Scoring is now a WEIGHTED
// PERCENTAGE of the evidence actually available (earned ÷ possible), so a setup that
// merely avoids vetoes lands in the 40s and only genuine multi-factor alignment
// reaches the 70s and 80s.
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
  /** Per-account tuned thresholds (adaptive tuner owns these). */
  tuning?: PlaybookTuning;
}

/**
 * Per-account tunable thresholds. The adaptive tuner moves these inside
 * PLAYBOOK_TUNING_BOUNDS based on that account's own realised results, so each
 * account sharpens its own entry filter without manual edits.
 */
export interface PlaybookTuning {
  minScore?: number;        // discipline floor an entry must clear
  minVolumeRatio?: number;  // below this = no participation, hard veto
  maxPercentB?: number;     // above this = pinned to upper band, hard veto
  rsiMax?: number;          // above this = overbought, hard veto
  maxChase5m?: number;      // 5m % move above this = vertical spike, hard veto
}

export interface PlaybookVerdict {
  passed: boolean;
  score: number;             // 0–100 discipline score (weighted % of available evidence)
  grade: 'A' | 'B' | 'C' | 'D';
  vetoes: string[];          // hard failures — any one blocks the trade
  confirmations: string[];   // rules that passed and why it's a good entry
  warnings: string[];        // soft demerits
  setupKey: string;          // stable fingerprint for outcome learning
  summary: string;           // one-line human explanation
  minScore: number;          // floor actually applied
  /** How much of the rule library could actually be evaluated, 0–1. */
  coverage: number;
}

/** Minimum discipline score an entry must earn (default / fallback). */
export const PLAYBOOK_MIN_SCORE = 70;

/** At least this share of the rule library must be evaluable, or no entry. */
export const PLAYBOOK_MIN_COVERAGE = 0.7;

export const PLAYBOOK_TUNING_DEFAULTS: Required<PlaybookTuning> = {
  minScore: PLAYBOOK_MIN_SCORE,
  minVolumeRatio: 0.9,
  maxPercentB: 0.8,
  rsiMax: 68,
  maxChase5m: 2.5,
};

/**
 * Hard safety rails. The tuner may never move a threshold outside these — the
 * rule library stays professional no matter what the recent results look like.
 */
export const PLAYBOOK_TUNING_BOUNDS: Record<keyof Required<PlaybookTuning>, [number, number]> = {
  minScore: [62, 85],
  minVolumeRatio: [0.7, 1.5],
  maxPercentB: [0.6, 0.85],
  rsiMax: [60, 72],
  maxChase5m: [1.5, 4],
};

function resolveTuning(t?: PlaybookTuning): Required<PlaybookTuning> {
  const out = { ...PLAYBOOK_TUNING_DEFAULTS };
  for (const k of Object.keys(PLAYBOOK_TUNING_DEFAULTS) as (keyof Required<PlaybookTuning>)[]) {
    const v = t?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const [lo, hi] = PLAYBOOK_TUNING_BOUNDS[k];
      out[k] = Math.max(lo, Math.min(hi, v));
    }
  }
  return out;
}

/** Weight of each rule in the recalibrated score. */
const W = {
  trigger: 10,
  structure: 12,
  macd: 10,
  htf: 16,
  volume: 14,
  band: 12,
  extension: 8,
  location: 10,
  volatility: 12,
  vwap: 8,
  reach: 6,
};

/** Grade an entry against the full rule library. */
export function evaluateEntryPlaybook(i: PlaybookInput): PlaybookVerdict {
  const vetoes: string[] = [];
  const confirmations: string[] = [];
  const warnings: string[] = [];
  const T = resolveTuning(i.tuning);

  // Weighted evidence accumulator: a rule only counts toward the denominator when the
  // data needed to judge it is present, so score = quality, not data availability.
  let earned = 0;
  let possible = 0;
  const award = (weight: number, fraction: number) => {
    possible += weight;
    earned += weight * Math.max(0, Math.min(1, fraction));
  };
  const totalWeight = Object.values(W).reduce((a, b) => a + b, 0);

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
      minScore: T.minScore,
      coverage: 0,
    };
  }

  // ── RULE 1: trigger candle must be rising ────────────────────────────────────
  if (c5 <= 0) {
    vetoes.push(`5m candle ${c5.toFixed(2)}% not rising`);
    award(W.trigger, 0);
  } else {
    award(W.trigger, c5 >= 0.2 ? 1 : 0.6);
    confirmations.push(`5m candle +${c5.toFixed(2)}%`);
  }

  // ── RULE 2: short-term structure ─────────────────────────────────────────────
  let structure = 'flat';
  if (i.ema9 !== undefined && i.ema21 !== undefined) {
    if (i.ema9 >= i.ema21) {
      structure = 'up';
      award(W.structure, 1);
      confirmations.push('EMA9 above EMA21');
    } else if (c15 !== undefined && c15 > 0.3 && c5 > 0.15) {
      structure = 'reclaim';
      award(W.structure, 0.3);
      warnings.push('EMA9 below EMA21 — treated as reclaim attempt');
    } else {
      structure = 'down';
      award(W.structure, 0);
      vetoes.push('EMA9 below EMA21 with no reclaim');
    }
  }

  // ── RULE 3: momentum turning up (MACD histogram) ─────────────────────────────
  let macdState = 'na';
  if (i.macdHist !== undefined && i.macdHistPrev !== undefined) {
    const rising = i.macdHist > i.macdHistPrev;
    macdState = rising ? (i.macdHist >= 0 ? 'pos_rising' : 'neg_rising') : 'falling';
    if (macdState === 'pos_rising') { award(W.macd, 1); confirmations.push('MACD histogram positive and rising'); }
    else if (macdState === 'neg_rising') { award(W.macd, 0.5); warnings.push('MACD rising but still below zero'); }
    else {
      award(W.macd, 0);
      if (c15 !== undefined && c15 <= 0) vetoes.push('MACD histogram falling and 15m negative');
      else warnings.push('MACD histogram falling');
    }
  }

  // ── RULE 4: higher-timeframe trend must not be hostile ───────────────────────
  let htf = 'na';
  if (i.htfAboveEma !== undefined || i.htfSlopePct !== undefined) {
    const slope = i.htfSlopePct ?? 0;
    if (i.htfAboveEma && slope > 0.1) { htf = 'up'; award(W.htf, 1); confirmations.push(`1h trend up (slope ${slope.toFixed(2)}%)`); }
    else if (i.htfAboveEma && slope >= 0) { htf = 'flat'; award(W.htf, 0.45); warnings.push('above 1h EMA but slope flat'); }
    else if (i.htfAboveEma) { htf = 'fading'; award(W.htf, 0.2); warnings.push('above 1h EMA but slope turning down'); }
    else if (slope < -0.25) { htf = 'down'; award(W.htf, 0); vetoes.push(`1h downtrend (slope ${slope.toFixed(2)}%, below 1h EMA)`); }
    else { htf = 'basing'; award(W.htf, 0.1); warnings.push('below 1h EMA — basing at best'); }
  }
  if (c1h !== undefined && c1h < -0.5) vetoes.push(`1h ${c1h.toFixed(2)}% rolling over`);

  // ── RULE 5: participation — volume must confirm ───────────────────────────────
  let volState = 'na';
  if (i.volumeRatio !== undefined) {
    if (i.volumeRatio >= 1.5) { volState = 'surge'; award(W.volume, 1); confirmations.push(`volume ${i.volumeRatio.toFixed(2)}× average`); }
    else if (i.volumeRatio >= 1.15) { volState = 'ok'; award(W.volume, 0.7); confirmations.push(`volume ${i.volumeRatio.toFixed(2)}× average`); }
    else if (i.volumeRatio >= T.minVolumeRatio) { volState = 'thin'; award(W.volume, 0.25); warnings.push(`thin volume ${i.volumeRatio.toFixed(2)}×`); }
    else { volState = 'dead'; award(W.volume, 0); vetoes.push(`no participation — volume ${i.volumeRatio.toFixed(2)}× average`); }
  }

  // ── RULE 6: room to the target ───────────────────────────────────────────────
  if (i.percentB !== undefined) {
    if (i.percentB > T.maxPercentB) { award(W.band, 0); vetoes.push(`%B ${i.percentB.toFixed(2)} pinned at upper band — no room to target`); }
    else if (i.percentB < 0 && c5 <= 0.1) { award(W.band, 0); vetoes.push(`%B ${i.percentB.toFixed(2)} below lower band with no bounce`); }
    else if (i.percentB <= 0.45) { award(W.band, 1); confirmations.push(`%B ${i.percentB.toFixed(2)} lower half — room to run`); }
    else if (i.percentB <= 0.7) { award(W.band, 0.5); }
    else { award(W.band, 0.15); warnings.push(`%B ${i.percentB.toFixed(2)} upper half`); }
  }
  if (i.bbWidth !== undefined && i.targetPct !== undefined) {
    const bandRoomPct = i.bbWidth * 100;
    if (bandRoomPct < i.targetPct * 0.35) {
      warnings.push(`bands narrow (${bandRoomPct.toFixed(2)}%) vs ${i.targetPct.toFixed(2)}% target — needs expansion`);
    }
  }

  // ── RULE 7: not extended, not a chase ────────────────────────────────────────
  if (c5 > T.maxChase5m) vetoes.push(`5m +${c5.toFixed(2)}% vertical spike — chasing`);
  if (c15 !== undefined && c15 > 6) vetoes.push(`15m +${c15.toFixed(2)}% extended — chasing`);
  if (i.rsi14 !== undefined) {
    if (i.rsi14 > T.rsiMax) { award(W.extension, 0); vetoes.push(`RSI ${i.rsi14.toFixed(0)} overbought`); }
    else if (i.rsi14 < 20 && c5 < 0.3) { award(W.extension, 0); vetoes.push(`RSI ${i.rsi14.toFixed(0)} freefall with no reversal candle`); }
    else if (i.rsi14 >= 40 && i.rsi14 <= 60) { award(W.extension, 1); confirmations.push(`RSI ${i.rsi14.toFixed(0)} constructive`); }
    else if (i.rsi14 >= 30) { award(W.extension, 0.5); }
    else { award(W.extension, 0.2); warnings.push(`RSI ${i.rsi14.toFixed(0)} weak`); }
  }
  if (c24 !== undefined && c24 > 12) warnings.push(`24h +${c24.toFixed(2)}% already run`);

  // ── RULE 8: location relative to support ─────────────────────────────────────
  switch (i.supportContext) {
    case 'below_support': award(W.location, 0); vetoes.push('price below support — structure broken'); break;
    case 'far_above_support': award(W.location, 0); vetoes.push('far above support — poor risk placement'); break;
    case 'at_support': award(W.location, 1); confirmations.push('at support'); break;
    case 'near_support': award(W.location, 0.7); confirmations.push('near support'); break;
    case 'mid_range': award(W.location, 0.35); break;
    default: break;
  }
  if (i.higherLows) confirmations.push('higher lows forming');

  // ── RULE 9: tradeable volatility ─────────────────────────────────────────────
  if (i.volClass !== undefined) {
    if (i.volClass === 'dead') { award(W.volatility, 0); vetoes.push('volatility dead — target unreachable'); }
    else if (i.volClass === 'extreme') { award(W.volatility, 0); vetoes.push('volatility extreme — stop will be run'); }
    else if (i.volClass === 'sweet') { award(W.volatility, 1); confirmations.push(`volatility sweet spot (ATR ${(i.atrPct ?? 0).toFixed(2)}%)`); }
    else if (i.volClass === 'high') { award(W.volatility, 0.5); }
    else { award(W.volatility, 0.2); warnings.push('volatility low'); }
  }

  // A swing target has to be reachable by the coin's own hourly range.
  if (i.swingAtrPct !== undefined && i.targetPct !== undefined && i.swingAtrPct > 0) {
    const hoursToTarget = i.targetPct / i.swingAtrPct;
    if (hoursToTarget > 24) {
      award(W.reach, 0);
      vetoes.push(`too slow — needs ~${hoursToTarget.toFixed(0)}h of average range to reach ${i.targetPct.toFixed(2)}%`);
    } else if (hoursToTarget <= 8) {
      award(W.reach, 1);
      confirmations.push(`target reachable in ~${hoursToTarget.toFixed(0)}h of average range`);
    } else {
      award(W.reach, 0.4);
    }
  }

  // ── RULE 10: VWAP / value context ────────────────────────────────────────────
  let vwapState = 'na';
  if (i.vwap !== undefined && i.vwap > 0 && i.lastClose > 0) {
    const distPct = ((i.lastClose - i.vwap) / i.vwap) * 100;
    if (distPct <= -0.15) { vwapState = 'below'; award(W.vwap, 1); confirmations.push(`${distPct.toFixed(2)}% below VWAP — buying value`); }
    else if (distPct <= 0.6) { vwapState = 'at'; award(W.vwap, 0.7); confirmations.push('at VWAP'); }
    else if (distPct <= 2) { vwapState = 'above'; award(W.vwap, 0.2); warnings.push(`${distPct.toFixed(2)}% above VWAP`); }
    else { vwapState = 'far_above'; award(W.vwap, 0); warnings.push(`${distPct.toFixed(2)}% extended above VWAP`); }
  }

  const coverage = possible / totalWeight;
  const score = possible > 0 ? Math.max(0, Math.min(100, Math.round((earned / possible) * 100))) : 0;

  // Thin evidence is not a pass. A setup judged on a third of the library cannot be
  // called an A regardless of how the visible pieces scored.
  if (coverage < PLAYBOOK_MIN_COVERAGE) {
    vetoes.push(`insufficient evidence — only ${(coverage * 100).toFixed(0)}% of the rule library could be checked`);
  }

  const grade: PlaybookVerdict['grade'] = score >= 85 ? 'A' : score >= 76 ? 'B' : score >= T.minScore ? 'C' : 'D';
  const passed = vetoes.length === 0 && score >= T.minScore;

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

  return { passed, score, grade, vetoes, confirmations, warnings, setupKey, summary, minScore: T.minScore, coverage };
}
