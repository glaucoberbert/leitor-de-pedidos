/* ============================================================
   auth.js  —  Conta do motoboy (login OPCIONAL)
   ------------------------------------------------------------
   O app continua funcionando sem conta: tudo é guardado no celular
   (localStorage), como sempre. Entrar numa conta é uma melhoria
   que, na próxima etapa, vai sincronizar os dados com o servidor.

   Este arquivo tem duas partes:
     1. "conta": fala com o servidor e guarda o "crachá" (token) do login
     2. A tela: a faixa "Sem conta / Conectado" e os formulários
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
    sessao = s;
    apagar();      // limpa as duas gavetas antes (não ficar com login velho em uma delas)
    sessao = s;    // apagar() zerou a memória, então colocamos de novo
    try { (lembrar ? localStorage : sessionStorage).setItem(CHAVE, JSON.stringify(s)); } catch (e) {}
  }

  // Ao abrir o app: recupera o login guardado, se ainda não venceu.
  // NÃO fala com o servidor (assim o app abre rápido e não acorda o servidor à toa).
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
   PARTE 2 — A tela da conta
   ------------------------------------------------------------ */
(function () {

  var raiz = document.getElementById('areaConta');
  if (!raiz) return;   // a página não tem a área da conta: não faz nada

  var $ = function (id) { return document.getElementById(id); };

  // Em qual tela estamos: 'fechado' (só a faixa) | 'entrar' | 'criar' | 'codigo'
  var tela = 'fechado';

  // Dados guardados SÓ na memória durante o cadastro/confirmação.
  // Servem para entrar sozinho depois de confirmar o código. Nada disso vai pro disco.
  var pend = null;              // { email, senha, lembrar }
  var avisoInicial = null;      // { texto, tipo } mostrado ao abrir uma tela
  var liberaEm = 0;             // quando o botão "Reenviar código" volta a funcionar
  var timerReenvio = null;
  var timerEspera = null;

  // Protege o HTML (troca < > & " ' por códigos seguros), igual ao app.js.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Desenho ---------- */

  // A faixa de cima: muda conforme esteja logado ou não.
  function barraHTML() {
    if (conta.logado()) {
      var u = conta.usuario();
      return '<div class="conta-bar"><span class="hint">Conectado como <b>' + esc(u.nome || u.email) + '</b>. ' +
             'A sincronização dos dados chega na próxima etapa.</span>' +
             '<button class="link" type="button" data-c="sair">Sair</button></div>';
    }
    return '<div class="conta-bar"><span class="hint">Sem conta: seus dados ficam só neste celular.</span>' +
           (tela === 'fechado' ? '<button class="link" type="button" data-c="abrir">Entrar ou criar conta</button>' : '') +
           '</div>';
  }

  // Pedaço comum dos formulários: aviso + "aguarde" + botões.
  function rodapeHTML(textoBotao) {
    return '<div class="notice" id="conta-msg" hidden></div>' +
           '<p class="hint" id="conta-espera" hidden>O servidor está acordando. Pode levar até 1 minuto, aguarde.</p>' +
           '<div class="row"><button class="b1" type="submit">' + textoBotao + '</button>' +
           '<button class="b2" type="button" data-c="fechar">Fechar</button></div>';
  }

  function campoHTML(id, rotulo, tipo, extra) {
    return '<div class="f"><label class="lab" for="' + id + '">' + rotulo + '</label>' +
           '<input class="in" id="' + id + '" type="' + tipo + '" ' + (extra || '') + '></div>';
  }

  var LEMBRAR = '<label class="conta-lembrar"><input type="checkbox" id="conta-lembrar"> Lembrar de mim neste celular</label>';

  function formHTML() {
    if (tela === 'entrar') {
      return '<form class="conta-box" data-form="entrar" novalidate><b class="conta-t">Entrar</b>' +
        campoHTML('conta-email', 'E-mail', 'email', 'name="email" autocomplete="email" autocapitalize="none" spellcheck="false"') +
        campoHTML('conta-senha', 'Senha', 'password', 'name="password" autocomplete="current-password"') +
        LEMBRAR + rodapeHTML('Entrar') +
        '<button class="link" type="button" data-c="ir-criar">Não tenho conta: criar</button></form>';
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
        '<button class="b2" type="button" id="conta-reenviar" data-c="reenviar">Reenviar código</button></form>';
    }
    return '';
  }

  // Redesenha a área toda. Só é chamado quando a TELA muda (não a cada letra digitada).
  function desenhar() {
    clearInterval(timerReenvio);
    raiz.innerHTML = barraHTML() + formHTML();
    if (avisoInicial) { msg(avisoInicial.texto, avisoInicial.tipo); avisoInicial = null; }
    if (tela === 'codigo') contagemReenvio();
    var primeiro = raiz.querySelector('form input:not([type="checkbox"])');
    if (primeiro) primeiro.focus();   // já deixa o cursor no primeiro campo
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
    var b = raiz.querySelector('button[type="submit"]');
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
      if (r.status === 200) { tela = 'fechado'; desenhar(); return; }
      if (r.status === 403) {
        // Senha certa, mas o e-mail ainda não foi confirmado: pede um código novo e abre a tela do código.
        pend = { email: email, senha: senha, lembrar: lembrar };
        conta.chamar('POST', '/auth/reenviar-codigo', { email: email });
        liberaEm = Date.now() + 60000;
        avisoInicial = { texto: 'Seu e-mail ainda não foi confirmado. Enviamos um código novo.', tipo: 'ok' };
        tela = 'codigo'; desenhar();
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
        tela = 'codigo'; desenhar();
        return;
      }
      msg(textoDoErro(r, 'Não consegui criar a conta.'));
    }).catch(function () { ocupar(false); msg('Algo deu errado. Tente de novo.'); });
  }

  function enviarCodigo() {
    var cod = $('conta-codigo').value.replace(/\D/g, '');   // só os números
    if (cod.length !== 6) { msg('Digite os 6 números do código.'); return; }
    if (!pend) { tela = 'entrar'; desenhar(); return; }
    msg(''); ocupar(true);
    conta.chamar('POST', '/auth/confirmar-email', { email: pend.email, codigo: cod }).then(function (r) {
      if (r.status !== 200) { ocupar(false); msg(textoDoErro(r, 'Código inválido.')); return; }
      // Confirmou! Entra sozinho com a senha que acabou de ser digitada.
      return conta.entrar(pend.email, pend.senha, pend.lembrar).then(function (r2) {
        ocupar(false);
        pend = null;   // esquece a senha da memória
        if (r2.status === 200) { tela = 'fechado'; }
        else { avisoInicial = { texto: 'E-mail confirmado! Agora é só entrar.', tipo: 'ok' }; tela = 'entrar'; }
        desenhar();
      });
    }).catch(function () { ocupar(false); msg('Algo deu errado. Tente de novo.'); });
  }

  /* ---------- Eventos (um ouvinte só para a área toda) ---------- */

  raiz.addEventListener('submit', function (e) {
    e.preventDefault();   // não deixa o navegador recarregar a página
    var f = e.target.getAttribute('data-form');
    if (f === 'entrar') enviarEntrar();
    else if (f === 'criar') enviarCriar();
    else if (f === 'codigo') enviarCodigo();
  });

  raiz.addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]');
    if (!b) return;
    var a = b.getAttribute('data-c');
    if (a === 'abrir' || a === 'ir-entrar') { tela = 'entrar'; desenhar(); }
    else if (a === 'ir-criar') { tela = 'criar'; desenhar(); }
    else if (a === 'fechar') { tela = 'fechado'; pend = null; desenhar(); }
    else if (a === 'sair') { conta.sair(); tela = 'fechado'; desenhar(); }
    else if (a === 'reenviar') {
      if (!pend) return;
      liberaEm = Date.now() + 60000;
      contagemReenvio();
      conta.chamar('POST', '/auth/reenviar-codigo', { email: pend.email }).then(function (r) {
        if (r.status === 200) msg('Pedido enviado. Confira seu e-mail (e o spam).', 'ok');
        else msg(textoDoErro(r, 'Não consegui reenviar o código.'));
      });
    }
  });

  desenhar();   // primeiro desenho, ao abrir o app

})();