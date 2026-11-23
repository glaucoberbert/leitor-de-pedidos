/* ============================================================
   tema.js  —  Escolhe, aplica e lembra o tema de cores
   ------------------------------------------------------------
   Temas: "noite" (padrão), "dia", "azul" e "auto" (segue o celular).

   Como funciona:
     • A escolha fica guardada no aparelho (localStorage).
     • Para aplicar, este arquivo põe data-tema="noite|dia|azul" na
       tag <html>. O css/tema.css cuida das cores de cada um.
     • "auto" não é um tema de verdade: vira "dia" se o celular está
       no modo claro e "noite" se está no escuro (e acompanha se o
       celular mudar sozinho, por exemplo ao anoitecer).

   IMPORTANTE: este arquivo é carregado no <head>, ANTES da página
   aparecer. Assim o tema certo já está ligado no primeiro desenho
   da tela e não pisca a cor errada.

   Para testar sem tela de escolha (ela vem na etapa do Perfil):
   abra o site com ?tema=dia, ?tema=azul, ?tema=noite ou ?tema=auto.
   A escolha fica salva.

   Uso no app.js (depois):
     tema.definir('dia');   // troca e guarda
     tema.escolha();        // o que a pessoa escolheu: 'noite'|'dia'|'azul'|'auto'
     tema.opcoes;           // lista pra montar a tela de escolha
   ============================================================ */
var tema = (function () {

  var CHAVE = 'leitor-pedidos:tema';           // nome da gaveta no localStorage
  var PADRAO = 'noite';

  // Lista usada na tela de escolha (Perfil > Aparência).
  var OPCOES = [
    { id: 'noite', nome: 'Noite' },
    { id: 'dia',   nome: 'Dia' },
    { id: 'azul',  nome: 'Azul' },
    { id: 'auto',  nome: 'Automático' }
  ];

  // Cor da barra de cima do celular (a "theme-color") para cada tema real.
  var COR_BARRA = { noite: '#0E1216', dia: '#F3F4F0', azul: '#1F4FE0' };

  var atual = PADRAO;          // o que a pessoa escolheu (pode ser 'auto')
  var consulta = null;         // "pergunta" ao celular: está no modo claro?

  // ---------- guardar e ler (com try/catch: modo privado pode bloquear) ----------
  function valido(id) {
    for (var i = 0; i < OPCOES.length; i++) if (OPCOES[i].id === id) return true;
    return false;
  }
  function ler() {
    try {
      var v = localStorage.getItem(CHAVE);
      if (valido(v)) return v;
    } catch (e) {}
    return PADRAO;
  }
  function gravar(id) {
    try { localStorage.setItem(CHAVE, id); } catch (e) {}
  }

  // ---------- "auto": descobre se o celular está no modo claro ----------
  function celularClaro() {
    if (!window.matchMedia) return false;     // navegador muito antigo: fica no escuro (padrão)
    if (!consulta) consulta = window.matchMedia('(prefers-color-scheme: light)');
    return consulta.matches;
  }

  // Transforma a escolha (que pode ser 'auto') em um tema real.
  function resolver(id) {
    if (id === 'auto') return celularClaro() ? 'dia' : 'noite';
    return id;
  }

  // ---------- aplica na página ----------
  function aplicar() {
    var real = resolver(atual);
    document.documentElement.setAttribute('data-tema', real);

    // Atualiza a cor da barra do celular (a tag <meta name="theme-color">).
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COR_BARRA[real]);

    // Avisa o resto do app (se alguém precisar redesenhar algo).
    try { document.dispatchEvent(new CustomEvent('todoke:tema', { detail: { escolha: atual, tema: real } })); } catch (e) {}
  }

  // Troca o tema e lembra no aparelho.
  function definir(id) {
    if (!valido(id)) return;
    atual = id;
    gravar(id);
    aplicar();
  }

  // ---------- começo: roda assim que o arquivo carrega ----------
  atual = ler();

  // Atalho de teste: ?tema=dia  (só vale se for um tema que existe)
  try {
    var pedido = new URLSearchParams(window.location.search).get('tema');
    if (valido(pedido)) { atual = pedido; gravar(pedido); }
  } catch (e) {}

  aplicar();

  // Se está em "auto" e o celular muda de claro pra escuro (ou o contrário), acompanha.
  if (window.matchMedia) {
    celularClaro();   // cria a "consulta"
    var ouvir = function () { if (atual === 'auto') aplicar(); };
    if (consulta.addEventListener) consulta.addEventListener('change', ouvir);
    else if (consulta.addListener) consulta.addListener(ouvir);   // navegadores antigos
  }

  return {
    definir: definir,
    escolha: function () { return atual; },
    real: function () { return resolver(atual); },
    opcoes: OPCOES
  };

})();
