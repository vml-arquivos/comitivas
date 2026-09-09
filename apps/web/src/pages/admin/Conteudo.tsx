import { useEffect, useState } from 'react';
import { ImagePlus, PlaySquare, RefreshCw, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';
import { api } from '../../contexts/AuthContext';

type Evento = { id: string; nome: string };
type Foto = { id: string; evento_id: string; url_foto: string; alt_text?: string; legenda?: string | null };
type Video = { id: string; evento_id: string; url: string; titulo?: string | null };

export default function Conteudo() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [eventoId, setEventoId] = useState('');
  const [foto, setFoto] = useState<{ arquivo: File | null; alt_text: string; legenda: string }>({ arquivo: null, alt_text: '', legenda: '' });
  const [fotoInputKey, setFotoInputKey] = useState(0);
  const [video, setVideo] = useState({ url: '', titulo: '', descricao: '' });
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setErro('');
    try {
      const [eventosResponse, fotosResponse, videosResponse] = await Promise.all([
        api.get('/eventos'), api.get('/admin/fotos'), api.get('/admin/videos'),
      ]);
      const lista = eventosResponse.data.eventos || [];
      setEventos(lista);
      setEventoId((atual) => atual || lista[0]?.id || '');
      setFotos(fotosResponse.data.fotos || []);
      setVideos(videosResponse.data.videos || []);
    } catch (err: any) { setErro(err.response?.data?.erro || 'Não foi possível carregar o editor de conteúdo.'); }
  };
  useEffect(() => { void carregar(); }, []);

  const salvarFoto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventoId || !foto.arquivo || !foto.alt_text) return setErro('Selecione o evento, a foto e informe uma descrição acessível.');
    setSalvando(true); setErro('');
    try {
      await api.post(`/eventos/${eventoId}/fotos`, foto.arquivo, { headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(foto.arquivo.name), 'X-File-Mime': foto.arquivo.type, 'X-File-Caption': encodeURIComponent(foto.legenda.trim()), 'X-File-Alt': encodeURIComponent(foto.alt_text.trim()) } });
      setFoto({ arquivo: null, alt_text: '', legenda: '' }); setFotoInputKey((atual) => atual + 1); setMensagem('Foto adicionada à galeria.'); await carregar();
    }
    catch (err: any) { setErro(err.response?.data?.erro || 'Não foi possível salvar a foto.'); }
    finally { setSalvando(false); }
  };
  const salvarVideo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventoId || !video.url) return setErro('Selecione o evento e informe a URL do YouTube.');
    setSalvando(true); setErro('');
    try { await api.post('/admin/videos', { evento_id: eventoId, ...video }); setVideo({ url: '', titulo: '', descricao: '' }); setMensagem('Vídeo adicionado ao conteúdo público.'); await carregar(); }
    catch (err: any) { setErro(err.response?.data?.erro || 'Não foi possível salvar o vídeo.'); }
    finally { setSalvando(false); }
  };
  const remover = async (tipo: 'fotos' | 'videos', id: string, eventoDaFoto?: string) => {
    if (!confirm('Remover este conteúdo do site?')) return;
    try { await api.delete(tipo === 'fotos' && eventoDaFoto ? `/eventos/${eventoDaFoto}/fotos/${id}` : `/admin/${tipo}/${id}`); await carregar(); } catch (err: any) { setErro(err.response?.data?.erro || 'Não foi possível remover o conteúdo.'); }
  };
  const nomeEvento = (id: string) => eventos.find((item) => item.id === id)?.nome || 'Evento não identificado';

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-primary">Editor do site</p><h1 className="text-3xl font-bold text-gray-900">Galeria e vídeos</h1><p className="mt-1 text-sm text-gray-600">Alimente o conteúdo público por evento, sem editar código ou fazer novo deploy.</p></div><Button variant="outline" onClick={() => void carregar()}><RefreshCw size={16} className="mr-2" />Atualizar</Button></div>
    {erro && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{erro}</div>}{mensagem && <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">{mensagem}</div>}
    <Card><CardHeader><CardTitle>Evento do conteúdo</CardTitle></CardHeader><CardContent><select value={eventoId} onChange={(event) => setEventoId(event.target.value)} className="h-10 w-full max-w-2xl rounded-md border border-gray-300 bg-white px-3 text-sm"><option value="">Selecione uma excursão</option>{eventos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></CardContent></Card>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ImagePlus size={19} />Adicionar foto</CardTitle></CardHeader><CardContent><form onSubmit={salvarFoto} className="space-y-3"><div><label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="conteudo-foto">Foto do dispositivo</label><input key={fotoInputKey} id="conteudo-foto" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFoto({ ...foto, arquivo: e.target.files?.[0] || null })} className="block h-10 w-full rounded-md border border-gray-300 bg-white text-sm file:mr-3 file:h-full file:border-0 file:bg-gray-100 file:px-4 file:font-semibold" /></div><Input label="Texto alternativo" value={foto.alt_text} onChange={(e) => setFoto({ ...foto, alt_text: e.target.value })} placeholder="Descrição acessível da imagem" /><Input label="Legenda" value={foto.legenda} onChange={(e) => setFoto({ ...foto, legenda: e.target.value })} /><Button type="submit" disabled={salvando || !eventoId}>Anexar foto</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><PlaySquare size={19} />Adicionar vídeo do YouTube</CardTitle></CardHeader><CardContent><form onSubmit={salvarVideo} className="space-y-3"><Input label="URL do YouTube" value={video.url} onChange={(e) => setVideo({ ...video, url: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." /><Input label="Título" value={video.titulo} onChange={(e) => setVideo({ ...video, titulo: e.target.value })} /><Input label="Descrição" value={video.descricao} onChange={(e) => setVideo({ ...video, descricao: e.target.value })} /><Button type="submit" disabled={salvando || !eventoId}>Salvar vídeo</Button></form></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Conteúdo publicado</CardTitle></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-2">{fotos.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border border-gray-200"><img src={item.url_foto} alt={item.alt_text || item.legenda || 'Foto da excursão'} className="h-40 w-full object-cover" /><div className="space-y-2 p-3"><p className="text-xs font-semibold text-primary">{nomeEvento(item.evento_id)}</p><p className="text-sm text-gray-600">{item.legenda || item.alt_text}</p><Button type="button" variant="outline" onClick={() => void remover('fotos', item.id, item.evento_id)}><Trash2 size={14} className="mr-1" />Remover</Button></div></article>)}{videos.map((item) => <article key={item.id} className="rounded-xl border border-gray-200 p-4"><p className="text-xs font-semibold text-primary">{nomeEvento(item.evento_id)}</p><p className="mt-2 font-semibold">{item.titulo || 'Vídeo da excursão'}</p><a className="mt-1 block break-all text-xs text-blue-700 underline" href={item.url} target="_blank" rel="noreferrer">{item.url}</a><Button type="button" variant="outline" className="mt-3" onClick={() => void remover('videos', item.id)}><Trash2 size={14} className="mr-1" />Remover</Button></article>)}{fotos.length === 0 && videos.length === 0 && <p className="text-sm text-gray-500">Nenhum conteúdo editorial cadastrado.</p>}</div></CardContent></Card>
  </div>;
}
