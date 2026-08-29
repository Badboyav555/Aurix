'use strict';
/* ============================================================================
   AURIX · Admin console (vanilla JS) · SIMULATOR ONLY
============================================================================ */
const SUPABASE_URL      = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_PUBLIC_KEY';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const COINS = {
  BTC:{name:'Bitcoin',color:'#F7931A',decimals:8,fee:0.00021},
  ETH:{name:'Ethereum',color:'#627EEA',decimals:6,fee:0.0018},
  USDT:{name:'Tether',color:'#26A17B',decimals:2,fee:1},
  SOL:{name:'Solana',color:'#9945FF',decimals:4,fee:0.01},
  XRP:{name:'XRP',color:'#8A959E',decimals:4,fee:0.2},
  DOGE:{name:'Dogecoin',color:'#C2A633',decimals:2,fee:1.5},
  BNB:{name:'BNB',color:'#F0B90B',decimals:5,fee:0.0008},
};
const COIN_SYMS=Object.keys(COINS);
const FALLBACK={BTC:8540000,ETH:282000,USDT:88,SOL:16200,XRP:182,DOGE:14,BNB:52000};
const LS_SESSION='aurix_session', LS_THEME='aurix_theme';

const A={ user:null, users:[], wallets:[], txs:[], wds:[], notifs:[], anns:[],
  sec:'dashboard', userFilter:'all', wdFilter:'all', wdMethod:'all', nfUser:null };

/* ------------------------------- utils ------------------------------- */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const el=h=>{const t=document.createElement('template');t.innerHTML=h.trim();return t.content.firstElementChild;};
const icons=()=>{ if(window.lucide) lucide.createIcons(); };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const inrFmt=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
const fmtINR=n=>inrFmt.format(+n||0);
function fmtCoin(n,sym){ n=+n||0; const d=COINS[sym]?.decimals??2; if(!n)return '0';
  return n.toLocaleString('en-IN',{maximumFractionDigits:Math.abs(n)>=1000?Math.min(d,4):d}); }
const priceOf=s=>+(Prices[s]?.inr??FALLBACK[s]??0);
const Prices={};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function fmtDate(ts,t){ const d=new Date(ts); let s=d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  if(t)s+=', '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); return s; }
function timeAgo(ts){ const s=(Date.now()-new Date(ts).getTime())/1000;
  if(s<60)return 'just now'; if(s<3600)return `${Math.floor(s/60)}m ago`;
  if(s<86400)return `${Math.floor(s/3600)}h ago`; return fmtDate(ts); }
const shortAddr=a=>a?`${a.slice(0,8)}…${a.slice(-6)}`:'—';
const initials=s=>(s||'?').trim().slice(0,2).toUpperCase();
function toast(msg,type='info'){
  const ic={success:'check',error:'x',warn:'triangle-alert',info:'info'}[type]||'info';
  const t=el(`<div class="toast ${type}"><i data-lucide="${ic}"></i><span>${esc(msg)}</span></div>`);
  $('#toastRoot').append(t); icons(); requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),320);},3400);
}
const balCol=s=>s.toLowerCase()+'_balance';

