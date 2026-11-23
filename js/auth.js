/* ============================================================
   auth.js  —  Conta do motoboy (login OBRIGATÓRIO)
   ------------------------------------------------------------
   Ao abrir o app, se não houver login válido guardado, aparece só a
   "porta": uma tela cheia de entrar / criar conta. O app fica escondido
   até o login dar certo. Os dados continuam sendo guardados no celular
   (localStorage); a sincronização com o servidor vem em outra etapa.

   Este arquivo tem duas partes:
     1. "conta": fala com o servidor e guarda o "crachá" (token) do login
     2. A tela: a porta de login e a faixa "Conectado como..."
   ============================================================ */


/* ------------------------------------------------------------
   PARTE 1 — "conta": servidor e crachá
   ------------------------------------------------------------ */
var conta = (function () {

  // Endereço do servidor (o mesmo que você abre em /docs).
  var API = 'https://todoke-api.onrender.com';

  // Nome da gaveta onde o login fica guardado (separada dos dados do app).
  var CHAVE = 'todoke:sessao';

  // O servidor grátis "dorme" e pode levar até ~1 minuto para acordar.
  // Por isso esperamos até 75 segundos antes de desistir.
  var TEMPO_MAX = 75000;

  // O login atual: { token, expira_ms, email, nome }  ou  null (sem login).
  var sessao = null;

  // Lê o login guardado em "localStorage" ou "sessionStorage".
  // try/catch: em alguns celulares o navegador bloqueia o acesso e dá erro.
  function ler(tipo) {
    try {
      var txt = window[tipo].getItem(CHAVE);
      return txt ? JSON.parse(txt) : null;
    } catch (e) { return null; }
  }

  // Apaga o login (das duas gavetas) e esquece da memória.
  function apagar() {
    try { localStorage.removeItem(CHAVE); } catch (e) {}
    try { sessionStorage.removeItem(CHAVE); } catch (e) {}
    sessao = null;
  }

  // Guarda o login. "Lembrar de mim" marcado -> localStorage (fica mesmo fechando o app).
  // Desmarcado -> sessionStorage (some quando a aba/sessão fecha).
  function guardar(s, lembrar) {
    apagar();      // limpa as duas gavetas antes (não ficar com login velho em uma delas)
    sessao = s;    // apagar() zerou a memória, então colocamos de novo
    try { (lembrar ? localStorage : sessionStorage).setItem(CHAVE, JSON.stringify(s)); } catch (e) {}
  }

  // Ao abrir o app: recupera o login guardado, se ainda não venceu.
  // NÃO fala com o servidor (assim o app abre rápido, mesmo sem internet).
  function carregar() {
    var s = ler('localStorage') || ler('sessionStorage');
    if (s && s.token && s.expira_ms > Date.now()) sessao = s;
    else { if (s) apagar(); sessao = null; }
  }

  // Faz UMA chamada ao servidor. Sempre devolve { status, dados }, nunca dá erro:
  //   status 0 = sem conexão / demorou demais.
  // "token" é opcional: se vier, vai no cabeçalho Authorization (é o crachá).
  function chamar(metodo, caminho, corpo, token) {
    var ctl = new AbortController();                       // permite desistir se demorar
    var timer = setTimeout(function () { ctl.abort(); }, TEMPO_MAX);
    var cab = { 'Accept': 'application/json' };
    if (corpo !== undefined) cab['Content-Type'] = 'application/json';
    if (token) cab['Authorization'] = 'Bearer ' + token;

    return fetch(API + caminho, {
      method: metodo,
      headers: cab,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: ctl.signal
    }).then(function (resp) {
      clearTimeout(timer);
      return resp.text().then(function (txt) {
        var dados = null;
        try { dados = txt ? JSON.parse(txt) : null; } catch (e) {}
        return { status: resp.status, dados: dados };
      });
    }).catch(function () {
      clearTimeout(timer);
      return { status: 0, dados: null };
    });
  }

  // Entra na conta. Se der certo (status 200), guarda o login.
  // Se não der, devolve a resposta do servidor para a tela mostrar o motivo.
  function entrar(email, senha, lembrar) {
    return chamar('POST', '/auth/login', { email: email, senha: senha, lembrar: lembrar }).then(function (r) {
      if (r.status !== 200) return r;
      var token = r.dados.access_token;
      var ms = Date.parse(r.dados.expira_em);
      if (isNaN(ms)) ms = Date.now() + 12 * 3600 * 1000;   // data estranha: assume 12 horas
      // Pergunta ao servidor quem é o dono do token (para mostrar o nome na faixa).
      return chamar('GET', '/eu', undefined, token).then(function (eu) {
        var d = eu.status === 200 && eu.dados ? eu.dados : {};
        guardar({ token: token, expira_ms: ms, email: d.email || email, nome: d.nome || '' }, lembrar);
        return r;
      });
    });
  }

  carregar();   // roda uma vez, ao carregar a página

  // O que as outras partes do app podem usar:
  return {
    chamar: chamar,
    entrar: entrar,
    sair: apagar,
    logado: function () { return !!sessao; },
    token: function () { return sessao ? sessao.token : null; },
    usuario: function () { return sessao ? { email: sessao.email, nome: sessao.nome } : null; }
  };

})();


