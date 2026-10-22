(() => {
  'use strict';
  const STORAGE_KEY = 'my-iphone-16e-fund-v1';
  const REFERENCE_PRICE = 41900;
  const REFERENCE_DATE = '2026-10-22';
  const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const $ = (id) => document.getElementById(id);
  const format = (cents) => GBP.format(cents / 100);
  const moneyFromInput = (value, min = 0) => {
    const text = String(value).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const n = Math.round(Number(text) * 100);
    return Number.isSafeInteger(n) && n >= min && n <= 100000000 ? n : null;
  };
  const toInput = cents => (cents / 100).toFixed(2);
  const shortDate = (s) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  };
  const exactTime = (s) => {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '—';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return shortDate(s);
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(d);
  };
  const defaults = () => ({ startingCents: 11300, transactions: [], fallbackPriceCents: REFERENCE_PRICE, extraCents: 49, weeklyCents: 1500, alertBelowCents: 40000, manualHistory: [] });
  const isCents = n => Number.isSafeInteger(n) && n >= 0 && n <= 100000000;
  function validateState(candidate) {
    if (!candidate || typeof candidate !== 'object' || !isCents(candidate.startingCents)) return null;
    const copy = defaults();
    for (const prop of ['startingCents', 'fallbackPriceCents', 'extraCents', 'weeklyCents', 'alertBelowCents']) {
      if (isCents(candidate[prop])) copy[prop] = candidate[prop];
    }
    if (Array.isArray(candidate.transactions)) {
      copy.transactions = candidate.transactions.slice(-1000).filter(t => t && Number.isSafeInteger(t.amountCents) && Math.abs(t.amountCents) <= 100000000 && typeof t.at === 'string' && Number.isFinite(Date.parse(t.at))).map(t => ({ id: String(t.id || ''), amountCents: t.amountCents, at: t.at, note: String(t.note || '').slice(0,100) }));
    }
    if (Array.isArray(candidate.manualHistory)) {
      copy.manualHistory = candidate.manualHistory.slice(-250).filter(p => p && isCents(p.priceCents) && p.priceCents > 0 && Number.isFinite(Date.parse(p.at))).map(p => ({ priceCents:p.priceCents, at:p.at, source:'manual' }));
    }
    return copy;
  }
  function loadSaved() {
    try { const item = localStorage.getItem(STORAGE_KEY); return item ? (validateState(JSON.parse(item)) || defaults()) : defaults(); }
    catch { return defaults(); }
  }
  let savings = loadSaved();
  let observed = {status:'reference', price:419, checkedAt:REFERENCE_DATE, lastSuccessAt:null, history:[{price:419,at:REFERENCE_DATE,source:'reference'}], error:null};
  let chartRange = 'all';
  let transactionMode = 'add';
  let lastShownObservation = null;
  let toastTimer;
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(savings)); }
    catch { toast('Could not save on this device. Please export a backup.'); }
  }
  function toast(text) {
    $('toast').textContent = text;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200);
  }
  function balance() { return Math.max(0, savings.startingCents + savings.transactions.reduce((total, t) => total + t.amountCents, 0)); }
  function normaliseHistory(items) {
    return (Array.isArray(items) ? items : []).filter(item => item && Number.isFinite(Number(item.price)) && Number(item.price) > 0 && Number(item.price) < 1000000 && Number.isFinite(Date.parse(item.at || item.timestamp || '')))
      .map(item => ({ priceCents:Math.round(Number(item.price)*100), at:item.at || item.timestamp, source:item.source || 'automatic' }));
  }
  function history() {
    const remote = normaliseHistory(observed.history);
    const entries = remote.concat(savings.manualHistory);
    const seen = new Set();
    return entries.sort((a,b) => Date.parse(a.at) - Date.parse(b.at)).filter(p => {
      const k = `${p.at}|${p.priceCents}|${p.source}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }
  function activePrice() {
    const autoPrice = Number(observed.price);
    const verified = ['ok','error'].includes(observed.status) && Number.isFinite(autoPrice) && autoPrice > 0 && observed.lastSuccessAt;
    if (verified) return { cents:Math.round(autoPrice*100), kind:'automatic', at:observed.lastSuccessAt };
    const manual = savings.manualHistory[savings.manualHistory.length - 1];
    if (manual) return {cents:manual.priceCents, kind:'manual', at:manual.at};
    return {cents:savings.fallbackPriceCents,kind:savings.fallbackPriceCents === REFERENCE_PRICE ? 'reference' : 'manual-fallback',at:REFERENCE_DATE};
  }
  function drawSavings() {
    const price = activePrice();
    const goal = price.cents + savings.extraCents;
    const current = balance();
    const missing = Math.max(0,goal-current);
    const percent = goal > 0 ? Math.min(100,Math.round(current/goal*100)) : 100;
    $('savings-total').textContent = format(current);
    $('progress-percent').textContent = `${percent}%`;
    $('progress-circle').style.background = `conic-gradient(#1c3b33 ${360*percent/100}deg, #eaf0e4 ${360*percent/100}deg)`;
    $('progress-circle').setAttribute('aria-valuenow',String(percent));
    $('remaining-label').textContent = missing ? `${format(missing)} left to save` : 'Goal reached — you made it!';
    $('target-total').textContent = format(goal);
    $('fee-line').textContent = `${format(savings.extraCents)} estimated`;
    $('edit-start').textContent = `Edit starting ${format(savings.startingCents)}`;
    drawPrediction();
  }
  function drawPrediction() {
    const goal = activePrice().cents + savings.extraCents;
    const missing = Math.max(0,goal-balance());
    const weekly = savings.weeklyCents;
    const weeks = weekly > 0 ? Math.ceil(missing/weekly) : null;
    if (missing <= 0) {
      $('predicted-date').textContent = 'You made it! 🎉';
      $('predicted-weeks').textContent = 'Your savings currently cover your estimated target.';
    } else if (weeks === null) {
      $('predicted-date').textContent = 'Add a weekly amount';
      $('predicted-weeks').textContent = 'Set an amount above £0 to see an estimate.';
    } else if (weeks > 5200) {
      $('predicted-date').textContent = 'A long-term goal';
      $('predicted-weeks').textContent = `${weeks.toLocaleString('en-GB')} weeks at ${format(weekly)} per week.`;
    } else {
      const when = new Date();
      when.setDate(when.getDate()+weeks*7);
      $('predicted-date').textContent = new Intl.DateTimeFormat('en-GB', {month:'long',year:'numeric'}).format(when);
      $('predicted-weeks').textContent = `About ${weeks} ${weeks === 1 ? 'week' : 'weeks'} at ${format(weekly)} per week.`;
    }
  }
  function drawPrice() {
    const chosen = activePrice();
    $('current-price').textContent = format(chosen.cents);
    $('last-price-check').textContent = chosen.kind === 'automatic' ? exactTime(chosen.at) : chosen.kind === 'manual' ? `Your entry · ${exactTime(chosen.at)}` : '22 Oct 2026 (reference)';
    const badge = $('price-badge'); badge.classList.remove('warning');
    const header = $('header-status');
    let message;
    if (chosen.kind === 'automatic') {
      const elapsed = Date.now() - Date.parse(chosen.at);
      const stale = Number.isFinite(elapsed) && elapsed > 4 * 60 * 60 * 1000;
      const failed = observed.status === 'error';
      badge.textContent = failed ? 'Check interrupted' : stale ? 'Last verified price' : 'Automated check';
      badge.classList.toggle('warning',stale || failed);
      message = failed ? 'The latest attempt failed; showing the previous verified price.' : `Price automatically checked ${exactTime(chosen.at)}.`;
      header.lastChild.textContent = stale || failed ? ' Latest price may be out of date' : ' Automatic price monitoring';
    } else if (chosen.kind === 'manual' || chosen.kind === 'manual-fallback') {
      badge.textContent = 'Personal price'; badge.classList.add('warning');
      message = 'Price entered by you — not automatically confirmed.';
      header.lastChild.textContent = ' Manual reference price';
    } else {
      badge.textContent = '22 Oct reference'; badge.classList.add('warning');
      message = 'Reference price checked on 22 October 2026. Waiting for a successful automatic check.';
      header.lastChild.textContent = ' Waiting for first automatic check';
    }
    $('price-description').textContent = message;
    const trail = history().filter(p => p.source !== 'manual');
    const previousDistinct = [...trail].reverse().find(p => p.priceCents !== chosen.cents && p.at !== chosen.at);
    const diff = previousDistinct && chosen.kind === 'automatic' ? chosen.cents - previousDistinct.priceCents : null;
    const chip = $('price-change');
    if (diff !== null && diff !== 0) {
      chip.hidden = false; chip.classList.toggle('up',diff > 0);
      chip.textContent = `${diff < 0 ? '↓' : '↑'} ${format(Math.abs(diff))} ${diff < 0 ? 'down' : 'up'} since an earlier check`;
    } else chip.hidden = true;
    const disclaimer = $('price-disclaimer');
    disclaimer.textContent = observed.status === 'error' ? `Automatic check failed: ${String(observed.error || 'Back Market did not return a verified price').slice(0,130)}. Use Back Market to confirm before buying. The scheduled checker will retry. Price excludes additional checkout fees.` : 'Checks are scheduled approximately hourly after GitHub Pages is set up. GitHub schedules can be delayed. Price excludes additional delivery and checkout fees.';
    if (chosen.cents <= savings.alertBelowCents && chosen.kind === 'automatic') {
      badge.textContent = `At or below ${format(savings.alertBelowCents)} alert`;
      badge.classList.remove('warning');
      if (lastShownObservation !== null && chosen.at !== lastShownObservation) toast(`Price alert: your iPhone is now ${format(chosen.cents)}!`);
    }
    lastShownObservation = chosen.at;
  }
  function drawActivity() {
    const container = $('transaction-list'); container.replaceChildren();
    const rows = savings.transactions.slice().reverse().map(t => ({...t,isBase:false}));
    rows.push({amountCents:savings.startingCents,at:REFERENCE_DATE, note:'Your starting savings',isBase:true});
    for (const item of rows.slice(0,9)) {
      const row = document.createElement('div'); row.className = 'activity-item';
      const icon = document.createElement('span'); icon.className = 'activity-icon' + (item.amountCents < 0 ? ' out' : ''); icon.textContent = item.amountCents < 0 ? '−' : '+';
      const details = document.createElement('div'); details.className = 'activity-main';
      const title = document.createElement('div'); title.className='activity-title'; title.textContent = item.note || (item.amountCents < 0 ? 'Taken out' : 'Money saved');
      const when = document.createElement('div'); when.className='activity-date'; when.textContent = item.isBase ? 'Starting balance' : shortDate(item.at);
      details.append(title,when);
      const value = document.createElement('strong'); value.className = 'activity-amount' + (item.amountCents < 0 ? ' out' : ''); value.textContent = `${item.amountCents < 0 ? '−' : '+'}${format(Math.abs(item.amountCents))}`;
      row.append(icon,details,value);container.append(row);
    }
  }
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function makeSvg(name, attributes, text) {
    const element = document.createElementNS(SVG_NS,name);
    for (const [k,v] of Object.entries(attributes || {})) element.setAttribute(k,String(v));
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function drawChart() {
    const svg = $('price-chart'); svg.replaceChildren();
    const now = Date.now();
    let entries = history().filter(p => chartRange === 'all' || Date.parse(p.at) >= now - Number(chartRange)*86400000);
    const tooltip = $('chart-tooltip');tooltip.hidden = true;
    $('empty-chart').hidden = entries.length > 0;
    $('history-count').textContent = `${entries.length} ${entries.length === 1 ? 'recorded price' : 'recorded prices'}`;
    if (!entries.length) return;
    const left = 65, right = 778, top = 22, bottom = 204;
    const values = entries.map(p=>p.priceCents/100);
    let minimum = Math.min(...values), maximum = Math.max(...values);
    const padding = Math.max(8,(maximum-minimum)*.2);
    minimum = Math.max(0,minimum-padding); maximum += padding;
    const t0 = Math.min(...entries.map(p=>Date.parse(p.at)));
    const t1 = Math.max(...entries.map(p=>Date.parse(p.at)));
    const x = (p,i) => t1===t0 ? entries.length===1 ? (left+right)/2 : left+(right-left)*i/(entries.length-1) : left + (Date.parse(p.at)-t0)/(t1-t0)*(right-left);
    const y = v=>bottom-(v-minimum)/(maximum-minimum)*(bottom-top);
    for(let i=0;i<4;i++){
      const v=minimum+(maximum-minimum)*(3-i)/3, yy=y(v);
      svg.append(makeSvg('line',{x1:left,y1:yy,x2:right,y2:yy,stroke:'#e7eee4','stroke-dasharray':'4 5'}));
      svg.append(makeSvg('text',{x:0,y:yy+4,fill:'#8d988b','font-size':12,'font-family':'DM Sans, sans-serif'},format(Math.round(v*100))));
    }
    if(entries.length===1){
      const yy=y(values[0]);svg.append(makeSvg('line',{x1:left,y1:yy,x2:right,y2:yy,stroke:'#9bbd82','stroke-width':3,'stroke-dasharray':'6 6'}));
    }else{
      const points=entries.map((p,i)=>[x(p,i),y(p.priceCents/100)]);
      const polygon=[`${left},${bottom}`,...points.map(p=>p.join(',')),`${right},${bottom}`].join(' ');
      svg.append(makeSvg('polygon',{points:polygon,fill:'#e5f0d7',opacity:.74}));
      svg.append(makeSvg('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:'#548861','stroke-width':3.4,'stroke-linecap':'round','stroke-linejoin':'round'}));
    }
    entries.forEach((p,i)=>{
      const xx=x(p,i),yy=y(p.priceCents/100);
      if(entries.length > 100 && i%Math.ceil(entries.length/30)!==0 && i !== entries.length-1) return;
      const dot=makeSvg('circle',{cx:xx,cy:yy,r:5.3,fill:p.source==='manual'?'#d69366':'#548861',stroke:'#fff','stroke-width':2,tabindex:0,'aria-label':`${format(p.priceCents)} on ${shortDate(p.at)} (${p.source})`});
      const show=()=>{tooltip.textContent=`${format(p.priceCents)} · ${shortDate(p.at)}${p.source==='manual'?' (manual)':''}`;tooltip.hidden=false;const width=$('chart-wrap').clientWidth;tooltip.style.left=`${Math.min(Math.max(xx/800*width-55,0),width-145)}px`;tooltip.style.top=`${Math.max(0,yy/250*$('chart-wrap').clientHeight-35)}px`;};
      dot.addEventListener('mouseenter',show);dot.addEventListener('focus',show);dot.addEventListener('mouseleave',()=>tooltip.hidden=true);dot.addEventListener('blur',()=>tooltip.hidden=true);
      svg.append(dot);
    });
    const first=entries[0],last=entries[entries.length-1];
    svg.append(makeSvg('text',{x:left,y:233,fill:'#879689','font-size':13,'font-family':'DM Sans, sans-serif'},shortDate(first.at)));
    svg.append(makeSvg('text',{x:right,y:233,'text-anchor':'end',fill:'#879689','font-size':13,'font-family':'DM Sans, sans-serif'},shortDate(last.at)));
  }
  function render() {drawSavings();drawPrice();drawChart();drawActivity();}
  async function refreshPrice(manual=false) {
    const button=$('refresh-price');if(manual)button.disabled=true;
    try {
      const response=await fetch(`./data/price.json?t=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const result=await response.json();
      if(!['ok','error','reference','pending'].includes(result.status) || !Array.isArray(result.history)) throw new Error('Invalid price data');
      observed=result;render();
      if(manual)toast('Displayed price data refreshed. Live merchant checks run on the hourly schedule.');
    } catch(err) {
      if(manual)toast('Could not refresh the price file. Confirm on Back Market instead.');
      // The reference price remains visible rather than implying a new verification.
      console.info('Price data is not accessible in this preview:',err.message);
    } finally {if(manual)button.disabled=false;}
  }
  function openModal(id){const modal=$(id);if(!modal.open)modal.showModal();}
  function closeModal(el){el.closest('dialog')?.close();}
  function setMode(mode){transactionMode=mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));$('transaction-submit').textContent=mode==='add'?'Add to my savings':'Record withdrawal';}
  function openTransaction(mode){setMode(mode);$('transaction-form').reset();$('transaction-error').textContent='';openModal('transaction-dialog');$('transaction-amount').focus();}
  function settings(){
    $('manual-target').value=toInput(savings.fallbackPriceCents);
    $('extra-fees').value=toInput(savings.extraCents);
    $('alert-below').value=toInput(savings.alertBelowCents);
    $('starting-balance').value=toInput(savings.startingCents);
    $('settings-error').textContent='';openModal('settings-dialog');
  }
  function exportBackup() {
    const blob=new Blob([JSON.stringify({app:'iphone-16e-fund',version:1,exportedAt:new Date().toISOString(),savings},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='my-iphone-fund-backup.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('Your savings backup has been downloaded.');
  }
  $('open-add').addEventListener('click',()=>openTransaction('add'));
  $('open-remove').addEventListener('click',()=>openTransaction('remove'));
  $('add-activity').addEventListener('click',()=>openTransaction('add'));
  $('settings-button').addEventListener('click',settings);
  $('edit-start').addEventListener('click',settings);
  $('goal-edit').addEventListener('click',settings);
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b)));
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close();}));
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('transaction-form').addEventListener('submit', e=>{
    e.preventDefault();
    const amount=moneyFromInput($('transaction-amount').value,1);
    if(amount===null){$('transaction-error').textContent='Enter a valid amount, such as 10.50.';return;}
    if(transactionMode==='remove' && amount > balance()){$('transaction-error').textContent='You cannot take out more than your saved balance.';return;}
    const note=$('transaction-note').value.trim().slice(0,100);
    savings.transactions.push({id:`${Date.now()}-${savings.transactions.length}`,at:new Date().toISOString(),amountCents:transactionMode==='add'?amount:-amount,note:note || (transactionMode==='add'?'Added to my phone fund':'Taken out of my phone fund')});
    save();render();$('transaction-dialog').close();toast(transactionMode==='add'?`${format(amount)} added to your savings!`:`${format(amount)} recorded as taken out.`);
  });
  $('settings-form').addEventListener('submit',e=>{
    e.preventDefault();
    const fields=[['manual-target','fallbackPriceCents',1],['extra-fees','extraCents',0],['alert-below','alertBelowCents',0],['starting-balance','startingCents',0]];
    const updates={};
    for(const [id,key,min] of fields){const val=moneyFromInput($(id).value,min);if(val===null){$('settings-error').textContent='Please enter valid amounts, up to 2 decimal places.';return;}updates[key]=val;}
    const changed=updates.fallbackPriceCents!==savings.fallbackPriceCents;
    Object.assign(savings,updates);
    if(changed) savings.manualHistory.push({priceCents:updates.fallbackPriceCents,at:new Date().toISOString(),source:'manual'});
    save();render();$('settings-dialog').close();toast('Your tracker settings were saved.');
  });
  $('weekly-savings').value=toInput(savings.weeklyCents);
  $('weekly-savings').addEventListener('input',e=>{const amount=moneyFromInput(e.target.value || '0',0);if(amount!==null){savings.weeklyCents=amount;save();drawPrediction();}});
  document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{
    chartRange=button.dataset.range;
    document.querySelectorAll('[data-range]').forEach(b=>{const selected=b===button;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});drawChart();
  }));
  $('refresh-price').addEventListener('click',()=>refreshPrice(true));
  $('backup-button').addEventListener('click',exportBackup);
  $('download-backup').addEventListener('click',exportBackup);
  $('import-backup').addEventListener('click',()=>$('backup-file').click());
  $('backup-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{const backup=JSON.parse(await file.text());if(backup.app!=='iphone-16e-fund'||backup.version!==1)throw new Error('Wrong file type');const candidate=validateState(backup.savings);if(!candidate)throw new Error('Invalid savings data');if(!confirm('Replace the savings data on this device with your backup?'))return;savings=candidate;save();$('weekly-savings').value=toInput(savings.weeklyCents);render();$('settings-dialog').close();toast('Savings backup restored.');}
    catch{toast('That file is not a valid iPhone savings backup.');}
    finally{e.target.value='';}
  });
  $('reset-fund').addEventListener('click',()=>{
    if(!confirm('Reset savings and entries on this browser back to the initial £113? Export a backup first if needed.'))return;
    savings=defaults();save();$('weekly-savings').value=toInput(savings.weeklyCents);render();$('settings-dialog').close();toast('Tracker reset to £113.');
  });
  render();
  refreshPrice();
  setInterval(()=>{if(!document.hidden)refreshPrice();},5*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPrice();});
})();
