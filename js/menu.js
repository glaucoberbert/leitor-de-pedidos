/* ============================================================
   menu.js  —  Menu lateral (as 3 barrinhas)
   ------------------------------------------------------------
   Só cuida de abrir e fechar o painel. Quando você toca em
   "Corridas" ou "Empresas", ele AVISA o app.js por um evento
   ("todoke:ir"); quem troca a tela de verdade é o app.js.
   O app.js também usa o "menu" daqui: no botão voltar do celular,
   se o menu estiver aberto, ele só fecha o menu.
   ============================================================ */
var menu = (function () {

  var btn = document.getElementById('menuBtn');
  var painel = document.getElementById('menuPainel');
  var fundo = document.getElementById('menuFundo');

  // Se a página não tem o menu, devolve um "menu de mentira" para o app.js não quebrar.
  if (!btn || !painel || !fundo) return { aberto: function () { return false; }, fechar: function () {} };

  var aberto = false;

  // Abre (true) ou fecha (false): liga/desliga a classe "aberto" nas três peças.
  function definir(sim) {
    aberto = sim;
    btn.classList.toggle('aberto', sim);
    painel.classList.toggle('aberto', sim);
    fundo.classList.toggle('aberto', sim);
    btn.setAttribute('aria-expanded', sim ? 'true' : 'false');
    btn.setAttribute('aria-label', sim ? 'Fechar menu' : 'Abrir menu');
  }

  btn.addEventListener('click', function () { definir(!aberto); });   // as barrinhas abrem e fecham
  fundo.addEventListener('click', function () { definir(false); });   // tocar fora fecha

  // Tecla Esc fecha (para quem usa teclado).
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && aberto) definir(false);
  });

  painel.addEventListener('click', function (e) {
    // Tocou em "Corridas" ou "Empresas": fecha o menu e avisa o app.js qual tela abrir.
    var item = e.target.closest('[data-ir]');
    if (item) {
      definir(false);
      document.dispatchEvent(new CustomEvent('todoke:ir', { detail: item.getAttribute('data-ir') }));
      return;
    }
    // Tocou em "Sair da conta" (tratado pelo auth.js): só fecha o menu.
    if (e.target.closest('[data-c]')) definir(false);
  });

  return {
    aberto: function () { return aberto; },
    fechar: function () { definir(false); }
  };

})();