/* ------------------------------- sha256 ------------------------------- */
function sha256(msg){
  const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  if(!sha256.K){
    sha256.K=[];sha256.H=[];const ps=[];let n=2;
    while(ps.length<64){let ok=true;for(const p of ps){if(p*p>n)break;if(n%p===0){ok=false;break;}}if(ok)ps.push(n);n++;}
    for(let i=0;i<64;i++)sha256.K[i]=Math.floor((Math.pow(ps[i],1/3)%1)*4294967296);
    for(let i=0;i<8;i++)sha256.H[i]=Math.floor((Math.sqrt(ps[i])%1)*4294967296);
  }
  const H=sha256.H.slice(),K=sha256.K,b=[...new TextEncoder().encode(msg)],bl=b.length*8;
  b.push(0x80);while(b.length%64!==56)b.push(0);
  for(const v of [Math.floor(bl/4294967296),bl>>>0])for(let s=28;s>=0;s-=8)b.push((v>>>s)&0xff);
  const w=new Array(64);
  for(let i=0;i<b.length;i+=64){
    for(let j=0;j<16;j++)w[j]=(b[i+4*j]<<24)|(b[i+4*j+1]<<16)|(b[i+4*j+2]<<8)|(b[i+4*j+3]);
    for(let j=16;j<64;j++){const s0=rotr(w[j-15],7)^rotr(w[j-15],18)^(w[j-15]>>>3),s1=rotr(w[j-2],17)^rotr(w[j-2],19)^(w[j-2]>>>10);w[j]=(w[j-16]+s0+w[j-7]+s1)|0;}
    let a=H[0],c=H[1],d=H[2],e=H[3],f=H[4],g=H[5],h=H[6],x=H[7];
    for(let j=0;j<64;j++){
      const S1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[j]+w[j])|0;
      const S0=rotr(a,2)^rotr(a,13)^rotr(a,22),mj=(a&c)^(a&x)^(c&x),t2=(S0+mj)|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c;c=x;x=a;a=(t1+t2)|0;}
    [H[0],H[1],H[2],H[3],H[4],H[5],H[6],H[7]]=[(H[0]+a)|0,(H[1]+x)|0,(H[2]+c)|0,(H[3]+d)|0,(H[4]+e)|0,(H[5]+f)|0,(H[6]+g)|0,(H[7]+h)|0];
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
async function verifyPassword(pw,stored){const [salt,h]=(stored||'').split(':');return !!(salt&&h)&&sha256(salt+pw)===h;}
const genHash=()=>{const b=new Uint8Array(32);crypto.getRandomValues(b);
  return '0x'+[...b].map(x=>x.toString(16).padStart(2,'0')).join('');};

/* ------------------------------- market ------------------------------- */
async function loadPrices(silent=true){
  try{
    const r=await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=inr&ids=${COIN_SYMS.map(s=>COINS[s].name.toLowerCase()==='xrp'?'ripple':COINS[s].name.toLowerCase()).join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`);
    if(!r.ok)throw 0;
    const map={bitcoin:'BTC',ethereum:'ETH',tether:'USDT',solana:'SOL',ripple:'XRP',dogecoin:'DOGE',binancecoin:'BNB'};
    (await r.json()).forEach(d=>{const s=map[d.id];if(s)Prices[s]={inr:d.current_price,change:d.price_change_percentage_24h||0};});
    $('#setFeed')&&($('#setFeed').textContent='Live · CoinGecko · '+fmtDate(new Date(),true));
  }catch{
    try{const {data}=await sb.from('market_prices').select('*');
      (data||[]).forEach(p=>{if(!Prices[p.symbol])Prices[p.symbol]={inr:+p.current_price_inr,change:+p.change_percentage};});
      $('#setFeed')&&($('#setFeed').textContent='Cache · Supabase market_prices');
    }catch{ $('#setFeed')&&($('#setFeed').textContent='Hardcoded fallback'); }
  }
  if(!silent){ refreshSection(); toast('Market data refreshed','success'); }
}

/* ------------------------------- modal ------------------------------- */
function openModal(title,html){ $('#admModalTitle').textContent=title; $('#admModalBody').innerHTML=html;
  $('#admModal').hidden=false; $('#admModalBack').hidden=false; icons(); }
function closeModal(){ $('#admModal').hidden=true; $('#admModalBack').hidden=true; }
 $('#admModalClose').onclick=closeModal; $('#admModalBack').onclick=closeModal;

/* ------------------------------- auth ------------------------------- */
function showAdmLogin(){ $('#admAuth').hidden=false; $('#admApp').hidden=true; $('#admUnauthorized').hidden=true; }
function showUnauthorized(){ $('#admAuth').hidden=true; $('#admApp').hidden=true; $('#admUnauthorized').hidden=false; }
 $('#admUnauthBack').onclick=()=>{ localStorage.removeItem(LS_SESSION); location.reload(); };

 $('#admLoginForm').addEventListener('submit',async e=>{
  e.preventDefault(); const err=$('#admLoginErr'); err.hidden=true;
  const id=$('#admId').value.trim(), pw=$('#admPw').value;
  if(!id||!pw) return show('Enter your admin credentials.');
  const btn=$('#admLoginBtn'); btn.disabled=true;
  try{
    const digits=id.replace(/\D/g,''), isMobile=/^\d{10}$/.test(digits);
    const {data:u}=isMobile
      ?await sb.from('users').select('*').eq('mobile',digits).maybeSingle()
      :await sb.from('users').select('*').eq('email',id.toLowerCase()).maybeSingle();
    if(!u) throw 'No account found with those details.';
    if(!(await verifyPassword(pw,u.password_hash))) throw 'Incorrect password.';
    if(u.role!=='admin'){ showUnauthorized(); return; }
    if(!u.is_active) throw 'Your account has been temporarily disabled.';
    await sb.from('users').update({last_login:new Date().toISOString()}).eq('id',u.id);
    localStorage.setItem(LS_SESSION,JSON.stringify({user_id:u.id,username:u.username,role:'admin',logged_in:true}));
    await enterAdmin(u);
  }catch(m){ show(typeof m==='string'?m:'Something went wrong.'); }
  finally{ btn.disabled=false; }
  function show(m){ err.textContent=m; err.hidden=false; }
});

 $('#admLogout').onclick=()=>{ localStorage.removeItem(LS_SESSION); location.reload(); };

/* ------------------------------- shell ------------------------------- */
const SEC_TITLES={dashboard:'Dashboard',users:'Users',wallets:'Wallet management',withdrawals:'Withdrawals',
  transactions:'Transactions',notifications:'Notifications',announcements:'Announcements',settings:'Settings'};
function switchSec(sec){
  A.sec=sec;
  $$('.side-item').forEach(b=>b.classList.toggle('active',b.dataset.sec===sec));
  $$('.adm-sec').forEach(s=>s.hidden=s.id!=='sec-'+sec);
  $('#admTitle').textContent=SEC_TITLES[sec];
  $('#admSide').classList.remove('open'); $('#admSideScrim').hidden=true;
  refreshSection(); icons();
}
 $('#admBurger').onclick=()=>{ $('#admSide').classList.add('open'); $('#admSideScrim').hidden=false; };
 $('#admSideScrim').onclick=()=>{ $('#admSide').classList.remove('open'); $('#admSideScrim').hidden=true; };
 $$('.side-item').forEach(b=>b.onclick=()=>switchSec(b.dataset.sec));
 $('#admThemeBtn').onclick=()=>{
  const t=document.documentElement.dataset.theme==='dark'?'light':'dark';
  localStorage.setItem(LS_THEME,t); document.documentElement.dataset.theme=t;
  $('#admThemeBtn').innerHTML=`<i data-lucide="${t==='dark'?'sun':'moon'}"></i>`; icons(); refreshSection();
};

async function enterAdmin(user){
  A.user=user;
  $('#admAuth').hidden=true; $('#admUnauthorized').hidden=true; $('#admApp').hidden=false;
  $('#admName').textContent=user.username;
  $('#admAvatar').textContent=initials(user.username);
  document.documentElement.dataset.theme=localStorage.getItem(LS_THEME)||'light';
  $('#admThemeBtn').innerHTML=`<i data-lucide="${document.documentElement.dataset.theme==='dark'?'sun':'moon'}"></i>`;
  Chart.defaults.font.family="'Manrope',sans-serif";
  await loadPrices(); await loadAll();
  switchSec('dashboard'); startAdmRealtime();
  const rt=sb.channel('aurix-admin');
  rt.subscribe(st=>{ if(st==='SUBSCRIBED'&&$('#setRealtime'))$('#setRealtime').textContent='Connected'; });
}
async function loadAll(){
  const [u,w,t,d,n,a]=await Promise.all([
    sb.from('users').select('id,username,email,mobile,role,is_active,created_at,last_login').order('created_at',{ascending:false}).limit(1000),
    sb.from('wallets').select('*').limit(1000),
    sb.from('transactions').select('*, s:users!transactions_sender_id_fkey(username), r:users!transactions_receiver_id_fkey(username)').order('created_at',{ascending:false}).limit(1000),
    sb.from('withdrawals').select('*, user:users(username)').order('created_at',{ascending:false}).limit(500),
    sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(30),
    sb.from('announcements').select('*').order('created_at',{ascending:false}).limit(30),
  ]);
  A.users=u.data||[]; A.wallets=w.data||[]; A.txs=t.data||[];
  A.wds=d.data||[]; A.notifs=n.data||[]; A.anns=a.data||[];
}
function refreshSection(){
  ({dashboard:renderDashboard,users:renderUsers,wallets:renderWallets,withdrawals:renderWds,
    transactions:renderTxs,notifications:renderNf,announcements:renderAn,settings:renderSettings})[A.sec]?.();
  icons();
}

/* ------------------------------- dashboard ------------------------------- */
const charts={};
function makeChart(id,cfg){ const cv=$('#'+id); if(!cv)return;
  if(charts[id])charts[id].destroy();
  const dark=document.documentElement.dataset.theme==='dark';
  Chart.defaults.color=dark?'#8B93A2':'#69737F';
  Chart.defaults.borderColor=dark?'#242A35':'#E5E8EE';
  charts[id]=new Chart(cv,cfg); }
function last14(){ const out=[]; for(let i=13;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i);
  out.push(d.toISOString().slice(0,10)); } return out; }

async function renderDashboard(){
  const totalUsers=A.users.length, active=A.users.filter(u=>u.is_active).length;
  const totalValue=A.wallets.reduce((a,w)=>a+COIN_SYMS.reduce((x,s)=>x+(+w[balCol(s)]||0)*priceOf(s),0)+(+w.inr_balance||0),0);
  const pending=A.wds.filter(x=>x.status==='Processing').length, done=A.wds.filter(x=>x.status==='Completed').length;
  const cards=[
    ['users','Total users',totalUsers,'registered accounts'],
    ['user-check','Active users',active,`${totalUsers-active} disabled`],
    ['banknote','Total portfolio',fmtINR(totalValue),'all wallets (simulated)'],
    ['arrow-left-right','Transactions',A.txs.length,'simulated records'],
    ['landmark','Pending withdrawals',pending,'awaiting settlement'],
    ['check-check','Completed withdrawals',done,'paid out (simulated)'],
  ];
  $('#admStats').innerHTML=cards.map(([i,l,v,s])=>`
    <div class="stat-card"><span class="sc-label"><i data-lucide="${i}"></i>${l}</span><b>${v}</b><span class="sc-sub">${s}</span></div>`).join('');
  const days=last14();
  const growth=days.map(d=>A.users.filter(u=>u.created_at.slice(0,10)<=d).length);
  const txs=days.map(d=>A.txs.filter(t=>t.created_at.slice(0,10)===d).length);
  const wdCounts={Processing:0,Completed:0,Failed:0,Rejected:0};
  A.wds.forEach(w=>wdCounts[w.status]=(wdCounts[w.status]||0)+1);
  makeChart('chUsers',{type:'line',data:{labels:days.map(d=>d.slice(5)),datasets:[{data:growth,borderColor:'#3D5AF1',backgroundColor:'rgba(61,90,241,.12)',fill:true,tension:.35,pointRadius:0}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}}}});
  makeChart('chTxs',{type:'bar',data:{labels:days.map(d=>d.slice(5)),datasets:[{data:txs,backgroundColor:'#3D5AF1',borderRadius:5,maxBarThickness:18}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}}}});
  makeChart('chWd',{type:'doughnut',data:{labels:Object.keys(wdCounts),datasets:[{data:Object.values(wdCounts),backgroundColor:['#B97A12','#0B9E6C','#DE4A4F','#8B93A2'],borderWidth:0}]},options:{maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'bottom'}}}});
  $('#admRecentWd').innerHTML=A.wds.slice(0,5).map(w=>`
    <div class="kv"><span><b>${esc(w.user?.username||'—')}</b> · ${w.coin} ${fmtCoin(w.crypto_amount,w.coin)} · ${w.withdrawal_method}</span>
    <b><span class="st-badge st-${w.status}">${w.status}</span></b></div>`).join('')
    ||'<p class="muted small">No withdrawals yet.</p>';
  icons();
}

/* ------------------------------- users ------------------------------- */
function userRow(u){
  const dis=!u.is_active;
  return `<tr>
    <td><div class="u-cell"><span class="avatar-btn static">${initials(u.username)}</span>
      <div><b>${esc(u.username)}</b><div class="muted small">${esc(u.email||u.mobile)}</div></div></div></td>
    <td>${u.role==='admin'?'<span class="st-badge st-Processing" style="background:var(--accent-soft);color:var(--accent)">admin</span>':'<span class="muted small">user</span>'}</td>
    <td>${dis?'<span class="st-badge st-Failed">Disabled</span>':'<span class="st-badge st-Completed">Active</span>'}</td>
    <td class="muted small">${fmtDate(u.created_at)}</td>
    <td><div class="acts">
      <button class="mini-btn" data-uview="${u.id}" title="View"><i data-lucide="eye"></i></button>
      <button class="mini-btn" data-ufund="${u.id}" title="Credit / debit"><i data-lucide="banknote"></i></button>
      <button class="mini-btn warn" data-utoggle="${u.id}" title="${dis?'Enable':'Disable'}"><i data-lucide="${dis?'user-check':'user-x'}"></i></button>
      <button class="mini-btn" data-urole="${u.id}" title="Toggle role"><i data-lucide="shield"></i></button>
    </div></td></tr>`;
}
function renderUsers(){
  const q=$('#admUserSearch').value.trim().toLowerCase(), f=A.userFilter;
  let list=A.users;
  if(f==='active')list=list.filter(u=>u.is_active);
  if(f==='disabled')list=list.filter(u=>!u.is_active);
  if(f==='admin')list=list.filter(u=>u.role==='admin');
  if(q)list=list.filter(u=>[u.username,u.email,u.mobile].some(x=>(x||'').toLowerCase().includes(q)));
  $('#admUserTable').innerHTML=`<table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${list.map(userRow).join('')||'<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">No users match.</td></tr>'}</tbody></table>`;
  icons();
  $$('#admUserTable [data-uview]').forEach(b=>b.onclick=()=>viewUser(b.dataset.uview));
  $$('#admUserTable [data-ufund]').forEach(b=>b.onclick=()=>openFundModal(b.dataset.ufund));
  $$('#admUserTable [data-utoggle]').forEach(b=>b.onclick=()=>toggleUser(b.dataset.utoggle));
  $$('#admUserTable [data-urole]').forEach(b=>b.onclick=()=>toggleRole(b.dataset.urole));
}
 $('#admUserSearch').addEventListener('input',renderUsers);
 $$('#admUserChips .chip').forEach(c=>c.onclick=()=>{
  $$('#admUserChips .chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');
  A.userFilter=c.dataset.uf; renderUsers(); });

async function toggleUser(id){
  const u=A.users.find(x=>x.id===id);
  const ok=confirmDialogA(`${u.is_active?'Disable':'Enable'} account?`,
    `${u.is_active?'A disabled user cannot sign in and sees: "Your account has been temporarily disabled."':'The user will be able to sign in again.'}`);
  if(!ok)return;
  await sb.from('users').update({is_active:!u.is_active}).eq('id',id);
  await pushNotifA(id,'security',u.is_active?'Account disabled':'Account restored',
    u.is_active?'Your account has been temporarily disabled by an administrator.':'Your account has been restored by an administrator.');
  await loadAll(); refreshSection(); toast('User updated','success');
}
async function toggleRole(id){
  const u=A.users.find(x=>x.id===id);
  if(u.id===A.user.id) return toast('You cannot change your own role.','warn');
  if(!confirmDialogA('Change role?',`Set ${u.username}'s role to ${u.role==='admin'?'user':'admin'}?`))return;
  await sb.from('users').update({role:u.role==='admin'?'user':'admin'}).eq('id',id);
  await loadAll(); refreshSection(); toast('Role updated','success');
}
function confirmDialogA(title,msg){ return window.confirm(title+'\n\n'+msg); }

async function viewUser(id){
  const u=A.users.find(x=>x.id===id); if(!u)return;
  const w=A.wallets.find(x=>x.user_id===id);
  const txs=A.txs.filter(t=>t.sender_id===id||t.receiver_id===id).slice(0,6);
  const wds=A.wds.filter(x=>x.user_id===id).slice(0,4);
  openModal('User details',`
    <div class="dtl-head"><span class="profile-avatar" style="width:46px;height:46px;font-size:16px">${initials(u.username)}</span>
      <div><h4 style="font-family:var(--fd)">${esc(u.username)}</h4>
      <span class="muted small">${esc(u.email||'—')} · ${esc(u.mobile)}</span></div></div>
    <div class="wd-info">
      ${['BTC','ETH','USDT','SOL','XRP','DOGE','BNB'].map(s=>`<div class="sumrow"><span>${s}</span><b>${fmtCoin(w?.[balCol(s)],s)}</b></div>`).join('')}
      <div class="sumrow total"><span>INR</span><b>${fmtINR(w?.inr_balance)}</b></div>
      <div class="sumrow"><span>Wallet address</span><b class="mono small">${shortAddr(w?.wallet_address)}</b></div>
      <div class="sumrow"><span>Joined / last login</span><b class="small">${fmtDate(u.created_at)} · ${u.last_login?fmtDate(u.last_login):'never'}</b></div>
    </div>
    <h4 style="font-family:var(--fd);font-size:14px;margin-bottom:8px">Recent transactions</h4>
    <div class="wd-info">${txs.map(t=>`<div class="sumrow"><span>${t.transaction_type} · ${t.coin}</span><b>${fmtCoin(+t.amount,t.coin)}</b></div>`).join('')||'<p class="muted small">None.</p>'}</div>
    <h4 style="font-family:var(--fd);font-size:14px;margin-bottom:8px">Recent withdrawals</h4>
    <div class="wd-info">${wds.map(x=>`<div class="sumrow"><span>${x.withdrawal_method} · ${fmtDate(x.created_at)}</span><b><span class="st-badge st-${x.status}">${x.status}</span></b></div>`).join('')||'<p class="muted small">None.</p>'}</div>
    <div class="wd-actions">
      <button class="btn btn-primary" id="uvFund"><i data-lucide="banknote"></i>Manage funds</button>
      <button class="btn btn-ghost" id="uvToggle"><i data-lucide="${u.is_active?'user-x':'user-check'}"></i>${u.is_active?'Disable':'Enable'}</button>
    </div>`);
  $('#uvFund').onclick=()=>openFundModal(id);
  $('#uvToggle').onclick=async()=>{ closeModal(); await toggleUser(id); };
}

/* --------------------------- wallet management --------------------------- */
function renderWallets(){
  const q=$('#admWalletSearch').value.trim().toLowerCase();
  let list=A.wallets;
  if(q){ const ids=A.users.filter(u=>u.username.toLowerCase().includes(q)).map(u=>u.id);
    list=list.filter(w=>ids.includes(w.user_id)); }
  $('#admWalletTable').innerHTML=`<table class="tbl"><thead><tr><th>User</th><th>Address</th>
    ${COIN_SYMS.map(s=>`<th>${s}</th>`).join('')}<th>INR</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${list.map(w=>{ const u=A.users.find(x=>x.id===w.user_id)||{}; return `<tr>
      <td><b>${esc(u.username||'—')}</b></td><td class="mono small muted">${shortAddr(w.wallet_address)}</td>
      ${COIN_SYMS.map(s=>`<td class="mono small">${fmtCoin(w[balCol(s)],s)}</td>`).join('')}
      <td class="mono small">${fmtINR(w.inr_balance)}</td>
      <td><div class="acts"><button class="mini-btn" data-ufund="${w.user_id}"><i data-lucide="banknote"></i></button></div></td>
    </tr>`;}).join('')||'<tr><td colspan="10" class="muted" style="text-align:center;padding:30px">No wallets match.</td></tr>'}</tbody></table>`;
  icons();
  $$('#admWalletTable [data-ufund]').forEach(b=>b.onclick=()=>openFundModal(b.dataset.ufund));
}
 $('#admWalletSearch').addEventListener('input',renderWallets);

function openFundModal(userId){
  const u=A.users.find(x=>x.id===userId); const w=A.wallets.find(x=>x.user_id===userId);
  if(!u||!w) return toast('User not found.','error');
  openModal('Manage funds — '+u.username,`
    <label class="field"><span>Asset</span>
      <select id="fmAsset">${COIN_SYMS.map(s=>`<option value="${s}">${s} — ${COINS[s].name} (bal ${fmtCoin(w[balCol(s)],s)})</option>`).join('')}
        <option value="INR">INR — Cash (bal ${fmtINR(w.inr_balance)})</option></select></label>
    <label class="field"><span>Action</span>
      <select id="fmAction"><option value="credit">Credit (add funds)</option><option value="debit">Debit (remove funds)</option></select></label>
    <label class="field"><span>Amount</span><input id="fmAmt" type="number" min="0" step="any" placeholder="0.00"></label>
    <div class="sumbox"><div class="sumrow total"><span>Resulting balance</span><b id="fmResult">—</b></div></div>
    <p class="form-err" id="fmErr" hidden></p>
    <div class="wd-actions">
      <button class="btn btn-ghost" id="fmCancel">Cancel</button>
      <button class="btn btn-primary" id="fmApply">Apply</button>
    </div>
    <div class="note-card" style="margin-top:14px"><i data-lucide="info"></i><p>Credits/debits are simulated, create a transaction record and notify the user.</p></div>`);
  const upd=()=>{ const a=$('#fmAsset').value, amt=parseFloat($('#fmAmt').value)||0;
    const cur=a==='INR'?+w.inr_balance:+w[balCol(a)];
    const nv=$('#fmAction').value==='credit'?cur+amt:cur-amt;
    $('#fmResult').textContent=(a==='INR'?fmtINR(Math.max(0,nv)):fmtCoin(Math.max(0,nv),a)+' '+a); };
  ['fmAsset','fmAction','fmAmt'].forEach(i=>$('#'+i).addEventListener('input',upd)); upd();
  $('#fmCancel').onclick=closeModal;
  $('#fmApply').onclick=async()=>{
    const err=$('#fmErr'); err.hidden=true;
    const asset=$('#fmAsset').value, action=$('#fmAction').value, amt=parseFloat($('#fmAmt').value);
    if(!(amt>0)) return show('Enter a valid amount.');
    const cur=asset==='INR'?+w.inr_balance:+w[balCol(asset)];
    if(action==='debit'&&amt>cur) return show('Insufficient wallet balance.');
    try{
      await applyBalanceOp(userId,asset,amt,action);
      await loadAll(); closeModal(); refreshSection();
      toast(`${action==='credit'?'Credited':'Debited'} ${fmtCoin(amt,asset)} ${asset} for ${u.username}`,'success');
    }catch(e){ show(typeof e==='string'?e:'Operation failed.'); }
    function show(m){ err.textContent=m; err.hidden=false; }
  };
}
async function applyBalanceOp(userId,asset,amount,action){
  const {data:w}=await sb.from('wallets').select('*').eq('user_id',userId).single();
  const cur=asset==='INR'?+w.inr_balance:+w[balCol(asset)];
  if(action==='debit'&&amount>cur) throw 'Insufficient wallet balance.';
  await sb.from('wallets').update({[asset==='INR'?'inr_balance':balCol(asset)]:action==='credit'?cur+amount:cur-amount})
    .eq('user_id',userId);
  const price=asset==='INR'?1:priceOf(asset);
  await sb.from('transactions').insert({
    sender_id:action==='credit'?null:userId,
    receiver_id:action==='credit'?userId:null,
    coin:asset, amount, amount_inr:amount*price, tx_hash:genHash(),
    status:'Completed', confirmations:3,
    transaction_type:action==='credit'?'admin_credit':'admin_debit',
    note:`Admin ${action} (simulated)`});
  await pushNotifA(userId,'admin',
    action==='credit'?'Funds added by admin':'Funds deducted by admin',
    `${action==='credit'?'Credited':'Debited'} ${fmtCoin(amount,asset)} ${asset} (≈ ${fmtINR(amount*price)}) by administrator (simulated).`);
}
async function pushNotifA(userId,type,title,message){
  try{ await sb.from('notifications').insert({user_id:userId,type,title,message}); }catch{}
}

/* ------------------------------- withdrawals ------------------------------- */
function renderWds(){
  const q=$('#admWdSearch').value.trim().toLowerCase();
  let list=A.wds;
  if(A.wdFilter!=='all')list=list.filter(w=>w.status===A.wdFilter);
  if(A.wdMethod!=='all')list=list.filter(w=>w.withdrawal_method===A.wdMethod);
  if(q)list=list.filter(w=>(w.user?.username||'').toLowerCase().includes(q));
  $('#admWdTable').innerHTML=`<table class="tbl"><thead><tr><th>User</th><th>Asset</th><th>INR</th><th>Method</th>
    <th>Requested</th><th>Est. arrival</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
    <tbody>${list.map(w=>`<tr>
      <td><b>${esc(w.user?.username||'—')}</b></td>
      <td class="mono small">${w.coin} ${fmtCoin(w.crypto_amount,w.coin)}</td>
      <td class="mono small">${fmtINR(w.amount_inr)}</td>
      <td>${w.withdrawal_method}</td>
      <td class="muted small">${fmtDate(w.created_at)}</td>
      <td class="muted small">${w.estimated_arrival?fmtDate(w.estimated_arrival):'—'}</td>
      <td><span class="st-badge st-${w.status}">${w.status}</span></td>
      <td><div class="acts"><button class="mini-btn" data-wview="${w.id}"><i data-lucide="eye"></i></button></div></td>
    </tr>`).join('')||'<tr><td colspan="8" class="muted" style="text-align:center;padding:30px">No withdrawals match.</td></tr>'}</tbody></table>`;
  icons();
  $$('#admWdTable [data-wview]').forEach(b=>b.onclick=()=>openWdModal(b.dataset.wview));
}
 $('#admWdSearch').addEventListener('input',renderWds);
 $$('#admWdChips .chip').forEach(c=>c.onclick=()=>{
  $$('#admWdChips .chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');
  A.wdFilter=c.dataset.wf; renderWds(); });
 $('#admWdMethod').onchange=e=>{ A.wdMethod=e.target.value; renderWds(); };

function openWdModal(id){
  const w=A.wds.find(x=>x.id===id); if(!w)return;
  openModal('Withdrawal — '+(w.user?.username||''),`
    <div class="wd-info">
      <div class="sumrow"><span>Asset</span><b>${w.coin} ${fmtCoin(w.crypto_amount,w.coin)}</b></div>
      <div class="sumrow"><span>INR value</span><b>${fmtINR(w.amount_inr)}</b></div>
      <div class="sumrow"><span>Method</span><b>${w.withdrawal_method}</b></div>
      ${w.withdrawal_method==='UPI'
        ?`<div class="sumrow"><span>UPI ID</span><b class="mono small">${esc(w.upi_id||'—')}</b></div>`
        :`<div class="sumrow"><span>Bank</span><b>${esc(w.bank_name||'—')}</b></div>
          <div class="sumrow"><span>Holder</span><b>${esc(w.account_holder_name||'—')}</b></div>
          <div class="sumrow"><span>Account</span><b class="mono small">${esc(w.account_number||'—')}</b></div>
          <div class="sumrow"><span>IFSC</span><b class="mono small">${esc(w.ifsc_code||'—')}</b></div>`}
      <div class="sumrow"><span>Requested</span><b>${fmtDate(w.created_at,true)}</b></div>
      <div class="sumrow"><span>Est. arrival</span><b>${w.estimated_arrival?fmtDate(w.estimated_arrival):'—'} (~3 business days)</b></div>
      <div class="sumrow"><span>Status</span><b><span class="st-badge st-${w.status}">${w.status}</span></b></div>
      ${w.completed_at?`<div class="sumrow"><span>Completed</span><b>${fmtDate(w.completed_at,true)}</b></div>`:''}
    </div>
    <div class="note-card"><i data-lucide="shield-alert"></i><p>Reject / Failed returns the crypto to the user's wallet automatically. No real payout ever occurs.</p></div>
    <div class="wd-actions">
      <button class="btn btn-ghost" data-wa="approve"><i data-lucide="check"></i>Approve</button>
      <button class="btn btn-primary" data-wa="complete"><i data-lucide="check-check"></i>Mark completed</button>
      <button class="btn btn-ghost" data-wa="fail"><i data-lucide="x"></i>Mark failed</button>
      <button class="btn btn-danger" data-wa="reject"><i data-lucide="x"></i>Reject</button>
    </div>`);
  $$('#admModalBody [data-wa]').forEach(b=>b.onclick=()=>wdAction(w,b.dataset.wa));
}
async function refundWd(w){
  const {data:wl}=await sb.from('wallets').select('*').eq('user_id',w.user_id).single();
  await sb.from('wallets').update({[balCol(w.coin)]:+wl[balCol(w.coin)]+ +w.crypto_amount}).eq('user_id',w.user_id);
}
async function wdAction(w,act){
  if(!confirmDialogA('Confirm action',`Set withdrawal ${w.id.slice(0,8)} to "${act}"?`))return;
  try{
    if(act==='approve'){
      await sb.from('withdrawals').update({status:'Processing',processing_days_remaining:1}).eq('id',w.id);
      await pushNotifA(w.user_id,'withdrawal','Withdrawal approved','Your withdrawal has been approved and is now being processed (simulated).');
    }
    if(act==='complete'){
      await sb.from('withdrawals').update({status:'Completed',processing_days_remaining:0,completed_at:new Date().toISOString()}).eq('id',w.id);
      await sb.from('transactions').update({status:'Completed'}).eq('tx_hash',w.tx_hash||'∅');
      await pushNotifA(w.user_id,'withdrawal','Funds Successfully Delivered',
        `Your withdrawal of ${fmtCoin(+w.crypto_amount,w.coin)} ${w.coin} (≈ ${fmtINR(+w.amount_inr)}) has been delivered (simulated).`);
    }
    if(act==='reject'||act==='fail'){
      const st=act==='reject'?'Rejected':'Failed';
      await refundWd(w);
      await sb.from('withdrawals').update({status:st}).eq('id',w.id);
      await sb.from('transactions').update({status:st}).eq('tx_hash',w.tx_hash||'∅');
      await pushNotifA(w.user_id,'withdrawal',`Withdrawal ${st.toLowerCase()}`,
        `Your withdrawal of ${fmtCoin(+w.crypto_amount,w.coin)} ${w.coin} was ${st.toLowerCase()}. The crypto has been returned to your wallet.`);
    }
    await loadAll(); closeModal(); refreshSection(); toast('Withdrawal updated','success');
  }catch{ toast('Action failed. Please try again.','error'); }
}

/* ------------------------------- transactions ------------------------------- */
function renderTxs(){
  const q=$('#admTxSearch').value.trim().toLowerCase();
  const c=$('#admTxCoin').value, st=$('#admTxStatus').value, ty=$('#admTxType').value;
  let list=A.txs;
  if(c!=='all')list=list.filter(t=>t.coin===c);
  if(st!=='all')list=list.filter(t=>t.status===st);
  if(ty!=='all')list=list.filter(t=>t.transaction_type===ty);
  if(q)list=list.filter(t=>t.tx_hash.toLowerCase().includes(q)
    ||(t.s?.username||'').toLowerCase().includes(q)||(t.r?.username||'').toLowerCase().includes(q));
  $('#admTxTable').innerHTML=`<table class="tbl"><thead><tr><th>Hash</th><th>From → To</th><th>Coin</th><th>INR</th>
    <th>Type</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>${list.slice(0,200).map(t=>`<tr>
      <td class="mono small">${t.tx_hash.slice(0,10)}…</td>
      <td class="small">${esc(t.s?.username||'system')} → ${esc(t.r?.username||'—')}</td>
      <td class="mono small">${t.coin} ${fmtCoin(+t.amount,t.coin)}</td>
      <td class="mono small">${fmtINR(+t.amount_inr)}</td>
      <td class="small">${t.transaction_type}</td>
      <td><span class="st-badge st-${t.status}">${t.status}</span></td>
      <td class="muted small">${fmtDate(t.created_at)}</td></tr>`).join('')
      ||'<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">No transactions match.</td></tr>'}</tbody></table>`;
  icons();
}
 $('#admTxSearch').addEventListener('input',renderTxs);
['admTxCoin','admTxStatus','admTxType'].forEach(i=>$('#'+i).addEventListener('change',renderTxs));

/* ------------------------------- notifications ------------------------------- */
function renderNf(){
  $('#admNfTarget').value=A.nfTarget;
  $('#admNfUserWrap').hidden=A.nfTarget!=='one';
  $('#admNfUserPick').hidden=A.nfTarget!=='one'||!$('#admNfUser').value.trim();
  $('#admNfRecent').innerHTML=A.notifs.slice(0,12).map(n=>{
    const u=A.users.find(x=>x.id===n.user_id);
    return `<div class="kv"><span><b>${esc(u?.username||'—')}</b> · ${esc(n.title)}<div class="muted small">${esc(n.message)}</div></span>
      <span class="muted small" style="flex:none">${timeAgo(n.created_at)}</span></div>`;}).join('')
    ||'<p class="muted small">Nothing sent yet.</p>';
}
 $('#admNfTarget').onchange=e=>{ A.nfTarget=e.target.value; renderNf(); };
 $('#admNfUser').addEventListener('input',()=>{
  const q=$('#admNfUser').value.trim().toLowerCase();
  const hits=A.users.filter(u=>[u.username,u.mobile,u.email].some(x=>(x||'').toLowerCase().includes(q))).slice(0,6);
  $('#admNfUserPick').innerHTML=hits.map(u=>`<button class="pick-item" data-u="${u.id}">${esc(u.username)} · ${esc(u.mobile)}</button>`).join('');
  $('#admNfUserPick').hidden=!q;
  $$('#admNfUserPick .pick-item').forEach(b=>b.onclick=()=>{
    A.nfPick=b.dataset.u; const u=A.users.find(x=>x.id===A.nfPick);
    $('#admNfUser').value=u.username; $('#admNfUserPick').hidden=true; });
});
 $('#admNfSend').onclick=async()=>{
  const title=$('#admNfTitle').value.trim(), msg=$('#admNfMsg').value.trim();
  if(!title||!msg) return toast('Title and message are required.','warn');
  try{
    if(A.nfTarget==='all'){
      const {data:us}=await sb.from('users').select('id').eq('is_active',true);
      for(const u of us) await pushNotifA(u.id,'admin',title,msg);
      toast(`Notification sent to ${us.length} users`,'success');
    }else{
      const q=$('#admNfUser').value.trim().toLowerCase();
      const u=A.users.find(x=>x.username.toLowerCase()===q)||A.users.find(x=>x.mobile===q)
        ||A.users.find(x=>(x.email||'').toLowerCase()===q)||(A.nfPick?A.users.find(x=>x.id===A.nfPick):null);
      if(!u) return toast('No user matched that name.','error');
      await pushNotifA(u.id,'admin',title,msg);
      toast(`Notification sent to ${u.username}`,'success');
    }
    $('#admNfTitle').value=''; $('#admNfMsg').value='';
    await loadAll(); renderNf();
  }catch{ toast('Could not send notification.','error'); }
};

/* ------------------------------- announcements ------------------------------- */
function renderAn(){
  $('#admAnList').innerHTML=A.anns.map(a=>`
    <div class="kv"><span><span class="st-badge" style="background:var(--accent-soft);color:var(--accent)">${a.type}</span>
      <b style="margin-left:6px">${esc(a.title)}</b><div class="muted small">${esc(a.message)}</div></span>
      <div style="display:flex;align-items:center;gap:8px"><span class="muted small">${timeAgo(a.created_at)}</span>
      <button class="mini-btn danger" data-adel="${a.id}"><i data-lucide="trash-2"></i></button></div></div>`).join('')
    ||'<p class="muted small">No announcements published.</p>';
  icons();
  $$('#admAnList [data-adel]').forEach(b=>b.onclick=async()=>{
    if(!confirmDialogA('Delete announcement?','This removes it from all users\' home screens.'))return;
    await sb.from('announcements').delete().eq('id',b.dataset.adel);
    await loadAll(); renderAn(); toast('Announcement deleted','success'); });
}
 $('#anSend').onclick=async()=>{
  const title=$('#anTitle').value.trim(), msg=$('#anMsg').value.trim(), type=$('#anType').value;
  if(!title||!msg) return toast('Title and message are required.','warn');
  try{
    await sb.from('announcements').insert({title,message:msg,type,created_by:A.user.id});
    $('#anTitle').value=''; $('#anMsg').value='';
    await loadAll(); renderAn(); toast('Announcement published','success');
  }catch{ toast('Could not publish announcement.','error'); }
};

/* ------------------------------- settings ------------------------------- */
function renderSettings(){
  $('#setProject').textContent=(SUPABASE_URL.replace(/^https?:\/\//,'').split('.')[0]||'—');
  $('#setKey').textContent=SUPABASE_ANON_KEY?SUPABASE_ANON_KEY.slice(0,10)+'••••••••':'not configured';
  $('#setRealtime').textContent='Connected (channel active)';
  $('#setFees').innerHTML=COIN_SYMS.map(s=>`<div class="kv"><span>${s} · ${COINS[s].name}</span><b class="mono small">${fmtCoin(COINS[s].fee,s)} ${s} (display only)</b></div>`).join('');
  icons();
}
 $('#admSyncPrices').onclick=()=>loadPrices(false);

/* ------------------------------- realtime ------------------------------- */
function startAdmRealtime(){
  let t=null;
  const kick=()=>{ clearTimeout(t); t=setTimeout(async()=>{ await loadAll(); refreshSection(); },800); };
  sb.channel('aurix-admin-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'transactions'},kick)
    .on('postgres_changes',{event:'*',schema:'public',table:'withdrawals'},kick)
    .on('postgres_changes',{event:'*',schema:'public',table:'users'},kick)
    .subscribe();
}

/* ------------------------------- boot ------------------------------- */
(async function boot(){
  document.documentElement.dataset.theme=localStorage.getItem(LS_THEME)||'light';
  $('#admTxCoin').innerHTML='<option value="all">All coins</option>'+[...COIN_SYMS,'INR'].map(c=>`<option>${c}</option>`).join('');
  const sess=JSON.parse(localStorage.getItem(LS_SESSION)||'null');
  if(sess?.logged_in){
    const {data:u}=await sb.from('users').select('*').eq('id',sess.user_id).maybeSingle();
    if(u){
      if(!u.is_active){ showUnauthorized();
        $('#admUnauthorized h2').textContent='Account Disabled'; return; }
      if(u.role==='admin'){ await enterAdmin(u); return; }
      showUnauthorized(); return;
    }
  }
  showAdmLogin(); icons();
})();
