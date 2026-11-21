import { useCallback, useEffect, useState } from 'react';
import { Plus, Download, ExternalLink, Archive, FileText, Play, Copy, Code2 } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import { useApp } from '../context';
import { supabase, videoEmbed } from '../lib/api';
import { theoryAccept, theoryFile, type TheoryMaterial } from '../lib/theory';
import { Busy, Empty, ErrorBox, Field, Modal } from '../components/ui';

const logicalOperators = [
  ['¬', 'Отрицание', 'not A'],
  ['∧', 'Конъюнкция', 'A and B'],
  ['∨', 'Дизъюнкция', 'A or B'],
  ['→', 'Импликация', 'A <= B'],
  ['≡', 'Эквиваленция', 'A == B'],
] as const;

const pythonTemplate = `print('x y z w')
for x in 0, 1:
    for y in 0, 1:
        for z in 0, 1:
            for w in 0, 1:
                f = ... # вставь функцию сюда

                if f == 1: # если в таблице F = 1 (замени 1 на 0, если F = 0)
                    print(x, y, z, w)`;

const pythonGrammar = Prism.languages.python;
const highlightedTemplate = Prism.highlight(pythonTemplate, {
  ...pythonGrammar,
  keyword: [{ pattern: /\bprint(?=\s*\()/, alias: 'builtin' }, pythonGrammar.keyword as RegExp],
}, 'python');

function LogicalOperators() {
  const { notify } = useApp();
  const [copyError, setCopyError] = useState(false);

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(pythonTemplate);
      setCopyError(false);
      notify('Шаблон скопирован');
    } catch {
      setCopyError(true);
    }
  };

  return (
    <section className="theory-logical-operators" aria-labelledby="logical-operators-title">
      <h2 id="logical-operators-title">Логические операторы</h2>
      <div className="theory-table-frame">
        <table aria-labelledby="logical-operators-title">
          <thead>
            <tr>
              <th scope="col">В математике</th>
              <th scope="col">Название</th>
              <th scope="col">В Python</th>
            </tr>
          </thead>
          <tbody>
            {logicalOperators.map(([symbol, name, example]) => (
              <tr key={symbol}>
                <td className="theory-operator-symbol">{symbol}</td>
                <th scope="row">{name}</th>
                <td><code>{example}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="code-block theory-python-template">
        <div>
          <span className="theory-python-label"><Code2 size={16} aria-hidden="true" />Python</span>
          <button className="btn small" type="button" onClick={() => void copyTemplate()}>
            <Copy size={15} aria-hidden="true" />Скопировать
          </button>
        </div>
        <pre tabIndex={0} aria-label="Шаблон кода на Python"><code dangerouslySetInnerHTML={{ __html: highlightedTemplate }} /></pre>
      </div>
      {copyError && <ErrorBox message="Не удалось скопировать. Выделите код и скопируйте вручную." />}
    </section>
  );
}

export default function Theory() {
  const { data, teacher, notify } = useApp();
  const [section, setSection] = useState(data.sections[0]?.id ?? '');
  const [materials, setMaterials] = useState<TheoryMaterial[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [adding, setAdding] = useState(false), [view, setView] = useState<TheoryMaterial | null>(null);
  const reload = useCallback(async () => {
    const { data: rows, error } = await supabase.from('tutor_theory_materials').select('*')
      .eq('archived', false).order('created_at', { ascending: false });
    if (error) throw Error(error.message);
    setMaterials(rows ?? []);
  }, []);
  useEffect(() => {
    let alive = true;
    const update = async () => {
      try { await reload(); if (alive) setError(''); }
      catch (e) { if (alive) setError((e as Error).message); }
      finally { if (alive) setLoading(false); }
    };
    void update();
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) void update(); }, 15000);
    window.addEventListener('focus', update);
    return () => { alive = false; clearInterval(poll); window.removeEventListener('focus', update); };
  }, [reload]);
  const download = async (m: TheoryMaterial) => {
    try {
      const { data, error } = await supabase.storage.from('tutor-theory').download(m.path!);
      if (error) throw error;
      const link = document.createElement('a');
      const url = URL.createObjectURL(data);
      link.href = url; link.download = m.filename!; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message); }
  };
  const archive = async (m: TheoryMaterial) => {
    const { error } = await supabase.from('tutor_theory_materials').update({ archived: true }).eq('id', m.id);
    if (error) { setError(error.message); return; }
    await reload(); notify('Материал убран из раздела');
  };
  const rows = materials.filter((m) => m.section_id === section);
  const showLogicalOperators = data.sections.some((s) => s.id === section && s.number === 2);
  return <>
    <div className="page-heading">
      <h1>Теоретический материал</h1>
      {teacher && <button className="btn primary" disabled={!section} onClick={() => setAdding(true)}><Plus size={16} />Добавить материал</button>}
    </div>
    <div className="filter-bar"><select aria-label="Номер задания" value={section} onChange={(e) => setSection(e.target.value)}>
      {data.sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
    </select></div>
    {showLogicalOperators && <LogicalOperators />}
    {error && <ErrorBox message={error} />}
    {loading ? <Busy /> : rows.length ? <div className="theory-list">
      {rows.map((m) => <article className="theory-row" key={m.id}>
        <span className="avatar">{m.video_url || m.mime_type?.startsWith('video/') ? <Play size={17} /> : <FileText size={17} />}</span>
        <div className="theory-description"><h2>{m.title}</h2>{m.description && <p>{m.description}</p>}
          {m.filename && <small>{m.filename}</small>}</div>
        <div className="actions">
          <button className="btn small" onClick={() => setView(m)}>Открыть</button>
          {m.path && <button className="icon-btn" aria-label={`Скачать ${m.title}`} title="Скачать" onClick={() => void download(m)}><Download size={18} /></button>}
          {teacher && m.owner_id === data.profile.user_id && <button className="icon-btn" aria-label={`Убрать ${m.title}`} title="Убрать из раздела" onClick={() => void archive(m).catch((e) => setError(e.message))}><Archive size={17} /></button>}
        </div>
      </article>)}
    </div> : !showLogicalOperators && !error && <Empty title="Материалов пока нет">{teacher ? 'Добавьте файлы или медиа к выбранному заданию.' : 'Здесь появятся материалы вашего преподавателя.'}</Empty>}
    {adding && <AddMaterial section={section} onClose={() => setAdding(false)} onSaved={reload} />}
    {view && <MaterialView material={view} onClose={() => setView(null)} onDownload={() => void download(view)} />}
  </>;
}

