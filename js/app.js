/* ============================================================
   app.js  —  A "ponte" entre a tela e o parser
   ------------------------------------------------------------
   O parser.js entende o texto. Este arquivo cuida da TELA:
     - lê o que você colou
     - chama parseOrders() (do parser.js)
     - desenha os cards
     - reage aos toques (copiar, confirmar pagamento, etc.)

   Organização:
     1. Dados de exemplo e variáveis
     2. Ajudantes (formatar dinheiro, checar pendências)
     3. Montagem do HTML dos cards
     4. Atualizar a tela (resumo, cards, avisos)
     5. Textos para copiar
     6. Copiar para a área de transferência
     7. Eventos (cliques, digitação, colar)
     8. Início
   ============================================================ */

// Tudo fica dentro de uma função que roda na hora ("IIFE").
// Assim nossas variáveis não vazam pro resto da página.
(function () {

  /* ----------------------------------------------------------
     1. DADOS DE EXEMPLO E VARIÁVEIS
     ---------------------------------------------------------- */

  // Mensagens INVENTADAS que aparecem quando a página abre.
  // (Nunca coloque dados reais de clientes aqui: o código vai pro GitHub.)
  var SAMPLE = [
    '[24/10, 11:00] Restaurante Exemplo: R. das Acácias, 120 - Casa - Jardim Primavera , Muriaé/MG - CEP 36880-000 - Portão azul ao lado da padaria',
    '',
    'https://maps.google.com/?q=-21.100000,-42.300000',
    '',
    'CARLOS',
    '',
    '1 COCA ZERO MINI',
    '',
    'PAGO',
    '[24/10, 11:02] Restaurante Exemplo: Rua das Palmeiras nº 45 Bela Vista',
    '',
    'Renata',
    '',
    '2 Marmitex Op 1 M',
    '',
    'R$48 RECEBER TROCO PRA 100',
    '[24/10, 11:04] Restaurante Exemplo: Av. Central, 890 - Sala 2 - Centro , Muriaé/MG - CEP 36880-000 - Prédio comercial',
    '',
    'SÔNIA',
    '',
    '300G CHURRASCO',
    '',
    'R$27,50',
    '[24/10, 11:05] Restaurante Exemplo: Pronto socorro, Hospital Exemplo',
    '',
    'DAVI',
    '',
    '1 MARMITEX OP 2 M',
    '1 GUARANÁ LATA',
    '',
    'R$32,50 RECEBER CARTÃO',
    '[24/10, 11:08] Restaurante Exemplo: R. dos Ipês, 15 - Casa - Alto da Serra , Muriaé/MG - CEP 36880-000',
    '',
    'MARTA',
    '',
    'PAGO',
    '',
    'MANDAR TALHER'
  ].join('\n');

  var orders = [];    // a lista de pedidos que está na tela (o "estado" do app)
  var ignored = 0;    // quantas mensagens o parser não conseguiu entender

  // Atalhos pra não repetir código:
  var $ = function (id) { return document.getElementById(id); };
  var ta = $('src');       // a caixa de texto onde você cola
  var list = $('list');    // onde os cards aparecem


  /* ----------------------------------------------------------
     2. AJUDANTES
     ---------------------------------------------------------- */

  // Protege o HTML: transforma < > & " ' em códigos seguros.
  // Sem isso, um texto estranho colado poderia "quebrar" a página.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Arredonda para 2 casas (evita 0.1 + 0.2 = 0.30000000000000004).
  function r2(n) { return Math.round(n * 100) / 100; }

  // 96 -> "R$96"   |   28.56 -> "R$28,56"   |   32.5 -> "R$32,50"
  function money(n) {
    if (n == null) return '';
    return 'R$' + (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));
  }

  // O endereço tem algum número? (rua sem número = precisa de conferência)
  function hasNum(o) { return /\d/.test(o.addr); }

  // Esse pedido precisa de conferência? (aparece "Conferir" no card)
  function pending(o) {
    return o.pay.kind === 'unknown'              // pagamento sem forma
        || o.pay.kind === 'none'                 // sem pagamento
        || (!hasNum(o) && !o.semEnd)             // sem número e você não marcou "vai sem endereço"
        || !o.name.trim()                        // sem nome
        || !!o.warn;                             // parser avisou algo
  }

  // "Letícia - Inconfidência" (o que vai na linha do nome no Spoke)
  function nameText(o) {
    var n = o.name.trim(), b = o.bairro.trim();
    return b ? n + ' - ' + b : n;
  }

  // Calcula o troco. Se a mensagem disse "troco pra 100", mostra o valor exato;
  // senão sugere as duas notas mais prováveis acima do valor.
  function trocoText(o) {
    var p = o.pay;
    if (p.kind !== 'dinheiro' || p.amount == null) return '';
    if (p.trocoPara != null) {
      var d = r2(p.trocoPara - p.amount);
      return d >= 0 ? 'Troco pra ' + money(p.trocoPara) + ': devolver ' + money(d)
                    : 'Troco pra ' + money(p.trocoPara) + ' é menor que o valor';
    }
    var notes = [10, 20, 50, 100, 200].filter(function (n) { return n > p.amount; }).slice(0, 2);
    if (!notes.length) return '';
    return 'Troco: ' + notes.map(function (n) { return 'de R$' + n + ' = ' + money(r2(n - p.amount)); }).join(' · ');
  }

  function payLabel(k) { return { dinheiro: 'dinheiro', cartao: 'cartão', pix: 'Pix' }[k]; }


  /* ----------------------------------------------------------
     3. MONTAGEM DO HTML DOS CARDS
     Cada função devolve um pedaço de HTML (um texto).
     ---------------------------------------------------------- */

  // Bloco de pagamento: muda conforme o tipo.
  function payHTML(o) {
    var p = o.pay, h = '';

    if (p.kind === 'pago') {
      h = '<span class="tag ok">Pago</span>';
      if (p.amount != null) h += '<button class="link" type="button" data-act="repay">Mudar</button>';
      return h;
    }

    if (p.kind === 'dinheiro' || p.kind === 'cartao' || p.kind === 'pix') {
      h = '<div class="pay-main"><strong>' + esc(money(p.amount)) + '</strong>receber ' + payLabel(p.kind) + '</div>';
      var t = trocoText(o);
      if (t) h += '<div class="sub">' + esc(t) + '</div>';
      h += '<button class="link" type="button" data-act="repay">Mudar</button>';
      return h;
    }

    // Aqui o pagamento é 'unknown' ou 'none': mostra aviso + botões para você confirmar.
    var msg = p.kind === 'none' ? 'Pagamento não informado.'
      : (p.amount != null ? money(p.amount) + ': confirmar a forma de pagamento.' : 'Falta o valor ou a forma de pagamento.');
    h = '<div class="notice warn">' + esc(msg) + '</div><div class="row">';
    if (p.amount != null) {
      h += '<button class="b2" type="button" data-act="pay" data-v="dinheiro">Dinheiro</button>' +
           '<button class="b2" type="button" data-act="pay" data-v="cartao">Cartão</button>' +
           '<button class="b2" type="button" data-act="pay" data-v="pix">Pix</button>';
    }
    h += '<button class="b2" type="button" data-act="pay" data-v="pago">Já pago</button></div>';
    return h;
  }

  // Aviso do endereço: aparece quando não tem número (ex.: pronto socorro).
  function addrNote(o) {
    if (hasNum(o)) return '';
    if (o.semEnd) {
      return '<div class="notice ok">Aceito sem número: segue como está.</div>' +
             '<button class="b2" type="button" data-act="semend" aria-pressed="true">Vai sem endereço: sim</button>';
    }
    return '<div class="notice warn">Endereço sem número.</div>' +
           '<button class="b2" type="button" data-act="semend" aria-pressed="false">Vai sem endereço</button>';
  }

  // Aviso do nome.
  function nameNote(o) {
    if (o.warn) return '<div class="notice warn">' + esc(o.warn) + '</div>';
    if (!o.name.trim()) return '<div class="notice warn">Preencha o nome.</div>';
    return '';
  }

  // O card inteiro. "o" = o pedido, "i" = a posição dele na lista.
  // Os atributos data-act e data-f são "etiquetas" que o código lê depois
  // para saber qual botão/campo foi mexido.
  function cardHTML(o, i) {
    var pend = pending(o);
    var when = (o.date + ' ' + o.time).trim() || 'sem data';
    return '<article class="card" data-i="' + i + '">' +
      '<header class="meta"><span class="idx">#' + (i + 1) + '</span><span>' + esc(when) + '</span>' +
      '<span class="chip ' + (pend ? 'warn' : 'ok') + '" id="chip-' + i + '">' + (pend ? 'Conferir' : 'Pronto') + '</span></header>' +
      '<div class="body">' +

        // Nome e bairro
        '<div class="f"><div class="f-head"><span class="lab">Nome e bairro</span>' +
          '<button class="cp" type="button" data-act="copy-name">Copiar</button></div>' +
          '<div class="two"><input class="in nm" data-f="name" aria-label="Nome" placeholder="Nome" value="' + esc(o.name) + '" autocomplete="off">' +
          '<input class="in" data-f="bairro" aria-label="Bairro" placeholder="bairro" value="' + esc(o.bairro) + '" autocomplete="off"></div>' +
          '<div class="notes" id="nnote-' + i + '">' + nameNote(o) + '</div></div>' +

        // Endereço
        '<div class="f"><div class="f-head"><span class="lab">Endereço</span>' +
          '<button class="cp" type="button" data-act="copy-addr">Copiar</button></div>' +
          '<input class="in ad" data-f="addr" aria-label="Endereço" placeholder="Rua, número" value="' + esc(o.addr) + '" autocomplete="off">' +
          '<div class="notes" id="anote-' + i + '">' + addrNote(o) + '</div></div>' +

        // Pagamento
        '<div class="f"><span class="lab">Pagamento</span><div class="pay" id="pay-' + i + '">' + payHTML(o) + '</div></div>' +

        // Refri (a classe "has" pinta o campo quando tem refri)
        '<div class="f"><span class="lab">Refri</span>' +
          '<input class="in refri' + (o.refriText ? ' has' : '') + '" data-f="refriText" aria-label="Refri" placeholder="sem refri" value="' + esc(o.refriText) + '" autocomplete="off"></div>' +

        // Observação
        '<div class="f"><span class="lab">Observação</span>' +
          '<input class="in" data-f="obsText" aria-label="Observação" placeholder="sem observação" value="' + esc(o.obsText) + '" autocomplete="off"></div>' +

      '</div></article>';
  }


  /* ----------------------------------------------------------
     4. ATUALIZAR A TELA
     ---------------------------------------------------------- */

  // Atualiza SÓ as partes de um card que mudam (etiqueta, avisos, pagamento).
  // Não refaz o card inteiro para não tirar o cursor do campo que você está digitando.
  function patchCard(i) {
    var o = orders[i], pend = pending(o);
    var chip = $('chip-' + i);
    if (chip) { chip.className = 'chip ' + (pend ? 'warn' : 'ok'); chip.textContent = pend ? 'Conferir' : 'Pronto'; }
    var a = $('anote-' + i); if (a) a.innerHTML = addrNote(o);
    var n = $('nnote-' + i); if (n) n.innerHTML = nameNote(o);
    var p = $('pay-' + i); if (p) p.innerHTML = payHTML(o);
    updateSummary();
  }

  // Números do topo: quantos pedidos, quantos para conferir, e totais a receber.
  function updateSummary() {
    var n = orders.length, pend = 0, din = 0, car = 0, pix = 0;
    orders.forEach(function (o) {
      if (pending(o)) pend++;
      var p = o.pay;
      if (p.amount != null) {
        if (p.kind === 'dinheiro') din += p.amount;
        else if (p.kind === 'cartao') car += p.amount;
        else if (p.kind === 'pix') pix += p.amount;
      }
    });
    var h = '<div><span class="lab">Pedidos</span><b>' + n + '</b></div>' +
      '<div class="' + (pend ? 'w' : '') + '"><span class="lab">Conferir</span><b>' + pend + '</b></div>' +
      '<div><span class="lab">Dinheiro</span><b>' + esc(money(r2(din)) || 'R$0') + '</b></div>' +
      '<div><span class="lab">Cartão</span><b>' + esc(money(r2(car)) || 'R$0') + '</b></div>';
    if (pix > 0) h += '<div><span class="lab">Pix</span><b>' + esc(money(r2(pix))) + '</b></div>';
    $('sum').innerHTML = h;
    $('copyall').disabled = !n;   // sem pedidos, o botão "Copiar lista toda" fica desligado
  }

  // Redesenha a lista inteira (usado ao ler pedidos novos).
  function render() {
    if (!orders.length) {
      list.innerHTML = '<div class="empty">Nenhum pedido ainda. Cole as mensagens acima e toque em Ler pedidos.</div>';
    } else {
      list.innerHTML = orders.map(cardHTML).join('');
    }
    var foot = $('foot');
    if (ignored) {
      foot.hidden = false;
      foot.textContent = ignored + (ignored === 1 ? ' mensagem foi ignorada' : ' mensagens foram ignoradas') + ' por não ter endereço e nome.';
    } else {
      foot.hidden = true;
    }
    updateSummary();
  }

  // Lê o texto da caixa, chama o parser e desenha.
  function run() {
    var r = parseOrders(ta.value);   // <- função do parser.js
    ignored = r.ignored;
    orders = r.orders.map(function (o) {
      // Refri e observação viram texto simples para os campos editáveis.
      o.refriText = o.refri.join(' + ');
      o.obsText = o.obs.join(' · ');
      return o;
    });
    render();
  }


  /* ----------------------------------------------------------
     5. TEXTOS PARA COPIAR
     ---------------------------------------------------------- */

  function payText(o) {
    var p = o.pay;
    if (p.kind === 'pago') return '✅ Pago';
    if (p.kind === 'dinheiro' || p.kind === 'cartao' || p.kind === 'pix') {
      var icon = p.kind === 'cartao' ? '💳' : '💰';
      var s = icon + ' ' + money(p.amount) + ' receber ' + payLabel(p.kind);
      var t = trocoText(o);
      return t ? s + '\n   ' + t : s;
    }
    return '⚠️ ' + (p.amount != null ? money(p.amount) + ' confirmar forma de pagamento' : 'pagamento não informado');
  }

  // O texto de UM pedido (usado em "Copiar lista toda").
  function orderText(o, i) {
    var L = [(i + 1) + '. ' + nameText(o), '📍 ' + o.addr, payText(o)];
    if (o.refriText.trim()) L.push('🥤 ' + o.refriText.trim());
    if (o.obsText.trim()) L.push('📝 ' + o.obsText.trim());
    return L.join('\n');
  }


  /* ----------------------------------------------------------
     6. COPIAR PARA A ÁREA DE TRANSFERÊNCIA
     ---------------------------------------------------------- */

  // Troca o texto do botão por um instante ("Copiado") e depois volta ao normal.
  function flash(btn, msg) {
    if (!btn) return;
    if (btn._t) clearTimeout(btn._t); else btn._o = btn.textContent;
    btn.textContent = msg;
    btn._t = setTimeout(function () { btn.textContent = btn._o; btn._t = null; }, 1300);
  }

  // Tenta copiar do jeito moderno; se o navegador não deixar, tenta o jeito antigo;
  // se também falhar, seleciona o texto do campo para você copiar na mão.
  function copyText(text, btn, fallbackEl) {
    var done = function () { flash(btn, 'Copiado'); };
    var fail = function () {
      var ok = false;
      try {
        var t = document.createElement('textarea');
        t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); document.body.removeChild(t);
      } catch (e) { ok = false; }
      if (ok) done();
      else {
        if (fallbackEl) { try { fallbackEl.focus(); fallbackEl.select(); } catch (e2) {} }
        flash(btn, 'Selecionado');
      }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
      else fail();
    } catch (e) { fail(); }
  }


  /* ----------------------------------------------------------
     7. EVENTOS
     Em vez de colocar um "ouvinte" em cada botão de cada card, colocamos UM
     só na lista inteira e descobrimos qual botão foi tocado (event.target).
     Isso se chama "delegação de eventos" e funciona mesmo com cards novos.
     ---------------------------------------------------------- */

  // Toques nos botões dos cards (identificados pelo atributo data-act).
  list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var card = b.closest('.card');
    var i = +card.getAttribute('data-i');   // posição do card na lista
    var o = orders[i];
    var act = b.getAttribute('data-act');

    if (act === 'copy-name') copyText(nameText(o), b, card.querySelector('[data-f="name"]'));
    else if (act === 'copy-addr') copyText(o.addr, b, card.querySelector('[data-f="addr"]'));
    else if (act === 'semend') { o.semEnd = !o.semEnd; patchCard(i); }     // liga/desliga "vai sem endereço"
    else if (act === 'pay') {                                              // você escolheu a forma de pagamento
      o.pay = { kind: b.getAttribute('data-v'), amount: o.pay.amount, trocoPara: null };
      patchCard(i);
    }
    else if (act === 'repay') {                                            // "Mudar": volta a pedir a forma
      o.pay = { kind: 'unknown', amount: o.pay.amount, trocoPara: null };
      patchCard(i);
    }
  });

  // Digitação nos campos dos cards (identificados pelo atributo data-f).
  list.addEventListener('input', function (e) {
    var t = e.target, f = t.getAttribute('data-f');
    if (!f) return;
    var card = t.closest('.card');
    var i = +card.getAttribute('data-i');
    var o = orders[i];
    o[f] = t.value;   // guarda o que você digitou no pedido (o[f] = o.name, o.addr, ...)

    if (f === 'name') { o.warn = ''; patchCard(i); }                      // você corrigiu o nome: o aviso some
    else if (f === 'addr') patchCard(i);                                  // endereço mudou: recalcula os avisos
    else if (f === 'refriText') t.classList.toggle('has', !!t.value.trim()); // pinta/despinta o campo do refri
  });

  $('run').addEventListener('click', run);

  $('clear').addEventListener('click', function () {
    ta.value = '';
    $('demo').hidden = true;
    orders = []; ignored = 0;
    render();
    ta.focus();
  });

  // Mexeu no texto: o selo "Exemplo" some.
  ta.addEventListener('input', function () { $('demo').hidden = true; });

  // Colou: lê os pedidos sozinho (setTimeout 0 espera o texto entrar na caixa).
  ta.addEventListener('paste', function () { setTimeout(run, 0); });

  $('copyall').addEventListener('click', function (e) {
    var head = '📋 PEDIDOS (' + orders.length + ')\n\n';
    copyText(head + orders.map(orderText).join('\n\n'), e.currentTarget, null);
  });


  /* ----------------------------------------------------------
     8. INÍCIO
     Ao abrir a página: coloca o exemplo na caixa e já lê.
     ---------------------------------------------------------- */
  ta.value = SAMPLE;
  run();

})();
