/**
 * painel-core.js
 * Pure calculation functions extracted from painel.html for testability.
 * No DOM, no fetch, no localStorage dependencies.
 *
 * Loaded in browser via <script src="painel-core.js"> (no module system).
 * Loaded in tests via dynamic import() with vitest.
 */

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────
const BYBIT_TAKER    = 0.00055;
const ROUND_TRIP_FEE = BYBIT_TAKER * 2; // 0.0011
const BYBIT_MMR      = 0.005; // 0.5% maintenance margin

const FIB_NORMAL = { m1: 1.618, m2: 2.618, m3: 4.236 };
const FIB_MAX    = { m1: 2.618, m2: 4.236, m3: 6.854 };
const FIB_FIXED2 = { m1: 2.0,   m2: 3.0,   m3: 4.0   };
const FIB_FIXED3 = { m1: 3.0,   m2: 4.5,   m3: 6.0   };

const TIMEFRAMES_BY_MODE = {
  scalp: ['5m','15m','30m'],
  day:   ['5m','15m','1h'],
  swing: ['4h','1D'],
  both:  ['5m','15m','30m','1h','4h','1D'],
};

const JOURNAL_KEY = 'cryptoscanner_journal_v2';

// ─────────────────────────────────────────
// TECHNICAL INDICATORS
// ─────────────────────────────────────────
function calcEMA(closes, period) {
  if (closes.length < period) return closes.map(() => null);
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a,b) => a+b, 0) / period;
  const result = new Array(period - 1).fill(null);
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function calcRSI(closes, p=14) {
  let g=0,l=0;
  for (let i=1;i<=p;i++) { const d=closes[i]-closes[i-1]; if(d>=0) g+=d; else l-=d; }
  let ag=g/p, al=l/p;
  const rsi=[null];
  for (let i=1;i<closes.length;i++) {
    if(i<=p){rsi.push(null);continue;}
    const d=closes[i]-closes[i-1];
    ag=(ag*(p-1)+(d>0?d:0))/p; al=(al*(p-1)+(d<0?-d:0))/p;
    rsi.push(al===0?100:100-100/(1+ag/al));
  }
  return rsi;
}

function calcMACD(closes) {
  const e12=calcEMA(closes,12), e26=calcEMA(closes,26);
  const ml=e12.map((v,i)=>v-e26[i]);
  const sig=calcEMA(ml.slice(26),9);
  const hist=ml.slice(26).map((v,i)=>v-sig[i]);
  return {macdLine:ml.slice(26),signal:sig,hist};
}

function calcBollinger(closes,p=20,m=2) {
  return closes.map((_,i)=>{
    if(i<p-1) return null;
    const sl=closes.slice(i-p+1,i+1);
    const mean=sl.reduce((a,b)=>a+b,0)/p;
    const std=Math.sqrt(sl.reduce((a,b)=>a+(b-mean)**2,0)/p);
    return {upper:mean+m*std,mid:mean,lower:mean-m*std};
  }).filter(Boolean);
}

function calcATR(candles,p=14) {
  const trs=candles.slice(1).map((c,i)=>{
    const prev=candles[i];
    return Math.max(c.high-c.low,Math.abs(c.high-prev.close),Math.abs(c.low-prev.close));
  });
  let atr=trs.slice(0,p).reduce((a,b)=>a+b,0)/p;
  const atrs=[atr];
  for(let i=p;i<trs.length;i++){atr=(atr*(p-1)+trs[i])/p;atrs.push(atr);}
  return atrs;
}

function calcADX(candles, p=14) {
  if (candles.length < p * 2 + 1) return null;
  const trs=[], pDMs=[], mDMs=[];
  for (let i=1; i<candles.length; i++) {
    const c=candles[i], prev=candles[i-1];
    const tr=Math.max(c.high-c.low, Math.abs(c.high-prev.close), Math.abs(c.low-prev.close));
    const upMove=c.high-prev.high, downMove=prev.low-c.low;
    trs.push(tr);
    pDMs.push(upMove>downMove && upMove>0 ? upMove : 0);
    mDMs.push(downMove>upMove && downMove>0 ? downMove : 0);
  }
  let atr14=trs.slice(0,p).reduce((a,b)=>a+b,0);
  let pDM14=pDMs.slice(0,p).reduce((a,b)=>a+b,0);
  let mDM14=mDMs.slice(0,p).reduce((a,b)=>a+b,0);
  const dxArr=[];
  for (let i=p; i<trs.length; i++) {
    atr14=atr14-atr14/p+trs[i];
    pDM14=pDM14-pDM14/p+pDMs[i];
    mDM14=mDM14-mDM14/p+mDMs[i];
    const pDI=atr14>0?(pDM14/atr14)*100:0;
    const mDI=atr14>0?(mDM14/atr14)*100:0;
    const diSum=pDI+mDI;
    dxArr.push(diSum>0?Math.abs(pDI-mDI)/diSum*100:0);
  }
  if (dxArr.length < p) return null;
  let adx=dxArr.slice(0,p).reduce((a,b)=>a+b,0)/p;
  for (let i=p; i<dxArr.length; i++) adx=(adx*(p-1)+dxArr[i])/p;
  return adx;
}

function avgVol(candles,p=20) {
  const v=candles.map(c=>c.volume);
  return v.slice(-p-1,-1).reduce((a,b)=>a+b,0)/p;
}

function findLevels(candles,lb=50) {
  const r=candles.slice(-lb), highs=r.map(c=>c.high), lows=r.map(c=>c.low), levels=[];
  for(let i=2;i<r.length-2;i++){
    if(highs[i]>highs[i-1]&&highs[i]>highs[i-2]&&highs[i]>highs[i+1]&&highs[i]>highs[i+2]) levels.push({price:highs[i],type:'resistance'});
    if(lows[i]<lows[i-1]&&lows[i]<lows[i-2]&&lows[i]<lows[i+1]&&lows[i]<lows[i+2]) levels.push({price:lows[i],type:'support'});
  }
  return levels;
}

function calcVWAP(candles) {
  const recent = candles.slice(-80);
  let cumTPV = 0, cumVol = 0;
  for (const c of recent) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol > 0 ? cumTPV / cumVol : null;
}

function calcOBVTrend(candles, period = 20) {
  if (candles.length < period + 1) return 'neutral';
  let obv = 0;
  const obvArr = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i-1].close)      obv += candles[i].volume;
    else if (candles[i].close < candles[i-1].close) obv -= candles[i].volume;
    obvArr.push(obv);
  }
  const recent = obvArr.slice(-period);
  const emaOBV = calcEMA(recent, Math.floor(period / 2));
  const last  = emaOBV[emaOBV.length - 1];
  const prev  = emaOBV[emaOBV.length - 4] ?? emaOBV[0];
  if (last > prev * 1.005)  return 'rising';
  if (last < prev * 0.995)  return 'falling';
  return 'neutral';
}

