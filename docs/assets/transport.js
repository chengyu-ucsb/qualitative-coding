(function () {
  'use strict';
  const config = window.QC_CONFIG || {};
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  const configured = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.endpoint || '');
  const namespace = 'qc:' + config.project + (demo ? ':practice:' : ':live:');
  let connection;
  const records = [
    {n:1,set:'dev',title:'Talking through AI feedback in a university writing seminar',authors:'Fictional practice record',venue:'Practice Journal',year:'2025',type:'article',abstract:'This fictional study examines how university students discuss feedback from a generative AI writing assistant. Drawing on social presence theory, it analyzes conversations between students and their instructors about revision choices. It is presented as an English-language, peer-reviewed journal article for practice only.'},
    {n:2,set:'dev',title:'A chatbot for primary-school arithmetic',authors:'Fictional practice record',venue:'Practice Journal',year:'2024',type:'article',abstract:'This fictional article describes a generative AI tutor used in a primary school. Participants are children aged eight to ten. It compares arithmetic scores before and after a classroom intervention. This is an invented training example.'},
    {n:3,set:'dev',title:'Artificial intelligence and university learning: an early proposal',authors:'Fictional practice record',venue:'Practice working paper',year:'2025',type:'preprint',abstract:'This fictional working paper proposes using AI in university learning. Its short abstract provides no information about communication theory or communication processes. The paper has not been peer reviewed. This is an invented training example.'}
  ];
  function practice(fn,args) {
    if(String(args[0]).trim().toUpperCase() !== 'DEMO') return {ok:false,error:'unknown_code'};
    const key=namespace+'server';
    const saved=JSON.parse(localStorage.getItem(key)||'{}');
    if(fn==='start') return {ok:true,code:'DEMO',coder:'Practice coder',records,totals:{dev:3,test:0},settings:{testOpen:false,codebook:'Practice',message:'Practice workspace · all three records are fictional. No choices are sent to the study.'},saved,codebook:[{kind:'title',text:'Practice guide'},{kind:'p',text:'Try the four screening questions, decision buttons, notes, highlights and progress map. These fictional records help you learn the interface. For study coding, use the full codebook supplied after signing in to the live project.'}]};
    if(fn==='save') { args[1].forEach(item=>{saved[item.n]=item;});localStorage.setItem(key,JSON.stringify(saved));return {ok:true,saved:args[1].length}; }
    throw new Error('Unknown action');
  }
  function connect() {
    if(connection) return connection;
    connection=new Promise((resolve,reject)=>{
      const channel=crypto.randomUUID();
      const frame=document.createElement('iframe');
      frame.hidden=true; frame.title='Study save connection';
      frame.referrerPolicy='no-referrer';
      const endpoint=new URL(config.endpoint);endpoint.searchParams.set('channel',channel);
      frame.src=endpoint.href;
      const timeout=setTimeout(()=>{window.removeEventListener('message',ready);frame.remove();connection=null;reject(new Error('Connection timed out'));},25000);
      function ready(event) {
        const data=event.data;
        if(!/^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(event.origin) || !data || data.channel!==channel || data.type!=='qc-ready') return;
        clearTimeout(timeout);window.removeEventListener('message',ready);
        resolve({source:event.source,origin:event.origin,channel});
      }
      window.addEventListener('message',ready);document.body.appendChild(frame);
    });
    return connection;
  }
  async function call(fn,args) {
    if(demo) return practice(fn,args);
    if(!configured) throw new Error('Study not set up');
    const bridge=await connect();
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();
      const timer=setTimeout(()=>{window.removeEventListener('message',receive);reject(new Error('Save confirmation timed out'));},35000);
      function receive(event) {
        const data=event.data;
        if(event.source!==bridge.source || event.origin!==bridge.origin || !data || data.channel!==bridge.channel || data.id!==id) return;
        clearTimeout(timer);window.removeEventListener('message',receive);
        if(data.error) reject(new Error(data.error));else resolve(data.result);
      }
      window.addEventListener('message',receive);
      bridge.source.postMessage({type:'qc-call',channel:bridge.channel,id,fn,args},bridge.origin);
    });
  }
  window.QC={call,demo,configured,namespace};
})();
