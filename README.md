# Leitor de Pedidos

Ferramenta para motoboy: cola as mensagens de pedidos do WhatsApp e devolve um card por entrega, pronto para colocar no app de rotas (Spoke). Conta as entregas do dia por serviço e gera o relatório no fim.

Criada para uso real no trabalho. Funciona no celular.

## O que ele faz

Para cada pedido, mostra:

- **Nome e bairro** na mesma linha (`Letícia - Inconfidência`)
- **Endereço** limpo (`Rua X, 123`), pronto para colar no app de rotas
- **Pagamento**: `Pago`, `Pago · Pix` ou `R$ valor receber dinheiro/cartão`, com troco calculado
- **Refri**: se tem e qual (a comida não aparece)
- **Observações**: referências do endereço, pedidos especiais (`mandar talher`)

Quando algo não fica claro (pagamento sem forma, endereço sem número), o card avisa e deixa você confirmar na hora.

### Vários serviços

Cada serviço (restaurante, pastelaria...) tem seu valor por entrega. O valor vale para todos os cards da rota, e dá para mudar só o de uma entrega mais longa. Serviços podem ser criados e apagados (com duas confirmações).

### Entregas do dia

1. **Abrir entregas** no começo do turno.
2. Cole a rota, marque **Entregue** em cada card e toque em **Terminar rota**. A rota fica salva no dia.
3. Cole a próxima rota. A contagem da anterior não se perde.
4. **Fechar entregas** mostra o relatório: nome de cada cliente, valor de cada entrega, adiantamento e saldo.

## Decisão técnica: leitura por regras, não por IA

Uma IA generativa pode mudar o formato da resposta de uma vez para outra. Aqui o formato precisa ser sempre o mesmo, rápido e sem custo. Por isso o leitor funciona por **regras** e o resultado é igual para a mesma mensagem.

Cada serviço manda o pedido numa ordem diferente. Em vez de depender da posição das linhas, o leitor olha o **conteúdo** de cada uma: começa com "Rua" é endereço, tem "PAGO" ou "Pix" é pagamento, tem "Coca" é refri, texto curto sem número é o nome.

## Como usar

Abra o `index.html` no navegador (duplo clique). Não precisa instalar nada. Os dados ficam salvos no próprio navegador.

## Testes

```
node test/testar.js
```

## Estrutura

```
index.html      estrutura da página
css/style.css   aparência
js/parser.js    leitura das mensagens (a lógica principal)
js/storage.js   onde os dados ficam guardados
js/app.js       tela: cards, serviços, entregas do dia, relatório
test/testar.js  testes automáticos do parser
```

## Privacidade

Os exemplos do projeto são inventados. Mensagens reais de clientes nunca entram no repositório (a pasta `privado/` está no `.gitignore`).

## Próximos passos

- Clientes salvos com autocompletar
- Histórico dos dias fechados
