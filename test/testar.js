/* ============================================================
   testar.js  —  Testes automáticos do parser
   ------------------------------------------------------------
   Como rodar (na pasta do projeto):
        node test/testar.js

   Cada teste dá uma mensagem ao parser e confere se a resposta é a esperada.
   Se algo quebrar, o Node mostra qual teste falhou.

   Quando aparecer um erro de verdade no dia a dia:
     1. copie a mensagem que deu erro (TROQUE nomes e endereços reais por inventados!)
     2. escreva um teste novo aqui com o resultado CERTO
     3. rode (vai falhar), conserte o parser.js, rode de novo (passa)
   Assim o erro nunca volta.
   ============================================================ */

const assert = require('node:assert');
const { parseOrders } = require('../js/parser.js');

// Ajudante: lê UMA mensagem e devolve o pedido.
function um(texto) {
  const r = parseOrders(texto);
  assert.strictEqual(r.orders.length, 1, 'esperava 1 pedido');
  return r.orders[0];
}

// Ajudante: roda um teste e mostra ✓ ou ✗.
function teste(nome, fn) {
  try { fn(); console.log('✓', nome); }
  catch (e) { console.log('✗', nome, '\n   ', e.message); process.exitCode = 1; }
}

/* ---------- Endereço no formato completo ---------- */
teste('endereço completo: rua, número, bairro e referência', () => {
  const o = um('[24/10, 11:00] X: R. das Acácias, 120 - Casa - Jardim Primavera , Muriaé/MG - CEP 36880-000 - Portão azul\n\nCARLOS\n\nPAGO');
  assert.strictEqual(o.addr, 'Rua das Acácias, 120');   // "R." virou "Rua"
  assert.strictEqual(o.bairro, 'Jardim Primavera');
  assert.deepStrictEqual(o.obs, ['Portão azul']);        // "Casa" é descartado, a referência vira observação
});

teste('rua com número no nome ("Beco Rio Branco 2, 20")', () => {
  const o = um('[24/10, 11:00] X: Beco Rio Branco 2, 20 - Beco - Centro , Muriaé/MG - CEP 36880-000\n\nANA\n\nPAGO');
  assert.strictEqual(o.addr, 'Beco Rio Branco 2, 20');
});

/* ---------- Endereço digitado pelo cliente ---------- */
teste('endereço digitado: "nº 45 Bela Vista"', () => {
  const o = um('[24/10, 11:02] X: Rua das Palmeiras nº 45 Bela Vista\n\nRenata\n\nPAGO');
  assert.strictEqual(o.addr, 'Rua das Palmeiras, 45');
  assert.strictEqual(o.bairro, 'Bela Vista');
});

teste('endereço digitado: complemento e bairro ("N241 Apartamento 101 centro")', () => {
  const o = um('[24/10, 11:02] X: Rua das Flores N241 Apartamento 101 centro\n\nLUANA\n\nPAGO');
  assert.strictEqual(o.addr, 'Rua das Flores, 241');
  assert.strictEqual(o.bairro, 'Centro');
  assert.deepStrictEqual(o.obs, ['Apartamento 101']);
});

teste('rua com número no nome sem vírgula ("Rua 7 de Setembro 120")', () => {
  const o = um('[24/10, 11:02] X: Rua 7 de Setembro 120 centro\n\nJOAO\n\nPAGO');
  assert.strictEqual(o.addr, 'Rua 7 de Setembro, 120');
});

teste('local sem número (hospital): fica como está, sem número', () => {
  const o = um('[24/10, 11:05] X: Pronto socorro, Hospital Exemplo\n\nDAVI\n\nPAGO');
  assert.strictEqual(o.addr, 'Pronto socorro, Hospital Exemplo');
  assert.ok(!/\d/.test(o.addr));   // a tela usa isso pra mostrar o aviso "sem número"
});

/* ---------- Pagamento ---------- */
teste('pago', () => {
  assert.strictEqual(um('[24/10, 11:00] X: Rua A, 1\n\nANA\n\nPAGO').pay.kind, 'pago');
});

teste('dinheiro com troco', () => {
  const p = um('[24/10, 11:00] X: Rua A, 1\n\nANA\n\nR$48 RECEBER TROCO PRA 100').pay;
  assert.strictEqual(p.kind, 'dinheiro');
  assert.strictEqual(p.amount, 48);
  assert.strictEqual(p.trocoPara, 100);
});

teste('cartão com centavos', () => {
  const p = um('[24/10, 11:00] X: Rua A, 1\n\nANA\n\nR$42,32 RECEBER CARTÃO').pay;
  assert.strictEqual(p.kind, 'cartao');
  assert.strictEqual(p.amount, 42.32);
});

teste('valor sem forma de pagamento = "unknown" (a tela pede confirmação)', () => {
  const p = um('[24/10, 11:00] X: Rua A, 1\n\nANA\n\nR$27,50').pay;
  assert.strictEqual(p.kind, 'unknown');
  assert.strictEqual(p.amount, 27.5);
});

teste('milhar: R$ 1.234,50', () => {
  assert.strictEqual(um('[24/10, 11:00] X: Rua A, 1\n\nANA\n\nR$ 1.234,50 RECEBER DINHEIRO').pay.amount, 1234.5);
});

/* ---------- Refri ---------- */
teste('refri com tamanho', () => {
  const o = um('[24/10, 11:00] X: Rua A, 1\n\nANA\n\n1 COCA ZERO 600ML\n\nPAGO');
  assert.deepStrictEqual(o.refri, ['Coca Zero 600ml']);
});

teste('sem refri e "caixa d\'água" no endereço não conta como água', () => {
  const o = um('[24/10, 11:00] X: Rua A 5\nAtrás da caixa d\'água grande\n\nANA\n\n300G CHURRASCO\n\nPAGO');
  assert.deepStrictEqual(o.refri, []);
});

/* ---------- Observações ---------- */
teste('observação solta e observação entre parênteses', () => {
  const o = um('[24/10, 11:00] X: Rua A, 1\n\nMARTA\n\n100G SALPICÃO (ESCREVER BR)\n\nPAGO\n\nMANDAR TALHER');
  assert.deepStrictEqual(o.obs, ['MANDAR TALHER', 'ESCREVER BR']);
});

/* ---------- Várias mensagens de uma vez ---------- */
teste('separa vários pedidos pelo cabeçalho do WhatsApp', () => {
  const r = parseOrders(
    '[24/10, 11:00] X: Rua A, 1\n\nANA\n\nPAGO\n' +
    '[24/10, 11:01] X: Rua B, 2\n\nBIA\n\nPAGO'
  );
  assert.strictEqual(r.orders.length, 2);
  assert.strictEqual(r.orders[1].name, 'Bia');   // "BIA" virou "Bia"
});

teste('formato Android (data com ano e hífen)', () => {
  const r = parseOrders('24/10/2026 11:00 - X: Rua A, 1\n\nANA\n\nPAGO');
  assert.strictEqual(r.orders.length, 1);
});
