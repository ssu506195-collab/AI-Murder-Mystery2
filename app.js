// 《紙妻》Tokenless v0.2.0：序章、角色介紹、限額詢問、AI 質詢與 AI 交叉詢問。
// 所有遊戲資料透過固定 Cloudflare Worker 取得，完整角色私有劇本不放在 GitHub Pages。
const API_BASE = 'https://paperwife-tokenless-act1.paperwife-game.workers.dev';
const SESSION_KEY = 'paperwife_session_v020';
const $ = id => document.getElementById(id);
const esc = (s='') => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let characters=[], opening=null, session=null, player=null, backendReady=false;
let prologueIndex=0, castIndex=0, discussionPlan=null, activeTarget=null, activePlayerPath=null, activeAIQuestion=null;

async function api(path,options={}){
  const res=await fetch(`${API_BASE}/api${path}`,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data=await res.json().catch(()=>({error:'伺服器回傳格式錯誤'}));
  if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);
  return data;
}
function setConnection(state,text){
  const box=$('connectionStatus');box.className=`connection-pill ${state}`;box.innerHTML=`<span class="status-led"></span><span>${esc(text)}</span>`;
  const top=document.querySelector('.top-status');if(top){top.classList.toggle('ready',state==='ready');top.classList.toggle('error',state==='error');$('connectionStatusText').textContent=text;}
}
function nameOf(id){return characters.find(c=>c.id===id)?.name||id;}
function charIndex(id){return Math.max(0,characters.findIndex(c=>c.id===id));}
function portraitPos(id){return `${(charIndex(id)/6)*100}% center`;}
function avatarStyle(id){return `background-position:${portraitPos(id)}`;}
function showView(id){['setupView','prologueView','castView','gameView'].forEach(x=>$(x).classList.toggle('hidden',x!==id));}
function setSpeaker(id,name,text,mood){
  $('speakerRole').textContent=name;$('speakerMood').textContent=mood;$('speakerPortrait').style.backgroundPosition=portraitPos(id);$('dialogueName').textContent=name;$('dialogueText').textContent=text;$('dialogueStep').textContent=mood;
}
function renderLog(){
  const logs=session?.publicLog||[];
  $('publicLog').innerHTML=logs.map(x=>`<div class="log-line"><time>${new Date(x.time).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</time><strong>${esc(x.speaker)}</strong><span>${esc(x.text)}</span></div>`).join('')||'<div class="micro">尚無公開發言。</div>';
  $('publicLog').scrollTop=$('publicLog').scrollHeight;
}
async function refreshSession(){
  const d=await api(`/session/${session.id}`);session=d.session;player=d.player;renderLog();return d;
}
async function markProgress(key){
  const d=await api(`/session/${session.id}/progress`,{method:'POST',body:JSON.stringify({key,value:true})});session=d.session;renderLog();
}
function renderCharacters(){
  $('characterGrid').innerHTML=characters.map(c=>`<label class="character-card"><input type="radio" name="playerRole" value="${esc(c.id)}"><span class="card-avatar" style="background-position:${portraitPos(c.id)}"></span><span class="character-name">${esc(c.name)}</span><span class="character-age">${esc(c.age)}</span><span class="character-brief">${esc(c.brief)}</span><span class="select-mark">選擇此角色</span></label>`).join('');
  document.querySelectorAll('input[name="playerRole"]').forEach(x=>x.addEventListener('change',()=>{$('startBtn').disabled=!backendReady;}));
}
async function init(){
  try{
    const [cr,op]=await Promise.all([fetch('characters.json',{cache:'no-store'}),fetch('public-opening.json',{cache:'no-store'})]);
    if(!cr.ok||!op.ok)throw new Error('公開人物資料或序章資料載入失敗。');
    characters=await cr.json();opening=await op.json();renderCharacters();
    const h=await api('/health');
    if(!h.ok||Number(h.privateRoleCount)!==7||Number(h.questionTreeCount)!==7)throw new Error(`後端資料未完整（劇本 ${h.privateRoleCount||0}/7、問答樹 ${h.questionTreeCount||0}/7）。`);
    backendReady=true;setConnection('ready','陳宅檔案室連線正常・七位角色資料已就緒');
    $('startBtn').disabled=!document.querySelector('input[name="playerRole"]:checked');$('startBtn').textContent='選擇角色，進入案件 →';
  }catch(e){backendReady=false;setConnection('error',`後端連線失敗：${e.message}`);$('startBtn').disabled=true;$('startBtn').textContent='伺服器尚未就緒';}
  const saved=localStorage.getItem(SESSION_KEY);
  if(saved&&backendReady){
    try{const d=await api(`/session/${saved}`);session=d.session;player=d.player;resumeSession();}catch{localStorage.removeItem(SESSION_KEY);}
  }
}
$('startBtn').addEventListener('click',async()=>{
  const selected=document.querySelector('input[name="playerRole"]:checked');if(!selected||!backendReady)return;
  $('startBtn').disabled=true;$('startBtn').textContent='正在進入陳宅…';
  try{
    const d=await api('/session/start',{method:'POST',body:JSON.stringify({playerRole:selected.value})});session=d.session;player=d.player;
    localStorage.setItem(SESSION_KEY,session.id);showGameShell();showPrologue();
  }catch(e){alert(`無法開始遊戲：${e.message}`);}
  finally{$('startBtn').disabled=false;$('startBtn').textContent='選擇角色，進入案件 →';}
});
function showGameShell(){
  $('playerChip').textContent=`玩家：${player.name}`;$('sideRole').textContent=player.name;
  $('taskList').innerHTML=(player.firstActTasks||[]).map(t=>`<li>${esc(t)}</li>`).join('');renderLog();
}
function showPrologue(){
  showView('prologueView');$('sideStage').textContent='序章';prologueIndex=0;renderPrologue();
}
function renderPrologue(){
  const s=opening.opening[prologueIndex];$('prologueCounter').textContent=`${String(prologueIndex+1).padStart(2,'0')} / ${String(opening.opening.length).padStart(2,'0')}`;
  $('prologueLocation').textContent=s.location;$('prologueChapter').textContent=s.chapter;$('prologueText').textContent=s.text;
  $('prologueNext').textContent=prologueIndex===opening.opening.length-1?'走進陳宅 →':'繼續 →';
}
$('prologueNext').addEventListener('click',async()=>{
  if(prologueIndex<opening.opening.length-1){prologueIndex++;renderPrologue();return;}
  try{await markProgress('prologueDone');showCastIntro();}catch(e){alert(`保存序章進度失敗：${e.message}`);}
});
function showCastIntro(){
  showView('castView');$('sideStage').textContent='人物介紹';castIndex=0;renderCast();
}
function renderCast(){
  const roleId=opening.introOrder[castIndex],c=characters.find(x=>x.id===roleId);
  $('castCounter').textContent=`${String(castIndex+1).padStart(2,'0')} / 07`;
  $('castName').textContent=c.name;$('castOccupation').textContent=c.occupation;$('castAge').textContent=c.age;
  $('castAction').textContent=c.introAction;$('castIntro').textContent=`「${c.publicIntro}」`;
  $('castPortrait').style.backgroundPosition=portraitPos(roleId);$('castPortraitCaption').textContent=`${String(castIndex+1).padStart(2,'0')} · ${c.name}`;
  $('castNext').textContent=castIndex===opening.introOrder.length-1?'閱讀我的角色劇本 →':'下一位角色 →';
}
$('castNext').addEventListener('click',async()=>{
  if(castIndex<opening.introOrder.length-1){castIndex++;renderCast();return;}
  try{await markProgress('castDone');showView('gameView');showGameShell();openScript();}catch(e){alert(`保存人物介紹進度失敗：${e.message}`);}
});
function openScript(){
  $('scriptTitle').textContent=`${player.name}｜第一幕角色劇本`;
  $('scriptContent').innerHTML=`<div class="script-note">以下只包含你扮演角色所掌握的第一幕資訊。其他六位角色的完整劇本、秘密與任務不會公開給你。</div><pre>${esc(player.firstActScript)}</pre><div class="task-box"><h3>你的第一幕任務</h3><ul>${(player.firstActTasks||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`;
  $('scriptDialog').showModal();
}
$('scriptBtn').addEventListener('click',openScript);$('closeScript').addEventListener('click',()=>$('scriptDialog').close());
$('scriptDone').addEventListener('click',async()=>{
  try{await markProgress('scriptRead');$('scriptDialog').close();showView('gameView');await showDiscussionStart();}catch(e){alert(`保存劇本閱讀進度失敗：${e.message}`);}
});
function showDiscussionPanel(title,intro,phase){
  $('discussionPanel').classList.remove('hidden');$('discussionTitle').textContent=title;$('discussionIntro').textContent=intro;$('phaseBadge').textContent=`階段 ${phase} / 3`;
  $('sideStage').textContent=title;$('stageTitle').textContent=`第一幕｜${title}`;
}
async function loadPlan(){discussionPlan=await api(`/session/${session.id}/discussion/plan`);return discussionPlan;}
async function showDiscussionStart(){
  showView('gameView');$('discussionPanel').classList.remove('hidden');
  const plan=await loadPlan();const selected=plan.selectedTargets||[];
  const turns=plan.playerTurns||{};
  if(selected.length===0){renderTargetSelection();return;}
  const unfinished=selected.find(id=>!turns[id]?.done);
  if(unfinished){renderPlayerTargets(selected);return;}
  const q=plan.questioners||[];if(q.some(x=>!x.done)){renderAIQuestionIntro();return;}
  const pairs=plan.pairs||[];if(pairs.some(x=>!x.done)){renderAIPairsIntro();return;}
  renderAct1FinishReady();
}
function renderTargetSelection(){
  showDiscussionPanel('玩家選擇詢問對象','你可以從其他六位角色中，挑選最多兩位最令你起疑的人。選定後，每位角色只能進行一條三層問答路徑。',1);
  const others=characters.filter(c=>c.id!==player.id);
  $('questionArea').innerHTML=`<div class="selection-status">請選擇 1 至 2 位詢問對象：<strong id="targetCount">0 / 2</strong></div><div class="target-grid">${others.map(c=>`<label class="target-card"><input type="checkbox" value="${c.id}" class="target-check-input"><span class="mini-avatar" style="background-position:${portraitPos(c.id)}"></span><span><strong>${esc(c.name)}</strong><small>${esc(c.occupation)}</small></span></label>`).join('')}</div><div class="micro">你選擇的兩位角色將各自回答一組主問題與最多兩次追問。其他角色仍會透過 AI 角色之間的公開討論發言。</div><div class="action-row"><button id="confirmTargets" class="gold-btn" disabled>確認詢問對象 →</button></div>`;
  const checks=[...$('questionArea').querySelectorAll('.target-check-input')];
  const update=(ev)=>{const chosen=checks.filter(x=>x.checked);if(chosen.length>2){if(ev?.target)ev.target.checked=false;return update();}checks.forEach(x=>x.closest('.target-card').classList.toggle('selected',x.checked));$('targetCount').textContent=`${chosen.length} / 2`;$('confirmTargets').disabled=chosen.length<1;};
  checks.forEach(x=>x.addEventListener('change',update));
  $('confirmTargets').addEventListener('click',async()=>{
    const ids=checks.filter(x=>x.checked).map(x=>x.value);try{const d=await api(`/session/${session.id}/discussion/select-targets`,{method:'POST',body:JSON.stringify({roleIds:ids})});session=d.session;renderLog();discussionPlan=await loadPlan();renderPlayerTargets(ids);}catch(e){showQuestionError(e.message);}
  });
}
function renderPlayerTargets(selected){
  const turns=discussionPlan.playerTurns||{};const next=selected.find(id=>!turns[id]?.done);
  if(!next){renderAIQuestionIntro();return;}
  showDiscussionPanel('玩家公開詢問','你已選定詢問對象。每位角色各回答一條問答路徑，主問題及兩層追問都會公開記錄。',1);
  $('questionArea').innerHTML=`<div class="selection-status">你的詢問名額：${selected.length} / 2</div><div class="target-grid">${selected.map(id=>{const c=characters.find(x=>x.id===id),done=!!turns[id]?.done;return `<div class="target-card ${done?'selected':''}"><span class="mini-avatar" style="background-position:${portraitPos(id)}"></span><span><strong>${esc(c.name)}</strong><small>${done?'已完成三層問答':id===next?(turns[id]?.depth?'已進行，等待續問':'目前詢問對象'):'等待詢問'}</small></span></div>`;}).join('')}</div><div class="action-row"><button id="startTargetQuestions" class="gold-btn">${turns[next]?.depth?`繼續詢問 ${esc(nameOf(next))} →`:`向 ${esc(nameOf(next))} 提問 →`}</button></div>`;
  $('startTargetQuestions').addEventListener('click',()=>turns[next]?.depth?resumePlayerTarget(next):loadRootsForTarget(next));
}
async function resumePlayerTarget(roleId){
  activeTarget=roleId;
  try{
    const d=await api(`/session/${session.id}/dialogue/current?roleId=${encodeURIComponent(roleId)}`);
    showDiscussionPanel('玩家公開詢問',`繼續詢問 ${nameOf(roleId)}。上一個問題與回答已保留在公開紀錄。`,d.path.length);
    $('questionArea').innerHTML=`<div class="qa-block"><div class="q-label">上一個問題</div><div class="q-text">${esc(d.question)}</div><div class="q-label">${esc(nameOf(roleId))} 的回答</div><div class="answer-text">${esc(d.answer)}</div></div>${d.done?'<div class="empty-state">這位角色的問答已完成。</div>':`<div class="prompt-label">選擇下一個追問</div><div class="choice-grid">${d.followups.map(f=>`<button class="choice-btn" data-index="${f.index}">${esc(f.question)}</button>`).join('')}</div>`}`;
    if(!d.done)$('questionArea').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>askSelectedAI(roleId,[...d.path,Number(b.dataset.index)])));
  }catch(e){showQuestionError(e.message);}
}
async function loadRootsForTarget(roleId){
  activeTarget=roleId;activePlayerPath=null;
  try{const d=await api(`/session/${session.id}/dialogue/roots?mode=player_to_ai&roleId=${encodeURIComponent(roleId)}`);
    showDiscussionPanel('玩家公開詢問',`你正在詢問 ${nameOf(roleId)}。選擇一個主題，接著依照回答選擇最多兩層追問。`,1);
    $('questionArea').innerHTML=`<div class="prompt-label">你想從哪個方向詢問 ${esc(nameOf(roleId))}？</div><div class="choice-grid">${d.roots.map(q=>`<button class="choice-btn" data-index="${q.index}">${esc(q.question)}</button>`).join('')}</div>`;
    $('questionArea').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>askSelectedAI(roleId,[Number(b.dataset.index)])));
  }catch(e){showQuestionError(e.message);}
}
async function askSelectedAI(roleId,path){
  try{
    const d=await api(`/session/${session.id}/dialogue/ask-ai`,{method:'POST',body:JSON.stringify({roleId,path})});
    if(d.session)session=d.session;renderLog();setSpeaker(roleId,d.speakerName,d.answer,`公開回答・第 ${d.depth} 層`);
    $('questionArea').innerHTML=`<div class="qa-block"><div class="q-label">玩家提問</div><div class="q-text">${esc(d.question)}</div><div class="q-label">${esc(d.speakerName)} 回答</div><div class="answer-text">${esc(d.answer)}</div></div>${d.done?'<div class="empty-state">這位角色的三層問答已完成。</div><div class="action-row"><button id="nextTarget" class="gold-btn">繼續下一位詢問對象 →</button></div>':`<div class="prompt-label">選擇接下來的追問（最多兩次追問）</div><div class="choice-grid">${d.followups.map(f=>`<button class="choice-btn" data-index="${f.index}">${esc(f.question)}</button>`).join('')}</div>`}`;
    if(d.done){$('nextTarget').addEventListener('click',async()=>{discussionPlan=await loadPlan();renderPlayerTargets(discussionPlan.selectedTargets);});}
    else{$('questionArea').querySelectorAll('[data-index]').forEach(b=>b.addEventListener('click',()=>askSelectedAI(roleId,[...path,Number(b.dataset.index)])));}
  }catch(e){showQuestionError(e.message);}
}
function renderAIQuestionIntro(){
  const q=discussionPlan.questioners||[];const pending=q.filter(x=>!x.done);
  showDiscussionPanel('AI 角色向玩家提問','這兩位角色會依照各自劇本中掌握的線索與關係，主動向你提出疑問。所有問題與回答都會被在場角色聽見。',2);
  if(!pending.length){renderAIPairsIntro();return;}
  $('questionArea').innerHTML=`<div class="target-grid">${q.map(x=>`<div class="target-card ${x.done?'selected':''}"><span class="mini-avatar" style="background-position:${portraitPos(x.id)}"></span><span><strong>${esc(x.name)}</strong><small>${x.done?'已完成質詢':'將向你提出三層問題'}</small></span></div>`).join('')}</div><p class="micro">提問者由角色劇本中的直接接觸、目擊事件及人物關係預先安排，不會隨機抽選。</p><div class="action-row"><button id="startAIQuestion" class="gold-btn">開始 ${esc(pending[0].name)} 的提問 →</button></div>`;
  $('startAIQuestion').addEventListener('click',startAIQuestion);
}
async function startAIQuestion(){
  try{
    const d=await api(`/session/${session.id}/dialogue/ai-question`,{method:'POST',body:JSON.stringify({})});
    if(d.session)session=d.session;renderLog();activeAIQuestion={asker:d.speaker,path:d.path};
    renderAIQuestion(d.speakerName,d.question,d.options,d.depth);
  }catch(e){showQuestionError(e.message);}
}
function renderAIQuestion(askerName,question,options,depth){
  showDiscussionPanel('AI 角色向玩家提問',`${askerName} 正在針對你的角色提出問題。請選擇你要如何回答。`,2);
  setSpeaker(activeAIQuestion?.asker,askerName,question,`向玩家提問・第 ${depth} 層`);
  $('questionArea').innerHTML=`<div class="qa-block"><div class="q-label">${esc(askerName)} 向你提問</div><div class="q-text">${esc(question)}</div></div><div class="prompt-label">選擇你的回答方式</div><div class="choice-grid">${options.map((o,i)=>`<button class="choice-btn" data-answer="${i}"><b>${esc(o.label)}</b><span>${esc(o.text)}</span></button>`).join('')}</div>`;
  $('questionArea').querySelectorAll('[data-answer]').forEach(b=>b.addEventListener('click',()=>answerAIQuestion(Number(b.dataset.answer))));
}
async function answerAIQuestion(answerIndex){
  try{
    const d=await api(`/session/${session.id}/dialogue/ai-answer`,{method:'POST',body:JSON.stringify({answerIndex})});
    if(d.session)session=d.session;renderLog();setSpeaker(player.id,player.name,d.answer,d.done?'回答完成':'你的回答');
    if(!d.done&&d.nextQuestion){activeAIQuestion.path=d.nextPath;renderAIQuestion(d.speakerName,d.nextQuestion,d.nextOptions,d.nextPath.length);return;}
    activeAIQuestion=null;discussionPlan=await loadPlan();const next=discussionPlan.questioners.find(x=>!x.done);
    $('questionArea').innerHTML=`<div class="qa-block"><div class="q-label">你的回答</div><div class="answer-text">${esc(d.answer)}</div><div class="micro">這位角色的質詢已結束。</div></div><div class="action-row"><button id="nextAIQuestion" class="gold-btn">${next?`接受 ${esc(next.name)} 的提問 →`:'進入 AI 角色公開交叉詢問 →'}</button></div>`;
    $('nextAIQuestion').addEventListener('click',()=>next?startAIQuestion():renderAIPairsIntro());
  }catch(e){showQuestionError(e.message);}
}
async function renderAIPairsIntro(){
  const d=await api(`/session/${session.id}/discussion/ai-pairs`);const pairs=d.pairs||[];const next=pairs.find(x=>!x.done);
  showDiscussionPanel('AI 角色之間的公開交叉詢問','接下來由六位電腦角色分成三組，彼此提出主問題與追問。玩家無法控制他們的回答，但所有對話都會公開顯示，提供更多可供判斷的證詞。',3);
  $('questionArea').innerHTML=`<div class="pair-list">${pairs.map(p=>`<div class="pair-card"><div class="pair-head"><span>${esc(p.aName)}　⇄　${esc(p.bName)}</span><span>${p.done?'已完成':'待進行'}</span></div><p>雙方各自詢問對方一個主題及一個追問，對話將完整公開。</p></div>`).join('')}</div>${next?`<div class="action-row"><button id="runAIPair" class="gold-btn">開始 ${esc(next.aName)} 與 ${esc(next.bName)} 的對話 →</button></div>`:`<div class="action-row"><button id="finishAct" class="gold-btn">完成第一幕問答 →</button></div>`}`;
  if(next)$('runAIPair').addEventListener('click',()=>runAIPair(next.index));else $('finishAct').addEventListener('click',endAct1);
}
async function runAIPair(pairIndex){
  try{
    const d=await api(`/session/${session.id}/discussion/ai-pairs/run`,{method:'POST',body:JSON.stringify({pairIndex})});
    if(d.session)session=d.session;renderLog();
    const transcript=(d.transcript||[]).map(t=>`<div class="log-line"><time></time><strong>${esc(t.speaker)}</strong><span>${esc(t.text)}</span></div>`).join('');
    $('questionArea').innerHTML=`<div class="qa-block"><div class="q-label">本組公開對話</div>${transcript}</div><div class="action-row"><button id="nextPair" class="gold-btn">${d.allDone?'完成第一幕問答 →':'查看下一組角色對話 →'}</button></div>`;
    $('nextPair').addEventListener('click',()=>d.allDone?renderAIPairsIntro():renderAIPairsIntro());
    const lead=characters.find(c=>c.name===d.transcript?.[0]?.speaker);setSpeaker(lead?.id||player.id,'公開旁聽',`${nameOf(session.discussion.pairs[pairIndex].a)} 與 ${nameOf(session.discussion.pairs[pairIndex].b)} 已完成公開交叉詢問。`,'AI 角色互相質詢');
  }catch(e){showQuestionError(e.message);}
}
async function endAct1(){
  try{const d=await api(`/session/${session.id}/end-act1`,{method:'POST',body:JSON.stringify({})});session=d.session;renderLog();showComplete();}
  catch(e){showQuestionError(e.message);}
}
function renderAct1FinishReady(){
  showDiscussionPanel('第一幕問答完成','所有玩家與 AI 角色的公開問答都已完成。',3);
  $('questionArea').innerHTML='<div class="empty-state">三組 AI 公開交叉詢問均已完成，可以結束第一幕。</div><div class="action-row"><button id="finishAct" class="gold-btn">完成第一幕問答 →</button></div>';
  $('finishAct').addEventListener('click',endAct1);
}
function showQuestionError(message){$('questionArea').innerHTML=`<div class="error-box">${esc(message)}</div><div class="action-row"><button id="retryDiscussion" class="outline-btn">重新載入目前階段</button></div>`;$('retryDiscussion').addEventListener('click',()=>showDiscussionStart().catch(e=>showQuestionError(e.message)));}
function showComplete(){showView('gameView');$('discussionPanel').classList.add('hidden');$('actComplete').classList.remove('hidden');$('stageTitle').textContent='第一幕問答已完成';$('sideStage').textContent='第一幕完成';setSpeaker(null,'系統','序章、人物介紹與第一幕公開問答均已完成。陳宅裡仍有許多秘密等待揭開。','第一幕結束');}
$('scriptBtn').addEventListener('click',openScript);
$('toggleLogBtn').addEventListener('click',()=>{$('publicLog').classList.toggle('collapsed');$('toggleLogBtn').textContent=$('publicLog').classList.contains('collapsed')?'展開':'收合';});
$('backSetupBtn').addEventListener('click',()=>{localStorage.removeItem(SESSION_KEY);session=null;player=null;location.reload();});
function resumeSession(){
  showGameShell();
  if(session.stage==='act1_complete'){showView('gameView');showComplete();return;}
  const p=session.progress||{};
  if(!p.prologueDone){showPrologue();return;}
  if(!p.castDone){showCastIntro();return;}
  showView('gameView');
  if(!p.scriptRead){openScript();return;}
  showDiscussionStart().catch(e=>showQuestionError(e.message));
}
init();