function calcStochRSI(rsiArr, period = 14) {
  const valid = rsiArr.filter(v => v !== null);
  if (valid.length < period) return null;
  const recent = valid.slice(-period);
  const minRSI = Math.min(...recent);
  const maxRSI = Math.max(...recent);
  if (maxRSI === minRSI) return 50;
  return ((valid[valid.length - 1] - minRSI) / (maxRSI - minRSI)) * 100;
}

// ─────────────────────────────────────────
// PATTERN DETECTION
// ─────────────────────────────────────────
function detectCandlePatterns(candles) {
  const patterns = [];
  const n = candles.length;
  if (n < 4) return patterns;

  const c  = candles[n-1];
  const p  = candles[n-2];
  const pp = candles[n-3];

  const cBody  = Math.abs(c.close - c.open);
  const cRange = c.high - c.low || 0.0001;
  const pBody  = Math.abs(p.close - p.open);
  const pRange = p.high - p.low || 0.0001;
  const ppBody = Math.abs(pp.close - pp.open);

  const cBull = c.close > c.open;
  const cBear = c.close < c.open;
  const pBull = p.close > p.open;
  const pBear = p.close < p.open;
  const ppBear = pp.close < pp.open;
  const ppBull = pp.close > pp.open;

  const cLow  = Math.min(c.open, c.close);
  const cHigh = Math.max(c.open, c.close);
  const pLow  = Math.min(p.open, p.close);
  const pHigh = Math.max(p.open, p.close);

  const cLowerWick = cLow  - c.low;
  const cUpperWick = c.high - cHigh;

  if (cBody / cRange < 0.1 && cRange > 0) {
    patterns.push({ name:'Doji', type:'neutral', score:0,
      desc:'Indecisão total — compradores e vendedores empatados. Aguardar próximo candle para definir direção.',
      triggerPrice: null });
  }

  if (cBull && cLowerWick > cBody * 2 && cUpperWick < cBody * 0.5 && cBody > 0) {
    patterns.push({ name:'Martelo ↑', type:'positive', score:+10,
      desc:'Reversão altista. Vendedores tentaram mas foram absorvidos.',
      triggerPrice: c.high, triggerCond:'fechamento acima de' });
  }

  if (cBear && cLowerWick > cBody * 2 && cUpperWick < cBody * 0.5 && cBody > 0) {
    patterns.push({ name:'Homem Enforcado ↓', type:'negative', score:-10,
      desc:'Possível reversão baixista em topo. Confirmar com próxima vela.',
      triggerPrice: c.low, triggerCond:'fechamento abaixo de' });
  }

  if (cBull && cUpperWick > cBody * 2 && cLowerWick < cBody * 0.5 && cBody > 0) {
    patterns.push({ name:'Martelo Invertido ↑', type:'positive', score:+8,
      desc:'Compradores testaram resistência. Aguardar confirmação.',
      triggerPrice: c.high, triggerCond:'fechamento acima de' });
  }

  if (cBear && cUpperWick > cBody * 2 && cLowerWick < cBody * 0.5 && cBody > 0) {
    patterns.push({ name:'Estrela Cadente ↓', type:'negative', score:-10,
      desc:'Rejeição forte de topo. Vendedores dominaram a sessão.',
      triggerPrice: c.low, triggerCond:'fechamento abaixo de' });
  }

  if (cLowerWick > cRange * 0.62 && cHigh > c.low + cRange * 0.6) {
    patterns.push({ name:'Pinbar Altista ↑', type:'positive', score:+12,
      desc:'Rejeição forte de preços baixos — cauda longa inferior. Sinal de alta confiabilidade.',
      triggerPrice: cHigh, triggerCond:'fechamento acima de' });
  }

  if (cUpperWick > cRange * 0.62 && cLow < c.high - cRange * 0.6) {
    patterns.push({ name:'Pinbar Baixista ↓', type:'negative', score:-12,
      desc:'Rejeição forte de preços altos — cauda longa superior. Pressão vendedora dominante.',
      triggerPrice: cLow, triggerCond:'fechamento abaixo de' });
  }

  if (cBull && pBear && c.open <= p.close && c.close >= p.open && cBody > pBody * 0.9) {
    patterns.push({ name:'Engolfo Altista ↑', type:'positive', score:+15,
      desc:'Compradores engolfaram completamente os vendedores. Alta confiabilidade de reversão.',
      triggerPrice: null });
  }

  if (cBear && pBull && c.open >= p.close && c.close <= p.open && cBody > pBody * 0.9) {
    patterns.push({ name:'Engolfo Baixista ↓', type:'negative', score:-15,
      desc:'Vendedores engolfaram completamente os compradores. Alta confiabilidade de reversão.',
      triggerPrice: null });
  }

  if (ppBear && ppBody > 0 && pBody < ppBody * 0.35 && cBull && cBody > ppBody * 0.5 &&
      c.close > (pp.open + pp.close) / 2) {
    patterns.push({ name:'Estrela da Manhã ↑', type:'positive', score:+18,
      desc:'Reversão altista de 3 velas. Um dos padrões mais confiáveis após tendência de queda.',
      triggerPrice: null });
  }

  if (ppBull && ppBody > 0 && pBody < ppBody * 0.35 && cBear && cBody > ppBody * 0.5 &&
      c.close < (pp.open + pp.close) / 2) {
    patterns.push({ name:'Estrela da Tarde ↓', type:'negative', score:-18,
      desc:'Reversão baixista de 3 velas. Sinal muito confiável após tendência de alta.',
      triggerPrice: null });
  }

  if (pBear && cBull && c.open > p.close && c.close < p.open && cBody < pBody * 0.5) {
    patterns.push({ name:'Harami Altista ↑', type:'positive', score:+8,
      desc:'Momentum baixista desacelerando. Aguardar confirmação na próxima sessão.',
      triggerPrice: c.high, triggerCond:'fechamento acima de' });
  }

  if (pBull && cBear && c.open < p.close && c.close > p.open && cBody < pBody * 0.5) {
    patterns.push({ name:'Harami Baixista ↓', type:'negative', score:-8,
      desc:'Momentum altista desacelerando. Aguardar confirmação para short.',
      triggerPrice: c.low, triggerCond:'fechamento abaixo de' });
  }

  const strong = patterns.filter(x => Math.abs(x.score) >= 15);
  if (strong.length > 0) {
    const dirs = strong.map(x => x.score > 0 ? 'bull' : 'bear');
    return strong.concat(patterns.filter(x =>
      Math.abs(x.score) < 15 &&
      !dirs.includes(x.score > 0 ? 'bull' : 'bear')
    ));
  }
  return patterns;
}

