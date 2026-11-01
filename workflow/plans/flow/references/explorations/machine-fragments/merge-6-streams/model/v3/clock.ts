// T1's default budget on a virtual clock: exponential 500ms, capped 30 s, no jitter; 8 flaps; healthy 60 s; lose clears liveSince.
const run = (upFor: (n:number)=>number|null, horizon: number, buggy=false) => { let t=0,flaps=0,tries=0,n=0,liveSince:number|null=null;
  while (t<horizon) { tries++; const up=upFor(tries); if(up===null){ /* offline: attempt fails, never registered */ t+=0.1 } else { liveSince=t; t+=up; if(up>=60){flaps=0;n=0} }
    if(liveSince!==null){ if(t-liveSince<60){flaps++; if(flaps>=8) return `Flapping at ${t.toFixed(0)} s after ${tries} connections`} } else if(buggy&&tries>1){flaps++; if(flaps>=8) return `Flapping at ${t.toFixed(0)} s (bug)`}
    if(!buggy) liveSince=null; t+=Math.min(30,0.5*2**n); n++ }
  return `never, ${tries} connections in ${horizon} s` };
console.log("flap 1 s", run(()=>1,10800)); console.log("up 59 s", run(()=>59,10800)); console.log("up 61 s", run(()=>61,10800)); console.log("offline", run(()=>null,3600)); console.log("up 5 s, then offline", run((i)=>i===1?5:null,3600)); console.log("as written, up 5 s then offline", run((i)=>i===1?5:null,3600,true));
