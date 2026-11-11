// 正式部署用：所有玩家開啟 GitHub Pages 時都會自動連到這個 Worker。
// Worker 網址不是密碼，可以公開放在前端；角色私有劇本仍只存放於 Cloudflare D1。
const API_BASE = 'https://paperwife-tokenless-act1.paperwife-game.workers.dev';
// 清除舊版本讓玩家手動輸入 API 時留下的本機設定，避免覆蓋正式網址。
localStorage.removeItem('paperwife_api_base');
let backendReady = false;
let characters = [];
let session = null;
let player = null;
let mode = 'player_to_ai';
let currentRoots = [];
let currentPath = [];
let currentAsker = null;
let latestPlayerQuestion = null;

const $ = (id) => document.getElementById(id);
const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path, options={}) {
  if (!API_BASE) throw new Error('遊戲伺服器尚未設定。');
  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers:{'Content-Type':'application/json',...(options.headers||{})} });
  const data = await res.json().catch(()=>({error:'伺服器回傳格式錯誤'}));
  if(!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
function setConnectionStatus(state, message) {
  const box = $('connectionStatus');
  const text = $('connectionStatusText');
  if (!box || !text) return;
  box.className = `connection-status ${state}`;
  text.textContent = message;
}
async function checkBackend() {
  backendReady = false;
  $('startBtn').disabled = true;
  $('startBtn').textContent = '檢查後端連線中…';
  setConnectionStatus('checking', '正在連接遊戲伺服器…');
  try {
    const health = await api('/health');
    if (!health.ok) throw new Error('伺服器健康檢查未通過');
    if (Number(health.privateRoleCount) !== 7) {
      throw new Error(`角色資料尚未完整匯入（目前 ${Number(health.privateRoleCount) || 0}/7 位）`);
    }
    backendReady = true;
    setConnectionStatus('ready', '遊戲伺服器已連線，7 位角色資料已就緒');
    $('startBtn').textContent = '選擇角色後進入陳宅　▶';
    $('startBtn').disabled = !document.querySelector('input[name="playerRole"]:checked');
  } catch (error) {
    setConnectionStatus('error', `無法連接遊戲伺服器：${error.message}`);
    $('startBtn').textContent = '遊戲伺服器尚未就緒';
    $('startBtn').disabled = true;
  }
}
function avatarStyle(id){const idx=characters.findIndex(c=>c.id===id);return `background-position:${idx<0?0:(idx/(characters.length-1))*100}% center`;}
function renderCharacters(){
  $('characterGrid').innerHTML=characters.map(c=>`<label class="character-card"><input type="radio" name="playerRole" value="${esc(c.id)}"><span class="card-avatar" style="${avatarStyle(c.id)}"></span><span class="character-name">${esc(c.name)}</span><span class="character-age">${esc(c.age)}</span><span class="character-brief">${esc(c.brief)}</span><span class="select-mark">選擇角色</span></label>`).join('');
  document.querySelectorAll('input[name="playerRole"]').forEach(i=>i.addEventListener('change',()=>{$('startBtn').disabled=!backendReady;}));
}
async function init(){
  try {
    const r = await fetch('characters.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    characters = await r.json();
    renderCharacters();
  } catch (e) {
    $('characterGrid').innerHTML = `<div class="error-box">無法載入公開角色資料：${esc(e.message)}<br>請確認 characters.json 與 index.html 位於同一個前端資料夾。</div>`;
  }
  await checkBackend();
  const saved = localStorage.getItem('paperwife_session');
  if (saved && backendReady) {
    try {
      const d = await api(`/session/${saved}`);
      session = d.session;
      player = d.player;
      showGame(d);
      if (session.stage === 'act1_complete') showComplete();
      else openScript();
    } catch {
      localStorage.removeItem('paperwife_session');
    }
  }
}
$('startBtn').addEventListener('click',async()=>{
  const selected=document.querySelector('input[name="playerRole"]:checked');if(!selected)return;
  if(!backendReady){alert('遊戲伺服器尚未就緒，請稍後重新整理頁面。');return;}
  $('startBtn').disabled=true;$('startBtn').textContent='正在進入陳宅…';
  try{const d=await api('/session/start',{method:'POST',body:JSON.stringify({playerRole:selected.value})});session=d.session;player=d.player;localStorage.setItem('paperwife_session',session.id);showGame(d);openScript();}
  catch(e){alert(`開始遊戲失敗：${e.message}`);}
  finally{$('startBtn').disabled=false;$('startBtn').textContent='進入陳宅　▶';}
});
function showGame(data){
  $('setupView').classList.add('hidden');$('gameView').classList.remove('hidden');$('discussionPanel').classList.add('hidden');$('actComplete').classList.add('hidden');
  $('playerChip').textContent=`玩家：${player.name}`;$('sideRole').textContent=player.name;$('sideStage').textContent='劇本閱讀';
  $('taskList').innerHTML=(player.firstActTasks||[]).map(t=>`<li>${esc(t)}</li>`).join('')||'<li>第一幕以了解人物與宅中怪事為主。</li>';
  $('dialogueName').textContent='旁白';$('dialogueText').textContent=`你現在扮演${player.name}。請先閱讀自己的第一幕劇本，其他角色的完整劇情不會提供給你。`;
  $('speakerRole').textContent=player.name;$('speakerMood').textContent='你的角色';$('speakerPortrait').style=avatarStyle(player.id);
  $('stageTitle').textContent='第一幕｜角色劇本閱讀與問答';renderLog();fillTargetSelect();
}
function renderLog(){
  const logs=session?.publicLog||[];
  $('publicLog').innerHTML=logs.map(x=>`<div class="log-line"><time>${new Date(x.time).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</time><strong>${esc(x.speaker)}</strong><span>${esc(x.text)}</span></div>`).join('')||'<div class="muted">尚無公開對話。</div>';
  $('publicLog').scrollTop=$('publicLog').scrollHeight;
}
function addLocalLog(speaker,text,kind='dialogue'){
  if(!session)return;session.publicLog.push({speaker,text,kind,time:new Date().toISOString()});renderLog();
}
function fillTargetSelect(){
  $('targetRole').innerHTML=session.computerRoles.map(id=>{const c=characters.find(x=>x.id===id);return `<option value="${id}">${esc(c?.name||id)}</option>`;}).join('');
}
function openScript(){
  $('scriptTitle').textContent=`${player.name}｜第一幕劇本`;
  $('scriptContent').innerHTML=`<div class="script-note">以下內容僅包含你所扮演角色的第一幕資訊。請勿假設其他角色知道你的全部劇情。</div><pre>${esc(player.firstActScript)}</pre><div class="task-box"><h3>你的第一幕任務</h3><ul>${(player.firstActTasks||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`;
  $('scriptDialog').showModal();
}
$('scriptBtn').addEventListener('click',openScript);
$('closeScript').addEventListener('click',()=>$('scriptDialog').close());
$('scriptDone').addEventListener('click',()=>{$('scriptDialog').close();$('discussionPanel').classList.remove('hidden');$('sideStage').textContent='問答討論';$('dialogueStep').textContent='第一幕・問答開始';$('dialogueName').textContent='旁白';$('dialogueText').textContent='第一幕劇情閱讀完畢。你可以向其他角色提問，也可以讓其他角色向你提問。';});
document.querySelectorAll('.mode-btn').forEach(btn=>btn.addEventListener('click',()=>{
  mode=btn.dataset.mode;document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',b===btn));
  $('beginQuestionBtn').classList.toggle('hidden',mode==='ai_to_player');$('askRandomBtn').classList.toggle('hidden',mode!=='ai_to_player');
  $('targetRole').disabled=false;$('questionArea').innerHTML='<div class="empty-state">選擇對話角色並開始問答。</div>';currentRoots=[];currentPath=[];
}));
$('beginQuestionBtn').addEventListener('click',loadRoots);
async function loadRoots(){
  const roleId=$('targetRole').value;
  try{
    const data=await api(`/session/${session.id}/dialogue/roots?mode=player_to_ai&roleId=${encodeURIComponent(roleId)}`);currentRoots=data.roots;
    $('questionArea').innerHTML=`<div class="prompt-label">你想從哪個方向詢問${esc(characters.find(c=>c.id===roleId)?.name)}？</div><div class="choice-grid">${currentRoots.map(q=>`<button class="choice-btn" data-index="${q.index}">${esc(q.question)}</button>`).join('')}</div>`;
    $('questionArea').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>askAI(roleId,[Number(b.dataset.index)])));
  }catch(e){showError(e.message);}
}
async function askAI(roleId,path){
  currentPath=path;
  try{
    const d=await api(`/session/${session.id}/dialogue/ask-ai`,{method:'POST',body:JSON.stringify({roleId,path})});
    session.publicLog.push({speaker:player.name,text:d.question,kind:'question',time:new Date().toISOString()},{speaker:d.speakerName,text:d.answer,kind:'answer',time:new Date().toISOString()});renderLog();
    setSpeaker(d.speaker,d.speakerName,d.answer,`回答層級 ${d.depth}/3`);
    $('questionArea').innerHTML=`<div class="qa-answer"><div class="question-caption">你提出的問題</div><p>${esc(d.question)}</p><div class="answer-caption">${esc(d.speakerName)} 的回答</div><p>${esc(d.answer)}</p></div>${d.done?'<div class="empty-state">這條問答路徑已到最後一層。可以重新載入問題方向，或改問其他角色。</div>':`<div class="prompt-label">你還想追問哪個細節？（最多再追問一次）</div><div class="choice-grid">${d.followups.map(f=>`<button class="choice-btn" data-index="${f.index}">${esc(f.question)}</button>`).join('')}</div>`}`;
    $('questionArea').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>askAI(roleId,[...path,Number(b.dataset.index)])));
  }catch(e){showError(e.message);}
}
$('askRandomBtn').addEventListener('click',startAIQuestion);
async function startAIQuestion(){
  const asker=$('targetRole').value;
  try{
    const d=await api(`/session/${session.id}/dialogue/roots?mode=ai_to_player`);const index=Math.floor(Math.random()*d.roots.length);currentPath=[index];currentAsker=asker;
    await showAIQuestion(asker,currentPath);
  }catch(e){showError(e.message);}
}
async function showAIQuestion(asker,path){
  try{
    const d=await api(`/session/${session.id}/dialogue/ai-question`,{method:'POST',body:JSON.stringify({askerRole:asker,path})});
    session.publicLog.push({speaker:d.speakerName,text:d.question,kind:'question',time:new Date().toISOString()});renderLog();
    setSpeaker(asker,d.speakerName,d.question,`向你提問・第 ${d.depth} 層`);
    $('questionArea').innerHTML=`<div class="qa-answer"><div class="question-caption">${esc(d.speakerName)} 向你提問</div><p>${esc(d.question)}</p></div><div class="prompt-label">選擇你的回答方式</div><div class="choice-grid">${d.options.map((o,i)=>`<button class="choice-btn answer-choice" data-index="${i}"><b>${esc(o.label)}</b><span>${esc(o.text)}</span></button>`).join('')}</div>`;
    $('questionArea').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>answerAIQuestion(asker,path,Number(b.dataset.index))));
  }catch(e){showError(e.message);}
}
async function answerAIQuestion(asker,path,answerIndex){
  try{
    const d=await api(`/session/${session.id}/dialogue/ai-answer`,{method:'POST',body:JSON.stringify({askerRole:asker,path,answerIndex})});
    session.publicLog.push({speaker:player.name,text:d.answer,kind:'answer',time:new Date().toISOString()});
    if(d.nextQuestion)session.publicLog.push({speaker:characters.find(c=>c.id===asker)?.name||asker,text:d.nextQuestion,kind:'question',time:new Date().toISOString()});renderLog();
    setSpeaker(player.id,player.name,d.answer,d.done?'回答完成':`你的回答・第 ${path.length} 層`);
    if(d.done){$('questionArea').innerHTML=`<div class="qa-answer"><div class="answer-caption">你的回答</div><p>${esc(d.answer)}</p></div><div class="empty-state">這段問答已結束，沒有更多追問。</div>`;}
    else{
      const nextPath=d.nextPath;
      $('questionArea').innerHTML=`<div class="qa-answer"><div class="answer-caption">你的回答</div><p>${esc(d.answer)}</p><div class="question-caption">接著追問</div><p>${esc(d.nextQuestion)}</p></div><div class="prompt-label">請選擇下一個回答（最多兩次追問）</div><div class="choice-grid">${d.nextOptions.map((o,i)=>`<button class="choice-btn answer-choice" data-index="${i}"><b>${esc(o.label)}</b><span>${esc(o.text)}</span></button>`).join('')}</div>`;
      $('questionArea').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>answerAIQuestion(asker,nextPath,Number(b.dataset.index))));
    }
  }catch(e){showError(e.message);}
}
function setSpeaker(id,name,text,mood){$('speakerRole').textContent=name;$('speakerMood').textContent=mood;$('speakerPortrait').style=avatarStyle(id);$('dialogueName').textContent=name;$('dialogueText').textContent=text;$('dialogueStep').textContent=mood;}
function showError(message){$('questionArea').innerHTML=`<div class="error-box">${esc(message)}</div>`;}
$('endActBtn').addEventListener('click',async()=>{
  if(!confirm('確定結束第一幕問答？此版本尚未開放第二幕。'))return;
  try{const d=await api(`/session/${session.id}/end-act1`,{method:'POST',body:JSON.stringify({})});session=d.session;renderLog();showComplete();}catch(e){alert(e.message);}
});
function showComplete(){ $('discussionPanel').classList.add('hidden');$('actComplete').classList.remove('hidden');$('stageTitle').textContent='第一幕問答已完成';$('sideStage').textContent='第一幕完成';$('dialogueName').textContent='系統';$('dialogueText').textContent='第一幕問答已完成。下一階段將於後續版本加入。';}
$('backSetupBtn').addEventListener('click',()=>{localStorage.removeItem('paperwife_session');session=null;player=null;$('gameView').classList.add('hidden');$('setupView').classList.remove('hidden');});
$('toggleLogBtn').addEventListener('click',()=>{$('publicLog').classList.toggle('collapsed');$('toggleLogBtn').textContent=$('publicLog').classList.contains('collapsed')?'展開':'收合';});
init();