function AddMaterial({ section, onClose, onSaved }: { section: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { data } = useApp();
  const [title, setTitle] = useState(''), [description, setDescription] = useState('');
  const [mode, setMode] = useState('file'), [url, setUrl] = useState(''), [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    let uploaded: string | undefined, committed = false;
    try {
      const id = crypto.randomUUID();
      const row: Record<string, unknown> = { id, owner_id: data.profile.user_id, section_id: section, title: title.trim(), description };
      if (mode === 'file') {
        if (!file) throw Error('Выберите файл.');
        const { ext, mime } = await theoryFile(file);
        uploaded = `${data.profile.user_id}/${id}/${crypto.randomUUID()}.${ext}`;
        const upload = await supabase.storage.from('tutor-theory').upload(uploaded, file, { contentType: mime, upsert: false });
        if (upload.error) { uploaded = undefined; throw upload.error; }
        Object.assign(row, { path: uploaded, filename: file.name.slice(0, 200), mime_type: mime });
      } else {
        if (!/^https:\/\/(www\.)?(youtube\.com\/watch\?|youtu\.be\/|vimeo\.com\/)/.test(url) || !videoEmbed(url)?.embed) throw Error('Укажите ссылку на видео YouTube или Vimeo.');
        row.video_url = url;
      }
      const { error } = await supabase.from('tutor_theory_materials').insert(row);
      if (error) throw error;
      committed = true;
      await onSaved(); onClose();
    } catch (e) {
      if (uploaded && !committed) await supabase.storage.from('tutor-theory').remove([uploaded]);
      setError((e as Error).message);
    } finally { setBusy(false); }
  };
  return <Modal title="Добавить материал" onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Field label="Название"><input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Описание"><textarea rows={2} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Тип материала"><select value={mode} disabled={busy} onChange={(e) => setMode(e.target.value)}><option value="file">Файл или медиа</option><option value="video">Ссылка на видео</option></select></Field>
      {mode === 'file' ? <Field label="Файл" hint="До 50 МБ. PDF, документы Office, TXT, CSV, Python, ZIP, изображения, видео и аудио."><input type="file" required accept={theoryAccept} disabled={busy} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }} /></Field> : <Field label="Ссылка на YouTube или Vimeo"><input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} /></Field>}
      {error && <ErrorBox message={error} />}
      <div className="modal-actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Отмена</button><button className="btn primary" disabled={busy || !title.trim()}>{busy ? 'Загрузка…' : 'Добавить'}</button></div>
    </form>
  </Modal>;
}
function MaterialView({ material: m, onClose, onDownload }: { material: TheoryMaterial; onClose: () => void; onDownload: () => void }) {
  const [url, setUrl] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    if (m.path) void supabase.storage.from('tutor-theory').createSignedUrl(m.path, 3600).then(({ data, error }) => { if (alive) { if (error) setError(error.message); else setUrl(data.signedUrl); } });
    return () => { alive = false; };
  }, [m.path]);
  const embed = m.video_url ? videoEmbed(m.video_url)?.embed : undefined;
  return <Modal title={m.title} onClose={onClose} wide>
    {m.description && <p className="private-note">{m.description}</p>}
    {error && <ErrorBox message={error} />}
    {embed && <div className="video-frame"><iframe src={embed} title={m.title} allowFullScreen referrerPolicy="no-referrer" /></div>}
    {m.path && !url && !error && <Busy />}
    {url && (m.mime_type?.startsWith('image/') ? <figure><img src={url} alt={m.title} /></figure> : m.mime_type?.startsWith('video/') ? <video src={url} controls preload="metadata" /> : m.mime_type?.startsWith('audio/') ? <audio src={url} controls preload="metadata" /> : <a className="btn" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Открыть файл</a>)}
    {m.path && <div className="modal-actions"><button className="btn primary" onClick={onDownload}><Download size={16} />Скачать файл</button></div>}
  </Modal>;
}
