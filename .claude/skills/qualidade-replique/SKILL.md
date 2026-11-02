---
name: qualidade-replique
description: Revisão de qualidade do Replique como QA, PO, designer de UX e especialista em segurança, no front (web/) e no back (app/). Use antes de entregar uma funcionalidade nova, quando pedirem "testa tudo", "revisa a experiência", "procura falhas" ou "melhora a tela X". Gera uma lista de problemas com evidência, corrige os seguros e roda os testes. Complementa revisao-replique (mapa do sistema) e leis-brasil-software (legislação).
---

# Qualidade do Replique

Trabalhe numa cópia: banco temporário (`REPLIQUE_DATA_DIR` e `DATABASE_URL` apontando para uma pasta temporária,
`MODO_DEMONSTRACAO=true`, `AGENDADOR_ATIVO=false`), servidor em outra porta. Nunca use o banco real nem tokens reais de
marketplace em teste. Apague a pasta temporária no fim.

## 1. PO — faz sentido?

- A tela serve a um dos quatro objetivos (criar anúncios, controlar contas, acompanhar o cliente, apoiar o consultor)?
- Cada papel vê o que precisa e nada além (admin, operador, consultor, lojista)? Confira `PERMITIDAS` e `menuCompleto`.
- Existe caminho claro do estado vazio para a primeira ação (link no `vazio(...)`)?
- O texto diz o que acontece antes da ação (publicar, pausar, mudar preço) e confirma o que é irreversível?

## 2. UX e interface

- Títulos curtos, verbos no botão ("Publicar selecionados", não "OK"); termos iguais em menu, título e botões.
- Estados: carregando (esqueleto ou "girando"), vazio com caminho, erro com o que fazer, sucesso com `toast`.
- Formulários: `label for`, `autocomplete`, foco no primeiro campo, Enter envia, botão desabilitado enquanto envia (`comBotao`).
- Acessibilidade: contraste nos dois temas, `aria-label` em botão só com ícone, foco visível, alvo de toque de 44 px no celular.
- Celular (largura 375 px): nada corta, tabelas rolam dentro do cartão, menu abre por cima.
- Dados: "Atualizado às" quando vem do agendador; "não disponível" quando a API não entrega; selo "demonstração" no que é fictício.
- Português do Brasil sem erro; números com `numero()`, dinheiro com `brl()`, datas com `data()`.

## 3. QA — o que testar

- Fluxo feliz de ponta a ponta e o mesmo fluxo com cada papel.
- Isolamento: com um acesso de outro cliente ou empresa, as rotas devolvem 403 ou 404 (nunca dados).
- Entradas ruins: campo vazio, texto enorme, número negativo, data inválida, HTML (`<script>`), emoji.
- Duplo clique e duas abas: o botão trava? A fila e o agendador reservam no banco?
- Sem rede ou API fora do ar: mensagem clara e nada quebra.
- Escreva um teste em `tests/` para cada regra nova e rode `.venv/Scripts/python -m pytest -q`; `node --check` nos arquivos de `web/`.
- No navegador, leia o console (`read_console_messages` com `onlyErrors`).

## 4. Segurança (OWASP Top 10 aplicado ao Replique)

| Risco | O que conferir |
|---|---|
| Controle de acesso quebrado | Toda rota usa `usuario_atual`/`contexto*` e confere `empresa_id` e cliente (`acesso.pode_ver`) |
| Falhas de criptografia | Senhas só com `hash_senha` (PBKDF2 600 mil); credenciais com `criptografar`; nada sensível em log, URL ou `localStorage` (a sessão é cookie HttpOnly) |
| Injeção | SQL só pelo ORM; HTML sempre por `h()`; links externos por `urlSegura()` |
| Design inseguro | Ação no marketplace exige confirmação e conferência da conta; limites por hora e por mês |
| Configuração | Cabeçalhos em `main.py` (CSP, HSTS, X-Frame-Options, COOP); `/docs` desligado; segredos só no `.env` |
| Componentes vulneráveis | Versões em `requirements.txt`; scripts externos só com versão fixa |
| Autenticação | Mensagem igual para e-mail inexistente; limite de tentativas; redefinição de senha com token de uso único e prazo curto; sessão encerrada ao trocar senha |
| Integridade | Tokens assinados (`criar_assinado`); OAuth com `state` assinado e PKCE |
| Registro e monitoramento | `auditoria.registrar` para ações; `acessos.registrar` para login (Marco Civil) |
| SSRF | Fotos e importações passam por `services/fotos.py` (bloqueia rede interna) |

## 5. Referências

`docs/SEGURANCA.md` lista os controles e limites atuais. Os textos completos do OWASP ficam em
`C:\meuprojeto\Monvatti\referencias\owasp-cheatsheets\cheatsheets` e o ASVS 5.0 em `C:\meuprojeto\Monvatti\referencias\owasp-asvs\5.0\en` (leia o capítulo do
assunto antes de mudar autenticação, sessão, upload ou cabeçalhos). Para testar telas sem o Chrome, use a skill
`webapp-testing` (Playwright).

## 6. Entrega

Liste os achados em ordem (bloqueia uso, atrapalha, cosmético), com arquivo:linha e como reproduzir. Corrija o que for seguro,
rode os testes e diga o que ficou para decisão do usuário. Não faça commit.
