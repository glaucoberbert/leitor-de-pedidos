/* ============================================================
   parser.js  —  O "cérebro" do projeto
   ------------------------------------------------------------
   Recebe o texto copiado do WhatsApp e devolve uma lista de
   pedidos organizados.

   NÃO usa inteligência artificial. Usa REGRAS: o programa
   procura padrões no texto (como "PAGO", "R$", "CEP") e
   decide o que cada linha significa. Por isso o resultado é
   sempre igual para a mesma mensagem.

   Este arquivo não mexe na tela (HTML). Ele só pega texto e
   devolve dados. Isso é de propósito: dá pra testar no Node,
   sem navegador (veja test/testar.js).

   Etapas:
     1. Separar as mensagens        (splitMessages)
     2. Ler o endereço              (parseAddress e ajudantes)
     3. Ler o pagamento             (parsePay)
     4. Achar o refri               (fmtRefri, REFRI_RE)
     5. Montar um pedido completo   (parseBody)
     6. Função principal            (parseOrders)
   ============================================================ */


/* ------------------------------------------------------------
   FUNÇÕES AJUDANTES (pequenas ferramentas usadas em todo lugar)
   ------------------------------------------------------------ */

// Tira os acentos: "Açúcar" vira "Acucar".
// Assim "CARTÃO" e "cartao" passam a ser a mesma coisa na hora de comparar.
// normalize('NFD') separa a letra do acento; o replace apaga só os acentos.
function noAccent(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Deixa o texto "comparável": sem acento, minúsculo, só letras e números.
// Usado para saber se dois textos são "o mesmo" ("Rua São Geraldo" = "rua sao geraldo").
function norm(s) {
  return noAccent(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// O texto está todo em maiúsculas ou todo em minúsculas?
function isUniform(s) {
  return s === s.toUpperCase() || s === s.toLowerCase();
}

// "MARIA DA SILVA" -> "Maria da Silva"
function titleCase(s) {
  return s.toLowerCase()
    // coloca em maiúscula a letra que vem no começo ou depois de espaço, ponto, "(" ou "-"
    // (\p{L} = qualquer letra, inclusive com acento; a flag "u" liga isso)
    .replace(/(^|[\s.(\-])(\p{L})/gu, function (m, p, c) { return p + c.toUpperCase(); })
    // palavras pequenas ficam minúsculas no meio do nome: "de", "da", "do"...
    .replace(/(\s)(De|Da|Do|Das|Dos|E)(?=\s)/g, function (m, sp, w) { return sp + w.toLowerCase(); });
}

// Só arruma a capitalização se o texto estiver "gritando" (tudo maiúsculo)
// ou tudo minúsculo. Se já estiver misturado ("Maria Paula"), deixa como está.
function smartCase(s) {
  return isUniform(s) ? titleCase(s) : s;
}


/* ------------------------------------------------------------
   ETAPA 1 — SEPARAR AS MENSAGENS
   O WhatsApp coloca um cabeçalho antes de cada mensagem:
       [18/10, 12:27] Nome do contato: texto da mensagem
   Vamos usar esse cabeçalho como "divisória" entre os pedidos.
   ------------------------------------------------------------ */

// Dois formatos de cabeçalho: iPhone (com colchetes) e Android (com hífen).
// Cada regex captura: (1) a data, (2) a hora, (3) quem enviou.
var HEADERS = [
  // [18/10, 12:27] Fulano:
  { src: '^\\[(\\d{1,2}\\/\\d{1,2})(?:\\/\\d{2,4})?,?\\s+(\\d{1,2}:\\d{2})(?::\\d{2})?\\]\\s*([^:\\n]{1,80}?):[ \\t]?', fl: 'gm' },
  // 18/10/2026 12:27 - Fulano:
  { src: '^(\\d{1,2}\\/\\d{1,2})\\/\\d{2,4},?\\s+(\\d{1,2}:\\d{2})(?::\\d{2})?\\s+-\\s+([^:\\n]{1,80}?):[ \\t]?', fl: 'gm' }
];

// Recebe o texto inteiro e devolve uma lista: [{date, time, body}, ...]
// "body" é o texto da mensagem sem o cabeçalho.
function splitMessages(text) {
  // Tira caracteres invisíveis que o WhatsApp às vezes coloca.
  text = text.replace(/\r/g, '').replace(/[‎‏‪-‮]/g, '');

  // Tenta cada formato de cabeçalho até achar um que funcione.
  for (var k = 0; k < HEADERS.length; k++) {
    var re = new RegExp(HEADERS[k].src, HEADERS[k].fl);
    var hits = [], m;
    // re.exec vai achando um cabeçalho por vez; guardamos onde cada um começa e termina.
    while ((m = re.exec(text))) {
      hits.push({ idx: m.index, end: m.index + m[0].length, date: m[1], time: m[2] });
    }
    if (hits.length) {
      var out = [];
      // Se tinha texto ANTES do primeiro cabeçalho, também é um pedido (sem data).
      var lead = text.slice(0, hits[0].idx);
      if (lead.trim()) out.push({ date: '', time: '', body: lead });
      // A mensagem vai do fim de um cabeçalho até o começo do próximo.
      for (var i = 0; i < hits.length; i++) {
        out.push({
          date: hits[i].date,
          time: hits[i].time,
          body: text.slice(hits[i].end, i + 1 < hits.length ? hits[i + 1].idx : text.length)
        });
      }
      return out;
    }
  }
  // Nenhum cabeçalho: trata o texto todo como UM pedido.
  return [{ date: '', time: '', body: text }];
}


/* ------------------------------------------------------------
   ETAPA 2 — ENDEREÇO
   Existem dois jeitos de o endereço chegar:

   A) "Completo" (gerado pelo sistema do restaurante), separado por " - ":
      R. Osvaldo Cruz, 201 - Casa - Barra , Muriaé/MG - CEP 36880-000 - Ao lado da garagem
      rua+número - complemento - bairro , cidade/UF - CEP - referência

   B) "Digitado pelo cliente", sem padrão:
      Rua santa Catarina nº 209 vale verde
      Rua Vanessa tureta n78 bairro Santo Antônio

   Para cada um temos uma função. No fim o resultado é sempre:
      addr   -> "Rua X, 123"   (o que vai pro Spoke)
      bairro -> "Barra"
      extras -> ["Casa de cima", "Atrás do posto"]  (vão pra observação)
   ------------------------------------------------------------ */

// Palavras que sozinhas NÃO são um nome de rua (para não confundir "Rua 7 de Setembro").
var TYPE_ONLY = /^(r|rua|av|avenida|al|alameda|tv|travessa|beco|estrada|rodovia|rod|praca|pca|pc|br|mg)\.?$/i;

// Jeitos de escrever "número": "nº", "n", "n.", "no", "número", "num".
// Fica numa string porque vamos montar regex maiores usando ela.
var NUM_PREFIX = '(?:n[º°o]?\\.?|n[uú]mero|num\\.?)';

// Complementos que aparecem logo depois do número: "apt 802", "bloco B", "casa", "fundos"...
var COMP_RE = /^(?:ap(?:to|artamento|t)?\.?\s*\d+[a-z]?|bloco\s*\w+|casa\s*\d*|fundos|loja\s*\w*|sala\s*\w*|\d+\s*[ºo°]?\s*andar)(?=$|[\s,.\-])/i;

// Texto que COMEÇA como nome de rua (usado para perceber que é referência, não bairro).
var STREET_START = /^(r|rua|av|avenida|al|alameda|tv|travessa|beco|estrada|rodovia)\b\.?/i;

// "nº 209" -> "209"   |   "06" -> "6"
function cleanNum(n) {
  n = n.replace(new RegExp('^' + NUM_PREFIX + '\\s*', 'i'), '').trim();
  if (/^\d+$/.test(n) && n.length > 1) n = String(parseInt(n, 10)); // tira zero à esquerda
  return n;
}

// Arruma o nome da rua: tira espaços sobrando e abreviações do começo.
// "R. Osvaldo Cruz" -> "Rua Osvaldo Cruz"
function fixStreet(st) {
  st = st.replace(/\s+/g, ' ').replace(/[\s,\-]+$/, '').trim();
  return st.replace(/^R\.?\s+/i, 'Rua ').replace(/^Av\.?\s+/i, 'Avenida ')
    .replace(/^Tv\.?\s+/i, 'Travessa ').replace(/^Al\.?\s+/i, 'Alameda ');
}

// Separa "rua" e "número" de um texto como "Rua Santa Marcelina 203 Santa Terezinha".
// Devolve { street, number, rest }  (rest = o que sobrou depois do número)
function splitStreetNumber(s) {
  s = s.trim();
  var m;

  // Tentativa 1: número depois de uma vírgula ("Rua Vicente Alves , 70 AP.103").
  // Só vale se o texto antes da vírgula não termina em número.
  var comma = new RegExp(',\\s*(' + NUM_PREFIX + '\\s*)?(\\d+[A-Za-z]?)(?![\\d])', 'i');
  m = comma.exec(s);
  if (m) {
    var bef = s.slice(0, m.index).trim();
    if (bef && !/\d$/.test(bef) && !TYPE_ONLY.test(noAccent(bef))) {
      return { street: bef, number: cleanNum(m[2]), rest: s.slice(m.index + m[0].length) };
    }
  }

  // Tentativa 2: o primeiro número solto no texto.
  // (^|[\s,]) = o número tem que começar o texto ou vir depois de espaço/vírgula.
  var re = new RegExp('(^|[\\s,])(' + NUM_PREFIX + '\\s*)?(\\d+[A-Za-z]?)(?![\\d])', 'gi');
  while ((m = re.exec(s))) {
    var start = m.index + m[1].length;
    var before = s.slice(0, start).replace(/[\s,\-]+$/, '');
    // Se antes do número só tem "Rua" (ex.: "Rua 7 de Setembro"), esse número é do nome da rua. Pula.
    if (!before || TYPE_ONLY.test(noAccent(before))) continue;
    return { street: before, number: cleanNum(m[3]), rest: s.slice(m.index + m[0].length) };
  }

  // Tentativa 3: "s/n" (sem número).
  var sn = /(^|[\s,])(s\/?n)(?=$|[\s,])/i.exec(s);
  if (sn) return { street: s.slice(0, sn.index), number: 's/n', rest: s.slice(sn.index + sn[0].length) };

  // Não achou número nenhum: devolve o texto todo como "rua".
  // (É assim que "Pronto socorro, Hospital X" passa; o aviso na tela cuida do resto.)
  return { street: s, number: '', rest: '' };
}

// Endereço digitado pelo cliente (sem padrão).
function parseInformal(s) {
  var r = splitStreetNumber(s);
  var extras = [], bairro = '';

  // Depois do número pode vir: complemento(s), bairro e/ou referência.
  var rest = (r.rest || '').replace(/^[\s,\-–.]+/, '');

  // 1) Tira os complementos do começo ("apt 802", "casa"...), um por vez.
  while (rest) {
    var m = rest.match(COMP_RE);
    if (!m) break;
    extras.push(m[0].trim());
    rest = rest.slice(m[0].length).replace(/^[\s,\-–.]+/, '');
  }

  // 2) O que sobrou é o bairro? Tira a palavra "bairro" do começo, se tiver.
  rest = rest.replace(/^(bairro|b\.|bº)\s*/i, '').trim();
  if (rest) {
    // Se começa como rua ou é comprido demais, é uma referência ("Rua do campo, rua sem saída").
    if (STREET_START.test(noAccent(rest)) || rest.split(/\s+/).length > 4) extras.push(rest);
    else bairro = rest.replace(/[.,;]+$/, ''); // senão, é o bairro
  }
  return { street: fixStreet(r.street), number: r.number, bairro: bairro, extras: extras };
}

// Parece um complemento? ("Casa", "Ap 3", "Bloco A"...)
function looksComp(x) {
  return /^(casa|ap|apt|apto|apartamento|bloco|fundos|frente|loja|sala|sobrado|predio|\d)/i.test(noAccent(x));
}

// Endereço "completo", já dividido em pedaços pelo " - ".
// segs = ["R. Osvaldo Cruz, 201", "Casa", "Barra , Muriaé/MG", "CEP 36880-000", "Ao lado da garagem"]
function parseSegmented(segs) {
  var street, number, extras = [], bairro = '';

  // O 1º pedaço é "rua, número". Pegamos a ÚLTIMA vírgula, assim ruas com
  // número no nome ("Beco Rio Branco 2, 20") funcionam.
  var lc = segs[0].match(new RegExp('^(.*\\S)\\s*,\\s*((?:' + NUM_PREFIX + '\\s*)?\\d+[A-Za-z]?|s\\/?n)$', 'i'));
  if (lc) {
    street = fixStreet(lc[1]);
    number = cleanNum(lc[2]);
  } else {
    // Não veio no formato "rua, número": usa o método geral.
    var h = splitStreetNumber(segs[0]);
    street = fixStreet(h.street);
    number = h.number;
    if (h.rest && h.rest.replace(/[\s,\-–.]+/g, '')) extras.push(h.rest.trim());
  }

  var tail = segs.slice(1);                                  // o que vem depois da rua
  var isCep = function (x) { return /^CEP\b/i.test(x); };

  // Procura o pedaço que tem "Cidade/UF" (ex.: "Muriaé/MG"): o bairro vem logo antes da vírgula.
  var cityIdx = -1;
  for (var i = 0; i < tail.length; i++) {
    if (/\/\s*[A-Z]{2}\s*$/.test(tail[i])) { cityIdx = i; break; }
  }

  var pre, post; // pre = complementos (antes do bairro) | post = referência (depois do CEP)
  if (cityIdx >= 0) {
    pre = tail.slice(0, cityIdx);
    // "Barra , Muriaé/MG"  ->  bairro = "Barra"
    var cm = tail[cityIdx].match(/^(.*?)\s*,\s*[^,]*\/\s*[A-Z]{2}\s*$/);
    bairro = cm ? cm[1].trim() : '';
    post = tail.slice(cityIdx + 1).filter(function (x) { return !isCep(x); });
  } else {
    // Sem cidade no texto: usa o CEP (se tiver) como divisória.
    var cepI = -1;
    for (var j = 0; j < tail.length; j++) { if (isCep(tail[j])) { cepI = j; break; } }
    var p = cepI >= 0 ? tail.slice(0, cepI) : tail;
    post = cepI >= 0 ? tail.slice(cepI + 1) : [];
    pre = [];
    if (p.length >= 2) { pre = p.slice(0, -1); bairro = p[p.length - 1]; }   // [complemento, bairro]
    else if (p.length === 1) {
      if (looksComp(p[0])) pre = [p[0]]; else bairro = p[0];                 // 1 pedaço só: ou é complemento ou bairro
    }
  }

  // Complementos viram observação, menos os inúteis ("Casa", número repetido, nome da rua repetido).
  pre.forEach(function (c) {
    var n = norm(c);
    if (!n || n === 'casa' || n === norm(number) || n === norm(street)) return;
    if (n.indexOf(' ') < 0 && norm(street).split(' ').indexOf(n) >= 0) return; // ex.: "Beco" dentro de "Beco Rio Branco"
    extras.push(c.trim());
  });
  if (post.length) extras.push(post.join(' - ').trim()); // referência ("Ao lado da garagem")

  return { street: street, number: number, bairro: bairro, extras: extras };
}

// Decide qual dos dois jeitos usar e monta o resultado final.
// "lines" = linhas do bloco de endereço (a 1ª é o endereço; as outras são referência).
function parseAddress(lines) {
  var s = lines[0].replace(/\s+/g, ' ').trim();
  var segs = s.split(/\s+-\s+/);   // divide nos " - "
  // Formato completo = tem " - " e o 1º pedaço tem número.
  var res = (segs.length >= 2 && /\d/.test(segs[0])) ? parseSegmented(segs) : parseInformal(s);
  res.extras = res.extras.concat(lines.slice(1));  // linhas extras = referência
  var addr = res.number ? res.street + ', ' + res.number : res.street;
  return { addr: addr, bairro: res.bairro ? smartCase(res.bairro) : '', extras: res.extras };
}


/* ------------------------------------------------------------
   ETAPA 3 — PAGAMENTO
   Resultado: { kind, amount, trocoPara }
     kind: 'pago' | 'dinheiro' | 'cartao' | 'pix'
           | 'unknown' (tem valor mas não disse a forma) | 'none' (nada informado)
   ------------------------------------------------------------ */

// "42,32" -> 42.32   |   "1.234,50" -> 1234.5   |   "96" -> 96
function parseAmount(str) {
  var s = String(str).trim();
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');   // vírgula decimal: ponto é milhar
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');      // "1.234" = mil duzentos e trinta e quatro
  var n = parseFloat(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parsePay(lines) {
  // Junta as linhas de pagamento, sem acento e em maiúsculas, para facilitar a busca.
  var N = noAccent(lines.join(' | ')).toUpperCase();

  // Valor: procura "R$" seguido de número ("R$96", "R$ 42,32").
  var am = N.match(/R\$\s*(\d[\d.]*(?:,\d{1,2})?)/);
  var amount = am ? parseAmount(am[1]) : null;

  var hasPago = /\bPAGO\b/.test(N);                       // \b = limite de palavra
  var hasReceber = /\b(RECEBER|COBRAR)\b/.test(N);

  // "TROCO PRA 100" -> 100
  var tm = N.match(/TROCO\s*(?:PARA|PRA|P\/|P\b)?\s*(?:R\$\s*)?(\d+(?:[.,]\d+)?)/);
  var trocoPara = tm ? parseAmount(tm[1]) : null;

  var kind;
  if (hasPago && !hasReceber) {
    kind = 'pago';
  } else {
    // Descobre a forma de pagamento.
    var forma = null;
    if (/\bCARTAO\b|CREDITO|DEBITO/.test(N)) forma = 'cartao';
    else if (/\bPIX\b/.test(N)) forma = 'pix';
    else if (/DINHEIRO|ESPECIE/.test(N) || trocoPara !== null) forma = 'dinheiro'; // pediu troco = é dinheiro

    if (forma && amount !== null) kind = forma;     // tem forma E valor: tudo certo
    else if (!lines.length) kind = 'none';          // nenhuma linha de pagamento
    else kind = 'unknown';                          // tem algo, mas falta forma ou valor -> a tela pede confirmação
  }
  return { kind: kind, amount: amount, trocoPara: kind === 'dinheiro' ? trocoPara : null };
}


/* ------------------------------------------------------------
   ETAPA 4 — REFRI
   Só nos interessa SE tem refri e QUAL. A comida não aparece no card.
   Para adicionar uma bebida nova, é só colocar o nome na lista abaixo
   (sem acento, em MAIÚSCULAS, separado por |).
   ------------------------------------------------------------ */
var REFRI_RE = /\b(COCA|GUARANA|FANTA|SPRITE|PEPSI|KUAT|SCHWEPPES|SUCO|AGUA|REFRI|REFRIGERANTE|H2O|SODA)\b/;

// "1 COCA ZERO MINI" -> "Coca Zero mini"   |   "2 GUARANÁ 2L" -> "2x Guaraná 2L"
function fmtRefri(line) {
  var qty = 1, t = line;
  // Quantidade no começo: 1 ou 2 dígitos seguidos de espaço (ou "x").
  // "600ML" não é quantidade porque tem 3 dígitos e não tem espaço depois.
  var m = line.match(/^(\d{1,2})\s*(?:x\s+|\s+)(.*)$/i);
  if (m) { qty = parseInt(m[1], 10); t = m[2]; }

  t = t.replace(/\s+/g, ' ').trim().toLowerCase().split(' ').map(function (w) {
    if (/^\d+([.,]\d+)?l$/.test(w)) return w.toUpperCase();                                          // 2l -> 2L
    if (/^\d+([.,]\d+)?ml$/.test(w) || w === 'mini' || w === 'lata' || w === 'ml') return w;         // fica minúsculo
    return w.charAt(0).toUpperCase() + w.slice(1);                                                    // Coca, Zero...
  }).join(' ');

  return (qty > 1 ? qty + 'x ' : '') + t;
}


/* ------------------------------------------------------------
   ETAPA 5 — MONTAR UM PEDIDO
   Cada pedido (depois de tirar o cabeçalho) tem blocos separados por
   linha em branco:

        [endereço]       <- bloco 1
        [nome]           <- bloco 2
        [itens]          <- bloco 3 (opcional)
        [pagamento]      <- bloco 4
        [observações]    <- o que não encaixar em nada acima
   ------------------------------------------------------------ */

// Linha que fala de pagamento? (usada pra separar pagamento do resto)
var PAY_LINE = /\bPAGO\b|R\$|\bRECEBER\b|\bTROCO\b|\bCARTAO\b|\bDINHEIRO\b|\bPIX\b/;

// Recebe o texto de UMA mensagem e devolve o pedido (ou null se não der pra entender).
function parseBody(body) {
  // Limpa cada linha: tira links (o Spoke recebe o endereço em texto), espaços repetidos e pontas.
  var lines = body.split('\n').map(function (l) {
    return l.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
  });

  // Agrupa as linhas em blocos, usando as linhas em branco como divisória.
  var sections = [], cur = [];
  lines.forEach(function (l) {
    if (l) cur.push(l);
    else if (cur.length) { sections.push(cur); cur = []; }
  });
  if (cur.length) sections.push(cur);
  if (!sections.length) return null;

  var addrLines, nameLine, rest = [], warn = '';
  if (sections.length >= 2) {
    addrLines = sections[0];                 // bloco 1 = endereço
    nameLine = sections[1][0];               // 1ª linha do bloco 2 = nome
    rest = sections[1].slice(1);             // sobras do bloco 2
    sections.slice(2).forEach(function (s) { rest = rest.concat(s); }); // blocos 3, 4...
  } else {
    // Mensagem sem linhas em branco: chuta que a 1ª linha é o endereço e a 2ª é o nome.
    var s0 = sections[0];
    if (s0.length < 2) return null;
    addrLines = [s0[0]];
    nameLine = s0[1];
    rest = s0.slice(2);
    warn = 'Sem linhas em branco na mensagem: confira o nome.';
  }

  // Se o "nome" na verdade é uma linha de pagamento (ex.: "PAGO"), o nome está faltando.
  if (PAY_LINE.test(noAccent(nameLine).toUpperCase())) {
    rest.unshift(nameLine);
    nameLine = '';
    warn = 'Nome não encontrado.';
  }

  // Classifica cada linha restante: pagamento, item, ou observação.
  var payLines = [], itemLines = [], obs = [];
  rest.forEach(function (l) {
    var N = noAccent(l).toUpperCase();
    if (PAY_LINE.test(N)) payLines.push(l);                              // "PAGO", "R$..."
    else if (/^\d/.test(l) || /MARMIT/.test(N)) itemLines.push(l);       // começa com número ("1 COCA", "200G ...")
    else obs.push(l);                                                    // qualquer outra coisa = observação
  });

  // Procura refri nas linhas de itens (só nelas, para não confundir com "caixa d'água" do endereço).
  var refri = [];
  itemLines.forEach(function (l) {
    // O que está entre parênteses vira observação: "100G SALPICÃO (ESCREVER BR)".
    var clean = l.replace(/\(([^)]*)\)/g, function (m, g) { if (g.trim()) obs.push(g.trim()); return ' '; })
      .replace(/\s+/g, ' ').trim();
    if (REFRI_RE.test(noAccent(clean).toUpperCase())) refri.push(fmtRefri(clean));
  });

  var a = parseAddress(addrLines);
  return {
    name: nameLine ? smartCase(nameLine) : '',
    bairro: a.bairro,
    addr: a.addr,
    semEnd: false,                        // "vai sem endereço?" (a tela muda isso)
    pay: parsePay(payLines),
    refri: refri,
    obs: obs.concat(a.extras),            // observações da mensagem primeiro, depois as do endereço
    warn: warn
  };
}


/* ------------------------------------------------------------
   ETAPA 6 — FUNÇÃO PRINCIPAL
   É a única que a tela precisa chamar:
        var resultado = parseOrders(textoColado);
        resultado.orders   -> lista de pedidos
        resultado.ignored  -> quantas mensagens não deu pra entender
   ------------------------------------------------------------ */
function parseOrders(text) {
  var msgs = splitMessages(text || '');
  var orders = [], ignored = 0;
  msgs.forEach(function (m) {
    var o = parseBody(m.body);
    if (!o) { if (m.body.trim()) ignored++; return; }
    o.date = m.date;
    o.time = m.time;
    orders.push(o);
  });
  return { orders: orders, ignored: ignored };
}

// Isto só existe para o Node conseguir importar o arquivo nos testes.
// No navegador, "module" não existe e essa linha é ignorada.
if (typeof module !== 'undefined') module.exports = { parseOrders: parseOrders, parseAddress: parseAddress, parsePay: parsePay };