function detectDivergences(candles, rsiArr, macdHist) {
  const divergences = [];
  const n = candles.length;
  const lb = Math.min(35, n - 3);

  const priceLows  = [];
  const priceHighs = [];
  for (let i = n - lb; i < n - 2; i++) {
    if (i < 1) continue;
    if (candles[i].low  < candles[i-1].low  && candles[i].low  < candles[i+1].low) {
      if (rsiArr[i] !== null) priceLows.push({ i, price: candles[i].low, rsi: rsiArr[i] });
    }
    if (candles[i].high > candles[i-1].high && candles[i].high > candles[i+1].high) {
      if (rsiArr[i] !== null) priceHighs.push({ i, price: candles[i].high, rsi: rsiArr[i] });
    }
  }

  if (priceLows.length >= 2) {
    const prev = priceLows[priceLows.length - 2];
    const curr = priceLows[priceLows.length - 1];
    const priceDiff = (curr.price - prev.price) / prev.price;
    const rsiDiff   = curr.rsi - prev.rsi;
    if (priceDiff < -0.005 && rsiDiff > 3) {
      divergences.push({ type:'bullish', indicator:'RSI', score:+20,
        name:'Divergência Altista RSI',
        desc:`Preço fez mínima mais baixa, RSI não confirmou (+${rsiDiff.toFixed(1)} pontos). Exaustão vendedora — reversão provável.` });
    }
  }

  if (priceHighs.length >= 2) {
    const prev = priceHighs[priceHighs.length - 2];
    const curr = priceHighs[priceHighs.length - 1];
    const priceDiff = (curr.price - prev.price) / prev.price;
    const rsiDiff   = curr.rsi - prev.rsi;
    if (priceDiff > 0.005 && rsiDiff < -3) {
      divergences.push({ type:'bearish', indicator:'RSI', score:-20,
        name:'Divergência Baixista RSI',
        desc:`Preço fez máxima mais alta, RSI não confirmou (${rsiDiff.toFixed(1)} pontos). Momentum comprador se esgotando.` });
    }
  }

  if (macdHist && macdHist.length >= 10) {
    const mh = macdHist;
    const mLen = mh.length;
    let mLows = [], mHighs = [];
    for (let i = mLen - 15; i < mLen - 1; i++) {
      if (i < 1) continue;
      if (mh[i] < mh[i-1] && mh[i] < mh[i+1] && mh[i] < 0)  mLows.push({ i, v: mh[i] });
      if (mh[i] > mh[i-1] && mh[i] > mh[i+1] && mh[i] > 0) mHighs.push({ i, v: mh[i] });
    }
    if (mLows.length >= 2) {
      const [prev, curr] = mLows.slice(-2);
      const histDiff = curr.v - prev.v;
      const pIdx1 = n - mLen + prev.i;
      const pIdx2 = n - mLen + curr.i;
      if (pIdx1 >= 0 && pIdx2 >= 0 && candles[pIdx2].low < candles[pIdx1].low && histDiff > 0) {
        divergences.push({ type:'bullish', indicator:'MACD', score:+15,
          name:'Divergência Altista MACD',
          desc:'Histograma MACD formando fundo mais alto enquanto preço ainda cai. Reversão se aproximando.' });
      }
    }
    if (mHighs.length >= 2) {
      const [prev, curr] = mHighs.slice(-2);
      const histDiff = curr.v - prev.v;
      const pIdx1 = n - mLen + prev.i;
      const pIdx2 = n - mLen + curr.i;
      if (pIdx1 >= 0 && pIdx2 >= 0 && candles[pIdx2].high > candles[pIdx1].high && histDiff < 0) {
        divergences.push({ type:'bearish', indicator:'MACD', score:-15,
          name:'Divergência Baixista MACD',
          desc:'Histograma MACD formando topo mais baixo enquanto preço ainda sobe. Enfraquecimento do rally.' });
      }
    }
  }

  return divergences;
}

function detectEMACross(closes) {
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  if (ema50.length < 6 || ema200.length < 6) return null;
  const n50 = ema50.length, n200 = ema200.length;
  const cur50 = ema50[n50 - 1], cur200 = ema200[n200 - 1];
  const prv50 = ema50[n50 - 6], prv200 = ema200[n200 - 6];
  if (cur50 == null || cur200 == null || prv50 == null || prv200 == null) return null;
  if (prv50 <= prv200 && cur50 > cur200)
    return { type: 'golden', score: +25,
      name: 'Cruz Dourada ✦',
      desc: 'EMA 50 cruzou acima da EMA 200 recentemente — sinal clássico de tendência altista de longo prazo.' };
  if (prv50 >= prv200 && cur50 < cur200)
    return { type: 'death', score: -25,
      name: 'Cruz da Morte ✦',
      desc: 'EMA 50 cruzou abaixo da EMA 200 recentemente — sinal clássico de tendência baixista de longo prazo.' };
  if (cur50 > cur200)
    return { type: 'above', score: +8,
      name: 'EMA50 acima da EMA200',
      desc: 'Tendência estrutural altista: EMA 50 sustentada acima da EMA 200.' };
  return { type: 'below', score: -8,
    name: 'EMA50 abaixo da EMA200',
    desc: 'Tendência estrutural baixista: EMA 50 abaixo da EMA 200.' };
}

function detectMarketStructure(candles, lookback = 60) {
  const levels = findLevels(candles, lookback);
  const swingHighs = levels.filter(l => l.type === 'resistance').map(l => l.price);
  const swingLows  = levels.filter(l => l.type === 'support').map(l => l.price);

  if (swingHighs.length < 3 || swingLows.length < 3) return null;

  const highs = swingHighs.slice(-3);
  const lows  = swingLows.slice(-3);

  let upH = 0, downH = 0, upL = 0, downL = 0;
  for (let i = 1; i < highs.length; i++) { if (highs[i] > highs[i-1]) upH++; else downH++; }
  for (let i = 1; i < lows.length;  i++) { if (lows[i]  > lows[i-1])  upL++; else downL++; }

  const isUptrend   = upH >= 2 && upL >= 2;
  const isDowntrend = downH >= 2 && downL >= 2;

  if (isUptrend)
    return { type: 'uptrend', score: +12,
      name: 'Estrutura de Alta (HH/HL)',
      desc: 'Mercado formando topos e fundos ascendentes — tendência de alta confirmada pela estrutura.' };
  if (isDowntrend)
    return { type: 'downtrend', score: -12,
      name: 'Estrutura de Baixa (LH/LL)',
      desc: 'Mercado formando topos e fundos descendentes — tendência de baixa confirmada pela estrutura.' };
  return { type: 'ranging', score: 0,
    name: 'Estrutura Lateral (ranging)',
    desc: 'Sem tendência clara na estrutura de mercado — topos e fundos mistos.' };
}

