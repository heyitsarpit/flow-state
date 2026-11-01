import { search, type Cfg } from "./every";
const B: Cfg = { name:"", pos:true,C:true,replay:false,order:"old",moreAt:false,doneAt:false,retention:false,reset:false,rooms:1,snapshot:"",resetOn:false,sdk:false,latestN:0,A:2,D:1,R:1,S:0 };
for (const [n,o] of [["refC",{refresh:true,doneAt:true}],["refN",{refresh:true,C:false}],["wait",{wait:true,leaveWipe:true,head:true,doneAt:true}]] as any) { console.log("==",n, JSON.stringify(search({...B,...o},{},120000,new Map()))); }
