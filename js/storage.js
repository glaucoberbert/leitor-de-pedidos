/* ============================================================
   storage.js  —  Onde os dados ficam guardados
   ------------------------------------------------------------
   O app precisa lembrar de coisas mesmo se você fechar a página:
   as entregas do dia, os valores por serviço, a rota em andamento.

   Aqui usamos o localStorage: uma "gavetinha" do próprio navegador,
   que guarda texto e não some quando a página fecha.
   (Os dados ficam só neste aparelho e neste navegador.)

   Toda gaveta tem a mesma interface (init, load, save, arquivar).
   O app.js só conversa com "store" e não sabe COMO é guardado.
   Isso permite trocar o jeito de guardar (por exemplo, por um banco
   de dados na internet) sem mexer no resto do código.
   ============================================================ */

var store = (function () {

  var CHAVE = 'leitor-pedidos:estado';   // nome da gaveta do estado atual

  // Lê um texto guardado e transforma em objeto. Se não existir ou estiver
  // quebrado, devolve null (try/catch evita que um erro derrube a página).
  function ler(chave) {
    try {
      var txt = localStorage.getItem(chave);
      return txt ? JSON.parse(txt) : null;
    } catch (e) { return null; }
  }

  // Guarda um objeto como texto. Devolve true se deu certo.
  function gravar(chave, obj) {
    try { localStorage.setItem(chave, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }

  return {
    // Prepara o armazenamento. Aqui não precisa de nada.
    init: function () { return Promise.resolve('local'); },

    // Devolve o estado salvo (ou null na primeira vez).
    load: function () { return Promise.resolve(ler(CHAVE)); },

    // Salva o estado atual. Rejeita (dá erro) se não conseguir gravar.
    save: function (obj) {
      return gravar(CHAVE, obj) ? Promise.resolve() : Promise.reject(new Error('sem espaço ou bloqueado'));
    },

    // Guarda um turno FECHADO no histórico (um item por turno).
    arquivar: function (id, obj) {
      return gravar('leitor-pedidos:hist:' + id, obj) ? Promise.resolve() : Promise.reject(new Error('sem espaço ou bloqueado'));
    }
  };

})();
