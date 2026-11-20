import { ABSENT, Store } from "./store.ts";
const F = ["$present","id","title","slug","archived","revision"];
const seedWhole = (s: Store, v=1) => s.judge({ carries: {$present:true,id:"t1",title:"t",slug:"t",archived:false,revision:v}, at:v, from:s.tick(), rest:"none" });
const show = (name: string, s: Store) => console.log(name.padEnd(8), F.map(f=>{const x=s.status(f);return `${f}=${String(x.value===ABSENT?"-":x.value)}${x.marked?`[${x.marked}]`:""}`}).join(" "), `doubts:${s.doubts.length}`);
const claim=(s:Store,f:string,v:unknown,from:number)=>{ s.judge({carries:{[f]:v},at:undefined,from,rest:"unchanged",claim:true}); const c=s.cells.revision; if(c){c.claim=true;c.exact=false;c.landed=s.tick();} };
{ // A1
  const s=new Store(F); const list=s.tick(); const w=s.tick();
  s.judge({carries:{$present:true,title:"new",revision:2},at:2,from:w,rest:"unknown"});
  s.judge({carries:{$present:true,id:"t1",title:"t",slug:"t",archived:false,revision:1},at:1,from:list,rest:"none"});
  show("A1",s);
}
{ // A2
  const s=new Store(F); const list=s.tick(); const w=s.tick();
  claim(s,"archived",true,w);
  s.judge({carries:{$present:true,title:"x",revision:3},at:3,from:s.tick(),rest:"unchanged"});
  s.judge({carries:{$present:true,id:"t1",title:"t",slug:"t",archived:false,revision:1},at:1,from:list,rest:"none"});
  show("A2",s);
}
{ // A2 with a base already held
  const s=new Store(F); seedWhole(s); const list=s.tick(); const w=s.tick();
  claim(s,"archived",true,w);
  s.judge({carries:{$present:true,title:"x",revision:3},at:3,from:s.tick(),rest:"unchanged"});
  s.judge({carries:{$present:true,id:"t1",title:"t",slug:"t",archived:false,revision:1},at:1,from:list,rest:"none"});
  show("A2held",s);
}
{ // A3
  const s=new Store(F); seedWhole(s); const w=s.tick();
  s.judge({carries:{$present:true,archived:true,revision:5},at:5,from:s.tick(),rest:"unchanged"});
  s.judge({carries:{$present:true,id:"t1",title:"mine",slug:"mine",archived:false,revision:4},at:4,from:w,rest:"none"});
  show("A3",s);
}
{ // A4
  const s=new Store(F); seedWhole(s);
  const t:any={}; for(const f of F)t[f]=ABSENT; t.$present=false;
  s.judge({carries:t,at:2,from:s.tick(),rest:"none"});
  s.judge({carries:{$present:true,title:"x",revision:3},at:3,from:s.tick(),rest:"unchanged"});
  show("A4",s);
}
{ // M12: a doubt on archived, a later projection of title clears nothing
  const s=new Store(F); seedWhole(s,2);
  s.doubts.push({f:"archived",to:s.tick(),asked:true});
  s.judge({carries:{$present:true,title:"t",revision:3},at:3,from:s.tick(),rest:"unknown"});
  show("M12",s);
}
{ // M5: 10 versioned patch frames during a repair: no new doubt
  const s=new Store(F); seedWhole(s);
  s.doubts.push({f:"title",to:s.tick(),asked:true}); const rep=s.tick();
  for(let i=2;i<12;i++) s.judge({carries:{$present:true,title:"b"+i,revision:i},at:i,from:s.tick(),rest:"unchanged"});
  s.judge({carries:{$present:true,id:"t1",title:"b1",slug:"t",archived:false,revision:1},at:1,from:rep,rest:"none"});
  show("M5",s); console.log("   M5 repairs still wanted:",s.wantsRepair());
}
{ // listen.load: hello other frame.now frame.was, no version, unordered
  const s=new Store(F.filter(f=>f!=="revision")); s.judge({carries:{$present:true,id:"t1",title:"t",slug:"t",archived:false},at:undefined,from:s.tick(),rest:"none"});
  const hello=s.tick();
  s.judge({carries:{$present:true,id:"t1",title:"other1",slug:"t",archived:false},at:undefined,from:hello,rest:"none"});
  s.judge({carries:{$present:true,id:"t1",title:"t",slug:"t",archived:false},at:undefined,from:hello,rest:"none"});
  show("L.load",s); const rep=s.tick();
  s.judge({carries:{$present:true,id:"t1",title:"other1",slug:"t",archived:false},at:undefined,from:rep,rest:"none"});
  show(" +repair",s);
}
{ // fragstore.row: Go ack put.lost GiveUp reload Fetch fetch.truth landLate
  const s=new Store(F); seedWhole(s);
  s.doubts.push({f:"title",to:null,attempt:"a",resolved:true,asked:true}); s.doubts.push({f:"revision",to:null,attempt:"a",resolved:true,asked:true});
  s.gap(s.tick()); const fetch=s.tick();
  s.judge({carries:{$present:true,id:"t1",title:"t",slug:"t",archived:false,revision:1},at:1,from:fetch,rest:"none"});
  show("F.row",s);
}
{ // M10: gap; refetch fails
  const s=new Store(F); seedWhole(s); s.gap(s.tick()); show("M10",s);
}
