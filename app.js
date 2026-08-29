'use strict';
/* ============================================================================
   AURIX · User wallet application (vanilla JS)
   Custom (non-Supabase-Auth) session architecture · SIMULATOR ONLY
============================================================================ */

/* ========================== SUPABASE (anon key only) ====================== */
const SUPABASE_URL      = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_PUBLIC_KEY';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================================ CONSTANTS ================================ */
const COINS = {
  BTC : { name:'Bitcoin',  id:'bitcoin',    color:'#F7931A', decimals:8, fee:0.00021 },
  ETH : { name:'Ethereum', id:'ethereum',   color:'#627EEA', decimals:6, fee:0.0018  },
  USDT: { name:'Tether',   id:'tether',     color:'#26A17B', decimals:2, fee:1       },
  SOL : { name:'Solana',   id:'solana',     color:'#9945FF', decimals:4, fee:0.01    },
  XRP : { name:'XRP',      id:'ripple',     color:'#8A959E', decimals:4, fee:0.2     },
  DOGE: { name:'Dogecoin', id:'dogecoin',   color:'#C2A633', decimals:2, fee:1.5     },
  BNB : { name:'BNB',      id:'binancecoin',color:'#F0B90B', decimals:5, fee:0.0008  },
};
const COIN_SYMS   = Object.keys(COINS);
const SYM_BY_ID   = Object.fromEntries(COIN_SYMS.map(s => [COINS[s].id, s]));
const FALLBACK    = { BTC:8540000, ETH:282000, USDT:88, SOL:16200, XRP:182, DOGE:14, BNB:52000 };
const LS_SESSION='aurix_session', LS_THEME='aurix_theme', LS_WATCH='aurix_watchlist',
      LS_PREFS='aurix_prefs', LS_LOGINS='aurix_logins';

/* ================================= STATE =================================== */
const state = {
  user:null, wallet:null, txs:[], withdrawals:[], notifs:[],
  announcements:[], view:'home', range:'7D',
  marketFilter:'all', activityFilter:'all',
  sendCoin:'BTC', wdCoin:'BTC', wdMethod:'UPI', afMethod:'UPI',
  coinSheet:null, nfTarget:'all',
};
const Prices = { map:{}, lastSync:null };

/* ================================= UTILS =================================== */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const el = h => { const t=document.createElement('template'); t.innerHTML=h.trim(); return t.content.firstElementChild; };
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const icons = () => { if (window.lucide) lucide.createIcons(); };

function sha256(msg){                                 // compact pure-JS SHA-256 (hex)
  const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  if(!sha256.K){
    sha256.K=[]; sha256.H=[]; const ps=[]; let n=2;
    while(ps.length<64){ let ok=true; for(const p of ps){ if(p*p>n)break; if(n%p===0){ok=false;break;} } if(ok)ps.push(n); n++; }
    for(let i=0;i<64;i++) sha256.K[i]=Math.floor((Math.pow(ps[i],1/3)%1)*4294967296);
    for(let i=0;i<8;i++)  sha256.H[i]=Math.floor((Math.sqrt(ps[i])%1)*4294967296);
  }
  const H=sha256.H.slice(), K=sha256.K, b=[...new TextEncoder().encode(msg)], bl=b.length*8;
  b.push(0x80); while(b.length%64!==56) b.push(0);
  for(const v of [Math.floor(bl/4294967296), bl>>>0]) for(let s=28;s>=0;s-=8) b.push((v>>>s)&0xff);
  const w=new Array(64);
  for(let i=0;i<b.length;i+=64){
    for(let j=0;j<16;j++) w[j]=(b[i+4*j]<<24)|(b[i+4*j+1]<<16)|(b[i+4*j+2]<<8)|(b[i+4*j+3]);
    for(let j=16;j<64;j++){
      const s0=rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3), s1=rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10);
      w[j]=(w[j-16]+s0+w[j-7]+s1)|0;
    }
    let [a,c,d,e,f,g,h,x,y]=[H[0],H[1],H[2],H[3],H[4],H[5],H[6],H[7]];
    for(let j=0;j<64;j++){
      const S1=rotr(e,6)^rotr(e,11)^rotr(e,25), ch=(e&f)^(~e&g), t1=(h+S1+ch+K[j]+w[j])|0;
      const S0=rotr(a,2)^rotr(a,13)^rotr(a,22), mj=(a&c)^(a&x)^(c&x), t2=(S0+mj)|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c;c=x;x=a;a=(t1+t2)|0;
    }
    [H[0],H[1],H[2],H[3],H[4],H[5],H[6],H[7]]=[(H[0]+a)|0,(H[1]+x)|0,(H[2]+c)|0,(H[3]+d)|0,(H[4]+e)|0,(H[5]+f)|0,(H[6]+g)|0,(H[7]+h)|0];
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
const hashPassword    = async (pw, salt) => sha256(salt + pw);
async function verifyPassword(pw, stored){ const [salt,h]=(stored||'').split(':'); return !!(salt&&h) && (await hashPassword(pw,salt))===h; }

function randHex(n){ const b=new Uint8Array(Math.ceil(n/2)); crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,n); }
const genAddress = () => '0x' + randHex(40);
const genHash    = () => '0x' + randHex(64);

const inrFmt = new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
const fmtINR  = n => inrFmt.format(+n||0);
function fmtCoin(n, sym){ n=+n||0; const d=COINS[sym]?.decimals ?? 2;
  if(n===0) return '0';
  return n.toLocaleString('en-IN',{maximumFractionDigits:Math.abs(n)>=1000?Math.min(d,4):d}); }
const priceOf = s => +(Prices.map[s]?.inr ?? FALLBACK[s] ?? 0);
const changeOf= s => +(Prices.map[s]?.change ?? 0);
const imgOf   = s => Prices.map[s]?.img || null;
function timeAgo(ts){ const s=(Date.now()-new Date(ts).getTime())/1000;
  if(s<60)return 'just now'; if(s<3600)return `${Math.floor(s/60)}m ago`;
  if(s<86400)return `${Math.floor(s/3600)}h ago`; if(s<604800)return `${Math.floor(s/86400)}d ago`;
  return fmtDate(ts); }
function fmtDate(ts, withTime){ const d=new Date(ts);
  let s=d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  if(withTime) s+=', '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); return s; }
function addBusinessDays(date, days){ const d=new Date(date); let a=0;
  while(a<days){ d.setDate(d.getDate()+1); if(d.getDay()!==0&&d.getDay()!==6)a++; } return d; }
function deviceLabel(){ const u=navigator.userAgent;
  const os=/iPhone/.test(u)?'iPhone':/iPad/.test(u)?'iPad':/Android/.test(u)?'Android':/Windows/.test(u)?'Windows':/Mac/.test(u)?'Mac':'Device';
  const br=/Edg\//.test(u)?'Edge':/Chrome\//.test(u)?'Chrome':/Firefox\//.test(u)?'Firefox':/Safari\//.test(u)?'Safari':'Browser';
  return `${os} · ${br}`; }
const initials = s => (s||'?').trim().slice(0,2).toUpperCase();

function toast(msg, type='info'){
  const ic = {success:'check', error:'x', warn:'triangle-alert', info:'info'}[type]||'info';
  const t = el(`<div class="toast ${type}"><i data-lucide="${ic}"></i><span>${msg}</span></div>`);
  $('#toastRoot').append(t); icons();
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),320); },3400);
}
function showErr(sel, msg){ const e=$(sel); e.textContent=msg; e.hidden=false; }
function hideErr(sel){ $(sel).hidden=true; }
function setBtnLoading(sel, on){ const b=$(sel); b.disabled=on;
  if(on){ b.dataset.h=b.innerHTML; b.innerHTML='<span class="spin" style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite"></span>'; }
  else b.innerHTML=b.dataset.h||b.innerHTML; }
const style=document.createElement('style'); style.textContent='@keyframes spin{to{transform:rotate(360deg)}}'; document.head.append(style);

function countUp(node, from, to, fmt){
  const t0=performance.now(), dur=850;
  (function f(t){ const p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3);
    node.textContent=fmt(from+(to-from)*e); if(p<1)requestAnimationFrame(f); })(t0);
}

