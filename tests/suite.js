// ChoreHeroes Automated Test Suite v1.0
// Paste into browser console at http://localhost:3000/index.html

(async function runSuite() {
  const results = [];
  const pass = (name) => { results.push({name, status:'PASS'}); console.log('✅', name); };
  const fail = (name, r) => { results.push({name, status:'FAIL', reason:String(r)}); console.error('❌', name, '-', r); };

  const pwd = buildCloudAuthPassword('heilleys@gmail.com', '1234');
  await firebaseAuth.signInWithEmailAndPassword('heilleys@gmail.com', pwd);
  const family = await fbPullFamily('family-k4pyt5ti-mnuxkrd8');
  upsertFamilyInState(family);
  state.session = { familyId: 'family-k4pyt5ti-mnuxkrd8', role: 'parent' };
  saveState({ skipCloud: true });
  renderApp();
  await new Promise(r => setTimeout(r, 800));

  const getF = () => Array.isArray(state.families) ? state.families.find(f=>f.id==='family-k4pyt5ti-mnuxkrd8') : Object.values(state.families||{})[0];

  try { firebaseAuth.currentUser?.email==='heilleys@gmail.com' ? pass('T01: Parent login') : fail('T01',firebaseAuth.currentUser?.email); } catch(e){fail('T01',e.message);}
  try { state.session?.role==='parent' ? pass('T02: Session role=parent') : fail('T02',state.session?.role); } catch(e){fail('T02',e.message);}
  try { const h=buildCloudAuthPassword('heilleys@gmail.com','1234'); h?.length>10 ? pass('T03: Hash generation works') : fail('T03',h); } catch(e){fail('T03',e.message);}
  try { const f=getF(); f?.familyName ? pass('T04: Family loaded - '+f.familyName) : fail('T04','not found'); } catch(e){fail('T04',e.message);}
  try { const f=getF(); f?.isPro===true ? pass('T05: isPro=true') : fail('T05',f?.isPro); } catch(e){fail('T05',e.message);}
  try { const f=getF(); f?.proTier==='tier2' ? pass('T06: proTier=tier2') : fail('T06',f?.proTier); } catch(e){fail('T06',e.message);}
  try { const f=getF(); getSubscriptionStatus(f)==='pro' ? pass('T07: Subscription=pro') : fail('T07',getSubscriptionStatus(f)); } catch(e){fail('T07',e.message);}
  try { const f=getF(); f?.haWebhookUrl?.includes('nabu.casa') ? pass('T08: HA webhook set') : fail('T08',f?.haWebhookUrl||'not set'); } catch(e){fail('T08',e.message);}
  try { const f=getF(); f?.parentEmail==='heilleys@gmail.com' ? pass('T09: Parent email set') : fail('T09',f?.parentEmail); } catch(e){fail('T09',e.message);}
  try { const k=getFamilyKids(); k.length>=3 ? pass('T10: 3 kids - '+k.map(x=>x.name).join(', ')) : fail('T10',k.length); } catch(e){fail('T10',e.message);}
  try { const k=getFamilyKids(); k.every(x=>typeof x.points==='number'&&x.points>=0) ? pass('T11: Valid points') : fail('T11','invalid'); } catch(e){fail('T11',e.message);}
  try { const k=getFamilyKids(); k.every(x=>(x.awaiting?.length||0)===0) ? pass('T12: No stale awaiting tasks') : fail('T12',k.map(x=>x.name+':'+x.awaiting?.length).join(', ')); } catch(e){fail('T12',e.message);}
  try { const s=getKid('kid-31fi4kiu-mnuxkrd8'); s?.taskTemplates?.length>0 ? pass('T13: Simra has '+s.taskTemplates.length+' templates') : fail('T13','none'); } catch(e){fail('T13',e.message);}
  try { const s=getKid('kid-31fi4kiu-mnuxkrd8'); s?.due?.length>=0 ? pass('T14: Simra.due valid ('+s.due.length+' tasks)') : fail('T14',typeof s?.due); } catch(e){fail('T14',e.message);}
  try { const s=getKid('kid-31fi4kiu-mnuxkrd8'); s?.rewards?.length>0 ? pass('T15: Simra has '+s.rewards.length+' rewards') : fail('T15','none'); } catch(e){fail('T15',e.message);}
  try { state.session={familyId:'family-k4pyt5ti-mnuxkrd8',role:'parent'}; renderApp(); await new Promise(r=>setTimeout(r,600)); document.querySelectorAll('[class*="kid"]').length>0 ? pass('T16: Parent dashboard renders') : fail('T16','no kid elements'); } catch(e){fail('T16',e.message);}
  try { const h1=document.querySelector('h1'); const l=[...(h1?.querySelectorAll('span:not(.title-star)')||[])].map(s=>s.textContent).join(''); l==='ChoreHeroes' ? pass('T17: Title=ChoreHeroes') : fail('T17','got:'+l); } catch(e){fail('T17',e.message);}
  try { state.session={familyId:'family-k4pyt5ti-mnuxkrd8',role:'kid',kidId:'kid-31fi4kiu-mnuxkrd8'}; renderApp(); await new Promise(r=>setTimeout(r,600)); document.querySelector('[class*="point"],[class*="score"]') ? pass('T18: Kid page renders') : fail('T18','no points el'); } catch(e){fail('T18',e.message);}
  try { state.session={familyId:'family-k4pyt5ti-mnuxkrd8',role:'parent'}; renderApp(); await new Promise(r=>setTimeout(r,500)); const b=document.querySelector('.trial-banner,.trial-banner-bottom'); b?.textContent?.includes('ChoreHeroes Pro') ? pass('T19: ChoreHeroes Pro banner') : fail('T19',b?.textContent?.substring(0,40)||'no banner'); } catch(e){fail('T19',e.message);}
  try { const t1=formatTaskTimeValue('08:00'); const t2=formatTaskTimeValue('14:30'); !t1.includes('AMAM')&&!t2.includes('PMPM') ? pass('T20: No AM/PM double bug ('+t1+', '+t2+')') : fail('T20',t1+'|'+t2); } catch(e){fail('T20',e.message);}
  try { const s=getKid('kid-31fi4kiu-mnuxkrd8'); const m=(s?.points/(s?.pointsPerDollarReward||20))*(s?.dollarRewardValue||1); typeof m==='number'&&m>=0 ? pass('T21: Points to money (Simra: $'+m.toFixed(2)+')') : fail('T21',m); } catch(e){fail('T21',e.message);}

  const passed=results.filter(r=>r.status==='PASS').length;
  const failed=results.filter(r=>r.status==='FAIL').length;
  console.log('\n══════════════════════════════');
  console.log('RESULTS: '+passed+'/'+results.length+' passed');
  if(failed>0){console.log('FAILURES:');results.filter(r=>r.status==='FAIL').forEach(r=>console.log(' ❌',r.name,'-',r.reason));}
  console.log('══════════════════════════════');
})();
