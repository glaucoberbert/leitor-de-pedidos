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
  assert.deepStrictEqual(o.obs, ['ESCREVER BR', 'MANDAR TALHER']);
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

/* ---------- Dona Mesa: ordem diferente (nome, endereço, bebida, pagamento) ---------- */
teste('cabeçalho com hora antes da data: [20:51, 24/10/2026]', () => {
  const r = parseOrders('[20:51, 24/10/2026] Dona Mesa: Talisma\n\nRua A 10\n\nPix\n[20:59, 24/10/2026] Dona Mesa: Joel\n\nRua B 20\n\nPix');
  assert.strictEqual(r.orders.length, 2);
  assert.strictEqual(r.orders[0].date, '24/10');   // data e hora não se misturam
  assert.strictEqual(r.orders[0].time, '20:51');
});

teste('nome primeiro, depois endereço (ordem da Dona Mesa)', () => {
  const o = um('[20:51, 24/10/2026] Dona Mesa: Talisma\n\nRua Pereira Galvão 732\n\nÁgua com gás\nPix');
  assert.strictEqual(o.name, 'Talisma');
  assert.strictEqual(o.addr, 'Rua Pereira Galvão, 732');
  assert.deepStrictEqual(o.refri, ['Água com Gás']);
});

teste('"Para entregar na ..." e bairro depois do número', () => {
  const o = um('[20:59, 24/10/2026] Dona Mesa: Joelaine\n\nPara entregar na Rua Rita Siqueira Serrano nº 10, São Cristóvão, \n\nCoca comum\n\npix');
  assert.strictEqual(o.addr, 'Rua Rita Siqueira Serrano, 10');
  assert.strictEqual(o.bairro, 'São Cristóvão');
});

teste('"aptm 201" é complemento e "bairro santo Antônio" vira bairro', () => {
  const o = um('[21:39, 24/10/2026] Dona Mesa: Igor\n\nRua santo Antônio 874 aptm 201 bairro santo Antônio\n\nCoca zero\n\nForma de pagamento pix');
  assert.strictEqual(o.addr, 'Rua santo Antônio, 874');
  assert.strictEqual(o.bairro, 'Santo Antônio');
  assert.deepStrictEqual(o.obs, ['aptm 201']);
});

teste('só "Pix" (sem valor) = já pago por Pix', () => {
  const p = um('[20:51, 24/10/2026] X: Talisma\n\nRua A 10\n\nPix').pay;
  assert.strictEqual(p.kind, 'pago');
  assert.strictEqual(p.via, 'Pix');
});

teste('"R$30 receber pix" continua sendo para receber', () => {
  const p = um('[20:51, 24/10/2026] X: Talisma\n\nRua A 10\n\nR$30 receber pix').pay;
  assert.strictEqual(p.kind, 'pix');
  assert.strictEqual(p.amount, 30);
});

teste('mesma mensagem em ordens diferentes dá o mesmo resultado', () => {
  const paradise = um('[24/10, 11:00] X: Rua A, 10\n\nANA\n\n1 COCA LATA\n\nPAGO');
  const dona     = um('[24/10, 11:00] X: ANA\n\nRua A, 10\n\n1 COCA LATA\n\nPAGO');
  assert.strictEqual(paradise.name, dona.name);
  assert.strictEqual(paradise.addr, dona.addr);
  assert.deepStrictEqual(paradise.refri, dona.refri);
  assert.strictEqual(paradise.pay.kind, dona.pay.kind);
});

teste('mensagem sem linhas em branco (tudo junto)', () => {
  const o = um('[24/10, 11:00] X: Carla\nRua das Flores 10 Centro\n1 Suco laranja\nPAGO');
  assert.strictEqual(o.name, 'Carla');
  assert.strictEqual(o.addr, 'Rua das Flores, 10');
  assert.strictEqual(o.bairro, 'Centro');
  assert.deepStrictEqual(o.refri, ['Suco Laranja']);
});

teste('sem nome na mensagem: avisa em vez de inventar', () => {
  const o = um('[24/10, 11:00] X: Rua A, 10\n\nPAGO');
  assert.strictEqual(o.name, '');
  assert.ok(o.warn);
});
