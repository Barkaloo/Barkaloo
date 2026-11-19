import {useEffect,useRef,useState} from 'react';
import type {JSONContent} from '@tiptap/react';
import {useApp} from '../context';
import {api} from '../lib/api';
import {dateTime} from '../lib/teaching';
import type {Data,Task,Attempt} from '../types';
import {Empty,ErrorBox,Field,Form,Modal} from '../components/ui';
import BankRichText,{emptyDoc,docText,hasDoc} from '../components/BankRichText';
type Variant={id:string;title:string;items:Record<string,string>;visible:boolean;revision:number};
type Run={started_at:string;id:string;variant_id:string;items:Task[];answers:Record<string,string>;completed_at:string|null;result?:{score:number;items:{task_id:string;status:string}[]}};
type BankData=Data&{bank_tasks?:Task[];variants?:Variant[];exam_runs?:Run[]};
type Editable=Task&{answer:string;solution_doc:JSONContent;ignore_case:boolean;collapse_spaces:boolean};
export default function BankCatalog({route=''}:{route?:string}){
 const {data:raw,teacher,navigate,refresh}=useApp();const data=raw as BankData;
 const [form,setForm]=useState<{number:number;task?:Editable;moduleId:string}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[newVariant,setNewVariant]=useState(false),[title,setTitle]=useState('');
 const tasks=data.bank_tasks??[], variants=data.variants??[];
 const edit=async(number:number,task?:Task)=>{setBusy(true);setError('');try{if(task){const t=await api<Editable>('bank_edit',{id:task.id});setForm({number,task:t,moduleId:t.module_id});}else{const r=await api<{module_id:string}>('bank_prepare');setForm({number,moduleId:r.module_id});}}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const mutate=async(action:string,id:string)=>{setError('');try{await api(action,{id});await refresh();}catch(e){setError((e as Error).message);}};
 if(route.startsWith('run-'))return <ExamRun id={route.slice(4)}/>;
 if(route.startsWith('edit-'))return <VariantEditor id={route.slice(5)}/>;
 if(route.startsWith('variant-')){const id=route.slice(8),v=variants.find(v=>v.id===id);return <><button className="back-link" onClick={()=>navigate('catalog/variants')}>← Варианты КЕГЭ</button><h1>{v?.title??'Вариант КЕГЭ'}</h1><StartExam id={id}/>{(data.exam_runs??[]).filter(r=>r.variant_id===id).map(r=><button className="bank-history" key={r.id} onClick={()=>navigate('catalog/run-'+r.id)}>{dateTime(r.started_at)} · {r.completed_at?'Результат: '+r.result?.score+'/27':'Продолжить прохождение'}</button>)}</>;}
 const number=Number(route),variantTab=route==='variants';
 return <><div className="page-heading"><h1>{number?'Задание №'+number:'Каталог КЕГЭ'}</h1>{teacher&&<button className="btn primary" disabled={busy} onClick={()=>variantTab?setNewVariant(true):void edit(number||1)}>{variantTab?'Добавить вариант':'Добавить задание'}</button>}</div>
 {number?<button className="back-link" onClick={()=>navigate('catalog')}>← Задания №1–27</button>:<div className="tabs catalog-tabs"><button className={!variantTab?'active':''} onClick={()=>navigate('catalog')}>Задания №1–27</button><button className={variantTab?'active':''} onClick={()=>navigate('catalog/variants')}>Варианты КЕГЭ</button></div>}
 {error&&<ErrorBox message={error}/>}
 {variantTab?<div className="bank-variants">{variants.length?variants.map(v=><div className="bank-variant-row" key={v.id}><button onClick={()=>navigate('catalog/'+(teacher&&!v.visible?'edit-':'variant-')+v.id)}>{v.title}</button>{teacher&&<><span className="badge">{v.visible?'Опубликован':'Черновик / скрыт'}</span><button className="btn small" onClick={()=>navigate('catalog/edit-'+v.id)}>Редактировать</button>{v.visible&&<button className="text-btn" onClick={()=>void mutate('variant_hide',v.id)}>Скрыть</button>}<button className="text-btn" onClick={()=>{if(confirm('Удалить вариант из каталога? История сохранится.'))void mutate('variant_delete',v.id);}}>Удалить</button></>}</div>):<Empty title="Вариантов пока нет"/>}{(data.exam_runs??[]).length>0&&<section className="teaching-section"><h2>История прохождений</h2>{(data.exam_runs??[]).map(r=><button className="bank-history" key={r.id} onClick={()=>navigate("catalog/run-"+r.id)}>{dateTime(r.started_at)} · {variants.find(v=>v.id===r.variant_id)?.title??"Вариант КЕГЭ"} · {r.completed_at?"Результат "+r.result?.score+"/27":"Продолжить"}</button>)}</section>}</div>:number?<div className="bank-task-list">{tasks.filter(t=>t.bank_number===number).map(t=><div key={t.id} className="bank-task-entry"><BankPlayer task={t}/>{teacher&&<div className="actions"><button className="text-btn" onClick={()=>void edit(number,t)}>Редактировать</button><button className="text-btn" onClick={()=>{if(confirm('Удалить задание из банка? Назначенные работы и история сохранятся.'))void mutate('bank_delete',t.id);}}>Удалить</button></div>}</div>)}{!tasks.some(t=>t.bank_number===number)&&<Empty title="Заданий пока нет"/>}</div>:<div className="bank-numbers">{Array.from({length:27},(_,i)=>i+1).map(n=><button key={n} onClick={()=>navigate('catalog/'+n)}><strong>Задание №{n}</strong><span>{tasks.filter(t=>t.bank_number===n).length} заданий</span><span>→</span></button>)}</div>}
 {form&&<BankTaskForm {...form} onClose={()=>setForm(null)} onSaved={async()=>{setForm(null);await refresh();}}/>}
 {newVariant&&<Modal title="Новый вариант" onClose={()=>setNewVariant(false)}><Form onSubmit={async()=>{setError('');try{const r=await api<{id:string}>('variant_save',{title,items:{}});await refresh();navigate('catalog/edit-'+r.id);}catch(e){setError((e as Error).message);}}}><Field label="Название варианта"><input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></Field><button className="btn primary">Создать черновик</button>{error&&<ErrorBox message={error}/>}</Form></Modal>}
 </>;
}
function BankTaskForm({number,task,moduleId,onClose,onSaved,lockNumber=false}:{lockNumber?:boolean;number:number;task?:Editable;moduleId:string;onClose:()=>void;onSaved:(id:string)=>void|Promise<void>}){
 const [n,setN]=useState(number),[statement,setStatement]=useState<JSONContent>(task?.statement_doc??emptyDoc),[solution,setSolution]=useState<JSONContent>(task?.solution_doc??emptyDoc),[answer,setAnswer]=useState(task?.answer??''),[type,setType]=useState(task?.type??'text'),[ignore,setIgnore]=useState(task?.ignore_case??false),[spaces,setSpaces]=useState(task?.collapse_spaces??false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [solutionOpen,setSolutionOpen]=useState(task?.has_solution??false);
 const save=async()=>{setBusy(true);setError('');try{const r=await api<{id:string}>('bank_save',{id:task?.id,module_id:moduleId,number:n,type,statement:docText(statement)||'Задание с изображением',statement_doc:statement,solution_doc:solution,has_solution:hasDoc(solution),answer,ignore_case:ignore,collapse_spaces:spaces});await onSaved(r.id);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return (
  <Modal title={task?'Редактировать задание':'Добавить задание'} className="bank-task-modal" onClose={()=>{if(!busy)onClose();}} wide>
   <Form onSubmit={save}>
    <div className="bank-task-fields">
     <div className="bank-task-settings">
      <Field label="Номер ЕГЭ"><select disabled={lockNumber} value={n} onChange={e=>setN(Number(e.target.value))}>{Array.from({length:27},(_,i)=><option key={i+1}>{i+1}</option>)}</select></Field>
      <Field label="Формат ответа"><select value={type} onChange={e=>setType(e.target.value as Task['type'])}><option value="text">Текстовый</option><option value="number">Числовой</option></select></Field>
     </div>
     <section className="bank-form-section">
      <div className="bank-section-heading"><h3>Условие</h3><span>Скриншот можно вставить через Ctrl+V</span></div>
      <BankRichText value={statement} onChange={setStatement} moduleId={moduleId}/>
     </section>
     <section className="bank-form-section bank-answer-section">
      <Field label="Правильный ответ"><input required placeholder={type==='number'?'Например, 42':'Введите точный ответ'} value={answer} onChange={e=>setAnswer(e.target.value)}/></Field>
      {type==='text'&&<div className="bank-answer-options">
       <label><input type="checkbox" checked={ignore} onChange={e=>setIgnore(e.target.checked)}/><span>Не учитывать регистр</span></label>
       <label><input type="checkbox" checked={spaces} onChange={e=>setSpaces(e.target.checked)}/><span>Нормализовать пробелы</span></label>
      </div>}
     </section>
     <details className="bank-solution-section" open={solutionOpen} onToggle={e=>setSolutionOpen(e.currentTarget.open)}>
      <summary className="bank-section-heading"><strong>{solutionOpen?"Решение":"Добавить решение"}</strong><span>Необязательно <span className="bank-disclosure-arrow">⌄</span></span></summary>
      <BankRichText label="Решение" value={solution} onChange={setSolution} moduleId={moduleId}/>
     </details>
     {error&&<ErrorBox message={error}/>}
    </div>
    <div className="modal-actions bank-task-footer">
     <button type="button" className="btn" disabled={busy} onClick={onClose}>Отмена</button>
     <button className="btn primary" disabled={busy||!hasDoc(statement)}>{busy?'Сохранение…':'Сохранить задание'}</button>
    </div>
   </Form>
  </Modal>
 );
}
function BankPlayer({task,run}:{task:Task;run?:Run}){
 const {preview,refresh}=useApp();const [answer,setAnswer]=useState(''),[verdict,setVerdict]=useState(''),[reveal,setReveal]=useState<{answer?:string;solution_doc?:JSONContent}|null>(null),[showAnswer,setShowAnswer]=useState(false),[showSolution,setShowSolution]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);const request=useRef(crypto.randomUUID());
 const show=async(solution:boolean)=>{setError('');try{const r=await api<{answer:string;solution_doc:JSONContent}>(run?'exam_reveal':'bank_reveal',run?{id:run.id,task_id:task.id,part:solution?'solution':'answer'}:{id:task.id,part:solution?'solution':'answer'});setReveal(old=>({...old,...r,solution_doc:r.solution_doc??old?.solution_doc}));if(solution)setShowSolution(v=>!v);else setShowAnswer(v=>!v);}catch(e){setError((e as Error).message);}};
 return <article className="bank-player"><div className="bank-task-meta">№ {task.bank_serial} · Задание {task.bank_number}</div>{task.statement_doc?<BankRichText key={task.id+':'+task.version} readOnly value={task.statement_doc}/>:<p>{task.statement}</p>}{!run&&<Form onSubmit={async()=>{setBusy(true);setError('');try{const a=await api<Attempt>('attempt',{task_id:task.id,version:task.version,answer,preview,request_id:request.current});setVerdict(a.status==='correct'?'Верно':'Неверно');request.current=crypto.randomUUID();await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><div className="bank-answer"><input aria-label="Ответ на задание" required value={answer} onChange={e=>setAnswer(e.target.value)}/><button className="btn" disabled={busy}>Проверить ответ</button><span role="status" className={verdict==='Верно'?'status correct':'status wrong'}>{verdict}</span></div></Form>}<div className="actions"><button className="text-btn" onClick={()=>void show(false)}>Показать ответ</button>{task.has_solution&&<button className="text-btn" onClick={()=>void show(true)}>Показать решение</button>}</div>{showAnswer&&<p>Ответ: <strong>{reveal?.answer}</strong></p>}{showSolution&&reveal?.solution_doc&&<BankRichText readOnly value={reveal.solution_doc}/>} {error&&<ErrorBox message={error}/>}</article>;
}
function VariantEditor({id}:{id:string}){
 const {data:raw,navigate,refresh,notify,setUnsaved}=useApp();const data=raw as BankData,v=data.variants?.find(v=>v.id===id);const [title,setTitle]=useState(v?.title??''),[items,setItems]=useState<Record<string,string>>(v?.items??{}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[form,setForm]=useState<{number:number;moduleId:string}|null>(null);
 useEffect(()=>{setUnsaved(title!==(v?.title??'')||JSON.stringify(items)!==JSON.stringify(v?.items??{}));return()=>setUnsaved(false);},[title,items,v,setUnsaved]);
 const save=async(publish=false)=>{setBusy(true);setError('');try{await api('variant_save',{id,title,items});if(publish)await api('variant_publish',{id});setUnsaved(false);await refresh();notify(publish?'Вариант опубликован':'Черновик сохранён');if(publish)navigate('catalog/variants');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 if(!v)return <Empty title="Вариант недоступен"/>;
 return <><button className="back-link" onClick={()=>navigate('catalog/variants')}>← Варианты КЕГЭ</button><div className="page-heading"><h1>Конструктор варианта</h1><span>{Object.keys(items).length}/27</span></div><Field label="Название варианта"><input maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></Field>{Array.from({length:27},(_,i)=>i+1).map(n=><div className="variant-slot" key={n}><strong>№{n}</strong><select aria-label={'Задание '+n} value={items[n]??''} onChange={e=>setItems(old=>{const next={...old};if(e.target.value)next[n]=e.target.value;else delete next[n];return next;})}><option value="">Не заполнено</option>{data.bank_tasks?.filter(t=>t.bank_number===n).map(t=><option key={t.id} value={t.id}>№{t.bank_serial} · {t.statement.slice(0,70)}</option>)}</select><button className="btn small" onClick={async()=>{try{const r=await api<{module_id:string}>('bank_prepare');setForm({number:n,moduleId:r.module_id});}catch(e){setError((e as Error).message);}}}>Создать задание</button></div>)}{error&&<ErrorBox message={error}/>}<div className="actions"><button className="btn" disabled={busy} onClick={()=>void save()}>Сохранить черновик</button><button className="btn primary" disabled={busy||Object.keys(items).length!==27} onClick={()=>void save(true)}>Опубликовать</button></div>{form&&<BankTaskForm {...form} lockNumber onClose={()=>setForm(null)} onSaved={async taskId=>{setItems(old=>({...old,[form.number]:taskId}));setForm(null);await refresh();}}/>}</>;
}
function StartExam({id}:{id:string}){const {navigate}=useApp();const [error,setError]=useState(''),[busy,setBusy]=useState(false);return <><button className="btn primary" disabled={busy} onClick={async()=>{setBusy(true);try{const r=await api<{id:string}>('exam_start',{id});navigate('catalog/run-'+r.id);}catch(e){setError((e as Error).message);setBusy(false);}}}>Начать прохождение</button>{error&&<ErrorBox message={error}/>}</>;}
function ExamRun({id}:{id:string}){
 const {refresh}=useApp();const [run,setRun]=useState<Run|null>(null),[answers,setAnswers]=useState<Record<string,string>>({}),[error,setError]=useState(''),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false);const queue=useRef(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{api<Run>('exam_get',{id}).then(r=>{setRun(r);setAnswers(r.answers);}).catch(e=>setError(e.message));return()=>{if(timer.current)clearTimeout(timer.current);};},[id]);
 const persist=(next:Record<string,string>)=>{setSaved('Сохранение…');queue.current=queue.current.catch(()=>{}).then(async()=>{await api('exam_save',{id,answers:next});setSaved('Сохранено');}).catch(e=>setError(e.message));};
 if(!run)return <p>{error||'Загрузка…'}</p>;
 const change=(taskId:string,value:string)=>{const next={...answers,[taskId]:value};setAnswers(next);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>persist(next),500);};
 return <><div className="page-heading"><h1>{run.completed_at?'Результат: '+run.result?.score+' / 27':'Вариант КЕГЭ'}</h1><span role="status">{saved}</span></div><nav className="exam-nav" aria-label="Номера варианта">{run.items.map((t,i)=><a key={t.id} className={answers[t.id]?.trim()?'filled':''} href={'#exam-task-'+t.id} onClick={e=>{e.preventDefault();document.getElementById('exam-task-'+t.id)?.scrollIntoView({behavior:'smooth'});}}>{i+1}</a>)}</nav>{run.items.map((t,i)=><section className="bank-task-entry" id={'exam-task-'+t.id} key={t.id}><h3>Задание {i+1}</h3>{run.completed_at?<><p>Ваш ответ: {answers[t.id]||'Не дан'} · {run.result?.items.find(r=>r.task_id===t.id)?.status==='correct'?'Верно':'Ошибка'}</p><BankPlayer task={t} run={run}/></>:<>{t.statement_doc?<BankRichText readOnly value={t.statement_doc}/>:<p>{t.statement}</p>}<Field label={'Ответ '+(i+1)}><input disabled={busy} value={answers[t.id]??''} onChange={e=>change(t.id,e.target.value)} onBlur={()=>{if(timer.current)clearTimeout(timer.current);persist(answers);}}/></Field></>}</section>)}{error&&<ErrorBox message={error}/>}<div className="actions">{!run.completed_at&&<><button className="btn" onClick={()=>persist(answers)}>Сохранить ответы</button><button className="btn primary" disabled={busy} onClick={async()=>{setBusy(true);if(timer.current)clearTimeout(timer.current);try{await queue.current;const r=await api<Run>('exam_finish',{id,answers});setRun(r);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Завершить вариант</button></>}</div></>;
}