function detectTriangle(candles, lookback = 80) {
  const n = candles.length;
  const slice = candles.slice(-lookback);

  const highs = [], lows = [];
  for (let i = 2; i < slice.length - 2; i++) {
    if (slice[i].high > slice[i-1].high && slice[i].high > slice[i-2].high &&
        slice[i].high > slice[i+1].high && slice[i].high > slice[i+2].high)
      highs.push({ i, price: slice[i].high });
    if (slice[i].low < slice[i-1].low && slice[i].low < slice[i-2].low &&
        slice[i].low < slice[i+1].low && slice[i].low < slice[i+2].low)
      lows.push({ i, price: slice[i].low });
  }

  if (highs.length < 3 || lows.length < 3) return null;

  const slope = pts => {
    const xs = pts.map(p => p.i);
    const ys = pts.map(p => p.price);
    const mx = xs.reduce((a,b)=>a+b,0)/xs.length;
    const my = ys.reduce((a,b)=>a+b,0)/ys.length;
    const num = xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0);
    const den = xs.reduce((s,x)=>s+(x-mx)**2,0);
    return den === 0 ? 0 : num / den;
  };

  const hSlope = slope(highs.slice(-3));
  const lSlope = slope(lows.slice(-3));
  const lastClose = candles[n-1].close;
  const midLevel  = (highs[highs.length-1].price + lows[lows.length-1].price) / 2;
  const flatThreshold = Math.abs(highs[highs.length-1].price) * 0.0003;

  if (Math.abs(hSlope) < flatThreshold && lSlope > flatThreshold)
    return { type: 'ascending', score: +18,
      name: 'Triângulo Ascendente ▲',
      desc: 'Resistência plana com suporte crescente — compressão bullish. Rompimento provável para cima.' };

  if (hSlope < -flatThreshold && Math.abs(lSlope) < flatThreshold)
    return { type: 'descending', score: -18,
      name: 'Triângulo Descendente ▽',
      desc: 'Suporte plano com resistência decrescente — compressão bearish. Rompimento provável para baixo.' };

  if (hSlope < -flatThreshold && lSlope > flatThreshold) {
    const dir = lastClose > midLevel ? 'up' : 'down';
    return { type: 'symmetrical', score: dir === 'up' ? +15 : -15,
      name: dir === 'up' ? 'Triângulo Simétrico ↑' : 'Triângulo Simétrico ↓',
      desc: `Triângulo simétrico em compressão. Preço ${dir==='up'?'acima':'abaixo'} do ponto médio — rompimento provável ${dir==='up'?'para cima':'para baixo'}.` };
  }

  return null;
}

function detectDoubleTopBottom(candles, lookback = 100) {
  const n = candles.length;
  const slice = candles.slice(-lookback);
  const sliceLen = slice.length;

  const swingHighs = [], swingLows = [];
  for (let i = 2; i < sliceLen - 2; i++) {
    if (slice[i].high > slice[i-1].high && slice[i].high > slice[i-2].high &&
        slice[i].high > slice[i+1].high && slice[i].high > slice[i+2].high)
      swingHighs.push({ i, price: slice[i].high });
    if (slice[i].low < slice[i-1].low && slice[i].low < slice[i-2].low &&
        slice[i].low < slice[i+1].low && slice[i].low < slice[i+2].low)
      swingLows.push({ i, price: slice[i].low });
  }

  const lastClose = candles[n-1].close;
  const tol = 0.015;
  const minSep = 10;

  if (swingHighs.length >= 2) {
    const h1 = swingHighs[swingHighs.length - 2];
    const h2 = swingHighs[swingHighs.length - 1];
    const sep = h2.i - h1.i;
    const diff = Math.abs(h1.price - h2.price) / h1.price;
    let neckline = Infinity;
    for (let i = h1.i; i <= h2.i; i++) neckline = Math.min(neckline, slice[i].low);
    if (sep >= minSep && diff <= tol && lastClose < neckline * 1.005) {
      return { type: 'doubleTop', score: -18,
        name: 'Topo Duplo ▽▽',
        desc: `Dois topos similares (~${(diff*100).toFixed(1)}% diferença) com preço rompendo abaixo do suporte intermediário — reversão de baixa.` };
    }
  }

  if (swingLows.length >= 2) {
    const l1 = swingLows[swingLows.length - 2];
    const l2 = swingLows[swingLows.length - 1];
    const sep = l2.i - l1.i;
    const diff = Math.abs(l1.price - l2.price) / l1.price;
    let neckline = -Infinity;
    for (let i = l1.i; i <= l2.i; i++) neckline = Math.max(neckline, slice[i].high);
    if (sep >= minSep && diff <= tol && lastClose > neckline * 0.995) {
      return { type: 'doubleBottom', score: +18,
        name: 'Fundo Duplo △△',
        desc: `Dois fundos similares (~${(diff*100).toFixed(1)}% diferença) com preço rompendo acima da resistência intermediária — reversão de alta.` };
    }
  }

  return null;
}

// ─────────────────────────────────────────
// RISK / REWARD CALCULATIONS
// ─────────────────────────────────────────
function calcLiqPrice(entry, dir, lev) {
  if (dir === 'buy')  return entry * (1 - 1/lev + BYBIT_MMR);
  else                return entry * (1 + 1/lev - BYBIT_MMR);
}

function capReturn(entry, target, dir, lev) {
  const safeLev = Math.max(1, parseFloat(lev) || 1);
  const priceMoveAbs = Math.abs(target - entry) / entry;
  const gross  = priceMoveAbs * safeLev;
  const feeCap = ROUND_TRIP_FEE * safeLev;
  const net    = gross - feeCap;
  return {
    pricePct:  (priceMoveAbs * 100).toFixed(2),
    grossPct:  (gross  * 100).toFixed(1),
    feePct:    (feeCap * 100).toFixed(2),
    netPct:    (net    * 100).toFixed(1),
    isProfit:  net > 0,
  };
}

function getFibSet(rrMode) {
  if (rrMode === 'max') return FIB_MAX;
  if (rrMode === '3')   return FIB_FIXED3;
  if (rrMode === '2')   return FIB_FIXED2;
  return FIB_NORMAL;
}

function calcMetas(dir, entry, stop, rrMode = 'fib') {
  const risk = Math.abs(entry - stop);
  const fibs = getFibSet(rrMode);
  if (dir === 'buy')  return { m1: entry + risk*fibs.m1, m2: entry + risk*fibs.m2, m3: entry + risk*fibs.m3 };
  else                return { m1: entry - risk*fibs.m1, m2: entry - risk*fibs.m2, m3: entry - risk*fibs.m3 };
}

// ─────────────────────────────────────────
// JOURNAL HELPERS (pure, localStorage-agnostic)
// ─────────────────────────────────────────

/**
 * Build a journal entry object from a setup (no DOM, no localStorage).
 * Returns the entry object; caller is responsible for persisting it.
 */
function buildJournalEntry(d, rrMode = 'fib', leverage = 10) {
  if (!d) return null;
  const fp = p => p >= 1000 ? p.toFixed(0) : p >= 1 ? p.toFixed(3) : p.toFixed(5);
  const sign = d.dir === 'buy' ? '+' : '-';
  const lev = d.leverage || leverage;
  const signals = (d.reasons || [])
    .filter(r => r.type !== 'neutral' || r.isMTF)
    .map(r => ({ text: r.text, type: r.type, isMTF: !!r.isMTF, isPat: !!r.isPattern, isDiv: !!r.isDivergence }));

  return {
    id:        Date.now(),
    savedAt:   new Date().toISOString(),
    coin:      d.coin,
    dir:       d.dir,
    timeframe: d.timeframe,
    leverage:  lev,
    entry:     fp(d.entry),
    stop:      fp(d.stop),
    stopPct:   d.stopPct,
    liqPrice:  d.liqPrice ? fp(d.liqPrice) : '—',
    stopAdj:   d.stopAdjusted || false,
    m1p:       fp(d.m1.price), m1cap: sign + d.m1.cap.netPct,
    m2p:       fp(d.m2.price), m2cap: sign + d.m2.cap.netPct,
    m3p:       fp(d.m3.price), m3cap: sign + d.m3.cap.netPct,
    score:     d.score,
    signals,
    notes:     '',
    result:    'active',
  };
}

