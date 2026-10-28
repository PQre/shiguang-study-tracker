/* Study evidence retrieval and the optional server-backed assistant. */
(function (root) {
  'use strict';
  const fields = ['study_date', 'minutes', 'topic', 'takeaway', 'next_step'];
  const labels = {study_date:'学习日期', minutes:'学习时长（分钟）', topic:'学习主题', takeaway:'学习收获', next_step:'下一步'};
  function heatStyle(minutes) {
    const ratio = Math.min(Math.max(Number(minutes) || 0, 0), 120) / 120;
    return {'--heat-bg': ratio ? `hsl(254, 53%, ${96 - ratio * 57}%)` : '#f5f4f8',
      '--heat-ink': ratio >= 0.635 ? '#ffffff' : '#000000',
      '--heat-subtle': ratio >= 0.635 ? '#ffffff' : '#38294f'};
  }
  function recentDays(records, today) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
    return Array.from({length:21}, (_, i) => {
      const d = new Date(today + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 20 + i);
      const date = d.toISOString().slice(0,10);
      return {date, minutes:records.filter(r => r.study_date === date).reduce((sum,r) => sum + r.minutes,0)};
    });
  }
  function retrieve(records, question, planId) {
    const q = question.toLowerCase().trim();
    const cleaned=q.replace(/帮我|请|一下|总结|最近|近期|今天|昨天|以前|学过|学习|复习|回顾|知识点|知识|内容|记录|打卡|给我|三道|几道|题目|问题|提问|考考我|的|和|了|什么/g,' ');
    const terms = new Set(cleaned.match(/[a-z0-9_+#.-]{2,}/g) || []);
    for (const segment of cleaned.match(/[\u3400-\u9fff]+/g) || []) {
      for (let i=0;i<segment.length-1;i++) {
        terms.add(segment.slice(i,i+2));
      }
    }
    const general = !terms.size && /复习|最近|总结|回顾|知识|学了|打卡|提问|出题/.test(q);
    return records.filter(r => !planId || r.plan_id === Number(planId)).map(r => {
      const title=r.topic.toLowerCase(), body=(r.takeaway+' '+r.next_step).toLowerCase();
      let score=0; for (const t of terms) score+=(title.includes(t)?5:0)+(body.includes(t)?1:0);
      return {record:r,score};
    }).filter(x => general || x.score>0).sort((a,b)=>b.score-a.score || b.record.study_date.localeCompare(a.record.study_date) || b.record.id-a.record.id)
      .slice(0,6).map(x=>x.record);
  }
  function serviceBase(value) {
    const text=value.trim().replace(/\/+$/,'');
    if (!text) return '';
    const url=new URL(text);
    if (url.username || url.password || url.search || url.hash ||
        (url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) {
      throw new Error('请输入HTTPS服务地址；本机调试可使用http://127.0.0.1:8000');
    }
    return text;
  }
  const tools={heatStyle,recentDays,retrieve,serviceBase};
  root.TrackerTools=tools;
  root.TrackerAssistant={
    data(){return {assistantTab:'chat',assistantOpen:false,aiQuestion:'',aiText:'',aiImages:[],
      aiDraft:null,aiChecked:{},aiMessages:[],aiAllRecords:[],aiPlan:'',aiSources:[],
      aiBusy:false,aiUploading:false,aiError:'',aiFeedback:'',aiApplied:'',aiServiceUrl:'',aiToken:'',
      aiStatus:null,aiConnecting:false,aiRequestId:0,aiController:null,aiFieldLabels:labels}},
    computed:{
      recentHeatmap(){return recentDays(this.records,this.health.today)},
      aiMatches(){return retrieve(this.aiAllRecords,this.aiQuestion,this.aiPlan)},
      aiConnectionLabel(){return this.aiStatus?.configured?'服务已连接':'待配置AI服务'}
    },
    methods:{
      heatStyle,
      async openAssistant(tab='chat'){
        if (this.aiBusy || this.aiUploading) return;
        this.assistantTab=tab;this.aiError='';this.assistantOpen=true;
        await this.$nextTick();
        if (!this.$refs.assistantDialog.open) this.$refs.assistantDialog.showModal();
        try {this.aiAllRecords=await this.api('/records')} catch(e){this.aiAllRecords=[];this.aiError='无法读取打卡记录：'+e.message}
        if (!this.aiStatus && !this.aiConnecting) this.connectAI(false);
      },
      closeAssistant(){
        this.aiRequestId++;if(this.aiController)this.aiController.abort();
        this.aiBusy=false;this.assistantOpen=false;this.$refs.assistantDialog.close();
      },
      invalidateDraft(){this.aiDraft=null;this.aiChecked={};this.aiError='';this.aiFeedback=''},
      async aiFetch(path,body,signal){
        const base=serviceBase(this.aiServiceUrl);
        if (!base && window.TrackerRemoteFetch) throw new Error('请先在“设置”填写已部署的AI服务地址');
        const url=(base||location.origin)+'/api/ai/'+path;
        const headers={};if(body!==undefined)headers['Content-Type']='application/json';
        if(this.aiToken)headers.Authorization='Bearer '+this.aiToken;
        const send=window.TrackerRemoteFetch || window.fetch.bind(window);
        let response;
        try {response=await send(url,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal,credentials:'omit'})}
        catch(e){if(e.name==='AbortError')throw e;throw new Error('无法连接AI服务，请检查服务地址、运行状态和允许访问的网页来源')}
        let data;try{data=await response.json()}catch{throw new Error('该地址不是拾光AI服务，请填写运行本项目后端的地址')}
        if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:'AI服务请求失败，请核对设置和材料');
        return data;
      },
      async connectAI(show=true){
        if(this.aiConnecting || this.aiBusy)return;
        this.aiConnecting=true;if(show)this.aiError='';this.aiStatus=null;
        const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),8000);
        try{
          const base=serviceBase(this.aiServiceUrl);
          if(!base)try{localStorage.removeItem('shiguang.ai.service.v1')}catch{}
          this.aiStatus=await this.aiFetch('status',undefined,ctrl.signal);
          if(typeof this.aiStatus.configured!=='boolean')throw new Error('服务响应不正确，请核对AI服务地址');
          if(this.aiStatus.token_required&&!this.aiToken)throw new Error('此AI服务需要访问口令，请填写后重新连接');
          try{localStorage.setItem('shiguang.ai.service.v1',base)}catch{}
          if(show)this.aiFeedback=this.aiStatus.configured?'连接成功，可以返回对话或识别录入。':'服务已连接，请在后端配置模型接口、模型名称和API密钥。';
        }catch(e){this.aiStatus=null;if(show)this.aiError=e.name==='AbortError'?'连接超时，请检查AI服务是否已启动':e.message}
        finally{clearTimeout(timer);this.aiConnecting=false}
      },
      async beginAI(task){
        if(this.aiBusy || this.aiUploading)return;
        this.aiBusy=true;this.aiError='';this.aiFeedback='';
        const ticket=++this.aiRequestId, ctrl=new AbortController();this.aiController=ctrl;
        const timer=setTimeout(()=>ctrl.abort(),75000);
        try{await task(ctrl.signal,ticket)}
        catch(e){if(ticket===this.aiRequestId)this.aiError=e.name==='AbortError'?'AI处理已停止或超时，可以减少材料后重试':e.message}
        finally{clearTimeout(timer);if(ticket===this.aiRequestId)this.aiBusy=false}
      },
      async sendAI(){
        const question=this.aiQuestion.trim();if(!question || this.aiBusy)return;
        await this.beginAI(async(signal,ticket)=>{
          this.aiAllRecords=await this.api('/records');
          let sources=retrieve(this.aiAllRecords,question,this.aiPlan);
          // Follow-up pronouns retain the most recent matching evidence, after rechecking live records.
          if(!sources.length && /^(这|那|它|再|为什么|如何|继续|答案|讲解)/.test(question)){
            const ids=new Set(this.aiSources.map(x=>x.id));sources=this.aiAllRecords.filter(r=>ids.has(r.id)&&(!this.aiPlan||r.plan_id===Number(this.aiPlan))).slice(0,6);
          }
          const history=this.aiMessages.slice(-8).map(m=>({role:m.role,content:m.content.slice(0,4000)}));
          const result=await this.aiFetch('chat',{question,history,records:sources.map(r=>({id:r.id,study_date:r.study_date,topic:r.topic,takeaway:r.takeaway,next_step:r.next_step||''}))},signal);
          if(ticket!==this.aiRequestId)return;
          if(typeof result.answer!=='string'||!result.answer.trim())throw new Error('AI没有返回可用回答，请重试');
          this.aiMessages.push({role:'user',content:question},{role:'assistant',content:result.answer,sources});
          this.aiMessages=this.aiMessages.slice(-20);this.aiSources=sources;this.aiQuestion='';
          await this.$nextTick();const box=this.$refs.aiChatLog;if(box)box.scrollTop=box.scrollHeight;
        });
      },
      async addAIImages(event){
        if(this.aiBusy || this.aiUploading)return;
        const files=Array.from(event.target?.files || event.clipboardData?.files || []);
        if(!files.length)return;
        if(event.type==='paste')event.preventDefault();
        this.aiUploading=true;this.invalidateDraft();
        try{
          if(this.aiImages.length+files.length>3)throw new Error('一次最多选择3张图片');
          const added=[];
          for(const file of files){
            if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择PNG、JPEG或WebP图片');
            if(file.size>12*1024*1024)throw new Error('原图超过12MB，请先缩小图片');
            const url=URL.createObjectURL(file);
            try{
              const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error('图片无法读取，请换一张图片'));el.src=url});
              const scale=Math.min(1,2048/Math.max(img.naturalWidth,img.naturalHeight));
              const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
              const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
              let quality=.88,data=canvas.toDataURL('image/jpeg',quality);
              while(data.length>2*1024*1024*4/3 && quality>.4){quality-=.15;data=canvas.toDataURL('image/jpeg',quality)}
              if(data.length>2*1024*1024*4/3)throw new Error('图片压缩后仍超过2MB，请裁剪后重试');
              added.push({name:file.name||'粘贴的截图',data});
            }finally{URL.revokeObjectURL(url)}
          }
          this.aiImages.push(...added);
        }catch(e){this.aiError=e.message}finally{this.aiUploading=false;if(event.target?.type==='file')event.target.value=''}
      },
      removeAIImage(index){this.aiImages.splice(index,1);this.invalidateDraft()},
      async extractAI(){
        if(!this.aiText.trim() && !this.aiImages.length){this.aiError='请先粘贴学习内容或选择图片';return}
        this.aiDraft=null;
        await this.beginAI(async(signal,ticket)=>{
          const result=await this.aiFetch('extract',{text:this.aiText.trim(),images:this.aiImages.map(x=>x.data)},signal);
          if(ticket!==this.aiRequestId)return;
          if(!fields.every(k=>Object.prototype.hasOwnProperty.call(result,k))||!Array.isArray(result.warnings))throw new Error('识别结果不完整，请重试');
          this.aiDraft=result;this.aiChecked=Object.fromEntries(fields.map(k=>[k,result[k]!==null&&result[k]!=='']));
        });
      },
      async applyAIDraft(){
        if(!this.aiDraft || this.aiBusy)return;
        if(!this.plans.length){this.aiError='请先创建学习计划，再录入识别结果';return}
        const planId=this.modal==='record'&&this.$refs.formDialog.open?this.recordForm.plan_id:Number(this.selectedPlan)||this.plans[0].id;
        const plan=this.plans.find(p=>p.id===planId);
        if(!plan){this.aiError='当前计划已不存在，请重新选择学习计划';return}
        const patch={};
        for(const key of fields)if(this.aiChecked[key] && this.aiDraft[key]!==null && this.aiDraft[key]!=='')patch[key]=this.aiDraft[key];
        if(!Object.keys(patch).length){this.aiError='请选择至少一个需要填入的字段';return}
        if(patch.study_date){
          const end=new Date(plan.start_date+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+plan.days-1);
          if(patch.study_date>this.health.today||patch.study_date<plan.start_date||patch.study_date>end.toISOString().slice(0,10)){this.aiError='识别日期不在当前计划范围内或晚于今天，请修改日期，或取消勾选日期字段';return}
        }
        if(patch.minutes!==undefined && (!Number.isInteger(Number(patch.minutes))||Number(patch.minutes)<1||Number(patch.minutes)>720)){this.aiError='学习时长需要是1到720的整数';return}
        if(patch.minutes!==undefined)patch.minutes=Number(patch.minutes);
        this.closeAssistant();
        if(!(this.modal==='record'&&this.$refs.formDialog.open))this.openRecord();
        Object.assign(this.recordForm,patch);this.aiApplied='识别结果已填入，请核对日期、时长与收获后保存。';
      }
    },
    mounted(){try{this.aiServiceUrl=localStorage.getItem('shiguang.ai.service.v1')||''}catch{}}
  };
})(window);
