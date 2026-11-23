/* ============================================================
   icones.js  —  Ícones SVG do app
   ------------------------------------------------------------
   Todos os ícones são desenhos simples de traço (grade 24 x 24),
   que pegam a cor do texto onde forem colocados (currentColor).
   Como são texto no próprio arquivo, funcionam sem internet.

   Uso no app.js (monta HTML em texto):
     icones.svg('lixeira')        // tamanho padrão 24px
     icones.svg('cartao', 18)     // tamanho 18px
     '<button>' + icones.svg('mais') + ' Novo</button>'

   Para criar um ícone novo: ponha o desenho (só o miolo, sem a
   tag <svg>) na lista DESENHOS, com um nome novo.
   ============================================================ */
var icones = (function () {

  // Cada nome aponta para os traços do desenho.
  var DESENHOS = {
    // --- barra inferior e gaveta ---
    corridas:  '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>',
    empresas:  '<path d="M4 10.5 12 4l8 6.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5a2 2 0 0 1 4 0V20"/>',
    historico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    perfil:    '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    aparencia: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor"/>',
    ajuda:     '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8"/><path d="M12 17h.01"/>',
    sair:      '<path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10"/><path d="m15 8 4 4-4 4M19 12H9.5"/>',

    // --- ações ---
    prancheta: '<rect x="5" y="5" width="14" height="16" rx="2.5"/><rect x="9" y="2.5" width="6" height="4" rx="1.2"/><path d="M9 11.5h6M9 15.5h4"/>',
    mais:      '<path d="M12 5v14M5 12h14"/>',
    lixeira:   '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/><path d="M10 11v6M14 11v6"/>',
    fechar:    '<path d="M6 6l12 12M18 6 6 18"/>',
    check:     '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    baixo:     '<path d="m6 9 6 6 6-6"/>',

    // --- chips dos pedidos ---
    cartao:    '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M7 15h3"/>',
    dinheiro:  '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    pix:       '<path d="M12 3.5 20.5 12 12 20.5 3.5 12Z"/><path d="M8.5 12 12 8.5l3.5 3.5-3.5 3.5Z"/>',
    refri:     '<path d="M7 7h10l-1.3 11.7a2 2 0 0 1-2 1.8h-3.4a2 2 0 0 1-2-1.8Z"/><path d="M6.5 7h11M13.5 3.5 12.5 7"/>'
  };

  // Devolve o ícone pronto, como texto HTML. "tam" é o tamanho em pixels.
  function svg(nome, tam) {
    var traco = DESENHOS[nome];
    if (!traco) return '';                      // nome errado: não desenha nada (e não quebra a tela)
    tam = tam || 24;
    return '<svg class="ic" width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" ' +
           'fill="none" stroke="currentColor" stroke-width="2" ' +
           'stroke-linecap="round" stroke-linejoin="round" ' +
           'aria-hidden="true" focusable="false">' + traco + '</svg>';
  }

  return {
    svg: svg,
    nomes: function () { return Object.keys(DESENHOS); }
  };

})();