/**
 * Check if an entry is a duplicate of an existing one.
 */
function isDuplicateEntry(entries, d) {
  return entries.some(e =>
    e.coin === d.coin &&
    e.timeframe === d.timeframe &&
    Math.abs(parseFloat(e.entry) - d.entry) < 0.001
  );
}

/**
 * Compute journal statistics from a list of entries.
 */
function computeJournalStats(entries) {
  const longs  = entries.filter(e => e.dir === 'buy').length;
  const shorts = entries.filter(e => e.dir === 'sell').length;
  const withResult = entries.filter(e => e.result && e.result !== 'active');
  const wins   = withResult.filter(e => ['m1','m2','m3'].includes(e.result));
  const losses = withResult.filter(e => e.result === 'stop');
  const winRate = withResult.length > 0 ? Math.round(wins.length / withResult.length * 100) : null;

  let avgReturn = null;
  if (wins.length > 0) {
    const total = wins.reduce((sum, e) => {
      const cap = e.result === 'm1' ? parseFloat(e.m1cap) :
                  e.result === 'm2' ? parseFloat(e.m2cap) :
                  parseFloat(e.m3cap);
      return sum + (isNaN(cap) ? 0 : Math.abs(cap));
    }, 0);
    avgReturn = (total / wins.length).toFixed(1);
  }

  return { total: entries.length, longs, shorts, withResult: withResult.length, wins: wins.length, losses: losses.length, winRate, avgReturn };
}

// ─────────────────────────────────────────
// API LAYER (pure, no DOM)
// ─────────────────────────────────────────
const CORS_PROXIES = [
  u => u,
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
];
const TF_MAP = { '5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1D':'D' };

async function fetchJSON(url, timeoutMs = 10000, externalSignal = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) { clearTimeout(timer); throw new DOMException('Scan cancelado', 'AbortError'); }
    externalSignal.addEventListener('abort', onExternalAbort);
  }
  try {
    const r = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch(e) {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    throw e;
  }
}

