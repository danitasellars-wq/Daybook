// Daybook reminder service worker — best-effort local notifications.
// Reads reminder config mirrored into IndexedDB by the page (see mirrorReminders()
// in index.html); the page has no other way to hand data to a periodicsync event.
const DB_NAME='daybook_reminders',STORE='kv';
function idbOpen(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function idbGet(key){const db=await idbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).get(key);rq.onsuccess=()=>resolve(rq.result);rq.onerror=()=>reject(rq.error);});}
async function idbSet(key,val){const db=await idbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(val,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
function todayKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

async function checkAndFire(){
  const state=(await idbGet('state'))||{reminders:[],lastFired:{}};
  const reminders=state.reminders||[];
  const now=new Date(),dk=todayKey(now),mins=now.getHours()*60+now.getMinutes();
  let changed=false;
  // evening calories reminder — the page mirrors whether today's total is already in
  const f=state.food;
  if(f&&f.enabled&&f.logged!==dk&&state.lastFired.food!==dk){
    const t=(f.time||'20:00').split(':').map(Number);
    if(mins>=t[0]*60+t[1]){
      await self.registration.showNotification('Daybook',{body:"Evening check-in: add today's calories eaten so your deficit graph stays up to date.",icon:'icon.svg',tag:'daybook-food',data:{open:'health'}});
      state.lastFired.food=dk;changed=true;
    }
  }
  for(const r of reminders){
    if(!r.enabled)continue;
    if(!(r.days||[]).includes(now.getDay()))continue;
    const parts=(r.time||'20:00').split(':').map(Number);
    if(mins<parts[0]*60+parts[1])continue;
    if(state.lastFired[r.id]===dk)continue;
    await self.registration.showNotification('Daybook',{body:r.label||'Time to write in your journal.',icon:'icon.svg',tag:'daybook-reminder-'+r.id});
    state.lastFired[r.id]=dk;changed=true;
  }
  if(changed)await idbSet('state',state);
}

self.addEventListener('periodicsync',e=>{if(e.tag==='daybook-reminder-check')e.waitUntil(checkAndFire());});
self.addEventListener('sync',e=>{if(e.tag==='daybook-reminder-check')e.waitUntil(checkAndFire());});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const open=e.notification.data&&e.notification.data.open;
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list)if('focus' in c){if(open)c.postMessage({type:'open',view:open});return c.focus();}
    if(clients.openWindow)return clients.openWindow(open?'./?open='+open:'./');
  }));
});
self.addEventListener('message',e=>{if(e.data&&e.data.type==='reminders-state')e.waitUntil(idbSet('state',e.data.state));});
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
