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
    // Serviços para os quais você entrega, cada um com o valor padrão por entrega.
    servicos: [
      { id: 'paradise', nome: 'Paradise Food', valor: 6 },
      { id: 'donamesa', nome: 'Dona Mesa', valor: 6 }
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
    delSvc: null       // apagar serviço: { id, step } (step 1 = 1ª pergunta, step 2 = "tem certeza?")
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
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

  // Acha um serviço pelo id. Devolve null se ele não existir mais (foi apagado).
  function svcFind(id) {
    for (var i = 0; i < S.servicos.length; i++) if (S.servicos[i].id === id) return S.servicos[i];
    return null;
  }
  // Igual, mas nunca devolve null: se não achar, usa o primeiro serviço.
  function svc(id) { return svcFind(id) || S.servicos[0]; }

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

  // Etiqueta do topo do card: Entregue (verde) / Conferir (laranja) / Pronto (verde).
  function chipInfo(o) {
    if (o.feito) return { cls: 'ok', txt: 'Entregue' };
    if (pending(o)) return { cls: 'warn', txt: 'Conferir' };
    return { cls: 'ok', txt: 'Pronto' };
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
    var chip = chipInfo(o), c = $('chip-' + i);
    if (c) { c.className = 'chip ' + chip.cls; c.textContent = chip.txt; }
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

  function cardHTML(o, i) {
    var chip = chipInfo(o);
    var when = (o.date + ' ' + o.time).trim() || 'sem data';
    return '<article class="card' + (o.feito ? ' done' : '') + '" data-i="' + i + '">' +
      '<header class="meta"><span class="idx">#' + (i + 1) + '</span><span>' + esc(when) + '</span>' +
      '<span class="chip ' + chip.cls + '" id="chip-' + i + '">' + chip.txt + '</span></header>' +
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
        '<div class="f"><span class="lab">Refri</span>' +
          '<input class="in refri' + (o.refriText ? ' has' : '') + '" data-f="refriText" aria-label="Refri" placeholder="sem refri" value="' + esc(o.refriText) + '" autocomplete="off"></div>' +

        // Observação
        '<div class="f"><span class="lab">Observação</span>' +
          '<input class="in" data-f="obsText" aria-label="Observação" placeholder="sem observação" value="' + esc(o.obsText) + '" autocomplete="off"></div>' +

        '<button class="link" type="button" data-act="remover">Remover este pedido</button>' +
      '</div></article>';
  }

  // Atualiza só as partes do card que mudam (sem tirar o cursor do campo).
  function patchCard(i) {
    var o = S.orders[i];
    var card = list.querySelector('.card[data-i="' + i + '"]');
    if (!card) return;
    var chip = chipInfo(o);
    var c = $('chip-' + i);
    if (c) { c.className = 'chip ' + chip.cls; c.textContent = chip.txt; }
    card.classList.toggle('done', !!o.feito);
    var b = card.querySelector('[data-act="feito"]');
    if (b) { b.setAttribute('aria-pressed', o.feito ? 'true' : 'false'); b.textContent = feitoLabel(o); }
    var a = $('anote-' + i); if (a) a.innerHTML = addrNote(o);
    var n = $('nnote-' + i); if (n) n.innerHTML = nameNote(o);
    var p = $('pay-' + i); if (p) p.innerHTML = payHTML(o, i);
    setPayCopy(i);
    updateSummary();
  }

  function renderList() {
    if (!S.orders.length) {
      list.innerHTML = '<div class="empty">Nenhum pedido na tela. Cole as mensagens da rota e toque em Ler pedidos.</div>';
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

    $('copyall').disabled = !n;
    var hint = $('hintfim'), btn = $('terminar');
    var podeTerminar = ui.pronto && !!S.turno && !S.demo && n > 0;
    btn.disabled = !podeTerminar;
    if (S.demo && n) { hint.hidden = false; hint.textContent = 'Isto é um exemplo. Cole suas mensagens pra começar.'; }
    else if (!S.turno && n) { hint.hidden = false; hint.textContent = 'Abra as entregas (lá em cima) pra poder terminar a rota.'; }
    else hint.hidden = true;
  }

  // Área de "apagar serviço": um link, depois duas perguntas seguidas.
  // Só aparece se existir mais de um serviço (sempre sobra pelo menos um).
  function svcDelHTML() {
    if (S.servicos.length < 2) return '';
    var s = svc(S.servicoId), d = ui.delSvc;
    if (!d) return '<button class="link" type="button" data-sd="pedir">Apagar «' + esc(s.nome) + '»</button>';
    if (d.step === 1) {
      return '<div class="notice warn">Você deseja realmente apagar o serviço «' + esc(s.nome) + '»?</div>' +
        '<div class="row"><button class="b2" type="button" data-sd="sim1">Sim, apagar</button>' +
        '<button class="b2" type="button" data-sd="nao">Não</button></div>';
    }
    return '<div class="notice warn">Tem certeza mesmo? O valor por entrega de «' + esc(s.nome) + '» some. ' +
      'As entregas já salvas hoje continuam no relatório.</div>' +
      '<div class="row"><button class="b2" type="button" data-sd="sim2">Apagar de vez</button>' +
      '<button class="b2" type="button" data-sd="nao">Cancelar</button></div>';
  }

  // Serviços: botões de escolha + "+ Novo".
  function renderServicos() {
    var h = S.servicos.map(function (s) {
      return '<button class="b2" type="button" data-sv="' + esc(s.id) + '" aria-pressed="' + (s.id === S.servicoId ? 'true' : 'false') + '">' + esc(s.nome) + '</button>';
    }).join('');
    h += '<button class="b2 plus" type="button" data-sv="__novo">+ Novo</button>';
    $('servicos').innerHTML = h;
    $('novo').hidden = !ui.novo;
    // Se você trocou de serviço no meio da pergunta, a pergunta some (ela era sobre o outro).
    if (ui.delSvc && ui.delSvc.id !== S.servicoId) ui.delSvc = null;
    $('svcdel').innerHTML = svcDelHTML();
    $('valorPadrao').value = fmtNum(svc(S.servicoId).valor);
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

  // Transforma o texto colado em cards.
  function lerPedidos(texto) {
    var r = parseOrders(texto);           // <- função do parser.js
    S.ignored = r.ignored;
    var v = svc(S.servicoId).valor;
    return r.orders.map(function (o) {
      o.id = uid();
      o.refriText = o.refri.join(' + ');
      o.obsText = o.obs.join(' · ');
      o.feito = false;
      o.valor = v; o.valorTxt = fmtNum(v); o.valorManual = false;
      o.payTxt = fmtNum(o.pay.amount);          // texto dos campos de pagamento
      o.trocoTxt = fmtNum(o.pay.trocoPara);
      return o;
    });
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
    return { n: n, g: r2(g), din: r2(din), car: r2(car), pix: r2(pix) };
  }

  function renderTurno() {
    var el = $('turno');
    if (!ui.pronto) { el.innerHTML = '<div class="turno-box"><span class="lab">Entregas</span><p class="hint">Carregando seus dados…</p></div>'; return; }

    if (!S.turno) {
      el.innerHTML = '<div class="turno-box">' +
        '<span class="lab">Entregas do dia</span><b class="turno-t">Fechadas</b>' +
        '<p class="hint">Abra as entregas pra contar as corridas e gerar o relatório do dia.</p>' +
        '<button class="b1" type="button" data-t="abrir">Abrir entregas</button></div>';
      return;
    }

    var t = S.turno, tt = totais(t);
    var rotas = t.rotas.map(function (r, i) {
      var tot = r2(r.entregas.reduce(function (a, d) { return a + (d.valor || 0); }, 0));
      var linha = '<span class="n">Rota ' + (i + 1) + ' · ' + esc(r.servicoNome) + '</span>' +
                  '<span class="sub">' + plural(r.entregas.length, 'entrega', 'entregas') + ' · ' + money(tot) + ' · ' + hhmm(r.fimEm) + '</span>';
      var acao = ui.apagar === r.id
        ? '<span class="row"><button class="link" type="button" data-t="apagar-sim" data-r="' + r.id + '">Apagar de vez</button><button class="link" type="button" data-t="apagar-nao">Cancelar</button></span>'
        : '<button class="link" type="button" data-t="apagar" data-r="' + r.id + '">Apagar rota</button>';
      return '<li><div class="rl">' + linha + '</div>' + acao + '</li>';
    }).join('');

    el.innerHTML = '<div class="turno-box open">' +
      '<span class="lab">Entregas abertas desde ' + hhmm(t.abertoEm) + '</span>' +
      '<div class="turno-nums">' +
        '<div><span class="lab">Corridas</span><b>' + tt.n + '</b></div>' +
        '<div><span class="lab">Ganho</span><b>' + esc(money(tt.g) || 'R$0') + '</b></div>' +
        '<div><span class="lab">Rotas</span><b>' + t.rotas.length + '</b></div>' +
      '</div>' +
      (rotas ? '<ul class="rotas">' + rotas + '</ul>' : '<p class="hint">Nenhuma rota terminada ainda.</p>') +
      '<button class="b1" type="button" data-t="fechar">Fechar entregas</button></div>';
  }


  /* ----------------------------------------------------------
     5. TERMINAR ROTA
     ---------------------------------------------------------- */

  function showFim(html) { $('fim').innerHTML = html; }
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
    var lista = S.orders.filter(function (o) { return modo === 'todos' || o.feito; });
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
  function seguroDescartar(proxima) {
    var n = S.demo ? 0 : S.orders.filter(function (o) { return o.feito; }).length;
    if (!n) { proxima(); return; }
    ui.descartar = proxima;
    showFim('<div class="notice warn">Esta rota tem ' + plural(n, 'entrega marcada', 'entregas marcadas') + ' e ainda não foi terminada. Se continuar, elas não contam.</div>' +
      '<div class="row"><button class="b2" type="button" data-fim="descartar">Descartar rota</button>' +
      '<button class="b2" type="button" data-fim="voltar">Voltar</button></div>');
  }

  function lerDaCaixa() {
    S.texto = ta.value;
    S.demo = false;
    S.orders = lerPedidos(S.texto);
    clearFim();
    $('demo').hidden = true;
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

  function somaValor(arr) { return r2(arr.reduce(function (a, d) { return a + (d.valor || 0); }, 0)); }

  function saldoInfo(t, tt) {
    var a = t.adiantamento || 0;
    var s = r2(tt.g - a);
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

    var h = '<header><h1>Relatório do dia</h1><p class="lead">' + ddmm(t.abertoEm) + ' · aberto às ' + hhmm(t.abertoEm) + '</p></header>';

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
        '<ul class="rel-l">' + g.entregas.map(function (d) {
          return '<li><span class="n">' + esc(d.name) + '</span>' +
            '<input class="in sm" data-r="valor" data-d="' + d.id + '" inputmode="decimal" aria-label="Valor de ' + esc(d.name) + '" value="' + esc(fmtNum(d.valor)) + '" autocomplete="off"></li>';
        }).join('') + '</ul></section>';
    });

    h += '<section class="rel-s">' +
      '<div class="rel-h"><b>Total</b><span id="tot-n"></span></div>' +
      '<div class="rel-g"><span class="lab">Ganho</span><b id="tot-g"></b></div>' +
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
    });
    $('tot-n').textContent = plural(tt.n, 'entrega', 'entregas');
    $('tot-g').textContent = money(tt.g) || 'R$0';
    var sd = saldoInfo(t, tt), sEl = $('saldo');
    sEl.className = 'notice ' + sd.cls; sEl.textContent = sd.txt;
    $('tot-c').textContent = clientesTxt(tt);
  }

  function relatorioTexto() {
    var t = S.turno, tt = totais(t), L = ['📋 RELATÓRIO DE ENTREGAS — ' + ddmm(t.abertoEm), ''];
    agrupar(t).forEach(function (g) {
      L.push(g.nome + ' — ' + plural(g.entregas.length, 'entrega', 'entregas') + ' (' + money(somaValor(g.entregas)) + ')');
      g.entregas.forEach(function (d) { L.push('• ' + d.name + ' — ' + money(d.valor || 0)); });
      L.push('');
    });
    L.push('Total: ' + plural(tt.n, 'entrega', 'entregas') + ' · ' + money(tt.g));
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
      if (again) { again = false; flush(); }
    }, function () {
      saving = false;
      setStatus('Não consegui salvar agora. Seus dados podem não estar guardados.', 'warn');
    });
  }

  // Junta o que estava salvo com o estado inicial (protege contra dados incompletos).
  function aplicarSalvo(saved) {
    if (!saved || saved.v !== 1) return;
    if (Array.isArray(saved.servicos) && saved.servicos.length) S.servicos = saved.servicos;
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
  function renderAll() {
    $('main').hidden = ui.view !== 'main';
    $('turno').hidden = ui.view !== 'main';
    $('rel').hidden = ui.view !== 'rel';
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
    else if (act === 'feito') { o.feito = !o.feito; patchCard(i); queueSave(); }
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
    else if (f === 'refriText') t.classList.toggle('has', !!t.value.trim());
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

  $('valorPadrao').addEventListener('input', function (e) {
    svc(S.servicoId).valor = parseMoney(e.target.value);
    aplicarValorPadrao();
    queueSave();
  });

  $('novoOk').addEventListener('click', function () {
    var nome = $('novoNome').value.trim();
    if (!nome) return;
    var s = { id: 's' + uid(), nome: nome, valor: svc(S.servicoId).valor };   // começa com o valor do serviço atual
    S.servicos.push(s);
    S.servicoId = s.id;
    ui.novo = false; $('novoNome').value = '';
    renderServicos();
    aplicarValorPadrao();
    queueSave();
  });

  // --- Apagar serviço (duas confirmações) ---
  $('svcdel').addEventListener('click', function (e) {
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
      setStatus('Serviço «' + nome + '» apagado.', 'ok');
      return;
    }
    renderServicos();
  });

  // --- Caixa de texto e botões da rota ---
  $('run').addEventListener('click', function () { seguroDescartar(lerDaCaixa); });
  $('clear').addEventListener('click', function () { seguroDescartar(limparRota); });
  ta.addEventListener('input', function () { S.texto = ta.value; $('demo').hidden = true; queueSave(); });
  ta.addEventListener('paste', function () { setTimeout(function () { seguroDescartar(lerDaCaixa); }, 0); });

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

  // --- Barra das entregas do dia ---
  $('turno').addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]');
    if (!b) return;
    var a = b.getAttribute('data-t');
    if (a === 'abrir') {
      S.turno = { id: uid(), abertoEm: new Date().toISOString(), adiantamento: null, rotas: [] };
      renderTurno(); updateSummary(); queueSave();
    }
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
