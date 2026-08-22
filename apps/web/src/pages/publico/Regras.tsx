import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent } from '@ui/index';

export default function Regras() {
  const [conteudo, setConteudo] = useState(''); const [versao, setVersao] = useState('2026.1'); const [erro, setErro] = useState('');
  useEffect(() => { api.get('/publico/regras-convivencia').then(({ data }) => { setConteudo(String(data.conteudo || '')); setVersao(String(data.versao || '2026.1')); }).catch(() => setErro('Não foi possível carregar as regras agora.')); }, []);
  return <div className="bg-[#fffdf9] py-12"><Helmet><title>Regras de Convivência | Excursão das Comitivas</title><meta name="description" content="Leia as Regras de Convivência oficiais da Excursão das Comitivas antes de viajar." /><link rel="canonical" href="https://excursaodascomitivas.com.br/regras" /><meta name="robots" content="index,follow" /></Helmet><div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8"><div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Excursão das Comitivas</p><h1 className="mt-3 text-4xl font-black text-secondary">Regras de Convivência</h1><p className="mt-3 text-gray-600">Mais que uma viagem, uma experiência inesquecível.</p></div>{erro && <p className="mt-8 rounded-lg bg-red-50 p-4 text-red-700">{erro}</p>}<Card className="mt-8"><CardContent className="p-6 sm:p-10"><div className="whitespace-pre-line text-base leading-8 text-gray-700">{conteudo || 'Carregando regras oficiais...'}</div><p className="mt-8 border-t pt-4 text-xs text-gray-500">Versão oficial apresentada para aceite: {versao}.</p></CardContent></Card></div></div>;
}