async function fetchWithFallback(url, signal = null) {
  let lastErr = null;
  for (const makeUrl of CORS_PROXIES) {
    if (signal?.aborted) throw new DOMException('Scan cancelado', 'AbortError');
    const target = makeUrl(url);
    try {
      const data = await fetchJSON(target, 10000, signal);
      return data;
    } catch(e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error('Todos os métodos falharam: ' + url);
}

async function fetchCandles(symbol, tf, signal = null) {
  const sym = symbol.replace(/USDT$/i, '');
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}USDT&interval=${TF_MAP[tf]}&limit=400`;
  const j = await fetchWithFallback(url, signal);
  if (!j || j.retCode !== 0 || !j.result?.list?.length) return null;
  return j.result.list.reverse().map(c => ({
    time: parseInt(c[0]), open: parseFloat(c[1]),
    high: parseFloat(c[2]), low: parseFloat(c[3]),
    close: parseFloat(c[4]), volume: parseFloat(c[5]),
  }));
}

// ─────────────────────────────────────────
// ANALYSIS ENGINE
// ─────────────────────────────────────────

function _calcTechIndicators(candles, closes) {
  const last     = candles[candles.length-1];
  const price    = last.close;

  const rsiArr   = calcRSI(closes);
  const rsi      = rsiArr[rsiArr.length-1];
  const e9       = calcEMA(closes,9);
  const e21      = calcEMA(closes,21);
  const e200     = calcEMA(closes,200);
  const ema9     = e9[e9.length-1];
  const ema21    = e21[e21.length-1];
  const ema200   = e200[e200.length-1];

  const {macdLine, signal: macdSignal, hist} = calcMACD(closes);
  const macdNow  = macdLine[macdLine.length-1];
  const macdPrev = macdLine[macdLine.length-2];
  const sigNow   = macdSignal[macdSignal.length-1];
  const sigPrev  = macdSignal[macdSignal.length-2];
  const histNow  = hist[hist.length-1];
  const histPrev = hist[hist.length-2];

  const bbs      = calcBollinger(closes);
  const bb       = bbs[bbs.length-1];
  const atrs     = calcATR(candles);
  const atr      = atrs[atrs.length-1];
  const volAvg   = avgVol(candles);
  const volRatio = last.volume / volAvg;
  const levels   = findLevels(candles);

  const vwap      = calcVWAP(candles);
  const obvTrend  = calcOBVTrend(candles);
  const stochRSI  = calcStochRSI(rsiArr);
  const patterns    = detectCandlePatterns(candles);
  const divergences = detectDivergences(candles, rsiArr, hist);
  const adx         = calcADX(candles);
  const emaCross    = detectEMACross(closes);
  const mktStruct   = detectMarketStructure(candles);
  const triangle    = detectTriangle(candles);
  const dblPattern  = detectDoubleTopBottom(candles);

  return { price, rsiArr, rsi, ema9, ema21, ema200,
    macdNow, macdPrev, sigNow, sigPrev, histNow, histPrev,
    bb, atr, volRatio, levels, vwap, obvTrend, stochRSI,
    patterns, divergences, adx, emaCross, mktStruct, triangle, dblPattern };
}

function _computeScore(price, ind, fg, fundingRate = null, openInterest = null) {
  const { rsi, stochRSI, macdNow, macdPrev, sigNow, sigPrev, histNow, histPrev,
    ema9, ema21, ema200, bb, vwap, obvTrend, volRatio, patterns, divergences, adx,
    emaCross, mktStruct, triangle, dblPattern } = ind;

  let score = 0;
  const reasons = [], indicators = [];

  if (rsi !== null) {
    if      (rsi < 30) { score += 20; reasons.push({text:`RSI ${rsi.toFixed(1)} — Sobrevendido`,type:'positive'}); }
    else if (rsi < 40) { score += 10; reasons.push({text:`RSI ${rsi.toFixed(1)} — Zona de compra`,type:'positive'}); }
    else if (rsi > 70) { score -= 20; reasons.push({text:`RSI ${rsi.toFixed(1)} — Sobrecomprado`,type:'negative'}); }
    else if (rsi > 60) { score -= 10; reasons.push({text:`RSI ${rsi.toFixed(1)} — Zona de venda`,type:'negative'}); }
    else               { reasons.push({text:`RSI ${rsi.toFixed(1)} — Neutro`,type:'neutral'}); }
    indicators.push({name:'RSI (14)',reading:rsi.toFixed(1),color:rsi<35?'var(--accent)':rsi>65?'var(--danger)':'var(--warn)'});
  }

  if (stochRSI !== null) {
    if      (stochRSI < 20) { score += 8;  reasons.push({text:`StochRSI ${stochRSI.toFixed(0)} — Sobrevendido`,type:'positive'}); }
    else if (stochRSI > 80) { score -= 8;  reasons.push({text:`StochRSI ${stochRSI.toFixed(0)} — Sobrecomprado`,type:'negative'}); }
    indicators.push({name:'Stochastic RSI',reading:stochRSI.toFixed(1),color:stochRSI<20?'var(--accent)':stochRSI>80?'var(--danger)':'var(--muted)'});
  }

  const mxUp   = macdNow > sigNow && macdPrev <= sigPrev;
  const mxDown = macdNow < sigNow && macdPrev >= sigPrev;
  const mAbove = macdNow > sigNow;
  if      (mxUp)   { score += 20; reasons.push({text:'MACD Cruzamento ↑',type:'positive'}); }
  else if (mxDown) { score -= 20; reasons.push({text:'MACD Cruzamento ↓',type:'negative'}); }
  else if (mAbove) { score += 7;  reasons.push({text:'MACD acima da signal',type:'positive'}); }
  else             { score -= 7;  reasons.push({text:'MACD abaixo da signal',type:'negative'}); }
  if (histNow > histPrev && histNow > 0) score += 4;
  if (histNow < histPrev && histNow < 0) score -= 4;
  indicators.push({name:'MACD',reading:mxUp?'Cruzamento altista ✓':mxDown?'Cruzamento baixista ✓':mAbove?'Acima da signal':'Abaixo da signal',color:mxUp||mAbove?'var(--accent)':'var(--danger)'});

  if (ema9 != null && ema21 != null && ema200 != null) {
    if      (price > ema9 && ema9 > ema21 && ema21 > ema200) { score += 16; reasons.push({text:'EMAs alinhadas ↑',type:'positive'}); }
    else if (price < ema9 && ema9 < ema21 && ema21 < ema200) { score -= 16; reasons.push({text:'EMAs alinhadas ↓',type:'negative'}); }
    else if (price > ema200) { score += 7; reasons.push({text:'Acima da EMA200',type:'positive'}); }
    else                     { score -= 7; reasons.push({text:'Abaixo da EMA200',type:'negative'}); }
    indicators.push({name:'EMA 9 / 21 / 200',reading:`${ema9.toFixed(2)} / ${ema21.toFixed(2)} / ${ema200.toFixed(2)}`,color:price>ema200?'var(--accent)':'var(--danger)'});
  } else if (ema9 != null && ema21 != null) {
    if (price > ema9 && ema9 > ema21) { score += 10; reasons.push({text:'EMA9 > EMA21 ↑',type:'positive'}); }
    else if (price < ema9 && ema9 < ema21) { score -= 10; reasons.push({text:'EMA9 < EMA21 ↓',type:'negative'}); }
    indicators.push({name:'EMA 9 / 21',reading:`${ema9.toFixed(2)} / ${ema21.toFixed(2)}`,color:price>ema21?'var(--accent)':'var(--danger)'});
  }

  if (bb) {
    if      (price <= bb.lower) { score += 10; reasons.push({text:'Bollinger — Banda inferior',type:'positive'}); }
    else if (price >= bb.upper) { score -= 10; reasons.push({text:'Bollinger — Banda superior',type:'negative'}); }
    indicators.push({name:'Bollinger Bands',reading:`L:${bb.lower.toFixed(2)} M:${bb.mid.toFixed(2)} H:${bb.upper.toFixed(2)}`,color:price<=bb.lower?'var(--accent)':price>=bb.upper?'var(--danger)':'var(--muted)'});
  }

  if (vwap) {
    if      (price > vwap * 1.002) { score += 7; reasons.push({text:'Acima do VWAP',type:'positive'}); }
    else if (price < vwap * 0.998) { score -= 7; reasons.push({text:'Abaixo do VWAP',type:'negative'}); }
    indicators.push({name:'VWAP',reading:'$'+vwap.toFixed(vwap>=1?2:4),color:price>vwap?'var(--accent)':'var(--danger)'});
  }

  if (obvTrend === 'rising')  { score += 6; reasons.push({text:'OBV em ascensão (acumulação)',type:'positive'}); }
  if (obvTrend === 'falling') { score -= 6; reasons.push({text:'OBV em queda (distribuição)',type:'negative'}); }
  indicators.push({name:'OBV (tendência)',reading:obvTrend==='rising'?'Acumulação ↑':obvTrend==='falling'?'Distribuição ↓':'Neutro',color:obvTrend==='rising'?'var(--accent)':obvTrend==='falling'?'var(--danger)':'var(--muted)'});

  const vp = ((volRatio-1)*100).toFixed(0);
  if (volRatio > 1.5) { score += (score>0?7:-7); reasons.push({text:`Volume +${vp}% acima da média`,type:score>0?'positive':'negative'}); }
  indicators.push({name:'Volume (20p média)',reading:`${vp>0?'+':''}${vp}% vs. média`,color:volRatio>1.3?'var(--accent)':'var(--muted)'});
  indicators.push({name:'ATR (14)',reading:ind.atr>1?ind.atr.toFixed(2):ind.atr.toFixed(4),color:'var(--muted)'});

  if (adx !== null) {
    if      (adx > 25) { score += (score>=0?8:-8); reasons.push({text:`ADX ${adx.toFixed(1)} — Tendência forte`,type:score>=0?'positive':'negative'}); }
    else if (adx < 20) { score -= 5; reasons.push({text:`ADX ${adx.toFixed(1)} — Mercado lateral`,type:'negative'}); }
    const adxColor = adx > 25 ? 'var(--accent)' : adx < 20 ? 'var(--danger)' : 'var(--warn)';
    indicators.push({name:'ADX (14)',reading:`${adx.toFixed(1)} — ${adx>25?'Tendência forte':adx<20?'Mercado lateral':'Tendência moderada'}`,color:adxColor});
  }

  // Funding Rate
  if (fundingRate !== null) {
    const frPct = (fundingRate * 100).toFixed(4);
    if (fundingRate <= -0.0005) {
      score += 12;
      reasons.push({ text: `Funding ${frPct}% — Shorts sobrecarregados (pressao de alta)`, type: 'positive' });
    } else if (fundingRate <= -0.0001) {
      score += 6;
      reasons.push({ text: `Funding ${frPct}% — Leve pressao altista`, type: 'positive' });
    } else if (fundingRate >= 0.0005) {
      score -= 12;
      reasons.push({ text: `Funding ${frPct}% — Longs sobrecarregados (pressao de baixa)`, type: 'negative' });
    } else if (fundingRate >= 0.0001) {
      score -= 6;
      reasons.push({ text: `Funding ${frPct}% — Leve pressao baixista`, type: 'negative' });
    } else {
      reasons.push({ text: `Funding ${frPct}% — Neutro`, type: 'neutral' });
    }
    indicators.push({
      name: 'Funding Rate',
      reading: `${frPct}%`,
      color: fundingRate <= -0.0001 ? 'var(--accent)' : fundingRate >= 0.0001 ? 'var(--danger)' : 'var(--muted)'
    });
  }

  // Open Interest
  if (openInterest !== null) {
    const oiChg = openInterest.change24h;
    const oiStr = `${oiChg >= 0 ? '+' : ''}${oiChg.toFixed(1)}% (24h)`;
    if (oiChg > 5) {
      score += (score >= 0 ? 8 : -8);
      const tipo = score >= 0 ? 'Capital novo entrando (confirma long)' : 'Capital novo no short (confirma)';
      reasons.push({ text: `OI ${oiStr} — ${tipo}`, type: score >= 0 ? 'positive' : 'negative' });
    } else if (oiChg < -5) {
      score -= 6;
      reasons.push({ text: `OI ${oiStr} — Fechamento de posicoes, fraqueza`, type: 'negative' });
    } else {
      reasons.push({ text: `OI ${oiStr} — Estavel`, type: 'neutral' });
    }
    indicators.push({
      name: 'Open Interest (24h)',
      reading: oiStr,
      color: oiChg > 5 ? 'var(--accent)' : oiChg < -5 ? 'var(--danger)' : 'var(--muted)'
    });
  }

  if      (fg.value < 25) { score += 10; reasons.push({text:`F&G ${fg.value} — Medo Extremo`,type:'positive'}); }
  else if (fg.value > 75) { score -= 10; reasons.push({text:`F&G ${fg.value} — Ganância Extrema`,type:'negative'}); }
  else                    { reasons.push({text:`F&G ${fg.value} — ${fg.label}`,type:'neutral'}); }
  indicators.push({name:'Fear & Greed Index',reading:`${fg.value} — ${fg.label}`,color:fg.value<30?'var(--accent)':fg.value>70?'var(--danger)':'var(--warn)'});

  patterns.forEach(pat => {
    if (pat.score !== 0) {
      score += pat.score;
      reasons.push({text:pat.name, type: pat.score > 0 ? 'positive' : pat.score < 0 ? 'negative' : 'neutral', isPattern: true});
    }
  });

  divergences.forEach(div => {
    score += div.score;
    reasons.push({text:div.name, type: div.score > 0 ? 'positive' : 'negative', isDivergence: true});
  });

  if (emaCross && emaCross.score !== 0) {
    score += emaCross.score;
    reasons.push({text: emaCross.name, type: emaCross.score > 0 ? 'positive' : 'negative', isPattern: true});
    indicators.push({name:'EMA 50 / 200 Cross',reading:emaCross.name,color:emaCross.score>0?'var(--accent)':'var(--danger)'});
  }

  if (mktStruct && mktStruct.score !== 0) {
    score += mktStruct.score;
    reasons.push({text: mktStruct.name, type: mktStruct.score > 0 ? 'positive' : 'negative', isPattern: true});
  }

  if (triangle && triangle.score !== 0) {
    score += triangle.score;
    reasons.push({text: triangle.name, type: triangle.score > 0 ? 'positive' : 'negative', isPattern: true});
  }

  if (dblPattern && dblPattern.score !== 0) {
    score += dblPattern.score;
    reasons.push({text: dblPattern.name, type: dblPattern.score > 0 ? 'positive' : 'negative', isPattern: true});
  }

  return { score, reasons, indicators, mxUp, mxDown, mAbove, emaCross, mktStruct, triangle, dblPattern };
}

/**
 * Full analysis pipeline for one coin/timeframe.
 * @param {string} coin - coin symbol (e.g. 'BTC')
 * @param {string} tf - timeframe (e.g. '15m')
 * @param {Array} candles - OHLCV array
 * @param {{value:number, label:string}} fg - Fear & Greed index
 * @param {{score: string, leverage: number, rr: string}} options - state overrides
 */
function analyzeCandles(coin, tf, candles, fg, fundingRate = null, openInterest = null, options = { score: '0', leverage: 10, rr: 'fib' }) {
  if (!candles || candles.length < 50) return null;
  const closes = candles.map(c => c.close);

  const ind = _calcTechIndicators(candles, closes);
  const { price, rsi, ema200, atr, levels, vwap, obvTrend, stochRSI, patterns, divergences } = ind;

  if (ind.adx !== null && ind.adx < 18) return null;

  const safeFg = fg ?? { value: 50, label: 'Neutro' };
  const { score: rawScore, reasons, indicators, mxUp, mxDown, mAbove,
    emaCross, mktStruct, triangle, dblPattern } = _computeScore(price, ind, safeFg, fundingRate, openInterest);

  const dir       = rawScore >= 0 ? 'buy' : 'sell';
  const normScore = Math.min(100, Math.round(Math.abs(rawScore)));
  if (normScore < parseInt(options.score)) return null;

  const lev = options.leverage;

  const MIN_STOP_PCT = 0.015; // 1.5% minimum stop distance — avoids noise-level stops
  let entry, stop;
  if (dir === 'buy') {
    const sups = levels.filter(l=>l.type==='support'&&l.price<price).sort((a,b)=>b.price-a.price);
    entry = price;
    stop  = Math.min(sups.length ? sups[0].price : price-atr*1.5, price-atr*1.2);
    if ((price - stop) < price * MIN_STOP_PCT) stop = price - price * MIN_STOP_PCT;
  } else {
    const ress = levels.filter(l=>l.type==='resistance'&&l.price>price).sort((a,b)=>a.price-b.price);
    entry = price;
    stop  = Math.max(ress.length ? ress[0].price : price+atr*1.5, price+atr*1.2);
    if ((stop - price) < price * MIN_STOP_PCT) stop = price + price * MIN_STOP_PCT;
  }

  const liqPrice = calcLiqPrice(entry, dir, lev);
  const entryToLiqDist = Math.abs(entry - liqPrice);
  let stopAdjusted = false;
  if (dir === 'buy') {
    const minSafeStop = liqPrice + entryToLiqDist * 0.50;
    if (stop < minSafeStop) { stop = minSafeStop; stopAdjusted = true; }
  } else {
    const minSafeStop = liqPrice - entryToLiqDist * 0.50;
    if (stop > minSafeStop) { stop = minSafeStop; stopAdjusted = true; }
  }

  const {m1:m1p, m2:m2p, m3:m3p} = calcMetas(dir, entry, stop, options.rr);

  const fmtPct = v => { const n = parseFloat(v); return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; };

  const stopPctRaw = ((stop-entry)/entry*100);
  const capStop = capReturn(entry, stop,  dir, lev);
  const capM1   = capReturn(entry, m1p,   dir, lev);
  const capM2   = capReturn(entry, m2p,   dir, lev);
  const capM3   = capReturn(entry, m3p,   dir, lev);
  const feePctCap = (ROUND_TRIP_FEE * lev * 100).toFixed(2);

  let conditionalEntry = null;
  const triggerPatterns = patterns.filter(p => p.triggerPrice != null)
    .sort((a,b) => Math.abs(b.score) - Math.abs(a.score));
  if (triggerPatterns.length > 0) {
    const best = triggerPatterns[0];
    conditionalEntry = { patternName: best.name, triggerCond: best.triggerCond,
      triggerPrice: best.triggerPrice, score: best.score };
  }

  const rriWord = options.rr === 'fib' ? 'Fibonacci' : options.rr === 'max' ? 'Máximo' : `1:${options.rr} fixo`;
  const divSummary = divergences.length > 0 ? ` ${divergences.map(d=>d.name).join(' + ')}.` : '';
  const patSummary = patterns.filter(p=>p.score!==0).length > 0 ? ` Padrão: ${patterns.filter(p=>p.score!==0).map(p=>p.name).join(', ')}.` : '';
  const condSummary = conditionalEntry ? ` Aguardar ${conditionalEntry.triggerCond} $${conditionalEntry.triggerPrice.toFixed(conditionalEntry.triggerPrice>=1?2:4)} para confirmar.` : '';
  const emaInfo = ema200 != null ? `Preço ${price>ema200?'acima':'abaixo'} da EMA200.` : '';
  const summary = `${coin} setup ${dir==='buy'?'LONG':'SHORT'} no ${tf}. RSI ${rsi?.toFixed(1)??'N/A'}, MACD ${mxUp?'cruzamento altista':mxDown?'cruzamento baixista':mAbove?'acima':'abaixo'} da signal. ${emaInfo}${divSummary}${patSummary}${condSummary} Alvos ${rriWord}. Com ${lev}x: M3 = +${capM3.netPct}% no capital líquido.`;

  return {
    coin, pair:`${coin}/USDT`, dir,
    score: normScore, timeframe: tf, leverage: lev,
    entry, stop, liqPrice, stopAdjusted,
    stopPct: fmtPct(stopPctRaw),
    m1:{ price:m1p, pct:fmtPct((m1p-entry)/entry*100), cap:capM1 },
    m2:{ price:m2p, pct:fmtPct((m2p-entry)/entry*100), cap:capM2 },
    m3:{ price:m3p, pct:fmtPct((m3p-entry)/entry*100), cap:capM3 },
    capStop, feePctCap,
    reasons, indicators, summary,
    patterns, divergences, conditionalEntry,
    emaCross, mktStruct, triangle, dblPattern,
    vwap, obvTrend, stochRSI,
    candles,
    mtfConfluence: null,
    fundingRate,
    openInterest,
  };
}

// ─────────────────────────────────────────
// MTF CONFLUENCE / CONFLICT (pure helper extracted from runRealAnalysis)
// ─────────────────────────────────────────
const TF_ORDER = ['5m','15m','30m','1h','4h','1D'];

/**
 * Apply MTF confluence bonus, conflict penalty, deduplication, and sort.
 * Mutates the score and reasons on each setup, then deduplicates and sorts.
 * @param {Array} results - array of setup objects from analyzeCandles
 * @returns {Array} deduplicated and sorted results
 */
function applyMTFScoring(results) {
  // Group by coin
  const coinGroups = {};
  results.forEach(r => { if (!coinGroups[r.coin]) coinGroups[r.coin]=[]; coinGroups[r.coin].push(r); });

  Object.entries(coinGroups).forEach(([coin, setups]) => {
    const buySetups  = setups.filter(s => s.dir === 'buy');
    const sellSetups = setups.filter(s => s.dir === 'sell');

    // Confluence bonus for 2+ TFs in same direction
    if (buySetups.length >= 2) {
      const tfs = buySetups.map(s => s.timeframe);
      const bonus = Math.min(18, (buySetups.length - 1) * 6);
      buySetups.forEach(s => {
        s.score = Math.min(100, s.score + bonus);
        s.mtfConfluence = { dir:'buy', count:buySetups.length, tfs };
        if (!s.reasons.find(r=>r.text.includes('Confluência')))
          s.reasons.unshift({ text:`Confluência ${buySetups.length} TFs ↑ (${tfs.join('+')})`, type:'positive', isMTF:true });
      });
    }
    if (sellSetups.length >= 2) {
      const tfs = sellSetups.map(s => s.timeframe);
      const bonus = Math.min(18, (sellSetups.length - 1) * 6);
      sellSetups.forEach(s => {
        s.score = Math.min(100, s.score + bonus);
        s.mtfConfluence = { dir:'sell', count:sellSetups.length, tfs };
        if (!s.reasons.find(r=>r.text.includes('Confluência')))
          s.reasons.unshift({ text:`Confluência ${sellSetups.length} TFs ↓ (${tfs.join('+')})`, type:'negative', isMTF:true });
      });
    }

    // Conflict penalty: lower TF opposing highest TF
    if (setups.length >= 2) {
      const highestTF = setups.reduce((prev, curr) =>
        TF_ORDER.indexOf(curr.timeframe) > TF_ORDER.indexOf(prev.timeframe) ? curr : prev
      );
      setups.forEach(s => {
        const sIsLower = TF_ORDER.indexOf(s.timeframe) < TF_ORDER.indexOf(highestTF.timeframe);
        if (sIsLower && s.dir !== highestTF.dir) {
          s.score = Math.max(0, s.score - 20);
          if (!s.reasons.find(r => r.text.includes('Contra-tendência')))
            s.reasons.unshift({ text: `⚠ Contra-tendência ${highestTF.timeframe}`, type: 'negative' });
        }
      });
    }
  });

  // Deduplication: keep only best (highest score) setup per coin
  const bestByCoin = {};
  results.forEach(r => {
    if (!bestByCoin[r.coin] || r.score > bestByCoin[r.coin].score)
      bestByCoin[r.coin] = r;
  });
  const deduped = Object.values(bestByCoin);

  // Sort by M3 net return descending
  deduped.sort((a,b) => parseFloat(b.m3.cap.netPct) - parseFloat(a.m3.cap.netPct));
  return deduped;
}

// ─────────────────────────────────────────
// EXPORTS — ES module syntax for vitest
// In the browser this file is loaded as a plain <script> (no import/export).
// ─────────────────────────────────────────
export {
  // Constants
  BYBIT_TAKER, ROUND_TRIP_FEE, BYBIT_MMR,
  FIB_NORMAL, FIB_MAX, FIB_FIXED2, FIB_FIXED3,
  TIMEFRAMES_BY_MODE, JOURNAL_KEY,
  CORS_PROXIES, TF_MAP, TF_ORDER,
  // Indicators
  calcEMA, calcRSI, calcMACD, calcBollinger, calcATR, calcADX,
  avgVol, findLevels, calcVWAP, calcOBVTrend, calcStochRSI,
  // Patterns
  detectCandlePatterns, detectDivergences, detectEMACross,
  detectMarketStructure, detectTriangle, detectDoubleTopBottom,
  // Risk / Reward
  calcLiqPrice, capReturn, getFibSet, calcMetas,
  // Analysis engine
  _calcTechIndicators, _computeScore, analyzeCandles,
  // API layer
  fetchJSON, fetchWithFallback, fetchCandles,
  // MTF
  applyMTFScoring,
  // Journal helpers
  buildJournalEntry, isDuplicateEntry, computeJournalStats,
};
