const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path'), assert=require('node:assert/strict');
const context={window:{},URL,Date,Set,Map,AbortController,setTimeout,clearTimeout};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/assistant.js'),'utf8'),context);
const tools=context.window.TrackerTools,mixin=context.window.TrackerAssistant;
let checks=0;
function eq(a,b){assert.deepEqual(JSON.parse(JSON.stringify(a)),b);checks++}
function ok(v){assert(v);checks++}
const records=[{id:1,plan_id:1,study_date:'2026-10-20',minutes:30,topic:'Vue组件',takeaway:'props是父组件传递给子组件的属性',next_step:''},
 {id:2,plan_id:2,study_date:'2026-10-21',minutes:60,topic:'API接口',takeaway:'409表示冲突',next_step:'增加日期边界测试'},
 {id:3,plan_id:1,study_date:'2026-10-21',minutes:20,topic:'Python测试',takeaway:'pytest参数化',next_step:''}];
eq(tools.retrieve(records,'复习Vue', '').map(x=>x.id),[1]);
eq(tools.retrieve(records,'接口冲突', '').map(x=>x.id),[2]);
eq(tools.retrieve(records,'Vue', '2'),[]);
eq(tools.retrieve(records,'区块链', ''),[]);
eq(tools.retrieve(records,'总结最近的打卡', '').map(x=>x.id),[3,2,1]);
const days=tools.recentDays(records,'2026-10-21');
eq(days.length,21);eq(days.at(-1),{date:'2026-10-21',minutes:80});eq(days.at(-2).minutes,30);
const color=m=>Number(tools.heatStyle(m)['--heat-bg'].match(/([\d.]+)%\)/)?.[1]||100);
ok(color(20)>color(40)&&color(40)>color(60)&&color(60)>color(90)&&color(90)>color(120));
eq(tools.heatStyle(120),JSON.parse(JSON.stringify(tools.heatStyle(720))));
eq(tools.serviceBase('https://service.example/'),'https://service.example');
eq(tools.serviceBase('http://127.0.0.1:8000'),'http://127.0.0.1:8000');
for(const url of ['javascript:alert(1)','http://remote.test','https://key:password@service.test','https://service.test/?key=secret']){assert.throws(()=>tools.serviceBase(url));checks++}

async function run(){
 const original={plan_id:1,study_date:'2026-10-21',minutes:45,topic:'原主题',takeaway:'原收获',next_step:'原下一步',shared:true};
 const form={open:true};let closed=false;
 const model={...mixin.data(),...mixin.methods,plans:[{id:1,start_date:'2026-10-01',days:28}],recordForm:{...original},modal:'record',
  health:{today:'2026-10-21'},$refs:{formDialog:form},closeAssistant(){closed=true},openRecord(){throw Error('should not reopen existing form')}};
 model.aiDraft={study_date:null,minutes:null,topic:'AI主题',takeaway:'AI收获',next_step:null,warnings:[]};
 model.aiChecked={topic:true,takeaway:false};await model.applyAIDraft();
 eq(model.recordForm,{...original,topic:'AI主题'});ok(closed);
 model.aiDraft.study_date='2026-10-22';model.aiChecked={study_date:true};closed=false;await model.applyAIDraft();
 ok(!closed&&model.aiError.includes('日期'));eq(model.recordForm.study_date,'2026-10-21');
 let saved=false;model.api=()=>{saved=true};model.aiDraft={topic:'确认的草稿'};model.aiChecked={topic:true};await model.applyAIDraft();
 ok(!saved);eq(model.recordForm.shared,true);
 console.log(`${checks} assistant, retrieval and heatmap checks passed`);
}
run().catch(e=>{console.error(e);process.exitCode=1});
