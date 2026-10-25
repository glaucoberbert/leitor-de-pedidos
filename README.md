# Leitor de Pedidos

Ferramenta para motoboy: cola as mensagens de pedidos do WhatsApp e devolve um card por entrega, pronto para colocar no app de rotas (como o Spoke, que é o que utilizo em meu cotidiano).

Criada para uso real no meu trabalho de acordo com as dores que eu fui percebendo ao longo do tempo. Funciona no celular.

## O que ele faz

Para cada pedido, mostra:

- **Nome e bairro** na mesma linha (`Letícia - Inconfidência`)
- **Endereço** limpo (`Rua X, 123`), pronto para colar no app de rotas
- **Pagamento**: `Pago` ou `R$ valor receber dinheiro/cartão`, com troco calculado
- **Refrigerante**: se tem e qual (a comida não aparece de forma proposital para o meu mini mundo)
- **Observações**: referências do endereço, pedidos especiais (`mandar talher`)

Quando algo não fica claro (pagamento sem forma, endereço sem número), o card avisa e deixa você confirmar na hora.

## Decisão técnica: por que não usa IA

Uma IA generativa pode mudar o formato da resposta de uma vez para outra. Aqui o formato precisa ser sempre o mesmo, rápido e sem custo. Por isso o leitor funciona por **regras** (padrões no texto), e o resultado é igual para a mesma mensagem.

## Como usar

Abra o `index.html` no navegador (duplo clique). Não precisa instalar nada.

## Testes

```
node test/testar.js
```

## Estrutura

```
index.html      estrutura da página
css/style.css   aparência
js/parser.js    leitura das mensagens (a lógica principal)
js/app.js       tela: cards, botões, copiar
test/testar.js  testes automáticos do parser
```

## Privacidade

Os exemplos do projeto são inventados. Mensagens reais de clientes nunca entram no repositório (a pasta `privado/` está no `.gitignore`).

## Próximos passos

- Clientes salvos com autocompletar
- Contagem de corridas e ganho do dia
- Marcar entregas como concluídas
