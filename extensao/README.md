# Monvatti Pro (extensão do Chrome)

Uso interno da equipe Monvatti. Mostra as métricas de um anúncio do Mercado Livre, um resumo da busca, a calculadora de margem e o botão **Levar para o Replique**.

No anúncio, a gaveta (botão **M**) tem **Cadastrar no Replique**: copia o anúncio para um rascunho do cliente e abre o editor.
O menu de download das fotos tem **Salvar fotos no Replique**: as fotos ficam numa pasta por anúncio em **Replique › Anúncios › Fotos salvas**
(levar o anúncio para o Replique também salva as fotos lá). O Replique continua com o mesmo nome; só a extensão se chama Monvatti Pro.

## Preparar no Replique (administrador)

1. **Clientes › Gerenciar**: crie um cliente interno (por exemplo "Estudo Monvatti"), marque **Cliente interno de estudo** e conecte nele a conta do Mercado Livre usada para estudo.
2. **Configurações › Extensão Monvatti Pro**: marque **Liberada** para cada pessoa da equipe e clique em **Gerar código**. O código vale 15 minutos.

## Instalar no navegador

1. No Chrome, abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha esta pasta `extensao`.
3. Clique no ícone da extensão, informe o endereço do Replique, cole o código e clique em **Ligar neste navegador**. Aceite a permissão para o endereço do Replique.

## Regras

- Funciona num navegador só por pessoa. Para trocar, o administrador desliga o navegador anterior em Configurações.
- O estudo só roda com o Chrome logado numa conta de estudo ou deslogado do Mercado Livre. Logado numa conta de cliente ou numa conta desconhecida, fica bloqueado.
- As chamadas à API saem pelo token da conta de estudo, nunca pelo de um cliente.
- Vendas estimadas e ritmo são aproximações a partir do número público ("+50 mil vendidos"); não são dados oficiais do Mercado Livre.
- **Levar para o Replique** cria um rascunho no cliente escolhido, com fotos e texto do anúncio como base. Edite tudo antes de publicar.
