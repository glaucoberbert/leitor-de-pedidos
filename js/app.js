/* ============================================================
   app.js  —  A "ponte" entre a tela, o parser e o armazenamento
   ------------------------------------------------------------
   Organização:
     1. Estado (os dados do app) e exemplo
     2. Ajudantes (dinheiro, datas, serviços)
     3. Cards dos pedidos
     4. Barra das entregas do dia (abrir / fechar)
     5. Terminar rota
     6. Relatório do dia
     7. Salvar e carregar
     8. Copiar
     9. Eventos (cliques, digitação)
    10. Início
   (Parte 1 do visual novo: topo, chip da empresa, cartão do dia,
    botão de colar e cards em formato resumido — procure por "NOVO")
   ============================================================ */

(function () {

  /* ----------------------------------------------------------
     1. ESTADO
     "S" guarda TUDO que precisa ser lembrado. Quando algo muda,
     alteramos S, redesenhamos a tela e salvamos.
     ---------------------------------------------------------- */

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

  var S = {
    v: 1,
    // Serviços para os quais você entrega, cada um com o valor padrão por entrega
    // e o "minimo" garantido por dia (0 = esse serviço não tem mínimo).
    servicos: [
      { id: 'paradise', nome: 'Paradise Food', valor: 6, minimo: 70 },
      { id: 'donamesa', nome: 'Dona Mesa', valor: 6, minimo: 0 }
    ],
    servicoId: 'paradise',   // serviço da rota que está na tela
    texto: SAMPLE,           // o que está na caixa de texto
    demo: true,              // true = ainda são os pedidos de exemplo
    orders: [],              // os cards da rota atual
    ignored: 0,              // mensagens que o parser não entendeu
    // O turno (entregas do dia). null = fechado.
    // { id, abertoEm, adiantamento, rotas: [ { id, servicoId, servicoNome, fimEm, entregas: [...] } ] }
    turno: null
  };

  // Coisas só da tela, que NÃO precisam ser salvas.
  var ui = {
    pronto: false,     // terminou de carregar o que estava salvo?
    semSalvar: false,  // se deu erro ao carregar, não salvamos (pra não apagar o que já existia)
    view: 'main',      // 'main' = tela principal | 'rel' = relatório
    novo: false,       // caixinha de "novo serviço" aberta?
    apagar: null,      // id da rota esperando confirmação de apagar
    descartar: null,   // ação esperando você confirmar que pode descartar a rota
    erroSalvar: false, // o último salvamento falhou?
    delSvc: null,      // apagar serviço: { id, step } (step 1 = 1ª pergunta, step 2 = "tem certeza?")
    diaAberto: false,  // NOVO: cartão do dia com a lista de rotas aberta?
    empAberto: false   // NOVO: listinha de empresas (chip) aberta?
  };

  var $ = function (id) { return document.getElementById(id); };
  var ta = $('src');
  var list = $('list');


  /* ----------------------------------------------------------
     2. AJUDANTES
     ---------------------------------------------------------- */

  // Protege o HTML (troca < > & " ' por códigos seguros).
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function r2(n) { return Math.round(n * 100) / 100; }

  // 96 -> "R$96"  |  28.56 -> "R$28,56"
  function money(n) {
    if (n == null) return '';
    return 'R$' + (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));
  }
  // NOVO — 48 -> "R$ 48,00"  (sempre com 2 casas e espaço; usado no cartão do dia e nos chips)
  function moneyBR(n) { return 'R$ ' + (n || 0).toFixed(2).replace('.', ','); }

  // 6.5 -> "6,5"  (para mostrar dentro dos campos)
  function fmtNum(n) { return String(n == null ? '' : n).replace('.', ','); }

  // "6", "6,50", "6.5" -> número. Texto inválido vira 0.
  function parseMoney(s) {
    var t = String(s == null ? '' : s).trim();
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(t);
    return isFinite(n) && n > 0 ? r2(n) : 0;
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function hhmm(iso) { var d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function ddmm(iso) { var d = new Date(iso); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2); }

  // Todas as datas e horas vêm do relógio do celular (new Date()).
  // Se o turno foi aberto em outro dia, devolve "26/10 às " pra mostrar isso; se foi hoje, devolve vazio.
  function diaSeNaoHoje(iso) { return ddmm(iso) === ddmm(new Date()) ? '' : ddmm(iso) + ' às '; }

  // Data que vai no relatório: o dia em que as entregas foram feitas (a hora em que cada rota foi terminada),
  // e não o dia em que o turno foi aberto — o turno pode ter ficado aberto desde outro dia.
  // Um só dia: "07/11". Mais de um: "26/10 a 07/11". Sem nenhuma rota terminada: a data de abertura.
  function dataDoTurno(t) {
    var dias = [];
    t.rotas.forEach(function (r) {
      var d = r.fimEm ? ddmm(r.fimEm) : '';
      if (d && dias.indexOf(d) < 0) dias.push(d);
    });
    if (!dias.length) return ddmm(t.abertoEm);
    return dias.length === 1 ? dias[0] : dias[0] + ' a ' + dias[dias.length - 1];
  }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

  // Acha um serviço pelo id. Devolve null se ele não existir mais (foi apagado).
  function svcFind(id) {
    for (var i = 0; i < S.servicos.length; i++) if (S.servicos[i].id === id) return S.servicos[i];
    return null;
  }
  // Igual, mas nunca devolve null: se não achar, usa o primeiro serviço.
  function svc(id) { return svcFind(id) || S.servicos[0]; }

  // NOVO — "Bom dia," / "Boa tarde," / "Boa noite," conforme a hora do celular.
  function saudacao() {
    var h = new Date().getHours();
    return h < 5 ? 'Boa noite,' : h < 12 ? 'Bom dia,' : h < 18 ? 'Boa tarde,' : 'Boa noite,';
  }

  // NOVO — Primeiro nome de quem está logado ("Glauco Roberto" -> "Glauco").
  // Sem nome cadastrado, usa a parte do e-mail antes do @. Sem login, devolve vazio.
  function primeiroNome() {
    var u = (window.conta && conta.usuario) ? conta.usuario() : null;
    var nome = u ? String(u.nome || '').trim() : '';
    if (!nome && u && u.email) nome = String(u.email).split('@')[0];
    return nome ? nome.split(/\s+/)[0] : '';
  }

  // NOVO — Preenche o topo: saudação, nome e a letra do avatar.
  function renderTopo() {
    var nome = primeiroNome();
    $('saudTxt').textContent = nome ? saudacao() : 'Olá,';
    $('saudNome').textContent = nome || 'motoboy';
    $('avatarLetra').textContent = (nome || 'M').charAt(0).toUpperCase();
  }

  // NOVO — Os ícones do index.html são marcados com data-ic="nome" (e data-tam="tamanho").
  // Aqui o desenho SVG (js/icones.js) é colocado dentro de cada marca.
  function preencherIcones() {
    var els = document.querySelectorAll('[data-ic]');
    for (var k = 0; k < els.length; k++) {
      els[k].innerHTML = icones.svg(els[k].getAttribute('data-ic'), +els[k].getAttribute('data-tam') || 24);
    }
  }

  // Mensagem curta de status. kind: 'ok' (some sozinha), 'warn' ou 'info'.
  var statusTimer = null;
  function setStatus(msg, kind) {
    var el = $('status');
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    if (!msg) { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'status ' + (kind || 'info');
    el.textContent = msg;
    if (kind === 'ok') statusTimer = setTimeout(function () { el.hidden = true; }, 4000);
  }


  /* ----------------------------------------------------------
     3. CARDS DOS PEDIDOS
     ---------------------------------------------------------- */

  function hasNum(o) { return /\d/.test(o.addr); }

  function pending(o) {
    return o.pay.kind === 'unknown' || o.pay.kind === 'none'
        || (o.pay.kind !== 'pago' && o.pay.amount == null)   // vai receber, mas falta o valor
        || (!hasNum(o) && !o.semEnd) || !o.name.trim() || !!o.warn;
  }

  function nameText(o) {
    var n = o.name.trim(), b = o.bairro.trim();
    return b ? n + ' - ' + b : n;
  }

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

  // Bloco de pagamento: botões da forma + campos de valor e troco.
  // "i" é a posição do card (usada nos ids que o patchPayx atualiza).
  function payHTML(o, i) {
    var p = o.pay, k = p.kind;
    var formas = [['dinheiro', 'Dinheiro'], ['cartao', 'Cartão'], ['pix', 'Pix'], ['pago', 'Pago']];
    var h = '<div class="seg">' + formas.map(function (f) {
      return '<button class="b2" type="button" data-act="pay" data-v="' + f[0] + '" aria-pressed="' + (k === f[0] ? 'true' : 'false') + '">' + f[1] + '</button>';
    }).join('') + '</div>';

    // Veio sem forma de pagamento clara: pede pra você escolher um dos botões.
    if (k === 'unknown' || k === 'none') {
      h += '<div class="notice warn">' + (k === 'none' ? 'Pagamento não informado.' : 'Confirme a forma de pagamento.') + '</div>';
    }

    if (k === 'pago') {
      h += '<span class="tag ok">Pago' + (p.via ? ' · ' + esc(p.via) : '') + '</span>';
    } else {
      // Valor sempre aparece; "troco pra" só quando é dinheiro.
      h += '<div class="pay-in"><div class="f"><label class="lab">Valor (R$)</label>' +
           '<input class="in sm" data-f="payTxt" inputmode="decimal" aria-label="Valor a receber" value="' + esc(o.payTxt) + '" autocomplete="off"></div>';
      if (k === 'dinheiro') {
        h += '<div class="f"><label class="lab">Troco pra (R$)</label>' +
             '<input class="in sm" data-f="trocoTxt" inputmode="decimal" aria-label="Troco para quanto" placeholder="opcional" value="' + esc(o.trocoTxt) + '" autocomplete="off"></div>';
      }
      h += '</div>';
    }
    return h + '<div class="payx" id="payx-' + i + '">' + payxHTML(o) + '</div>';
  }

  // Parte do pagamento que muda enquanto você digita: a linha do troco.
  // (Separada do payHTML para não refazer os campos e tirar o cursor de onde você está.)
  function payxHTML(o) {
    var t = trocoText(o);
    return t ? '<div class="sub">' + esc(t) + '</div>' : '';
  }

  // Tem valor e forma de receber? Só então faz sentido copiar pro Spoke ("pago" não copia).
  function payPode(o) {
    var p = o.pay;
    return (p.kind === 'dinheiro' || p.kind === 'cartao' || p.kind === 'pix') && p.amount != null;
  }

  function payNome(k) { return { dinheiro: 'Dinheiro', cartao: 'Cartão', pix: 'Pix' }[k]; }

  // O texto que vai pro Spoke: "R$48 - Dinheiro"
  function payCopy(o) { return money(o.pay.amount) + ' - ' + payNome(o.pay.kind); }

  // Mostra ou esconde o botão "Copiar" do pagamento.
  function setPayCopy(i) {
    var b = $('payc-' + i);
    if (b) b.hidden = !payPode(S.orders[i]);
  }

  // Atualiza só o que depende do valor/troco digitado: linha do troco, botão copiar, etiqueta e resumo.
  function patchPayx(i) {
    var o = S.orders[i];
    var x = $('payx-' + i); if (x) x.innerHTML = payxHTML(o);
    setPayCopy(i);
    patchResumo(i);                                    // NOVO: o chip do pagamento acompanha o que você digita
    updateSummary();
  }

  function addrNote(o) {
    if (hasNum(o)) return '';
    if (o.semEnd) {
      return '<div class="notice ok">Aceito sem número: segue como está.</div>' +
             '<button class="b2" type="button" data-act="semend" aria-pressed="true">Vai sem endereço: sim</button>';
    }
    return '<div class="notice warn">Endereço sem número.</div>' +
           '<button class="b2" type="button" data-act="semend" aria-pressed="false">Vai sem endereço</button>';
  }

  function nameNote(o) {
    if (o.warn) return '<div class="notice warn">' + esc(o.warn) + '</div>';
    if (!o.name.trim()) return '<div class="notice warn">Preencha o nome.</div>';
    return '';
  }

  // Texto do botão "Entregue" conforme o estado.
  function feitoLabel(o) { return o.feito ? 'Entregue' : 'Marcar entregue'; }

  // NOVO — Chip do pagamento (ícone + texto), no estilo do mockup.
  //   com valor:  "R$ 32,00 · dinheiro" | sem valor: "Cartão na entrega"
  function payChip(o) {
    var p = o.pay, k = p.kind;
    var valor = p.amount != null ? moneyBR(p.amount) : '';
    if (k === 'pago')     return { ic: 'check',    txt: 'Pago' + (p.via ? ' · ' + p.via : '') };
    if (k === 'dinheiro') return { ic: 'dinheiro', txt: valor ? valor + ' · dinheiro' : 'Dinheiro na entrega' };
    if (k === 'cartao')   return { ic: 'cartao',   txt: valor ? valor + ' · cartão' : 'Cartão na entrega' };
    if (k === 'pix')      return { ic: 'pix',      txt: valor ? valor + ' · Pix' : 'Pix' };
    // Veio sem forma de pagamento clara: avisa pra confirmar.
    return { ic: 'alerta', txt: valor ? valor + ' · confirmar forma' : 'Confirmar pagamento', warn: true };
  }

  // NOVO — Um chip pronto. "cls": '' (normal), 'w' (âmbar: refri) ou 'w2' (contorno âmbar: conferir).
  function chipHTML(ic, txt, cls) {
    return '<span class="chp' + (cls ? ' ' + cls : '') + '">' + icones.svg(ic, 18) + '<span>' + esc(txt) + '</span></span>';
  }

  // NOVO — O resumo do card (o que aparece com o card FECHADO), como no mockup:
  //   ( ) Nome · Bairro
  //       Rua, número
  //       [pagamento] [refri] [conferir]
  // A bolinha marca "entregue". Tocar no texto abre o card pra editar.
  function resumoHTML(o) {
    var pc = payChip(o);
    var chips = chipHTML(pc.ic, pc.txt, pc.warn ? 'w' : '');
    if (o.refriText && o.refriText.trim()) chips += chipHTML('refri', o.refriText.trim(), 'w');
    if (pending(o) && !o.feito && !pc.warn) chips += chipHTML('alerta', 'Conferir', 'w2');   // pendência que não é o pagamento

    var nome = o.name.trim() || 'Sem nome', bairro = o.bairro.trim();
    var end = o.addr.trim() || 'Sem endereço';
    return '<button class="bola" type="button" role="checkbox" data-act="feito-sw" aria-checked="' + (o.feito ? 'true' : 'false') + '" aria-label="Entregue">' + icones.svg('check', 20) + '</button>' +
      '<button class="info" type="button" data-act="toggle" aria-expanded="' + (o.aberto ? 'true' : 'false') + '" aria-label="Abrir ou fechar os detalhes deste pedido">' +
        '<span class="l1"><b>' + esc(nome) + '</b>' + (bairro ? '<span class="bai"> · ' + esc(bairro) + '</span>' : '') + '</span>' +
        '<span class="l2">' + esc(end) + '</span>' +
        '<span class="chips">' + chips + '</span>' +
      '</button>';
  }

  // NOVO — Atualiza só o resumo do card (sem mexer nos campos, pra não tirar o cursor de onde você está).
  function patchResumo(i) {
    var o = S.orders[i];
    var r = list.querySelector('.card[data-i="' + i + '"] .resumo');
    if (o && r) r.innerHTML = resumoHTML(o);
  }

  function cardHTML(o, i) {
    return '<article class="card' + (o.feito ? ' done' : '') + (o.aberto ? ' aberto' : '') + '" data-i="' + i + '">' +
      // Resumo (sempre visível): bolinha + nome · bairro + endereço + chips.
      '<div class="resumo">' + resumoHTML(o) + '</div>' +
      // Corpo (só aparece com o card aberto): todos os campos para editar.
      '<div class="body">' +

        // Entregue + valor desta entrega
        '<div class="f"><div class="f-head"><span class="lab">Valor da entrega (R$)</span>' +
          '<button class="b2 ent" type="button" data-act="feito" aria-pressed="' + (o.feito ? 'true' : 'false') + '">' + feitoLabel(o) + '</button></div>' +
          '<input class="in sm" data-f="valorTxt" inputmode="decimal" aria-label="Valor da entrega" value="' + esc(o.valorTxt) + '" autocomplete="off"></div>' +

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
        '<div class="f"><div class="f-head"><span class="lab">Pagamento</span>' +
          '<button class="cp" type="button" id="payc-' + i + '" data-act="copy-pay"' + (payPode(o) ? '' : ' hidden') + '>Copiar</button></div>' +
          '<div class="pay" id="pay-' + i + '">' + payHTML(o, i) + '</div></div>' +

        // Refri
        '<div class="f"><div class="f-head"><span class="lab">Refri</span>' +
          '<button class="cp" type="button" id="refric-' + i + '" data-act="copy-refri"' + (o.refriText.trim() ? '' : ' hidden') + '>Copiar</button></div>' +
          '<input class="in refri' + (o.refriText ? ' has' : '') + '" data-f="refriText" aria-label="Refri" placeholder="sem refri" value="' + esc(o.refriText) + '" autocomplete="off"></div>' +

        // Observação
        '<div class="f"><div class="f-head"><span class="lab">Observação</span>' +
          '<button class="cp" type="button" id="obsc-' + i + '" data-act="copy-obs"' + (o.obsText.trim() ? '' : ' hidden') + '>Copiar</button></div>' +
          '<input class="in" data-f="obsText" aria-label="Observação" placeholder="sem observação" value="' + esc(o.obsText) + '" autocomplete="off"></div>' +

        '<button class="link" type="button" data-act="remover">Remover este pedido</button>' +
      '</div></article>';
  }

  // Atualiza só as partes do card que mudam (sem tirar o cursor do campo).
  function patchCard(i) {
    var o = S.orders[i];
    var card = list.querySelector('.card[data-i="' + i + '"]');
    if (!card) return;
    card.classList.toggle('done', !!o.feito);
    card.classList.toggle('aberto', !!o.aberto);       // NOVO: aberto = mostra os campos para editar
    var b = card.querySelector('[data-act="feito"]');
    if (b) { b.setAttribute('aria-pressed', o.feito ? 'true' : 'false'); b.textContent = feitoLabel(o); }
    var a = $('anote-' + i); if (a) a.innerHTML = addrNote(o);
    var n = $('nnote-' + i); if (n) n.innerHTML = nameNote(o);
    var p = $('pay-' + i); if (p) p.innerHTML = payHTML(o, i);
    setPayCopy(i);
    patchResumo(i);                                    // NOVO: o resumo acompanha o que você edita
    updateSummary();
  }

  function renderList() {
    if (!S.orders.length) {
      list.innerHTML = '<div class="empty">Nenhum pedido na rota. Toque em «Colar pedidos do WhatsApp».</div>';
    } else {
      list.innerHTML = S.orders.map(cardHTML).join('');
    }
    var foot = $('foot');
    if (S.ignored) {
      foot.hidden = false;
      foot.textContent = plural(S.ignored, 'mensagem foi ignorada', 'mensagens foram ignoradas') + ' por não ter endereço e nome.';
    } else {
      foot.hidden = true;
    }
  }

  // Números do topo + estado do botão "Terminar rota".
  function updateSummary() {
    var n = S.orders.length, pend = 0, feitos = 0, din = 0, car = 0, pix = 0;
    S.orders.forEach(function (o) {
      if (pending(o) && !o.feito) pend++;
      if (o.feito) feitos++;
      var p = o.pay;
      if (p.amount != null) {
        if (p.kind === 'dinheiro') din += p.amount;
        else if (p.kind === 'cartao') car += p.amount;
        else if (p.kind === 'pix') pix += p.amount;
      }
    });
    var h = '<div><span class="lab">Entregues</span><b>' + feitos + '/' + n + '</b></div>' +
      '<div class="' + (pend ? 'w' : '') + '"><span class="lab">Conferir</span><b>' + pend + '</b></div>' +
      '<div><span class="lab">Dinheiro</span><b>' + esc(money(r2(din)) || 'R$0') + '</b></div>' +
      '<div><span class="lab">Cartão</span><b>' + esc(money(r2(car)) || 'R$0') + '</b></div>';
    if (pix > 0) h += '<div><span class="lab">Pix</span><b>' + esc(money(r2(pix))) + '</b></div>';
    $('sum').innerHTML = h;

    // NOVO: frase embaixo de "Rota atual" — "3 para entregar · 1 entregue"
    $('rotaSub').textContent = n ? (n - feitos) + ' para entregar · ' + feitos + (feitos === 1 ? ' entregue' : ' entregues') : 'Nenhum pedido ainda';

    $('copyall').disabled = !n;
    var hint = $('hintfim'), btn = $('terminar');
    var podeTerminar = ui.pronto && !!S.turno && !S.demo && n > 0;
    btn.disabled = !podeTerminar;
    if (S.demo && n) { hint.hidden = false; hint.textContent = 'Isto é um exemplo. Cole suas mensagens pra começar.'; }
    else if (!S.turno && n) { hint.hidden = false; hint.textContent = 'Abra as entregas no cartão do dia pra poder terminar a rota.'; }
    else hint.hidden = true;
  }

  // Área de "apagar serviço": um link, depois duas perguntas seguidas.
  // Só aparece se existir mais de um serviço (sempre sobra pelo menos um).
  function svcDelHTML() {
    if (S.servicos.length < 2) return '';
    var s = svc(S.servicoId), d = ui.delSvc;
    if (!d) return '';   // o botão "x" de apagar fica na pílula da empresa escolhida (renderServicos)
    if (d.step === 1) {
      return '<div class="notice warn">Deseja realmente apagar a empresa «' + esc(s.nome) + '»?</div>' +
        '<div class="row"><button class="b2" type="button" data-sd="sim1">Sim, apagar</button>' +
        '<button class="b2" type="button" data-sd="nao">Não</button></div>';
    }
    return '<div class="notice warn">Tem certeza mesmo? O valor por entrega e o mínimo de «' + esc(s.nome) + '» somem. ' +
      'As entregas já salvas hoje continuam no relatório.</div>' +
      '<div class="row"><button class="b2" type="button" data-sd="sim2">Apagar de vez</button>' +
      '<button class="b2" type="button" data-sd="nao">Cancelar</button></div>';
  }

  // Serviços: botões de escolha + "+ Novo".
  function renderServicos() {
    var h = S.servicos.map(function (s) {
      var sel = s.id === S.servicoId;
      var btn = '<button class="b2" type="button" data-sv="' + esc(s.id) + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' + esc(s.nome) + '</button>';
      // A empresa escolhida ganha um "x" para apagar (só com 2 ou mais empresas: nunca fica sem nenhuma).
      if (sel && S.servicos.length > 1) {
        return '<span class="sv-sel">' + btn + '<button class="sv-x" type="button" data-sd="pedir" aria-label="Apagar a empresa ' + esc(s.nome) + '">' + icones.svg('fechar', 16) + '</button></span>';
      }
      return btn;
    }).join('');
    h += '<button class="b2 plus" type="button" data-sv="__novo">+ Novo</button>';
    $('servicos').innerHTML = h;
    $('novo').hidden = !ui.novo;
    // Se você trocou de serviço no meio da pergunta, a pergunta some (ela era sobre o outro).
    if (ui.delSvc && ui.delSvc.id !== S.servicoId) ui.delSvc = null;
    $('svcdel').innerHTML = svcDelHTML();
    $('valorPadrao').value = fmtNum(svc(S.servicoId).valor);
    $('minimo').value = svc(S.servicoId).minimo > 0 ? fmtNum(svc(S.servicoId).minimo) : '';   // vazio = sem mínimo
        // NOVO: seletor de empresa da tela principal (aqui só se ESCOLHE; editar fica na aba Empresas).
    $('empSel').innerHTML = S.servicos.map(function (s) {
      return '<button class="b2" type="button" data-es="' + esc(s.id) + '" aria-pressed="' + (s.id === S.servicoId ? 'true' : 'false') + '">' + esc(s.nome) + '</button>';
    }).join('');
    $('empNome').textContent = svc(S.servicoId).nome;   // NOVO: nome da empresa escolhida, no chip
    renderEmpPop();
  }

  // NOVO — Mostra ou esconde a listinha de empresas do chip.
  function renderEmpPop() {
    $('empSel').hidden = !ui.empAberto;
    $('empChip').setAttribute('aria-expanded', ui.empAberto ? 'true' : 'false');
  }

  // Quando o valor padrão muda, os cards que você NÃO alterou na mão acompanham.
  function aplicarValorPadrao() {
    var v = svc(S.servicoId).valor;
    var cards = list.querySelectorAll('.card');
    S.orders.forEach(function (o, i) {
      if (o.valorManual) return;
      o.valor = v; o.valorTxt = fmtNum(v);
      var inp = cards[i] && cards[i].querySelector('[data-f="valorTxt"]');
      if (inp) inp.value = o.valorTxt;
    });
  }

  // Põe os pedidos em ordem alfabética pelo nome (sem diferenciar maiúscula nem acento), em DOIS GRUPOS:
  //   1º grupo: os que ainda faltam entregar (A-Z)
  //   2º grupo: os já entregues (A-Z), lá embaixo
  // Quem está sem nome vai pro fim do seu grupo; se dois nomes são iguais, fica a ordem em que vieram.
  // Ordena ao ler, ao inserir manual e ao marcar/desmarcar entregue. Se você só editar um nome, o card NÃO pula de lugar.
  // "semGrupos" = true ignora o entregue/não entregue e ordena só pelo nome (usado no relatório).
  function ordenarPorNome(arr, semGrupos) {
    return arr.map(function (o, i) { return { o: o, i: i }; }).sort(function (a, b) {
      if (!semGrupos) {
        var ga = a.o.feito ? 1 : 0, gb = b.o.feito ? 1 : 0;
        if (ga !== gb) return ga - gb;
      }
      var na = (a.o.name || '').trim(), nb = (b.o.name || '').trim();
      if (!na !== !nb) return na ? -1 : 1;
      var c = na.localeCompare(nb, 'pt-BR', { sensitivity: 'base' });
      return c || a.i - b.i;
    }).map(function (x) { return x.o; });
  }

  // Transforma o texto colado em cards.
  function lerPedidos(texto) {
    var r = parseOrders(texto);           // <- função do parser.js
    S.ignored = r.ignored;
    var v = svc(S.servicoId).valor;
    return ordenarPorNome(r.orders.map(function (o) {
      o.id = uid();
      o.refriText = o.refri.join(' + ');
      o.obsText = o.obs.join(' · ');
      o.feito = false;
      o.valor = v; o.valorTxt = fmtNum(v); o.valorManual = false;
      o.payTxt = fmtNum(o.pay.amount);          // texto dos campos de pagamento
      o.trocoTxt = fmtNum(o.pay.trocoPara);
      return o;
    }));
  }


  /* ----------------------------------------------------------
     4. BARRA DAS ENTREGAS DO DIA
     ---------------------------------------------------------- */

  function totais(t) {
    var n = 0, g = 0, din = 0, car = 0, pix = 0;
    t.rotas.forEach(function (r) {
      r.entregas.forEach(function (d) {
        n++; g += d.valor || 0;
        var p = d.pay || {};
        if (p.amount != null) {
          if (p.kind === 'dinheiro') din += p.amount;
          else if (p.kind === 'cartao') car += p.amount;
          else if (p.kind === 'pix') pix += p.amount;
        }
      });
    });
    // g = só o que as entregas rendem (é o que a barra do turno mostra durante o dia).
    // Se um serviço não bateu o mínimo garantido, o que falta é o "comp" (soma dos complementos);
    // total = g + comp é o valor final que vale no relatório.
    var comp = agrupar(t).reduce(function (a, gr) { return a + complementoDoGrupo(gr); }, 0);
    return { n: n, g: r2(g), comp: r2(comp), total: r2(g + comp), din: r2(din), car: r2(car), pix: r2(pix) };
  }

  // NOVO — O CARTÃO DO DIA (o grande, no topo da tela Corridas).
  //   Fechado: "Fechadas" + botão Abrir entregas.
  //   Aberto:  "Hoje · desde 11:17", valor ganho, "8 corridas · 2 rotas" e a barra do mínimo
  //            garantido da empresa escolhida. A setinha no canto abre a lista de rotas
  //            (com "Apagar rota") e o botão "Fechar entregas".
  function renderTurno() {
    var el = $('turno');
    if (!ui.pronto) { el.innerHTML = '<div class="dia"><span class="dia-l">Entregas do dia</span><p class="dia-s">Carregando seus dados…</p></div>'; return; }

    if (!S.turno) {
      el.innerHTML = '<div class="dia">' +
        '<span class="dia-l">Entregas do dia</span><b class="dia-t">Fechadas</b>' +
        '<p class="dia-s">Abra as entregas pra contar as corridas e gerar o relatório do dia.</p>' +
        '<button class="dia-btn" type="button" data-t="abrir">Abrir entregas</button></div>';
      return;
    }

    var t = S.turno, tt = totais(t);
    var quando = diaSeNaoHoje(t.abertoEm)
      ? 'Desde ' + diaSeNaoHoje(t.abertoEm) + hhmm(t.abertoEm)     // aberto em outro dia: "Desde 26/10 às 11:17"
      : 'Hoje · desde ' + hhmm(t.abertoEm);                         // aberto hoje: "Hoje · desde 11:17"

    // Barra do mínimo garantido (só se a empresa escolhida tem mínimo).
    var sv = svc(S.servicoId), barra = '';
    if (sv.minimo > 0) {
      var feito = 0;
      agrupar(t).forEach(function (g) { if (g.id === sv.id) feito = somaValor(g.entregas); });
      var pct = Math.max(0, Math.min(100, Math.round(feito / sv.minimo * 100)));
      barra = '<div class="dia-barra" role="progressbar" aria-label="Mínimo garantido" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
        '<span class="dia-m">' + (feito >= sv.minimo
          ? 'Mínimo de ' + moneyBR(sv.minimo) + ' garantido'
          : 'Faltam ' + moneyBR(r2(sv.minimo - feito)) + ' para o mínimo de ' + moneyBR(sv.minimo)) + '</span>';
    }

    // Lista de rotas já terminadas (com "Apagar rota") + botão Fechar entregas.
    var detalhes = '';
    if (ui.diaAberto) {
      var rotas = t.rotas.map(function (r, i) {
        var tot = r2(r.entregas.reduce(function (a, d) { return a + (d.valor || 0); }, 0));
        var linha = '<span class="n">Rota ' + (i + 1) + ' · ' + esc(r.servicoNome) + '</span>' +
                    '<span class="sub">' + plural(r.entregas.length, 'entrega', 'entregas') + ' · ' + money(tot) + ' · ' + hhmm(r.fimEm) + '</span>';
        var acao = ui.apagar === r.id
          ? '<span class="row"><button class="link" type="button" data-t="apagar-sim" data-r="' + r.id + '">Apagar de vez</button><button class="link" type="button" data-t="apagar-nao">Cancelar</button></span>'
          : '<button class="link" type="button" data-t="apagar" data-r="' + r.id + '">Apagar rota</button>';
        return '<li><div class="rl">' + linha + '</div>' + acao + '</li>';
      }).join('');
      detalhes = '<div class="dia-det">' +
        (rotas ? '<ul class="rotas">' + rotas + '</ul>' : '<p class="dia-s">Nenhuma rota terminada ainda.</p>') +
        '<button class="dia-btn" type="button" data-t="fechar">Fechar entregas</button></div>';
    }

    el.innerHTML = '<div class="dia">' +
      '<button class="dia-seta' + (ui.diaAberto ? ' on' : '') + '" type="button" data-t="detalhes" aria-expanded="' + (ui.diaAberto ? 'true' : 'false') + '" aria-label="Ver as rotas do dia e fechar as entregas">' + icones.svg('baixo', 22) + '</button>' +
      '<span class="dia-l">' + quando + '</span>' +
      '<b class="dia-valor">' + esc(moneyBR(tt.g)) + '</b>' +
      '<span class="dia-s">' + plural(tt.n, 'corrida', 'corridas') + ' · ' + plural(t.rotas.length, 'rota', 'rotas') + '</span>' +
      barra + detalhes + '</div>';
  }


  /* ----------------------------------------------------------
     5. TERMINAR ROTA
     ---------------------------------------------------------- */

  // NOVO: depois de mostrar o aviso, rola a tela até ele (a lista de cards agora é comprida).
  function showFim(html) {
    $('fim').innerHTML = html;
    try { $('fim').scrollIntoView({ block: 'center' }); } catch (e) {}
  }
  function clearFim() { $('fim').innerHTML = ''; }

  // Ação do botão "Terminar rota": decide se salva direto ou se pergunta antes.
  function terminarRota() {
    if (!S.turno || S.demo || !S.orders.length) return;
    var total = S.orders.length;
    var feitos = S.orders.filter(function (o) { return o.feito; }).length;

    if (feitos === total) { finalizar('todos'); return; }

    if (feitos === 0) {
      showFim('<div class="notice warn">Nenhum pedido está marcado como entregue.</div>' +
        '<div class="row"><button class="b2" type="button" data-fim="todos">Contar todos (' + total + ')</button>' +
        '<button class="b2" type="button" data-fim="cancelar">Cancelar</button></div>');
      return;
    }
    showFim('<div class="notice warn">' + feitos + ' de ' + total + ' marcados como entregues. Os outros não contam, a não ser que você escolha contar todos.</div>' +
      '<div class="row"><button class="b2" type="button" data-fim="marcados">Salvar só os ' + feitos + ' marcados</button>' +
      '<button class="b2" type="button" data-fim="todos">Contar todos (' + total + ')</button>' +
      '<button class="b2" type="button" data-fim="cancelar">Cancelar</button></div>');
  }

  // Guarda a rota dentro do turno e limpa a tela para a próxima.
  function finalizar(modo) {
    // No relatório a lista sai toda em ordem alfabética (sem separar entregues e pendentes).
    var lista = ordenarPorNome(S.orders.filter(function (o) { return modo === 'todos' || o.feito; }), true);
    if (!lista.length || !S.turno) return;
    var sv = svc(S.servicoId);
    S.turno.rotas.push({
      id: uid(),
      servicoId: sv.id,
      servicoNome: sv.nome,
      fimEm: new Date().toISOString(),
      entregas: lista.map(function (o) {
        return {
          id: uid(),
          name: (o.name || '').trim() || 'Sem nome',
          bairro: o.bairro || '',
          addr: o.addr || '',
          valor: o.valor || 0,
          servicoId: sv.id,
          pay: { kind: o.pay.kind, amount: o.pay.amount }
        };
      })
    });
    S.orders = []; S.texto = ''; S.ignored = 0; ta.value = '';
    clearFim();
    renderAll();
    setStatus('Rota salva: ' + plural(lista.length, 'entrega', 'entregas') + '.', 'ok');
    queueSave();
  }

  // Se a rota atual tem entregas marcadas e ainda não foi terminada,
  // pergunta antes de apagar. "proxima" é o que fazer se você confirmar.
  // "mantemManuais" = true quando a ação vai guardar os pedidos manuais (é o caso do Ler pedidos):
  // aí eles não entram na conta do aviso, porque não serão descartados.
  function seguroDescartar(proxima, mantemManuais) {
    var n = S.demo ? 0 : S.orders.filter(function (o) {
      return o.feito && !(mantemManuais && ehManual(o));
    }).length;
    if (!n) { proxima(); return; }
    ui.descartar = proxima;
    showFim('<div class="notice warn">Esta rota tem ' + plural(n, 'entrega marcada', 'entregas marcadas') + ' e ainda não foi terminada. Se continuar, elas não contam.</div>' +
      '<div class="row"><button class="b2" type="button" data-fim="descartar">Descartar rota</button>' +
      '<button class="b2" type="button" data-fim="voltar">Voltar</button></div>');
  }

  // Pedido digitado na mão (botão "Inserir dados manualmente"). Não vem do texto colado.
  // (Os cards antigos já salvos só têm time 'manual', por isso conferimos os dois.)
  function ehManual(o) { return !!o && (o.manual === true || o.time === 'manual'); }

  function lerDaCaixa() {
    S.texto = ta.value;
    // Os pedidos manuais não estão no texto colado, então o "Ler pedidos" não pode apagá-los:
    // guardamos antes de refazer a lista e colocamos de volta no fim.
    var manuais = S.demo ? [] : S.orders.filter(ehManual);
    S.demo = false;
    S.orders = ordenarPorNome(lerPedidos(S.texto).concat(manuais));
    clearFim();
    $('demo').hidden = true;
    abrirColar(false);                    // NOVO: terminou de ler: fecha a caixa de colar
    renderList(); updateSummary();
    queueSave();
  }

  function limparRota() {
    ta.value = ''; S.texto = ''; S.demo = false; S.orders = []; S.ignored = 0;
    $('demo').hidden = true;
    clearFim();
    renderList(); updateSummary();
    queueSave();
    ta.focus();
  }


  /* ----------------------------------------------------------
     6. RELATÓRIO DO DIA
     ---------------------------------------------------------- */

  // Junta as entregas por serviço, na ordem em que apareceram.
  function agrupar(t) {
    var ordem = [], mapa = {};
    t.rotas.forEach(function (r) {
      r.entregas.forEach(function (d) {
        var k = d.servicoId || r.servicoId;
        if (!mapa[k]) { mapa[k] = { id: k, nome: r.servicoNome, entregas: [] }; ordem.push(k); }
        mapa[k].entregas.push(d);
      });
    });
    return ordem.map(function (k) { return mapa[k]; });
  }

  // Valor padrão mostrado no relatório. Se o serviço já foi apagado, usa o da 1ª entrega dele.
  function valorDoGrupo(g) {
    var s = svcFind(g.id);
    return s ? s.valor : (g.entregas[0] ? g.entregas[0].valor : 0);
  }

  // Mínimo garantido do serviço do grupo (0 = não tem). Se o serviço foi apagado, não tem.
  function minimoDoGrupo(g) {
    var sv = svcFind(g.id);
    return sv && sv.minimo > 0 ? sv.minimo : 0;
  }

  // Quanto falta pra chegar no mínimo: 0 se já bateu ou se o serviço não tem mínimo.
  // (O mínimo vale pra soma de TODAS as rotas do dia daquele serviço.)
  function complementoDoGrupo(g) {
    var m = minimoDoGrupo(g);
    return m ? Math.max(0, r2(m - somaValor(g.entregas))) : 0;
  }

  // Frase que aparece embaixo do campo do mínimo no relatório.
  function minimoNota(g) {
    var m = minimoDoGrupo(g);
    if (!m) return '';
    var c = complementoDoGrupo(g);
    return c > 0 ? 'Não bateu o mínimo de ' + money(m) + ': completa +' + money(c) + '.' : 'Bateu o mínimo de ' + money(m) + '.';
  }

  function somaValor(arr) { return r2(arr.reduce(function (a, d) { return a + (d.valor || 0); }, 0)); }

  function saldoInfo(t, tt) {
    var a = t.adiantamento || 0;
    var s = r2(tt.total - a);
    if (s > 0) return { cls: 'warn', txt: 'A receber: ' + money(s) };
    if (s < 0) return { cls: 'ok', txt: 'Recebeu a mais: ' + money(-s) };
    return { cls: 'ok', txt: 'Tudo certo: saldo zerado' };
  }

  function clientesTxt(tt) {
    var p = [];
    if (tt.din) p.push('dinheiro ' + money(tt.din));
    if (tt.car) p.push('cartão ' + money(tt.car));
    if (tt.pix) p.push('Pix ' + money(tt.pix));
    return p.length ? 'Recebido dos clientes: ' + p.join(' · ') : 'Recebido dos clientes: nada';
  }

  function renderRel() {
    var t = S.turno, el = $('rel');
    if (!t) { ui.view = 'main'; renderAll(); return; }
    var grupos = agrupar(t), tt = totais(t);

    var h = '<header><h1>Relatório do dia</h1><p class="lead">' + dataDoTurno(t) + ' · aberto ' + (diaSeNaoHoje(t.abertoEm) ? 'em ' + diaSeNaoHoje(t.abertoEm) : 'às ') + hhmm(t.abertoEm) + '</p></header>';

    if (S.orders.length && !S.demo) {
      h += '<div class="notice warn">Tem uma rota sem terminar (' + plural(S.orders.length, 'pedido', 'pedidos') + '). Ela não entra no relatório. Volte e toque em Terminar rota.</div>';
    }
    if (!grupos.length) h += '<div class="empty">Nenhuma entrega salva ainda.</div>';

    grupos.forEach(function (g) {
      h += '<section class="rel-s">' +
        '<div class="rel-h"><b>' + esc(g.nome) + '</b><span id="sub-' + g.id + '">' + plural(g.entregas.length, 'entrega', 'entregas') + ' · ' + money(somaValor(g.entregas)) + '</span></div>' +
        '<div class="f"><label class="lab" for="bulk-' + g.id + '">Valor por entrega neste serviço (R$)</label>' +
          '<div class="row"><input class="in sm" id="bulk-' + g.id + '" inputmode="decimal" value="' + esc(fmtNum(valorDoGrupo(g))) + '" autocomplete="off">' +
          '<button class="b2" type="button" data-r="bulk" data-s="' + g.id + '">Aplicar a todas</button></div></div>' +
        (svcFind(g.id)
          ? '<div class="f"><label class="lab" for="min-' + g.id + '">Mínimo garantido neste serviço (R$)</label>' +
            '<input class="in sm" id="min-' + g.id + '" data-r="minimo" data-s="' + g.id + '" inputmode="decimal" placeholder="sem mínimo" value="' + esc(minimoDoGrupo(g) ? fmtNum(minimoDoGrupo(g)) : '') + '" autocomplete="off">' +
            '<span class="hint" id="mind-' + g.id + '"></span></div>'
          : '') +
        '<ul class="rel-l">' + g.entregas.map(function (d) {
          return '<li><span class="n">' + esc(d.name) + '</span>' +
            '<input class="in sm" data-r="valor" data-d="' + d.id + '" inputmode="decimal" aria-label="Valor de ' + esc(d.name) + '" value="' + esc(fmtNum(d.valor)) + '" autocomplete="off"></li>';
        }).join('') + '</ul></section>';
    });

    h += '<section class="rel-s">' +
      '<div class="rel-h"><b>Total</b><span id="tot-n"></span></div>' +
      '<div class="rel-g"><span class="lab">Ganho</span><b id="tot-g"></b></div>' +
      '<p class="hint" id="tot-m"></p>' +
      '<div class="f"><label class="lab" for="adiant">Adiantamento recebido (R$)</label>' +
        '<input class="in sm" id="adiant" inputmode="decimal" value="' + esc(t.adiantamento ? fmtNum(t.adiantamento) : '') + '" placeholder="0" autocomplete="off"></div>' +
      '<div class="notice" id="saldo"></div>' +
      '<p class="hint" id="tot-c"></p></section>';

    h += '<div class="row"><button class="b2" type="button" data-r="copiar" style="flex:1 1 auto">Copiar relatório</button>' +
         '<button class="b2" type="button" data-r="voltar">Voltar</button></div>' +
         '<button class="b1" type="button" data-r="confirmar">Confirmar fechamento</button>' +
         '<p class="hint">Ao confirmar, o relatório fica salvo e as entregas do dia zeram. Copie antes, se quiser mandar.</p>';

    el.innerHTML = h;
    patchRel();
  }

  // Atualiza só os números do relatório (enquanto você digita valores).
  function patchRel() {
    var t = S.turno; if (!t) return;
    var tt = totais(t);
    agrupar(t).forEach(function (g) {
      var s = $('sub-' + g.id);
      if (s) s.textContent = plural(g.entregas.length, 'entrega', 'entregas') + ' · ' + money(somaValor(g.entregas));
      var mn = $('mind-' + g.id); if (mn) mn.textContent = minimoNota(g);
    });
    var tm = $('tot-m');
    tm.textContent = tt.comp ? 'Inclui ' + money(tt.comp) + ' de complemento do mínimo garantido.' : '';
    tm.hidden = !tt.comp;
    $('tot-n').textContent = plural(tt.n, 'entrega', 'entregas');
    $('tot-g').textContent = money(tt.total) || 'R$0';
    var sd = saldoInfo(t, tt), sEl = $('saldo');
    sEl.className = 'notice ' + sd.cls; sEl.textContent = sd.txt;
    $('tot-c').textContent = clientesTxt(tt);
  }

  function relatorioTexto() {
    var t = S.turno, tt = totais(t), L = ['📋 RELATÓRIO DE ENTREGAS — ' + dataDoTurno(t), ''];
    agrupar(t).forEach(function (g) {
      L.push(g.nome + ' — ' + plural(g.entregas.length, 'entrega', 'entregas') + ' (' + money(somaValor(g.entregas)) + ')');
      g.entregas.forEach(function (d) { L.push('• ' + d.name + ' — ' + money(d.valor || 0)); });
      var cg = complementoDoGrupo(g);
      if (cg > 0) L.push('Complemento do mínimo garantido (' + money(minimoDoGrupo(g)) + '): +' + money(cg));
      L.push('');
    });
    L.push('Total: ' + plural(tt.n, 'entrega', 'entregas') + ' · ' + money(tt.total));
    if (t.adiantamento) L.push('Adiantamento: ' + money(t.adiantamento));
    L.push(saldoInfo(t, tt).txt);
    L.push(clientesTxt(tt));
    return L.join('\n');
  }

  function fecharTurno() {
    var t = S.turno;
    var arquivo = JSON.parse(JSON.stringify({ v: 1, turno: t, servicos: S.servicos, fechadoEm: new Date().toISOString() }));
    store.arquivar(t.id, arquivo).then(function () {
      S.turno = null; ui.view = 'main'; ui.apagar = null;
      renderAll();
      setStatus('Entregas fechadas. Relatório salvo.', 'ok');
      queueSave();
    }, function () {
      setStatus('Não consegui salvar o relatório. As entregas continuam abertas; tente de novo.', 'warn');
    });
  }


  /* ----------------------------------------------------------
     7. SALVAR E CARREGAR
     ---------------------------------------------------------- */

  var saveTimer = null, saving = false, again = false;

  // Pede pra salvar. Espera meio segundo parado pra juntar várias mudanças numa só.
  function queueSave() {
    if (!ui.pronto || ui.semSalvar) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  }

  function flush() {
    if (saving) { again = true; return; }   // já tem um salvamento em andamento: salva de novo depois
    saving = true;
    var copia = JSON.parse(JSON.stringify(S));   // cópia "limpa" (sem undefined)
    store.save(copia).then(function () {
      saving = false;
      ui.erroSalvar = false;
      if (again) { again = false; flush(); }
    }, function () {
      saving = false;
      ui.erroSalvar = true;
      setStatus('Não consegui salvar agora. Seus dados podem não estar guardados.', 'warn');
    });
  }

  // Junta o que estava salvo com o estado inicial (protege contra dados incompletos).
  function aplicarSalvo(saved) {
    if (!saved || saved.v !== 1) return;
    if (Array.isArray(saved.servicos) && saved.servicos.length) S.servicos = saved.servicos;
    // Serviços salvos antes do valor mínimo existir: o Paradise Food passa a ter R$70 (você pode mudar ou apagar), os outros ficam sem mínimo.
    S.servicos.forEach(function (sv) { if (sv.minimo === undefined) sv.minimo = sv.id === 'paradise' ? 70 : 0; });
    S.servicoId = saved.servicoId || S.servicoId;
    S.texto = typeof saved.texto === 'string' ? saved.texto : '';
    S.demo = !!saved.demo;
    S.orders = Array.isArray(saved.orders) ? saved.orders : [];
    // Pedidos salvos por versões antigas ainda não tinham os campos de texto do pagamento.
    S.orders.forEach(function (o) {
      if (o.payTxt === undefined) o.payTxt = fmtNum(o.pay.amount);
      if (o.trocoTxt === undefined) o.trocoTxt = fmtNum(o.pay.trocoPara);
    });
    S.ignored = saved.ignored || 0;
    S.turno = saved.turno || null;
    if (!S.servicos.some(function (s) { return s.id === S.servicoId; })) S.servicoId = S.servicos[0].id;
  }


  /* ----------------------------------------------------------
     8. COPIAR
     ---------------------------------------------------------- */

  function payText(o) {
    var p = o.pay;
    if (p.kind === 'pago') return '✅ Pago' + (p.via ? ' (' + p.via + ')' : '');
    if (p.kind === 'dinheiro' || p.kind === 'cartao' || p.kind === 'pix') {
      if (p.amount == null) return '⚠️ falta o valor (' + payLabel(p.kind) + ')';
      var icon = p.kind === 'cartao' ? '💳' : '💰';
      var s = icon + ' ' + money(p.amount) + ' receber ' + payLabel(p.kind);
      var t = trocoText(o);
      return t ? s + '\n   ' + t : s;
    }
    return '⚠️ ' + (p.amount != null ? money(p.amount) + ' confirmar forma de pagamento' : 'pagamento não informado');
  }

  function orderText(o, i) {
    var L = [(i + 1) + '. ' + nameText(o), '📍 ' + o.addr, payText(o)];
    if (o.refriText.trim()) L.push('🥤 ' + o.refriText.trim());
    if (o.obsText.trim()) L.push('📝 ' + o.obsText.trim());
    return L.join('\n');
  }

  function flash(btn, msg) {
    if (!btn) return;
    if (btn._t) clearTimeout(btn._t); else btn._o = btn.textContent;
    btn.textContent = msg;
    btn._t = setTimeout(function () { btn.textContent = btn._o; btn._t = null; }, 1300);
  }

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
     9. EVENTOS
     Usamos um "ouvinte" por área (e não um por botão): ele descobre
     qual botão foi tocado olhando os atributos data-... do elemento.
     ---------------------------------------------------------- */

  // Redesenha tudo (usado quando muda de tela ou ao carregar).
  // Barra inferior: qual "ir" (data-ir) corresponde a cada tela. O relatório conta como Corridas.
  var VIEW_DO_IR = { corridas: 'main', empresas: 'emp', historico: 'hist', perfil: 'perfil' };
  var IR_DA_VIEW = { main: 'corridas', rel: 'corridas', emp: 'empresas', hist: 'historico', perfil: 'perfil' };

  // Perfil: dados da conta e seletor de tema (Noite / Dia / Azul / Automático).
  function renderPerfil() {
    var u = (window.conta && conta.usuario && conta.usuario()) || {};
    var nome = primeiroNome();
    $('perfilLetra').textContent = (nome || 'M').charAt(0).toUpperCase();
    $('perfilNome').textContent = u.nome || nome || 'Motoboy';
    $('perfilEmail').textContent = u.email || '';
    var atual = window.tema ? tema.escolha() : 'noite';
    var h = '';
    var ops = window.tema ? tema.opcoes : [];
    for (var k = 0; k < ops.length; k++) {
      var on = ops[k].id === atual;
      h += '<button type="button" class="tema-op' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-tema="' + ops[k].id + '">' +
           '<i class="amostra amostra-' + ops[k].id + '" aria-hidden="true"></i><span>' + ops[k].nome + '</span></button>';
    }
    $('temas').innerHTML = h;
  }
  $('temas').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tema]');
    if (!b || !window.tema) return;
    tema.definir(b.getAttribute('data-tema'));
    renderPerfil();
  });

  function irPara(destino) {
    ui.view = VIEW_DO_IR[destino] || 'main';
    renderAll();
    window.scrollTo(0, 0);
  }
  $('navBaixo').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ir]');
    if (b) irPara(b.getAttribute('data-ir'));
  });
  $('avatar').addEventListener('click', function () { irPara('perfil'); });

  function renderAll() {
    $('main').hidden = ui.view !== 'main';
    $('turno').hidden = ui.view !== 'main';
    $('rel').hidden = ui.view !== 'rel';
    $('hist').hidden = ui.view !== 'hist';
    $('perfil').hidden = ui.view !== 'perfil';
        $('emp').hidden = ui.view !== 'emp';   // NOVO: a aba Empresas só aparece quando é a tela atual
    document.body.setAttribute('data-view', ui.view);   // NOVO: o CSS usa isso (faixa do tema Azul)
    renderTopo();                                        // NOVO: saudação, nome e avatar
    if (ui.view === 'perfil') renderPerfil();
    // NOVO: marca no menu qual é a tela atual
    var itensMenu = document.querySelectorAll('[data-ir]');
    for (var im = 0; im < itensMenu.length; im++) {
      var atual = itensMenu[im].getAttribute('data-ir') === (IR_DA_VIEW[ui.view] || 'corridas');
      itensMenu[im].setAttribute('aria-current', atual ? 'page' : 'false');
    }
    renderTurno();
    renderServicos();
    renderList();
    updateSummary();
    $('demo').hidden = !S.demo;
    if (ui.view === 'rel') renderRel();
  }

  // --- Cards ---
  list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var card = b.closest('.card');
    var i = +card.getAttribute('data-i');
    var o = S.orders[i];
    var act = b.getAttribute('data-act');

    if (act === 'copy-name') copyText(nameText(o), b, card.querySelector('[data-f="name"]'));
    else if (act === 'copy-addr') copyText(o.addr, b, card.querySelector('[data-f="addr"]'));
    else if (act === 'semend') { o.semEnd = !o.semEnd; patchCard(i); queueSave(); }
    else if (act === 'feito' || act === 'feito-sw') {
      // Entregue desce pro grupo de baixo; desmarcar volta pro grupo de cima (sempre em ordem alfabética).
      o.feito = !o.feito;
      S.orders = ordenarPorNome(S.orders);
      renderList(); updateSummary(); queueSave();
    }
    else if (act === 'toggle') { o.aberto = !o.aberto; patchCard(i); queueSave(); }   // NOVO: aberto = mostra os campos
    else if (act === 'copy-refri') copyText(o.refriText.trim(), b, card.querySelector('[data-f="refriText"]'));
    else if (act === 'copy-obs') copyText(o.obsText.trim(), b, card.querySelector('[data-f="obsText"]'));
    else if (act === 'copy-pay') copyText(payCopy(o), b, null);          // "R$48 - Dinheiro"
    else if (act === 'pay') {                                             // você escolheu a forma de pagamento
      var v = b.getAttribute('data-v');
      o.pay = { kind: v, amount: o.pay.amount, trocoPara: v === 'dinheiro' ? o.pay.trocoPara : null, via: '' };
      patchCard(i); queueSave();
    }
    else if (act === 'remover') { S.orders.splice(i, 1); renderList(); updateSummary(); queueSave(); }
  });

  list.addEventListener('input', function (e) {
    var t = e.target, f = t.getAttribute('data-f');
    if (!f) return;
    var card = t.closest('.card');
    var i = +card.getAttribute('data-i');
    var o = S.orders[i];
    o[f] = t.value;
    if (f === 'name') { o.warn = ''; patchCard(i); }
    else if (f === 'addr') patchCard(i);
    else if (f === 'refriText') {
      t.classList.toggle('has', !!t.value.trim());                        // pinta o campo quando tem refri
      var rb = $('refric-' + i); if (rb) rb.hidden = !t.value.trim();     // o botão Copiar só aparece se tem texto
    }
    else if (f === 'obsText') { var ob = $('obsc-' + i); if (ob) ob.hidden = !t.value.trim(); }
    else if (f === 'valorTxt') { o.valor = parseMoney(t.value); o.valorManual = true; }
    else if (f === 'payTxt') {                                            // valor a receber
      var n = parseMoney(t.value);
      o.pay.amount = n > 0 ? n : null;
      patchPayx(i);
    }
    else if (f === 'trocoTxt') {                                          // "troco pra quanto"
      var n2 = parseMoney(t.value);
      o.pay.trocoPara = n2 > 0 ? n2 : null;
      patchPayx(i);
    }
    patchResumo(i);          // NOVO: o resumo do card (nome, bairro, refri...) acompanha o que você digita
    queueSave();
  });

  // --- Serviços e valor padrão ---
  $('servicos').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sv]');
    if (!b) return;
    var id = b.getAttribute('data-sv');
    if (id === '__novo') { ui.novo = !ui.novo; renderServicos(); if (ui.novo) $('novoNome').focus(); return; }
    S.servicoId = id;
    renderServicos();
    aplicarValorPadrao();
    queueSave();
  });

  // NOVO: o chip da empresa abre e fecha a listinha; tocar fora dela também fecha.
  $('empChip').addEventListener('click', function (e) {
    e.stopPropagation();
    ui.empAberto = !ui.empAberto;
    renderEmpPop();
  });
  document.addEventListener('click', function () {
    if (ui.empAberto) { ui.empAberto = false; renderEmpPop(); }
  });

  // NOVO: escolher a empresa na tela principal (os botões da listinha do chip).
  $('empSel').addEventListener('click', function (e) {
    var b = e.target.closest('[data-es]');
    if (!b) return;
    ui.empAberto = false;
    S.servicoId = b.getAttribute('data-es');
    renderServicos();
    renderTurno();                  // NOVO: a barra do mínimo do cartão do dia é da empresa escolhida
    aplicarValorPadrao();
    queueSave();
  });

  // NOVO: o menu lateral (js/menu.js) avisa aqui qual tela abrir: 'corridas' ou 'empresas'.
  document.addEventListener('todoke:ir', function (e) {
    irPara(e.detail);
  });

  // Mínimo garantido do serviço que está na tela. Vazio ou 0 = sem mínimo.
  $('minimo').addEventListener('input', function (e) {
    svc(S.servicoId).minimo = parseMoney(e.target.value);
    queueSave();
  });

  $('valorPadrao').addEventListener('input', function (e) {
    svc(S.servicoId).valor = parseMoney(e.target.value);
    aplicarValorPadrao();
    queueSave();
  });

  $('novoOk').addEventListener('click', function () {
    var nome = $('novoNome').value.trim();
    if (!nome) return;
    var s = { id: 's' + uid(), nome: nome, valor: svc(S.servicoId).valor, minimo: 0 };   // começa com o valor do serviço atual e sem mínimo
    S.servicos.push(s);
    S.servicoId = s.id;
    ui.novo = false; $('novoNome').value = '';
    renderServicos();
    aplicarValorPadrao();
    queueSave();
  });

  // --- Apagar serviço (duas confirmações) ---
  function aoApagarEmpresa(e) {
    var b = e.target.closest('[data-sd]');
    if (!b) return;
    var a = b.getAttribute('data-sd');
    if (a === 'pedir') ui.delSvc = { id: S.servicoId, step: 1 };            // 1ª pergunta
    else if (a === 'sim1') ui.delSvc = { id: S.servicoId, step: 2 };        // "tem certeza mesmo?"
    else if (a === 'nao') ui.delSvc = null;                                  // desistiu
    else if (a === 'sim2') {                                                 // confirmou duas vezes: apaga
      if (S.servicos.length < 2) { ui.delSvc = null; renderServicos(); return; }
      var id = S.servicoId, nome = svc(id).nome;
      S.servicos = S.servicos.filter(function (s) { return s.id !== id; });
      S.servicoId = S.servicos[0].id;                                        // passa pro primeiro que sobrou
      ui.delSvc = null;
      renderServicos();
      aplicarValorPadrao();
      queueSave();
      setStatus('Empresa «' + nome + '» apagada.', 'ok');
      return;
    }
    renderServicos();
  }
  $('svcdel').addEventListener('click', aoApagarEmpresa);    // as perguntas de confirmação
  $('servicos').addEventListener('click', aoApagarEmpresa);  // o "x" na pílula da empresa

  // --- NOVO: botão "Colar pedidos do WhatsApp" ---
  // Abre (true) ou fecha (false) a caixa de colar na mão.
  function abrirColar(abrir) {
    $('colar').hidden = !abrir;
    if (abrir) { ta.focus(); try { $('colar').scrollIntoView({ block: 'nearest' }); } catch (e) {} }
  }

  // Tenta ler direto da área de transferência (o celular pode pedir permissão na 1ª vez).
  // Se não deixar, ou se não tiver nada, abre a caixa pra você colar na mão.
  $('colarBtn').addEventListener('click', function () {
    if (!ui.pronto) return;
    if (!(navigator.clipboard && navigator.clipboard.readText)) { abrirColar(true); return; }
    navigator.clipboard.readText().then(function (txt) {
      if (!txt || !txt.trim()) { abrirColar(true); return; }
      ta.value = txt;
      // Texto que não parece pedido (ex.: um link): não apaga a rota atual, só mostra pra você conferir.
      if (!parseOrders(txt).orders.length) {
        abrirColar(true);
        setStatus('Não encontrei pedidos no que você copiou. Confira o texto abaixo.', 'warn');
        return;
      }
      S.texto = txt;
      seguroDescartar(lerDaCaixa, true);
    }, function () { abrirColar(true); });
  });
  $('colarFechar').addEventListener('click', function () { abrirColar(false); });

  // --- Caixa de texto e botões da rota ---
  $('run').addEventListener('click', function () { seguroDescartar(lerDaCaixa, true); });
  $('clear').addEventListener('click', function () { seguroDescartar(limparRota); });
  ta.addEventListener('input', function () { S.texto = ta.value; $('demo').hidden = true; queueSave(); });
  ta.addEventListener('paste', function () { setTimeout(function () { seguroDescartar(lerDaCaixa, true); }, 0); });

  $('copyall').addEventListener('click', function (e) {
    var head = '📋 PEDIDOS (' + S.orders.length + ')\n\n';
    copyText(head + S.orders.map(orderText).join('\n\n'), e.currentTarget, null);
  });

  $('terminar').addEventListener('click', terminarRota);

  // Respostas dos avisos (Terminar rota / descartar).
  $('fim').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fim]');
    if (!b) return;
    var a = b.getAttribute('data-fim');
    if (a === 'todos') finalizar('todos');
    else if (a === 'marcados') finalizar('marcados');
    else if (a === 'cancelar') clearFim();
    else if (a === 'descartar') { var f = ui.descartar; ui.descartar = null; clearFim(); if (f) f(); }
    else if (a === 'voltar') { ui.descartar = null; ta.value = S.texto; clearFim(); }
  });

  // --- Botão "voltar" do celular: pergunta antes de sair ---
  // O navegador não deixa a página bloquear o "voltar". O truque é colocar uma entrada
  // "de enfeite" no histórico: quando você aperta voltar, só essa entrada é desfeita, a página
  // continua aqui e nós mostramos a pergunta. Se você ficar, a entrada é recolocada.
  var saindo = false;   // true = você já confirmou que quer sair

  function armarVoltar() {
    try { history.pushState({ leitor: 1 }, ''); } catch (e) { /* sem histórico: sem aviso, mas o app funciona */ }
  }

  if (window.addEventListener) {
    window.addEventListener('popstate', function () {
      if (saindo) return;
            // NOVO: se o menu lateral está aberto, o "voltar" só fecha o menu (e recoloca a entrada de enfeite).
      if (window.menu && menu.aberto()) { menu.fechar(); armarVoltar(); return; }
      // Salva já o que estiver esperando (o salvamento normal espera meio segundo).
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; flush(); }
      $('sairMsg').textContent = (ui.erroSalvar || ui.semSalvar)
        ? 'Atenção: não consegui salvar. Se sair, esta rota pode ser perdida.'
        : 'Suas entregas e a rota atual ficam salvas e voltam quando você abrir de novo.';
      $('sair').hidden = false;
      $('sairNao').focus();
    });
  }

  $('sairNao').addEventListener('click', function () {
    $('sair').hidden = true;
    saindo = false;                      // o aviso volta a funcionar
    $('sairSim').hidden = false;         // (o botão Sair pode ter sido escondido pelo código abaixo)
    armarVoltar();                       // recoloca a entrada de enfeite
  });

  $('sairSim').addEventListener('click', function () {
    saindo = true;                       // desliga o aviso: o próximo "voltar" sai de verdade
    try { history.back(); } catch (e) {}
    // Uma página web não consegue fechar o aplicativo sozinha. Se meio segundo depois a página
    // continua aqui, é porque não havia para onde voltar: então explicamos o que fazer.
    setTimeout(function () {
      $('sairMsg').textContent = 'Agora aperte o botão voltar do celular mais uma vez para sair.';
      $('sairSim').hidden = true;        // só sobra o botão Ficar
    }, 500);
  });

  armarVoltar();

  // --- Inserir pedido manualmente (quando ele não veio no padrão) ---
  var mForma = '';   // forma de pagamento escolhida na telinha ('' = ainda nenhuma)

  // Mostra os botões da forma de pagamento e só exibe o que faz sentido:
  // "Pago" não tem valor; "Troco pra" só existe em dinheiro.
  function mostrarForma() {
    var bs = $('mForma').querySelectorAll('[data-mf]');
    for (var i = 0; i < bs.length; i++) {
      bs[i].setAttribute('aria-pressed', bs[i].getAttribute('data-mf') === mForma ? 'true' : 'false');
    }
    $('mValores').hidden = mForma === 'pago';
    $('mTrocoBox').hidden = mForma !== 'dinheiro';
  }

  // Abre (true) ou fecha (false) a telinha. Ao abrir, começa com tudo em branco.
  function abrirManual(abrir) {
    $('manual').hidden = !abrir;
    $('manualBtn').hidden = abrir;
    if (!abrir) return;
    ['mNome', 'mBairro', 'mEnd', 'mValor', 'mTroco', 'mRefri', 'mObs'].forEach(function (id) { $(id).value = ''; });
    $('mErro').hidden = true;
    mForma = '';
    mostrarForma();
    $('mNome').focus();
  }

  // Monta o pedido com o que você digitou e coloca na lista, igual aos que vêm do WhatsApp.
  function adicionarManual() {
    var nome = $('mNome').value.trim(), end = $('mEnd').value.trim();
    if (!nome && !end) {
      $('mErro').hidden = false;
      $('mErro').textContent = 'Preencha pelo menos o nome ou o endereço.';
      return;
    }
    $('mErro').hidden = true;

    var valor = mForma !== 'pago' ? parseMoney($('mValor').value) : 0;
    var troco = mForma === 'dinheiro' ? parseMoney($('mTroco').value) : 0;
    var refri = $('mRefri').value.trim(), obs = $('mObs').value.trim();
    var vEntrega = svc(S.servicoId).valor;

    var o = {
      id: uid(),
      name: nome,
      bairro: $('mBairro').value.trim(),
      addr: end,
      semEnd: false,
      // Sem forma escolhida, o card pede a confirmação (kind "unknown"), como nos outros.
      pay: { kind: mForma || 'unknown', amount: valor > 0 ? valor : null, trocoPara: troco > 0 ? troco : null, via: '' },
      refri: [], obs: [], warn: '',
      manual: true,                             // marca: o "Ler pedidos" não apaga este card
      date: '', time: 'manual',                 // aparece "manual" no topo do card
      refriText: refri, obsText: obs,
      feito: false,
      valor: vEntrega, valorTxt: fmtNum(vEntrega), valorManual: false,
      payTxt: valor > 0 ? fmtNum(valor) : '',
      trocoTxt: troco > 0 ? fmtNum(troco) : ''
    };

    // Se ainda estavam na tela os pedidos de exemplo, eles saem para não se misturar com o real.
    if (S.demo) { S.orders = []; S.demo = false; S.texto = ''; ta.value = ''; $('demo').hidden = true; }

    S.orders.push(o);
    S.orders = ordenarPorNome(S.orders);        // o novo entra na ordem alfabética
    abrirManual(false);
    renderList(); updateSummary(); queueSave();

    var cards = list.querySelectorAll('.card');
    var ultimo = cards[S.orders.indexOf(o)];   // o card novo (agora pode estar no meio da lista)
    if (ultimo && ultimo.scrollIntoView) ultimo.scrollIntoView({ block: 'center' });
  }

  $('manualBtn').addEventListener('click', function () { abrirManual(true); });
  $('mCancel').addEventListener('click', function () { abrirManual(false); });
  $('mAdd').addEventListener('click', adicionarManual);
  $('mForma').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mf]');
    if (!b) return;
    mForma = b.getAttribute('data-mf');
    mostrarForma();
  });

  // --- Barra das entregas do dia ---
  $('turno').addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]');
    if (!b) return;
    var a = b.getAttribute('data-t');
    if (a === 'abrir') {
      S.turno = { id: uid(), abertoEm: new Date().toISOString(), adiantamento: null, rotas: [] };
      renderTurno(); updateSummary(); queueSave();
    }
    else if (a === 'detalhes') { ui.diaAberto = !ui.diaAberto; renderTurno(); }      // NOVO: setinha do cartão do dia
    else if (a === 'fechar') { ui.view = 'rel'; renderAll(); window.scrollTo(0, 0); }
    else if (a === 'apagar') { ui.apagar = b.getAttribute('data-r'); renderTurno(); }
    else if (a === 'apagar-nao') { ui.apagar = null; renderTurno(); }
    else if (a === 'apagar-sim') {
      var id = b.getAttribute('data-r');
      S.turno.rotas = S.turno.rotas.filter(function (r) { return r.id !== id; });
      ui.apagar = null; renderTurno(); queueSave();
    }
  });

  // --- Relatório ---
  $('rel').addEventListener('click', function (e) {
    var b = e.target.closest('[data-r]');
    if (!b || b.tagName === 'INPUT') return;
    var a = b.getAttribute('data-r');
    if (a === 'voltar') { ui.view = 'main'; renderAll(); window.scrollTo(0, 0); }
    else if (a === 'copiar') copyText(relatorioTexto(), b, null);
    else if (a === 'confirmar') fecharTurno();
    else if (a === 'bulk') {
      var sid = b.getAttribute('data-s');
      var v = parseMoney($('bulk-' + sid).value);
      var sv = svcFind(sid);
      if (sv) sv.valor = v;   // lembra como novo valor padrão do serviço (se ele ainda existir)
      S.turno.rotas.forEach(function (r) {
        r.entregas.forEach(function (d) { if ((d.servicoId || r.servicoId) === sid) d.valor = v; });
      });
      renderRel(); queueSave();
    }
  });

  $('rel').addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'adiant') { S.turno.adiantamento = parseMoney(t.value) || null; patchRel(); queueSave(); return; }
    if (t.getAttribute('data-r') === 'minimo') {                       // mínimo garantido do serviço, editado no relatório
      var sm = svcFind(t.getAttribute('data-s'));
      if (sm) { sm.minimo = parseMoney(t.value); patchRel(); queueSave(); }
      return;
    }
    if (t.getAttribute('data-r') !== 'valor') return;
    var did = t.getAttribute('data-d');
    S.turno.rotas.forEach(function (r) {
      r.entregas.forEach(function (d) { if (d.id === did) d.valor = parseMoney(t.value); });
    });
    patchRel(); queueSave();
  });


  /* ----------------------------------------------------------
     10. INÍCIO
     1) Mostra o exemplo na hora (a página nunca fica em branco).
     2) Em seguida carrega o que estava salvo e redesenha.
     ---------------------------------------------------------- */

  preencherIcones();                         // NOVO: coloca os ícones SVG nos botões do index.html

  // NOVO: o app.js carrega antes do login; quando o app aparece (depois de entrar), refaz a saudação.
  var mainEl = document.querySelector('main');
  if (window.MutationObserver && mainEl) {
    new MutationObserver(function () { if (!mainEl.hidden) renderTopo(); })
      .observe(mainEl, { attributes: true, attributeFilter: ['hidden'] });
  }

  ta.value = SAMPLE;
  ta.disabled = true;                        // trava a caixa até terminar de carregar
  S.orders = lerPedidos(SAMPLE);
  renderAll();

  store.init().then(function () {
    return store.load();
  }).then(function (saved) {
    aplicarSalvo(saved);
    ui.pronto = true;
    ta.disabled = false;
    ta.value = S.texto;
    renderAll();
    if (store.aviso) setStatus(store.aviso, 'info');
  }, function () {
    // Deu erro ao carregar: NÃO salvamos nada nesta visita, pra não apagar o que já existia.
    ui.pronto = true; ui.semSalvar = true;
    ta.disabled = false;
    renderAll();
    setStatus('Não consegui abrir seus dados salvos. Por segurança, nada será salvo agora. Recarregue a página.', 'warn');
  });

})();
