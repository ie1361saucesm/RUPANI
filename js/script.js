
// ══ BASE DE DATOS ══
let DB = {
  admins: [
    {id:1,nombres:"Director RUPANI",usuario:"superadmin",password:"rupani2025",email:"director@rupani.pe",esSuperAdmin:true}
  ],
  apods: [],
  ests:  [],
  mats:  [],
  sims:  [],
  screen:'selector',
  session:null,
  estSession:null,
  view:'dashboard',
  modal:null,
  matStep:1, matApodMode:'nuevo', matApodSel:'',
  matAF:{nombres:'',dir:'',cel:'',correo:''},
  matEF:{nombres:'',edad:'',grado:'',cel:'',correo:''},
  matMF:{num:'',fecha:'',monto:'',desde:'',hasta:''},
  matErr:'',
  busqTipo:'est', busqQ:'', busqSel:null,
  pagoFiltro:'todos',
  simSel:null, simScores:{}, simNuevoPanel:false,
  simNF:{titulo:'',fecha:'',total:200},
  cfgUrl:'', cfgSsId:'', cfgConectado:false,
  loginU:'',loginP:'',loginErr:'',
  estLoginCod:'',estLoginErr:'',estLoginMode:'cod', estLoginU:'',estLoginPass:'',
  estSetup:false,
  adminTab:'apods',
  adminSearchQ:'',
  adminSimSel: null,
  _clockTimer: null
};

