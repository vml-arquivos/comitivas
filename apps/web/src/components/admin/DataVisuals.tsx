import { useId } from 'react';

export type ChartPoint = { label: string; value: number };

export function LineTrend({ dados, formatar = (valor) => String(valor) }: { dados: ChartPoint[]; formatar?: (valor: number) => string }) {
  const id = useId().replace(/:/g, '');
  const largura = 680;
  const altura = 220;
  const margemX = 24;
  const margemY = 24;
  const maximo = Math.max(1, ...dados.map((item) => item.value));
  const pontos = dados.map((item, indice) => ({
    ...item,
    x: margemX + (indice * (largura - margemX * 2)) / Math.max(1, dados.length - 1),
    y: altura - margemY - (item.value / maximo) * (altura - margemY * 2),
  }));
  const linha = pontos.map((item) => `${item.x},${item.y}`).join(' ');
  const area = pontos.length ? `${margemX},${altura - margemY} ${linha} ${pontos[pontos.length - 1].x},${altura - margemY}` : '';

  if (!dados.length) return <div className="grid h-56 place-items-center text-sm text-slate-400">Ainda não há vendas no período.</div>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
        <span>0</span><span>{formatar(maximo)}</span>
      </div>
      <svg viewBox={`0 0 ${largura} ${altura}`} className="h-56 w-full overflow-hidden" role="img" aria-label="Evolução das vendas no período">
        <defs>
          <linearGradient id={`chart-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#176477" stopOpacity=".24" />
            <stop offset="1" stopColor="#176477" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((linhaGrade) => {
          const y = margemY + (linhaGrade * (altura - margemY * 2)) / 4;
          return <line key={linhaGrade} x1={margemX} x2={largura - margemX} y1={y} y2={y} stroke="#e7ecec" strokeWidth="1" />;
        })}
        <polygon points={area} fill={`url(#chart-${id})`} />
        <polyline points={linha} fill="none" stroke="#073F50" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {pontos.map((item, indice) => (
          <circle key={`${item.label}-${indice}`} cx={item.x} cy={item.y} r="4" fill="#fff" stroke="#DF6248" strokeWidth="3">
            <title>{item.label}: {formatar(item.value)}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[11px] font-semibold text-slate-400">
        <span>{dados[0]?.label}</span>
        {dados.length > 2 && <span>{dados[Math.floor(dados.length / 2)]?.label}</span>}
        <span>{dados[dados.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function FunnelChart({ etapas }: { etapas: Array<{ label: string; value: number }> }) {
  const maior = Math.max(1, ...etapas.map((etapa) => etapa.value));
  const cores = ['#073F50', '#437E8E', '#83AEB7', '#B8CED0', '#DF6248'];
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(120px,180px)_1fr] sm:items-center">
      <div className="flex flex-col items-center gap-1" aria-label="Funil de conversão">
        {etapas.map((etapa, indice) => (
          <div
            key={etapa.label}
            className="h-9 min-w-12 rounded-[5px]"
            style={{ width: `${Math.max(28, (etapa.value / maior) * 100)}%`, backgroundColor: cores[indice % cores.length] }}
            title={`${etapa.label}: ${etapa.value}`}
          />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {etapas.map((etapa, indice) => (
          <div key={etapa.label} className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="text-slate-600">{etapa.label}</span>
            <div className="text-right">
              <strong className="text-[#073F50]">{etapa.value}</strong>
              {indice > 0 && <span className="ml-2 text-xs text-slate-400">{maior ? Math.round((etapa.value / maior) * 100) : 0}%</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HorizontalBars({ itens }: { itens: Array<{ label: string; value: number; detail?: string }> }) {
  const maximo = Math.max(1, ...itens.map((item) => item.value));
  if (!itens.length) return <div className="grid min-h-44 place-items-center text-sm text-slate-400">Nenhum dado disponível.</div>;
  return (
    <div className="space-y-4">
      {itens.map((item, indice) => (
        <div key={`${item.label}-${indice}`}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-semibold text-[#073F50]">{item.label}</span>
            <span className="shrink-0 text-xs text-slate-500">{item.detail || item.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#176477,#DF6248)]" style={{ width: `${Math.max(2, (item.value / maximo) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
