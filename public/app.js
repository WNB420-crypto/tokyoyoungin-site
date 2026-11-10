"use strict";
const DAY=864e5, HR=36e5, HALF=4.99, MEMBER_OFF=.15, SHIFTS=3, SHIFT_SECS=45, SHIFT_CAP=15, HATE_LIFE=3.2, CRED_PER=4;
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=c=>"$"+(c/100).toFixed(2);
const num=n=>Number(n).toLocaleString("en-US");
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const IC={
 heart:"M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z",
 down:"M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3",
 flag:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
 share:"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
 home:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
 live:"M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14",
 bag:"M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
 star:"M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z",
 chart:"M18 20V10M12 20V4M6 20v-6",
 search:"M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M21 21l-4.3-4.3"};
const ic=n=>`<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${IC[n]}"/></svg>`;
const PLAT=[["YouTube",/(youtube\.com|youtu\.be)/i],["Instagram",/instagram\.com/i],["TikTok",/tiktok\.com/i],["Facebook",/(facebook\.com|fb\.watch)/i]];
const REWARDS=[
 {id:"pct5",cost:250,label:"5% off one order"},{id:"ship",cost:250,label:"Free shipping on one order"},{id:"pct10",cost:500,label:"10% off one order"},
 {id:"sub",cost:1000,label:"Half off next month's membership"},{id:"pct10x3",cost:1000,label:"10% off your next 3 orders"},{id:"shirt",cost:5000,label:"Free shirt of your choice"}];

/* ---------- state ---------- */
let S=null, ST=null, tab="feed", sTab="numbers", range=30, cartCoupon="", chatTimer=null, chatLast=0;
let cart=[]; try{cart=JSON.parse(localStorage.getItem("ty_cart"))||[]}catch(e){}
const saveCart=()=>{try{localStorage.setItem("ty_cart",JSON.stringify(cart))}catch(e){}};
const seenP=new Set(), seenA=new Set();
async function api(path,body){const r=await fetch("/api/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body||{})});let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.error||"Something went wrong. Try again.");return j}
async function load(){const r=await fetch("/api/state",{cache:"no-store"});S=await r.json();if(S.checkedIn)toast("+3 pts · daily check-in")}
async function loadStudio(){const r=await fetch("/api/owner/data",{cache:"no-store"});ST=r.ok?await r.json():null}
const me=()=>S.me, paid=()=>!!(S.me&&S.me.paid), owner=()=>!!(S.me&&S.me.owner);

/* ---------- helpers ---------- */
function ago(ts){const d=Date.now()-ts;if(d<HR)return Math.max(1,Math.round(d/6e4))+"m ago";if(d<DAY)return Math.round(d/HR)+"h ago";return Math.round(d/DAY)+"d ago"}
function left(ts){const d=Math.max(0,ts-Date.now());return Math.floor(d/HR)+"h "+Math.floor(d%HR/6e4)+"m"}
function tilt(id,list){let h=0;for(const ch of String(id))h=(h*31+ch.charCodeAt(0))>>>0;return list[h%list.length]}
function toast(msg){document.querySelectorAll(".toast").forEach(t=>t.remove());const t=document.createElement("div");t.className="toast";t.setAttribute("role","status");t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3200)}
function burst(el,ch){if(!el)return;const r=el.getBoundingClientRect();for(let i=0;i<4;i++){const s=document.createElement("span");s.className="pop";s.textContent=ch;s.style.left=(r.left+r.width/2-10+(i-1.5)*22)+"px";s.style.top=(r.top-10-i*6)+"px";s.style.animationDelay=(i*70)+"ms";document.body.appendChild(s);setTimeout(()=>s.remove(),1300)}}
function openModal(html){$("#sheet").innerHTML=html;$("#modal").hidden=false;const f=$("#sheet").querySelector("input,select,textarea,button");if(f)f.focus()}
function closeModal(){$("#modal").hidden=true;$("#sheet").innerHTML=""}
function platform(url){for(const [n,re] of PLAT)if(re.test(url))return n;return null}
function validUrl(u){try{const x=new URL(u);return x.protocol==="https:"||x.protocol==="http:"}catch(e){return false}}
function embedSrc(url,pl){let m;
  if(pl==="YouTube"&&(m=url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/)))return "https://www.youtube.com/embed/"+m[1];
  if(pl==="Instagram"&&(m=url.match(/instagram\.com\/(p|reel|tv)\/([\w-]+)/)))return `https://www.instagram.com/${m[1]}/${m[2]}/embed`;
  if(pl==="TikTok"&&(m=url.match(/\/video\/(\d+)/)))return "https://www.tiktok.com/embed/v2/"+m[1];
  if(pl==="Facebook")return "https://www.facebook.com/plugins/video.php?show_text=false&href="+encodeURIComponent(url);
  return null}
function shrink(file,max){return new Promise((ok,bad)=>{const fr=new FileReader();fr.onerror=()=>bad(new Error("That picture could not be read. Try a JPG or PNG."));fr.onload=()=>{const im=new Image();im.onerror=()=>bad(new Error("That picture could not be read. Try a JPG or PNG."));im.onload=()=>{const k=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);c.toBlob(b=>b?ok(b):bad(new Error("That picture could not be read.")),"image/jpeg",.82)};im.src=fr.result};fr.readAsDataURL(file)})}
async function upload(blob,ext,onPct){ // sent in 8 MB pieces so big videos survive a shaky connection
  const CH=8*1024*1024;let file="",sent=0;
  do{const part=blob.slice(sent,sent+CH),q=(file?"file="+file:"ext="+encodeURIComponent(ext))+"&offset="+sent;let j,tries=0;
    for(;;){try{const r=await fetch("/api/owner/upload?"+q,{method:"PUT",body:part});j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j.error||"The upload failed. Try again."),{fatal:r.status<500});break}
      catch(e){if(e.fatal)throw e;if(++tries>=4)throw new Error("The upload was cut off. Check your connection and try again.");await new Promise(r=>setTimeout(r,1500))}}
    file=j.file;sent+=part.size;if(onPct)onPct(blob.size?Math.min(100,Math.round(100*sent/blob.size)):100)}while(sent<blob.size);
  return file}
async function uploadPic(input,max){const f=input&&input.files[0];if(!f)return null;return upload(await shrink(f,max),"jpg")}
const postById=id=>S.posts.find(p=>p.id===id);