/* ------------------------------------------------------------
   PARTE 2 — A tela: porta de login e faixa "Conectado como"
   ------------------------------------------------------------ */
(function () {

  var main = document.querySelector('main');         // o app inteiro (fica escondido até entrar)
  var barraSair = document.getElementById('areaSair');  // botão "Sair da conta" no pé da gaveta
  var barra = document.getElementById('areaConta');  // faixa pequena dentro do app: nome + "Sair da conta"
  if (!main) return;                                  // página sem app: não faz nada

  // A "porta": tela cheia de login. É criada aqui, por isso o index.html não precisa mudar.
  var porta = document.createElement('section');
  porta.className = 'porta';
  porta.hidden = true;
  porta.setAttribute('aria-label', 'Entrar no MotoGiro');
  document.body.insertBefore(porta, document.body.firstChild);

  var $ = function (id) { return document.getElementById(id); };

  // Em qual tela da porta estamos:
  // 'entrar' | 'criar' | 'codigo' | 'esqueci' | 'redefinir' | 'empresa' (NOVO)
  var tela = 'entrar';

  // Dados guardados SÓ na memória durante o cadastro/confirmação.
  // Servem para entrar sozinho depois de confirmar o código. Nada disso vai pro disco.
  var pend = null;              // { email, senha, lembrar }
  var emailReset = '';          // e-mail de quem está redefinindo a senha
  var emailPre = '';            // e-mail que já vem preenchido na tela de entrar (depois de redefinir)
  var avisoInicial = null;      // { texto, tipo } mostrado ao abrir uma tela
  var liberaEm = 0;             // quando o botão "Reenviar código" volta a funcionar
  var timerReenvio = null;
  var timerEspera = null;

  // NOVO: a gaveta onde o app.js (via storage.js) guarda o estado do app neste celular.
  // Tem que ser o mesmo nome que está no storage.js.
  var CHAVE_ESTADO = 'leitor-pedidos:estado';

  // NOVO: este celular ainda NÃO tem dados do app? Então é a primeira vez: pedimos a primeira empresa.
  // (No seu celular já existe estado salvo, então isto dá "não" e nada muda.)
  function semDados() {
    try { return localStorage.getItem(CHAVE_ESTADO) === null; }
    catch (e) { return false; }   // se o navegador bloqueia o armazenamento, não trava o app
  }

  // NOVO: "6", "6,50", "6.5" -> número. Texto inválido vira 0. (Igual ao parseMoney do app.js.)
  function lerDinheiro(txt) {
    var t = String(txt == null ? '' : txt).trim();
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(t);
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }

  // Protege o HTML (troca < > & " ' por códigos seguros), igual ao app.js.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Desenho ---------- */

  // Faixa pequena que aparece DENTRO do app, depois de entrar.
  function barraHTML() {
    var u = conta.usuario() || {};
    var nome = u.nome || u.email || '';
    return '<div class="gav-user"><span class="avatar" aria-hidden="true">' + esc(nome.charAt(0).toUpperCase()) + '</span>' +
           '<div class="gav-dados"><b>' + esc(u.nome || 'Motoboy') + '</b>' + (u.email ? '<span>' + esc(u.email) + '</span>' : '') + '</div></div>';
  }

  // Botão "Sair da conta" no pé da gaveta (fica separado do nome, por isso tem seu próprio lugar).
  function sairHTML() {
    return '<button class="menu-item gav-sair" type="button" data-c="sair">' + icones.svg('sair', 22) + '<span>Sair da conta</span></button>';
  }

  // Pedaço comum dos formulários: aviso + "aguarde" + botão principal.
  function rodapeHTML(textoBotao) {
    return '<div class="notice" id="conta-msg" hidden></div>' +
           '<p class="hint" id="conta-espera" hidden>O servidor está acordando. Pode levar até 1 minuto, aguarde.</p>' +
           '<div class="row"><button class="b1" type="submit">' + textoBotao + '</button></div>';
  }

  function campoHTML(id, rotulo, tipo, extra) {
    return '<div class="f"><label class="lab" for="' + id + '">' + rotulo + '</label>' +
           '<input class="in" id="' + id + '" type="' + tipo + '" ' + (extra || '') + '></div>';
  }

  var LEMBRAR = '<label class="conta-lembrar"><input type="checkbox" id="conta-lembrar"> Lembrar de mim neste celular</label>';

  function formHTML() {
    // NOVO: boas-vindas + cadastro da primeira empresa (só aparece na primeira vez, em celular sem dados).
    if (tela === 'empresa') {
      var u = conta.usuario() || {};
      var primeiro = String(u.nome || '').trim().split(' ')[0];   // só o primeiro nome
      return '<form class="conta-box" data-form="empresa" novalidate>' +
        '<b class="conta-t">Bem-vindo' + (primeiro ? ', ' + esc(primeiro) : '') + '!</b>' +
        '<p class="hint">Para começar, cadastre a empresa para a qual você entrega (restaurante, lanchonete...). ' +
        'Depois você pode cadastrar outras.</p>' +
        campoHTML('conta-empresa', 'Nome da empresa', 'text', 'maxlength="40" autocomplete="off"') +
        campoHTML('conta-valor', 'Valor por entrega (R$)', 'text', 'inputmode="decimal" placeholder="ex.: 6" autocomplete="off"') +
        campoHTML('conta-minimo', 'Mínimo garantido por dia (R$), se tiver', 'text', 'inputmode="decimal" placeholder="sem mínimo" autocomplete="off"') +
        '<p class="hint">O valor e o mínimo podem ser mudados depois.</p>' +
        rodapeHTML('Começar') +
        '<button class="link" type="button" data-c="sair">Sair da conta</button></form>';
    }
    if (tela === 'criar') {
      return '<form class="conta-box" data-form="criar" novalidate><b class="conta-t">Criar conta</b>' +
        campoHTML('conta-nome', 'Nome', 'text', 'name="name" autocomplete="name" maxlength="100"') +
        campoHTML('conta-email', 'E-mail', 'email', 'name="email" autocomplete="email" autocapitalize="none" spellcheck="false"') +
        campoHTML('conta-senha', 'Senha (mínimo 8 caracteres)', 'password', 'name="new-password" autocomplete="new-password"') +
        LEMBRAR + rodapeHTML('Criar conta') +
        '<button class="link" type="button" data-c="ir-entrar">Já tenho conta: entrar</button></form>';
    }
    if (tela === 'codigo') {
      return '<form class="conta-box" data-form="codigo" novalidate><b class="conta-t">Confirme seu e-mail</b>' +
        '<p class="hint">Digite o código de 6 números enviado para <b>' + esc(pend ? pend.email : '') + '</b>. ' +
        'Ele vale por 15 minutos. Se não chegar, olhe também o spam.</p>' +
        '<div class="f"><label class="lab" for="conta-codigo">Código</label>' +
        '<input class="in conta-cod" id="conta-codigo" type="text" inputmode="numeric" maxlength="6" ' +
        'autocomplete="one-time-code" placeholder="000000"></div>' +
        rodapeHTML('Confirmar') +
        '<button class="b2" type="button" id="conta-reenviar" data-c="reenviar">Reenviar código</button>' +
        '<button class="link" type="button" data-c="ir-entrar">Voltar para entrar</button></form>';
    }
    // Pedir o código para redefinir a senha (só o e-mail).
    if (tela === 'esqueci') {
      return '<form class="conta-box" data-form="esqueci" novalidate><b class="conta-t">Esqueci minha senha</b>' +
        '<p class="hint">Digite o e-mail da sua conta. Enviaremos um código de 6 números para você criar uma senha nova.</p>' +
        campoHTML('conta-email', 'E-mail', 'email', 'name="email" autocomplete="email" autocapitalize="none" spellcheck="false"') +
        rodapeHTML('Enviar código') +
        '<button class="link" type="button" data-c="ir-entrar">Voltar para entrar</button></form>';
    }
    // Digitar o código e a senha nova.
    if (tela === 'redefinir') {
      return '<form class="conta-box" data-form="redefinir" novalidate><b class="conta-t">Criar senha nova</b>' +
        '<p class="hint">Digite o código enviado para <b>' + esc(emailReset) + '</b> (vale por 15 minutos; olhe também o spam) e escolha a senha nova.</p>' +
        '<div class="f"><label class="lab" for="conta-codigo">Código</label>' +
        '<input class="in conta-cod" id="conta-codigo" type="text" inputmode="numeric" maxlength="6" ' +
        'autocomplete="one-time-code" placeholder="000000"></div>' +
        campoHTML('conta-senha', 'Senha nova (mínimo 8 caracteres)', 'password', 'name="new-password" autocomplete="new-password"') +
        campoHTML('conta-senha2', 'Repita a senha nova', 'password', 'name="new-password" autocomplete="new-password"') +
        rodapeHTML('Salvar senha nova') +
        '<button class="b2" type="button" id="conta-reenviar" data-c="reenviar-reset">Reenviar código</button>' +
        '<button class="link" type="button" data-c="ir-entrar">Voltar para entrar</button></form>';
    }
    // tela === 'entrar' (a primeira)
    return '<form class="conta-box" data-form="entrar" novalidate><b class="conta-t">Entrar</b>' +
      campoHTML('conta-email', 'E-mail', 'email', 'name="email" autocomplete="email" autocapitalize="none" spellcheck="false"') +
      campoHTML('conta-senha', 'Senha', 'password', 'name="password" autocomplete="current-password"') +
      LEMBRAR + rodapeHTML('Entrar') +
      '<button class="link" type="button" data-c="ir-esqueci">Esqueci minha senha</button>' +
      '<button class="link" type="button" data-c="ir-criar">Não tenho conta: criar</button></form>';
  }

  // Redesenha tudo. Só é chamado quando a TELA muda (não a cada letra digitada).
  // "focar" = true coloca o cursor no primeiro campo (no 1º desenho não, pra não abrir o teclado do nada).
  function desenhar(focar) {
    clearInterval(timerReenvio);
    var logado = conta.logado();

    // NOVO: logado, mas neste celular nunca se usou o app? Mostra a tela da primeira empresa
    // (na mesma "porta") em vez do app.
    var precisaEmpresa = logado && semDados();
    if (precisaEmpresa) tela = 'empresa';
    else if (tela === 'empresa') tela = 'entrar';   // saiu da conta (ou já tem dados): volta pro login

    var mostraApp = logado && !precisaEmpresa;
    main.hidden = !mostraApp;                                // o app só aparece depois de entrar (e cadastrar a empresa)
    porta.hidden = mostraApp;                                // a porta some quando o app aparece
    if (barra) barra.innerHTML = mostraApp ? barraHTML() : '';
    if (barraSair) barraSair.innerHTML = mostraApp ? sairHTML() : '';

    if (mostraApp) { porta.innerHTML = ''; return; }

    porta.innerHTML = '<div class="porta-box">' +
      '<div class="porta-marca"><img class="porta-logo" src="icons/icon.svg" alt="" width="84" height="84"><h1>MotoGiro</h1><p class="lead">Leitor de pedidos para motoboys.</p></div>' +
      formHTML() + '</div>';

    // Depois de redefinir a senha, o e-mail já vem preenchido na tela de entrar.
    if (tela === 'entrar' && emailPre) { $('conta-email').value = emailPre; emailPre = ''; }

    if (avisoInicial) { msg(avisoInicial.texto, avisoInicial.tipo); avisoInicial = null; }
    if (tela === 'codigo' || tela === 'redefinir') contagemReenvio();
    if (focar) {
      var primeiro = porta.querySelector('form input:not([type="checkbox"])');
      if (primeiro) primeiro.focus();
    }
  }

  /* ---------- Mensagens e "aguarde" ---------- */

  // Mostra (ou esconde, se vazio) a mensagem do formulário. tipo: 'warn' (laranja) ou 'ok' (verde).
  function msg(texto, tipo) {
    var el = $('conta-msg');
    if (!el) return;
    el.className = 'notice ' + (tipo || 'warn');
    el.textContent = texto || '';
    el.hidden = !texto;
  }

  // Trava o botão principal enquanto espera o servidor; depois de 4 s avisa que ele pode estar acordando.
  function ocupar(sim) {
    var b = porta.querySelector('button[type="submit"]');
    clearTimeout(timerEspera);
    if (b) {
      if (sim) { if (!b._rot) b._rot = b.textContent; b.textContent = 'Aguarde…'; }
      else if (b._rot) { b.textContent = b._rot; b._rot = null; }
      b.disabled = sim;
    }
    var espera = $('conta-espera');
    if (espera) espera.hidden = true;
    if (sim) timerEspera = setTimeout(function () { var e = $('conta-espera'); if (e) e.hidden = false; }, 4000);
  }

  // Traduz a resposta do servidor numa frase para o motorista.
  function textoDoErro(r, padrao) {
    if (r.status === 0) return 'Não consegui falar com o servidor. Confira a internet e tente de novo.';
    if (r.status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
    if (r.status === 422) return 'Confira os campos (a senha precisa ter pelo menos 8 caracteres).';
    if (r.status >= 500) return 'O servidor teve um problema. Tente de novo em instantes.';
    if (r.dados && typeof r.dados.detail === 'string') return r.dados.detail;   // frase pronta do servidor
    return padrao;
  }

  // Botão "Reenviar código": fica desligado por 60 s, contando os segundos.
  function contagemReenvio() {
    clearInterval(timerReenvio);
    var btn = $('conta-reenviar');
    if (!btn) return;
    function tic() {
      var falta = Math.ceil((liberaEm - Date.now()) / 1000);
      if (falta > 0) { btn.disabled = true; btn.textContent = 'Reenviar em ' + falta + 's'; }
      else { btn.disabled = false; btn.textContent = 'Reenviar código'; clearInterval(timerReenvio); }
    }
    tic();
    timerReenvio = setInterval(tic, 1000);
  }

  /* ---------- Ações dos formulários ---------- */

  function enviarEntrar() {
    var email = $('conta-email').value.trim(), senha = $('conta-senha').value, lembrar = $('conta-lembrar').checked;
    if (!email || !senha) { msg('Preencha o e-mail e a senha.'); return; }
    msg(''); ocupar(true);
    conta.entrar(email, senha, lembrar).then(function (r) {
      ocupar(false);
      if (r.status === 200) { window.scrollTo(0, 0); desenhar(true); return; }   // entrou: mostra o app (ou a 1ª empresa)
      if (r.status === 403) {
        // Senha certa, mas o e-mail ainda não foi confirmado: pede um código novo e abre a tela do código.
        pend = { email: email, senha: senha, lembrar: lembrar };
        conta.chamar('POST', '/auth/reenviar-codigo', { email: email });
        liberaEm = Date.now() + 60000;
        avisoInicial = { texto: 'Seu e-mail ainda não foi confirmado. Enviamos um código novo.', tipo: 'ok' };
        tela = 'codigo'; desenhar(true);
        return;
      }
      msg(textoDoErro(r, 'E-mail ou senha incorretos.'));
    }).catch(function () { ocupar(false); msg('Algo deu errado. Tente de novo.'); });
  }

  function enviarCriar() {
    var nome = $('conta-nome').value.trim(), email = $('conta-email').value.trim();
    var senha = $('conta-senha').value, lembrar = $('conta-lembrar').checked;
    if (nome.length < 2) { msg('Digite seu nome.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { msg('Confira o e-mail.'); return; }
    if (senha.length < 8) { msg('A senha precisa ter pelo menos 8 caracteres.'); return; }
    msg(''); ocupar(true);
    conta.chamar('POST', '/auth/cadastro', { nome: nome, email: email, senha: senha }).then(function (r) {
      ocupar(false);
      if (r.status === 201) {
        pend = { email: email, senha: senha, lembrar: lembrar };
        liberaEm = Date.now() + 60000;
        avisoInicial = (r.dados && r.dados.codigo_enviado === false)
          ? { texto: 'Conta criada, mas o e-mail com o código não saiu. Toque em Reenviar código.', tipo: 'warn' }
          : { texto: 'Conta criada! Enviamos o código para o seu e-mail.', tipo: 'ok' };
        tela = 'codigo'; desenhar(true);
        return;
      }
      msg(textoDoErro(r, 'Não consegui criar a conta.'));
    }).catch(function () { ocupar(false); msg('Algo deu errado. Tente de novo.'); });
  }

  function enviarCodigo() {
    var cod = $('conta-codigo').value.replace(/\D/g, '');   // só os números
    if (cod.length !== 6) { msg('Digite os 6 números do código.'); return; }
    if (!pend) { tela = 'entrar'; desenhar(true); return; }
    msg(''); ocupar(true);
    conta.chamar('POST', '/auth/confirmar-email', { email: pend.email, codigo: cod }).then(function (r) {
      if (r.status !== 200) { ocupar(false); msg(textoDoErro(r, 'Código inválido.')); return; }
      // Confirmou! Entra sozinho com a senha que acabou de ser digitada.
      return conta.entrar(pend.email, pend.senha, pend.lembrar).then(function (r2) {
        ocupar(false);
        pend = null;   // esquece a senha da memória
        if (r2.status === 200) { window.scrollTo(0, 0); desenhar(true); return; }
        avisoInicial = { texto: 'E-mail confirmado! Agora é só entrar.', tipo: 'ok' };
        tela = 'entrar'; desenhar(true);
      });
    }).catch(function () { ocupar(false); msg('Algo deu errado. Tente de novo.'); });
  }

  // "Esqueci minha senha", passo 1: pede o código por e-mail.
  function enviarEsqueci() {
    var email = $('conta-email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { msg('Confira o e-mail.'); return; }
    msg(''); ocupar(true);
    conta.chamar('POST', '/auth/esqueci-senha', { email: email }).then(function (r) {
      ocupar(false);
      if (r.status !== 200) { msg(textoDoErro(r, 'Não consegui enviar o código.')); return; }
      // O servidor responde igual exista o e-mail ou não; por isso o aviso também é neutro.
      emailReset = email;
      liberaEm = Date.now() + 60000;
      avisoInicial = { texto: 'Se o e-mail estiver cadastrado, o código já foi enviado.', tipo: 'ok' };
      tela = 'redefinir'; desenhar(true);
    }).catch(function () { ocupar(false); msg('Algo deu errado. Tente de novo.'); });
  }

  // "Esqueci minha senha", passo 2: código + senha nova.
  function enviarRedefinir() {
    var cod = $('conta-codigo').value.replace(/\D/g, '');
    var s1 = $('conta-senha').value, s2 = $('conta-senha2').value;
    if (cod.length !== 6) { msg('Digite os 6 números do código.'); return; }
    if (s1.length < 8) { msg('A senha precisa ter pelo menos 8 caracteres.'); return; }
    if (s1 !== s2) { msg('As duas senhas não são iguais.'); return; }
    msg(''); ocupar(true);
    conta.chamar('POST', '/auth/redefinir-senha', { email: emailReset, codigo: cod, nova_senha: s1 }).then(function (r) {
      ocupar(false);
      if (r.status !== 200) { msg(textoDoErro(r, 'Código inválido.')); return; }
      emailPre = emailReset; emailReset = '';
      avisoInicial = { texto: 'Senha alterada! Entre com a senha nova.', tipo: 'ok' };
      tela = 'entrar'; desenhar(true);
    }).catch(function () { ocupar(false); msg('Algo deu errado. Tente de novo.'); });
  }

  // NOVO: cadastra a primeira empresa e abre o app.
  function enviarEmpresa() {
    var nome = $('conta-empresa').value.trim();
    var valor = lerDinheiro($('conta-valor').value);
    var minimo = lerDinheiro($('conta-minimo').value);   // vazio = 0 = sem mínimo
    if (nome.length < 2) { msg('Digite o nome da empresa.'); return; }
    if (!valor) { msg('Digite o valor que você recebe por entrega (ex.: 6).'); return; }

    // Monta o "estado inicial" do app com SÓ essa empresa, no mesmo formato que o app.js salva:
    // sem pedidos, sem exemplo (demo: false) e sem entregas abertas.
    var id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var estado = {
      v: 1,
      servicos: [{ id: id, nome: nome, valor: valor, minimo: minimo }],
      servicoId: id,
      texto: '',
      demo: false,
      orders: [],
      ignored: 0,
      turno: null
    };
    try { localStorage.setItem(CHAVE_ESTADO, JSON.stringify(estado)); }
    catch (e) { msg('Não consegui salvar neste celular. Confira se o navegador permite guardar dados.'); return; }

    // Recarrega a página: o app.js abre já lendo esse estado (só com a empresa nova).
    window.location.reload();
  }

  /* ---------- Eventos ---------- */

  // Enviar os formulários da porta (botão ou tecla Enter).
  porta.addEventListener('submit', function (e) {
    e.preventDefault();   // não deixa o navegador recarregar a página
    var f = e.target.getAttribute('data-form');
    if (f === 'entrar') enviarEntrar();
    else if (f === 'criar') enviarCriar();
    else if (f === 'codigo') enviarCodigo();
    else if (f === 'esqueci') enviarEsqueci();
    else if (f === 'redefinir') enviarRedefinir();
    else if (f === 'empresa') enviarEmpresa();          // NOVO
  });

  // Cliques nos botões da porta e da faixa "Sair da conta" (um ouvinte para os dois lugares).
  function clique(e) {
    var b = e.target.closest('[data-c]');
    if (!b) return;
    var a = b.getAttribute('data-c');
    if (a === 'ir-entrar') { pend = null; emailReset = ''; tela = 'entrar'; desenhar(true); }
    else if (a === 'ir-criar') { tela = 'criar'; desenhar(true); }
    else if (a === 'ir-esqueci') { tela = 'esqueci'; desenhar(true); }
    else if (a === 'sair') {
      // Sair da conta: apaga só o login. Os dados do app continuam neste celular
      // (a sincronização com o servidor e a limpeza ao sair ficam para outra etapa).
      conta.sair(); tela = 'entrar'; window.scrollTo(0, 0); desenhar(true);
    }
    else if (a === 'reenviar') {
      if (!pend) return;
      liberaEm = Date.now() + 60000;
      contagemReenvio();
      conta.chamar('POST', '/auth/reenviar-codigo', { email: pend.email }).then(function (r) {
        if (r.status === 200) msg('Pedido enviado. Confira seu e-mail (e o spam).', 'ok');
        else msg(textoDoErro(r, 'Não consegui reenviar o código.'));
      });
    }
    else if (a === 'reenviar-reset') {   // reenviar o código de redefinição
      if (!emailReset) return;
      liberaEm = Date.now() + 60000;
      contagemReenvio();
      conta.chamar('POST', '/auth/esqueci-senha', { email: emailReset }).then(function (r) {
        if (r.status === 200) msg('Pedido enviado. Confira seu e-mail (e o spam).', 'ok');
        else msg(textoDoErro(r, 'Não consegui reenviar o código.'));
      });
    }
  }
  porta.addEventListener('click', clique);
  if (barra) barra.addEventListener('click', clique);
  if (barraSair) barraSair.addEventListener('click', clique);

  desenhar(false);   // primeiro desenho, ao abrir o app

})();