const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function server(){
 const c=vm.createContext({console,Date});
 vm.runInContext(fs.readFileSync('backend/Code.gs','utf8'),c);
 const records=[{n:1,set:'dev'},{n:2,set:'test'}];
 let rows=[Array.from(c.DEC_HEAD)],open=false;
 const sheet={getLastRow:()=>rows.length,getRange:(r,col,h,w)=>({getValues:()=>rows.slice(r-1,r-1+h).map(x=>x.slice(col-1,col-1+w)),setNumberFormat:()=>{},setValues:values=>{values.forEach((x,i)=>{rows[r-1+i]=x;});}})};
 c.book_=()=>({});c.coder_=(_,code)=>['A','B'].includes(code)?{code,name:code}:null;
 c.settings_=()=>({test_open:open,codebook_version:'test'});c.records_=()=>records;c.codebook_=()=>[];
 c.sets_=()=>({1:'dev',2:'test'});c.decisions_=()=>sheet;c.progress_=()=>({});
 c.LockService={getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})};
 return {c,open:()=>{open=true;},rows:()=>rows};
}
const item=(n,extra={})=>({n,topic:'y',setting:'y',comm:'y',pub:'y',decision:'include',ts:Date.now(),...extra});
test('unknown codes cannot read or save',()=>{const {c}=server();assert.equal(c.start('X').ok,false);assert.equal(c.save('X',[item(1)]).ok,false);});
test('test records and saves remain locked before development completion',()=>{const s=server();s.open();assert.equal(s.c.start('A').records.length,1);assert.equal(s.c.save('A',[item(2)]).error,'test_locked');});
test('coordinator gate remains authoritative after development completion',()=>{const s=server();s.c.save('A',[item(1)]);assert.equal(s.c.start('A').records.length,1);assert.equal(s.c.save('A',[item(2)]).error,'test_locked');s.open();assert.equal(s.c.start('A').records.length,2);assert.equal(s.c.save('A',[item(2)]).saved,1);});
test('save/resume keeps coders separate',()=>{const s=server();s.c.save('A',[item(1,{notes:'A private note'})]);assert.equal(s.c.start('A').saved['1'].notes,'A private note');assert.equal(Object.keys(s.c.start('B').saved).length,0);});
test('older changes cannot overwrite newer saves and retries do not duplicate rows',()=>{const s=server();const now=Date.now();s.c.save('A',[item(1,{ts:now,notes:'new'})]);s.c.save('A',[item(1,{ts:now-1000,notes:'old'})]);s.c.save('A',[item(1,{ts:now,notes:'new'})]);assert.equal(s.c.start('A').saved['1'].notes,'new');assert.equal(s.rows().length,2);});
test('invalid records and timestamps fail without acknowledgement',()=>{const {c}=server();assert.equal(c.save('A',[item(90)]).ok,false);assert.equal(c.save('A',[item(1,{ts:Infinity})]).ok,false);assert.equal(c.save('A',[item(1,{ts:Date.now()+1e9})]).ok,false);});
test('incomplete exclusions do not unlock test',()=>{const s=server();s.open();s.c.save('A',[item(1,{decision:'exclude',code:''})]);assert.equal(s.c.start('A').records.length,1);s.c.save('A',[item(1,{decision:'exclude',code:'E2'})]);assert.equal(s.c.start('A').records.length,2);});
test('a relocked test set also hides saved test decisions',()=>{const s=server();s.c.save('A',[item(1)]);s.open();s.c.save('A',[item(2)]);s.c.settings_=()=>({test_open:false});assert.equal(s.c.start('A').saved['2'],undefined);});
test('embedded bridge matches its source',()=>{const {c}=server();assert.equal(c.BRIDGE_HTML,fs.readFileSync('backend/bridge.html','utf8'));});