/* ============================== SESSION ============================== */
const getSession = () => { try{ return JSON.parse(localStorage.getItem(LS_SESSION)); }catch{ return null; } };
const setSession = o  => localStorage.setItem(LS_SESSION, JSON.stringify(o));
const clearSession = () => localStorage.removeItem(LS_SESSION);

/* ============================== SHEETS ============================== */
let activeSheet=null;
function openSheet(id){
  closeSheet(true);
  const s=$('#'+id), b=$('#sheetBackdrop');
  s.hidden=false; b.hidden=false;
  requestAnimationFrame(()=>{ s.classList.add('open'); b.classList.add('open'); });
  activeSheet=s; document.body.style.overflow='hidden'; icons();
}
function closeSheet(instant){
  if(!activeSheet) return;
  const s=activeSheet, b=$('#sheetBackdrop');
  s.classList.remove('open'); b.classList.remove('open');
  const fin=()=>{ s.hidden=true; b.hidden=true; document.body.style.overflow=''; };
  instant?fin():setTimeout(fin,300);
  activeSheet=null;
}
function confirmDialog(title,msg,okLabel='Confirm'){
  return new Promise(res=>{
    $('#cfTitle').textContent=title; $('#cfMsg').textContent=msg; $('#cfOk').textContent=okLabel;
    openSheet('sheetConfirm');
    const done=v=>{ $('#cfOk').onclick=$('#cfCancel').onclick=null; closeSheet(); res(v); };
    $('#cfOk').onclick=()=>done(true); $('#cfCancel').onclick=()=>done(false);
  });
}
 $$('.sheet-close').forEach(b=>b.addEventListener('click',()=>closeSheet()));
 $('#sheetBackdrop').addEventListener('click',()=>closeSheet());

/* ============================== THEME & PREFS ============================== */
function applyTheme(t){ document.documentElement.dataset.theme=t;
  const i=$('#admThemeBtn i, #admThemeBtn [data-lucide]'); if(i) i.setAttribute('data-lucide', t==='dark'?'sun':'moon'); icons(); }
function getPrefs(){ try{ return JSON.parse(localStorage.getItem(LS_PREFS))||{}; }catch{ return {}; } }
function setPrefs(p){ localStorage.setItem(LS_PREFS, JSON.stringify({...getPrefs(),...p})); }

