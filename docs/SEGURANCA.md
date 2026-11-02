# Segurança do Replique

Documento de controles exigido pelo OWASP ASVS 5.0 (requisitos 6.1.1, 6.1.2, 6.1.3, 7.1.1 e 7.1.2). Conferido contra o
ASVS 5.0 e os OWASP Cheat Sheets (Authentication, Forgot Password, Password Storage, Session Management, Multifactor
Authentication, HTTP Headers, File Upload) em 24/10/2026.

## Formas de entrar (ASVS 6.1.3 e 6.3.4)

| Caminho | Quem usa | Controles |
|---|---|---|
| E-mail e senha (`POST /api/auth/login`) | Equipe e lojistas | Limite de tentativas, mensagem igual para e-mail inexistente, tempo de resposta igual (hash falso), segundo fator quando ligado |
| Google (`/api/auth/google/*`) | Quem já tem acesso com o mesmo e-mail | `state` assinado, bilhete de uso único, segundo fator quando ligado |
| Link de convite (`/api/convite/*`, `/api/colaborador/*`) | Novos lojistas e equipe | Token assinado, prazo, uso único, limite por IP |
| Link de senha (`/api/auth/nova-senha`) | Quem esqueceu a senha ou recebeu do admin | Uso único (muda quando a senha muda), 60 min, não entra sozinho, não pula o segundo fator |
| Chave MCP (`REPLIQUE_API_KEY`) | Claude Desktop/Code na máquina da agência | Só o resumo da chave fica no banco; uma por empresa; trocar invalida a anterior |

## Senhas (ASVS 6.2)

- Mínimo de 8 caracteres, até 200, sem regras de tipo de caractere; colar e gerenciadores de senha liberados.
- Recusadas: lista de senhas comuns, palavras comuns com números ou símbolos no fim e com troca de letra por número
  (`S3nha@2026`), sequências de teclado, poucos caracteres diferentes e **palavras do contexto** (ASVS 6.1.2): a parte do
  e-mail antes do @, o nome da pessoa, o nome da empresa e da loja, além de `monvatti`, `replique`, `mercadolivre`,
  `shopee`, `amazon`, `loja`, `vendas`, `admin`. Lista em `backend/security.py` (`_BASES_COMUNS`).
- Guardadas com PBKDF2-HMAC-SHA256 e 600.000 iterações (`SENHA_ITERACOES`); hashes antigos são refeitos no próximo login.
- O administrador não escolhe senha de ninguém (ASVS 6.4.6): gera um link de uso único.
- Sem troca periódica obrigatória (ASVS 6.2.10).

## Contra força bruta e abuso (ASVS 6.1.1 e 6.3.1)

| Controle | Limite |
|---|---|
| Senha errada por e-mail | 5 em 15 min, depois bloqueia 15 min e avisa a pessoa |
| Senha errada por IP | 20 em 15 min |
| Código do segundo fator | 5 errados em 15 min por pessoa |
| Pedidos de "Esqueci minha senha" | 3 por e-mail e 10 por IP por hora |
| Cadastros pelo mesmo IP | 20 por hora |
| IA, pesquisas, fotos e uploads | `LIMITE_*_HORA`; IA também por mês e cliente |

## Segundo fator (ASVS 6.3.3 e 6.5)

App autenticador (TOTP, RFC 6238, 6 dígitos, 30 s, semente de 160 bits criptografada no banco). Cada código vale uma vez.
Dez códigos de recuperação de 80 bits, guardados só como resumo, cada um vale uma vez. Ligar, desligar e gerar novos códigos
pedem a senha de novo (ASVS 7.5.1). O admin pode exigir para a equipe (Configurações › Segurança dos acessos) e zerar o de
quem perdeu o celular, depois de confirmar quem é a pessoa (ASVS 6.4.4).

## Sessões (ASVS 7.1.1 e 7.1.2)

- **Inatividade:** a sessão termina depois de `SESSAO_INATIVIDADE_MIN` (padrão 120 min) sem uso. A tela renova enquanto a
  pessoa usa. Justificativa: ferramenta de trabalho usada o dia todo; duas horas evitam pedir senha a cada pausa e limitam o
  risco de um computador esquecido aberto.
- **Máximo absoluto:** `SESSION_HOURS` (padrão 72 h) desde a entrada; depois disso é preciso entrar de novo.
- **Sessões simultâneas:** sem limite de aparelhos (operadores usam computador e celular). Controles: "Sair de todos os
  aparelhos" (a própria pessoa), "Sessões" (o admin desconecta alguém), e trocar a senha, desligar o segundo fator, mudar o
  papel ou desativar o acesso encerram todas as sessões.
- **No navegador:** cookie `rpq_sessao` HttpOnly, SameSite=Strict e Secure em HTTPS; o JavaScript não lê o token. Pedidos que
  mudam dados exigem o cabeçalho `X-Replique: 1` (proteção contra CSRF). O cabeçalho `Authorization` continua valendo para
  integrações e testes.

## Avisos para a pessoa (ASVS 6.3.5 e 6.3.7)

No sino e por e-mail (quando há SMTP): senha trocada ou redefinida, segundo fator ligado, desligado ou zerado, códigos de
recuperação trocados e 5 senhas erradas seguidas. Entrada a partir de um IP novo avisa no sino.

## Registros (ASVS 16 e Marco Civil, art. 15)

`registros_acesso`: cada entrada, falha, código, redefinição e troca de senha com data, hora, IP, porta e navegador, guardado
por pelo menos 6 meses. `atividades`: quem fez o quê em cada cliente. Senhas, tokens e códigos nunca vão para o registro.

## Navegador e servidor

CSP só com scripts do próprio Replique, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, HSTS em HTTPS, `Cache-Control: no-store` nas rotas da API,
`/docs` desligado e `--no-server-header` nos comandos de inicialização. Uploads: só JPG, PNG e WEBP, até 10 MB, conteúdo
conferido como imagem e nome aleatório no servidor. Fotos de fora passam pela trava contra SSRF (`services/fotos.py`).

## Referências baixadas (só leitura, fora do repositório)

`C:\meuprojeto\Monvatti\referencias\owasp-cheatsheets` (cheatsheets), `owasp-asvs` (5.0/en) e `anthropic-skills`.