// ══ HELPERS ══
const meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Set','Oct','Nov','Dic'];
const diasSem=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const fmtMes = m => { if(!m) return '-'; const [y,mo] = m.split('-'); return meses[+mo-1]+' '+y; };
const fmtDate = d => { if(!d) return '-'; const dt=new Date(d+'T12:00:00'); return dt.getDate()+' '+meses[dt.getMonth()]+' '+dt.getFullYear(); };
const hoy = () => { const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); };
const hoyMes = () => { const n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0'); };
const anioActual = () => new Date().getFullYear();
const fechaHoraTexto = () => {
  const n=new Date();
  return diasSem[n.getDay()]+' '+n.getDate()+' '+meses[n.getMonth()]+' '+n.getFullYear()+' · '+String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');
};
const nid = () => Date.now()+Math.floor(Math.random()*1000);
const getEst = id => DB.ests.find(e=>e.id===id)||{nombres:'—',grado:'—'};
const getApod = id => DB.apods.find(a=>a.id===id)||{nombres:'—',cel:'—',correo:'',dir:''};
const grados=['1ro Primaria','2do Primaria','3ro Primaria','4to Primaria','5to Primaria','6to Primaria','1ro Secundaria','2do Secundaria','3ro Secundaria','4to Secundaria','5to Secundaria'];

function toast(msg, type='ok'){
  const t=document.getElementById('toast');
  t.textContent=msg; t.style.display='block';
  const c={ok:['var(--okb)','var(--ok)','#86efac'],no:['var(--nob)','var(--no)','#fca5a5'],wa:['var(--wab)','var(--wa)','#fde047']};
  const [bg,co,br]=c[type]||c.ok;
  t.style.background=bg; t.style.color=co; t.style.border='1px solid '+br;
  setTimeout(()=>t.style.display='none',3000);
}

function q(sel){ return document.querySelector(sel); }
function qv(sel){ const el=q(sel); return el?el.value:''; }

// ══════════════════════════════════════════════════════════════
// RUPANI — Capa de sincronización con Google Sheets
// Modelo: doGet con ?body=JSON (evita CORS preflight)
// Auto-sync: cada operación CRUD envía inmediatamente a Sheets
// Pull al iniciar sesión: carga todos los datos desde Sheets
// ══════════════════════════════════════════════════════════════

// ── Estado de sincronización ─────────────────────────────────
let SYNC = {
  pendientes: [],      // operaciones en cola si no hay conexión
  sincronizando: false,
  ultimaSync: null,
  errores: 0
};

// ── Llamada base a la API (GET con ?body=JSON → sin CORS preflight) ──
async function apiCall(action, data){
  if(!DB.cfgConectado || !DB.cfgUrl) return null;
  try{
    const body = encodeURIComponent(JSON.stringify({action, data}));
    const res  = await fetch(DB.cfgUrl + '?body=' + body);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();
    if(json.error) throw new Error(json.error);
    SYNC.errores = 0;
    SYNC.ultimaSync = new Date();
    actualizarIndicadorSync();
    return json;
  }catch(e){
    SYNC.errores++;
    console.warn('[RUPANI Sync]', action, e.message);
    actualizarIndicadorSync();
    return null;
  }
}

// ── Indicador de estado en la barra superior ─────────────────
function actualizarIndicadorSync(){
  const el = document.getElementById('sync-indicator');
  if(!el) return;
  if(!DB.cfgConectado){
    el.innerHTML = '<span style="color:var(--t3);font-size:11px">📴 Sin Sheets</span>';
    return;
  }
  if(SYNC.errores > 0){
    el.innerHTML = '<span style="color:var(--wa);font-size:11px">⚠ Sin conexión ('+SYNC.errores+')</span>';
    return;
  }
  const t = SYNC.ultimaSync ? ('Sync '+String(SYNC.ultimaSync.getHours()).padStart(2,'0')+':'+String(SYNC.ultimaSync.getMinutes()).padStart(2,'0')) : 'Conectado';
  el.innerHTML = '<span style="color:var(--ok);font-size:11px">☁ '+t+'</span>';
}

// ── PULL: cargar todo desde Sheets al iniciar sesión ─────────
async function pullTodo(){
  if(!DB.cfgConectado || !DB.cfgUrl) return false;
  SYNC.sincronizando = true;
  actualizarIndicadorSync();
  const res = await apiCall('pullTodo', null);
  SYNC.sincronizando = false;
  if(!res) return false;

  // Admins
  if(res.admins && res.admins.length){
    DB.admins = res.admins.map(r=>({
      id: +r.id||r.id, nombres:r.nombres||'', usuario:r.usuario||'',
      password:r.password||'', email:r.email||'',
      esSuperAdmin: r.esSuperAdmin==='SI'||r.esSuperAdmin===true||r.esSuperAdmin==='true'
    }));
    // Siempre conservar superadmin local si Sheets no lo tiene
    if(!DB.admins.find(a=>a.esSuperAdmin)){
      DB.admins.unshift({id:1,nombres:'Director RUPANI',usuario:'superadmin',password:'rupani2025',email:'director@rupani.pe',esSuperAdmin:true});
    }
  }
  // Apoderados
  if(res.apods && res.apods.length){
    DB.apods = res.apods.map(r=>({
      id:+r.id||r.id, nombres:r.nombres||'', dir:r.dir||'', cel:r.cel||'', correo:r.correo||''
    }));
  }
  // Estudiantes
  if(res.ests && res.ests.length){
    DB.ests = res.ests.map(r=>({
      id:+r.id||r.id, apodId:+r.apodId||r.apodId, nombres:r.nombres||'', edad:+r.edad||0,
      grado:r.grado||'', cel:r.cel||'', correo:r.correo||'', codigo:r.codigo||'',
      usuario:r.usuario||'', password:r.password||'',
      credCreadas: r.credCreadas==='SI'||r.credCreadas===true||r.credCreadas==='true'
    }));
  }
  // Matrículas
  if(res.mats && res.mats.length){
    DB.mats = res.mats.map(r=>({
      id:+r.id||r.id, num:r.num||'', estId:+r.estId||r.estId, fecha:r.fecha||'',
      monto:+r.monto||0, desde:r.desde||'', hasta:r.hasta||'',
      pagado: r.pagado==='SI'||r.pagado===true||r.pagado==='true'
    }));
  }
  // Simulacros
  if(res.sims && res.sims.length){
    DB.sims = res.sims.map(r=>({
      id:+r.id||r.id, titulo:r.titulo||'', fecha:r.fecha||'', total:+r.total||200,
      res:(()=>{ try{ return JSON.parse(r.resultados||'[]'); }catch{ return []; } })()
    }));
  }

  SYNC.ultimaSync = new Date();
  actualizarIndicadorSync();
  return true;
}

// ── PUSH: enviar colección completa (usado al guardar config) ──
async function pushTodo(){
  if(!DB.cfgConectado||!DB.cfgUrl) return false;
  const ok1 = await apiCall('pushAdmins',    DB.admins.map(a=>({id:String(a.id),nombres:a.nombres,usuario:a.usuario,password:a.password,email:a.email||'',esSuperAdmin:a.esSuperAdmin?'SI':'NO'})));
  const ok2 = await apiCall('pushApods',     DB.apods.map(a=>({id:String(a.id),nombres:a.nombres,dir:a.dir,cel:a.cel,correo:a.correo||''})));
  const ok3 = await apiCall('pushEsts',      DB.ests.map(e=>({id:String(e.id),apodId:String(e.apodId),nombres:e.nombres,edad:String(e.edad),grado:e.grado,cel:e.cel||'',correo:e.correo||'',codigo:e.codigo,usuario:e.usuario||'',password:e.password||'',credCreadas:e.credCreadas?'SI':'NO'})));
  const ok4 = await apiCall('pushMats',      DB.mats.map(m=>({id:String(m.id),num:m.num,estId:String(m.estId),fecha:m.fecha,monto:String(m.monto),desde:m.desde,hasta:m.hasta,pagado:m.pagado?'SI':'NO'})));
  const ok5 = await apiCall('pushSims',      DB.sims.map(s=>({id:String(s.id),titulo:s.titulo,fecha:s.fecha,total:String(s.total),resultados:JSON.stringify(s.res)})));
  return !!(ok1||ok2||ok3||ok4||ok5);
}

// ── AUTO-SYNC: operaciones individuales (append / update / delete) ──

// Registrar un apoderado nuevo
async function syncApodNuevo(a){
  await apiCall('appendApod',{id:String(a.id),nombres:a.nombres,dir:a.dir,cel:a.cel,correo:a.correo||''});
}
async function syncApodUpdate(a){
  await apiCall('updateApod',{id:String(a.id),nombres:a.nombres,dir:a.dir,cel:a.cel,correo:a.correo||''});
}
async function syncApodDelete(id){
  await apiCall('deleteApod',{id:String(id)});
}

async function syncEstNuevo(e){
  await apiCall('appendEst',{id:String(e.id),apodId:String(e.apodId),nombres:e.nombres,edad:String(e.edad),grado:e.grado,cel:e.cel||'',correo:e.correo||'',codigo:e.codigo,usuario:e.usuario||'',password:e.password||'',credCreadas:e.credCreadas?'SI':'NO'});
}
async function syncEstUpdate(e){
  await apiCall('updateEst',{id:String(e.id),apodId:String(e.apodId),nombres:e.nombres,edad:String(e.edad),grado:e.grado,cel:e.cel||'',correo:e.correo||'',codigo:e.codigo,usuario:e.usuario||'',password:e.password||'',credCreadas:e.credCreadas?'SI':'NO'});
}
async function syncEstDelete(id){
  await apiCall('deleteEst',{id:String(id)});
}

async function syncMatNueva(m){
  await apiCall('appendMat',{id:String(m.id),num:m.num,estId:String(m.estId),fecha:m.fecha,monto:String(m.monto),desde:m.desde,hasta:m.hasta,pagado:m.pagado?'SI':'NO'});
}
async function syncMatUpdate(m){
  await apiCall('updateMat',{id:String(m.id),num:m.num,estId:String(m.estId),fecha:m.fecha,monto:String(m.monto),desde:m.desde,hasta:m.hasta,pagado:m.pagado?'SI':'NO'});
}
async function syncMatDelete(id){
  await apiCall('deleteMat',{id:String(id)});
}

async function syncSimNuevo(s){
  await apiCall('appendSim',{id:String(s.id),titulo:s.titulo,fecha:s.fecha,total:String(s.total),resultados:JSON.stringify(s.res)});
}
async function syncSimUpdate(s){
  await apiCall('updateSim',{id:String(s.id),titulo:s.titulo,fecha:s.fecha,total:String(s.total),resultados:JSON.stringify(s.res)});
}
async function syncSimDelete(id){
  await apiCall('deleteSim',{id:String(id)});
}

async function syncAdminUpdate(a){
  await apiCall('updateAdmin',{id:String(a.id),nombres:a.nombres,usuario:a.usuario,password:a.password,email:a.email||'',esSuperAdmin:a.esSuperAdmin?'SI':'NO'});
}
async function syncAdminNuevo(a){
  await apiCall('appendAdmin',{id:String(a.id),nombres:a.nombres,usuario:a.usuario,password:a.password,email:a.email||'',esSuperAdmin:'NO'});
}
async function syncAdminDelete(id){
  await apiCall('deleteAdmin',{id:String(id)});
}

// ── Ping para verificar conexión ─────────────────────────────
async function pingSheets(){
  if(!DB.cfgUrl) return false;
  const res = await apiCall('ping', null);
  return !!(res && res.ok);
}

// Compatibilidad: función legacy sheetsCargarTodo → ahora usa pullTodo
async function sheetsCargarTodo(){ return await pullTodo(); }
// Legacy stubs (ya no se usan directamente, pero dejan de romper si se llaman)
async function sheetsDelete(tipo,id){}
async function sheetsSave(tipo,row){}
async function sheetsUpdate(tipo,id,row){}

// ══ RENDER PRINCIPAL ══
function render(){
  const root=document.getElementById('root');
  if(DB.screen==='selector'){ root.innerHTML=renderSelector(); bindSelector(); return; }
  if(DB.screen==='admin-login'){ root.innerHTML=renderAdminLogin(); bindAdminLogin(); return; }
  if(DB.screen==='est-login'){ root.innerHTML=renderEstLogin(); bindEstLogin(); return; }
  if(DB.screen==='est'){
    if(DB.estSetup){ root.innerHTML=renderEstSetup(true); bindEstSetup(true); return; }
    root.innerHTML=renderEstPanel(); bindEstPanel(); return;
  }
  if(DB.screen==='admin'){ root.innerHTML=renderAdminLayout(); bindAdminLayout(); renderModal(); }
}

// ══ SELECTOR DE ROL ══
function renderSelector(){
  return '<div class="lw"><div class="lb">' +
    '<div style="text-align:center;margin-bottom:26px">' +
    '<div class="le">R</div>' +
    '<div style="font-size:26px;font-weight:900;color:var(--P);font-style:italic">RUPANI</div>' +
    '<div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:1px;margin-top:3px">Grupo de Estudio</div>' +
    '</div>' +
    '<div style="font-size:13px;font-weight:700;color:var(--t2);margin-bottom:14px">¿Cómo deseas ingresar?</div>' +
    '<div class="role-card" id="role-admin"><div class="role-icon">🛡️</div><div><div class="role-title">Administrador</div><div class="role-sub">Gestiona matrículas, pagos y simulacros</div></div></div>' +
    '<div class="role-card" id="role-est"><div class="role-icon">🎓</div><div><div class="role-title">Estudiante</div><div class="role-sub">Consulta tu matrícula y resultados</div></div></div>' +
    '</div></div>';
}
function bindSelector(){
  q('#role-admin').onclick=()=>{ DB.screen='admin-login'; DB.loginU=''; DB.loginP=''; DB.loginErr=''; render(); };
  q('#role-est').onclick=()=>{ DB.screen='est-login'; DB.estLoginCod=''; DB.estLoginErr=''; render(); };
}

// ══ LOGIN ADMIN ══
function renderAdminLogin(){
  return '<div class="lw"><div class="lb">' +
    '<div style="text-align:center;margin-bottom:22px">' +
    '<div class="le">R</div>' +
    '<div style="font-size:26px;font-weight:900;color:var(--P);font-style:italic">RUPANI</div>' +
    '<div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:1px;margin-top:3px">Acceso Administrador</div>' +
    '</div>' +
    (DB.loginErr ? '<div class="alert al-no">⚠ '+DB.loginErr+'</div>' : '') +
    '<div class="fl" style="margin-bottom:12px"><label class="flabel">Usuario</label><input type="text" id="l-u" value="'+DB.loginU+'" placeholder="Tu usuario"></div>' +
    '<div class="fl" style="margin-bottom:18px"><label class="flabel">Contraseña</label><input type="password" id="l-p" placeholder="••••••"></div>' +
    '<button class="btn bp" style="width:100%;justify-content:center;margin-bottom:10px" id="btn-login">Ingresar</button>' +
    '<button class="btn bo" style="width:100%;justify-content:center" id="btn-back">← Volver</button>' +
    '<p style="text-align:center;margin-top:13px;font-size:11.5px;color:var(--t3)">Demo: <strong>superadmin</strong> / <strong>rupani2025</strong></p>' +
    '</div></div>';
}
function bindAdminLogin(){
  q('#l-u').oninput=e=>DB.loginU=e.target.value;
  q('#l-p').oninput=e=>DB.loginP=e.target.value;
  q('#l-p').onkeydown=e=>{ if(e.key==='Enter') doAdminLogin(); };
  q('#btn-login').onclick=doAdminLogin;
  q('#btn-back').onclick=()=>{ DB.screen='selector'; render(); };
}
async function doAdminLogin(){
  DB.loginU=qv('#l-u'); DB.loginP=qv('#l-p');
  if(!DB.loginU||!DB.loginP){ DB.loginErr='Ingresa usuario y contraseña.'; render(); return; }
  // Sincronizar desde Sheets antes de validar (para que funcione en múltiples dispositivos)
  if(DB.cfgConectado && DB.cfgUrl){
    const btn=q('#btn-login');
    if(btn){ btn.textContent='⏳ Cargando datos...'; btn.disabled=true; }
    await pullTodo();
    if(btn){ btn.textContent='Ingresar'; btn.disabled=false; }
  }
  const a=DB.admins.find(x=>x.usuario===DB.loginU&&x.password===DB.loginP);
  if(a){ DB.session=a; DB.screen='admin'; DB.view='dashboard'; DB.loginErr=''; render(); }
  else{ DB.loginErr='Usuario o contraseña incorrectos.'; render(); }
}

// ══ LOGIN ESTUDIANTE ══
function renderEstLogin(){
  const m=DB.estLoginMode;
  let html='<div class="est-wrap"><div class="est-login">';
  html+='<div class="est-logo"><div class="est-em">R</div>';
  html+='<div style="font-size:24px;font-weight:900;color:var(--P);font-style:italic">RUPANI</div>';
  html+='<div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:1px;margin-top:3px">Portal del Estudiante</div></div>';
  html+='<div class="tabs" style="margin-bottom:18px">';
  html+='<button class="tab'+(m==='cod'?' act':'')+'" id="el-tab-cod">Código de acceso</button>';
  html+='<button class="tab'+(m==='usr'?' act':'')+'" id="el-tab-usr">Usuario y contraseña</button>';
  html+='</div>';
  if(DB.estLoginErr) html+='<div class="alert al-no">⚠ '+DB.estLoginErr+'</div>';
  if(m==='cod'){
    html+='<div class="fl" style="margin-bottom:18px">';
    html+='<label class="flabel">Código de estudiante</label>';
    html+='<input type="text" id="est-cod" value="'+DB.estLoginCod+'" placeholder="Ej: EST-101" style="text-align:center;font-size:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase">';
    html+='<div style="font-size:11.5px;color:var(--t3);margin-top:5px">Tu código te lo proporciona tu administrador.<br>Al ingresar por primera vez podrás crear tu usuario y contraseña.</div>';
    html+='</div>';
    html+='<button class="btn bp" style="width:100%;justify-content:center;margin-bottom:10px" id="btn-est-login">Ingresar con código</button>';
  } else {
    html+='<div class="fl" style="margin-bottom:12px"><label class="flabel">Usuario</label><input type="text" id="est-usr" value="'+DB.estLoginU+'" placeholder="Tu usuario personalizado" autocomplete="username"></div>';
    html+='<div class="fl" style="margin-bottom:18px"><label class="flabel">Contraseña</label><input type="password" id="est-pass" placeholder="••••••" autocomplete="current-password"></div>';
    html+='<button class="btn bp" style="width:100%;justify-content:center;margin-bottom:10px" id="btn-est-login">Ingresar</button>';
  }
  html+='<button class="btn bo" style="width:100%;justify-content:center" id="btn-est-back">← Volver</button>';
  html+='<div style="margin-top:16px;padding:11px 13px;background:var(--Pl);border-radius:10px;font-size:12px;color:var(--P)">';
  html+='<strong>Demo (código):</strong> EST-101 · EST-102 · EST-103</div>';
  html+='</div></div>';
  return html;
}
function bindEstLogin(){
  q('#el-tab-cod').onclick=()=>{ DB.estLoginMode='cod'; DB.estLoginErr=''; render(); };
  q('#el-tab-usr').onclick=()=>{ DB.estLoginMode='usr'; DB.estLoginErr=''; render(); };
  if(DB.estLoginMode==='cod'){
    const inp=q('#est-cod');
    inp.oninput=e=>DB.estLoginCod=e.target.value;
    inp.onkeydown=e=>{ if(e.key==='Enter') doEstLoginCod(); };
    q('#btn-est-login').onclick=doEstLoginCod;
  } else {
    const uinp=q('#est-usr'), pinp=q('#est-pass');
    if(uinp) uinp.oninput=e=>DB.estLoginU=e.target.value;
    if(pinp) pinp.onkeydown=e=>{ if(e.key==='Enter') doEstLoginUsr(); };
    q('#btn-est-login').onclick=doEstLoginUsr;
  }
  q('#btn-est-back').onclick=()=>{ DB.screen='selector'; render(); };
}
function doEstLoginCod(){
  const cod=qv('#est-cod').trim().toUpperCase();
  DB.estLoginCod=cod;
  const e=DB.ests.find(x=>x.codigo===cod);
  if(!e){ DB.estLoginErr='Código no encontrado. Verifica con tu administrador.'; render(); return; }
  if(e.credCreadas){
    DB.estLoginErr='Este estudiante ya tiene usuario propio (@'+e.usuario+'). Usa la pestaña "Usuario y contraseña" para ingresar.';
    DB.estLoginMode='usr';
    render(); return;
  }
  DB.estSession=e; DB.estLoginErr=''; DB.screen='est'; DB.estSetup=true; render();
}
function doEstLoginUsr(){
  const usr=qv('#est-usr').trim();
  const pass=qv('#est-pass');
  DB.estLoginU=usr;
  if(!usr||!pass){ DB.estLoginErr='Ingresa tu usuario y contraseña.'; render(); return; }
  const e=DB.ests.find(x=>x.credCreadas&&x.usuario===usr&&x.password===pass);
  if(!e){ DB.estLoginErr='Usuario o contraseña incorrectos.'; render(); return; }
  DB.estSession=e; DB.estLoginErr=''; DB.estSetup=false; DB.screen='est'; render();
}

// ══ SETUP CREDENCIALES ══
function renderEstSetup(esForzado){
  const e=DB.estSession;
  let html='<div class="est-wrap"><div class="est-login" style="width:420px">';
  html+='<div class="est-logo">';
  html+='<div class="est-em" style="background:var(--G)">🔑</div>';
  html+='<div style="font-size:20px;font-weight:900;color:var(--P)">'+(esForzado?'Crea tus credenciales':'Cambiar usuario / contraseña')+'</div>';
  html+='<div style="font-size:12.5px;color:var(--t2);margin-top:6px;line-height:1.5">'+(esForzado?'Es tu primera vez. Crea un usuario y contraseña personales para acceder sin necesitar el código.':'Actualiza tus credenciales de acceso al portal.')+'</div>';
  html+='</div>';
  html+='<div style="background:var(--Pl);border-radius:10px;padding:12px 14px;margin-bottom:18px;font-size:12.5px;color:var(--P)">👤 <strong>'+e.nombres+'</strong> · '+e.grado+'<br><span style="color:var(--t3)">Código: '+e.codigo+'</span></div>';
  html+='<div id="setup-err"></div>';
  html+='<div class="fl" style="margin-bottom:12px"><label class="flabel">Nuevo usuario *</label><input type="text" id="setup-usr" value="'+(e.usuario||'')+'" placeholder="Ej: kevin.huanca" autocomplete="off" style="font-size:14px"><div style="font-size:11.5px;color:var(--t3);margin-top:4px">Solo letras, números y punto. Sin espacios.</div></div>';
  html+='<div class="fl" style="margin-bottom:12px"><label class="flabel">Nueva contraseña *</label><input type="password" id="setup-pass" placeholder="Mínimo 6 caracteres" autocomplete="new-password" style="font-size:14px"></div>';
  html+='<div class="fl" style="margin-bottom:20px"><label class="flabel">Confirmar contraseña *</label><input type="password" id="setup-pass2" placeholder="Repite la contraseña" autocomplete="new-password" style="font-size:14px"></div>';
  html+='<button class="btn bp" style="width:100%;justify-content:center;margin-bottom:10px" id="btn-setup-save">'+(esForzado?'✓ Crear credenciales y entrar':'✓ Guardar cambios')+'</button>';
  if(!esForzado) html+='<button class="btn bo" style="width:100%;justify-content:center" id="btn-setup-cancel">Cancelar</button>';
  html+='</div></div>';
  return html;
}
function bindEstSetup(esForzado){
  const showErr=msg=>{ const el=document.getElementById('setup-err'); if(el) el.innerHTML=msg?'<div class="alert al-no" style="margin-bottom:14px">⚠ '+msg+'</div>':''; };
  q('#btn-setup-save').onclick=()=>{
    const usr=qv('#setup-usr').trim();
    const pass=qv('#setup-pass');
    const pass2=qv('#setup-pass2');
    if(!usr||!pass||!pass2){ showErr('Completa todos los campos.'); return; }
    if(!/^[a-zA-Z0-9._]+$/.test(usr)){ showErr('El usuario solo puede tener letras, números, punto y guion bajo.'); return; }
    if(pass.length<6){ showErr('La contraseña debe tener al menos 6 caracteres.'); return; }
    if(pass!==pass2){ showErr('Las contraseñas no coinciden.'); return; }
    const ocupado=DB.ests.find(x=>x.id!==DB.estSession.id&&x.credCreadas&&x.usuario===usr);
    if(ocupado){ showErr('Ese usuario ya está en uso. Elige otro.'); return; }
    const est=DB.ests.find(x=>x.id===DB.estSession.id);
    if(est){ est.usuario=usr; est.password=pass; est.credCreadas=true; }
    DB.estSession={...DB.estSession,usuario:usr,password:pass,credCreadas:true};
    DB.estSetup=false;
    toast('¡Credenciales guardadas! Ya puedes entrar con tu usuario.');
    DB.screen='est'; render();
  };
  if(!esForzado){
    q('#btn-setup-cancel').onclick=()=>{ DB.screen='est'; DB.estSetup=false; render(); };
  }
}

// ══ PANEL ESTUDIANTE ══
function renderEstPanel(){
  const e=DB.estSession;
  const apod=getApod(e.apodId);
  const mlist=DB.mats.filter(m=>m.estId===e.id);
  const deuda=mlist.some(m=>!m.pagado);
  const simResults=DB.sims.map(s=>{
    const r=s.res.find(x=>x.estId===e.id);
    if(!r) return null;
    const sorted=[...s.res].sort((a,b)=>b.pts-a.pts);
    const pos=sorted.findIndex(x=>x.estId===e.id)+1;
    const tercio=Math.ceil(sorted.length/3);
    const esTercio=pos<=tercio;
    const pct=Math.round((r.ok/s.total)*100);
    return{sim:s,r,pos,esTercio,pct,total:sorted.length};
  }).filter(Boolean);

  const matsHTML=mlist.length===0
    ?'<div class="empty">Sin matrículas registradas</div>'
    :mlist.map(m=>{
      let h='<div class="mat-card '+(m.pagado?'pagado':'deuda')+'">';
      h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
      h+='<span style="font-weight:700;font-size:13.5px">'+m.num+'</span>';
      h+='<span class="badge '+(m.pagado?'b-ok':'b-no')+'">'+(m.pagado?'✓ Pagado':'⚠ Pendiente')+'</span></div>';
      h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12.5px;color:var(--t2)">';
      h+='<div><span style="color:var(--t3)">Periodo:</span> '+fmtMes(m.desde)+' → '+fmtMes(m.hasta)+'</div>';
      h+='<div><span style="color:var(--t3)">Monto:</span> <strong>S/ '+m.monto+'</strong></div></div>';
      if(!m.pagado) h+='<div style="margin-top:8px;font-size:12px;color:var(--no);font-weight:600">⚠ Pago pendiente. Comunícate con la academia.</div>';
      h+='</div>';
      return h;
    }).join('');

  const simsHTML=simResults.length===0
    ?'<div class="empty">Sin simulacros registrados</div>'
    :simResults.map(x=>{
      const ic=x.pos===1?'🥇':x.pos===2?'🥈':x.pos===3?'🥉':'<span style="background:var(--Pl);color:var(--P);width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">'+x.pos+'°</span>';
      let h='<div class="sim-pos-card'+(x.esTercio?' tr3':'')+'">';
      h+='<div style="font-size:26px">'+ic+'</div>';
      h+='<div style="flex:1"><div style="font-weight:700;font-size:13.5px">'+x.sim.titulo+'</div>';
      h+='<div style="font-size:12px;color:var(--t3)">'+fmtDate(x.sim.fecha)+' · Puesto '+x.pos+'° de '+x.total+'</div>';
      if(x.esTercio) h+='<span class="badge b-pu" style="font-size:10px;margin-top:4px">Tercio superior</span>';
      h+='</div>';
      h+='<div style="text-align:right"><div style="font-size:22px;font-weight:900;color:'+(x.pos===1?'#92400e':'var(--P)')+'">'+x.r.pts+'</div>';
      h+='<div style="font-size:11.5px;color:'+(x.pct>=70?'var(--ok)':x.pct>=50?'var(--wa)':'var(--no)')+'">Correctas: '+x.r.ok+' ('+x.pct+'%)</div></div>';
      h+='</div>';
      return h;
    }).join('');

  let html='<div class="est-wrap"><div class="est-panel">';
  html+='<div class="est-header">';
  html+='<div class="est-avatar">'+e.nombres.charAt(0)+'</div>';
  html+='<div style="flex:1">';
  html+='<div class="est-info-name">'+e.nombres+'</div>';
  html+='<div class="est-info-sub">'+e.grado+' · '+e.edad+' años · Código: '+e.codigo+'</div>';
  html+='<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">';
  html+='<span class="badge '+(deuda?'b-no':'b-ok')+'" style="font-size:11px">'+(deuda?'⚠ Tienes pagos pendientes':'✓ Al día con tus pagos')+'</span>';
  if(e.credCreadas) html+='<span style="background:rgba(255,255,255,.15);color:rgba(255,255,255,.9);font-size:11px;padding:2px 9px;border-radius:20px;font-weight:600">🔐 @'+e.usuario+'</span>';
  else html+='<span style="background:rgba(255,165,0,.25);color:#ffe08a;font-size:11px;padding:2px 9px;border-radius:20px;font-weight:600">⚠ Sin credenciales propias</span>';
  html+='</div></div>';
  html+='<div style="display:flex;flex-direction:column;gap:7px;margin-left:auto;flex-shrink:0">';
  html+='<button class="btn bsm" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);font-size:12px" id="btn-change-cred">🔑 '+(e.credCreadas?'Cambiar acceso':'Crear acceso')+'</button>';
  html+='<button class="btn bsm" style="background:rgba(255,255,255,.08);color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.2);font-size:12px" id="est-logout">Salir 🚪</button>';
  html+='</div></div>';

  const datosRows=[['Nombre completo',e.nombres],['Grado',e.grado],['Edad',e.edad+' años'],['Celular',e.cel||'—'],['Correo',e.correo||'—']];
  const apodRows2=[['Nombres',apod.nombres],['Celular',apod.cel||'—'],['Correo',apod.correo||'—'],['Dirección',apod.dir||'—']];

  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">';
  html+='<div class="est-section"><div class="est-section-title">Mis datos</div>';
  html+=datosRows.map(([k,v])=>'<div class="est-row"><span class="est-key">'+k+'</span><span class="est-val">'+v+'</span></div>').join('');
  html+='</div>';
  html+='<div class="est-section"><div class="est-section-title">Mi apoderado</div>';
  html+=apodRows2.map(([k,v])=>'<div class="est-row"><span class="est-key">'+k+'</span><span class="est-val" style="font-size:12px">'+v+'</span></div>').join('');
  html+='</div></div>';

  html+='<div class="est-section"><div class="est-section-title">Mis matrículas</div>'+matsHTML+'</div>';
  html+='<div class="est-section"><div class="est-section-title">Mis simulacros</div>'+simsHTML+'</div>';
  html+='</div></div>';
  return html;
}
function bindEstPanel(){
  q('#est-logout').onclick=()=>{ DB.screen='selector'; DB.estSession=null; render(); };
  q('#btn-change-cred').onclick=()=>{
    document.getElementById('root').innerHTML=renderEstSetup(false);
    bindEstSetup(false);
  };
}

// ══ LAYOUT ADMIN ══
const titles={dashboard:'Dashboard',matricular:'Nueva matrícula',pagos:'Gestionar pagos',buscar:'Buscar',simulacros:'Simulacros',administracion:'Administración de datos',config:'Configuración'};
const navItems=[
  {v:'dashboard',ic:'🏠',lbl:'Dashboard'},
  {v:'matricular',ic:'📋',lbl:'Nueva matrícula'},
  {v:'pagos',ic:'💳',lbl:'Gestionar pagos',badge:true},
  {v:'buscar',ic:'🔍',lbl:'Buscar'},
  {v:'simulacros',ic:'🏆',lbl:'Simulacros'},
  {v:'administracion',ic:'🗂️',lbl:'Administración'},
  {v:'config',ic:'⚙️',lbl:'Configuración'},
];

function renderAdminLayout(){
  const deudas=DB.mats.filter(m=>!m.pagado).length;
  const isSA=DB.session&&DB.session.esSuperAdmin;
  const navHTML=navItems.map(n=>{
    let h='<button class="nav-btn'+(DB.view===n.v?' act':'')+'" data-view="'+n.v+'">';
    h+='<span class="nav-ic">'+n.ic+'</span><span class="nav-txt">'+n.lbl+'</span>';
    if(n.badge&&deudas) h+='<span class="nav-badge">'+deudas+'</span>';
    h+='</button>';
    return h;
  }).join('');

  const views={dashboard:renderDash,matricular:renderMatricular,pagos:renderPagos,buscar:renderBuscar,simulacros:renderSims,administracion:renderAdmin,config:renderConfig};
  const content=(views[DB.view]||renderDash)();

  let html='<div class="app">';
  html+='<aside class="sb">';
  html+='<div class="sb-logo"><div class="sb-logo-row"><div class="sb-em">R</div><div><div class="sb-t">RUPANI</div><div class="sb-s">Sistema académico</div></div></div></div>';
  html+='<div class="sb-nav"><div class="nav-lbl">Menú</div>'+navHTML;
  html+='<div class="nav-lbl" style="margin-top:14px">Cuenta</div>';
  html+='<button class="nav-btn" id="nav-logout"><span class="nav-ic">🚪</span><span class="nav-txt">Cerrar sesión</span></button>';
  html+='</div>';
  html+='<div class="sb-user"><strong>'+(DB.session?DB.session.nombres:'')+'</strong>';
  html+=isSA?'<div class="sb-crown">👑 Super Admin</div>':'Administrador';
  html+='</div></aside>';
  html+='<div class="main">';
  html+='<div class="topbar">';
  html+='<div><div class="tb-title">'+(titles[DB.view]||'')+'</div><div class="tb-sub">RUPANI · Grupo de Estudio</div></div>';
  html+='<div style="display:flex;align-items:center;gap:12px">';
  html+='<div id="sync-indicator" style="padding:5px 12px;border-radius:20px;border:1px solid var(--brd);background:#f8f9fe;min-width:90px;text-align:center"></div>';
  html+='<div style="display:flex;align-items:center;gap:7px;background:#f8f9fe;border:1px solid var(--brd);padding:6px 13px;border-radius:20px">';
  html+='<span style="font-size:14px">🕐</span>';
  html+='<span id="reloj-txt" style="font-size:12px;font-weight:600;color:var(--t2);white-space:nowrap">'+fechaHoraTexto()+'</span></div>';
  html+='<div class="tb-user"><div class="tb-dot"></div><span class="tb-name">'+(DB.session?DB.session.nombres:'')+'</span></div>';
  html+='</div></div>';
  html+='<div class="content" id="view-content">'+content+'</div>';
  html+='</div></div>';
  html+='<div id="modal-container"></div>';
  return html;
}

function bindAdminLayout(){
  document.querySelectorAll('.nav-btn[data-view]').forEach(b=>{
    b.onclick=()=>{ DB.view=b.dataset.view; render(); };
  });
  q('#nav-logout').onclick=()=>{ DB.session=null; DB.screen='selector'; clearInterval(DB._clockTimer||0); render(); };
  clearInterval(DB._clockTimer||0);
  DB._clockTimer=setInterval(()=>{ const el=document.getElementById('reloj-txt'); if(el) el.textContent=fechaHoraTexto(); },10000);
  actualizarIndicadorSync();
  bindView();
}

// ══ MODAL ENGINE ══
function renderModal(){
  const mc=document.getElementById('modal-container');
  if(!mc) return;
  if(!DB.modal){ mc.innerHTML=''; return; }
  const {tipo,datos}=DB.modal;
  let html='';

  if(tipo==='edit-apod'){
    const a=datos||{nombres:'',dir:'',cel:'',correo:''};
    const isNew=!datos||!datos.id;
    html='<div class="modal-title">'+(isNew?'Nuevo apoderado':'Editar apoderado')+'<button class="modal-close" id="m-close">✕</button></div>';
    html+='<div class="fg" style="gap:14px">';
    html+='<div class="fl fgf"><label class="flabel">Nombres completos *</label><input type="text" id="m-nom" value="'+(a.nombres||'')+'"></div>';
    html+='<div class="fl fgf"><label class="flabel">Dirección *</label><input type="text" id="m-dir" value="'+(a.dir||'')+'"></div>';
    html+='<div class="fl"><label class="flabel">Celular *</label><input type="text" id="m-cel" value="'+(a.cel||'')+'"></div>';
    html+='<div class="fl"><label class="flabel">Correo</label><input type="email" id="m-cor" value="'+(a.correo||'')+'"></div>';
    html+='</div>';
    html+='<div style="display:flex;gap:8px;margin-top:18px"><button class="btn bp" id="m-save">✓ Guardar</button><button class="btn bo" id="m-cancel">Cancelar</button></div>';
  }
  else if(tipo==='edit-est'){
    const e=datos||{nombres:'',edad:'',grado:'',cel:'',correo:'',apodId:''};
    const isNew=!datos||!datos.id;
    const apodOpts=DB.apods.map(a=>'<option value="'+a.id+'"'+(e.apodId==a.id?' selected':'')+'>'+a.nombres+'</option>').join('');
    const gradOpts=grados.map(g=>'<option value="'+g+'"'+(e.grado===g?' selected':'')+'>'+g+'</option>').join('');

    let credBlock='';
    if(datos&&datos.id){
      credBlock='<div class="fl" style="grid-column:1/-1">';
      credBlock+='<div style="border-radius:12px;overflow:hidden;border:1.5px solid var(--brd)">';
      credBlock+='<div style="background:var(--P);padding:12px 16px;display:flex;align-items:center;justify-content:space-between">';
      credBlock+='<div style="display:flex;align-items:center;gap:8px"><span style="font-size:16px">🔐</span><span style="font-size:13px;font-weight:700;color:#fff">Credenciales de acceso</span></div>';
      credBlock+='<span style="background:'+(e.credCreadas?'rgba(34,197,94,.25)':'rgba(251,146,60,.25)')+';color:'+(e.credCreadas?'#86efac':'#fed7aa')+';font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px">'+(e.credCreadas?'✓ Activas':'⚠ Sin crear')+'</span>';
      credBlock+='</div>';
      credBlock+='<div style="padding:16px;background:#f8f9fe;display:flex;flex-direction:column;gap:12px">';
      credBlock+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
      credBlock+='<div style="background:#fff;border:1px solid var(--brd);border-radius:8px;padding:11px 13px">';
      credBlock+='<div style="font-size:10.5px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">Código fijo (siempre activo)</div>';
      credBlock+='<div style="font-size:18px;font-weight:900;color:var(--P);letter-spacing:2px">'+(e.codigo||'—')+'</div>';
      credBlock+='<div style="font-size:11px;color:var(--t3);margin-top:3px">El estudiante siempre puede usarlo</div></div>';
      credBlock+='<div style="background:#fff;border:1px solid var(--brd);border-radius:8px;padding:11px 13px">';
      credBlock+='<div style="font-size:10.5px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px">Usuario personalizado actual</div>';
      if(e.credCreadas){
        credBlock+='<div style="font-size:16px;font-weight:800;color:var(--ok)">@'+e.usuario+'</div>';
        credBlock+='<div style="font-size:11px;color:var(--t3);margin-top:3px">Editable en el campo de abajo</div>';
      } else {
        credBlock+='<div style="font-size:13px;color:var(--wa);font-weight:600">— Sin usuario aún —</div>';
        credBlock+='<div style="font-size:11px;color:var(--t3);margin-top:3px">Asígnale uno abajo o deja que lo cree el estudiante</div>';
      }
      credBlock+='</div></div>';
      if(e.credCreadas){
        credBlock+='<div style="background:#fff;border:1px solid var(--brd);border-radius:8px;padding:11px 13px">';
        credBlock+='<div style="font-size:10.5px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px">Contraseña actual <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--wa);margin-left:6px">(solo visible para el administrador)</span></div>';
        credBlock+='<div style="display:flex;align-items:center;gap:10px">';
        credBlock+='<div id="pass-display" style="font-size:15px;font-weight:700;color:var(--t1);letter-spacing:2px;font-family:monospace;flex:1">••••••••</div>';
        credBlock+='<button type="button" id="btn-show-pass" style="background:var(--Pl);border:1px solid var(--brd);border-radius:7px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600;color:var(--P);white-space:nowrap">👁 Mostrar</button>';
        credBlock+='<button type="button" id="btn-copy-pass" style="background:var(--okb);border:1px solid #86efac;border-radius:7px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:600;color:var(--ok);white-space:nowrap">📋 Copiar</button>';
        credBlock+='</div></div>';
      }
      credBlock+='<div style="border-top:1px dashed var(--brd);padding-top:12px">';
      credBlock+='<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);margin-bottom:10px">✏ Modificar credenciales</div>';
      credBlock+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
      credBlock+='<div class="fl"><label class="flabel">Nuevo usuario</label><input type="text" id="m-usr-est" value="'+(e.usuario||'')+'" placeholder="'+(e.credCreadas?'Editar usuario':'Asignar usuario')+'" autocomplete="off" style="background:#fff"><div style="font-size:11px;color:var(--t3);margin-top:3px">Solo letras, números y punto</div></div>';
      credBlock+='<div class="fl"><label class="flabel">Nueva contraseña</label><div style="position:relative"><input type="password" id="m-pass-est" value="" placeholder="'+(e.credCreadas?'Dejar vacío = no cambia':'Asignar contraseña')+'" autocomplete="new-password" style="background:#fff;padding-right:44px;font-family:monospace"><button type="button" id="toggle-new-pass" title="Mostrar / ocultar" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:15px;color:var(--t3);padding:4px">👁</button></div><div style="font-size:11px;color:var(--t3);margin-top:3px">'+(e.credCreadas?'Escribe solo si deseas cambiarla':'Mínimo 6 caracteres')+'</div></div>';
      credBlock+='</div></div>';
      if(e.credCreadas) credBlock+='<div style="display:flex;justify-content:flex-end;padding-top:4px"><button class="btn bed bsm" id="m-reset-cred" style="font-size:11.5px">🔄 Borrar credenciales (volver a solo-código)</button></div>';
      credBlock+='</div></div></div>';
    }

    html='<div class="modal-title">'+(isNew?'Nuevo estudiante':'Editar estudiante')+'<button class="modal-close" id="m-close">✕</button></div>';
    html+='<div class="fg" style="gap:14px">';
    html+='<div class="fl fgf"><label class="flabel">Nombres completos *</label><input type="text" id="m-nom" value="'+(e.nombres||'')+'"></div>';
    html+='<div class="fl"><label class="flabel">Apoderado *</label><select id="m-apod"><option value="">— Selecciona —</option>'+apodOpts+'</select></div>';
    html+='<div class="fl"><label class="flabel">Grado *</label><select id="m-grado"><option value="">— Selecciona —</option>'+gradOpts+'</select></div>';
    html+='<div class="fl"><label class="flabel">Edad *</label><input type="number" id="m-edad" value="'+(e.edad||'')+'" min="5" max="25"></div>';
    html+='<div class="fl"><label class="flabel">Celular</label><input type="text" id="m-cel" value="'+(e.cel||'')+'"></div>';
    html+='<div class="fl"><label class="flabel">Correo</label><input type="email" id="m-cor" value="'+(e.correo||'')+'"></div>';
    html+=credBlock;
    html+='</div>';
    html+='<div style="display:flex;gap:8px;margin-top:18px"><button class="btn bp" id="m-save">✓ Guardar cambios</button><button class="btn bo" id="m-cancel">Cancelar</button></div>';
  }
  else if(tipo==='edit-mat'){
    const m=datos||{num:'',estId:'',fecha:'',monto:'',desde:'',hasta:'',pagado:false};
    const isNew=!datos||!datos.id;
    const estOpts=DB.ests.map(e=>'<option value="'+e.id+'"'+(m.estId==e.id?' selected':'')+'>'+e.nombres+'</option>').join('');
    const autoNum='MAT-'+anioActual()+'-'+String(DB.mats.length+1).padStart(3,'0');
    html='<div class="modal-title">'+(isNew?'Nueva matrícula':'Editar matrícula')+'<button class="modal-close" id="m-close">✕</button></div>';
    html+='<div class="fg" style="gap:14px">';
    html+='<div class="fl"><label class="flabel">N° Matrícula</label><input type="text" id="m-num" value="'+(m.num||autoNum)+'"'+(datos&&datos.id?' readonly':'')+' ></div>';
    html+='<div class="fl"><label class="flabel">Estudiante *</label><select id="m-est"><option value="">— Selecciona —</option>'+estOpts+'</select></div>';
    html+='<div class="fl"><label class="flabel">Fecha de registro</label><input type="date" id="m-fecha" value="'+(m.fecha||hoy())+'"></div>';
    html+='<div class="fl"><label class="flabel">Monto (S/) *</label><input type="number" id="m-monto" value="'+(m.monto||'')+'"></div>';
    html+='<div class="fl"><label class="flabel">Paga desde *</label><input type="month" id="m-desde" value="'+(m.desde||hoyMes())+'"></div>';
    html+='<div class="fl"><label class="flabel">Paga hasta *</label><input type="month" id="m-hasta" value="'+(m.hasta||hoyMes())+'"></div>';
    html+='<div class="fl fgf"><label class="flabel">Estado de pago</label><select id="m-pag"><option value="0"'+(!m.pagado?' selected':'')+'>Pendiente</option><option value="1"'+(m.pagado?' selected':'')+'>Pagado</option></select></div>';
    html+='</div>';
    html+='<div style="display:flex;gap:8px;margin-top:18px"><button class="btn bp" id="m-save">✓ Guardar</button><button class="btn bo" id="m-cancel">Cancelar</button></div>';
  }
  else if(tipo==='edit-admin'){
    const a=datos||{nombres:'',usuario:'',password:'',email:'',esSuperAdmin:false};
    const isNew=!datos||!datos.id;
    html='<div class="modal-title">'+(isNew?'Agregar administrador':'Editar administrador')+'<button class="modal-close" id="m-close">✕</button></div>';
    html+='<div class="alert al-in" style="margin-bottom:14px">ℹ Solo el Super Admin puede gestionar administradores.</div>';
    html+='<div class="fg" style="gap:14px">';
    html+='<div class="fl fgf"><label class="flabel">Nombres completos *</label><input type="text" id="m-nom" value="'+(a.nombres||'')+'"></div>';
    html+='<div class="fl"><label class="flabel">Usuario *</label><input type="text" id="m-usr" value="'+(a.usuario||'')+'"'+(datos&&datos.esSuperAdmin?' readonly':'')+' ></div>';
    html+='<div class="fl"><label class="flabel">Contraseña'+(datos&&datos.id?' (dejar vacío = no cambia)':'')+' </label><input type="password" id="m-pass" value=""></div>';
    html+='<div class="fl"><label class="flabel">Correo</label><input type="email" id="m-email" value="'+(a.email||'')+'"></div>';
    html+='</div>';
    html+='<div style="display:flex;gap:8px;margin-top:18px"><button class="btn bp" id="m-save">✓ Guardar</button><button class="btn bo" id="m-cancel">Cancelar</button></div>';
  }
  else if(tipo==='edit-sim'){
    const s=datos||{titulo:'',fecha:'',total:200};
    const isNew=!datos||!datos.id;
    html='<div class="modal-title">'+(isNew?'Nuevo simulacro':'Editar simulacro')+'<button class="modal-close" id="m-close">✕</button></div>';
    html+='<div class="fg" style="gap:14px">';
    html+='<div class="fl fgf"><label class="flabel">Título del simulacro *</label><input type="text" id="s-titulo" value="'+(s.titulo||'')+'" placeholder="Ej: Simulacro N°3 – Junio 2025"></div>';
    html+='<div class="fl"><label class="flabel">Fecha de aplicación *</label><input type="date" id="s-fecha" value="'+(s.fecha||'')+'"></div>';
    html+='<div class="fl"><label class="flabel">Total de preguntas *</label><input type="number" id="s-total" value="'+(s.total||200)+'" min="1" max="999"></div>';
    html+='</div>';
    if(datos&&datos.id) html+='<div class="alert al-in" style="margin-top:14px">ℹ Editar el título, fecha o total no borra los resultados ya registrados.</div>';
    html+='<div style="display:flex;gap:8px;margin-top:18px"><button class="btn bp" id="m-save">✓ Guardar</button><button class="btn bo" id="m-cancel">Cancelar</button></div>';
  }
  else if(tipo==='confirm'){
    const sheetsMsg=DB.cfgConectado?'<div style="background:var(--nob);border:1px solid #fca5a5;border-radius:8px;padding:9px 12px;font-size:12px;color:var(--no);margin-bottom:16px;display:flex;align-items:center;gap:8px"><span style="font-size:15px">🗑</span> Este registro también se eliminará de <strong>Google Sheets</strong>.</div>':'';
    html='<div class="modal-title">'+(datos.titulo||'Confirmar eliminación')+'<button class="modal-close" id="m-close">✕</button></div>';
    html+='<p style="font-size:13.5px;color:var(--t2);margin-bottom:14px">'+datos.msg+'</p>';
    html+=sheetsMsg;
    html+='<div style="display:flex;gap:8px"><button class="btn bed" id="m-confirm-ok">🗑 Sí, eliminar</button><button class="btn bo" id="m-cancel">Cancelar</button></div>';
  }

  mc.innerHTML='<div class="modal-bg" id="m-bg"><div class="modal">'+html+'</div></div>';
  bindModal();
}

function closeModal(){ DB.modal=null; renderModal(); }

function showExitConfirm(){
  let overlay=document.getElementById('exit-overlay');
  if(overlay) return;
  overlay=document.createElement('div');
  overlay.id='exit-overlay';
  overlay.className='exit-overlay';
  overlay.innerHTML='<div class="exit-box"><div class="exit-icon">⚠️</div><div class="exit-title">¿Salir sin guardar?</div><div class="exit-sub">Los cambios que realizaste no se guardarán si sales ahora.</div><div class="exit-btns"><button class="btn bp" id="exit-stay" style="padding:8px 20px;font-size:13px">Seguir editando</button><button class="btn bed" id="exit-leave" style="padding:8px 20px;font-size:13px">Salir</button></div></div>';
  document.body.appendChild(overlay);
  document.getElementById('exit-stay').onclick=()=>{ overlay.remove(); };
  document.getElementById('exit-leave').onclick=()=>{ overlay.remove(); closeModal(); };
}

function bindModal(){
  q('#m-close')&&q('#m-close').addEventListener('click',showExitConfirm);
  q('#m-cancel')&&q('#m-cancel').addEventListener('click',showExitConfirm);
  q('#m-bg')&&q('#m-bg').addEventListener('click',e=>{ if(e.target===q('#m-bg')) showExitConfirm(); });

  const {tipo,datos}=DB.modal||{};

  if(tipo==='edit-apod'){
    q('#m-save').onclick=async()=>{
      const nom=qv('#m-nom'),dir=qv('#m-dir'),cel=qv('#m-cel'),cor=qv('#m-cor');
      if(!nom||!dir||!cel){ toast('Completa los campos obligatorios.','wa'); return; }
      if(datos&&datos.id){
        const a=DB.apods.find(x=>x.id===datos.id);
        if(a){ a.nombres=nom; a.dir=dir; a.cel=cel; a.correo=cor; syncApodUpdate(a); }
      } else {
        const na={id:nid(),nombres:nom,dir:dir,cel:cel,correo:cor};
        DB.apods.push(na); syncApodNuevo(na);
      }
      toast('Apoderado guardado.'); closeModal(); render();
    };
  }
  else if(tipo==='edit-est'){
    const estVivo=DB.ests.find(x=>x.id===(datos&&datos.id));
    const passDisplay=q('#pass-display');
    const btnShow=q('#btn-show-pass');
    const btnCopy=q('#btn-copy-pass');
    let passVisible=false;

    if(btnShow){
      btnShow.onclick=()=>{
        const realPass=(DB.ests.find(x=>x.id===(datos&&datos.id))||{}).password||'';
        passVisible=!passVisible;
        if(passDisplay){
          passDisplay.textContent=passVisible?(realPass||'(sin contraseña)'):'••••••••';
          passDisplay.style.color=passVisible?'#b91c1c':'var(--t1)';
          passDisplay.style.letterSpacing=passVisible?'1px':'2px';
        }
        btnShow.innerHTML=passVisible?'🙈 Ocultar':'👁 Mostrar';
      };
    }
    if(btnCopy){
      btnCopy.onclick=()=>{
        const realPass=(DB.ests.find(x=>x.id===(datos&&datos.id))||{}).password||'';
        if(!realPass){ toast('No hay contraseña guardada.','wa'); return; }
        const fallback=()=>{
          const tmp=document.createElement('input'); tmp.value=realPass;
          document.body.appendChild(tmp); tmp.select(); document.execCommand('copy');
          document.body.removeChild(tmp); toast('Contraseña copiada. 📋');
        };
        if(navigator.clipboard){ navigator.clipboard.writeText(realPass).then(()=>toast('Contraseña copiada al portapapeles. 📋')).catch(fallback); }
        else fallback();
      };
    }
    q('#toggle-new-pass')&&q('#toggle-new-pass').addEventListener('click',()=>{
      const inp=q('#m-pass-est'); if(!inp) return;
      const oculto=inp.type==='password'; inp.type=oculto?'text':'password';
      q('#toggle-new-pass').textContent=oculto?'🙈':'👁';
    });
    q('#m-reset-cred')&&q('#m-reset-cred').addEventListener('click',()=>{
      if(!confirm('¿Borrar las credenciales de '+datos.nombres+'?\n\nEl estudiante solo podrá ingresar con su código ('+datos.codigo+') hasta que vuelva a crearlas.')) return;
      const est=DB.ests.find(x=>x.id===datos.id);
      if(est){ est.usuario=''; est.password=''; est.credCreadas=false; syncEstUpdate(est); }
      toast('Credenciales borradas. El estudiante usará su código: '+datos.codigo);
      closeModal(); render();
    });
    q('#m-save').onclick=async()=>{
      const nom=qv('#m-nom'),apodId=+qv('#m-apod'),grado=qv('#m-grado'),edad=+qv('#m-edad');
      if(!nom||!apodId||!grado||!edad){ toast('Completa los campos obligatorios.','wa'); return; }
      const cel=qv('#m-cel'),cor=qv('#m-cor');
      if(datos&&datos.id){
        const e=DB.ests.find(x=>x.id===datos.id);
        if(e){
          e.nombres=nom; e.apodId=apodId; e.grado=grado; e.edad=edad; e.cel=cel; e.correo=cor;
          const newUsr=(qv('#m-usr-est')||'').trim();
          const newPass=(qv('#m-pass-est')||'').trim();
          if(newUsr){
            if(!/^[a-zA-Z0-9._]+$/.test(newUsr)){ toast('El usuario solo puede tener letras, números, punto o guion bajo.','wa'); return; }
            const ocupado=DB.ests.find(x=>x.id!==e.id&&x.credCreadas&&x.usuario===newUsr);
            if(ocupado){ toast('Ese usuario ya lo usa otro estudiante. Elige otro.','wa'); return; }
            e.usuario=newUsr;
          }
          if(newPass){ if(newPass.length<4){ toast('La contraseña debe tener al menos 4 caracteres.','wa'); return; } e.password=newPass; }
          if(e.usuario&&e.password) e.credCreadas=true;
          syncEstUpdate(e);
        }
      } else {
        const id=nid();
        const codigo='EST-'+id.toString().slice(-3);
        const ne={id,apodId,nombres:nom,edad,grado,cel,correo:cor,codigo,usuario:'',password:'',credCreadas:false};
        DB.ests.push(ne); syncEstNuevo(ne);
      }
      toast('Estudiante guardado correctamente.'); closeModal(); render();
    };
  }
  else if(tipo==='edit-mat'){
    q('#m-save').onclick=async()=>{
      const num=qv('#m-num'),estId=+qv('#m-est'),monto=+qv('#m-monto'),desde=qv('#m-desde'),hasta=qv('#m-hasta'),fecha=qv('#m-fecha'),pagado=qv('#m-pag')==='1';
      if(!estId||!monto||!desde||!hasta){ toast('Completa los campos obligatorios.','wa'); return; }
      if(datos&&datos.id){
        const m=DB.mats.find(x=>x.id===datos.id);
        if(m){ m.estId=estId; m.monto=monto; m.desde=desde; m.hasta=hasta; m.fecha=fecha; m.pagado=pagado; syncMatUpdate(m); }
      } else {
        const nm={id:nid(),num,estId,fecha,monto,desde,hasta,pagado};
        DB.mats.push(nm); syncMatNueva(nm);
      }
      toast('Matrícula guardada.'); closeModal(); render();
    };
  }
  else if(tipo==='edit-admin'){
    q('#m-save').onclick=async()=>{
      const nom=qv('#m-nom'),usr=qv('#m-usr'),pass=qv('#m-pass'),email=qv('#m-email');
      if(!nom||(!datos&&!usr)){ toast('Completa nombre y usuario.','wa'); return; }
      if(datos&&datos.id){
        const a=DB.admins.find(x=>x.id===datos.id);
        if(a){ a.nombres=nom; a.email=email; if(pass) a.password=pass; syncAdminUpdate(a); }
      } else {
        if(!usr){ toast('Ingresa un usuario.','wa'); return; }
        if(DB.admins.find(a=>a.usuario===usr)){ toast('El usuario ya existe.','wa'); return; }
        const na={id:nid(),nombres:nom,usuario:usr,password:pass||'rupani123',email,esSuperAdmin:false};
        DB.admins.push(na); syncAdminNuevo(na);
      }
      toast('Administrador guardado.'); closeModal(); render();
    };
  }
  else if(tipo==='edit-sim'){
    q('#m-save').onclick=async()=>{
      const titulo=qv('#s-titulo').trim();
      const fecha=qv('#s-fecha');
      const total=+qv('#s-total')||200;
      if(!titulo||!fecha){ toast('Completa título y fecha.','wa'); return; }
      if(datos&&datos.id){
        const s=DB.sims.find(x=>x.id===datos.id);
        if(s){ s.titulo=titulo; s.fecha=fecha; s.total=total; syncSimUpdate(s); }
      } else {
        const ns={id:nid(),titulo,fecha,total,res:[]};
        DB.sims.push(ns);
        DB.adminSimSel=ns.id;
        syncSimNuevo(ns);
      }
      toast('Simulacro guardado.'); closeModal(); render();
    };
  }
  else if(tipo==='confirm'){
    q('#m-confirm-ok').onclick=()=>{ datos.onConfirm(); closeModal(); render(); };
  }
}

function openModal(tipo,datos){ DB.modal={tipo,datos:datos||null}; renderModal(); }
function confirmDelete(msg,onConfirm){ openModal('confirm',{titulo:'Eliminar registro',msg,onConfirm}); }

// ══ DASHBOARD ══
function renderDash(){
  const pag=DB.mats.filter(m=>m.pagado).length;
  const deu=DB.mats.filter(m=>!m.pagado).length;
  const ing=DB.mats.filter(m=>m.pagado).reduce((s,m)=>s+m.monto,0);
  const sim=DB.sims[DB.sims.length-1];
  const top3=sim?[...sim.res].sort((a,b)=>b.pts-a.pts).slice(0,3):[];
  const deudaRows=DB.mats.filter(m=>!m.pagado).map(m=>{ const e=getEst(m.estId); return '<tr class="dr"><td style="font-weight:600">'+e.nombres+'</td><td style="font-size:11.5px">'+e.grado+'</td><td><span class="badge b-no">S/ '+m.monto+'</span></td><td style="font-size:11.5px">'+fmtMes(m.desde)+' → '+fmtMes(m.hasta)+'</td></tr>'; }).join('');
  const matRows=[...DB.mats].reverse().slice(0,6).map(m=>{ const e=getEst(m.estId); return '<tr><td style="font-size:11.5px;color:var(--t3)">'+m.num+'</td><td style="font-weight:600">'+e.nombres+'</td><td style="font-size:12px">'+e.grado+'</td><td style="font-size:12px">'+fmtMes(m.desde)+' → '+fmtMes(m.hasta)+'</td><td>S/ '+m.monto+'</td><td><span class="badge '+(m.pagado?'b-ok':'b-no')+'">'+(m.pagado?'Pagado':'Pendiente')+'</span></td></tr>'; }).join('');
  const podio=['🥇','🥈','🥉'];

  let html='<div class="sg">';
  html+='<div class="sc"><div class="si" style="background:var(--Pl)">👥</div><div class="sl">Estudiantes</div><div class="sv">'+DB.ests.length+'</div><div class="ss">'+DB.apods.length+' apoderados</div></div>';
  html+='<div class="sc"><div class="si" style="background:var(--Gb)">📋</div><div class="sl">Matrículas</div><div class="sv">'+DB.mats.length+'</div><div class="ss">'+pag+' al día</div></div>';
  html+='<div class="sc"><div class="si" style="background:var(--okb)">💰</div><div class="sl">Ingresos cobrados</div><div class="sv" style="font-size:22px">S/'+ing+'</div><div class="ss">confirmados</div></div>';
  html+='<div class="sc"><div class="si" style="background:var(--nob)">⚠️</div><div class="sl">Con deuda</div><div class="sv" style="color:var(--no)">'+deu+'</div><div class="ss">pago pendiente</div></div>';
  html+='</div>';
  html+='<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px">';
  html+='<div class="card"><div class="ch"><div><div class="ct">Alumnos con deuda</div></div><button class="btn bo bsm" id="ir-pagos">Ver todos</button></div>';
  html+=(deu===0?'<div class="empty">✅ Sin deudas</div>':'<table><thead><tr><th>Estudiante</th><th>Grado</th><th>Monto</th><th>Periodo</th></tr></thead><tbody>'+deudaRows+'</tbody></table>');
  html+='</div>';
  html+='<div class="card"><div class="ch"><div><div class="ct">Podio · '+(sim?sim.titulo:'—')+'</div></div><button class="btn bo bsm" id="ir-sims">Ver ranking</button></div>';
  top3.forEach((r,i)=>{ const e=getEst(r.estId); html+='<div style="display:flex;align-items:center;gap:12px;padding:9px 0;'+(i<2?'border-bottom:1px solid var(--brd)':'')+'">'+'<div style="font-size:22px">'+podio[i]+'</div>'+'<div style="flex:1"><div style="font-weight:600;font-size:13px">'+e.nombres+'</div><div style="font-size:11px;color:var(--t3)">'+e.grado+'</div></div>'+'<div style="font-weight:800;font-size:17px;color:'+(i===0?'#92400e':'var(--t1)')+'">'+r.pts+'</div></div>'; });
  html+='</div></div>';
  html+='<div class="card"><div class="ch"><div class="ct">Matrículas recientes</div></div><table><thead><tr><th>N°</th><th>Estudiante</th><th>Grado</th><th>Periodo</th><th>Monto</th><th>Estado</th></tr></thead><tbody>'+matRows+'</tbody></table></div>';
  return html;
}

// ══ ADMINISTRACIÓN CRUD ══
function renderAdmin(){
  const tab=DB.adminTab;
  const isSA=DB.session&&DB.session.esSuperAdmin;
  const tabNames={apods:'Apoderados',ests:'Estudiantes',mats:'Matrículas',sims:'Simulacros',admins:'Administradores'};
  const tabs=['apods','ests','mats','sims','admins'].map(t=>'<button class="tab'+(tab===t?' act':'')+'" data-tab="'+t+'">'+tabNames[t]+'</button>').join('');

  let content='';
  if(tab==='apods'){
    const rows=DB.apods.map(a=>'<tr><td style="font-weight:600">'+a.nombres+'</td><td>'+a.cel+'</td><td style="color:var(--t3)">'+(a.correo||'—')+'</td><td style="font-size:12px">'+a.dir+'</td><td><div style="display:flex;gap:6px"><button class="btn bo bsm crud-edit" data-tipo="apod" data-id="'+a.id+'">✏ Editar</button><button class="btn bed bsm crud-del" data-tipo="apod" data-id="'+a.id+'">🗑</button></div></td></tr>').join('');
    content='<div class="ch" style="margin-bottom:14px"><div class="ct">Apoderados ('+DB.apods.length+')</div><button class="btn bp bsm crud-new" data-tipo="apod">➕ Nuevo apoderado</button></div>';
    content+='<table><thead><tr><th>Nombres</th><th>Celular</th><th>Correo</th><th>Dirección</th><th>Acciones</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  else if(tab==='ests'){
    const rows=DB.ests.map(e=>{ const a=getApod(e.apodId); return '<tr><td><div style="font-weight:600">'+e.nombres+'</div><div style="font-size:11px;color:var(--t3)">'+e.codigo+'</div></td><td style="font-size:12px">'+e.grado+'</td><td>'+e.edad+' años</td><td style="font-size:12px">'+a.nombres+'</td><td>'+(e.credCreadas?'<span class="badge b-ok" style="font-size:11px">🔐 @'+e.usuario+'</span>':'<span class="badge b-wa" style="font-size:11px">⚠ Solo código</span>')+'</td><td><div style="display:flex;gap:6px"><button class="btn bo bsm crud-edit" data-tipo="est" data-id="'+e.id+'">✏ Editar</button><button class="btn bed bsm crud-del" data-tipo="est" data-id="'+e.id+'">🗑</button></div></td></tr>'; }).join('');
    content='<div class="ch" style="margin-bottom:14px"><div class="ct">Estudiantes ('+DB.ests.length+')</div><button class="btn bp bsm crud-new" data-tipo="est">➕ Nuevo estudiante</button></div>';
    content+='<table><thead><tr><th>Estudiante / Código</th><th>Grado</th><th>Edad</th><th>Apoderado</th><th>Acceso</th><th>Acciones</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  else if(tab==='mats'){
    const rows=DB.mats.map(m=>{ const e=getEst(m.estId); return '<tr class="'+(m.pagado?'':'dr')+'"><td style="font-size:11.5px;color:var(--t3)">'+m.num+'</td><td style="font-weight:600;font-size:12.5px">'+e.nombres+'</td><td style="font-size:12px">'+fmtMes(m.desde)+' → '+fmtMes(m.hasta)+'</td><td>S/ '+m.monto+'</td><td><span class="badge '+(m.pagado?'b-ok':'b-no')+'">'+(m.pagado?'Pagado':'Pendiente')+'</span></td><td><div style="display:flex;gap:6px"><button class="btn bo bsm crud-edit" data-tipo="mat" data-id="'+m.id+'">✏ Editar</button><button class="btn bed bsm crud-del" data-tipo="mat" data-id="'+m.id+'">🗑</button></div></td></tr>'; }).join('');
    content='<div class="ch" style="margin-bottom:14px"><div class="ct">Matrículas ('+DB.mats.length+')</div><button class="btn bp bsm crud-new" data-tipo="mat">➕ Nueva matrícula</button></div>';
    content+='<table><thead><tr><th>N°</th><th>Estudiante</th><th>Periodo</th><th>Monto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  else if(tab==='sims'){
    content=renderAdminSims();
  }
  else if(tab==='admins'){
    if(!isSA){
      content='<div class="alert al-wa">⚠ Solo el Super Administrador puede gestionar otros administradores.</div>';
    } else {
      const rows=DB.admins.map(a=>'<tr><td><div style="font-weight:600">'+a.nombres+'</div>'+(a.esSuperAdmin?'<span class="badge b-crown" style="font-size:10px;margin-top:3px">👑 Super Admin</span>':'')+'</td><td><span class="badge b-p">'+a.usuario+'</span></td><td style="color:var(--t3)">'+(a.email||'—')+'</td><td><div style="display:flex;gap:6px"><button class="btn bo bsm crud-edit" data-tipo="admin" data-id="'+a.id+'">✏ Editar</button>'+(a.esSuperAdmin?'<span style="font-size:11px;color:var(--t3)">— protegido</span>':'<button class="btn bed bsm crud-del" data-tipo="admin" data-id="'+a.id+'">🗑</button>')+'</div></td></tr>').join('');
      content='<div class="alert al-in" style="margin-bottom:14px">👑 Solo el Super Admin puede agregar, editar o eliminar administradores.</div>';
      content+='<div class="ch" style="margin-bottom:14px"><div class="ct">Administradores ('+DB.admins.length+')</div><button class="btn bp bsm crud-new" data-tipo="admin">➕ Agregar admin</button></div>';
      content+='<table><thead><tr><th>Nombres</th><th>Usuario</th><th>Correo</th><th>Acciones</th></tr></thead><tbody>'+rows+'</tbody></table>';
    }
  }
  return '<div class="tabs" style="flex-wrap:wrap">'+tabs+'</div><div class="card">'+content+'</div>';
}

// ══ SIMULACROS CRUD ══
function renderAdminSims(){
  const simSel=DB.adminSimSel;
  const sim=DB.sims.find(s=>s.id===simSel);

  const simList=DB.sims.map(s=>{
    const isActive=simSel===s.id;
    return '<div class="sim-list-item" data-sid="'+s.id+'" style="display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:10px;cursor:pointer;margin-bottom:6px;background:'+(isActive?'var(--Pl)':'#f8f9fe')+';border:1.5px solid '+(isActive?'var(--P)':'var(--brd)')+';transition:all .15s"><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13.5px">'+s.titulo+'</div><div style="font-size:12px;color:var(--t3)">'+fmtDate(s.fecha)+' · '+s.total+' preguntas · '+s.res.length+' resultados</div></div><div style="display:flex;gap:6px;flex-shrink:0"><button class="btn bo bsm sim-crud-edit" data-sid="'+s.id+'" style="font-size:11.5px">✏ Editar</button><button class="btn bed bsm sim-crud-del" data-sid="'+s.id+'" style="font-size:11.5px">🗑</button></div></div>';
  }).join('');

  let panelPuntajes='';
  if(sim){
    const ranked=[...sim.res].sort((a,b)=>b.pts-a.pts);
    const tercio=Math.ceil(ranked.length/3);
    const rankRows=ranked.map((r,i)=>{
      const e=getEst(r.estId);
      const iT=i<tercio;
      const pct=Math.round((r.ok/sim.total)*100);
      const ic=i===0?'🥇':i===1?'🥈':i===2?'🥉':'<b style="color:var(--P)">'+(i+1)+'</b>';
      return '<tr class="'+(iT?'tr3':'')+'"><td>'+ic+'</td><td><div style="font-weight:600;font-size:13px">'+e.nombres+'</div><div style="font-size:11px;color:var(--t3)">'+e.grado+(iT?' <span class="badge b-pu" style="font-size:10px;padding:1px 6px">Tercio</span>':'')+'</div></td><td style="font-weight:800;font-size:15px;color:'+(i===0?'#92400e':'var(--t1)')+'">'+r.pts+'</td><td>'+r.ok+'</td><td><span style="font-weight:700;font-size:12px;color:'+(pct>=70?'var(--ok)':pct>=50?'var(--wa)':'var(--no)')+'">'+pct+'%</span></td><td><div style="display:flex;gap:4px"><input type="number" class="sim-pts-inp" data-eid="'+r.estId+'" value="'+r.pts+'" style="width:68px;padding:5px 7px;font-size:12px;border:1.5px solid var(--brd);border-radius:6px"><button class="btn bp bsm sim-pts-save" data-eid="'+r.estId+'" style="padding:5px 8px">✓</button><button class="btn bed bsm sim-res-del" data-eid="'+r.estId+'" style="padding:5px 8px">🗑</button></div></td></tr>';
    }).join('');

    const sinResult=DB.ests.filter(e=>!sim.res.find(r=>r.estId===e.id));
    const addRows=sinResult.map(e=>'<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--brd)"><div style="flex:1;font-weight:500;font-size:13px">'+e.nombres.split(' ').slice(0,2).join(' ')+'<span style="font-size:11px;color:var(--t3);margin-left:6px">'+e.grado+'</span></div><input type="number" class="sim-new-inp" data-eid="'+e.id+'" placeholder="Puntaje" style="width:80px;padding:6px 8px;font-size:13px;border:1.5px solid var(--brd);border-radius:6px"><input type="number" class="sim-new-ok" data-eid="'+e.id+'" placeholder="Correctas" style="width:80px;padding:6px 8px;font-size:13px;border:1.5px solid var(--brd);border-radius:6px"><button class="btn bp bsm sim-add-res" data-eid="'+e.id+'" style="padding:6px 10px;font-size:12px">➕ Agregar</button></div>').join('');

    panelPuntajes='<div style="margin-top:18px">';
    panelPuntajes+='<div class="ch" style="margin-bottom:12px"><div><div class="ct">'+sim.titulo+'</div><div class="cs">'+fmtDate(sim.fecha)+' · '+sim.total+' preguntas</div></div><span class="badge b-pu">Morado = Tercio superior</span></div>';
    if(ranked.length>0) panelPuntajes+='<div style="margin-bottom:16px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);margin-bottom:8px">Resultados registrados — edita o elimina</div><table><thead><tr><th>Pos.</th><th>Estudiante</th><th>Puntaje</th><th>Correctas</th><th>%</th><th>Editar</th></tr></thead><tbody>'+rankRows+'</tbody></table></div>';
    if(sinResult.length>0) panelPuntajes+='<div style="border-top:1px solid var(--brd);padding-top:14px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);margin-bottom:10px">Agregar resultados</div>'+addRows+'</div>';
    else panelPuntajes+='<div class="alert al-ok">✓ Todos los estudiantes tienen resultado en este simulacro.</div>';
    panelPuntajes+='</div>';
  }

  return '<div style="display:grid;grid-template-columns:1fr 1.8fr;gap:18px">' +
    '<div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-weight:700;font-size:13.5px">Simulacros ('+DB.sims.length+')</span><button class="btn bp bsm" id="sim-nuevo-btn">➕ Nuevo</button></div>' +
    (DB.sims.length===0?'<div class="empty" style="padding:24px 0">Sin simulacros aún</div>':simList) +
    '</div>' +
    '<div>'+(sim?panelPuntajes:'<div style="text-align:center;padding:32px 0;color:var(--t3)">← Selecciona un simulacro para gestionar sus resultados</div>')+'</div>' +
    '</div>';
}

function bindAdminSims(){
  document.querySelectorAll('.sim-list-item').forEach(el=>{
    el.addEventListener('click',e=>{ if(e.target.closest('button')) return; DB.adminSimSel=+el.dataset.sid; render(); });
  });
  q('#sim-nuevo-btn')&&q('#sim-nuevo-btn').addEventListener('click',()=>openModal('edit-sim',null));
  document.querySelectorAll('.sim-crud-edit').forEach(b=>{
    b.addEventListener('click',()=>{ const s=DB.sims.find(x=>x.id===+b.dataset.sid); openModal('edit-sim',s); });
  });
  document.querySelectorAll('.sim-crud-del').forEach(b=>{
    b.addEventListener('click',()=>{
      const s=DB.sims.find(x=>x.id===+b.dataset.sid);
      confirmDelete('¿Eliminar "'+(s?s.titulo:'este simulacro')+'"? Se perderán todos sus resultados.',async()=>{
        DB.sims=DB.sims.filter(x=>x.id!==+b.dataset.sid);
        if(DB.adminSimSel===+b.dataset.sid) DB.adminSimSel=DB.sims.length>0?DB.sims[0].id:null;
        await syncSimDelete(+b.dataset.sid);
        toast('Simulacro eliminado.');
        render();
      });
    });
  });
  document.querySelectorAll('.sim-pts-save').forEach(b=>{
    b.addEventListener('click',()=>{
      const eid=+b.dataset.eid;
      const inp=document.querySelector('.sim-pts-inp[data-eid="'+eid+'"]');
      const pts=+(inp?inp.value:0);
      if(!pts){ toast('Ingresa un puntaje válido.','wa'); return; }
      const sim=DB.sims.find(s=>s.id===DB.adminSimSel);
      if(!sim) return;
      const r=sim.res.find(x=>x.estId===eid);
      if(r){ r.pts=pts; r.ok=Math.round(pts/10); }
      syncSimUpdate(sim);
      toast('Puntaje actualizado.'); render();
    });
  });
  document.querySelectorAll('.sim-res-del').forEach(b=>{
    b.addEventListener('click',()=>{
      const eid=+b.dataset.eid;
      const sim=DB.sims.find(s=>s.id===DB.adminSimSel);
      if(!sim) return;
      const e=getEst(eid);
      confirmDelete('¿Eliminar el resultado de '+e.nombres+'?',async()=>{
        sim.res=sim.res.filter(r=>r.estId!==eid);
        await syncSimUpdate(sim);
        toast('Resultado eliminado.'); render();
      });
    });
  });
  document.querySelectorAll('.sim-add-res').forEach(b=>{
    b.addEventListener('click',()=>{
      const eid=+b.dataset.eid;
      const pts=+(document.querySelector('.sim-new-inp[data-eid="'+eid+'"]')?document.querySelector('.sim-new-inp[data-eid="'+eid+'"]').value:0);
      const ok_=+(document.querySelector('.sim-new-ok[data-eid="'+eid+'"]')?document.querySelector('.sim-new-ok[data-eid="'+eid+'"]').value:0);
      if(!pts){ toast('Ingresa el puntaje.','wa'); return; }
      const sim=DB.sims.find(s=>s.id===DB.adminSimSel);
      if(!sim) return;
      sim.res.push({estId:eid,pts,ok:ok_||Math.round(pts/10)});
      syncSimUpdate(sim);
      toast('Resultado agregado.'); render();
    });
  });
}

// ══ MATRICULAR ══
function renderMatricular(){
  const s=DB.matStep;
  let stepperHTML='<div style="display:flex;align-items:flex-start;width:100%;margin-bottom:22px">';
  ['Apoderado','Estudiante','Matrícula'].forEach((st,i)=>{
    stepperHTML+='<div style="display:flex;align-items:flex-start;'+(i<2?'flex:1':'')+'">';
    stepperHTML+='<div style="display:flex;flex-direction:column;align-items:center;gap:4px">';
    stepperHTML+='<div class="stp-c" style="background:'+(s>i+1?'var(--ok)':s===i+1?'var(--P)':'var(--brd)')+';color:'+(s>=i+1?'#fff':'var(--t3)')+';">'+(s>i+1?'✓':i+1)+'</div>';
    stepperHTML+='<span class="stp-l" style="color:'+(s===i+1?'var(--P)':'var(--t3)')+'">'+st+'</span>';
    stepperHTML+='</div>';
    if(i<2) stepperHTML+='<div class="stp-line" style="background:'+(s>i+1?'var(--ok)':'var(--brd)')+'"></div>';
    stepperHTML+='</div>';
  });
  stepperHTML+='</div>';

  const apodOpts=DB.apods.map(a=>'<option value="'+a.id+'"'+(DB.matApodSel==a.id?' selected':'')+'>'+a.nombres+' · '+a.cel+'</option>').join('');
  let formHTML='';

  if(s===1){
    const m=DB.matApodMode;
    formHTML='<div class="ch"><div><div class="ct">Datos del apoderado</div></div></div>';
    formHTML+='<div class="tabs"><button class="tab'+(m==='nuevo'?' act':'')+'" id="apod-nuevo">Nuevo</button><button class="tab'+(m==='existente'?' act':'')+'" id="apod-exist">Ya registrado</button></div>';
    if(m==='existente'){
      formHTML+='<div class="fl"><label class="flabel">Seleccionar apoderado *</label><select id="apodSel"><option value="">— Selecciona —</option>'+apodOpts+'</select></div>';
    } else {
      formHTML+='<div class="fg">';
      formHTML+='<div class="fl fgf"><label class="flabel">Nombres *</label><input type="text" id="a-nom" value="'+DB.matAF.nombres+'"></div>';
      formHTML+='<div class="fl fgf"><label class="flabel">Dirección *</label><input type="text" id="a-dir" value="'+DB.matAF.dir+'"></div>';
      formHTML+='<div class="fl"><label class="flabel">Celular *</label><input type="text" id="a-cel" value="'+DB.matAF.cel+'"></div>';
      formHTML+='<div class="fl"><label class="flabel">Correo</label><input type="email" id="a-cor" value="'+DB.matAF.correo+'"></div>';
      formHTML+='</div>';
    }
  } else if(s===2){
    const gradOpts=grados.map(g=>'<option value="'+g+'"'+(DB.matEF.grado===g?' selected':'')+'>'+g+'</option>').join('');
    formHTML='<div class="ch"><div><div class="ct">Datos del estudiante</div></div></div>';
    formHTML+='<div class="fg">';
    formHTML+='<div class="fl fgf"><label class="flabel">Nombres *</label><input type="text" id="e-nom" value="'+DB.matEF.nombres+'"></div>';
    formHTML+='<div class="fl"><label class="flabel">Edad *</label><input type="number" id="e-edad" value="'+DB.matEF.edad+'" min="5" max="25"></div>';
    formHTML+='<div class="fl"><label class="flabel">Grado *</label><select id="e-grado"><option value="">—</option>'+gradOpts+'</select></div>';
    formHTML+='<div class="fl"><label class="flabel">Celular</label><input type="text" id="e-cel" value="'+DB.matEF.cel+'"></div>';
    formHTML+='<div class="fl"><label class="flabel">Correo</label><input type="email" id="e-cor" value="'+DB.matEF.correo+'"></div>';
    formHTML+='</div>';
  } else {
    const autoNum='MAT-'+anioActual()+'-'+String(DB.mats.length+1).padStart(3,'0');
    formHTML='<div class="ch"><div><div class="ct">Datos de la matrícula</div></div></div>';
    formHTML+='<div class="fg">';
    formHTML+='<div class="fl"><label class="flabel">N° Matrícula</label><input type="text" value="'+(DB.matMF.num||autoNum)+'" readonly></div>';
    formHTML+='<div class="fl"><label class="flabel">Fecha de registro</label><input type="date" id="m-fecha" value="'+(DB.matMF.fecha||hoy())+'"></div>';
    formHTML+='<div class="fl"><label class="flabel">Paga desde *</label><input type="month" id="m-desde" value="'+(DB.matMF.desde||hoyMes())+'"></div>';
    formHTML+='<div class="fl"><label class="flabel">Paga hasta *</label><input type="month" id="m-hasta" value="'+(DB.matMF.hasta||hoyMes())+'"></div>';
    formHTML+='<div class="fl"><label class="flabel">Monto (S/) *</label><input type="number" id="m-monto" value="'+DB.matMF.monto+'" placeholder="0.00"></div>';
    formHTML+='</div>';
  }

  let html=stepperHTML;
  if(DB.matErr) html+='<div class="alert al-no">⚠ '+DB.matErr+'</div>';
  html+='<div class="card">'+formHTML;
  html+='<div style="display:flex;justify-content:space-between;margin-top:20px;padding-top:16px;border-top:1px solid var(--brd)">';
  html+=s>1?'<button class="btn bo" id="mat-prev">← Anterior</button>':'<div></div>';
  html+=s<3?'<button class="btn bp" id="mat-next">Siguiente →</button>':'<button class="btn ba" id="mat-save">✓ Guardar matrícula</button>';
  html+='</div></div>';
  return html;
}

// ══ PAGOS ══
function renderPagos(){
  const f=DB.pagoFiltro;
  const all=DB.mats;
  const lista=f==='todos'?all:f==='deuda'?all.filter(m=>!m.pagado):all.filter(m=>m.pagado);
  const rows=lista.map(m=>{ const e=getEst(m.estId); return '<tr class="'+(m.pagado?'':'dr')+'"><td style="font-size:11.5px;color:var(--t3)">'+m.num+'</td><td style="font-weight:600">'+e.nombres+'</td><td style="font-size:12px">'+e.grado+'</td><td style="font-size:12px">'+fmtMes(m.desde)+' → '+fmtMes(m.hasta)+'</td><td style="font-weight:600">S/ '+m.monto+'</td><td><span class="badge '+(m.pagado?'b-ok':'b-no')+'">'+(m.pagado?'Pagado':'Pendiente')+'</span></td><td>'+(!m.pagado?'<button class="btn bok bsm pago-btn" data-id="'+m.id+'">✓ Marcar pagado</button>':'<span style="font-size:12px;color:var(--t3)">✓</span>')+'</td></tr>'; }).join('');
  let html='<div class="tabs">';
  html+='<button class="tab'+(f==='todos'?' act':'')+'" id="pf-todos">Todos ('+all.length+')</button>';
  html+='<button class="tab'+(f==='deuda'?' act':'')+'" id="pf-deuda">Con deuda ('+all.filter(m=>!m.pagado).length+')</button>';
  html+='<button class="tab'+(f==='pagado'?' act':'')+'" id="pf-pagado">Pagados ('+all.filter(m=>m.pagado).length+')</button>';
  html+='</div>';
  html+='<div class="card">'+(lista.length===0?'<div class="empty">Sin registros</div>':'<table><thead><tr><th>N°</th><th>Estudiante</th><th>Grado</th><th>Periodo</th><th>Monto</th><th>Estado</th><th>Acción</th></tr></thead><tbody>'+rows+'</tbody></table>')+'</div>';
  return html;
}

// ══ BUSCAR ══
function renderBuscar(){
  const tipo=DB.busqTipo, q_=DB.busqQ;
  let html='<div class="tabs">';
  html+='<button class="tab'+(tipo==='est'?' act':'')+'" id="bt-est">Por estudiante</button>';
  html+='<button class="tab'+(tipo==='apod'?' act':'')+'" id="bt-apod">Por apoderado</button>';
  html+='</div>';
  html+='<div class="srch"><span class="srch-ic">🔍</span><input type="text" class="srch-in" id="busq-inp" value="'+q_+'" placeholder="Escribe el nombre..." autocomplete="off"></div>';
  html+='<div style="display:grid;grid-template-columns:1fr 1.6fr;gap:16px">';
  html+='<div id="busq-panel-res">'+buildResHTML()+'</div>';
  html+='<div id="busq-panel-det">'+buildDetalleHTML()+'</div>';
  html+='</div>';
  return html;
}

function buildResHTML(){
  const tipo=DB.busqTipo, q_=DB.busqQ, sel=DB.busqSel;
  if(q_.length===0) return '<div class="card" style="text-align:center;padding:24px;color:var(--t3)">Escribe para buscar</div>';
  const res=tipo==='est'
    ?DB.ests.filter(e=>e.nombres.toLowerCase().includes(q_.toLowerCase()))
    :DB.apods.filter(a=>a.nombres.toLowerCase().includes(q_.toLowerCase()));
  if(res.length===0) return '<div class="card" style="padding:8px"><div class="empty" style="padding:16px">Sin resultados para "'+q_+'"</div></div>';
  const items=res.map(r=>'<div class="busq-r" data-id="'+r.id+'" style="padding:10px 12px;cursor:pointer;border-radius:8px;margin-bottom:2px;background:'+(sel&&sel.id===r.id?'var(--Pl)':'transparent')+';transition:background .1s"><div style="font-weight:600;font-size:13.5px">'+r.nombres+'</div><div style="font-size:11.5px;color:var(--t3)">'+(tipo==='est'?r.grado:r.cel)+'</div></div>').join('');
  return '<div class="card" style="padding:8px">'+items+'</div>';
}

function buildDetalleHTML(){
  const tipo=DB.busqTipo, sel=DB.busqSel;
  if(!sel) return '<div class="card" style="text-align:center;padding:30px;color:var(--t3)">Selecciona un resultado</div>';
  if(tipo==='est'){
    const a=getApod(sel.apodId);
    const ml=DB.mats.filter(m=>m.estId===sel.id);
    const deu=ml.some(m=>!m.pagado);
    const mrows=ml.map(m=>'<tr class="'+(m.pagado?'':'dr')+'"><td style="font-size:11.5px">'+m.num+'</td><td style="font-size:12px">'+fmtMes(m.desde)+' → '+fmtMes(m.hasta)+'</td><td>S/'+m.monto+'</td><td><span class="badge '+(m.pagado?'b-ok':'b-no')+'">'+(m.pagado?'Pagado':'Pendiente')+'</span></td></tr>').join('');
    let html='<div class="card">';
    html+='<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px">';
    html+='<div style="width:48px;height:48px;border-radius:50%;background:var(--Pl);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:var(--P);flex-shrink:0">'+sel.nombres.charAt(0)+'</div>';
    html+='<div><div style="font-weight:700;font-size:16px">'+sel.nombres+'</div>';
    html+='<div style="color:var(--t3);font-size:12.5px">'+sel.grado+' · '+sel.edad+' años · <span style="background:var(--Pl);color:var(--P);padding:1px 7px;border-radius:8px;font-size:11px;font-weight:700">'+sel.codigo+'</span></div>';
    html+='<div style="margin-top:7px"><span class="badge '+(deu?'b-no':'b-ok')+'">'+(deu?'⚠ Deuda pendiente':'✓ Al día')+'</span></div></div></div>';
    html+='<div class="divider"></div>';
    html+='<div style="font-size:13px;color:var(--t2);line-height:2;margin-bottom:12px"><strong>Apoderado:</strong> '+a.nombres+'<br><strong>Celular:</strong> '+a.cel+(a.correo?'<br><strong>Correo:</strong> '+a.correo:'')+'<br><strong>Dirección:</strong> '+a.dir+'</div>';
    html+='<div class="divider"></div>';
    html+='<div class="ct" style="margin-bottom:10px">Matrículas</div>';
    html+=ml.length===0?'<div class="empty" style="padding:12px">Sin matrículas</div>':'<table><thead><tr><th>N°</th><th>Periodo</th><th>Monto</th><th>Estado</th></tr></thead><tbody>'+mrows+'</tbody></table>';
    html+='</div>';
    return html;
  } else {
    const hijos=DB.ests.filter(e=>e.apodId===sel.id);
    const hHTML=hijos.map(h=>{ const sm=DB.mats.filter(m=>m.estId===h.id); const d=sm.some(m=>!m.pagado); return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--brd)"><div><div style="font-weight:600">'+h.nombres+'</div><div style="font-size:11.5px;color:var(--t3)">'+h.grado+' · '+h.edad+' años</div></div><span class="badge '+(d?'b-no':'b-ok')+'">'+(d?'Deuda':'Al día')+'</span></div>'; }).join('');
    let html='<div class="card">';
    html+='<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:14px">';
    html+='<div style="width:48px;height:48px;border-radius:50%;background:var(--Gb);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#7a4400;flex-shrink:0">'+sel.nombres.charAt(0)+'</div>';
    html+='<div><div style="font-weight:700;font-size:16px">'+sel.nombres+'</div>';
    html+='<div style="font-size:12.5px;color:var(--t3)">'+sel.cel+(sel.correo?' · '+sel.correo:'')+'</div>';
    html+='<div style="font-size:12px;color:var(--t3)">'+sel.dir+'</div></div></div>';
    html+='<div class="divider"></div>';
    html+='<div class="ct" style="margin-bottom:10px">Hijos a cargo ('+hijos.length+')</div>';
    html+=hijos.length===0?'<div class="empty">Sin estudiantes</div>':hHTML;
    html+='</div>';
    return html;
  }
}

function actualizarBuscar(){
  const panelRes=document.getElementById('busq-panel-res');
  const panelDet=document.getElementById('busq-panel-det');
  if(!panelRes||!panelDet) return;
  panelRes.innerHTML=buildResHTML();
  panelDet.innerHTML=buildDetalleHTML();
  bindBuscarResultados();
}

function bindBuscarResultados(){
  document.querySelectorAll('.busq-r').forEach(el=>{
    el.addEventListener('click',()=>{
      const id=+el.dataset.id;
      DB.busqSel=DB.busqTipo==='est'?DB.ests.find(e=>e.id===id):DB.apods.find(a=>a.id===id);
      actualizarBuscar();
    });
    el.onmouseenter=()=>{ if(!(DB.busqSel&&DB.busqSel.id===+el.dataset.id)) el.style.background='#f7f9fe'; };
    el.onmouseleave=()=>{ el.style.background=(DB.busqSel&&DB.busqSel.id===+el.dataset.id)?'var(--Pl)':'transparent'; };
  });
}

// ══ SIMULACROS ══
function renderSims(){
  if(DB.sims.length===0){
    return '<div class="card"><div class="empty" style="padding:48px 0">🏆<br><br>No hay simulacros registrados aún.<br><span style="font-size:12px;color:var(--t3)">Ve a <strong>Administración → Simulacros</strong> para crear y cargar resultados.</span></div></div>';
  }
  const sim=DB.sims.find(s=>s.id===DB.simSel)||DB.sims[DB.sims.length-1];
  if(!DB.simSel) DB.simSel=sim.id;
  const ranked=sim?[...sim.res].sort((a,b)=>b.pts-a.pts):[];
  const tercio=Math.ceil(ranked.length/3);
  const btnSims=DB.sims.map(s=>'<button class="btn bsm '+(DB.simSel===s.id?'bp':'bo')+' sim-sel" data-id="'+s.id+'">'+s.titulo+'</button>').join('');
  const rankRows=ranked.map((r,i)=>{
    const e=getEst(r.estId);
    const iT=i<tercio;
    const pct=Math.round((r.ok/sim.total)*100);
    const ic=i===0?'🥇':i===1?'🥈':i===2?'🥉':'<span style="background:var(--Pl);color:var(--P);width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800">'+(i+1)+'</span>';
    return '<tr class="'+(iT?'tr3':'')+'"><td>'+ic+'</td><td><div style="font-weight:600">'+e.nombres+'</div><div style="font-size:11px;color:var(--t3)">'+e.grado+(iT?' <span class="badge b-pu" style="font-size:10px;padding:1px 7px">Tercio</span>':'')+'</div></td><td style="font-weight:800;font-size:15px;color:'+(i===0?'#92400e':'var(--t1)')+'">'+r.pts+'</td><td style="color:var(--t2)">'+r.ok+'</td><td><span style="font-weight:700;color:'+(pct>=70?'var(--ok)':pct>=50?'var(--wa)':'var(--no)')+'">'+pct+'%</span></td></tr>';
  }).join('');

  let html='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;align-items:center">';
  html+='<div style="display:flex;gap:8px;flex:1;flex-wrap:wrap">'+btnSims+'</div>';
  html+='<button class="btn bo bsm" onclick="DB.view=\'administracion\';DB.adminTab=\'sims\';render()">⚙ Gestionar simulacros</button>';
  html+='</div>';
  html+='<div class="card">';
  html+='<div class="ch"><div><div class="ct">'+sim.titulo+'</div><div class="cs">'+fmtDate(sim.fecha)+' · '+sim.total+' preguntas</div></div><span class="badge b-pu">Morado = Tercio superior</span></div>';
  html+=ranked.length===0?'<div class="empty">Sin puntajes registrados para este simulacro</div>':'<table><thead><tr><th>Pos.</th><th>Estudiante</th><th>Puntaje</th><th>Correctas</th><th>%</th></tr></thead><tbody>'+rankRows+'</tbody></table>';
  html+='</div>';
  return html;
}

// ══ CONFIG ══
function renderConfig(){
  const url=DB.cfgUrl;
  const conectado=DB.cfgConectado;

  const scriptCode =
'// ══════════════════════════════════════════════════════════\n'+
'// RUPANI — Google Apps Script v2.0\n'+
'// Compatible con el sistema RUPANI — Matrícula\n'+
'// Usa doGet con ?body=JSON para evitar preflight CORS\n'+
'// INSTRUCCIONES:\n'+
'//  1. Sheets → Extensiones → Apps Script → Pegar todo\n'+
'//  2. Implementar → Nueva implementación → App web\n'+
'//     · Ejecutar como: Yo\n'+
'//     · Quién tiene acceso: Cualquier persona ← IMPORTANTE\n'+
'//  3. Copia la URL del Web App y pégala en RUPANI\n'+
'// ══════════════════════════════════════════════════════════\n\n'+
'const SS = SpreadsheetApp.getActiveSpreadsheet();\n\n'+
'function hoja(nombre) {\n'+
'  var s = SS.getSheetByName(nombre);\n'+
'  if (!s) { s = SS.insertSheet(nombre); }\n'+
'  return s;\n'+
'}\n\n'+
'function responder(obj) {\n'+
'  return ContentService\n'+
'    .createTextOutput(JSON.stringify(obj))\n'+
'    .setMimeType(ContentService.MimeType.JSON);\n'+
'}\n\n'+
'// Punto de entrada principal — GET con ?body=JSON\n'+
'function doGet(e) {\n'+
'  try {\n'+
'    var bodyParam = e.parameter.body;\n'+
'    if (!bodyParam) return responder({ ok: true, msg: "RUPANI API activa" });\n'+
'    var body   = JSON.parse(decodeURIComponent(bodyParam));\n'+
'    var accion = body.action;\n'+
'    var data   = body.data;\n'+
'    if (accion === "ping")          return responder(ping());\n'+
'    if (accion === "pullTodo")      return responder(pullTodo());\n'+
'    if (accion === "pushAdmins")    return responder(pushHoja("Admins",    ["id","nombres","usuario","password","email","esSuperAdmin"], data));\n'+
'    if (accion === "pushApods")     return responder(pushHoja("Apoderados", ["id","nombres","dir","cel","correo"], data));\n'+
'    if (accion === "pushEsts")      return responder(pushHoja("Estudiantes",["id","apodId","nombres","edad","grado","cel","correo","codigo","usuario","password","credCreadas"], data));\n'+
'    if (accion === "pushMats")      return responder(pushHoja("Matriculas", ["id","num","estId","fecha","monto","desde","hasta","pagado"], data));\n'+
'    if (accion === "pushSims")      return responder(pushHoja("Simulacros", ["id","titulo","fecha","total","resultados"], data));\n'+
'    if (accion === "appendApod")    return responder(appendFila("Apoderados", ["id","nombres","dir","cel","correo"], data));\n'+
'    if (accion === "appendEst")     return responder(appendFila("Estudiantes",["id","apodId","nombres","edad","grado","cel","correo","codigo","usuario","password","credCreadas"], data));\n'+
'    if (accion === "appendMat")     return responder(appendFila("Matriculas", ["id","num","estId","fecha","monto","desde","hasta","pagado"], data));\n'+
'    if (accion === "appendSim")     return responder(appendFila("Simulacros", ["id","titulo","fecha","total","resultados"], data));\n'+
'    if (accion === "appendAdmin")   return responder(appendFila("Admins",     ["id","nombres","usuario","password","email","esSuperAdmin"], data));\n'+
'    if (accion === "updateApod")    return responder(updateFila("Apoderados", ["id","nombres","dir","cel","correo"], data));\n'+
'    if (accion === "updateEst")     return responder(updateFila("Estudiantes",["id","apodId","nombres","edad","grado","cel","correo","codigo","usuario","password","credCreadas"], data));\n'+
'    if (accion === "updateMat")     return responder(updateFila("Matriculas", ["id","num","estId","fecha","monto","desde","hasta","pagado"], data));\n'+
'    if (accion === "updateSim")     return responder(updateFila("Simulacros", ["id","titulo","fecha","total","resultados"], data));\n'+
'    if (accion === "updateAdmin")   return responder(updateFila("Admins",     ["id","nombres","usuario","password","email","esSuperAdmin"], data));\n'+
'    if (accion === "deleteApod")    return responder(deleteFila("Apoderados", data.id));\n'+
'    if (accion === "deleteEst")     return responder(deleteFila("Estudiantes", data.id));\n'+
'    if (accion === "deleteMat")     return responder(deleteFila("Matriculas", data.id));\n'+
'    if (accion === "deleteSim")     return responder(deleteFila("Simulacros", data.id));\n'+
'    if (accion === "deleteAdmin")   return responder(deleteFila("Admins", data.id));\n'+
'    return responder({ error: "Accion no reconocida: " + accion });\n'+
'  } catch(err) {\n'+
'    return responder({ error: err.message });\n'+
'  }\n'+
'}\n\n'+
'function doPost(e) { return doGet(e); }\n\n'+
'function ping() { return { ok: true, hoja: SS.getName(), ts: new Date().toISOString() }; }\n\n'+
'// ── pushHoja: reemplaza toda una hoja ──────────────────────\n'+
'function pushHoja(nombre, campos, filas) {\n'+
'  var s = hoja(nombre);\n'+
'  s.clearContents();\n'+
'  s.appendRow(campos);\n'+
'  if (!filas || !filas.length) return { ok: true, enviados: 0 };\n'+
'  var data = filas.map(function(f) { return campos.map(function(c){ return f[c] !== undefined ? String(f[c]) : ""; }); });\n'+
'  s.getRange(2, 1, data.length, campos.length).setValues(data);\n'+
'  return { ok: true, enviados: data.length };\n'+
'}\n\n'+
'// ── appendFila: agrega 1 fila nueva ────────────────────────\n'+
'function appendFila(nombre, campos, obj) {\n'+
'  var s = hoja(nombre);\n'+
'  if (s.getLastRow() === 0) s.appendRow(campos);\n'+
'  s.appendRow(campos.map(function(c){ return obj[c] !== undefined ? String(obj[c]) : ""; }));\n'+
'  return { ok: true };\n'+
'}\n\n'+
'// ── updateFila: busca por ID y actualiza ───────────────────\n'+
'function updateFila(nombre, campos, obj) {\n'+
'  var s = hoja(nombre);\n'+
'  if (s.getLastRow() < 2) return appendFila(nombre, campos, obj);\n'+
'  var ids = s.getRange(2, 1, s.getLastRow()-1, 1).getValues();\n'+
'  for (var i = 0; i < ids.length; i++) {\n'+
'    if (String(ids[i][0]) === String(obj.id)) {\n'+
'      var fila = campos.map(function(c){ return obj[c] !== undefined ? String(obj[c]) : ""; });\n'+
'      s.getRange(i + 2, 1, 1, campos.length).setValues([fila]);\n'+
'      return { ok: true };\n'+
'    }\n'+
'  }\n'+
'  return appendFila(nombre, campos, obj);\n'+
'}\n\n'+
'// ── deleteFila: elimina por ID ─────────────────────────────\n'+
'function deleteFila(nombre, id) {\n'+
'  var s = hoja(nombre);\n'+
'  if (s.getLastRow() < 2) return { ok: true };\n'+
'  var ids = s.getRange(2, 1, s.getLastRow()-1, 1).getValues();\n'+
'  for (var i = ids.length - 1; i >= 0; i--) {\n'+
'    if (String(ids[i][0]) === String(id)) { s.deleteRow(i + 2); return { ok: true }; }\n'+
'  }\n'+
'  return { ok: false, error: "ID no encontrado" };\n'+
'}\n\n'+
'// ── pullTodo: devuelve todo en JSON ────────────────────────\n'+
'function pullTodo() {\n'+
'  return {\n'+
'    admins: leerHoja("Admins",    ["id","nombres","usuario","password","email","esSuperAdmin"]),\n'+
'    apods:  leerHoja("Apoderados",["id","nombres","dir","cel","correo"]),\n'+
'    ests:   leerHoja("Estudiantes",["id","apodId","nombres","edad","grado","cel","correo","codigo","usuario","password","credCreadas"]),\n'+
'    mats:   leerHoja("Matriculas", ["id","num","estId","fecha","monto","desde","hasta","pagado"]),\n'+
'    sims:   leerHoja("Simulacros", ["id","titulo","fecha","total","resultados"])\n'+
'  };\n'+
'}\n\n'+
'function leerHoja(nombre, campos) {\n'+
'  var s = SS.getSheetByName(nombre);\n'+
'  if (!s || s.getLastRow() < 2) return [];\n'+
'  var data = s.getDataRange().getValues();\n'+
'  return data.slice(1).filter(function(r){ return r[0] !== ""; }).map(function(r) {\n'+
'    var obj = {};\n'+
'    campos.forEach(function(c, i){ obj[c] = r[i] !== undefined ? String(r[i]) : ""; });\n'+
'    return obj;\n'+
'  });\n'+
'}';

  let html='<div class="card">';
  html+='<div class="ch"><div><div class="ct">Conexión con Google Sheets</div><div class="cs">Base de datos en la nube para RUPANI · Modelo doGet sin CORS</div></div>'+(conectado?'<span class="badge b-ok">✓ Conectado</span>':'<span class="badge b-wa">Sin conectar</span>')+'</div>';

  // Paso 1
  html+='<div style="display:flex;gap:14px;padding:16px;background:#f8f9fe;border-radius:10px;border:1.5px solid var(--brd);margin-bottom:14px">';
  html+='<div style="width:32px;height:32px;background:var(--P);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex-shrink:0">1</div>';
  html+='<div style="flex:1"><div style="font-weight:700;font-size:13.5px;margin-bottom:4px">Crear una hoja de cálculo en Google Sheets</div>';
  html+='<div style="font-size:12.5px;color:var(--t2);line-height:1.7">Abre <strong>sheets.google.com</strong> → nueva hoja → copia el <strong>ID</strong> de la URL:<br><code style="background:#e8f0fb;padding:1px 6px;border-radius:4px;font-size:12px">docs.google.com/spreadsheets/d/<strong style="color:var(--A)">ESTE_ID</strong>/edit</code></div>';
  html+='<div class="fl" style="margin-top:10px;max-width:420px"><label class="flabel">ID de tu Google Sheets</label><input type="text" id="cfg-ssid" value="'+(DB.cfgSsId||'')+'" placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"></div>';
  html+='</div></div>';

  // Paso 2
  html+='<div style="display:flex;gap:14px;padding:16px;background:#f8f9fe;border-radius:10px;border:1.5px solid var(--brd);margin-bottom:14px">';
  html+='<div style="width:32px;height:32px;background:var(--P);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex-shrink:0">2</div>';
  html+='<div style="flex:1"><div style="font-weight:700;font-size:13.5px;margin-bottom:4px">Pegar el Apps Script en la hoja</div>';
  html+='<div style="font-size:12.5px;color:var(--t2);margin-bottom:10px">En tu hoja ve a <strong>Extensiones → Apps Script</strong>, borra todo lo que haya y pega este código. El script crea las hojas automáticamente.</div>';
  html+='<div style="position:relative"><pre id="script-code" style="background:#1e1e2e;border-radius:10px;padding:16px;font-family:monospace;font-size:10.5px;color:#cdd6f4;line-height:1.75;overflow-x:auto;white-space:pre-wrap;max-height:260px">'+scriptCode+'</pre>';
  html+='<button onclick="copyScript()" style="position:absolute;top:8px;right:8px;background:var(--P);color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:11.5px;font-weight:600;cursor:pointer">📋 Copiar</button></div>';
  html+='</div></div>';

  // Paso 3
  html+='<div style="display:flex;gap:14px;padding:16px;background:#f8f9fe;border-radius:10px;border:1.5px solid var(--brd);margin-bottom:14px">';
  html+='<div style="width:32px;height:32px;background:var(--P);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex-shrink:0">3</div>';
  html+='<div style="flex:1"><div style="font-weight:700;font-size:13.5px;margin-bottom:4px">Implementar como aplicación web</div>';
  html+='<div style="font-size:12.5px;color:var(--t2);line-height:1.7"><strong>Implementar → Nueva implementación → Aplicación web</strong><br>· Ejecutar como: <strong>Yo</strong> &nbsp;·&nbsp; Quién tiene acceso: <strong>Cualquier persona</strong> ← MUY IMPORTANTE<br>· Copia la <strong>URL</strong> que aparece al finalizar.</div>';
  html+='<div class="fl" style="margin-top:10px;max-width:520px"><label class="flabel">URL del Web App</label><input type="text" id="cfg-url-inp" value="'+(url||'')+'" placeholder="https://script.google.com/macros/s/AKfyc.../exec"></div>';
  html+='</div></div>';

  // Paso 4
  html+='<div style="display:flex;gap:14px;padding:16px;background:'+(conectado?'var(--okb)':'#fff8e6')+';border-radius:10px;border:1.5px solid '+(conectado?'#86efac':'#fde047')+';margin-bottom:18px">';
  html+='<div style="width:32px;height:32px;background:'+(conectado?'var(--ok)':'var(--G)')+';color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;flex-shrink:0">4</div>';
  html+='<div style="flex:1"><div style="font-weight:700;font-size:13.5px;margin-bottom:4px">'+(conectado?'✓ Sistema conectado y sincronizando':'Conectar y cargar datos')+'</div>';
  html+='<div style="font-size:12.5px;color:var(--t2);line-height:1.7;margin-bottom:12px">'+(conectado
    ?'Al conectar, RUPANI carga automáticamente todos los datos de Sheets. Cada vez que registres o edites algo, se sincroniza al instante. Usa <strong>📥 Recargar</strong> si editaste la hoja directamente.'
    :'Al conectar se verificará la conexión con un ping y luego se cargarán todos los datos desde Google Sheets.')+'</div>';
  html+='<div style="display:flex;gap:10px;flex-wrap:wrap">';
  html+='<button class="btn bp" id="cfg-save-btn" style="font-size:13px">'+(conectado?'🔄 Reconectar':'⚡ Guardar y conectar')+'</button>';
  if(conectado){
    html+='<button class="btn bok bsm" id="cfg-reload-btn" style="font-size:12px">📥 Recargar desde Sheets</button>';
    html+='<button class="btn bsm" id="cfg-push-btn" style="background:var(--pub);color:var(--pu);border:1px solid #d8b4fe;font-size:12px">📤 Enviar local → Sheets</button>';
    html+='<button class="btn bo bsm" id="cfg-test-btn" style="font-size:12px">🧪 Ping</button>';
    html+='<button class="btn bed bsm" id="cfg-reset-btn" style="font-size:12px">Desconectar</button>';
  }
  html+='</div></div></div>';

  // Tabla de hojas
  html+='<div class="divider"></div>';
  html+='<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);margin-bottom:10px">Hojas que el script gestiona automáticamente</div>';
  html+='<div style="display:flex;gap:8px;flex-wrap:wrap">';
  [['👤','Admins','id, nombres, usuario, password, email, esSuperAdmin'],
   ['👥','Apoderados','id, nombres, dir, cel, correo'],
   ['🎓','Estudiantes','id, apodId, nombres, edad, grado, cel, correo, codigo, usuario, password, credCreadas'],
   ['💳','Matriculas','id, num, estId, fecha, monto, desde, hasta, pagado'],
   ['🏆','Simulacros','id, titulo, fecha, total, resultados(JSON)']
  ].forEach(([ic,n,cols])=>{
    html+='<div style="background:#f8f9fe;border:1px solid var(--brd);border-radius:10px;padding:12px 14px;min-width:160px;flex:1">';
    html+='<div style="font-size:15px;margin-bottom:4px">'+ic+' <strong style="font-size:13px">'+n+'</strong></div>';
    html+='<div style="font-size:11px;color:var(--t3);line-height:1.6">'+cols+'</div></div>';
  });
  html+='</div></div>';
  return html;
}

function copyScript(){
  const code=document.getElementById('script-code')?document.getElementById('script-code').innerText:'';
  const fallback=()=>{ const t=document.createElement('textarea'); t.value=code; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); toast('Código copiado. ¡Pégalo en Apps Script!'); };
  if(navigator.clipboard){ navigator.clipboard.writeText(code).then(()=>toast('Código copiado. ¡Pégalo en Apps Script!')).catch(fallback); }
  else fallback();
}

// ══ BIND VIEW ══
function bindView(){
  if(DB.view==='dashboard'){
    q('#ir-pagos')&&q('#ir-pagos').addEventListener('click',()=>{ DB.view='pagos'; render(); });
    q('#ir-sims')&&q('#ir-sims').addEventListener('click',()=>{ DB.view='simulacros'; render(); });
  }
  if(DB.view==='administracion'){
    document.querySelectorAll('.tab[data-tab]').forEach(b=>b.addEventListener('click',()=>{ DB.adminTab=b.dataset.tab; render(); }));
    if(DB.adminTab==='sims'){ bindAdminSims(); return; }
    document.querySelectorAll('.crud-new').forEach(b=>b.addEventListener('click',()=>{
      const mTipo={'apod':'edit-apod','est':'edit-est','mat':'edit-mat','admin':'edit-admin'}[b.dataset.tipo];
      openModal(mTipo,null);
    }));
    document.querySelectorAll('.crud-edit').forEach(b=>b.addEventListener('click',()=>{
      const id=+b.dataset.id, tipo=b.dataset.tipo;
      let datos;
      if(tipo==='apod') datos=DB.apods.find(x=>x.id===id);
      else if(tipo==='est') datos=DB.ests.find(x=>x.id===id);
      else if(tipo==='mat') datos=DB.mats.find(x=>x.id===id);
      else if(tipo==='admin') datos=DB.admins.find(x=>x.id===id);
      const mTipo={'apod':'edit-apod','est':'edit-est','mat':'edit-mat','admin':'edit-admin'}[tipo];
      openModal(mTipo,datos);
    }));
    document.querySelectorAll('.crud-del').forEach(b=>b.addEventListener('click',()=>{
      const id=+b.dataset.id, tipo=b.dataset.tipo;
      const msgs={apod:'¿Eliminar este apoderado? También se desvinculará de sus estudiantes.',est:'¿Eliminar este estudiante? Se eliminarán también sus matrículas.',mat:'¿Eliminar esta matrícula?',admin:'¿Eliminar este administrador?'};
      confirmDelete(msgs[tipo],async()=>{
        if(tipo==='apod'){
          const hijos=DB.ests.filter(e=>e.apodId===id);
          for(const h of hijos){ for(const m of DB.mats.filter(mm=>mm.estId===h.id)) await syncMatDelete(m.id); DB.mats=DB.mats.filter(m=>m.estId!==h.id); await syncEstDelete(h.id); }
          DB.ests=DB.ests.filter(e=>e.apodId!==id); DB.apods=DB.apods.filter(x=>x.id!==id); await syncApodDelete(id);
        } else if(tipo==='est'){
          for(const m of DB.mats.filter(mm=>mm.estId===id)) await syncMatDelete(m.id);
          DB.mats=DB.mats.filter(m=>m.estId!==id); DB.ests=DB.ests.filter(x=>x.id!==id); await syncEstDelete(id);
        } else if(tipo==='mat'){
          DB.mats=DB.mats.filter(x=>x.id!==id); await syncMatDelete(id);
        } else if(tipo==='admin'){
          DB.admins=DB.admins.filter(x=>x.id!==id); await syncAdminDelete(id);
        }
        toast('Registro eliminado.'); render();
      });
    }));
  }
  if(DB.view==='matricular'){
    q('#apod-nuevo')&&q('#apod-nuevo').addEventListener('click',()=>{ DB.matApodMode='nuevo'; DB.matErr=''; render(); });
    q('#apod-exist')&&q('#apod-exist').addEventListener('click',()=>{ DB.matApodMode='existente'; DB.matErr=''; render(); });
    q('#apodSel')&&q('#apodSel').addEventListener('change',e=>DB.matApodSel=e.target.value);
    const afMap={nom:'nombres',dir:'dir',cel:'cel',cor:'correo'};
    ['nom','dir','cel','cor'].forEach(k=>{ const el=q('#a-'+k); if(el) el.addEventListener('input',e=>DB.matAF[afMap[k]]=e.target.value); });
    const efMap={nom:'nombres',grado:'grado',cel:'cel',cor:'correo'};
    ['nom','grado','cel','cor'].forEach(k=>{ const el=q('#e-'+k); if(el) el.addEventListener('input',e=>DB.matEF[efMap[k]]=e.target.value); });
    const eEdad=q('#e-edad'); if(eEdad) eEdad.addEventListener('input',e=>DB.matEF.edad=e.target.value);
    ['fecha','desde','hasta','monto'].forEach(k=>{ const el=q('#m-'+k); if(el) el.addEventListener('input',e=>DB.matMF[k]=e.target.value); });
    q('#mat-prev')&&q('#mat-prev').addEventListener('click',()=>{ DB.matStep--; DB.matErr=''; render(); });
    q('#mat-next')&&q('#mat-next').addEventListener('click',()=>{
      if(DB.matStep===1){
        if(DB.matApodMode==='existente'&&!DB.matApodSel){ DB.matErr='Selecciona un apoderado.'; render(); return; }
        if(DB.matApodMode==='nuevo'&&(!DB.matAF.nombres||!DB.matAF.dir||!DB.matAF.cel)){ DB.matErr='Completa los campos obligatorios.'; render(); return; }
      }
      if(DB.matStep===2&&(!DB.matEF.nombres||!DB.matEF.edad||!DB.matEF.grado)){ DB.matErr='Completa los campos obligatorios.'; render(); return; }
      DB.matErr=''; DB.matStep++; render();
    });
    q('#mat-save')&&q('#mat-save').addEventListener('click',async()=>{
      if(!DB.matMF.monto){ DB.matErr='Ingresa el monto.'; render(); return; }
      let aid;
      if(DB.matApodMode==='existente'){ aid=+DB.matApodSel; }
      else{
        aid=nid();
        const na={id:aid,...DB.matAF};
        DB.apods.push(na); syncApodNuevo(na);
      }
      const eid=nid()+1, newId=nid()+2;
      const codigo='EST-'+String(eid).slice(-3);
      const ne={id:eid,apodId:aid,...DB.matEF,edad:+DB.matEF.edad,codigo,usuario:'',password:'',credCreadas:false};
      DB.ests.push(ne); syncEstNuevo(ne);
      const num='MAT-'+anioActual()+'-'+String(DB.mats.length+1).padStart(3,'0');
      const nm={id:newId,num,estId:eid,fecha:DB.matMF.fecha||hoy(),monto:+DB.matMF.monto,desde:DB.matMF.desde||hoyMes(),hasta:DB.matMF.hasta||hoyMes(),pagado:false};
      DB.mats.push(nm); syncMatNueva(nm);
      DB.matStep=1; DB.matApodMode='nuevo'; DB.matApodSel='';
      DB.matAF={nombres:'',dir:'',cel:'',correo:''}; DB.matEF={nombres:'',edad:'',grado:'',cel:'',correo:''}; DB.matMF={num:'',fecha:'',monto:'',desde:'',hasta:''}; DB.matErr='';
      toast('Matrícula '+num+' registrada. Código del estudiante: '+codigo); render();
    });
  }
  if(DB.view==='pagos'){
    q('#pf-todos')&&q('#pf-todos').addEventListener('click',()=>{ DB.pagoFiltro='todos'; render(); });
    q('#pf-deuda')&&q('#pf-deuda').addEventListener('click',()=>{ DB.pagoFiltro='deuda'; render(); });
    q('#pf-pagado')&&q('#pf-pagado').addEventListener('click',()=>{ DB.pagoFiltro='pagado'; render(); });
    document.querySelectorAll('.pago-btn').forEach(b=>b.addEventListener('click',()=>{ const m=DB.mats.find(x=>x.id===+b.dataset.id); if(m){ m.pagado=true; syncMatUpdate(m); toast('Pago confirmado.'); render(); } }));
  }
  if(DB.view==='buscar'){
    q('#bt-est')&&q('#bt-est').addEventListener('click',()=>{ DB.busqTipo='est'; DB.busqQ=''; DB.busqSel=null; render(); });
    q('#bt-apod')&&q('#bt-apod').addEventListener('click',()=>{ DB.busqTipo='apod'; DB.busqQ=''; DB.busqSel=null; render(); });
    q('#busq-inp')&&q('#busq-inp').addEventListener('input',e=>{ DB.busqQ=e.target.value; DB.busqSel=null; actualizarBuscar(); });
    bindBuscarResultados();
    const inp=q('#busq-inp'); if(inp&&DB.busqQ){ const len=DB.busqQ.length; inp.setSelectionRange(len,len); }
  }
  if(DB.view==='simulacros'){
    document.querySelectorAll('.sim-sel').forEach(b=>b.addEventListener('click',()=>{ DB.simSel=+b.dataset.id; render(); }));
  }
  if(DB.view==='config'){
    q('#cfg-ssid')&&q('#cfg-ssid').addEventListener('input',e=>DB.cfgSsId=e.target.value.trim());
    q('#cfg-url-inp')&&q('#cfg-url-inp').addEventListener('input',e=>DB.cfgUrl=e.target.value.trim());
    q('#cfg-save-btn')&&q('#cfg-save-btn').addEventListener('click',async()=>{
      const ssid=qv('#cfg-ssid').trim(), url=qv('#cfg-url-inp').trim();
      if(!ssid){ toast('Pega el ID de tu Google Sheets primero.','wa'); return; }
      if(!url){ toast('Pega la URL del Web App primero.','wa'); return; }
      DB.cfgSsId=ssid; DB.cfgUrl=url; DB.cfgConectado=true;
      const btn=q('#cfg-save-btn'); if(btn){ btn.textContent='⏳ Conectando...'; btn.disabled=true; }
      toast('Verificando conexión y cargando datos...');
      // Primero ping para verificar
      const pong = await pingSheets();
      if(!pong){ toast('No se pudo conectar. Verifica la URL y que el acceso sea "Cualquier persona".','no'); DB.cfgConectado=false; render(); return; }
      // Luego pullTodo
      const ok=await pullTodo();
      toast(ok
        ?'✓ Conectado. Cargados: '+DB.apods.length+' apoderados, '+DB.ests.length+' estudiantes, '+DB.mats.length+' matrículas, '+DB.sims.length+' simulacros.'
        :'Conectado pero sin datos aún. Puedes empezar a registrar.','ok');
      render();
    });
    q('#cfg-reload-btn')&&q('#cfg-reload-btn').addEventListener('click',async()=>{
      const btn=q('#cfg-reload-btn'); if(btn){ btn.textContent='⏳ Cargando...'; btn.disabled=true; }
      toast('Recargando todos los datos desde Google Sheets...');
      const ok=await pullTodo();
      toast(ok?'✓ Datos actualizados desde Sheets.':'No se pudieron recargar los datos.',ok?'ok':'wa');
      render();
    });
    q('#cfg-push-btn')&&q('#cfg-push-btn').addEventListener('click',async()=>{
      const btn=q('#cfg-push-btn'); if(btn){ btn.textContent='⏳ Enviando...'; btn.disabled=true; }
      toast('Enviando todos los datos locales a Google Sheets...');
      const ok=await pushTodo();
      toast(ok?'✓ Todos los datos enviados a Sheets.':'Error al enviar. Verifica la conexión.',ok?'ok':'wa');
      render();
    });
    q('#cfg-test-btn')&&q('#cfg-test-btn').addEventListener('click',async()=>{
      if(!DB.cfgUrl){ toast('No hay URL guardada.','wa'); return; }
      toast('Probando conexión...');
      const ok=await pingSheets();
      toast(ok?'✓ Conexión exitosa con Google Sheets ✅':'✗ No se pudo conectar. Verifica la URL y permisos del Web App.',ok?'ok':'no');
    });
    q('#cfg-reset-btn')&&q('#cfg-reset-btn').addEventListener('click',()=>{
      if(!confirm('¿Desconectar de Google Sheets?\n\nLos datos locales se conservan.')) return;
      DB.cfgConectado=false; SYNC.errores=0; SYNC.ultimaSync=null; render();
    });
  }
}

// ══ INICIO ══
render();