/* ============================== MARKET DATA ============================== */
async function loadPrices(){
  try{
    const r=await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&ids=${COIN_SYMS.map(s=>COINS[s].id).join(',')}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`);
    if(!r.ok) throw new Error('api');
    (await r.json()).forEach(d=>{
      const sym=SYM_BY_ID[d.id]; if(!sym) return;
      Prices.map[sym]={ inr:d.current_price, change:d.price_change_percentage_24h||0,
        spark:d.sparkline_in_7d?.price||[], img:d.image, vol:d.total_volume||0 };
    });
    Prices.lastSync=new Date();
    syncPricesToDB();                                  // best-effort mirror
  }catch{
    try{                                               // fallback: Supabase table
      const {data}=await sb.from('market_prices').select('*');
      (data||[]).forEach(p=>{ if(!Prices.map[p.symbol])
        Prices.map[p.symbol]={ inr:+p.current_price_inr, change:+p.change_percentage,
          spark:Array.isArray(p.sparkline)?p.sparkline:[], img:null, vol:0 }; });
    }catch{ /* hard fallback constants below */ }
  }
  COIN_SYMS.forEach(s=>{ if(!Prices.map[s]) Prices.map[s]={inr:FALLBACK[s],change:0,spark:[],img:null,vol:0}; });
}
async function syncPricesToDB(){
  try{
    await sb.from('market_prices').upsert(
      COIN_SYMS.map(s=>({ coin_name:COINS[s].name, symbol:s, current_price_inr:priceOf(s),
        change_percentage:changeOf(s), sparkline:(Prices.map[s]?.spark||[]).slice(-84),
        updated_at:new Date().toISOString() })),
      {onConflict:'symbol'});
  }catch{ /* non-critical */ }
}
function startPriceLoop(){ setInterval(async()=>{ await loadPrices();
  if(state.view==='home') renderHome(); if(state.view==='markets') renderMarkets();
  if(state.view==='wallet') renderWallet(); }, 60000); }

/* ============================== WALLET HELPERS ============================== */
const balCol   = s => s.toLowerCase()+'_balance';
const holding  = s => +state.wallet?.[balCol(s)] || 0;
const inrCash  = () => +state.wallet?.inr_balance || 0;
const totalINR = () => COIN_SYMS.reduce((a,s)=>a+holding(s)*priceOf(s),0) + inrCash();
function portfolioDelta(){ return COIN_SYMS.reduce((a,s)=>a+holding(s)*priceOf(s)*(changeOf(s)/100),0); }

async function loadWallet(){
  const {data,error}=await sb.from('wallets').select('*').eq('user_id',state.user.id).maybeSingle();
  if(error||!data){ toast('Unable to load wallet.','error'); return; }
  state.wallet=data;
}
async function pushNotif(userId, type, title, message){
  try{ await sb.from('notifications').insert({user_id:userId,type,title,message}); }catch{}
}

/* ============================== AUTH SCREENS ============================== */
function showAuth(){ $('#authView').hidden=false; $('#appView').hidden=true; switchAuth('authLogin'); }
function showAuthScreen(id){ ['authLogin','authSignup','authForgot'].forEach(s=>$('#'+s).hidden = s!==id); }
function switchAuth(id){ showAuthScreen(id); icons(); }

function bindAuth(){
  $('#gotoSignup').onclick =()=>switchAuth('authSignup');
  $('#signupBack').onclick =()=>switchAuth('authLogin');
  $('#gotoForgot').onclick =()=>switchAuth('authForgot');
  $('#forgotBack').onclick =()=>switchAuth('authLogin');
  $$('.pw-toggle').forEach(b=>b.onclick=()=>{
    const i=$('#'+b.dataset.target); i.type = i.type==='password'?'text':'password';
    b.innerHTML=`<i data-lucide="${i.type==='password'?'eye':'eye-off'}"></i>`; icons();
  });
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#signupForm').addEventListener('submit', handleSignup);
  $('#forgotForm').addEventListener('submit', e=>{
    e.preventDefault();
    if(!$('#fpId').value.trim()) return;
    toast('If this account exists, a reset link has been sent (simulated — nothing was actually sent).','info');
    switchAuth('authLogin');
  });
}

async function handleLogin(e){
  e.preventDefault(); hideErr('#loginErr');
  const id=$('#loginId').value.trim(), pw=$('#loginPw').value;
  if(!id||!pw) return showErr('#loginErr','Enter your credentials to continue.');
  setBtnLoading('#loginBtn',true);
  try{
    const digits=id.replace(/\D/g,'');
    const isMobile = /^\d{10}$/.test(digits);
    const {data:u}= isMobile
      ? await sb.from('users').select('*').eq('mobile',digits).maybeSingle()
      : await sb.from('users').select('*').eq('email',id.toLowerCase()).maybeSingle();
    if(!u) throw 'No account found with those details.';
    if(!(await verifyPassword(pw,u.password_hash))) throw 'Incorrect password. Please try again.';
    if(!u.is_active) throw 'Your account has been temporarily disabled.';
    await sb.from('users').update({last_login:new Date().toISOString()}).eq('id',u.id);
    setSession({user_id:u.id, username:u.username, role:u.role, logged_in:true});
    await enterApp(u,true);
  }catch(msg){ showErr('#loginErr', typeof msg==='string'?msg:'Something went wrong.'); }
  finally{ setBtnLoading('#loginBtn',false); }
}

async function handleSignup(e){
  e.preventDefault(); hideErr('#signupErr');
  const username=$('#suUser').value.trim(), mobile=$('#suMobile').value.replace(/\D/g,''),
        email=$('#suEmail').value.trim().toLowerCase(), pw=$('#suPw').value,
        pw2=$('#suPw2').value, terms=$('#suTerms').checked;
  try{
    if(username.length<3) throw 'Username must be at least 3 characters.';
    if(!/^\d{10}$/.test(mobile)) throw 'Enter a valid 10-digit mobile number.';
    if(email && !/^\S+@\S+\.\S+$/.test(email)) throw 'Enter a valid email address.';
    if(pw.length<8) throw 'Password must be at least 8 characters.';
    if(pw!==pw2) throw 'Passwords do not match.';
    if(!terms) throw 'Please accept the demo terms to continue.';
    setBtnLoading('#suBtn',true);
    const {data:dm}=await sb.from('users').select('id').eq('mobile',mobile).maybeSingle();
    if(dm) throw 'This mobile number is already registered.';
    if(email){ const {data:de}=await sb.from('users').select('id').eq('email',email).maybeSingle();
      if(de) throw 'This email is already registered.'; }
    const salt=randHex(16), hash=await hashPassword(pw,salt);
    const {data:u,error:eu}=await sb.from('users')
      .insert({username, email:email||null, mobile, password_hash:`${salt}:${hash}`, role:'user'})
      .select().single();
    if(eu) throw 'Something went wrong while creating your account.';
    const {error:ew}=await sb.from('wallets').insert({user_id:u.id, wallet_address:genAddress()});
    if(ew){ await sb.from('users').delete().eq('id',u.id); throw 'Could not create your wallet. Try again.'; }
    await pushNotif(u.id,'general','Welcome to Aurix','Your simulated wallet is ready. This is a demo environment — no real funds are involved.');
    setSession({user_id:u.id, username:u.username, role:u.role, logged_in:true});
    await enterApp(u,true);
  }catch(msg){ showErr('#signupErr', typeof msg==='string'?msg:'Something went wrong.'); }
  finally{ setBtnLoading('#suBtn',false); }
}

/* ============================== APP BOOT ============================== */
async function enterApp(user, freshLogin){
  state.user=user;
  $('#authView').hidden=true; $('#appView').hidden=false;
  $('#avatarInitials').textContent=initials(user.username);
  showView('home');
  ['#homeHoldings','#homeActivity','#walletList','#activityList','#marketList']
    .forEach(s=>{ $(s).innerHTML='<div class="skeleton sk-row"></div>'.repeat(3); });
  await loadPrices();
  await loadWallet();
  await Promise.all([loadTxs(), loadWithdrawals(), loadNotifs(), loadAnnouncements()]);
  refreshMoney(false); renderAll();
  startRealtime(); startPriceLoop();
  if(freshLogin){
    const logins=JSON.parse(localStorage.getItem(LS_LOGINS)||'[]');
    logins.unshift({time:new Date().toISOString(), device:deviceLabel()});
    localStorage.setItem(LS_LOGINS, JSON.stringify(logins.slice(0,8)));
    await pushNotif(user.id,'login','New login detected',`Sign-in on ${deviceLabel()}. Simulated security notice — no real session security is enforced.`);
    await loadNotifs();
  }
  checkDueWithdrawals();
  icons();
}

function renderAll(){ renderHome(); renderMarkets(); renderWallet(); renderActivity(); renderProfile(); }

/* ============================== NAVIGATION ============================== */
const VIEW_TITLES={home:'Home',markets:'Markets',wallet:'Wallet',activity:'Activity',profile:'Profile'};
function showView(name){
  state.view=name;
  $$('#main .view').forEach(v=>v.hidden = v.id!=='view-'+name);
  $$('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.view===name));
  $('#topbarTitle').textContent = name==='home'
    ? `${greeting()}, ${state.user.username}` : VIEW_TITLES[name];
  $('#main').scrollTop=0;
  ({home:renderHome,markets:renderMarkets,wallet:renderWallet,activity:renderActivity,profile:renderProfile})[name]?.();
  icons();
}
const greeting=()=>{ const h=new Date().getHours();
  return h<5?'Good night':h<12?'Good morning':h<17?'Good afternoon':'Good evening'; };
function bindNav(){
  $$('.nav-item').forEach(n=>n.onclick=()=>showView(n.dataset.view));
  document.addEventListener('click',e=>{
    const g=e.target.closest('[data-goto]'); if(g) showView(g.dataset.goto);
  });
  $('#avatarBtn').onclick=()=>showView('profile');
  $('#bellBtn').onclick=()=>{ renderNotifs(); openSheet('sheetNotifs'); };
  $('#qaSend').onclick=openSend;   $('#qaReceive').onclick=openReceive;
  $('#qaWithdraw').onclick=openWithdraw; $('#qaAddFunds').onclick=openAddFunds;
  $('#walletAddFunds').onclick=openAddFunds;
}

/* ============================== HOME ============================== */
let chPortfolio=null;
function refreshMoney(animated=true){
  if(!state.wallet) return;
  const total=totalINR(), node=$('#pcTotal');
  const prev=parseFloat((node.dataset.v||'0').replace(/,/g,''))||0;
  if(animated && Math.abs(total-prev)>0.005) countUp(node, prev, total, fmtINR);
  else node.textContent=fmtINR(total);
  node.dataset.v=total;
  const d=portfolioDelta(), pct=total>0?(d/(total-d))*100:0;
  $('#pcChange').innerHTML =
    `<span class="chip-up ${d<0?'down':''}">${d>=0?'+':''}${pct.toFixed(2)}%</span>`+
    `<span>${d>=0?'+':'−'}${fmtINR(Math.abs(d))} <span style="opacity:.7">24h</span></span>`;
  $('#inrBalance').textContent=fmtINR(inrCash());
  renderPortfolioChart();
  if(state.view==='wallet') renderWallet();
}
function portfolioSeries(range){
  const n = range==='24H'?24:168, total=totalINR();
  const hasHold = COIN_SYMS.some(s=>holding(s)>0);
  const out=[];
  for(let i=0;i<n;i++){
    let v=0, ok=hasHold;
    if(hasHold){
      for(const s of COIN_SYMS){ const b=holding(s); if(!b) continue;
        const sp=Prices.map[s]?.spark||[];
        if(sp.length<10){ ok=false; break; }
        v += b * (sp[sp.length-n+i] ?? sp[sp.length-1]); }
    }
    if(!ok){ const w=Math.sin(i/(n/6))*0.004+Math.sin(i/3.7)*0.0015; v=total*(1+w*(range==='24H'?0.6:1)); }
    out.push(v);
  }
  if(out.length) out[out.length-1]=total;
  return out;
}
function renderPortfolioChart(){
  const cv=$('#portfolioChart'); if(!cv||!window.Chart) return;
  const pts=portfolioSeries(state.range);
  const g=cv.getContext('2d').createLinearGradient(0,0,0,132);
  g.addColorStop(0,'rgba(255,255,255,.18)'); g.addColorStop(1,'rgba(255,255,255,0)');
  if(chPortfolio) chPortfolio.destroy();
  chPortfolio=new Chart(cv,{type:'line',
    data:{labels:pts.map((_,i)=>i),datasets:[{data:pts,borderColor:'rgba(255,255,255,.85)',borderWidth:2,fill:true,backgroundColor:g,tension:.35,pointRadius:0}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:600},
      plugins:{legend:{display:false},tooltip:{enabled:false}},
      scales:{x:{display:false},y:{display:false}}}});
}
function coinIconHTML(sym, cls='coin-ic'){
  const img=imgOf(sym);
  if(img) return `<img class="${cls}" src="${img}" alt="${sym}" onerror="this.outerHTML='<span class=&quot;coin-icfallback ${cls}&quot; style=&quot;background:${COINS[sym].color}22;color:${COINS[sym].color}&quot;>${sym[0]}</span>'">`;
  return `<span class="coin-icfallback ${cls}" style="background:${COINS[sym].color}22;color:${COINS[sym].color}">${sym[0]}</span>`;
}
const changeBadge = c => Math.abs(c)<0.005
  ? `<span class="badge-flat">0.00%</span>`
  : `<span class="${c>0?'badge-up':'badge-down'}">${c>0?'▲':'▼'} ${Math.abs(c).toFixed(2)}%</span>`;

function assetRowHTML(sym, opts={}){
  const c=COINS[sym], b=holding(sym), p=priceOf(sym);
  const watched=watchlist().includes(sym);
  return `<div class="asset-row" data-coin="${sym}">
    ${coinIconHTML(sym)}
    <div class="ar-main"><div class="ar-name">${c.name}</div>
      <div class="ar-sub">${sym}${opts.showBalance!==false?` · ${fmtCoin(b,sym)} ${sym}`:''}</div></div>
    ${opts.spark===false?'':`<canvas class="ar-spark" data-spark="${sym}"></canvas>`}
    <div class="ar-end"><div class="ar-amt">${opts.altRight??fmtINR(b*p)}</div>
      <div class="ar-val">${changeBadge(changeOf(sym))}</div></div>
    ${opts.star?`<button class="ar-star ${watched?'on':''}" data-star="${sym}" aria-label="Watchlist"><i data-lucide="star"></i></button>`:''}
  </div>`;
}
const watchlist = () => JSON.parse(localStorage.getItem(LS_WATCH)||'[]');
function toggleWatch(sym){ const w=watchlist(), i=w.indexOf(sym);
  i>=0?w.splice(i,1):w.push(sym);
  localStorage.setItem(LS_WATCH, JSON.stringify(w)); }

function renderHome(){
  renderAnnouncement();
  $('#homeHoldings').innerHTML = COIN_SYMS.filter(s=>holding(s)>0).slice(0,4)
    .map(s=>assetRowHTML(s,{spark:false})).join('')
    || `<div class="empty"><i data-lucide="wallet"></i><p>No holdings yet — receive or ask admin for demo funds.</p></div>`;
  $('#homeActivity').innerHTML = state.txs.slice(0,3).map(txRowHTML).join('')
    || `<div class="empty"><i data-lucide="inbox"></i><p>No recent activity.</p></div>`;
  bindCoinRows('#homeHoldings'); bindTxRows('#homeActivity');
  refreshMoney(false); icons(); renderSparks('#homeHoldings');
}
function renderAnnouncement(){
  const a=state.announcements[0];
  const box=$('#announceBanner');
  if(!a || sessionStorage.getItem('aurix_an_')===a.id){ box.hidden=true; return; }
  box.hidden=false; box.className='announce t-'+a.type;
  box.innerHTML=`<i data-lucide="megaphone"></i><div><b>${a.title}</b><span class="muted">${a.message}</span></div>
    <button class="an-close"><i data-lucide="x"></i></button>`;
  box.querySelector('.an-close').onclick=()=>{ sessionStorage.setItem('aurix_an_',a.id); box.hidden=true; };
}

/* ============================== MARKETS ============================== */
const sparkCharts={};
function renderSparks(root){
  $$(root+' canvas[data-spark]').forEach(cv=>{
    const sym=cv.dataset.spark, sp=(Prices.map[sym]?.spark||[]).slice(-72);
    const key=cv.dataset.spark+(cv.closest('.sheet')?'-s':'');
    if(sparkCharts[key]) sparkCharts[key].destroy();
    if(!sp.length||!window.Chart){ return; }
    const up=sp[sp.length-1]>=sp[0];
    sparkCharts[key]=new Chart(cv,{type:'line',
      data:{labels:sp.map((_,i)=>i),datasets:[{data:sp,borderColor:up?'#0B9E6C':'#DE4A4F',borderWidth:1.6,tension:.4,pointRadius:0}]},
      options:{responsive:true,maintainAspectRatio:false,animation:false,
        plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false}}}});
  });
}
function renderMarkets(){
  const q=$('#marketSearch').value.trim().toLowerCase();
  let list=COIN_SYMS.map(s=>({sym:s,...COINS[s]}));
  if(q) list=list.filter(c=>c.name.toLowerCase().includes(q)||c.sym.toLowerCase().includes(q));
  const f=state.marketFilter;
  if(f==='gainers')      list.sort((a,b)=>changeOf(b.sym)-changeOf(a.sym));
  else if(f==='losers')  list.sort((a,b)=>changeOf(a.sym)-changeOf(b.sym));
  else if(f==='trending')list.sort((a,b)=>(Prices.map[b.sym]?.vol||0)-(Prices.map[a.sym]?.vol||0));
  else if(f==='watchlist')list=list.filter(c=>watchlist().includes(c.sym));
  $('#marketList').innerHTML = list.map(c=>assetRowHTML(c.sym,{star:true})).join('')
    || `<div class="empty"><i data-lucide="search-x"></i><p>${f==='watchlist'?'Your watchlist is empty — tap the star on any coin.':'No coins match your search.'}</p></div>`;
  $$('#marketList [data-star]').forEach(b=>b.onclick=e=>{ e.stopPropagation();
    toggleWatch(b.dataset.star); renderMarkets(); });
  bindCoinRows('#marketList'); icons(); renderSparks('#marketList');
}
function bindCoinRows(root){
  $$(root+' .asset-row').forEach(r=>r.onclick=()=>openCoinDetail(r.dataset.coin));
}
 $('#marketSearch').addEventListener('input',renderMarkets);
 $$('#marketChips .chip').forEach(c=>c.onclick=()=>{
  $$('#marketChips .chip').forEach(x=>x.classList.remove('active'));
  c.classList.add('active'); state.marketFilter=c.dataset.mf; renderMarkets();
});

function openCoinDetail(sym){
  state.coinSheet=sym; renderCoinDetail(); openSheet('sheetCoin');
}
let chCoin=null;
function renderCoinDetail(){
  const sym=state.coinSheet, c=COINS[sym], p=priceOf(sym), b=holding(sym);
  $('#coinDetailTitle').textContent=c.name;
  $('#coinDetail').innerHTML=`
    <div class="dtl-head">${coinIconHTML(sym)}
      <div><h4>${c.name} <span class="muted small">${sym}</span></h4>
      <div class="dtl-amount">${fmtINR(p)}</div>
      ${changeBadge(changeOf(sym))}</div></div>
    <div style="height:130px;margin:-4px 0 14px"><canvas id="coinChart"></canvas></div>
    <div class="stat-mini">
      <div><span>24h change</span><b>${changeOf(sym).toFixed(2)}%</b></div>
      <div><span>Your holdings</span><b>${fmtCoin(b,sym)} ${sym}</b></div>
      <div><span>Holdings value</span><b>${fmtINR(b*p)}</b></div>
      <div><span>Network fee (sim.)</span><b>${fmtCoin(c.fee,sym)} ${sym}</b></div>
    </div>
    <div class="dtl-actions">
      <button class="btn btn-primary" id="cdSend"><i data-lucide="arrow-up-right"></i>Send</button>
      <button class="btn btn-ghost" id="cdRecv"><i data-lucide="arrow-down-left"></i>Receive</button>
      <button class="btn btn-ghost" id="cdWd"><i data-lucide="landmark"></i>Withdraw</button>
    </div>`;
  const cv=$('#coinChart'), sp=(Prices.map[sym]?.spark||[]);
  if(sp.length&&window.Chart){
    if(chCoin) chCoin.destroy();
    const g=cv.getContext('2d').createLinearGradient(0,0,0,130);
    g.addColorStop(0,'rgba(61,90,241,.20)'); g.addColorStop(1,'rgba(61,90,241,0)');
    const up=changeOf(sym)>=0, line=up?'#0B9E6C':'#DE4A4F';
    chCoin=new Chart(cv,{type:'line',data:{labels:sp.map((_,i)=>i),
      datasets:[{data:sp,borderColor:line,borderWidth:2,fill:true,backgroundColor:g,tension:.35,pointRadius:0}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false}}}});
  }
  $('#cdSend').onclick=()=>openSend(sym);
  $('#cdRecv').onclick=()=>openReceive();
  $('#cdWd').onclick=()=>openWithdraw(sym);
  icons();
}

/* ============================== WALLET VIEW ============================== */
function renderWallet(){
  $('#walletList').innerHTML = COIN_SYMS.map(s=>assetRowHTML(s)).join('');
  bindCoinRows('#walletList'); icons(); renderSparks('#walletList');
}

/* ============================== ACTIVITY ============================== */
function txRowHTML(t){
  const type=t.transaction_type, coin=t.coin;
  const sign = (type==='received'||type==='admin_credit') ? '+' : '−';
  const cls  = (type==='received'||type==='admin_credit') ? 'plus' : 'minus';
  const names={sent:'Sent',received:'Received',withdrawal:'Withdrawal',admin_credit:'Admin credit',admin_debit:'Admin debit'};
  let title=names[type]||type;
  if(coin!=='INR') title+=' '+COINS[coin]?.name||coin; else title+=' (INR)';
  return `<div class="tx-row" data-tx="${t.id}">
    <span class="tx-ic ti-${type}"><i data-lucide="${type==='sent'?'arrow-up-right':type==='received'?'arrow-down-left':type==='withdrawal'?'landmark':type==='admin_credit'?'plus':'minus'}"></i></span>
    <div class="tx-main"><div class="tx-title">${title}</div>
      <div class="tx-sub"><span class="tx-dot ${t.status}"></span>${t.status} · ${timeAgo(t.created_at)}</div></div>
    <div class="tx-end"><div class="tx-amt ${cls}">${sign}${fmtCoin(+t.amount,coin)} ${coin}</div>
      <div class="tx-inr">${fmtINR(+t.amount_inr)}</div></div>
  </div>`;
}
async function loadTxs(){
  const {data}=await sb.from('transactions').select('*')
    .or(`sender_id.eq.${state.user.id},receiver_id.eq.${state.user.id}`)
    .order('created_at',{ascending:false}).limit(200);
  state.txs=data||[];
}
function bindTxRows(root){ $$(root+' .tx-row').forEach(r=>r.onclick=()=>openTxDetail(r.dataset.tx)); }
function renderActivity(){
  const f=state.activityFilter;
  let list=state.txs;
  if(f!=='all') list = f==='admin'
    ? list.filter(t=>t.transaction_type==='admin_credit'||t.transaction_type==='admin_debit')
    : list.filter(t=>t.transaction_type===f);
  $('#activityList').innerHTML = list.map(txRowHTML).join('')
    || `<div class="empty"><i data-lucide="inbox"></i><p>No transactions in this category yet.</p></div>`;
  bindTxRows('#activityList'); icons();
}
 $$('#activityChips .chip').forEach(c=>c.onclick=()=>{
  $$('#activityChips .chip').forEach(x=>x.classList.remove('active'));
  c.classList.add('active'); state.activityFilter=c.dataset.af; renderActivity();
});

function openTxDetail(id){
  const t=state.txs.find(x=>x.id===id); if(!t) return;
  const type=t.transaction_type;
  const counterparty = type==='sent' ? t.receiver_id : t.sender_id;
  $('#txDetail').innerHTML=`
    <div class="dtl-head"><span class="tx-ic ti-${type}"><i data-lucide="${type==='sent'?'arrow-up-right':type==='received'?'arrow-down-left':type==='withdrawal'?'landmark':type==='admin_credit'?'plus':'minus'}"></i></span>
      <div><h4>${t.coin} ${type.replace('_',' ')}</h4>
      <span class="st-badge st-${t.status}">${t.status}</span></div></div>
    <div class="dtl-amount">${fmtCoin(+t.amount,t.coin)} ${t.coin}</div>
    <p class="muted" style="margin-bottom:14px">${fmtINR(+t.amount_inr)} at time of transaction</p>
    <div class="dtl-grid">
      <div class="sumrow"><span>Type</span><b>${type}</b></div>
      <div class="sumrow"><span>Date</span><b>${fmtDate(t.created_at,true)}</b></div>
      ${t.note?`<div class="sumrow"><span>Note</span><b>${t.note}</b></div>`:''}
      <div class="sumrow"><span>Counterparty</span><b>${counterparty?'User · '+counterparty.slice(0,8):'—'}</b></div>
      <div class="sumrow"><span>Confirmations</span>
        <b class="conf-dots">${[1,2,3].map(i=>`<i class="${t.confirmations>=i?'on':''}"></i>`).join('')}<span style="margin-left:6px">${t.confirmations}/3</span></b></div>
      <div class="sumrow"><span>Status</span><b><span class="st-badge st-${t.status}">${t.status}</span></b></div>
    </div>
    <div class="hash-box"><span class="mono">${t.tx_hash}</span>
      <button data-copy="${t.tx_hash}"><i data-lucide="copy"></i></button></div>
    <div class="note-card"><i data-lucide="info"></i><p>Transaction hash is simulated for the demo. No blockchain network is involved.</p></div>`;
  $('#txDetail [data-copy]').onclick=e=>copyText(e.currentTarget.dataset.copy);
  openSheet('sheetTx');
}

/* ============================== SEND ============================== */
function renderCoinChips(rootSel, selected, onPick){
  $(rootSel).innerHTML = COIN_SYMS.map(s=>
    `<button class="coin-opt ${s===selected?'active':''}" data-c="${s}">
      ${coinIconHTML(s,'coin-icfallback')}<span>${s}</span></button>`).join('');
  icons();
  $$(rootSel+' .coin-opt').forEach(b=>b.onclick=()=>onPick(b.dataset.c));
}
function renderSendSummary(){
  const s=state.sendCoin, b=holding(s), amt=parseFloat($('#sendAmount').value)||0, fee=COINS[s].fee;
  $('#sendSummary').innerHTML=`
    <div class="sumrow"><span>Available</span><b>${fmtCoin(b,s)} ${s}</b></div>
    <div class="sumrow"><span>Rate</span><b>${fmtINR(p)} / ${s}</b></div>
    <div class="sumrow"><span>Network fee (simulated)</span><b>${fmtCoin(fee,s)} ${s}</b></div>
    <div class="sumrow total"><span>Total</span><b>${fmtCoin(amt+fee,s)} ${s} · ${fmtINR(amt*p)}</b></div>`;
  const p=priceOf(s);
}
function openSend(coin){
  state.sendCoin = coin && COINS[coin] ? coin : 'BTC';
  $('#sendAddr').value=''; $('#sendAmount').value=''; $('#sendNote').value=''; hideErr('#sendErr');
  renderSendUI(); openSheet('sheetSend');
}
function renderSendUI(){
  renderCoinChips('#sendCoins', state.sendCoin, c=>{ state.sendCoin=c; renderSendUI(); });
  renderSendSummary(); icons();
}
 $('#sendAmount').addEventListener('input',renderSendSummary);
 $('#sendMax').onclick=()=>{ const s=state.sendCoin;
  $('#sendAmount').value=Math.max(0, holding(s)-COINS[s].fee); renderSendSummary(); };

 $('#sendSubmit').onclick=async ()=>{
  hideErr('#sendErr');
  const s=state.sendCoin, addr=$('#sendAddr').value.trim(),
        amt=parseFloat($('#sendAmount').value), note=$('#sendNote').value.trim();
  if(!/^0x[0-9a-fA-F]{40}$/.test(addr)) return showErr('#sendErr','Invalid wallet address.');
  if(state.wallet.wallet_address.toLowerCase()===addr.toLowerCase()) return showErr('#sendErr','You cannot send to your own address.');
  if(!(amt>0)) return showErr('#sendErr','Enter a valid amount.');
  const bal=holding(s), fee=COINS[s].fee;
  if(amt+fee>bal) return showErr('#sendErr','Insufficient balance.');
  const ok=await confirmDialog('Confirm transaction',
    `Send ${fmtCoin(amt,s)} ${s} (≈ ${fmtINR(amt*priceOf(s))}) to ${addr.slice(0,10)}…${addr.slice(-6)}?`,'Send');
  if(!ok) return;
  setBtnLoading('#sendSubmit',true);
  try{
    const {data:rw}=await sb.from('wallets').select('id, user_id, wallet_address, user:users(username)')
      .eq('wallet_address',addr).maybeSingle();
    if(!rw) throw 'Wallet address not found.';
    const {error:eu}=await sb.from('wallets').update({[balCol(s)]: bal-amt}).eq('user_id',state.user.id);
    if(eu) throw 'Something went wrong. Please try again.';
    const {data:tw}=await sb.from('wallets').select(balCol(s)).eq('id',rw.id).maybeSingle();
    await sb.from('wallets').update({[balCol(s)]: (+tw[balCol(s)])+amt}).eq('id',rw.id);
    const hash=genHash(), inr=amt*priceOf(s);
    const base={sender_id:state.user.id, receiver_id:rw.user_id, coin:s, amount:amt, amount_inr:inr,
      tx_hash:hash, note:note||null, status:'Processing', confirmations:0};
    await sb.from('transactions').insert([
      {...base, transaction_type:'sent'},
      {...base, transaction_type:'received', note:null}]);
    await pushNotif(state.user.id,'sent','Crypto sent',
      `You sent ${fmtCoin(amt,s)} ${s} (≈ ${fmtINR(inr)}) to ${shortAddr(addr)}.`);
    await pushNotif(rw.user_id,'received','Crypto received',
      `You received ${fmtCoin(amt,s)} ${s} (≈ ${fmtINR(inr)}) from ${state.user.username}.`);
    await Promise.all([loadWallet(), loadTxs()]);
    refreshMoney(false); renderAll();
    closeSheet();
    showTxSuccess('Transaction submitted',
      `${fmtCoin(amt,s)} ${s} to ${shortAddr(addr)} · confirming (simulated)`, hash);
    simulateConfirmations(hash);
  }catch(msg){ showErr('#sendErr', typeof msg==='string'?msg:'Something went wrong.'); }
  finally{ setBtnLoading('#sendSubmit',false); }
};
const shortAddr = a => a ? `${a.slice(0,8)}…${a.slice(-6)}` : '';
async function simulateConfirmations(hash){
  for(let c=1;c<=3;c++){
    await sleep(2200+c*500);
    try{ await sb.from('transactions').update({confirmations:c}).eq('tx_hash',hash);
      if(c===3) await sb.from('transactions').update({status:'Completed'}).eq('tx_hash',hash); }catch{}
  }
  loadTxs().then(()=>{ renderActivity(); if(state.view==='home')renderHome(); });
}
function showTxSuccess(title, sub, hash){
  $('#txsTitle').textContent=title; $('#txsSub').textContent=sub; $('#txsHash').textContent=hash;
  const fp=$('#txSuccess'); fp.hidden=false; icons();
  setTimeout(()=>fp.hidden=true, 2600);
}

/* ============================== RECEIVE ============================== */
function openReceive(){
  $('#recvAddr').textContent=state.wallet.wallet_address;
  const box=$('#qrBox'); box.innerHTML='';
  new QRCode(box,{text:state.wallet.wallet_address,width:172,height:172,
    colorDark:'#0E1219',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  $('#recvHoldings').innerHTML = COIN_SYMS.filter(s=>holding(s)>0)
    .map(s=>assetRowHTML(s,{spark:false})).join('')
    || `<div class="empty"><i data-lucide="inbox"></i><p>No holdings yet.</p></div>`;
  icons();
  $('#recvCopy').onclick=()=>copyText(state.wallet.wallet_address);
  $('#recvShare').onclick=async ()=>{
    const a=state.wallet.wallet_address;
    if(navigator.share){ try{ await navigator.share({title:'My Aurix wallet address',text:a}); return; }catch{} }
    copyText(a);
  };
}
async function copyText(t){
  try{ await navigator.clipboard.writeText(t); }
  catch{ const i=document.createElement('textarea'); i.value=t; document.body.append(i); i.select();
    document.execCommand('copy'); i.remove(); }
  toast('Copied to clipboard','success');
}

/* ============================== WITHDRAW ============================== */
function renderWdSummary(){
  const s=state.wdCoin, b=holding(s), amt=parseFloat($('#wdAmount').value)||0;
  $('#wdSummary').innerHTML=`
    <div class="sumrow"><span>Available</span><b>${fmtCoin(b,s)} ${s}</b></div>
    <div class="sumrow"><span>Current price</span><b>${fmtINR(priceOf(s))} / ${s}</b></div>
    <div class="sumrow total"><span>Estimated INR value</span><b>${fmtINR(amt*priceOf(s))}</b></div>`;
}
function openWithdraw(coin){
  state.wdCoin = coin && COINS[coin] ? coin : 'BTC';
  state.wdMethod='UPI';
  $('#wdAmount').value=''; $('#wdUpiId').value=state.user.username.toLowerCase()+'@upi';
  ['wdBankName','wdAcctHolder','wdAcctNo','wdIfsc'].forEach(i=>$('#'+i).value='');
  hideErr('#wdErr');
  $$('#wdMethod button').forEach(b=>b.classList.toggle('active',b.dataset.m==='UPI'));
  $('#wdUpi').hidden=false; $('#wdBank').hidden=true;
  renderWdUI(); openSheet('sheetWithdraw');
}
function renderWdUI(){
  renderCoinChips('#wdCoins', state.wdCoin, c=>{ state.wdCoin=c; renderWdUI(); });
  renderWdSummary(); icons();
}
 $('#wdAmount').addEventListener('input',renderWdSummary);
 $('#wdMax').onclick=()=>{ $('#wdAmount').value=holding(state.wdCoin); renderWdSummary(); };
 $$('#wdMethod button').forEach(b=>b.onclick=()=>{
  $$('#wdMethod button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); state.wdMethod=b.dataset.m;
  $('#wdUpi').hidden = state.wdMethod!=='UPI';
  $('#wdBank').hidden = state.wdMethod!=='BANK';
});

 $('#wdSubmit').onclick=async ()=>{
  hideErr('#wdErr');
  const s=state.wdCoin, amt=parseFloat($('#wdAmount').value), b=holding(s);
  if(!(amt>0)) return showErr('#wdErr','Enter a valid amount.');
  if(amt>b) return showErr('#wdErr','Insufficient wallet balance.');
  let dest={};
  if(state.wdMethod==='UPI'){
    const upi=$('#wdUpiId').value.trim();
    if(!/^\S+@\S+$/.test(upi)) return showErr('#wdErr','Enter a valid UPI ID (e.g. name@upi).');
    dest={upi_id:upi};
  }else{
    const bn=$('#wdBankName').value.trim(), ah=$('#wdAcctHolder').value.trim(),
          an=$('#wdAcctNo').value.trim(), ifsc=$('#wdIfsc').value.trim().toUpperCase();
    if(!bn) return showErr('#wdErr','Enter the bank name.');
    if(!ah) return showErr('#wdErr','Enter the account holder name.');
    if(!/^\d{9,18}$/.test(an)) return showErr('#wdErr','Account number must be 9–18 digits.');
    if(!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return showErr('#wdErr','Enter a valid IFSC code.');
    dest={bank_name:bn, account_holder_name:ah, account_number:an, ifsc_code:ifsc};
  }
  const inr=amt*priceOf(s);
  const ok=await confirmDialog('Confirm withdrawal',
    `Withdraw ${fmtCoin(amt,s)} ${s} (≈ ${fmtINR(inr)}) via ${state.wdMethod==='UPI'?'UPI':'bank transfer'}? Crypto is deducted immediately.`,'Submit');
  if(!ok) return;
  setBtnLoading('#wdSubmit',true);
  try{
    await sb.from('wallets').update({[balCol(s)]: b-amt}).eq('user_id',state.user.id);
    const est=addBusinessDays(new Date(),3);
    const hash=genHash();
    const {data:wd,error:ew}=await sb.from('withdrawals').insert({
      user_id:state.user.id, coin:s, crypto_amount:amt, amount_inr:inr,
      withdrawal_method:state.wdMethod, ...dest,
      status:'Processing', processing_days_remaining:3,
      estimated_arrival:est.toISOString().slice(0,10)
    }).select().single();
    if(ew) throw 'Withdrawal request failed. Please try again.';
    await sb.from('transactions').insert({sender_id:state.user.id, receiver_id:null, coin:s,
      amount:amt, amount_inr:inr, tx_hash:hash, status:'Processing', confirmations:0,
      transaction_type:'withdrawal'});
    await pushNotif(state.user.id,'withdrawal','Withdrawal submitted',
      `Your withdrawal of ${fmtCoin(amt,s)} ${s} (≈ ${fmtINR(inr)}) was submitted. Estimated arrival: ${fmtDate(est)} (~3 business days).`);
    await Promise.all([loadWallet(), loadTxs(), loadWithdrawals()]);
    refreshMoney(false); renderAll(); closeSheet();
    showWithdrawSuccess(s, amt, inr, est);
  }catch(msg){ showErr('#wdErr', typeof msg==='string'?msg:'Withdrawal request failed.'); }
  finally{ setBtnLoading('#wdSubmit',false); }
};

function showWithdrawSuccess(coin, amt, inr, est){
  $('#wdAmt').textContent=`${fmtCoin(amt,coin)} ${coin} · ${fmtINR(inr)}`;
  $('#wdEstDate').textContent=new Date(est).toLocaleDateString('en-IN',
    {weekday:'short',day:'numeric',month:'short',year:'numeric'});
  const steps=['Request Submitted','Processing','Verification','Transfer Processing','Completed'];
  $('#wdTimeline').innerHTML=steps.map((s,i)=>
    `<div class="tl-step ${i===0?'done':i===1?'active':''}">
      <span class="tl-dot">${i===0?'<i data-lucide="check"></i>':''}</span>
      <div class="tl-txt"><b>${s}</b><span>${i===0?'Just now':i===1?'In progress':'Pending'}</span></div>
    </div>`).join('');
  const fp=$('#wdSuccess'); fp.hidden=false; icons();
  $('#wdDone').onclick=()=>{ fp.hidden=true; };
}

async function loadWithdrawals(){
  const {data}=await sb.from('withdrawals').select('*')
    .eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(100);
  state.withdrawals=data||[];
}
async function checkDueWithdrawals(){
  const today=new Date().toISOString().slice(0,10);
  const due=state.withdrawals.filter(w=>w.status==='Processing' && w.estimated_arrival && w.estimated_arrival<=today);
  for(const w of due){
    try{
      await sb.from('withdrawals').update({status:'Completed', processing_days_remaining:0,
        completed_at:new Date().toISOString()}).eq('id',w.id);
      await sb.from('transactions').update({status:'Completed'}).eq('tx_hash',w.tx_hash||'').neq('transaction_type','x');
      await pushNotif(w.user_id,'withdrawal','Funds Successfully Delivered',
        `Your withdrawal of ${fmtCoin(+w.crypto_amount,w.coin)} ${w.coin} (≈ ${fmtINR(+w.amount_inr)}) has been delivered.`);
    }catch{}
  }
  if(due.length){ await Promise.all([loadWithdrawals(), loadTxs()]); renderActivity(); }
}

/* ============================== ADD FUNDS ============================== */
 $('#afQuick').addEventListener('click',e=>{
  const c=e.target.closest('[data-amt]'); if(c) $('#afAmount').value=c.dataset.amt;
});
 $$('#afMethod button').forEach(b=>b.onclick=()=>{
  $$('#afMethod button').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); state.afMethod=b.dataset.m;
});
function openAddFunds(){ $('#afAmount').value=''; hideErr('#afErr'); openSheet('sheetAddFunds'); }
 $('#afSubmit').onclick=async ()=>{
  hideErr('#afErr');
  const amt=parseFloat($('#afAmount').value);
  if(!(amt>=1)) return showErr('#afErr','Enter a valid amount.');
  if(amt>1000000) return showErr('#afErr','Maximum simulated deposit is ₹10,00,000.');
  setBtnLoading('#afSubmit',true);
  try{
    await sb.from('wallets').update({inr_balance: inrCash()+amt}).eq('user_id',state.user.id);
    await sb.from('transactions').insert({sender_id:null, receiver_id:state.user.id, coin:'INR',
      amount:amt, amount_inr:amt, tx_hash:genHash(), status:'Completed', confirmations:3,
      transaction_type:'admin_credit', note:`Simulated ${state.afMethod} deposit`});
    await pushNotif(state.user.id,'admin','Demo funds added',
      `${fmtINR(amt)} demo INR was credited to your wallet (simulated deposit).`);
    await Promise.all([loadWallet(), loadTxs()]);
    refreshMoney(false); renderAll(); closeSheet();
    toast(`${fmtINR(amt)} demo INR added`,'success');
  }catch{ showErr('#afErr','Could not add funds. Please try again.'); }
  finally{ setBtnLoading('#afSubmit',false); }
};

/* ============================== NOTIFICATIONS ============================== */
async function loadNotifs(){
  const {data}=await sb.from('notifications').select('*')
    .eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(60);
  state.notifs=data||[]; updateNotifBadge();
}
function updateNotifBadge(){
  const n=state.notifs.filter(x=>!x.read_status).length;
  const b=$('#notifBadge'); b.hidden=!n; b.textContent=n>99?'99+':n;
}
const NOTIF_IC={general:'bell',login:'log-in',security:'shield-alert',received:'arrow-down-left',
  sent:'arrow-up-right',withdrawal:'landmark',admin:'badge-check',announcement:'megaphone'};
function renderNotifs(){
  $('#notifList').innerHTML = state.notifs.map(n=>`
    <div class="tx-row" style="cursor:default" data-n="${n.id}">
      <span class="tx-ic ${n.read_status?'':'ti-withdrawal'}" style="${n.read_status?'background:var(--surface-2);color:var(--muted)':''}">
        <i data-lucide="${NOTIF_IC[n.type]||'bell'}"></i></span>
      <div class="tx-main"><div class="tx-title">${n.title}</div>
        <div class="tx-sub" style="white-space:normal">${n.message}</div></div>
      <span class="small muted" style="flex:none">${timeAgo(n.created_at)}</span>
    </div>`).join('')
    || `<div class="empty"><i data-lucide="bell"></i><p>No notifications yet.</p></div>`;
  icons();
}
 $('#markAllRead').onclick=async ()=>{
  await sb.from('notifications').update({read_status:true}).eq('user_id',state.user.id).eq('read_status',false);
  state.notifs.forEach(n=>n.read_status=true);
  updateNotifBadge(); renderNotifs();
};

/* ============================== ANNOUNCEMENTS ============================== */
async function loadAnnouncements(){
  const {data}=await sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(5);
  state.announcements=data||[];
}

/* ============================== PROFILE & SETTINGS ============================== */
function renderProfile(){
  const u=state.user;
  const rows=(label,items)=>`<div class="set-group"><div class="group-label">${label}</div>${items}</div>`;
  const setRow=(icon,label,extra='',id='',sub='')=>
    `<${id?'button':'div'} class="set-row" ${id?`id="${id}"`:''}>
      <i data-lucide="${icon}"></i><span class="grow">${label}${sub?`<div class="kv-line">${sub}</div>`:''}</span>${extra}
      ${id?'<i data-lucide="chevron-right" class="chev"></i>':''}</${id?'button':'div'}>`;
  const prefs=getPrefs();
  const theme=document.documentElement.dataset.theme;
  $('#profileCard').innerHTML=`
    <div class="profile-hero">
      <span class="profile-avatar">${initials(u.username)}</span>
      <div><h3>${u.username}</h3><span class="muted small">${u.email||u.mobile}</span>
        <div class="kv-line">Member since ${fmtDate(u.created_at)}</div></div>
    </div>
    ${rows('Account',
      setRow('qr-code','Wallet address',`<span class="mono small" style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${state.wallet.wallet_address}</span><button class="mini-btn" id="pCopyAddr"><i data-lucide="copy"></i></button>`,'','Simulated · demo only')+
      setRow('smartphone','Mobile',`<span class="muted small">${u.mobile}</span>`)+
      setRow('mail','Email',`<span class="muted small">${u.email||'Not added'}</span>`)+
      setRow('calendar','Account created',`<span class="muted small">${fmtDate(u.created_at,true)}</span>`))}`;
  $('#profileSettings').innerHTML=
    rows('Preferences',
      setRow(theme==='dark'?'moon':'sun','Dark mode',`<span class="switch ${theme==='dark'?'on':''}" id="swTheme"></span>`)+
      setRow('bell-ring','Notifications',`<span class="switch ${prefs.notifications!==false?'on':''}" id="swNotif"></span>`)+
      setRow('globe','Language',`<span class="muted small">${{en:'English',hi:'हिन्दी',es:'Español'}[prefs.lang||'en']}</span>`,'rowLang'))+
    rows('Security',
      setRow('shield','Security & 2FA','','rowSecurity','Simulated security centre'))+
    rows('Data',
      setRow('refresh-cw','Refresh market data','','rowRefresh')+
      setRow('power','Log out','','rowLogout'));
  icons();
  $('#pCopyAddr').onclick=e=>{ e.stopPropagation(); copyText(state.wallet.wallet_address); };
  $('#swTheme').parentElement.onclick=()=>toggleTheme();
  $('#swNotif').parentElement.onclick=()=>{ const on=getPrefs().notifications!==false;
    setPrefs({notifications:!on}); toast(`Notifications ${on?'muted':'enabled'} (local preference)`,'info'); renderProfile(); };
  $('#rowLang').onclick=()=>openSheet('sheetLang');
  $('#rowSecurity').onclick=()=>{ renderSecurity(); openSheet('sheetSecurity'); };
  $('#rowRefresh').onclick=async ()=>{ await loadPrices(); renderAll(); toast('Market data refreshed','success'); };
  $('#rowLogout').onclick=doLogout;
}
function toggleTheme(){
  const t=document.documentElement.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem(LS_THEME,t); applyTheme(t);
  if(state.view==='profile') renderProfile();
}
async function doLogout(){
  const ok=await confirmDialog('Log out','End your simulated session on this device?','Log out');
  if(!ok) return;
  clearSession();
  location.reload();
}
 $$('#langList .lang-row').forEach(b=>b.onclick=()=>{
  $$('#langList .lang-row').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); setPrefs({lang:b.dataset.lang});
  toast('Language preference saved (interface simulation)','success');
  if(state.view==='profile') renderProfile();
});

/* ============================== SECURITY (SIMULATED) ============================== */
function secScore(){ const p=getPrefs();
  let s=60; if(p.twoFA)s+=25; if(state.user.email)s+=10; if(s>100)s=100; return s; }
function renderSecurity(){
  const p=getPrefs(), score=secScore(), C=2*Math.PI*30;
  const logins=JSON.parse(localStorage.getItem(LS_LOGINS)||'[]');
  $('#securityBody').innerHTML=`
    <div class="score-ring">
      <div style="position:relative;width:76px;height:76px;flex:none">
        <svg width="76" height="76"><circle class="bg" cx="38" cy="38" r="30" fill="none" stroke-width="7"/>
        <circle class="fg" cx="38" cy="38" r="30" fill="none" stroke-width="7"
          stroke-dasharray="${C}" stroke-dashoffset="${C*(1-score/100)}"/></svg>
        <span class="score-num">${score}</span></div>
      <div><b style="font-family:var(--fd);font-size:16px">Security score</b>
        <p class="muted small">Illustrative score based on your simulated settings. No real security is enforced.</p></div>
    </div>
    <div class="set-group">
      <div class="set-row"><i data-lucide="key-round"></i><span class="grow">Two-factor authentication
        <div class="kv-line">Interface simulation only</div></span>
        <span class="switch ${p.twoFA?'on':''}" id="sw2fa"></span></div>
      <div class="set-row" style="cursor:default"><i data-lucide="smartphone"></i><span class="grow">Active device
        <div class="kv-line">${deviceLabel()} · current session</div></span></div>
    </div>
    <div id="twoFaBox" ${p.twoFA?'hidden':''}></div>
    <div class="set-group"><div class="group-label">Login activity (this device)</div>
      ${logins.slice(0,5).map(l=>`<div class="set-row" style="cursor:default"><i data-lucide="history"></i>
        <span class="grow">${l.device}<div class="kv-line">${fmtDate(l.time,true)}</div></span></div>`).join('')
      ||'<div class="set-row" style="cursor:default"><span class="muted small">No recorded logins yet.</span></div>'}
    </div>
    <div class="note-card"><i data-lucide="shield-alert"></i>
      <p>All security features here are interface simulations and must not be trusted for real protection.</p></div>`;
  icons();
  $('#sw2fa').parentElement.onclick=()=>{ getPrefs().twoFA?disable2FA():start2FA(); };
}
async function start2FA(){
  const code=String(Math.floor(100000+Math.random()*900000));
  const box=$('#twoFaBox'); box.hidden=false;
  box.innerHTML=`<div class="set-group"><div class="group-label">Verify (simulated)</div>
    <div class="set-row" style="cursor:default"><i data-lucide="info"></i>
      <span class="grow">Demo code: <b class="mono">${code}</b><div class="kv-line">In a real app this arrives via an authenticator app.</div></span></div>
    <div style="padding:10px 16px 16px"><input id="faCode" class="mono" inputmode="numeric" maxlength="6"
      placeholder="6-digit code" style="width:100%;border:1.5px solid var(--line);border-radius:12px;padding:11px 14px;letter-spacing:.3em;text-align:center">
      <button class="btn btn-primary btn-block" id="faOk" style="margin-top:10px">Verify & enable</button></div></div>`;
  icons();
  $('#faOk').onclick=async ()=>{
    if($('#faCode').value.trim()!==code) return toast('Incorrect code. Check the demo code shown.','error');
    setPrefs({twoFA:true});
    await pushNotif(state.user.id,'security','Two-factor enabled','Two-factor authentication was enabled (interface simulation).');
    renderSecurity(); toast('2FA enabled (simulated)','success');
  };
}
async function disable2FA(){
  setPrefs({twoFA:false});
  await pushNotif(state.user.id,'security','Two-factor disabled','Two-factor authentication was disabled (interface simulation).');
  renderSecurity(); toast('2FA disabled','info');
}

/* ============================== REALTIME ============================== */
function startRealtime(){
  const uid=state.user.id;
  sb.channel('aurix-user')
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'wallets',filter:'user_id=eq.'+uid},
      p=>{ state.wallet={...state.wallet,...p.new}; refreshMoney(true); })
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'transactions'},
      p=>{ const t=p.new;
        if(t.receiver_id!==uid && t.sender_id!==uid) return;
        state.txs.unshift(t);
        if(state.view==='activity')renderActivity(); if(state.view==='home')renderHome();
        if(t.transaction_type==='received'&&t.receiver_id===uid)
          toast(`Received ${fmtCoin(+t.amount,t.coin)} ${t.coin} (≈ ${fmtINR(+t.amount_inr)})`,'success');
      })
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+uid},
      p=>{ state.notifs.unshift(p.new); updateNotifBadge();
        toast(p.new.title,'info');
        if(activeSheet&&activeSheet.id==='sheetNotifs') renderNotifs(); })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'withdrawals',filter:'user_id=eq.'+uid},
      p=>{ const w=p.new, old=state.withdrawals.find(x=>x.id===w.id);
        state.withdrawals=state.withdrawals.map(x=>x.id===w.id?w:x);
        if(old&&old.status!==w.status){
          if(w.status==='Completed') toast('Withdrawal completed — funds successfully delivered.','success');
          else if(w.status==='Rejected'||w.status==='Failed') toast(`Withdrawal ${w.status.toLowerCase()} — crypto returned to your wallet.`,'warn');
          loadNotifs(); }
        if(state.view==='activity')renderActivity(); })
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'announcements'},
      p=>{ state.announcements.unshift(p.new); renderAnnouncement(); toast('New announcement: '+p.new.title,'info'); })
    .subscribe();
}

/* ============================== BOOT ============================== */
async function boot(){
  applyTheme(localStorage.getItem(LS_THEME)||'light');
  bindAuth(); bindNav();
  $$('#pcRanges, .pc-ranges button').forEach?.call; // no-op guard
  $$('.pc-ranges button').forEach(b=>b.onclick=()=>{
    $$('.pc-ranges button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); state.range=b.dataset.range; renderPortfolioChart();
  });
  const sess=getSession();
  if(sess?.logged_in){
    const {data:u}=await sb.from('users').select('*').eq('id',sess.user_id).maybeSingle();
    if(u&&u.is_active){ await enterApp(u,false); return; }
    clearSession();
  }
  showAuth(); icons();
}
document.addEventListener('DOMContentLoaded', boot);
</script>
