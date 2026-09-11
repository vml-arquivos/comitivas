import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';

const PAGINAS: Record<string, { titulo: string; descricao: string; secoes: Array<{ titulo: string; texto: string }> }> = {
  privacidade: {
    titulo: 'Política de Privacidade',
    descricao: 'Como a Excursão das Comitivas trata dados pessoais durante a navegação, contratação e atendimento.',
    secoes: [
      { titulo: 'Finalidades', texto: 'Usamos dados necessários para cadastro, atendimento, montagem do pacote, geração do contrato, autenticação por código, cobrança pelo Banco Cora e comunicação sobre a reserva.' },
      { titulo: 'Base e compartilhamentos', texto: 'O tratamento ocorre para execução do contrato, cumprimento de obrigações legais e atendimento de solicitações. Compartilhamos apenas o necessário com hospedagem, transporte, infraestrutura, e-mail e Banco Cora quando a operação contratada exigir.' },
      { titulo: 'Retenção e direitos', texto: 'Registros contratuais, financeiros e de evidência são mantidos pelo período necessário ao cumprimento das obrigações e defesa de direitos. Você pode solicitar confirmação, acesso, correção e informações sobre o tratamento pelo e-mail excursaodascomitivas@gmail.com.' },
      { titulo: 'Imagem e geolocalização', texto: 'O consentimento de imagem é opcional, separado e não impede a contratação. A geolocalização é opcional e só é registrada quando autorizada no fluxo de assinatura.' },
    ],
  },
  termos: {
    titulo: 'Termos de Contratação',
    descricao: 'Regras gerais para montar, revisar e contratar um pacote da Excursão das Comitivas.',
    secoes: [
      { titulo: 'Informação antes do aceite', texto: 'O cliente visualiza o resumo do pacote, valores, forma de pagamento e contrato individual antes da confirmação. O backend calcula e registra os valores; a tela não substitui o documento congelado.' },
      { titulo: 'Assinatura eletrônica', texto: 'A confirmação ocorre por assinatura eletrônica com autenticação por código enviado ao canal configurado. O código é de uso único, possui validade limitada e gera protocolo e hashes verificáveis.' },
      { titulo: 'Pagamento', texto: 'A operação financeira de produção utiliza exclusivamente o Banco Cora. A confirmação da reserva depende da regra financeira indicada no contrato e os dados de cobrança devem ser conferidos antes do pagamento.' },
      { titulo: 'Regras da viagem', texto: 'As Regras de Convivência versão 2026.1 fazem parte da experiência da comitiva e devem ser lidas antes do aceite. Alterações materiais exigem nova versão e novo aceite.' },
    ],
  },
  cancelamento: {
    titulo: 'Cancelamento e Reembolso',
    descricao: 'Orientações para formalizar um pedido de cancelamento e consultar as condições do contrato.',
    secoes: [
      { titulo: 'Como solicitar', texto: 'Envie a solicitação formal para excursaodascomitivas@gmail.com com nome, CPF, reserva e telefone de contato. A data de formalização será considerada para análise do pedido.' },
      { titulo: 'Condições aplicáveis', texto: 'As retenções e os prazos são os que constam no contrato individual aceito. A fonte contratual vigente possui intervalos de dias que dependem de aprovação jurídica e empresarial; nenhuma faixa não aprovada é preenchida automaticamente.' },
      { titulo: 'Prazo de resposta', texto: 'Após a formalização, a equipe informará o cálculo aplicável, os valores eventualmente devidos e o prazo de processamento, preservando os comprovantes e a trilha de atendimento.' },
      { titulo: 'Dúvidas', texto: 'Para atendimento rápido, fale com a equipe pelo WhatsApp (61) 99445-9086 ou pelo e-mail informado acima.' },
    ],
  },
};

export default function Legal() {
  const { tipo = 'privacidade' } = useParams();
  const pagina = PAGINAS[tipo] || PAGINAS.privacidade;
  return (
    <div className="min-h-screen bg-[#fffdf9] py-14 sm:py-20">
      <Helmet>
        <title>{pagina.titulo} | Excursão das Comitivas</title>
        <meta name="description" content={pagina.descricao} />
        <meta name="robots" content="index,follow" />
        <link rel="canonical" href={`https://excursaodascomitivas.com.br/${tipo}`} />
      </Helmet>
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Link to="/" className="text-sm font-bold text-primary hover:underline">← Voltar para a Excursão das Comitivas</Link>
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Excursão das Comitivas · versão 2026.1</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-secondary sm:text-5xl">{pagina.titulo}</h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">{pagina.descricao}</p>
          <div className="mt-10 grid gap-8">
            {pagina.secoes.map((secao) => <section key={secao.titulo}><h2 className="text-xl font-bold text-secondary">{secao.titulo}</h2><p className="mt-2 leading-8 text-slate-700">{secao.texto}</p></section>)}
          </div>
        </div>
      </div>
    </div>
  );
}
