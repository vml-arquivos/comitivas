import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { api } from '../../contexts/AuthContext';
import { Card, CardContent } from '@ui/index';

export default function Regras() {
  const [conteudo, setConteudo] = useState('');
  const [versao, setVersao] = useState('2026.1');
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.get('/publico/regras-convivencia')
      .then(({ data }) => {
        setConteudo(String(data.conteudo || ''));
        setVersao(String(data.versao || '2026.1'));
      })
      .catch(() => setErro('Não foi possível carregar as regras agora.'));
  }, []);

  return (
    <div className="min-h-screen bg-[#fffdf9] py-14 sm:py-20">
      <Helmet>
        <title>Regras de Convivência | Excursão das Comitivas</title>
        <meta name="description" content="Leia as Regras de Convivência oficiais da Excursão das Comitivas antes de viajar." />
        <link rel="canonical" href="https://excursaodascomitivas.com.br/regras" />
        <meta name="robots" content="index,follow" />
      </Helmet>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Excursão das Comitivas · desde 2015</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-secondary sm:text-5xl">Regras de Convivência</h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">Mais que uma viagem, uma experiência inesquecível. O cuidado de cada integrante transforma a comitiva em uma família.</p>
        </div>

        {erro && <p className="mx-auto mt-8 max-w-3xl rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{erro}</p>}

        <div className="mt-12 grid items-start gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <Card className="overflow-hidden border-0 bg-secondary shadow-2xl shadow-secondary/15">
            <CardContent className="p-3 sm:p-5">
              <img
                src="/images/oficiais/regras-convivencia-2026.jpg"
                alt="Cartaz oficial Regras de Convivência da Excursão das Comitivas, com onze orientações sobre respeito, limpeza, pontualidade, pertences, brigas, drogas, barulho, bebida, cuidado com o próximo, limites e orientações da equipe."
                className="h-auto w-full rounded-xl object-contain"
                width="1122"
                height="1402"
              />
              <p className="px-2 pb-1 pt-4 text-center text-xs leading-relaxed text-white/70">Fonte visual oficial da organização · versão {versao}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-xl shadow-slate-900/5">
            <CardContent className="p-6 sm:p-10">
              <div className="mb-7 rounded-2xl border border-primary/15 bg-primary/5 p-5">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">Leitura acessível</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">A transcrição abaixo é equivalente ao cartaz e mantém o mesmo conteúdo para quem utiliza leitor de tela, zoom ou conexão limitada.</p>
              </div>
              <div className="whitespace-pre-line text-base leading-8 text-slate-700">{conteudo || 'Carregando regras oficiais...'}</div>
              <p className="mt-8 border-t border-slate-200 pt-5 text-xs leading-relaxed text-slate-500">Versão oficial apresentada para aceite: {versao}. As regras integram a experiência da excursão e devem ser lidas antes da contratação.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
