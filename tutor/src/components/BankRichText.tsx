import {useEffect,useState} from 'react';
import {Node,mergeAttributes} from '@tiptap/core';
import {useEditor,EditorContent,NodeViewWrapper,ReactNodeViewRenderer,type NodeViewProps,type JSONContent} from '@tiptap/react';
import {Bold,Italic,List,ImagePlus,Undo2,Redo2,LoaderCircle} from 'lucide-react';
import StarterKit from '@tiptap/starter-kit';
import {supabase,uploadImage} from '../lib/api';
function ImageView({node,editor,updateAttributes,deleteNode,selected}:NodeViewProps){
 const [url,setUrl]=useState('');useEffect(()=>{let alive=true;const get=async()=>{const {data}=await supabase.storage.from('tutor-images').createSignedUrl(node.attrs.path,300);if(alive)setUrl(data?.signedUrl??'');};void get();const timer=setInterval(get,240000);return()=>{alive=false;clearInterval(timer);};},[node.attrs.path]);
 return <NodeViewWrapper className="bank-image" style={{width:node.attrs.width+'%',maxWidth:'100%'}}>{url?<img src={url} alt="Иллюстрация задания"/>:<span>Загрузка изображения…</span>}{editor.isEditable&&selected&&<div contentEditable={false}><input aria-label="Размер изображения" type="range" min="20" max="100" value={node.attrs.width} onChange={e=>updateAttributes({width:Number(e.target.value)})}/><button type="button" onClick={deleteNode}>Удалить изображение</button></div>}</NodeViewWrapper>;
}
const ImageNode=Node.create({name:'bankImage',group:'block',atom:true,addAttributes(){return {path:{default:''},width:{default:80}};},parseHTML(){return [{tag:'img[data-path]'}];},renderHTML({HTMLAttributes}){return ['img',mergeAttributes({'data-path':HTMLAttributes.path},HTMLAttributes)];},addNodeView(){return ReactNodeViewRenderer(ImageView);}});
export const emptyDoc:JSONContent={type:'doc',content:[{type:'paragraph'}]};
export function docText(doc:JSONContent):string{return [doc.text??'',...(doc.content??[]).map(docText)].join(' ').trim();}
export function hasDoc(doc:JSONContent):boolean{return !!docText(doc)||doc.type==='bankImage'||!!doc.content?.some(hasDoc);}
export default function BankRichText({value,onChange,moduleId,label='Условие',readOnly=false}:{value?:JSONContent;onChange?:(v:JSONContent)=>void;moduleId?:string;label?:string;readOnly?:boolean}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const insert=async(file:File)=>{if(!moduleId)return;setBusy(true);setError('');try{const path=await uploadImage(moduleId,file);editor?.chain().focus().insertContent({type:'bankImage',attrs:{path,width:80}}).run();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const editor=useEditor({extensions:[StarterKit,ImageNode],content:value??emptyDoc,editable:!readOnly,immediatelyRender:false,onUpdate:({editor})=>onChange?.(editor.getJSON()),editorProps:{attributes:{class:'rich-content','aria-label':label,'data-placeholder':label==='Решение'?'Опишите ход решения…':'Введите условие задания…'},handlePaste:(_view,event)=>{const image=Array.from(event.clipboardData?.files??[]).find(f=>f.type.startsWith('image/'))??Array.from(event.clipboardData?.items??[]).find(i=>i.type.startsWith('image/'))?.getAsFile();if(image&&!readOnly){event.preventDefault();void insert(image);return true;}return false;}}},[readOnly,moduleId]);
 return (
  <div className={`rich-editor bank-rich-editor ${readOnly ? 'readonly' : ''}`} data-empty={editor?.isEmpty}>
   {!readOnly && <div className="rich-toolbar bank-editor-toolbar" role="toolbar" aria-label={`Форматирование: ${label.toLowerCase()}`}>
    <div className="bank-toolbar-group">
     <button type="button" className="bank-tool" title="Полужирный" aria-label="Полужирный" aria-pressed={editor?.isActive('bold')??false} onClick={()=>editor?.chain().focus().toggleBold().run()}><Bold size={17}/></button>
     <button type="button" className="bank-tool" title="Курсив" aria-label="Курсив" aria-pressed={editor?.isActive('italic')??false} onClick={()=>editor?.chain().focus().toggleItalic().run()}><Italic size={17}/></button>
     <button type="button" className="bank-tool" title="Маркированный список" aria-label="Маркированный список" aria-pressed={editor?.isActive('bulletList')??false} onClick={()=>editor?.chain().focus().toggleBulletList().run()}><List size={17}/></button>
    </div>
    <div className="bank-toolbar-group bank-toolbar-history">
     <button type="button" className="bank-tool" title="Отменить" aria-label="Отменить изменение" disabled={!editor?.can().undo()} onClick={()=>editor?.chain().focus().undo().run()}><Undo2 size={16}/></button>
     <button type="button" className="bank-tool" title="Повторить" aria-label="Повторить изменение" disabled={!editor?.can().redo()} onClick={()=>editor?.chain().focus().redo().run()}><Redo2 size={16}/></button>
    </div>
    <label className="bank-upload" title="Загрузить изображение">
     {busy?<LoaderCircle size={16} className="spin"/>:<ImagePlus size={16}/>}<span>{busy?'Загрузка…':'Изображение'}</span>
     <input type="file" aria-label={`Добавить изображение: ${label.toLowerCase()}`} accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void insert(file);e.target.value='';}}/>
    </label>
   </div>}
   <EditorContent editor={editor}/>
   {error&&<p className="bank-editor-error" role="alert">{error}</p>}
  </div>
 );
}