/* ---------- feed ---------- */
function mediaHtml(p){
  const m=tilt(p.id,["5deg","-5deg","4deg","-4.5deg"]);
  if(p.kind==="text")return "";
  if(p.locked)return `<div class="media locked" style="--m:${m};--c:${p.color}"><div class="ph">${esc(p.title)}</div><div class="lockmsg"><span>${p.tier==="members"?"Members only":"Members are watching this now"}</span>${p.tier==="early"?`<span class="soft">Everyone else in ${left(p.publicAt)}</span>`:""}<button class="btn pink sm" data-a="go" data-to="join">Unlock for ${money(S.price)}</button></div></div>`;
  if(p.kind==="embed"){const src=embedSrc(p.url,p.platform);
    if(src)return `<div class="media ${p.platform==="TikTok"||p.platform==="Instagram"?"vert":""}" style="--m:${m}"><iframe src="${esc(src)}" title="${esc(p.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
    return `<div class="media" style="--m:${m};--c:${p.color}"><div class="ph"><span class="stamp pen">${esc(p.platform)}</span>${esc(p.title)}<a class="btn white sm" href="${esc(p.url)}" target="_blank" rel="noopener">Watch on ${esc(p.platform)}</a></div></div>`}
  if(p.kind==="photo")return `<div class="media tall" data-a="dbl" data-id="${p.id}" style="--m:${m}"><img src="/media/${esc(p.media)}" alt="${esc(p.title)}" loading="lazy"></div>`;
  return `<div class="media" style="--m:${m};background:#000"><video src="/media/${esc(p.media)}#t=0.1" controls playsinline preload="metadata"></video></div>`;
}
function postCard(p){
  const v=S.votes[p.id]||0, t=tilt(p.id+"x",["-2.2deg","1.6deg","-1.2deg","2.4deg","-2.8deg"]);
  return `<article class="post sk" style="--t:${t}">
   <div class="phead"><img src="/img/badge.png" alt=""><div><b>TokyoYoungin</b><div class="soft">${ago(p.created)} · ${num(p.views)} views</div></div>
   <span style="margin-left:auto" class="row">${p.tier==="early"&&Date.now()<p.publicAt?'<span class="stamp pinkc">Early access</span>':""}${p.tier==="members"?'<span class="stamp pinkc">Members</span>':""}</span></div>
   ${p.kind==="text"?`<h2 style="margin:4px 0 8px;transform:rotate(-1deg)">${esc(p.title)}</h2>`:mediaHtml(p)}
   ${p.locked?"":`<p>${p.kind==="text"?"":`<b>${esc(p.title)}.</b> `}${esc(p.cap)}</p>
   <div class="acts">
    <button class="act ${v===1?"on":""}" data-a="vote" data-id="${p.id}" data-v="1" aria-pressed="${v===1}" aria-label="Like">${ic("heart")}${num(p.likes)}</button>
    <button class="act down ${v===-1?"on":""}" data-a="vote" data-id="${p.id}" data-v="-1" aria-pressed="${v===-1}" aria-label="Dislike">${ic("down")}${num(p.dislikes)}</button>
    <button class="act tip" data-a="tip" data-id="${p.id}">$ Tip${p.tips?` · ${money(p.tips)}`:""}</button>
    <button class="act" data-a="share" aria-label="Share">${ic("share")}</button>
    <button class="act" data-a="report" data-id="${p.id}" aria-label="Report">${ic("flag")}</button></div>`}
  </article>`;
}
function adCard(a){
  return `<aside class="post sk ad" style="--t:1.5deg"><div class="row" style="justify-content:space-between"><span class="stamp">Sponsored</span><span class="soft">${esc(a.client)}</span></div>
   <div class="adimg">${a.img?`<img src="/media/${esc(a.img)}" alt="" loading="lazy">`:esc(a.head)}</div>
   <p style="margin-bottom:10px">${esc(a.head)}</p>
   <a class="btn" href="/go/${a.id}" target="_blank" rel="noopener sponsored">Grab it, it's in your cart</a></aside>`;
}
function renderFeed(){
  let out="", n=0, ai=0; const newP=[], newA=[];
  for(const p of S.posts){out+=postCard(p);n++;if(!p.locked&&!seenP.has(p.id)){seenP.add(p.id);newP.push(p.id)}
    if(n%2===0&&S.ads.length){const a=S.ads[ai%S.ads.length];out+=adCard(a);ai++;if(!seenA.has(a.id)){seenA.add(a.id);newA.push(a.id)}}}
  if(newP.length||newA.length)api("seen",{posts:newP,ads:newA}).catch(()=>{});
  const soc=Object.entries(S.social||{}).filter(([k,v])=>validUrl(v));
  return `<section>
    <div class="cover"><img src="/img/cover.jpg" alt=""></div>
    <div class="who"><div class="ava"><img src="/img/badge.png" alt="TokyoYoungin logo"></div>
      <div class="stats"><span>${S.posts.length}<small>posts</small></span><span>${num(S.counts.list)}<small>on the list</small></span><span>${num(S.counts.members)}<small>members</small></span></div></div>
    <div class="stack" style="margin-top:12px"><h1 style="font-size:30px;transform:rotate(-1.5deg)">TokyoYoungin</h1>
      <p>New Orleans, on camera. Videos, live streams, and whatever the city is talking about today.</p>
      <div class="row"><button class="btn" data-a="go" data-to="join">${me()?"You're on the list":"Follow free"}</button><button class="btn pink" data-a="go" data-to="${paid()?"game":"join"}">${paid()?"Member":"Join "+money(S.price)}</button>
      ${soc.map(([k,v])=>`<a class="btn white sm" href="${esc(v)}" target="_blank" rel="noopener">${k}</a>`).join("")}</div></div>
   </section>
   <div class="stories">
    <button class="story" data-a="go" data-to="live"><span>${S.live.on?"LIVE!":"Live"}</span>${S.live.on?"On now":"Streams"}</button>
    <button class="story" data-a="go" data-to="join"><span>48h</span>Early</button>
    <button class="story" data-a="go" data-to="merch"><span>Merch</span>Store</button>
    <button class="story" data-a="go" data-to="game"><span>Game</span>Detective</button>
    <button class="story" data-a="go" data-to="join"><span>News</span>Updates</button></div>
   ${S.live.on?`<div class="sk" style="--bg:#ffe1e1;transform:rotate(-1.5deg)"><div class="row" style="justify-content:space-between"><b><span class="livedot"></span>Live now: ${esc(S.live.title)}</b><button class="btn red sm" data-a="go" data-to="live">Watch</button></div></div>`:""}
   ${out||'<div class="sk" style="transform:rotate(-1deg)"><h2>First post is on the way</h2><p style="margin-top:6px">Get on the free list and you\'ll know the minute it drops.</p></div>'}`;
}

/* ---------- live ---------- */
function liveStage(){
  const u=S.live.url||"", yt=u.match(/(?:v=|youtu\.be\/|embed\/|live\/)([\w-]{11})/), tw=u.match(/twitch\.tv\/([\w]+)/);
  if(/youtu/.test(u)&&yt)return `<div class="stage has"><iframe src="https://www.youtube.com/embed/${yt[1]}?autoplay=1" title="Live stream" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
  if(tw)return `<div class="stage has"><iframe src="https://player.twitch.tv/?channel=${esc(tw[1])}&parent=${location.hostname}" title="Live stream" allowfullscreen></iframe></div>`;
  let host="the stream";try{host=new URL(u).hostname.replace(/^www\./,"")}catch(e){}
  return `<div class="stage"><div><span class="stamp">LIVE · started ${ago(S.live.started)}</span>${validUrl(u)?`<p style="margin:12px 0">This stream plays on ${esc(host)}.</p><a class="btn" href="${esc(u)}" target="_blank" rel="noopener">Watch live</a>`:'<p style="margin-top:12px">The stream link is coming up.</p>'}</div></div>`;
}
function renderLive(){
  if(!S.live.on)return `<h1 style="transform:rotate(-2deg)">Live</h1><div class="stage"><div><h2>Not live right now</h2><p style="margin-top:8px">Get on the free list and you'll hear about the next stream first.</p></div></div><div><button class="btn" data-a="go" data-to="join">Tell me when he's live</button></div>`;
  return `<h1 style="transform:rotate(-2deg)"><span class="livedot"></span>${esc(S.live.title)}</h1>${liveStage()}
   <div class="sk stack" style="transform:rotate(1deg)"><h3>Chat</h3><div class="chat" id="chat"><span class="soft" id="chatEmpty">Say something first.</span></div>
    <div class="row">${me()?`<input type="text" id="chatIn" aria-label="Chat message" placeholder="Type here" style="flex:1;width:auto" maxlength="140"><button class="btn sm" data-a="chat">Send</button>`:`<button class="btn white sm" data-a="go" data-to="join">Log in to chat</button>`}<button class="btn pink sm" data-a="tip" data-id="live">$ Tip</button></div></div>`;
}
async function pollChat(){
  if(tab!=="live")return;
  try{const r=await fetch("/api/chat?after="+chatLast,{cache:"no-store"}),j=await r.json();
    if(!!j.live.on!==!!S.live.on||j.live.started!==S.live.started){await load();chatLast=0;return render()}
    const box=$("#chat");if(!box)return;
    box.querySelectorAll("p[data-id]").forEach(p=>{if(!j.ids.includes(+p.dataset.id))p.remove()});
    for(const m of j.msgs){chatLast=Math.max(chatLast,m.id);const p=document.createElement("p");p.dataset.id=m.id;p.innerHTML=`<b>${esc(m.who)}${m.owner?" ★":""}:</b> ${esc(m.text)}${owner()?` <button data-a="chatDel" data-id="${m.id}" aria-label="Remove message">remove</button>`:""}`;box.appendChild(p);box.scrollTop=box.scrollHeight}
    const e=$("#chatEmpty");if(e&&box.querySelector("p"))e.remove();
  }catch(e){}
}

/* ---------- merch ---------- */
const prod=id=>S.products.find(p=>p.id===id);
const priceFor=p=>paid()?Math.round(p.cents*(1-MEMBER_OFF)):p.cents;
function cartCalc(){
  cart=cart.filter(i=>prod(i.id));
  const items=cart.map(i=>({...i,p:prod(i.id)})), sub=items.reduce((a,i)=>a+priceFor(i.p)*i.q,0);let ship=S.ship,off=0;
  const c=me()?S.me.coupons.find(x=>String(x.id)===String(cartCoupon)):null;
  if(c){if(c.type==="pct5")off=Math.round(sub*.05);if(c.type==="pct10"||c.type==="pct10x3")off=Math.round(sub*.1);if(c.type==="ship")ship=0;if(c.type==="shirt"){const sh=items.filter(i=>i.p.shirt).map(i=>priceFor(i.p));if(sh.length)off=Math.max(...sh)}}
  return {items,sub,ship,off,c,total:Math.max(0,sub-off)+ship}}
function renderMerch(){
  const count=cart.filter(i=>prod(i.id)).reduce((a,b)=>a+b.q,0);
  if(!S.products.length)return `<h1 style="transform:rotate(-2deg)">Merch</h1><div class="stage"><div><h2>Merch is on the way</h2><p style="margin-top:8px">Members get 15% off everything when it drops.</p></div></div>`;
  return `<h1 style="transform:rotate(-2deg)">Merch</h1>
   <p class="note">${paid()?"Member price is on. You're saving 15% on everything.":`Members save 15% on everything. <a href="#join">Join for ${money(S.price)}</a>`}</p>
   <div class="grid2">${S.products.map(p=>{const sizes=(p.sizes||"").split(",").filter(Boolean);return `<div class="prod sk"><div class="swatch ${p.img?"photo":""}" style="--c:#fff">${p.img?`<img src="/media/${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">`:`<img src="/img/badge.png" alt="">`}</div><h3>${esc(p.name)}</h3>
     <p>${paid()?`<s class="soft">${money(p.cents)}</s> `:""}<b>${money(priceFor(p))}</b></p>
     ${sizes.length?`<select id="size${p.id}" aria-label="Size for ${esc(p.name)}">${sizes.map(s=>`<option>${esc(s)}</option>`).join("")}</select>`:""}
     <button class="btn sm" data-a="add" data-id="${p.id}" style="margin-top:8px">Add to cart</button></div>`}).join("")}</div>
   ${count?`<div class="cartbar sk" style="--bg:var(--yellow)"><div class="row" style="justify-content:space-between"><b>${count} in cart · ${money(cartCalc().sub)}</b><button class="btn white sm" data-a="cart">Check out</button></div></div>`:""}`;
}

/* ---------- join ---------- */
function renderJoin(){
  const m=me();
  return `<h1 style="transform:rotate(-2deg)">${m?"Your spot":"Get on the list"}</h1>
   <div class="sk stack" style="transform:rotate(1.2deg)"><h2>${m?"Your account":"Make an account"}</h2>
    ${m?`<p>Signed in as <b>${esc(m.email)}</b>${m.owner?' <span class="stamp">Owner</span>':""}</p><div class="row"><button class="btn white sm" data-a="logout">Log out</button>${m.owner?'<button class="btn sm" data-a="go" data-to="studio">Open Studio</button>':""}</div>`
     :`<p>Free. You get site news, new video alerts, and a heads up before he goes live.</p>
       <div><label for="auEmail">Email</label><input type="email" id="auEmail" placeholder="you@example.com" autocomplete="email"></div>
       <div><label for="auPass">Password (8 characters or more)</label><input type="password" id="auPass" autocomplete="current-password" style="width:100%;background:#fff;border:2.5px solid var(--ink);border-radius:12px 4px 13px 5px/5px 12px 4px 13px;padding:8px 10px;font-size:18px"></div>
       <div class="row"><button class="btn" data-a="register">Create account</button><button class="btn white" data-a="login">Log in</button></div>
       <p class="soft">Making an account puts your email on the free list.</p>`}</div>
   ${m?"":`<div class="sk stack flat" style="transform:rotate(-1deg)"><h3>Just want the emails?</h3><div><label for="freeEmail">Your email</label><input type="email" id="freeEmail" placeholder="you@example.com" autocomplete="email"></div><div><button class="btn white sm" data-a="joinFree">Add me to the free list</button></div></div>`}
   <div class="sk stack" style="--bg:#fff0f8;transform:rotate(-1.5deg)"><h2>Member · ${money(S.price)} a month</h2>
    <ul style="margin:0;padding-left:22px"><li>Every upload 48 hours before everyone else</li><li>Members-only videos</li><li>15% off all merch</li><li>Detective Tokyo, the members game. Earn points for discounts and free merch</li></ul>
    ${m&&m.subHalf?`<p class="note">Reward applied. Your next month is $${HALF}.</p>`:""}
    ${paid()?`<p><span class="stamp pinkc">Member</span>${m.subStatus==="canceling"?" Your membership ends when this billing month is over.":""}</p>${!m.owner&&m.subStatus!=="canceling"?'<div><button class="btn white sm" data-a="cancelPaid">Cancel membership</button></div>':""}`
      :S.payments?`<div><button class="btn pink" data-a="joinPaid">Become a member</button></div>`:'<p class="note">Memberships open soon.</p>'}</div>
   <div class="stack"><h2 style="transform:rotate(-1deg)">News board</h2>${S.updates.length?S.updates.map((u,i)=>`<div class="sk flat" style="transform:rotate(${i%2?1:-1}deg)"><h3>${esc(u.subj)}</h3><p>${esc(u.msg)}</p><p class="soft">${ago(u.ts)}</p></div>`).join(""):'<p class="soft">Nothing posted yet.</p>'}</div>`;
}

/* ---------- Detective Tokyo ---------- */
const INTEL=["The corner store is bringing back the hot sausage po-boy on Friday.","Somebody's uncle is DJing the block party and only brought one record.","The streetcar was on time today. Nobody believes it.","A new snoball flavor drops this weekend. It's blue. That's all anybody knows.","The brass band on the corner takes requests now, but only one.","The parade route moved two blocks. The ladder people are already there.","Crawfish prices went down. Act normal.","That pothole on the avenue finally got a traffic cone."];
const STREETS=["CANAL","BOURBON","FRERET","MAGAZINE","ESPLANADE","TCHOUPITOULAS","CLAIBORNE"];
const G={on:false,last:null};
const pick=a=>a[Math.floor(Math.random()*a.length)], shuffle=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(x=>x[1]);
function makeQuest(){
  const t=pick(["count","mash","street"]);
  if(t==="count"){const n=5+Math.floor(Math.random()*5),thing=pick(["crawfish","Mardi Gras beads","king cake babies"]);return {t,ans:n,pitch:`Count my ${thing} before they get away and I'll talk.`,opts:shuffle([n-1,n,n+1]),dots:n}}
  if(t==="mash"){const [pitch,verb]=pick([["Help me push my car off the neutral ground.","PUSH"],["Fan this grill before the block party starts.","FAN"],["Pump my bike tire, I'm late for the second line.","PUMP"]]);return {t,pitch,verb,need:10}}
  const name=pick(STREETS);let sc=name;while(sc===name)sc=shuffle(name.split("")).join("");
  return {t,ans:name,pitch:"I forgot what street I stay on. Unscramble it for me.",scr:sc,opts:shuffle([name,...shuffle(STREETS.filter(s=>s!==name)).slice(0,2)])}
}
async function gStart(){
  if(!paid()||G.on||G.starting)return;G.starting=true;
  try{const r=await api("gameStart");S.me.day.shifts++;
    Object.assign(G,{on:true,id:r.id,t:0,cred:0,heat:0,supply:6,spots:Array.from({length:6},()=>({s:"empty",age:0})),spawnIn:1,intel:[],quest:null,stranger:null,sIdx:0,ig:false,note:""});
    render();drawQuest();G.timer=setInterval(gTick,250);
  }finally{G.starting=false}
}
function gTick(){
  if(!G.on)return;G.t+=.25;
  G.spots.forEach(sp=>{sp.age+=.25;if(sp.s==="hate"&&sp.age>=HATE_LIFE){sp.s="empty";sp.age=0;G.cred-=3;G.heat++;G.note="A hate poster stayed up too long. -3 cred.";drawQuest()}});
  if(G.heat>=3){G.ig=true;G.cred-=12;return gEnd()}
  G.spawnIn-=.25;
  if(G.spawnIn<=0){const c=G.spots.filter(sp=>sp.s==="empty"||(sp.s==="mine"&&sp.age>5));if(c.length){const sp=pick(c);sp.s="hate";sp.age=0}G.spawnIn=Math.max(.65,1.7-G.t*.03)}
  if(G.sIdx<2&&G.t>=[10,26][G.sIdx]&&!G.quest&&!G.stranger){G.stranger={q:makeQuest(),left:6};G.sIdx++;G.note="";drawQuest()}
  if(G.stranger){G.stranger.left-=.25;if(G.stranger.left<=0){G.stranger=null;G.note="The stranger walked off.";drawQuest()}}
  if(G.quest){G.quest.left-=.25;if(G.quest.left<=0)gAnswer(false)}
  if(G.t>=SHIFT_SECS)return gEnd();
  gDraw();
}
function gDraw(){
  const hud=$("#ghud");if(!hud)return;
  hud.innerHTML=`<span class="stamp pen">${Math.ceil(SHIFT_SECS-G.t)}s</span><span class="stamp" style="color:var(--ink)">Cred ${G.cred}</span><span class="stamp pinkc">Posters ${G.supply}</span><span class="stamp">IG strikes ${G.heat}/3</span>`;
  G.spots.forEach((sp,i)=>{const el=$("#sp"+i);if(!el)return;
    if(el.dataset.s!==sp.s){el.dataset.s=sp.s;el.className="spot "+sp.s;el.innerHTML=sp.s==="hate"?'BAN<br>TOKYO<i class="bar"></i>':sp.s==="mine"?'<img src="/img/badge.png" alt="TokyoYoungin poster">':"+ poster";el.setAttribute("aria-label",sp.s==="hate"?"Hate poster, tap to rip down":sp.s==="mine"?"Your poster":"Empty wall, tap to put up a poster")}
    if(sp.s==="hate"){const b=el.querySelector(".bar");if(b)b.style.transform="scaleX("+Math.max(0,1-sp.age/HATE_LIFE)+")"}});
}
function gSpot(i){
  if(!G.on)return;const sp=G.spots[i],el=$("#sp"+i);
  if(sp.s==="hate"){sp.s="empty";sp.age=0;G.cred+=1;burst(el,"rip!")}
  else if(sp.s==="empty"){if(G.supply<=0)return toast("Out of posters this shift");sp.s="mine";sp.age=0;G.supply--;G.cred+=1;burst(el,"+1")}
  gDraw();
}
function gAnswer(ok){
  if(!G.quest)return;G.quest=null;
  if(ok){const line=pick(INTEL.filter(x=>!G.intel.includes(x)));G.intel.push(line);G.cred+=4;G.note="Intel, +4 cred: "+line}else G.note="No deal. The stranger kept quiet.";
  drawQuest();gDraw();
}
function drawQuest(){
  const el=$("#gquest");if(!el)return;const q=G.quest;
  if(G.stranger)el.innerHTML=`<button class="btn white" data-a="gTalk" style="width:100%">Stranger: "${esc(G.stranger.q.pitch)}" Tap to help</button>`;
  else if(!q)el.innerHTML=`<p class="soft">${esc(G.note||"Rip down the hate posters. Put yours up on the empty spots. Strangers trade intel for favors.")}</p>`;
  else if(q.t==="count")el.innerHTML=`<p>${esc(q.pitch)}</p><div class="dots">${"<i></i>".repeat(q.dots)}</div><div class="row">${q.opts.map(o=>`<button class="btn white sm" data-a="gAns" data-v="${o}">${o}</button>`).join("")}</div>`;
  else if(q.t==="mash")el.innerHTML=`<p>${esc(q.pitch)}</p><button class="btn pink" data-a="gMash">${q.verb} (${q.need} more)</button>`;
  else el.innerHTML=`<p>${esc(q.pitch)} <b style="font-family:var(--display);letter-spacing:2px">${q.scr}</b></p><div class="row">${q.opts.map(o=>`<button class="btn white sm" data-a="gAns" data-v="${o}">${o}</button>`).join("")}</div>`;
}
async function gEnd(){
  clearInterval(G.timer);if(!G.on)return;G.on=false;
  const last={cred:G.cred,pts:0,intel:G.intel.slice(),ig:G.ig};G.last=last;
  try{const r=await api("gameEnd",{id:G.id,cred:G.cred,intel:G.intel.length});last.pts=r.pts}catch(e){toast(e.message)}
  try{await load()}catch(e){}
  if(tab==="game")render();else $("#topJoin").textContent=paid()?num(S.me.pts)+" pts":"Join "+money(S.price);
}
function rewardsHtml(can){
  return `<div class="sk stack" style="transform:rotate(1deg)"><h3>Rewards</h3><div class="tblwrap"><table>${REWARDS.map(r=>`<tr><td>${esc(r.label)}${r.id==="sub"?` ($${HALF})`:""}</td><td class="n">${num(r.cost)} pts</td>${can?`<td class="n"><button class="btn sm" data-a="redeem" data-r="${r.id}" ${S.me.pts<r.cost||(r.id==="sub"&&(S.me.subHalf||S.me.owner))?"disabled":""}>Get</button></td>`:""}</tr>`).join("")}</table></div>
   <p class="soft">One reward per order. Rewards stack on top of the member price.</p></div>`;
}
function earnHtml(){
  const d=paid()?S.me.day:null, left=(n,max)=>d?` <span class="soft">(${n} of ${max} today)</span>`:"";
  return `<div class="sk stack" style="transform:rotate(-1deg)"><h3>How points add up</h3><div class="tblwrap"><table>
   <tr><td>Detective shift${left(d?d.shifts:0,SHIFTS)}</td><td class="n">up to ${SHIFT_CAP} each</td></tr>
   <tr><td>Daily check-in</td><td class="n">3</td></tr>
   <tr><td>Share the site${left(d?d.shares:0,2)}</td><td class="n">2 each</td></tr>
   <tr><td>Like or dislike a post${left(d?d.votes:0,3)}</td><td class="n">1 each</td></tr>
   <tr><td>Tip a post, once a day</td><td class="n">5</td></tr></table></div></div>`;
}
function renderGame(){
  const rules=`<div class="sk stack"><h3>The job</h3><ul style="margin:0;padding-left:22px"><li>Rip down a BAN TOKYO poster: +1 cred</li><li>Put up a TokyoYoungin poster: +1 cred, 6 per shift</li><li>Help a stranger with their side quest: +4 cred and a piece of intel</li><li>Hate poster stays up too long: -3 cred and a strike</li><li>3 strikes and they take down your Instagram: -12 cred, shift over</li><li>Every ${CRED_PER} cred banks 1 point, up to ${SHIFT_CAP} a shift. A bad shift can cost you up to 10.</li></ul></div>`;
  if(!paid())return `<div class="row" style="justify-content:space-between"><h1 style="transform:rotate(-2deg)">Detective Tokyo</h1><span class="stamp pinkc">Members</span></div>
   <div class="stage"><div><h2>The streets need intel</h2><p style="margin-top:8px">Members play as Detective Tokyo and earn points toward discounts and free merch.</p></div></div>
   <div><button class="btn pink" data-a="go" data-to="join">Join for ${money(S.price)} to play</button></div>${rules}${rewardsHtml(false)}${earnHtml()}`;
  if(G.on)return `<div class="row" style="justify-content:space-between"><h1 style="transform:rotate(-2deg)">On the case</h1><div class="row" id="ghud"></div></div>
   <div class="sk flat gq" id="gquest"></div>
   <div class="wall">${G.spots.map((sp,i)=>`<button class="spot empty" id="sp${i}" data-a="gSpot" data-i="${i}" data-s="empty">+ poster</button>`).join("")}</div>`;
  const d=S.me.day, next=[250,500,1000,5000].find(c=>c>S.me.pts)||5000, L=G.last;
  return `<div class="row" style="justify-content:space-between"><h1 style="transform:rotate(-2deg)">Detective Tokyo</h1><span class="stamp pinkc">Members</span></div>
   <div class="sk stack" style="--bg:#fff3c9;transform:rotate(-1.5deg)"><div class="row" style="justify-content:space-between;align-items:flex-end"><div><span class="soft">Your points</span><b style="font-family:var(--display);font-weight:400;font-size:44px;display:block;line-height:1">${num(S.me.pts)}</b></div><span class="soft">${num(S.me.intel)} intel fed to the streets</span></div>
    <div class="meter"><i style="width:${Math.min(100,100*S.me.pts/next)}%"></i></div><p class="soft">${S.me.pts>=5000?"Top of the board.":num(next-S.me.pts)+" to go until the "+num(next)+" point reward"}</p></div>
   ${L?`<div class="sk stack" style="transform:rotate(1.5deg)"><h3>${L.ig?"They took down your Instagram":"Shift report"}</h3><p>${L.cred} cred, so <b>${L.pts>0?"+":""}${L.pts} points</b>.</p>${L.intel.length?`<ul style="margin:0;padding-left:22px">${L.intel.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:'<p class="soft">No intel this time. Help the strangers.</p>'}</div>`:""}
   <div class="stack"><div><button class="btn red" data-a="gStart" ${d.shifts>=SHIFTS?"disabled":""}>${d.shifts>=SHIFTS?"No shifts left today":"Start a 45 second shift"}</button></div><p class="soft">${Math.max(0,SHIFTS-d.shifts)} of ${SHIFTS} shifts left today</p></div>
   ${rules}${rewardsHtml(true)}${earnHtml()}`;
}

/* ---------- studio ---------- */
function series(arr){const g=range===90?7:1,n=Math.min(arr.length,range===90?91:range),src=arr.slice(-n),out=new Array(Math.ceil(n/g)).fill(0);for(let i=0;i<n;i++)out[Math.floor(i/g)]+=src[i];return out}
function chart(vals,color,fmt){
  const W=320,H=150,top=18,bot=20,max=Math.max(1,...vals),bw=(W-12)/vals.length,r=rng(vals.length*13+7);
  const bars=vals.map((v,i)=>{const h=Math.max(v?3:0,(H-top-bot)*v/max),x=6+i*bw+bw*.14,y=H-bot-h,rot=(r()*5-2.5).toFixed(1);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw*.72).toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" stroke="#141414" stroke-width="${vals.length>20?1:1.8}" transform="rotate(${rot} ${(x+bw*.36).toFixed(1)} ${H-bot})"><title>${fmt(v)}</title></rect>`}).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart, highest bar ${fmt(max)}"><g filter="url(#wob)"><path d="M4 ${H-bot+1} Q160 ${H-bot+4} 316 ${H-bot}" stroke="#141414" stroke-width="2.5" fill="none"/><path d="M4 ${top} H316" stroke="#bbb" stroke-dasharray="5 5" fill="none"/>${bars}</g>
   <text x="6" y="12">top: ${fmt(max)}${range===90?" a week":" a day"}</text><text x="6" y="${H-5}">${range} days ago</text><text x="314" y="${H-5}" text-anchor="end">today</text></svg>`;
}
const WORLD={"North America & Caribbean":"US CA MX GL BM PM AG AI AW BS BB BZ BQ VG KY CR CU CW DM DO SV GD GP GT HT HN JM MQ MS NI PA PR BL KN LC MF VC SX TT TC VI","South America":"AR BO BR CL CO EC FK GF GY PY PE SR UY VE","Europe":"AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA AX SJ","Africa":"DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW","Asia & Middle East":"AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE","Oceania":"AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV UM VU WF"};
const partOf=c=>{for(const [k,v] of Object.entries(WORLD))if(v.split(" ").includes(c))return k;return c?"Somewhere else":"Not known"};
let regionNames=null;try{regionNames=new Intl.DisplayNames(["en"],{type:"region"})}catch(e){}
const countryName=c=>{if(!c)return "Not known";try{return (regionNames&&regionNames.of(c))||c}catch(e){return c}};
function studioPlaces(){
  const days=new Set(ST.days.slice(-(range===90?91:range))), by={}, parts={}, states={}, cities={};let total=0;
  (ST.places||[]).forEach(r=>{if(!days.has(r.day))return;by[r.c]=(by[r.c]||0)+r.n;const p=partOf(r.c);parts[p]=(parts[p]||0)+r.n;total+=r.n;
    if(r.r){const k=r.r+"|"+r.c;states[k]=(states[k]||0)+r.n}
    if(r.t){const k=r.t+"|"+(r.c==="US"&&r.r?r.r:countryName(r.c));cities[k]=(cities[k]||0)+r.n}});
  const pct=n=>total?Math.round(100*n/total)+"%":"0%", bar=n=>`<div class="meter" style="height:10px;margin-top:3px"><i style="width:${total?100*n/total:0}%;background:var(--pen)"></i></div>`;
  const rows=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]);
  const tbl=(head,list,label)=>`<div class="tblwrap"><table><tr><th>${head}</th><th class="n">Visitors</th><th class="n">Share</th></tr>${list.map(([k,n])=>`<tr><td>${label(k)}</td><td class="n">${num(n)}</td><td class="n">${pct(n)}</td></tr>`).join("")}</table></div>`;
  const more=(o,n,what)=>rows(o).length>n?`<p class="soft">Showing the top ${n} of ${rows(o).length} ${what}.</p>`:"";
  const two=k=>{const [a,b]=k.split("|");return esc(a)+(b?` <span class="soft">${esc(b)}</span>`:"")};
  return `<div class="sk stack" style="transform:rotate(1deg)"><h3>Where visitors come from, last ${range} days</h3>
   ${total?`${tbl("Part of the world",rows(parts),k=>esc(k)+bar(parts[k]))}
   ${tbl("Country",rows(by).slice(0,15),c=>esc(countryName(c)))}${more(by,15,"countries")}
   ${rows(states).length?tbl("State or region",rows(states).slice(0,15),k=>{const [a,c]=k.split("|");return esc(a)+(c&&c!=="US"?` <span class="soft">${esc(countryName(c))}</span>`:"")})+more(states,15,"states and regions"):""}
   ${rows(cities).length?tbl("City",rows(cities).slice(0,20),two)+more(cities,20,"cities"):""}`:'<p class="soft">No visitors in this window yet.</p>'}
   <p class="soft">${ST.cityReady?"":ST.geoReady?"City and state lookup is still loading, so new visits show a country only for now. ":"The location lookup is still loading, so new visits show as not known for now. "}Worked out from each visitor's internet address, so city is approximate and phone networks can show a nearby city. Only the place is saved, never the address. Visits from before this was added show as not known. <a href="https://db-ip.com" target="_blank" rel="noopener">IP Geolocation by DB-IP</a></p></div>`;
}
function studioNumbers(){
  const since=Date.now()-range*DAY, visits=series(ST.visits), dons=series(ST.dons), sum=a=>a.reduce((x,y)=>x+y,0);
  const by={};ST.donations.filter(d=>d.ts>=since).forEach(d=>{const k=d.post_id||"?";by[k]=by[k]||{amt:0,n:0};by[k].amt+=d.cents;by[k].n++});
  const name=id=>id==="live"?"Live stream tips":(postById(id)?postById(id).title:"Removed post");
  const likes=S.posts.reduce((a,p)=>a+p.likes,0), dis=S.posts.reduce((a,p)=>a+p.dislikes,0);
  return `${S.payments?(ST.webhook?"":'<p class="note">Stripe is connected but payment confirmations are not reaching the site yet. Tips and memberships will not be recorded until that is fixed.</p>'):'<p class="note">Payments are off. Tips, memberships and merch checkout turn on when the Stripe key is added in Railway.</p>'}
   <div class="chips" role="group" aria-label="Time frame">${[7,30,90].map(n=>`<button class="chip ${range===n?"on":""}" data-a="range" data-n="${n}">Last ${n} days</button>`).join("")}</div>
   <div class="tiles">
    <div class="tile sk" style="transform:rotate(-2deg)"><span class="soft">Visitors</span><b>${num(sum(visits))}</b></div>
    <div class="tile sk" style="--bg:#fff3c9;transform:rotate(1.5deg)"><span class="soft">Donations</span><b>${money(sum(dons))}</b></div>
    <div class="tile sk" style="transform:rotate(2deg)"><span class="soft">Likes, all time</span><b>${num(likes)}</b></div>
    <div class="tile sk" style="transform:rotate(-1.5deg)"><span class="soft">Dislikes, all time</span><b>${num(dis)}</b></div></div>
   <p class="note">Dislikes are for your eyes only. They never lower how many people see a post.</p>
   <div class="sk stack" style="transform:rotate(1deg)"><h3>Site traffic</h3><p class="soft">People who visited each day</p>${chart(visits,"#2456d6",num)}</div>
   ${studioPlaces()}
   <div class="sk stack" style="transform:rotate(-1deg)"><h3>Donations over time</h3>${chart(dons,"#fdb913",money)}</div>
   <div class="sk stack"><h3>Donations by post, last ${range} days</h3><div class="tblwrap"><table><tr><th>Post</th><th class="n">Tips</th><th class="n">Total</th></tr>
    ${Object.entries(by).sort((a,b)=>b[1].amt-a[1].amt).map(([id,o])=>`<tr><td>${esc(name(id))}</td><td class="n">${o.n}</td><td class="n">${money(o.amt)}</td></tr>`).join("")||'<tr><td colspan="3" class="soft">No donations in this window.</td></tr>'}</table></div></div>
   <div class="sk stack"><h3>Likes and dislikes by post</h3><div class="tblwrap"><table><tr><th>Post</th><th class="n">Views</th><th class="n">Likes</th><th class="n">Dislikes</th></tr>
    ${S.posts.slice().sort((a,b)=>b.views-a.views).map(p=>`<tr><td>${esc(p.title)}</td><td class="n">${num(p.views)}</td><td class="n">${num(p.likes)}</td><td class="n">${num(p.dislikes)}</td></tr>`).join("")||'<tr><td colspan="4" class="soft">No posts yet.</td></tr>'}</table></div></div>`;
}
function studioPost(){
  return `<div class="sk stack" style="transform:rotate(-1deg)"><h2>New post</h2>
   <div><label for="npKind">What is it?</label><select id="npKind" data-ch="kind"><option value="video">Video upload</option><option value="photo">Picture</option><option value="embed">Link from YouTube, Instagram, TikTok or Facebook</option><option value="text">Just words</option></select></div>
   <div><label for="npTitle">Title</label><input type="text" id="npTitle" maxlength="90"></div>
   <div><label for="npCap">Caption</label><textarea id="npCap" maxlength="500"></textarea></div>
   <div id="npFileWrap"><label for="npFile">File</label><input type="file" id="npFile" accept="video/*"></div>
   <div id="npUrlWrap" hidden><label for="npUrl">Paste the link</label><input type="url" id="npUrl" placeholder="https://"></div>
   <div><label for="npTier">Who sees it?</label><select id="npTier"><option value="public">Everyone, right now</option><option value="early">Members now, everyone in 48 hours</option><option value="members">Members only</option></select></div>
   <div><button class="btn" data-a="publish" id="npGo">Post it</button></div></div>
   <div class="sk stack"><h3>Your posts</h3><div class="tblwrap"><table>${S.posts.map(p=>`<tr><td>${esc(p.title)}<div class="soft">${ago(p.created)} · ${p.tier==="public"?"everyone":p.tier==="members"?"members only":Date.now()<p.publicAt?"public in "+left(p.publicAt):"everyone"}</div></td><td class="n"><button class="btn white sm" data-a="delPost" data-id="${p.id}">Delete</button></td></tr>`).join("")||'<tr><td class="soft">Nothing posted yet.</td></tr>'}</table></div></div>`;
}
function studioLive(){
  return `<div class="sk stack" style="transform:rotate(1deg)"><h2>${S.live.on?'<span class="livedot"></span>You are live':"Go live"}</h2>
   ${S.live.on?`<p>${esc(S.live.title)} · started ${ago(S.live.started)}</p><div class="row"><button class="btn red" data-a="endLive">End stream</button><button class="btn white sm" data-a="go" data-to="live">Open the live room</button></div>`
   :`<div><label for="liveTitle">Stream title</label><input type="text" id="liveTitle" maxlength="80" placeholder="Pulling up on Frenchmen"></div>
     <div><label for="liveUrl">Stream link</label><input type="url" id="liveUrl" placeholder="https://youtube.com/live/..."></div>
     <div><button class="btn red" data-a="startLive">Go live on the site</button></div>`}
   <p class="note">Start the stream on YouTube, TikTok, Instagram or Facebook, then paste its link here. YouTube and Twitch play right on the site. The others open from a Watch live button. Chat and tipping run on the site either way.</p></div>`;
}
function studioReports(){
  return `<div class="stack"><h2 style="transform:rotate(-1deg)">Report queue</h2>${ST.reports.length?ST.reports.map((r,i)=>`<div class="sk stack" style="transform:rotate(${i%2?1.2:-1.2}deg)"><div class="row" style="justify-content:space-between"><span class="stamp">${esc(r.reason)}</span><span class="soft">${ago(r.ts)}</span></div>
    <p><b>${esc(r.title||"Post already removed")}</b></p>${r.details?`<p>"${esc(r.details)}"</p>`:""}
    <div class="row"><button class="btn white sm" data-a="repKeep" data-id="${r.id}">Keep post, clear report</button>${r.title?`<button class="btn red sm" data-a="repRemove" data-id="${r.id}">Take post down</button>`:""}</div></div>`).join(""):'<p class="soft">Nothing waiting. Reports show up here with the reason the person gave.</p>'}</div>`;
}
function studioLists(){
  const tbl=(rows,isPaid)=>`<div class="tblwrap"><table><tr><th>Email</th><th class="n">Joined</th>${isPaid?'<th class="n">Pays</th>':""}</tr>${rows.map(s=>`<tr><td>${esc(s.email)}</td><td class="n">${ago(s.ts)}</td>${isPaid?`<td class="n">${money(S.price)}/mo</td>`:""}</tr>`).join("")||`<tr><td colspan="3" class="soft">Nobody yet.</td></tr>`}</table></div>`;
  return `<div class="sk stack" style="transform:rotate(-1deg)"><div class="row" style="justify-content:space-between"><h3>Free list · ${ST.subsFree.length}</h3><button class="btn white sm" data-a="copyList" data-l="subsFree">Copy emails</button></div>${tbl(ST.subsFree)}</div>
   <div class="sk stack" style="--bg:#fff0f8;transform:rotate(1deg)"><div class="row" style="justify-content:space-between"><h3>Paid members · ${ST.subsPaid.length}</h3><button class="btn white sm" data-a="copyList" data-l="subsPaid">Copy emails</button></div><p>Monthly from members: <b>${money(ST.subsPaid.length*S.price)}</b></p>${tbl(ST.subsPaid,true)}</div>
   <div class="sk stack"><h3>Post an update</h3><div><label for="upSubj">Headline</label><input type="text" id="upSubj" maxlength="80"></div><div><label for="upMsg">Message</label><textarea id="upMsg" maxlength="600"></textarea></div><div><button class="btn" data-a="postUpdate">Put it on the news board</button></div>
   <p class="note">Updates go on the news board. To email a list, copy the emails into your mail app.</p></div>`;
}
function studioAds(){
  const byClient={};ST.ads.forEach(a=>{const c=byClient[a.client]=byClient[a.client]||{imps:0,clicks:0,n:0};c.imps+=a.imps;c.clicks+=a.clicks;c.n++});
  const ctr=(c,i)=>i?(100*c/i).toFixed(1)+"%":"0%";
  return `<div class="sk stack" style="transform:rotate(1deg)"><h3>Results by client</h3><div class="tblwrap"><table><tr><th>Client</th><th class="n">Seen</th><th class="n">Clicks</th><th class="n">Click rate</th></tr>
    ${Object.entries(byClient).map(([n,c])=>`<tr><td>${esc(n)}<div class="soft">${c.n} ad${c.n>1?"s":""}</div></td><td class="n">${num(c.imps)}</td><td class="n">${num(c.clicks)}</td><td class="n">${ctr(c.clicks,c.imps)}</td></tr>`).join("")||'<tr><td colspan="4" class="soft">No ads yet.</td></tr>'}</table></div></div>
   <div class="stack">${ST.ads.map((a,i)=>`<div class="sk stack flat" style="transform:rotate(${i%2?-1:1}deg)"><div class="row" style="justify-content:space-between"><b>${esc(a.head)}</b><span class="stamp ${a.active?"pen":""}">${a.active?"Running":"Paused"}</span></div>
     <p class="soft" style="word-break:break-all">${esc(a.client)} · ${esc(a.url)}</p><p>${num(a.imps)} seen · ${num(a.clicks)} clicks · ${ctr(a.clicks,a.imps)}</p>
     <div class="row"><button class="btn white sm" data-a="adToggle" data-id="${a.id}">${a.active?"Pause":"Run"}</button><button class="btn white sm" data-a="adDel" data-id="${a.id}">Delete</button></div></div>`).join("")}</div>
   <div class="sk stack" style="--bg:#fff7d6;transform:rotate(-1deg)"><h2>New ad</h2>
    <div><label for="adClient">Client</label><input type="text" id="adClient" maxlength="60" placeholder="Business name"></div>
    <div><label for="adHead">Ad line</label><input type="text" id="adHead" maxlength="80" placeholder="What are they selling?"></div>
    <div><label for="adImg">Picture</label><input type="file" id="adImg" accept="image/*"></div>
    <div><label for="adUrl">Referral link</label><input type="url" id="adUrl" placeholder="https://store.com/cart?add=item&ref=tokyoyoungin"><p class="soft">Use the client's add-to-cart link so the item is waiting at checkout when a fan taps the ad.</p></div>
    <div><button class="btn" data-a="adSave">Run this ad</button></div></div>`;
}
function studioMerch(){
  return `<div class="sk stack" style="transform:rotate(1deg)"><h3>Products</h3><div class="tblwrap"><table>${S.products.map(p=>`<tr><td>${esc(p.name)}<div class="soft">${money(p.cents)}${p.sizes?" · "+esc(p.sizes):""}${p.shirt?" · counts as a shirt":""}</div></td><td class="n"><button class="btn white sm" data-a="prodDel" data-id="${p.id}">Delete</button></td></tr>`).join("")||'<tr><td class="soft">No products yet. The store shows "on the way" until you add one.</td></tr>'}</table></div></div>
   <div class="sk stack" style="--bg:#fff7d6;transform:rotate(-1deg)"><h2>New product</h2>
    <div><label for="pdName">Name</label><input type="text" id="pdName" maxlength="60"></div>
    <div><label for="pdPrice">Price in dollars</label><input type="number" id="pdPrice" min="1" step="0.01" inputmode="decimal" placeholder="32"></div>
    <div><label for="pdImg">Picture</label><input type="file" id="pdImg" accept="image/*"></div>
    <div><label for="pdSizes">Sizes, separated by commas (leave empty if none)</label><input type="text" id="pdSizes" maxlength="80" placeholder="S, M, L, XL, 2XL"></div>
    <label class="check" for="pdShirt"><input type="checkbox" id="pdShirt"> This is a shirt (the 5,000 point reward can claim it)</label>
    <div><button class="btn" data-a="prodSave">Add to the store</button></div>
    <p class="note">Shipping is a flat ${money(S.ship)} per order, US addresses only.</p></div>`;
}
function studioOrders(){
  return `<div class="stack"><h2 style="transform:rotate(-1deg)">Orders</h2>${ST.orders.length?ST.orders.map((o,i)=>{const a=o.ship&&o.ship.address;return `<div class="sk stack" style="transform:rotate(${i%2?1:-1}deg)"><div class="row" style="justify-content:space-between"><b>${money(o.cents)}</b><span class="stamp ${o.shipped?"pen":""}">${o.shipped?"Shipped":"To ship"}</span></div>
    <p>${o.items.map(x=>`${x.q} × ${esc(x.n)}${x.s?" ("+esc(x.s)+")":""}`).join(", ")}</p>
    <p class="soft">${esc(o.email)} · ${ago(o.ts)}</p>${a?`<p>${esc(o.ship.name||"")}<br>${esc(a.line1||"")} ${esc(a.line2||"")}<br>${esc(a.city||"")}, ${esc(a.state||"")} ${esc(a.postal_code||"")}</p>`:""}
    <div><button class="btn white sm" data-a="shipped" data-id="${o.id}">${o.shipped?"Mark not shipped":"Mark shipped"}</button></div></div>`}).join(""):'<p class="soft">No merch orders yet.</p>'}</div>`;
}
function studioPoints(){
  const gameMax=SHIFTS*SHIFT_CAP, siteMax=15, typ=35, max=gameMax+siteMax;
  return `<div class="sk stack" style="transform:rotate(-1deg)"><h2>Points math</h2>
   <p>A member can bank at most <b>${gameMax}</b> points a day from the game and <b>${siteMax}</b> from the site (${max} total). A steady daily player lands near ${typ}.</p>
   <div class="tblwrap"><table><tr><th>Reward</th><th class="n">Points</th><th class="n">Steady</th><th class="n">Fastest</th></tr>
   ${REWARDS.map(r=>`<tr><td>${esc(r.label)}</td><td class="n">${num(r.cost)}</td><td class="n">${Math.ceil(r.cost/typ)}d</td><td class="n">${Math.ceil(r.cost/max)}d</td></tr>`).join("")}</table></div></div>
   ${earnHtml()}
   <div class="sk stack flat"><h3>All members</h3><p>${num(ST.points.earned)} points earned · ${num(ST.points.spent)} spent · ${ST.unused} unused reward${ST.unused===1?"":"s"}</p></div>`;
}
function studioLinks(){
  return `<div class="sk stack" style="transform:rotate(-1deg)"><h2>Social links</h2><p class="soft">These show as buttons on the profile.</p>
   ${["YouTube","Instagram","TikTok","Facebook"].map(k=>`<div><label for="soc${k}">${k}</label><input type="url" id="soc${k}" value="${esc((S.social||{})[k]||"")}" placeholder="https://"></div>`).join("")}
   <div><button class="btn" data-a="saveSocial">Save links</button></div></div>${loginForm(false)}`;
}
function loginForm(first){
  return `<div class="sk stack" style="--bg:#fff3c9;transform:rotate(-1deg)"><h2>${first?"Make this login yours":"Your login"}</h2>
   <p>${first?"You signed in with a starter login. Pick your own username and password before you go in.":"Change the username or password you sign in with."}</p>
   <div><label for="nlName">Username or email</label><input type="text" id="nlName" maxlength="60" autocapitalize="none" autocomplete="username" value="${first?"":esc(S.me.email)}"></div>
   <div><label for="nlPass">New password (8 characters or more)</label><input type="password" id="nlPass" autocomplete="new-password" class="pw"></div>
   <div><label for="nlPass2">Type the password again</label><input type="password" id="nlPass2" autocomplete="new-password" class="pw"></div>
   <div><button class="btn" data-a="setLogin">Save my login</button></div></div>`;
}
function renderStudio(){
  if(owner()&&S.me.mustChange)return `<h1 style="transform:rotate(-2deg)">Studio</h1>${loginForm(true)}`;
  if(!owner())return `<h1 style="transform:rotate(-2deg)">Studio</h1><div class="sk stack" style="transform:rotate(1deg)"><h2>Owner login</h2>
    ${me()?`<p>You're signed in as ${esc(S.me.email)}, which is not the owner account.</p><div><button class="btn white sm" data-a="logout">Log out</button></div>`
    :`<div><label for="auEmail">Username or email</label><input type="text" id="auEmail" autocapitalize="none" autocomplete="username"></div><div><label for="auPass">Password</label><input type="password" id="auPass" autocomplete="current-password" style="width:100%;background:#fff;border:2.5px solid var(--ink);border-radius:12px 4px 13px 5px/5px 12px 4px 13px;padding:8px 10px;font-size:18px"></div><div><button class="btn" data-a="login">Log in</button></div>`}</div>`;
  if(!ST)return `<h1 style="transform:rotate(-2deg)">Studio</h1><p class="soft">Loading your numbers.</p>`;
  const tabs=[["numbers","Numbers"],["post","Post"],["golive","Go live"],["reports","Reports"],["lists","Lists"],["ads","Ads"],["merch","Merch"],["orders","Orders"],["points","Points"],["links","Links & login"]];
  const toShip=ST.orders.filter(o=>!o.shipped).length;
  const body={numbers:studioNumbers,post:studioPost,golive:studioLive,reports:studioReports,lists:studioLists,ads:studioAds,merch:studioMerch,orders:studioOrders,points:studioPoints,links:studioLinks}[sTab]();
  return `<div class="row" style="justify-content:space-between"><h1 style="transform:rotate(-2deg)">Studio</h1><span class="stamp">Owner only</span></div>
   <div class="chips">${tabs.map(([k,l])=>`<button class="chip ${sTab===k?"on":""}" data-a="stab" data-k="${k}">${l}${k==="reports"&&ST.reports.length?` (${ST.reports.length})`:""}${k==="orders"&&toShip?` (${toShip})`:""}</button>`).join("")}</div>${body}`;
}

/* ---------- shell ---------- */
function render(){
  const R={feed:renderFeed,live:renderLive,game:renderGame,merch:renderMerch,join:renderJoin,studio:renderStudio};
  $("#view").innerHTML=R[tab]();
  const nav=[["feed","home","Feed"],["live","live","Live"],["game","search","Game"],["merch","bag","Merch"],["join","star",me()?"Me":"Join"]];
  if(owner())nav.push(["studio","chart","Studio"]);
  const badge=owner()&&ST?ST.reports.length+ST.orders.filter(o=>!o.shipped).length:0;
  $("#nav").innerHTML=nav.map(([k,i,l])=>`<a href="#${k}" class="${tab===k?"on":""}" ${tab===k?'aria-current="page"':""}>${ic(i)}${l}${k==="live"&&S.live.on?'<span class="badge">!</span>':""}${k==="studio"&&badge?`<span class="badge">${badge}</span>`:""}</a>`).join("");
  $("#topJoin").textContent=paid()?num(S.me.pts)+" pts":"Join "+money(S.price);$("#topJoin").dataset.to=paid()?"game":"join";
  clearInterval(chatTimer);if(tab==="live"){chatLast=0;pollChat();chatTimer=setInterval(pollChat,4000)}
}
async function route(){
  const h=location.hash.slice(1);tab=["feed","live","game","merch","join","studio"].includes(h)?h:"feed";
  if(G.on&&tab!=="game")gEnd();
  render();window.scrollTo(0,0);
  const was=JSON.stringify(S),t=tab; // pick up anything that changed since the last look
  try{await load();if(tab==="studio"&&owner())await loadStudio()}catch(e){return}
  if(tab===t&&!G.on&&(tab==="studio"||JSON.stringify(S)!==was))render();
}
function go(to){if(location.hash==="#"+to)route();else location.hash=to}
async function refresh(){await load();if(owner()&&tab==="studio")await loadStudio();render()}
window.addEventListener("hashchange",route);

/* ---------- actions ---------- */
function tipSheet(id){
  const what=id==="live"?"the live stream":`"${esc(postById(id).title)}"`;
  openModal(`<div class="stack"><h2>Tip TokyoYoungin</h2><p>For ${what}</p>
   <div class="row" id="tipAmts">${[2,5,10,25].map(a=>`<button class="chip ${a===5?"on":""}" data-a="tipAmt" data-n="${a}">$${a}</button>`).join("")}</div>
   <div><label for="tipCustom">Or type an amount</label><input type="number" id="tipCustom" min="1" max="500" step="1" inputmode="decimal" placeholder="5"></div>
   <div><label for="tipName">Your name (optional)</label><input type="text" id="tipName" maxlength="40"></div>
   ${S.payments?'<p class="soft">You\'ll finish on a secure card page.</p>':'<p class="note">Tipping opens soon.</p>'}
   <div class="row"><button class="btn" data-a="tipSend" data-id="${id}" ${S.payments?"":"disabled"}>Send tip</button><button class="btn white sm" data-a="close">Never mind</button></div></div>`);
}
function reportSheet(id){
  openModal(`<div class="stack"><h2>Report this post</h2><p class="soft">"${esc(postById(id).title)}"</p>
   <div><label for="repReason">Why are you reporting it? (required)</label><select id="repReason" data-ch="rep"><option value="">Pick a reason</option>${S.reasons.map(r=>`<option>${esc(r)}</option>`).join("")}</select></div>
   <div><label for="repDetails">Tell us more <span id="repNeed">(optional)</span></label><textarea id="repDetails" maxlength="400" data-ch="rep"></textarea></div>
   <div class="row"><button class="btn red" id="repSend" data-a="repSend" data-id="${id}" disabled>Send report</button><button class="btn white sm" data-a="close">Cancel</button></div></div>`);
}
function repValid(){const r=$("#repReason").value,d=$("#repDetails").value.trim(),other=r==="Something else";$("#repNeed").textContent=other?"(required for this reason)":"(optional)";$("#repSend").disabled=!r||(other&&d.length<5)}
const creds=()=>({email:$("#auEmail").value.trim(),password:$("#auPass").value});
const A={
 go:d=>go(d.to), close:closeModal,
 dbl:(d,el)=>{const n=Date.now();if(el._t&&n-el._t<450){if((S.votes[d.id]||0)!==1)A.vote({id:d.id,v:"1"},el);else burst(el,"♥")}el._t=n},
 vote:async(d,el)=>{const v=+d.v,was=S.votes[d.id]||0;if(was!==v)burst(el,v===1?"♥":"nah");const r=await api("vote",{id:d.id,v});await load();
   const p=postById(d.id),box=el.closest(".acts")||document.querySelector(`.act[data-id="${d.id}"]`).closest(".acts"),now=S.votes[d.id]||0; // patch in place so a playing video keeps playing
   if(p&&box){const up=box.querySelector('[data-v="1"]'),dn=box.querySelector('[data-v="-1"]');up.classList.toggle("on",now===1);dn.classList.toggle("on",now===-1);up.innerHTML=ic("heart")+num(p.likes);dn.innerHTML=ic("down")+num(p.dislikes)}
   if(r.gained){toast("+1 pt · reacting to a post");$("#topJoin").textContent=num(S.me.pts)+" pts"}},
 share:()=>{const u=encodeURIComponent(location.origin),t=encodeURIComponent("TokyoYoungin: New Orleans, on camera");
   openModal(`<div class="stack"><h2>Share the site</h2>${paid()?`<p class="soft">Members get 2 points a share, up to 2 a day. Today: ${S.me.day.shares} of 2.</p>`:""}
    <div class="row"><a class="btn white" data-a="shared" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${u}">Facebook</a><a class="btn white" data-a="shared" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?url=${u}&text=${t}">X</a><a class="btn white" data-a="shared" target="_blank" rel="noopener" href="https://wa.me/?text=${t}%20${u}">WhatsApp</a><button class="btn white" data-a="copyLink">Copy link</button></div>
    <div><button class="btn white sm" data-a="close">Done</button></div></div>`)},
 shared:async()=>{const r=await api("share");if(r.gained){await load();toast("+2 pts · sharing the site");$("#topJoin").textContent=num(S.me.pts)+" pts"}},
 copyLink:async()=>{try{await navigator.clipboard.writeText(location.origin);toast("Link copied")}catch(e){return toast("Copy the link from your browser's address bar")}A.shared()},
 tip:d=>tipSheet(d.id),
 tipAmt:(d,el)=>{document.querySelectorAll("#tipAmts .chip").forEach(c=>c.classList.remove("on"));el.classList.add("on");$("#tipCustom").value=""},
 tipSend:async(d,el)=>{const c=parseFloat($("#tipCustom").value),on=document.querySelector("#tipAmts .chip.on"),amt=c>0?c:(on?+on.dataset.n:0);
   if(!(amt>=1&&amt<=500))return toast("Pick an amount between $1 and $500");
   el.disabled=true;try{const r=await api("tip",{id:d.id,amt,name:$("#tipName").value.trim()});location.href=r.url}catch(e){el.disabled=false;throw e}},
 report:d=>reportSheet(d.id),
 repSend:async d=>{await api("report",{id:d.id,reason:$("#repReason").value,details:$("#repDetails").value.trim()});closeModal();toast("Report sent. It's in the review queue.")},
 repKeep:async d=>{await api("owner/repKeep",{id:+d.id});await refresh();toast("Report cleared")},
 repRemove:async d=>{await api("owner/repRemove",{id:+d.id});await refresh();toast("Post taken down")},
 chat:async()=>{const i=$("#chatIn"),t=i.value.trim();if(!t)return;i.value="";await api("chat",{text:t});pollChat();i.focus()},
 chatDel:async d=>{await api("owner/chatDel",{id:+d.id});pollChat()},
 add:(d,el)=>{const id=+d.id,sel=$("#size"+id),size=sel?sel.value:"",f=cart.find(i=>i.id===id&&i.size===size);if(f)f.q=Math.min(10,f.q+1);else cart.push({id,size,q:1});saveCart();burst(el,"+1");render()},
 cart:()=>{const k=cartCalc(),rows=k.items.map((i,n)=>`<tr><td>${esc(i.p.name)}${i.size?" ("+esc(i.size)+")":""} × ${i.q}</td><td class="n">${money(priceFor(i.p)*i.q)}</td><td class="n"><button class="btn white sm" data-a="rm" data-n="${n}">Remove</button></td></tr>`).join("");
   openModal(`<div class="stack"><h2>Your cart</h2><table>${rows}
    <tr><td>Subtotal${paid()?" (member price)":""}</td><td class="n">${money(k.sub)}</td><td></td></tr>
    ${k.c&&k.c.type!=="ship"?`<tr><td>Reward: ${esc(k.c.label)}</td><td class="n">-${money(k.off)}</td><td></td></tr>`:""}
    <tr><td>Shipping</td><td class="n">${k.ship?money(k.ship):"Free"}</td><td></td></tr>
    <tr><td><b>Total</b></td><td class="n"><b>${money(k.total)}</b></td><td></td></tr></table>
    ${me()&&S.me.coupons.length?`<div><label for="cartCoupon">Use a reward (one per order)</label><select id="cartCoupon" data-ch="coupon"><option value="">No reward</option>${S.me.coupons.map(c=>`<option value="${c.id}" ${String(c.id)===String(cartCoupon)?"selected":""}>${esc(c.label)}${c.uses>1?` (${c.uses} left)`:""}</option>`).join("")}</select></div>`:""}
    ${k.c&&k.c.type==="shirt"&&!k.off?'<p class="note">Add a shirt to the cart to use the free shirt.</p>':""}
    ${S.payments?'<p class="soft">Ships to US addresses. You\'ll finish on a secure card page.</p>':'<p class="note">Checkout opens soon.</p>'}
    <div class="row"><button class="btn" data-a="order" ${S.payments?"":"disabled"}>Pay with card</button><button class="btn white sm" data-a="close">Keep shopping</button></div></div>`)},
 rm:d=>{cart.splice(+d.n,1);saveCart();render();if(cart.length)A.cart();else closeModal()},
 order:async(d,el)=>{el.disabled=true;try{const r=await api("checkout",{items:cart.map(i=>({id:i.id,size:i.size,q:i.q})),coupon:cartCoupon||null});location.href=r.url}catch(e){el.disabled=false;throw e}},
 register:async()=>{await api("register",creds());await refresh();toast("Account made. You're on the free list.")},
 login:async()=>{await api("login",creds());await load();if(tab==="studio")return route();render();toast("You're logged in")},
 setLogin:async()=>{const name=$("#nlName").value.trim(),pw=$("#nlPass").value;
   if(name.length<3||/\s/.test(name))return toast("Pick a username with 3 or more characters and no spaces");
   if(pw.length<8)return toast("Use a password with at least 8 characters");if(pw!==$("#nlPass2").value)return toast("The two passwords don't match");
   await api("setLogin",{name,password:pw});await load();await route();toast("Saved. Use your new login from now on.")},
 logout:async()=>{await api("logout");ST=null;await load();go("feed");toast("Logged out")},
 joinFree:async()=>{await api("free",{email:$("#freeEmail").value.trim()});await refresh();toast("You're on the free list")},
 joinPaid:async(d,el)=>{if(!me()){toast("Make an account or log in first, then tap Become a member");const e=$("#auEmail");if(e)e.focus();return}
   el.disabled=true;try{const r=await api("subscribe");location.href=r.url}catch(e){el.disabled=false;throw e}},
 cancelPaid:()=>openModal(`<div class="stack"><h2>Cancel membership?</h2><p>You keep member access until the end of the month you already paid for.</p><div class="row"><button class="btn red" data-a="cancelGo">Yes, cancel</button><button class="btn white sm" data-a="close">Keep it</button></div></div>`),
 cancelGo:async()=>{await api("cancel");closeModal();await refresh();toast("Membership will end after this billing month")},
 stab:d=>{sTab=d.k;render()}, range:d=>{range=+d.n;render()},
 publish:async(d,el)=>{const kind=$("#npKind").value,title=$("#npTitle").value.trim(),cap=$("#npCap").value.trim(),tier=$("#npTier").value,f=$("#npFile").files[0],url=$("#npUrl").value.trim(),body={kind,title,cap,tier};
   if(!title)return toast("Give the post a title first");
   if(kind==="embed"){const pl=platform(url);if(!validUrl(url)||!pl)return toast("Paste a full link from YouTube, Instagram, TikTok or Facebook");body.url=url;body.platform=pl}
   el.disabled=true;
   try{
    if(kind==="video"){if(!f)throw new Error("Choose a video file first");const ext=(f.name.split(".").pop()||"mp4").toLowerCase();body.media=await upload(f,ext,p=>{el.textContent="Uploading "+p+"%"})}
    if(kind==="photo"){if(!f)throw new Error("Choose a picture first");body.media=await upload(await shrink(f,1400),"jpg",p=>{el.textContent="Uploading "+p+"%"})}
    await api("owner/post",body);await load();go("feed");toast(tier==="early"?"Posted. Members see it now, everyone in 48 hours.":"Posted")
   }finally{el.disabled=false;el.textContent="Post it"}},
 delPost:async d=>{await api("owner/delPost",{id:d.id});await refresh();toast("Post deleted")},
 startLive:async()=>{await api("owner/live",{on:true,title:$("#liveTitle").value.trim(),url:$("#liveUrl").value.trim()});await refresh();toast("Live room is open")},
 endLive:async()=>{await api("owner/live",{on:false});await refresh();toast("Stream ended")},
 copyList:async d=>{try{await navigator.clipboard.writeText(ST[d.l].map(s=>s.email).join(", "));toast("Emails copied")}catch(e){toast("Copying is blocked here. Select the emails in the table instead.")}},
 postUpdate:async()=>{await api("owner/update",{subj:$("#upSubj").value,msg:$("#upMsg").value});await refresh();toast("Update is on the news board")},
 adSave:async(d,el)=>{const b={client:$("#adClient").value.trim(),head:$("#adHead").value.trim(),url:$("#adUrl").value.trim()};
   if(!b.client||!b.head)return toast("Add the client name and the ad line");if(!validUrl(b.url))return toast("The referral link needs to be a full web address starting with https://");
   el.disabled=true;try{b.img=await uploadPic($("#adImg"),1000);await api("owner/ad",b);await refresh();toast("Ad is running in the feed")}finally{el.disabled=false}},
 adToggle:async d=>{await api("owner/adToggle",{id:+d.id});await refresh()},
 adDel:async d=>{await api("owner/adDel",{id:+d.id});await refresh();toast("Ad deleted")},
 prodSave:async(d,el)=>{const b={name:$("#pdName").value.trim(),price:parseFloat($("#pdPrice").value),sizes:$("#pdSizes").value,shirt:$("#pdShirt").checked};
   if(!b.name)return toast("Give the product a name");if(!(b.price>=1))return toast("Set a price of $1 or more");
   el.disabled=true;try{b.img=await uploadPic($("#pdImg"),1000);await api("owner/product",b);await refresh();toast("Added to the store")}finally{el.disabled=false}},
 prodDel:async d=>{await api("owner/productDel",{id:+d.id});await refresh();toast("Product deleted")},
 shipped:async d=>{await api("owner/shipped",{id:+d.id});await refresh()},
 saveSocial:async()=>{const b={};for(const k of ["YouTube","Instagram","TikTok","Facebook"])b[k]=$("#soc"+k).value.trim();await api("owner/social",b);await refresh();toast("Links saved")},
 gStart:()=>gStart(), gSpot:d=>gSpot(+d.i), gTalk:()=>{if(G.stranger){G.quest=G.stranger.q;G.quest.left=8;G.stranger=null;drawQuest()}}, gAns:d=>gAnswer(d.v===String(G.quest&&G.quest.ans)),
 gMash:(d,el)=>{if(!G.quest)return;G.quest.need--;if(G.quest.need<=0)gAnswer(true);else el.textContent=G.quest.verb+" ("+G.quest.need+" more)"},
 redeem:async d=>{await api("redeem",{r:d.r});await refresh();toast(d.r==="sub"?"Done. Your next month is $"+HALF+".":"Reward saved. Pick it at checkout.")}
};
document.addEventListener("click",e=>{
  if(e.target.id==="modal")return closeModal();
  const el=e.target.closest("[data-a]");if(!el)return;
  const fn=A[el.dataset.a];if(!fn)return;
  if(el.tagName!=="A")e.preventDefault();
  Promise.resolve().then(()=>fn(el.dataset,el)).catch(err=>toast(err.message||"Something went wrong. Try again."));
});
document.addEventListener("input",e=>{if(e.target.dataset.ch==="rep")repValid()});
document.addEventListener("change",e=>{
  if(e.target.dataset.ch==="rep")repValid();
  if(e.target.dataset.ch==="coupon"){cartCoupon=e.target.value;A.cart()}
  if(e.target.dataset.ch==="kind"){const k=e.target.value;$("#npFileWrap").hidden=!(k==="video"||k==="photo");$("#npUrlWrap").hidden=k!=="embed";$("#npFile").accept=k==="photo"?"image/*":"video/*";$("#npFile").value=""}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();if(e.key==="Enter"&&e.target.id==="chatIn")A.chat().catch(err=>toast(err.message))});

(async function start(){
  try{await load()}catch(e){$("#view").innerHTML='<div class="sk"><h2>The site is having trouble loading</h2><p>Refresh in a moment.</p></div>';return}
  const done=new URLSearchParams(location.search).get("done");
  await route();
  if(done){history.replaceState(null,"",location.pathname+location.hash);
    if(done==="order"){cart=[];saveCart();cartCoupon="";toast("Order placed. A receipt is on its way to your email.")}
    if(done==="tip")toast("Thank you. Your tip went through.");
    if(done==="member")toast("Welcome in. Early videos, member prices and the game are unlocked.");
    setTimeout(()=>refresh().catch(()=>{}),2500)}
})();
