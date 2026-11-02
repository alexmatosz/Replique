---
name: leis-brasil-software
description: Checklist das leis brasileiras que valem para um software web como o Replique (SaaS B2B para agências e lojistas de marketplace). Use ao criar ou mudar telas de cadastro, login, dados pessoais, registros, termos, e-mails, cobrança, IA, integração com terceiros ou antes de colocar clientes pagantes. Diz o que a lei pede, onde isso está no Replique e o que falta. Não substitui advogado.
---

# Leis brasileiras para o Replique

Use como lista de conferência. Para cada item: a regra, onde o Replique atende e o que conferir numa mudança. Cite a lei
pelo número e artigo. Quando algo depender de interpretação, diga "revisar com advogado" em vez de afirmar.

## 1. LGPD — Lei nº 13.709/2018

| Ponto | Regra | No Replique |
|---|---|---|
| Base legal (art. 7º) | Todo tratamento precisa de uma base: contrato (V), obrigação legal (II), legítimo interesse (IX), consentimento (I) | Política de Privacidade (`#/privacidade`, `telaLegal` em `web/app.js`) lista as bases por finalidade |
| Transparência (art. 9º) | Informar finalidade, forma, duração, controlador, compartilhamento e direitos | Política de Privacidade; versão em `TERMOS_VERSAO` |
| Direitos do titular (art. 18) | Confirmação, acesso, correção, anonimização/bloqueio/eliminação, portabilidade, informação sobre compartilhamento, revogação | Minha conta › Privacidade e dados: `GET /api/me/dados` (cópia), `POST /api/me/pedido-titular`; admin responde em Configurações (`/api/empresa/pedidos-titular`) |
| Prazo (art. 19, II) | Declaração completa em até 15 dias do pedido | `PRAZO_TITULAR_DIAS` (15), aviso de prazo vencido em Configurações |
| Encarregado (art. 41) | Identidade e contato do encarregado divulgados publicamente | `ENCARREGADO_NOME` e `ENCARREGADO_EMAIL` no `.env`; aparecem na Política. Agente de pequeno porte pode ser dispensado (Res. CD/ANPD nº 2/2022), mas precisa de canal de comunicação |
| Segurança (art. 46) | Medidas técnicas e administrativas para proteger os dados | PBKDF2 nas senhas, tokens criptografados (Fernet), HTTPS, CSP, limites de tentativa, sessões encerráveis, auditoria |
| Incidente (art. 48; Res. CD/ANPD nº 15/2024) | Comunicar ANPD e titulares em até 3 dias úteis quando houver risco ou dano relevante | Processo manual: registrar em `docs/RELATORIO-REVISAO.md` quem decide e como avisar. Registro de acessos ajuda a investigar |
| Transferência internacional (art. 33) | Envio para fora do Brasil só nas hipóteses do artigo (cláusulas-padrão, Res. CD/ANPD nº 19/2024) | Provedores de IA e hospedagem fora do país; citado na Política. Conferir os contratos dos provedores |
| Crianças (art. 14) | Regras especiais para menores | Ferramenta profissional, não destinada a menores (Política, item 9) |
| Minimização (art. 6º, III) | Só os dados necessários | Não guardar dados de compradores além do necessário para lucro por venda (hoje: valores e UF) |

## 2. Marco Civil da Internet — Lei nº 12.965/2014

- **Art. 15:** provedor de aplicação com fins econômicos guarda os registros de acesso (data, hora, IP) por **6 meses**, em
  sigilo e ambiente seguro. No Replique: tabela `registros_acesso` (`services/acessos.py`), com IP, porta de origem e
  navegador; o Replique nunca apaga. Só o admin vê (`GET /api/empresa/acessos`); cada pessoa vê os próprios.
- **Art. 7º e 16:** não guardar dados excessivos em relação à finalidade; informar o usuário de forma clara (Termos e Política).
- **Art. 10:** entregar registros só com ordem judicial.

## 3. Código de Defesa do Consumidor e e-commerce

- **CDC, Lei nº 8.078/1990:** vale quando o lojista for consumidor final do serviço (ex.: MEI); informação clara do preço do
  plano, cancelamento e suporte. Anúncios publicados pelos lojistas precisam respeitar o CDC (informação correta, sem publicidade
  enganosa — arts. 31 e 37): o Replique avisa sobre cópia de anúncios e pede revisão do texto da IA.
- **Decreto nº 7.962/2013 (comércio eletrônico):** razão social, CNPJ, endereço e contato visíveis em quem vende pela internet.
  Para o Replique como SaaS: deixar razão social e CNPJ do controlador (`CONTROLADOR_NOME`, `CONTROLADOR_DOCUMENTO`) nas
  páginas públicas e na cobrança quando houver planos pagos.

## 4. Outras leis que costumam aparecer

- **Lei do Software, nº 9.609/1998:** proteção do código; licença de uso nos Termos.
- **Lei de Direitos Autorais, nº 9.610/1998:** fotos e textos de concorrentes têm dono. Copiar estrutura é ok; copiar foto e
  texto pode gerar denúncia (o Replique avisa na checagem e na nota de risco).
- **Lei da Propriedade Industrial, nº 9.279/1996:** marcas registradas (lista `MARCAS_PROTEGIDAS`).
- **Lei nº 12.737/2012 (crimes informáticos):** acesso indevido a sistema é crime; registre tentativas (registro de acessos).
- **Lei nº 14.063/2020 (assinaturas eletrônicas):** o aceite por checkbox com data, versão e registro é assinatura eletrônica
  simples, suficiente para termos de uso. Guardar `termos_versao`, `termos_aceitos_em` e a atividade de aceite.
- **Obrigações fiscais (CTN, art. 173 e 195):** dados financeiros e de vendas podem precisar ser guardados por 5 anos.

## 5. Como usar numa mudança

1. A mudança cria, lê ou envia dado pessoal? Diga qual base legal (art. 7º) e atualize a Política se for finalidade nova.
2. Envia para terceiro ou para fora do país? Atualize a seção "Com quem compartilhamos".
3. Mudou a Política ou os Termos? Troque `TERMOS_VERSAO` para pedir novo aceite.
4. Nova tela de login ou cadastro? Registre o acesso (`acessos.registrar`) e mostre os links legais (`rodapeLegal`, `ACEITE_HTML`).
5. Apagar dado? Não apague registros de acesso antes de 6 meses nem dados fiscais antes do prazo; prefira desativar e anonimizar.
6. Termine dizendo o que precisa de revisão jurídica.
