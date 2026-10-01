import { useEffect, useState } from 'react';
import { ImagePlus, Pencil, PlaySquare, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { AdminModal } from '../../components/admin/AdminModal';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@ui/index';
import { api } from '../../contexts/AuthContext';

type Evento = { id: string; nome: string };
type Foto = {
  id: string;
  evento_id: string;
  url_foto: string;
  alt_text?: string | null;
  legenda?: string | null;
  categoria?: string | null;
  ordem?: number | null;
  destaque?: boolean;
  capa?: boolean;
};
type Video = {
  id: string;
  evento_id: string;
  url: string;
  youtube_id?: string;
  titulo?: string | null;
  descricao?: string | null;
  ordem?: number | null;
  ativo?: boolean;
  destaque?: boolean;
};
type FotoDraft = Pick<Foto, 'id' | 'alt_text' | 'legenda' | 'categoria' | 'ordem' | 'destaque' | 'capa'> & { url_foto: string };
type VideoDraft = Pick<Video, 'id' | 'url' | 'titulo' | 'descricao' | 'ordem' | 'ativo' | 'destaque'>;

const numeroOrdem = (valor: unknown) => {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 ? numero : 0;
};

export default function Conteudo() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [eventoId, setEventoId] = useState('');
  const [foto, setFoto] = useState({ arquivo: null as File | null, alt_text: '', legenda: '', destaque: false, capa: false, ordem: 0 });
  const [fotoInputKey, setFotoInputKey] = useState(0);
  const [video, setVideo] = useState({ url: '', titulo: '', descricao: '', destaque: false, ativo: true, ordem: 0 });
  const [editandoFoto, setEditandoFoto] = useState<FotoDraft | null>(null);
  const [editandoVideo, setEditandoVideo] = useState<VideoDraft | null>(null);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setErro('');
    try {
      const [eventosResponse, fotosResponse, videosResponse] = await Promise.all([api.get('/eventos'), api.get('/admin/fotos'), api.get('/admin/videos')]);
      const lista = eventosResponse.data.eventos || [];
      setEventos(lista);
      setEventoId((atual) => atual || lista[0]?.id || '');
      setFotos(fotosResponse.data.fotos || []);
      setVideos(videosResponse.data.videos || []);
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível carregar o editor de conteúdo.');
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const salvarFoto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventoId || !foto.arquivo || !foto.alt_text.trim()) return setErro('Selecione o evento, a foto e informe uma descrição acessível.');
    setSalvando(true);
    setErro('');
    setMensagem('');
    try {
      await api.post(`/eventos/${eventoId}/fotos`, foto.arquivo, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(foto.arquivo.name),
          'X-File-Mime': foto.arquivo.type,
          'X-File-Caption': encodeURIComponent(foto.legenda.trim()),
          'X-File-Alt': encodeURIComponent(foto.alt_text.trim()),
          'X-File-Order': String(numeroOrdem(foto.ordem)),
          'X-File-Featured': String(foto.destaque),
          'X-File-Cover': String(foto.capa),
        },
      });
      setFoto({ arquivo: null, alt_text: '', legenda: '', destaque: false, capa: false, ordem: 0 });
      setFotoInputKey((atual) => atual + 1);
      setMensagem('Foto adicionada à galeria. Para aparecer na home, marque-a como destaque.');
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível salvar a foto.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarVideo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventoId || !video.url.trim()) return setErro('Selecione o evento e informe a URL do YouTube.');
    setSalvando(true);
    setErro('');
    setMensagem('');
    try {
      await api.post('/admin/videos', { evento_id: eventoId, ...video, ordem: numeroOrdem(video.ordem) });
      setVideo({ url: '', titulo: '', descricao: '', destaque: false, ativo: true, ordem: 0 });
      setMensagem('Vídeo adicionado ao conteúdo público.');
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível salvar o vídeo.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarEdicaoFoto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editandoFoto || !editandoFoto.alt_text?.trim()) return setErro('O texto alternativo é obrigatório.');
    setSalvando(true);
    setErro('');
    try {
      await api.patch(`/admin/fotos/${editandoFoto.id}`, { ...editandoFoto, ordem: numeroOrdem(editandoFoto.ordem) });
      setEditandoFoto(null);
      setMensagem('Metadados da foto atualizados.');
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível atualizar a foto.');
    } finally {
      setSalvando(false);
    }
  };

  const salvarEdicaoVideo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editandoVideo || !editandoVideo.url.trim()) return setErro('Informe a URL do YouTube.');
    setSalvando(true);
    setErro('');
    try {
      await api.patch(`/admin/videos/${editandoVideo.id}`, { ...editandoVideo, ordem: numeroOrdem(editandoVideo.ordem) });
      setEditandoVideo(null);
      setMensagem('Vídeo atualizado.');
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível atualizar o vídeo.');
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (tipo: 'fotos' | 'videos', id: string, eventoDaFoto?: string) => {
    if (!confirm('Remover este conteúdo do site?')) return;
    setErro('');
    try {
      await api.delete(tipo === 'fotos' && eventoDaFoto ? `/eventos/${eventoDaFoto}/fotos/${id}` : `/admin/${tipo}/${id}`);
      setMensagem('Conteúdo removido.');
      await carregar();
    } catch (err: any) {
      setErro(err.response?.data?.erro || 'Não foi possível remover o conteúdo.');
    }
  };

  const nomeEvento = (id: string) => eventos.find((item) => item.id === id)?.nome || 'Evento não identificado';
  const checkbox = (label: string, checked: boolean, onChange: (valor: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#851F32] focus:ring-[#851F32]" />
      {label}
    </label>
  );

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Editor do site</p>
          <h1 className="admin-title">Galeria e vídeos</h1>
          <p className="admin-subtitle">Alimente e organize o conteúdo público por evento, sem editar código ou fazer novo deploy.</p>
        </div>
        <Button variant="outline" onClick={() => void carregar()}>
          <RefreshCw size={16} className="mr-2" />
          Atualizar
        </Button>
      </div>
      {erro && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
      {mensagem && <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">{mensagem}</div>}
      <Card>
        <CardHeader><CardTitle>Evento do conteúdo</CardTitle></CardHeader>
        <CardContent>
          <select value={eventoId} onChange={(event) => setEventoId(event.target.value)} className="admin-field max-w-2xl">
            <option value="">Selecione uma excursão</option>
            {eventos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
          </select>
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ImagePlus size={19} />Adicionar foto</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={salvarFoto} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="conteudo-foto">Foto do dispositivo</label>
                <input key={fotoInputKey} id="conteudo-foto" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFoto({ ...foto, arquivo: e.target.files?.[0] || null })} className="block h-11 w-full rounded-xl border border-slate-200 bg-white text-sm file:mr-3 file:h-full file:border-0 file:bg-[#fff0eb] file:px-4 file:font-bold file:text-[#C94F38] hover:file:bg-[#ffe5dc]" />
              </div>
              <Input label="Texto alternativo" value={foto.alt_text} onChange={(e) => setFoto({ ...foto, alt_text: e.target.value })} placeholder="Descrição acessível da imagem" />
              <Input label="Legenda" value={foto.legenda} onChange={(e) => setFoto({ ...foto, legenda: e.target.value })} />
              <Input label="Ordem" type="number" min="0" value={foto.ordem} onChange={(e) => setFoto({ ...foto, ordem: numeroOrdem(e.target.value) })} />
              <div className="flex flex-wrap gap-4">{checkbox('Usar na galeria principal da home', foto.destaque, (valor) => setFoto({ ...foto, destaque: valor }))}{checkbox('Usar como capa da excursão', foto.capa, (valor) => setFoto({ ...foto, capa: valor }))}</div>
              <Button type="submit" disabled={salvando || !eventoId}>Anexar foto</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><PlaySquare size={19} />Adicionar vídeo do YouTube</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={salvarVideo} className="space-y-3">
              <Input label="URL do YouTube" value={video.url} onChange={(e) => setVideo({ ...video, url: e.target.value })} placeholder="https://www.youtube.com/watch?v=..." />
              <Input label="Título" value={video.titulo} onChange={(e) => setVideo({ ...video, titulo: e.target.value })} />
              <Input label="Descrição" value={video.descricao} onChange={(e) => setVideo({ ...video, descricao: e.target.value })} />
              <Input label="Ordem" type="number" min="0" value={video.ordem} onChange={(e) => setVideo({ ...video, ordem: numeroOrdem(e.target.value) })} />
              <div className="flex flex-wrap gap-4">{checkbox('Publicar na home', video.ativo, (valor) => setVideo({ ...video, ativo: valor }))}{checkbox('Marcar como destaque', video.destaque, (valor) => setVideo({ ...video, destaque: valor }))}</div>
              <Button type="submit" disabled={salvando || !eventoId}>Salvar vídeo</Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Conteúdo publicado</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {fotos.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <img src={item.url_foto} alt={item.alt_text || item.legenda || 'Foto da excursão'} className="h-40 w-full object-cover" />
                <div className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-primary">{nomeEvento(item.evento_id)}</p>{item.destaque && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">Destaque home</span>}{item.capa && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800">Capa</span>}</div>
                  <p className="text-sm text-gray-600">{item.legenda || item.alt_text}</p>
                  <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setEditandoFoto({ id: item.id, url_foto: item.url_foto, alt_text: item.alt_text || '', legenda: item.legenda || '', categoria: item.categoria || 'evento', ordem: item.ordem || 0, destaque: Boolean(item.destaque), capa: Boolean(item.capa) })}><Pencil size={14} className="mr-1" />Editar</Button><Button type="button" variant="outline" onClick={() => void remover('fotos', item.id, item.evento_id)}><Trash2 size={14} className="mr-1" />Remover</Button></div>
                </div>
              </article>
            ))}
            {videos.map((item) => (
              <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-primary">{nomeEvento(item.evento_id)}</p>{item.ativo === false && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">Oculto</span>}{item.destaque && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">Destaque</span>}</div>
                <p className="mt-2 font-semibold">{item.titulo || 'Vídeo da excursão'}</p>
                <a className="mt-1 block break-all text-xs text-blue-700 underline" href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
                <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setEditandoVideo({ id: item.id, url: item.url, titulo: item.titulo || '', descricao: item.descricao || '', ordem: item.ordem || 0, ativo: item.ativo !== false, destaque: Boolean(item.destaque) })}><Pencil size={14} className="mr-1" />Editar</Button><Button type="button" variant="outline" onClick={() => void remover('videos', item.id)}><Trash2 size={14} className="mr-1" />Remover</Button></div>
              </article>
            ))}
            {fotos.length === 0 && videos.length === 0 && <p className="text-sm text-gray-500">Nenhum conteúdo editorial cadastrado.</p>}
          </div>
        </CardContent>
      </Card>

      <AdminModal aberto={Boolean(editandoFoto)} titulo="Editar foto" descricao="Atualize a apresentação da imagem sem reenviar o arquivo." fechar={() => setEditandoFoto(null)}>
        {editandoFoto && <form onSubmit={salvarEdicaoFoto} className="space-y-4">
          <img src={editandoFoto.url_foto} alt={editandoFoto.alt_text || ''} className="max-h-56 w-full rounded-xl bg-slate-100 object-contain" />
          <Input label="Texto alternativo" value={editandoFoto.alt_text || ''} onChange={(e) => setEditandoFoto({ ...editandoFoto, alt_text: e.target.value })} />
          <Input label="Legenda" value={editandoFoto.legenda || ''} onChange={(e) => setEditandoFoto({ ...editandoFoto, legenda: e.target.value })} />
          <Input label="Categoria" value={editandoFoto.categoria || ''} onChange={(e) => setEditandoFoto({ ...editandoFoto, categoria: e.target.value })} />
          <Input label="Ordem" type="number" min="0" value={editandoFoto.ordem || 0} onChange={(e) => setEditandoFoto({ ...editandoFoto, ordem: numeroOrdem(e.target.value) })} />
          <div className="flex flex-wrap gap-4">{checkbox('Usar na galeria principal da home', Boolean(editandoFoto.destaque), (valor) => setEditandoFoto({ ...editandoFoto, destaque: valor }))}{checkbox('Usar como capa da excursão', Boolean(editandoFoto.capa), (valor) => setEditandoFoto({ ...editandoFoto, capa: valor }))}</div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditandoFoto(null)}><X size={14} className="mr-1" />Cancelar</Button><Button type="submit" disabled={salvando}><Save size={14} className="mr-1" />Salvar alterações</Button></div>
        </form>}
      </AdminModal>

      <AdminModal aberto={Boolean(editandoVideo)} titulo="Editar vídeo" descricao="Atualize URL, título, visibilidade e posição do vídeo." fechar={() => setEditandoVideo(null)}>
        {editandoVideo && <form onSubmit={salvarEdicaoVideo} className="space-y-4">
          <Input label="URL do YouTube" value={editandoVideo.url} onChange={(e) => setEditandoVideo({ ...editandoVideo, url: e.target.value })} />
          <Input label="Título" value={editandoVideo.titulo || ''} onChange={(e) => setEditandoVideo({ ...editandoVideo, titulo: e.target.value })} />
          <Input label="Descrição" value={editandoVideo.descricao || ''} onChange={(e) => setEditandoVideo({ ...editandoVideo, descricao: e.target.value })} />
          <Input label="Ordem" type="number" min="0" value={editandoVideo.ordem || 0} onChange={(e) => setEditandoVideo({ ...editandoVideo, ordem: numeroOrdem(e.target.value) })} />
          <div className="flex flex-wrap gap-4">{checkbox('Publicar na home', editandoVideo.ativo !== false, (valor) => setEditandoVideo({ ...editandoVideo, ativo: valor }))}{checkbox('Marcar como destaque', Boolean(editandoVideo.destaque), (valor) => setEditandoVideo({ ...editandoVideo, destaque: valor }))}</div>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditandoVideo(null)}><X size={14} className="mr-1" />Cancelar</Button><Button type="submit" disabled={salvando}><Save size={14} className="mr-1" />Salvar alterações</Button></div>
        </form>}
      </AdminModal>
    </div>
  );
}
