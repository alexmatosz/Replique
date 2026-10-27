(() => {
  if (window.__monvattiEstudo) return;
  window.__monvattiEstudo = true;

  const ESTILO = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .raiz { --azul: #0b50f5; --azul-forte: #0a33d9; --azul-suave: #e8efff; --azul-borda: #c4d4ff; --texto: #0b0f1a; --suave: #5f6b85;
      --tenue: #8a94ab; --borda: #e3e8f2; --fundo: #f4f6fb; --verde: #0f8a5f; --verde-claro: #e3f6ee; --vermelho: #d4343b;
      --vermelho-claro: #fdecec; --amarelo: #a15c07; --amarelo-claro: #fdf3dc;
      font: 13px/1.45 Inter, "Segoe UI", system-ui, -apple-system, sans-serif; color: var(--texto); }
    .painel { margin: 12px 0; border: 1px solid var(--borda); border-radius: 12px; background: #fff; overflow: hidden;
      box-shadow: 0 1px 3px rgba(15, 23, 42, .06); }
    .topo { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--borda); background: var(--fundo); }
    .marca { width: 22px; height: 22px; border-radius: 6px; background: var(--azul); color: #fff; display: grid; place-items: center;
      font-weight: 700; font-size: 12px; flex: none; }
    .topo b { font-size: 13px; }
    .topo .suave { margin-left: auto; }
    .suave { color: var(--suave); font-size: 12px; }
    .corpo { padding: 12px; display: grid; gap: 12px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { padding: 3px 8px; border-radius: 999px; background: var(--azul-suave); color: var(--azul-forte); font-size: 11px; font-weight: 600; }
    .chip.cinza { background: var(--fundo); color: var(--suave); }
    .chip.verde { background: var(--verde-claro); color: var(--verde); }
    .grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .metrica { border: 1px solid var(--borda); border-radius: 8px; padding: 8px 10px; cursor: help; }
    .metrica span { display: block; color: var(--suave); font-size: 11px; }
    .metrica b { display: block; font-size: 15px; margin-top: 2px; }
    .metrica small { color: var(--tenue); font-size: 11px; }
    .bloco { border: 1px solid var(--borda); border-radius: 8px; overflow-x: auto; }
    .bloco h4 { margin: 0; padding: 8px 10px; font-size: 12px; background: var(--fundo); border-bottom: 1px solid var(--borda); }
    table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; font-variant-numeric: tabular-nums; }
    td, th { padding: 7px 10px; text-align: right; border-bottom: 1px solid var(--borda); white-space: nowrap; vertical-align: middle; }
    td .suave, th .suave { display: block; font-size: 10.5px; font-weight: 400; color: var(--tenue); line-height: 1.3; }
    td:first-child, th:first-child { text-align: left; color: var(--suave); font-weight: 400; white-space: normal; }
    th { font-weight: 600; color: var(--texto); font-size: 12px; padding-top: 8px; padding-bottom: 8px; }
    tr:last-child td { border-bottom: 0; }
    tr.total td { border-top: 1px solid var(--azul-borda); font-weight: 600; color: var(--texto); }
    tr.secao td { background: var(--fundo); color: var(--tenue); font-size: 10.5px; font-weight: 600; text-transform: uppercase;
      letter-spacing: .04em; padding-top: 5px; padding-bottom: 5px; }
    .destaque { background: var(--azul-suave); }
    .tabela-venda col.rotulo { width: 40%; }
    .tabela-calc col.rotulo { width: 36%; }
    .indisp { color: var(--tenue); font-size: 13px; font-weight: 500; }
    .linhas { padding: 8px 10px; display: grid; gap: 4px; font-size: 12px; }
    .acoes { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    select, input { padding: 7px 9px; border: 1px solid var(--borda); border-radius: 8px; font: inherit; color: var(--texto); background: #fff; min-width: 0; }
    select:focus, input:focus { outline: none; border-color: var(--azul); box-shadow: 0 0 0 3px rgba(11, 80, 245, .18); }
    button, a.botao { padding: 8px 12px; text-decoration: none; display: inline-block; border: 0; border-radius: 8px; background: var(--azul); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
    button:hover, a.botao:hover { background: var(--azul-forte); }
    button.sec, a.botao.sec { background: #fff; color: var(--texto); border: 1px solid var(--borda); }
    button.sec:hover, a.botao.sec:hover { background: var(--fundo); }
    button:disabled { opacity: .6; cursor: wait; }
    .nota { margin: 0; color: var(--tenue); font-size: 11px; }
    .aviso { padding: 10px 12px; border-radius: 8px; font-size: 12px; }
    .aviso.erro { background: var(--vermelho-claro); color: var(--vermelho); }
    .aviso.info { background: var(--azul-suave); color: var(--azul-forte); }
    .aviso.ok { background: var(--verde-claro); color: var(--verde); }
    .girando { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--azul-borda); border-top-color: var(--azul);
      border-radius: 50%; animation: g 0.8s linear infinite; vertical-align: -2px; margin-right: 6px; }
    @keyframes g { to { transform: rotate(360deg); } }
    .fab { position: fixed; right: 24px; bottom: 96px; width: 52px; height: 52px; border-radius: 50%; background: var(--azul); color: #fff;
      display: grid; place-items: center; font-weight: 700; font-size: 18px; box-shadow: 0 12px 32px -8px rgba(15, 23, 42, .35);
      cursor: pointer; z-index: 2147483000; border: 0; padding: 0; }
    .fundo-gaveta { position: fixed; inset: 0; background: rgba(7, 10, 23, .25); z-index: 2147483001; }
    .gaveta { position: fixed; top: 0; right: 0; height: 100vh; width: min(460px, 100vw); background: #fff; z-index: 2147483002;
      box-shadow: -12px 0 32px -8px rgba(15, 23, 42, .25); display: flex; flex-direction: column; }
    .gaveta header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--borda); }
    .gaveta header b { font-size: 14px; }
    .gaveta header button { margin-left: auto; }
    .abas { display: flex; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--borda); }
    .aba { background: transparent; color: var(--suave); padding: 6px 10px; font-weight: 600; }
    .aba:hover { background: var(--fundo); }
    .aba.ativa { background: var(--azul-suave); color: var(--azul-forte); }
    .conteudo { padding: 14px 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; flex: 1; min-height: 0; }
    .conteudo > * { flex: none; }
    .campos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .campos label { display: grid; gap: 3px; font-size: 11px; color: var(--suave); }
    .campos input { width: 100%; }
    .campos .marcar { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--texto); grid-column: 1 / -1; }
    .campos .marcar input { width: auto; }
    .positivo { color: var(--verde); font-weight: 600; }
    .negativo { color: var(--vermelho); font-weight: 600; }
    .painel.anuncio .corpo { padding: 0; gap: 0; }
    .parte { padding: 14px 14px 16px; border-top: 1px solid var(--borda); }
    .parte:first-child { border-top: 0; }
    .parte-cab { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .parte-cab h5 { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tenue); }
    .parte-cab .dir { margin-left: auto; }
    .destaques { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--azul-borda); border-radius: 10px;
      background: linear-gradient(180deg, #f5f8ff, var(--azul-suave)); overflow: hidden; }
    .destaques > div { padding: 10px 12px; cursor: help; min-width: 0; }
    .destaques > div + div { border-left: 1px solid var(--azul-borda); }
    .destaques span { display: block; font-size: 11px; color: var(--suave); }
    .destaques b { display: block; font-size: 22px; line-height: 1.15; letter-spacing: -.01em; color: var(--azul-forte); margin: 3px 0 2px;
      font-variant-numeric: tabular-nums; white-space: nowrap; }
    .destaques b small { font-size: 12px; font-weight: 600; color: var(--suave); letter-spacing: 0; }
    .destaques em { display: block; font-style: normal; font-size: 11px; color: var(--tenue); }
    .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--borda); border: 1px solid var(--borda);
      border-radius: 10px; overflow: hidden; margin-top: 10px; }
    .kpis > div { background: #fff; padding: 9px 12px; cursor: help; min-width: 0; }
    .kpis span { display: block; font-size: 11px; color: var(--suave); }
    .kpis b { display: block; font-size: 15px; margin-top: 1px; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .kpis b small { font-size: 11px; font-weight: 500; color: var(--suave); }
    .kpis em { display: block; font-style: normal; font-size: 10.5px; color: var(--tenue); }
    .segmento { display: inline-flex; background: var(--fundo); border: 1px solid var(--borda); border-radius: 8px; padding: 2px; gap: 2px; }
    .segmento button { background: transparent; color: var(--suave); padding: 4px 8px; font-size: 11px; font-weight: 600; border-radius: 6px; }
    .segmento button:hover { background: #fff; color: var(--texto); }
    .segmento button.ativo { background: #fff; color: var(--azul-forte); box-shadow: 0 1px 2px rgba(15, 23, 42, .12); }
    .fat { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .fat b { font-size: 22px; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
    .fat .selo { font-size: 10.5px; font-weight: 600; color: var(--amarelo); background: var(--amarelo-claro); padding: 2px 7px; border-radius: 999px; }
    .fat-linha { margin-top: 4px; font-size: 12px; color: var(--suave); }
    .fat-linha strong { color: var(--texto); font-weight: 600; }
    .lista { display: grid; }
    .lista > div { display: flex; align-items: baseline; gap: 10px; padding: 7px 0; border-bottom: 1px dashed var(--borda); cursor: help; }
    .lista > div:last-child { border-bottom: 0; padding-bottom: 0; }
    .lista > div:first-child { padding-top: 0; }
    .lista span { color: var(--suave); font-size: 12px; flex: 1; min-width: 0; }
    .lista b { font-size: 13px; font-variant-numeric: tabular-nums; text-align: right; }
    .lista small { display: block; color: var(--tenue); font-size: 10.5px; font-weight: 400; text-align: right; }
    .vendedor-nome { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .vendedor-nome b { font-size: 14px; }
    .tres { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .tres > div { border: 1px solid var(--borda); border-radius: 8px; padding: 8px 9px; min-width: 0; }
    .tres span { display: flex; align-items: center; gap: 4px; font-size: 10.5px; color: var(--suave); }
    .tres span svg { width: 12px; height: 12px; flex: none; }
    .tres b { display: block; font-size: 12.5px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-variant-numeric: tabular-nums; }
    .ponto { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: 0; }
    .parte .bloco { margin: 0; }
    .rodape { padding: 12px 14px 14px; border-top: 1px solid var(--borda); background: var(--fundo); display: grid; gap: 10px; }
    .vendas-tipos { display: grid; gap: 8px; }
    .tipo { border: 1px solid var(--borda); border-radius: 10px; padding: 9px 11px 10px; min-width: 0; }
    .tipo.este { border-color: var(--azul-borda); background: linear-gradient(180deg, #f7f9ff, #fff 45%); box-shadow: 0 0 0 1px var(--azul-borda) inset; }
    .tipo-cab { display: flex; align-items: center; gap: 6px; padding-bottom: 7px; margin-bottom: 6px; border-bottom: 1px solid var(--borda); }
    .tipo-cab > b { font-size: 13px; }
    .tipo-cab .chip { font-size: 9.5px; padding: 2px 6px; }
    .tipo-recebe { margin-left: auto; font-size: 10.5px; color: var(--suave); white-space: nowrap; cursor: help; }
    .tipo-recebe b { font-size: 14px; color: var(--verde); font-variant-numeric: tabular-nums; }
    .tipo-recebe em { font-style: normal; color: var(--tenue); margin-left: 2px; }
    .tipo-corpo { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: start; }
    .vl { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 2px 0; font-size: 11.5px; cursor: help; }
    .vl span { color: var(--suave); white-space: nowrap; }
    .vl b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .vl b i { font-style: normal; font-weight: 400; color: var(--tenue); font-size: 10.5px; margin-right: 5px; }
    .tipo-faixa { display: grid; gap: 5px; }
    .tipo-faixa > div { border: 1px solid var(--azul-borda); background: var(--azul-suave); border-radius: 7px; padding: 4px 8px; text-align: right; cursor: help; }
    .tipo-faixa span { display: block; font-size: 9.5px; color: var(--suave); white-space: nowrap; }
    .tipo-faixa b { font-size: 12px; color: var(--azul-forte); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .baixar { position: relative; font: 13px/1.4 Inter, "Segoe UI", system-ui, sans-serif; }
    .baixar-btn { width: 36px; height: 36px; padding: 0; border-radius: 10px; display: grid; place-items: center;
      box-shadow: 0 6px 16px -6px rgba(15, 23, 42, .45); }
    .baixar-btn svg { width: 19px; height: 19px; }
    .baixar-menu { position: absolute; top: 44px; left: 0; width: 220px; background: #fff; border: 1px solid var(--borda); border-radius: 10px;
      box-shadow: 0 16px 36px -12px rgba(15, 23, 42, .35); padding: 6px; display: grid; gap: 2px; }
    .baixar-menu[hidden] { display: none; }
    .baixar-menu button { background: transparent; color: var(--texto); text-align: left; font-weight: 500; padding: 8px 10px; border-radius: 7px; }
    .baixar-menu button:hover { background: var(--azul-suave); color: var(--azul-forte); }
    .baixar-menu button:disabled { color: var(--tenue); background: transparent; cursor: default; }
    .baixar-status { margin: 4px 6px 2px; font-size: 11px; color: var(--suave); }
    .q { display: inline-grid; place-items: center; width: 15px; height: 15px; padding: 0; margin-left: 3px; border-radius: 50%;
      background: var(--azul-suave); color: var(--azul-forte); font-size: 10px; font-weight: 700; line-height: 1; vertical-align: 1px; cursor: pointer; }
    .q:hover { background: var(--azul); color: #fff; }
    .explica { position: fixed; z-index: 2147483003; width: 300px; background: #fff; border: 1px solid var(--azul-borda); border-radius: 12px;
      box-shadow: 0 18px 40px -14px rgba(15, 23, 42, .4); padding: 10px 12px 4px; font-size: 12px; color: var(--texto); line-height: 1.5; }
    .explica-cab { display: flex; align-items: center; margin-bottom: 4px; }
    .explica-cab b { font-size: 12px; color: var(--azul-forte); }
    .explica .fechar { margin-left: auto; background: transparent; color: var(--suave); padding: 0 4px; font-size: 16px; line-height: 1; }
    .explica p { margin: 0 0 8px; }
    .resumo-busca { margin: 0 0 12px; }
    .filtros-ativos { border: 1px solid var(--azul-borda); background: var(--azul-suave); border-radius: 10px; padding: 9px 10px; display: grid; gap: 7px;
      font-size: 12px; }
    .filtros-ativos b { color: var(--azul-forte); }
    .filtros-ativos .sec { width: 100%; padding: 6px 10px; font-size: 12px; }
    .chip-filtro { background: #fff; color: var(--azul-forte); border: 1px solid var(--azul-borda); border-radius: 999px; padding: 3px 9px;
      font-size: 11px; font-weight: 600; }
    .chip-filtro:hover { background: var(--azul); color: #fff; }
    .tres-curvas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
    .curva { display: grid; justify-items: center; gap: 1px; padding: 8px 4px; border-radius: 9px; border: 1px solid var(--borda); background: #fff; color: var(--texto); }
    .curva b { font-size: 18px; line-height: 1; }
    .curva span { font-size: 9.5px; color: var(--suave); font-weight: 500; }
    .curva em { font-style: normal; font-size: 12px; font-weight: 700; }
    .curva-a b { color: #0f8a5f; } .curva-b b { color: #a15c07; } .curva-c b { color: #5f6b85; }
    .curva:hover { background: var(--fundo); border-color: var(--azul-borda); }
    .curva.ativo { background: var(--azul); border-color: var(--azul); } .curva.ativo * { color: #fff; }
    .curva:disabled { opacity: .5; cursor: default; }
    .selo-curva { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; margin-left: auto; }
    .selo-curva.curva-a { background: var(--verde-claro); color: var(--verde); }
    .selo-curva.curva-b { background: var(--amarelo-claro); color: var(--amarelo); }
    .selo-curva.curva-c { background: var(--fundo); color: var(--suave); }
    .selo-curva + .chip { margin-left: 4px; }
    .faixa-vendas { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .faixa-vendas label { display: grid; gap: 2px; font-size: 10.5px; color: var(--suave); }
    .faixa-vendas input { width: 100%; padding: 6px 8px; }
    .atalhos { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .atalho { background: #fff; color: var(--azul-forte); border: 1px solid var(--azul-borda); border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 600; }
    .atalho:hover { background: var(--azul-suave); }
    .imposto-estudo { display: grid; gap: 2px; font-size: 10.5px; color: var(--suave); white-space: nowrap; }
    .imposto-estudo span { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--texto); }
    .imposto-estudo input { width: 70px; padding: 6px 8px; }
    .estudo { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--azul-borda); border-radius: 10px;
      background: linear-gradient(90deg, var(--azul-suave), #fff); }
    .estudo-txt { display: flex; gap: 10px; align-items: flex-start; flex: 1; min-width: 0; }
    .estudo-txt .ic { width: 22px; height: 22px; color: var(--azul); margin-top: 2px; }
    .estudo-txt b { display: block; font-size: 13px; }
    .estudo-txt span { display: block; font-size: 11.5px; color: var(--suave); }
    .estudo button { white-space: nowrap; padding: 9px 16px; }
    .resumo-linha { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; background: var(--borda);
      border: 1px solid var(--borda); border-radius: 10px; overflow: hidden; }
    .resumo-linha > div { background: #fff; padding: 9px 12px; }
    .resumo-linha span { display: block; font-size: 11px; color: var(--suave); }
    .resumo-linha b { display: block; font-size: 16px; margin-top: 2px; font-variant-numeric: tabular-nums; }
    .lateral { margin: 0 0 16px; }
    .lateral .corpo { gap: 16px; }
    .ic { width: 15px; height: 15px; flex: none; }
    .lat-cab { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; color: var(--texto); }
    .lat-cab .ic { color: var(--azul); }
    .lat-cab h5 { margin: 0; font-size: 12.5px; font-weight: 700; }
    .lat-total { border: 1px solid var(--azul-borda); background: linear-gradient(180deg, #f5f8ff, var(--azul-suave)); border-radius: 10px;
      padding: 10px 12px; text-align: center; }
    .lat-total b { font-size: 22px; color: var(--azul-forte); font-variant-numeric: tabular-nums; }
    .duas { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .taxa { border-radius: 10px; padding: 8px; display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 6px; }
    .taxa .ic { grid-row: span 2; width: 18px; height: 18px; }
    .taxa span { font-size: 10.5px; color: var(--suave); }
    .taxa b { font-size: 16px; font-variant-numeric: tabular-nums; }
    .taxa.classico { background: var(--azul-suave); color: var(--azul-forte); }
    .taxa.premium { background: #fff6e0; color: #a15c07; }
    .caixinha { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border: 1px solid var(--borda);
      border-radius: 9px; background: #fff; color: var(--texto); font-weight: 500; text-align: center; min-width: 0; }
    .caixinha .ic { width: 17px; height: 17px; color: var(--suave); }
    .caixinha span { font-size: 11px; color: var(--suave); line-height: 1.2; }
    .caixinha b { font-size: 13.5px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    button.caixinha:hover { background: var(--azul-suave); border-color: var(--azul-borda); }
    button.caixinha:hover .ic { color: var(--azul); }
    .caixinha.ativo { background: var(--azul); border-color: var(--azul); }
    .caixinha.ativo .ic, .caixinha.ativo span, .caixinha.ativo b { color: #fff; }
    .caixinha:disabled { opacity: .5; cursor: default; background: #fff; }
    .caixinha.fixa { cursor: help; }
    .caixinha.fixa b { font-size: 12px; white-space: normal; word-break: break-word; }
    .caixinha.prata .ic { color: #8a94ab; } .caixinha.ouro .ic { color: #d4a017; } .caixinha.platina .ic { color: #3b82f6; }
    .lista-filtros { display: grid; gap: 4px; }
    .linha-filtro { display: flex; align-items: center; gap: 8px; width: 100%; background: #fff; color: var(--texto); border: 1px solid var(--borda);
      padding: 7px 10px; font-weight: 500; font-size: 12px; border-radius: 8px; }
    .linha-filtro span { flex: 1; text-align: left; }
    .linha-filtro b { font-variant-numeric: tabular-nums; }
    .linha-filtro:hover { background: var(--fundo); }
    .linha-filtro.ativo { background: var(--azul); color: #fff; border-color: var(--azul); }
    .linha-filtro:disabled { opacity: .5; cursor: default; }
    .aba-vendedores { display: flex; align-items: center; gap: 8px; width: 100%; background: #fff; color: var(--texto); border: 1px solid var(--borda);
      padding: 9px 10px; border-radius: 9px; font-weight: 600; font-size: 12.5px; }
    .aba-vendedores .ic { color: var(--azul); }
    .aba-vendedores span { flex: 1; text-align: left; }
    .aba-vendedores i { display: grid; transition: transform .15s; } .aba-vendedores i.aberto { transform: rotate(180deg); }
    .aba-vendedores:hover { background: var(--fundo); }
    .vend-lista { margin-top: 6px; display: grid; gap: 3px; max-height: 320px; overflow-y: auto; }
    .vend { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0 8px; background: #fff; color: var(--texto); border: 1px solid var(--borda);
      padding: 6px 9px; border-radius: 7px; font-weight: 500; font-size: 11.5px; text-align: left; }
    .vend span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vend span em { font-style: normal; color: var(--tenue); font-size: 10px; }
    .vend b { color: var(--azul-forte); }
    .vend small { grid-column: 1 / -1; color: var(--tenue); font-size: 10px; }
    .vend:hover { background: var(--fundo); }
    .vend.ativo { background: var(--azul); border-color: var(--azul); } .vend.ativo * { color: #fff; }
    .lateral #lat-limpar { width: 100%; }
    .cartao { margin: 4px 10px 10px; border: 1px solid var(--borda); border-radius: 10px; overflow: hidden; background: #fff; }
    .cartao-cab { display: flex; align-items: center; gap: 6px; padding: 6px 9px; background: var(--fundo); border-bottom: 1px solid var(--borda);
      font-size: 11.5px; }
    .cartao-cab .chip { margin-left: auto; font-size: 10px; padding: 2px 6px; }
    .marca.mini { width: 16px; height: 16px; font-size: 9.5px; border-radius: 4px; }
    .cartao-dados { display: grid; grid-template-columns: 1fr 1fr; }
    .cartao-dados > div { padding: 5px 9px; border-bottom: 1px solid var(--borda); min-width: 0; cursor: help; }
    .cartao-dados > div:nth-child(odd) { border-right: 1px solid var(--borda); }
    .cartao-dados span { display: block; font-size: 10px; color: var(--suave); }
    .cartao-dados b { display: block; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .cartao-pe { padding: 7px 9px; font-size: 11px; color: var(--suave); }
  `;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brl = (v) => (v == null || isNaN(v) ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const num = (v) => (v == null || isNaN(v) ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
  const pct = (v) => (v == null || isNaN(v) || !isFinite(v) ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%");
  const dataBR = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
  const numero = (v) => {
    const n = parseFloat(String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  };

  const REPUTACAO = { "1_red": "vermelha", "2_orange": "laranja", "3_yellow": "amarela", "4_light_green": "verde-clara", "5_green": "verde" };
  const MEDALHA = { platinum: "MercadoLíder Platinum", gold: "MercadoLíder Gold", silver: "MercadoLíder" };

  function enviar(msg) {
    return new Promise((ok, falha) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          if (chrome.runtime.lastError) return falha(new Error("A extensão foi atualizada. Aperte F5 nesta página do Mercado Livre e tente de novo."));
          r?.ok ? ok(r.dados) : falha(new Error(r?.erro || "Falha na extensão."));
        });
      } catch {
        falha(new Error("A extensão foi atualizada. Aperte F5 nesta página do Mercado Livre e tente de novo."));
      }
    });
  }

  function hospedeiro(id) {
    document.getElementById(id)?.remove();
    const host = document.createElement("div");
    host.id = id;
    const sombra = host.attachShadow({ mode: "open" });
    sombra.innerHTML = `<style>${ESTILO}</style><div class="raiz"></div>`;
    return { host, raiz: sombra.querySelector(".raiz") };
  }

  function lerVendidos(texto) {
    const m = String(texto || "").toLowerCase().replace(/ /g, " ").match(/(\+)?\s*([\d.,]+)\s*(mil|mi)?\s*vendid/);
    if (!m) return { vendidos: null, patamar: false };
    let n = parseFloat(m[2].replace(/\./g, "").replace(",", "."));
    n *= m[3] === "mil" ? 1000 : m[3] === "mi" ? 1e6 : 1;
    return { vendidos: Math.round(n), patamar: !!m[1] };
  }

  function estimar(vendidos, patamar) {
    if (vendidos == null || !patamar) return vendidos;
    return Math.round(vendidos * 1.5525);
  }

  const ehAnuncio = () => !!document.querySelector("h1.ui-pdp-title");
  const ehBusca = () => !ehAnuncio() && document.querySelectorAll(".poly-card").length > 0;

  function lerAnuncio() {
    const html = document.documentElement.innerHTML;
    const achar = (re) => (html.match(re) || [])[1] || "";
    const url = new URL(location.href);
    const produto = (url.pathname.match(/\/p\/(MLB\d+)/i) || [])[1] || "";
    let item = document.querySelector('input[name="item_id"]')?.value || url.searchParams.get("wid") || "";
    if (!item && !produto) {
      const m = url.pathname.match(/MLB-?(\d{6,})/i);
      if (m) item = "MLB" + m[1];
    }
    const fotos = new Map();
    document.querySelectorAll(".ui-pdp-gallery img, .ui-pdp-gallery__figure img").forEach((i) => {
      const u = i.getAttribute("data-zoom") || i.getAttribute("src") || "";
      const m = u.match(/D_(?:[A-Z0-9]+_)*?(\d+-ML[A-Z]\d+_\d+)-[A-Z]\.(?:jpg|jpeg|webp|png)/);
      if (m && !fotos.has(m[1])) fotos.set(m[1], `https://http2.mlstatic.com/D_NQ_NP_2X_${m[1]}-F.jpg`);
    });
    const atributos = {};
    document.querySelectorAll("tr").forEach((tr) => {
      const k = tr.querySelector("th")?.innerText?.trim();
      const v = tr.querySelector("td")?.innerText?.trim();
      if (k && v && !(k in atributos)) atributos[k] = v;
    });
    return {
      item_id: item.toUpperCase(), produto_id: produto.toUpperCase(),
      titulo: document.querySelector("h1.ui-pdp-title")?.innerText?.trim() || "",
      vendidos_texto: (document.querySelector(".ui-pdp-header__subtitle")?.innerText || "").split("\n")[0].trim(),
      preco: parseFloat(document.querySelector('meta[itemprop="price"]')?.content || "") || null,
      vendedor_id: achar(/"seller_id"\s*:\s*(\d+)/), categoria_id: achar(/"category_id"\s*:\s*"(MLB\d+)"/),
      tipo_anuncio: achar(/"listing_type_id"\s*:\s*"([a-z_]+)"/), logistica: achar(/"logistic_type"\s*:\s*"([a-z_]+)"/),
      estoque: achar(/"available_quantity"\s*:\s*(\d+)/) || null,
      patrocinado: /is_advertising=true/.test(location.href) ? true : null,
      fotos: [...fotos.values()].slice(0, 12),
      descricao: document.querySelector(".ui-pdp-description__content")?.innerText?.trim() || "",
      avaliacoes: numero((document.querySelector(".ui-pdp-review__amount")?.textContent || "").replace(/\D/g, "")) || null,
      nota: parseFloat(document.querySelector(".ui-pdp-review__rating")?.textContent?.replace(",", ".") || "") || null,
      atributos, link: location.origin + location.pathname,
    };
  }

  const estado = { info: null, dados: null, pagina: null, imposto: 7 };

  function aviso(raiz, texto, tipo = "info") {
    raiz.innerHTML = `<div class="painel"><div class="topo"><span class="marca">M</span><b>Monvatti Pro</b></div>
      <div class="corpo"><div class="aviso ${tipo}">${esc(texto)}</div></div></div>`;
  }

  function contaVenda(preco, tarifa, frete, imposto) {
    const valorImposto = preco * imposto / 100;
    const recebe = preco - tarifa.comissao - tarifa.taxa_fixa - (frete || 0) - valorImposto;
    return { imposto: valorImposto, recebe, ideal: recebe > 0 ? [recebe * 0.5, recebe * 0.9] : null };
  }

  function tabelaVenda(d) {
    const tipos = [["gold_special", "Clássico"], ["gold_pro", "Premium"]].filter(([t]) => d.tarifas[t]);
    if (!tipos.length || !d.preco) return `<div class="parte-cab"><h5>Venda</h5></div><p class="nota">Tarifas indisponíveis para este anúncio.</p>`;
    const contas = tipos.map(([t, nome]) => ({ t, nome, tarifa: d.tarifas[t], conta: contaVenda(d.preco, d.tarifas[t], d.frete, estado.imposto) }));
    const linha = (rotulo, valor, titulo = "", extra = "") => `<div class="vl" title="${esc(titulo)}"><span>${rotulo}</span><b>${extra ? `<i>${extra}</i>` : ""}${valor}</b></div>`;
    contas.sort((a, b) => (b.nome === d.tipo_anuncio) - (a.nome === d.tipo_anuncio));
    return `<div class="parte-cab"><h5>Venda a ${brl(d.preco)}</h5>${q("venda")}<span class="suave dir">imposto ${pct(estado.imposto)}</span></div>
      <div class="vendas-tipos">
        ${contas.map((c) => {
          const este = c.nome === d.tipo_anuncio;
          return `<div class="tipo ${este ? "este" : ""}">
            <div class="tipo-cab"><b>${c.nome}</b>${este ? '<span class="chip">este anúncio</span>' : ""}
              <span class="tipo-recebe" title="Preço − comissão − taxa fixa − frete − imposto">recebe <b>${brl(c.conta.recebe)}</b>
              <em>${pct(d.preco ? c.conta.recebe / d.preco * 100 : null)}</em></span></div>
            <div class="tipo-corpo">
              <div class="tipo-custos">
                ${linha("Comissão", brl(c.tarifa.comissao), "Comissão cobrada pelo Mercado Livre", pct(c.tarifa.pct))}
                ${linha("Taxa fixa", brl(c.tarifa.taxa_fixa), "Taxa fixa por unidade (vale para preços abaixo de R$ 79)")}
                ${linha("Frete", d.frete == null ? "—" : brl(d.frete), freteTitulo(d))}
                ${linha("Imposto", brl(c.conta.imposto), "Preço × alíquota de imposto")}
              </div>
              <div class="tipo-faixa">
                <div title="50% do que o vendedor recebe: sobra margem confortável"><span>Custo ideal</span><b>${c.conta.ideal ? brl(c.conta.ideal[0]) : "—"}</b></div>
                <div title="90% do que o vendedor recebe: acima disso a margem some"><span>Custo máximo</span><b>${c.conta.ideal ? brl(c.conta.ideal[1]) : "—"}</b></div>
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>
      ${d.frete_peso_g ? `<p class="nota">Frete calculado pelo Mercado Livre com ${num(d.frete_peso_g)} g cobrados.</p>` : ""}`;
  }

  function freteTitulo(d) {
    if (d.frete_fonte === "anuncio") return "Frete grátis que o vendedor deste anúncio paga, calculado pelo Mercado Livre com o peso cadastrado no anúncio";
    if (d.frete_fonte === "categoria") return "Estimativa pela medida típica da categoria (o Mercado Livre não devolveu o frete do anúncio)";
    return "O Mercado Livre não devolveu o frete deste anúncio";
  }

  function explicacao(chave, d) {
    const n = (x) => (x == null || isNaN(x) ? "—" : Math.round(x).toLocaleString("pt-BR"));
    const dec = (x, c = 1) => (x == null || isNaN(x) ? "—" : Number(x).toLocaleString("pt-BR", { maximumFractionDigits: c }));
    const fonte = {
      anuncio: "a data de criação informada pelo Mercado Livre",
      avaliacao: `a avaliação de comprador mais antiga (${dataBR(d.primeira_avaliacao || d.no_ar_desde)}): se alguém já avaliou, o anúncio já vendia`,
      pergunta: `a primeira pergunta feita no anúncio (${dataBR(d.primeira_pergunta || d.no_ar_desde)})`,
      catalogo: "a data de criação do catálogo, porque o anúncio não tem avaliações nem perguntas",
    }[d.fonte_data] || "nenhuma data encontrada";
    const usouCatalogo = d.dias_catalogo && d.dias === d.dias_catalogo && d.dias_catalogo !== d.dias_anuncio;
    const ehUp = /\/up\/MLBU/i.test(location.pathname);
    const notaUp = ehUp && d.fonte_data === "avaliacao"
      ? `<p><b>Por que pode ser bem menor que em outras ferramentas:</b> esta é uma página de produto (/up/), que junta anúncios antigos e novos do mesmo produto, e as avaliações vêm desde ${dataBR(d.primeira_avaliacao)}. Os ${n(d.vendidos)} vendidos são desse histórico todo. Quem divide só pela idade do anúncio atual, que pode ser recente, chega num número muitas vezes maior.</p>` : "";
    const piso = d.patamar ? `O Mercado Livre mostra “+${n(d.vendidos)} vendidos”, que é um piso: o anúncio vendeu pelo menos ${n(d.vendidos)}.` : `O Mercado Livre mostra ${n(d.vendidos)} vendidos.`;
    const textos = {
      estimadas: `<p>${piso}</p>${d.patamar ? `<p>O número real fica entre esse piso e o próximo degrau. Estimamos <b>1,55 × ${n(d.vendidos)} = ${n(d.vendas_estimadas)}</b>, a mesma régua do Avant Pro.</p>` : "<p>Como o número é exato, a estimativa é igual a ele.</p>"}`,
      ritmo: d.ritmo_mes == null ? "<p>Sem a data do anúncio não dá para calcular o ritmo.</p>"
        : `<p>Supõe que 40% das vendas aconteceram no último terço da vida do anúncio.</p>
           <p>Idade do anúncio: <b>${n(d.dias_anuncio)} dias</b> (${dec(d.dias_anuncio / 30.44)} meses), contada por ${fonte}. Último terço = ${dec(d.dias_anuncio / 30.44 / 3)} meses.</p>
           <p>40% de ${n(d.vendas_estimadas)} = ${n(d.vendas_estimadas * 0.4)}; dividido por ${dec(d.dias_anuncio / 30.44 / 3)} = <b>${n(d.ritmo_mes)} por mês</b>.</p>`,
      dia: d.vendas_dia == null ? "<p>Sem data não dá para calcular a média.</p>"
        : `<p><b>${n(d.vendidos)} vendidos ÷ ${n(d.dias)} dias = ${n(d.vendas_dia)} por dia</b> (${dec(d.vendidos / d.dias, 2)} antes de arredondar).</p>
           <p>Os ${n(d.dias)} dias contam desde ${usouCatalogo ? `a criação do catálogo (${dataBR(d.catalogo_criado_em)}), que é mais antiga que o anúncio` : fonte}. Usamos sempre a data mais antiga que encontramos.</p>${notaUp}`,
      mes: d.vendas_mes == null ? "<p>Sem data não dá para calcular a média.</p>"
        : `<p><b>${n(d.vendidos)} vendidos ÷ ${n(d.dias)} dias × 30 = ${n(d.vendas_mes)} por mês</b>.</p><p>É a média desde o início, não o mês atual. Para o momento atual, veja o ritmo.</p>${notaUp}`,
      avaliacoes: "<p>Quantidade e nota que o Mercado Livre mostra na página do anúncio.</p>",
      perguntas: `<p>Perguntas públicas do anúncio, contadas pela API do Mercado Livre.${d.primeira_pergunta ? ` A primeira é de ${dataBR(d.primeira_pergunta)}.` : ""}</p>`,
      faturamento: `<p><b>Total:</b> ${n(d.vendidos)} vendidos × preço atual ${brl(d.preco)}. Usa o piso público, então o real tende a ser maior.</p>
        <p><b>30 dias, 7 dias e este mês:</b> ritmo atual (${n(d.ritmo_mes)}/mês) ÷ 30 × número de dias × preço atual. São estimativas: o Mercado Livre não informa vendas por período de anúncio de outro vendedor.</p>`,
      criado: d.fonte_data === "anuncio" ? "<p>Data de criação informada pelo Mercado Livre.</p>"
        : `<p>O Mercado Livre não libera a data de criação de anúncio de outro vendedor. Usamos ${fonte}.</p><p>O anúncio foi criado <b>antes</b> dessa data; por isso aparece “aprox.”.</p>`,
      catalogo: "<p>Data de criação do produto de catálogo, informada pela API do Mercado Livre.</p>",
      comissao: "<p>Calculada pela tabela oficial de tarifas do Mercado Livre para esta categoria e este preço, nos dois tipos de anúncio.</p>",
      frete: d.frete_fonte === "anuncio"
        ? `<p>Frete grátis que o vendedor deste anúncio paga, calculado pelo próprio Mercado Livre com o peso cadastrado no anúncio${d.frete_peso_g ? ` (${n(d.frete_peso_g)} g cobrados)` : ""}.</p>`
        : "<p>Estimado pela medida típica da categoria, porque o Mercado Livre não devolveu o frete deste anúncio.</p>",
      recebe: `<p>Preço ${brl(d.preco)} − comissão − taxa fixa − frete − imposto de ${pct(estado.imposto)}.</p><p>Custo ideal = 50% do que recebe; custo máximo = 90%. Acima do máximo a margem praticamente some.</p>`,
      venda: `<p><b>Comissão e taxa fixa:</b> tabela oficial de tarifas do Mercado Livre para esta categoria e este preço, nos dois tipos de anúncio.</p>
        <p><b>Frete:</b> ${d.frete_fonte === "anuncio" ? `calculado pelo próprio Mercado Livre com o peso cadastrado no anúncio${d.frete_peso_g ? ` (${Math.round(d.frete_peso_g)} g cobrados)` : ""}` : "estimado pela medida típica da categoria"}.</p>
        <p><b>Recebe:</b> preço ${brl(d.preco)} − comissão − taxa fixa − frete − imposto de ${pct(estado.imposto)}.</p>
        <p><b>Custo ideal</b> = 50% do que recebe; <b>custo máximo</b> = 90%. Acima do máximo a margem praticamente some.</p>`,
    };
    return textos[chave] || "";
  }

  const q = (chave) => `<button class="q" data-q="${chave}" aria-label="De onde vem esse número?" title="De onde vem esse número?">?</button>`;

  function ligarExplicacoes(raiz, d) {
    let aberto = null;
    const fechar = () => { aberto?.remove(); aberto = null; };
    const caixaAberta = () => document.getElementById("monvatti-explica");
    raiz.querySelectorAll(".q").forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      aberto = aberto || caixaAberta();
      const mesmo = aberto?.dataset.q === b.dataset.q;
      fechar();
      if (mesmo) return;
      const camada = hospedeiro("monvatti-explica");
      document.body.append(camada.host);
      const caixa = document.createElement("div");
      caixa.className = "explica";
      caixa.innerHTML = `<div class="explica-cab"><b>De onde vem esse número</b><button class="fechar" aria-label="Fechar">×</button></div>${explicacao(b.dataset.q, d)}`;
      camada.raiz.append(caixa);
      camada.host.dataset.q = b.dataset.q;
      const r = b.getBoundingClientRect();
      const largura = 300;
      caixa.style.left = Math.max(8, Math.min(r.left - largura / 2, window.innerWidth - largura - 8)) + "px";
      caixa.style.top = Math.min(r.bottom + 6, window.innerHeight - caixa.offsetHeight - 8) + "px";
      caixa.querySelector(".fechar").onclick = fechar;
      caixa.onclick = (ev) => ev.stopPropagation();
      aberto = camada.host;
    }));
    document.addEventListener("click", fechar);
    window.addEventListener("scroll", fechar, { passive: true });
  }

  function desenharAnuncio(raiz) {
    const d = estado.dados;
    const info = estado.info;
    const v = d.vendedor || {};
    const hist = (d.historico || []).filter((x) => x.vendidos != null || x.visitas != null);
    const clientes = info.clientes || [];
    const inteiro = (x) => (x == null || isNaN(x) ? "—" : Math.round(x).toLocaleString("pt-BR"));
    const kpi = (rotulo, valor, titulo, extra = "") => `<div title="${esc(titulo)}"><span>${rotulo}</span><b>${valor}</b>${extra ? `<em>${extra}</em>` : ""}</div>`;
    const item = (rotulo, valor, titulo, extra = "") => `<div title="${esc(titulo)}"><span>${rotulo}</span><b>${valor}${extra ? `<small>${extra}</small>` : ""}</b></div>`;
    const fonteData = { catalogo: "aprox. pelo catálogo", pergunta: "aprox. pela 1ª pergunta", avaliacao: "aprox. pela 1ª avaliação" }[d.fonte_data] || "";
    const tituloData = d.fonte_data === "anuncio" ? "Data de criação do anúncio"
      : d.fonte_data === "avaliacao" ? "O Mercado Livre não libera a criação de anúncio de terceiros. Usamos a avaliação de comprador mais antiga: o anúncio já vendia nessa data, então foi criado antes dela."
      : d.fonte_data === "catalogo" ? "O Mercado Livre não libera a criação de anúncio de terceiros e o anúncio não tem avaliações nem perguntas. Usamos a data do catálogo."
      : d.fonte_data === "pergunta" ? "O Mercado Livre não libera a criação de anúncio de terceiros. Usamos a 1ª pergunta: o anúncio existe pelo menos desde então."
      : "O Mercado Livre não libera a data e o anúncio não tem perguntas";
    const corReputacao = { "1_red": "#d4343b", "2_orange": "#e8730c", "3_yellow": "#e0b100", "4_light_green": "#7cc242", "5_green": "#0f8a5f" }[v.termometro];
    const icone = {
      vendas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>',
      reputacao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 15 8.5l7 1-5 4.9 1.2 7L12 18l-6.2 3.4L7 14.4 2 9.5l7-1z"/></svg>',
      local: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    };
    raiz.innerHTML = `<div class="painel anuncio">
      <div class="topo"><span class="marca">M</span><b>Monvatti Pro</b><span class="suave">${esc(info.conta.conta === "deslogado" ? "ML deslogado" : "conta " + info.conta.conta)}</span></div>
      <div class="corpo">
        <div class="parte">
          <div class="chips">
            ${d.tipo_anuncio ? `<span class="chip">${esc(d.tipo_anuncio)}</span>` : ""}
            ${d.logistica ? `<span class="chip ${d.logistica === "Full" ? "verde" : ""}">${esc(d.logistica)}</span>` : ""}
            ${d.produto_id ? '<span class="chip">Catálogo</span>' : '<span class="chip cinza">Fora do catálogo</span>'}
            ${estado.pagina.patrocinado ? '<span class="chip">Veio de patrocinado</span>' : ""}
            ${d.estoque != null ? `<span class="chip cinza">${num(d.estoque)} em estoque</span>` : ""}
            ${d.frete != null ? `<span class="chip cinza" title="${esc(freteTitulo(d))}">Frete ${brl(d.frete)}</span>` : ""}
          </div>
        </div>
        <div class="parte">
          <div class="parte-cab"><h5>Vendas</h5></div>
          <div class="destaques">
            <div title="O número público é um piso (“+50 mil” = pelo menos 50 mil). Estimativa: 1,55 × o número público. Não é dado oficial do ML.">
              <span>Vendas estimadas ${q("estimadas")}</span><b>${inteiro(d.vendas_estimadas)}</b><em>${inteiro(d.vendidos)} vendidos${d.patamar ? " (público, piso)" : ""}</em></div>
            <div title="Modelo do último terço de vida: 40% das vendas estimadas ÷ um terço da idade do anúncio em meses">
              <span>Ritmo atual ${q("ritmo")}</span><b>${inteiro(d.ritmo_mes)}<small>/mês</small></b><em>${d.ritmo_mes != null ? `≈ ${inteiro(d.ritmo_mes / 30)} por dia hoje` : "sem data do anúncio"}</em></div>
          </div>
          <div class="kpis">
            ${kpi(`Vendas por dia ${q("dia")}`, inteiro(d.vendas_dia), "Vendidos ÷ dias de vida (a data mais antiga entre anúncio e catálogo)", "média desde o início")}
            ${kpi(`Vendas por mês ${q("mes")}`, d.vendas_mes == null ? "—" : `${inteiro(d.vendas_mes)}<small>/mês</small>`, "Vendidos ÷ dias de vida × 30", "média desde o início")}
            ${kpi(`Avaliações ${q("avaliacoes")}`, inteiro(estado.pagina.avaliacoes), "Avaliações de compradores mostradas na página", estado.pagina.nota ? `nota ${String(estado.pagina.nota).replace(".", ",")} de 5` : "")}
            ${kpi(`Perguntas ${q("perguntas")}`, inteiro(d.perguntas), "Perguntas públicas feitas no anúncio", d.primeira_pergunta ? `1ª em ${dataBR(d.primeira_pergunta)}` : "")}
          </div>
        </div>
        <div class="parte">
          <div class="parte-cab"><h5>Faturamento</h5>${q("faturamento")}
            <div class="segmento dir" role="tablist">
              ${[["total", "Total"], ["d30", "30 dias"], ["d7", "7 dias"], ["mes", "Este mês"]].map(([k, r]) => `<button data-periodo="${k}" role="tab">${r}</button>`).join("")}
            </div>
          </div>
          <div id="m-fat"></div>
        </div>
        <div class="parte">
          <div class="parte-cab"><h5>Datas</h5></div>
          <div class="lista">
            ${item(`Anúncio criado em ${q("criado")}`, dataBR(d.no_ar_desde), tituloData, [d.dias_anuncio ? `há ${inteiro(d.dias_anuncio)} dias` : "", fonteData].filter(Boolean).join(" · "))}
            ${d.produto_id ? item(`Catálogo criado em ${q("catalogo")}`, dataBR(d.catalogo_criado_em), "Data de criação do produto de catálogo", d.dias_catalogo ? `há ${inteiro(d.dias_catalogo)} dias` : "") : ""}
            ${d.primeira_avaliacao && d.fonte_data !== "avaliacao" ? item("1ª avaliação", dataBR(d.primeira_avaliacao), "Avaliação de comprador mais antiga encontrada") : ""}
          </div>
        </div>
        <div class="parte">${tabelaVenda(d)}</div>
        ${v.apelido ? `<div class="parte">
          <div class="parte-cab"><h5>Vendedor</h5></div>
          <div class="vendedor-nome"><b>${esc(v.apelido)}</b>${v.medalha ? `<span class="chip">${esc(MEDALHA[v.medalha] || v.medalha)}</span>` : ""}</div>
          <div class="tres">
            <div title="Vendas concluídas do vendedor em toda a conta"><span>${icone.vendas}Vendas</span><b>${inteiro(v.vendas_total)}</b></div>
            <div title="Termômetro de reputação do Mercado Livre"><span>${icone.reputacao}Reputação</span><b>${corReputacao ? `<i class="ponto" style="background:${corReputacao}"></i>` : ""}${esc(REPUTACAO[v.termometro] || "—")}</b></div>
            <div title="${esc([v.cidade, v.uf].filter(Boolean).join("/"))}"><span>${icone.local}Localização</span><b>${esc([v.cidade, v.uf].filter(Boolean).join("/") || "—")}</b></div>
          </div>
        </div>` : ""}
        ${hist.length > 1 ? `<div class="parte"><div class="bloco"><h4>Histórico visto pela equipe</h4><table>
          <tr><th>Dia</th><th>Vendidos</th><th>Preço</th></tr>
          ${hist.slice(-8).map((x) => `<tr><td>${dataBR(x.dia + "T12:00:00")}</td><td>${x.vendidos == null ? "—" : (/\+/.test(x.vendidos_texto || "") ? "+" : "") + num(x.vendidos)}</td><td>${brl(x.preco)}</td></tr>`).join("")}
        </table></div></div>` : ""}
        <div class="rodape">
          <div class="acoes">
            ${clientes.length ? `<select id="m-cliente" aria-label="Cliente que recebe o rascunho">${clientes.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}</select>
              <button id="m-levar">Levar para Rascunhos</button>` : '<span class="suave">Sem clientes para receber rascunhos.</span>'}
            <button class="sec" id="m-calc">Calculadora</button>
          </div>
          <div id="m-retorno"></div>
          <p class="nota">Dados públicos da página e da API oficial, lidos pela conta de estudo. Vendas estimadas, ritmo, períodos e datas marcadas “aprox.” são estimativas. Visitas e conversão o Mercado Livre só mostra ao dono do anúncio.</p>
        </div>
      </div></div>`;
    desenharFaturamento(raiz, d);
    ligarExplicacoes(raiz, d);
    const sel = raiz.querySelector("#m-cliente");
    if (sel) {
      chrome.storage.local.get({ cliente_copia: "" }).then(({ cliente_copia }) => {
        if (cliente_copia && clientes.some((c) => String(c.id) === String(cliente_copia))) sel.value = cliente_copia;
      });
      sel.onchange = () => chrome.storage.local.set({ cliente_copia: sel.value });
      raiz.querySelector("#m-levar").onclick = async (e) => {
        const b = e.currentTarget;
        const retorno = raiz.querySelector("#m-retorno");
        b.disabled = true;
        retorno.innerHTML = '<div class="aviso info"><span class="girando"></span>Criando o rascunho…</div>';
        try {
          const r = await enviar({ tipo: "copiar", cliente_id: +sel.value, pagina: lerAnuncio() });
          estado.copiado = lerAnuncio().item_id || location.pathname;
          retorno.innerHTML = rascunhoCriado(r);
        } catch (err) {
          retorno.innerHTML = `<div class="aviso erro">${esc(err.message)}</div>`;
        } finally {
          b.disabled = false;
        }
      };
    }
    raiz.querySelector("#m-calc").onclick = () => abrirGaveta("calculadora");
  }

  function desenharFaturamento(raiz, d) {
    const caixa = raiz.querySelector("#m-fat");
    const periodos = d.periodos || { total: { vendas: d.vendidos, faturamento: d.faturamento } };
    const escolhido = periodos[estado.periodo] ? estado.periodo : "total";
    const p = periodos[escolhido];
    const nomes = { total: "desde o início", d30: "nos últimos 30 dias", d7: "nos últimos 7 dias", mes: "neste mês até hoje" };
    raiz.querySelectorAll("[data-periodo]").forEach((b) => {
      b.classList.toggle("ativo", b.dataset.periodo === escolhido);
      b.disabled = !periodos[b.dataset.periodo];
      b.onclick = () => {
        estado.periodo = b.dataset.periodo;
        desenharFaturamento(raiz, d);
      };
    });
    const vendas = p.vendas == null ? "—" : Math.round(p.vendas).toLocaleString("pt-BR");
    caixa.innerHTML = `<div class="fat"><b>${brl(p.faturamento)}</b>${escolhido === "total" ? "" : '<span class="selo" title="Calculado pelo ritmo atual de vendas">estimado</span>'}</div>
      <div class="fat-linha"><strong>${vendas} vendas</strong> ${nomes[escolhido]} · preço atual ${brl(d.preco)}</div>`;
  }

  const alvoDoPainel = () => document.querySelector(".ui-pdp-header") || document.querySelector("h1.ui-pdp-title")?.parentElement;
  const chaveDoAnuncio = () => location.pathname + "|" + (document.querySelector('input[name="item_id"]')?.value || "");

  function garantirPainel() {
    if (!estado.info || !ehAnuncio()) return;
    const chave = chaveDoAnuncio();
    if (estado.painel?.chave === chave) {
      const alvo = alvoDoPainel();
      if (!estado.painel.host.isConnected && alvo) alvo.after(estado.painel.host);
      return;
    }
    montarAnuncio(chave);
  }

  async function montarAnuncio(chave) {
    const alvo = alvoDoPainel();
    if (!alvo) return;
    const { host, raiz } = hospedeiro("monvatti-painel");
    estado.painel = { host, raiz, chave };
    estado.dados = null;
    alvo.after(host);
    const info = estado.info;
    if (!info || info.erro) return aviso(raiz, info?.erro || "Não consegui falar com a extensão.", "erro");
    if (!info.ligado) return aviso(raiz, "Extensão desligada. Clique no ícone do Monvatti Pro na barra do Chrome e cole o código do administrador.");
    if (!info.conta.liberado) return aviso(raiz, info.conta.motivo, "erro");
    raiz.innerHTML = '<div class="painel"><div class="topo"><span class="marca">M</span><b>Monvatti Pro</b></div><div class="corpo"><div class="suave"><span class="girando"></span>Carregando dados do anúncio…</div></div></div>';
    estado.pagina = lerAnuncio();
    try {
      const dados = await enviar({ tipo: "anuncio", pagina: estado.pagina });
      if (estado.painel?.chave !== chave) return;
      estado.dados = dados;
      desenharAnuncio(raiz);
      estado.aoCarregar?.();
    } catch (err) {
      if (estado.painel?.chave === chave) aviso(raiz, err.message, "erro");
    }
  }

  function categoriasDaBusca() {
    const mapa = {};
    const texto = [...document.querySelectorAll("script")].map((s) => s.textContent).sort((a, b) => b.length - a.length)[0] || "";
    texto.replace(/\\"/g, '"').split('"polycard":').slice(1).forEach((b) => {
      const id = (b.match(/"id":"(MLB\d{9,10})"/) || [])[1];
      const cat = (b.match(/"category_id":"(MLB\d+)"/) || [])[1];
      if (id && cat && !mapa[id]) mapa[id] = cat;
    });
    return mapa;
  }

  function lerBusca() {
    const vistos = new Set();
    const categorias = categoriasDaBusca();
    return [...document.querySelectorAll(".poly-card")].map((card) => {
      const el = card.closest("li") || card;
      if (vistos.has(el)) return null;
      vistos.add(el);
      const html = el.innerHTML;
      const item = (html.match(/MLB\d{9,10}(?!\d)/) || [])[0] || "";
      const produto = (html.match(/\/p\/(MLB\d+)/) || [])[1] || "";
      const link = el.querySelector("a.poly-component__title") || el.querySelector("a");
      const texto = el.innerText;
      const patrocinado = /mclics/.test(link?.href || "") || [...el.querySelectorAll("span,div")]
        .some((e) => e.childElementCount === 0 && /^(Patrocinado|Ad)$/.test(e.textContent.trim()));
      const vendidosTexto = (texto.match(/\+?[\d.,]+\s*(mil)?\s*vendidos/i) || [])[0] || "";
      const fracao = el.querySelector(".poly-price__current .andes-money-amount__fraction")
        || [...el.querySelectorAll(".andes-money-amount__fraction")].find((f) => !f.closest("s, .andes-money-amount--previous"));
      const centavos = fracao?.parentElement?.querySelector(".andes-money-amount__cents")?.textContent || "0";
      const preco = fracao ? numero(fracao.textContent) + numero(centavos) / 100 : null;
      const vendedorTexto = el.querySelector(".poly-component__seller")?.innerText?.trim() || "";
      return {
        el, item_id: item, produto_id: produto, patrocinado, vendidos_texto: vendidosTexto, preco,
        categoria_id: categorias[item] || "", catalogo: !!produto,
        titulo: el.querySelector(".poly-component__title")?.innerText?.trim() || "",
        full: !!el.querySelector('svg[aria-label*="FULL" i]'),
        frete_gratis: /(frete|envio|chegará) grátis/i.test(texto) && !/grátis.{0,80}primeira compra/is.test(texto),
        premium: /sem juros/i.test(texto),
        oferta: /\d+%\s*OFF/i.test(texto), oficial: !!el.querySelector('use[href*="cockade"], svg[aria-label*="oficial" i]') || /^por /i.test(vendedorTexto),
        internacional: /internacional/i.test(texto), loja: vendedorTexto.replace(/^por\s+/i, ""),
      };
    }).filter(Boolean);
  }

  const ICONES = {
    grafico: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    etiqueta: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    medalha: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
    calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    caminhao: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    raio: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    moto: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h3l3 6M5.5 17.5 9 10h6l3.5 7.5"/>',
    carta: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    casa: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    loja: '<path d="M3 9 4.5 3h15L21 9M3 9h18v12H3zM3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
    caixa: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    pessoas: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    grade: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    ok: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    coroa: '<path d="m2 18 2-11 5 5 3-7 3 7 5-5 2 11z"/><path d="M2 21h20"/>',
    selo: '<path d="M12 2 15 5h4v4l3 3-3 3v4h-4l-3 3-3-3H5v-4l-3-3 3-3V5h4z"/><path d="m9 12 2 2 4-4"/>',
    globo: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    anuncio: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a3 3 0 0 1 0 6M19 6a7 7 0 0 1 0 12"/>',
    oferta: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    presente: '<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    camadas: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    sacola: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    desce: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    sobe: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    seta: '<path d="m6 9 6 6 6-6"/>',
  };
  const icone = (nome) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome] || ""}</svg>`;

  const LOGISTICA = { fulfillment: "full", self_service: "flex", drop_off: "correios", cross_docking: "coleta", xd_drop_off: "places" };
  const logisticaDe = (i) => LOGISTICA[i.logistica] || (i.full ? "full" : i.logistica ? "outros" : null);
  const tipoDe = (i) => i.tipo || (i.premium ? "gold_pro" : "gold_special");
  const faixaCatalogo = (n) => (n == null ? null : n <= 5 ? "1-5" : n <= 10 ? "6-10" : n <= 30 ? "11-30" : "30+");
  const nomeVendedor = (i, d) => d?.vendedor?.apelido || i.loja || "";

  const FILTROS = {
    novos: (i, d) => d?.dias != null && d.dias < 180,
    medios: (i, d) => d?.dias != null && d.dias >= 180 && d.dias <= 365,
    antigos: (i, d) => d?.dias != null && d.dias > 365,
    full: (i) => logisticaDe(i) === "full", flex: (i) => logisticaDe(i) === "flex", correios: (i) => logisticaDe(i) === "correios",
    coleta: (i) => logisticaDe(i) === "coleta", places: (i) => logisticaDe(i) === "places", outros: (i) => logisticaDe(i) === "outros",
    "1-5": (i, d) => faixaCatalogo(d?.vendedores_catalogo) === "1-5", "6-10": (i, d) => faixaCatalogo(d?.vendedores_catalogo) === "6-10",
    "11-30": (i, d) => faixaCatalogo(d?.vendedores_catalogo) === "11-30", "30+": (i, d) => faixaCatalogo(d?.vendedores_catalogo) === "30+",
    sem_medalha: (i, d) => d?.vendedor && !d.vendedor.medalha, lider: (i, d) => d?.vendedor?.medalha === "silver",
    gold: (i, d) => d?.vendedor?.medalha === "gold", platinum: (i, d) => d?.vendedor?.medalha === "platinum",
    classico: (i) => tipoDe(i) === "gold_special", premium: (i) => tipoDe(i) === "gold_pro",
    oficiais: (i) => i.oficial, internacional: (i) => i.internacional, patrocinados: (i) => i.patrocinado,
    oferta: (i) => i.oferta, gratis: (i) => i.frete_gratis, catalogo: (i) => i.catalogo, fora: (i) => !i.catalogo,
  };

  const GRUPOS = {
    novos: "data", medios: "data", antigos: "data",
    full: "logistica", flex: "logistica", correios: "logistica", coleta: "logistica", places: "logistica", outros: "logistica",
    "1-5": "faixa", "6-10": "faixa", "11-30": "faixa", "30+": "faixa",
    sem_medalha: "medalha", lider: "medalha", gold: "medalha", platinum: "medalha",
    classico: "tipo", premium: "tipo", catalogo: "catalogo", fora: "catalogo", A: "curva", B: "curva", C: "curva",
  };
  const grupoDe = (k) => (k.startsWith("vendedor:") ? "vendedor" : GRUPOS[k] || k);

  function curvas() {
    const itens = estado.itensBusca || [];
    const dados = estado.busca?.dados || {};
    const chave = itens.map((i) => i.item_id).join() + "|" + !!estado.busca?.dados;
    if (estado.curvas?.chave === chave) return estado.curvas.mapa;
    const valor = (i) => (i.preco || 0) * (dados[i.item_id]?.vendas_mes ?? i.vendidos ?? 0);
    const ordenados = itens.filter((i) => valor(i) > 0).sort((a, b) => valor(b) - valor(a));
    const total = ordenados.reduce((a, i) => a + valor(i), 0);
    const mapa = {};
    let acumulado = 0;
    ordenados.forEach((i) => {
      mapa[i.item_id || i.titulo] = acumulado < total * 0.8 ? "A" : acumulado < total * 0.95 ? "B" : "C";
      acumulado += valor(i);
    });
    itens.filter((i) => valor(i) <= 0).forEach((i) => (mapa[i.item_id || i.titulo] = "C"));
    estado.curvas = { chave, mapa };
    return mapa;
  }
  const curvaDe = (i) => curvas()[i.item_id || i.titulo];
  FILTROS.A = (i) => curvaDe(i) === "A";
  FILTROS.B = (i) => curvaDe(i) === "B";
  FILTROS.C = (i) => curvaDe(i) === "C";

  function testa(k, it, d) {
    if (k.startsWith("vendedor:")) return nomeVendedor(it, d) === k.slice(9);
    return FILTROS[k] ? FILTROS[k](it, d) : true;
  }

  function passaNoFiltro(it, ignorarGrupo = null) {
    const d = estado.busca?.dados?.[it.item_id];
    const grupos = {};
    (estado.filtros || []).forEach((k) => (grupos[grupoDe(k)] = grupos[grupoDe(k)] || []).push(k));
    for (const [g, chaves] of Object.entries(grupos)) {
      if (g !== ignorarGrupo && !chaves.some((k) => testa(k, it, d))) return false;
    }
    if (ignorarGrupo !== "vendas" && (estado.vendasMin != null || estado.vendasMax != null)) {
      const v = d?.vendas_mes;
      if (v == null) return false;
      if (estado.vendasMin != null && v < estado.vendasMin) return false;
      if (estado.vendasMax != null && v > estado.vendasMax) return false;
    }
    return true;
  }

  const temFiltro = () => (estado.filtros || []).length > 0 || estado.vendasMin != null || estado.vendasMax != null;

  function alternarFiltro(k) {
    const lista = estado.filtros || [];
    estado.filtros = lista.includes(k) ? lista.filter((x) => x !== k) : [...lista, k];
    filtrosMudaram();
  }

  function filtrosMudaram() {
    aplicarFiltro();
    desenharLateral();
    desenharResumo();
  }

  function aplicarFiltro() {
    const itens = estado.itensBusca || [];
    itens.forEach((it) => (it.el.style.display = passaNoFiltro(it) ? "" : "none"));
    const lista = itens[0]?.el.parentElement;
    if (!lista) return;
    const deAnuncio = new Set(itens.map((i) => i.el));
    [...lista.children].forEach((filho) => {
      if (deAnuncio.has(filho) || filho.id?.startsWith("monvatti")) return;
      filho.style.display = temFiltro() ? "none" : "";
    });
  }

  function desenharLateral() {
    const raiz = estado.lateral?.raiz;
    const itens = estado.itensBusca || [];
    if (!raiz || !itens.length) return;
    const dados = estado.busca?.dados || {};
    const carregado = !!estado.busca?.dados;
    const conta = (k) => itens.filter((i) => passaNoFiltro(i, grupoDe(k)) && testa(k, i, dados[i.item_id])).length;
    const soma = itens.reduce((a, i) => a + (i.vendidos || 0), 0);
    const precos = itens.map((i) => i.preco).filter((p) => p > 0);
    const fats = itens.map((i) => (i.preco || 0) * (i.vendidos || 0)).filter((f) => f > 0);
    const maisComum = (tipo) => {
      const contagem = {};
      Object.values(dados).forEach((x) => { const p = x.tarifas?.[tipo]?.pct; if (p != null) contagem[p] = (contagem[p] || 0) + 1; });
      const melhor = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
      return melhor ? +melhor[0] : null;
    };
    const vendedores = {};
    itens.forEach((i) => {
      const nome = nomeVendedor(i, dados[i.item_id]);
      if (!nome) return;
      vendedores[nome] = vendedores[nome] || { anuncios: 0, vendidos: 0, medalha: dados[i.item_id]?.vendedor?.medalha };
      vendedores[nome].anuncios += 1;
      vendedores[nome].vendidos += i.vendidos || 0;
    });
    const listaVend = Object.entries(vendedores).sort((a, b) => b[1].vendidos - a[1].vendidos);
    const ativo = (k) => ((estado.filtros || []).includes(k) ? "ativo" : "");
    const visiveis = itens.filter((i) => passaNoFiltro(i)).length;
    const caixa = (k, ic, rotulo, valor = null, extra = "") => {
      const n = valor ?? conta(k);
      return `<button class="caixinha ${ativo(k)} ${extra}" data-filtro="${k}" ${n || ativo(k) ? "" : "disabled"}>${icone(ic)}<span>${rotulo}</span><b>${num(n)}</b></button>`;
    };
    const info = (ic, rotulo, valor, titulo = "") => `<div class="caixinha fixa" title="${esc(titulo)}">${icone(ic)}<span>${rotulo}</span><b>${valor}</b></div>`;
    const linhaData = (k, cor, rotulo) => `<button class="linha-filtro ${ativo(k)}" data-filtro="${k}" ${conta(k) || ativo(k) ? "" : "disabled"}>
      <i class="ponto" style="background:${cor}"></i><span>${rotulo}</span><b>${num(conta(k))}</b></button>`;
    const cab = (ic, titulo, extra = "") => `<div class="lat-cab">${icone(ic)}<h5>${titulo}</h5>${extra}</div>`;
    const aguardando = '<p class="nota">Clique em “Carregar dados Monvatti Pro” para ver.</p>';
    raiz.innerHTML = `<div class="painel lateral"><div class="topo"><span class="marca">M</span><b>Monvatti Pro</b>
        <span class="suave">${itens.length} anúncios</span></div>
      <div class="corpo">
        ${temFiltro() ? `<div class="filtros-ativos"><div><b>${num(visiveis)}</b> de ${num(itens.length)} anúncios com os filtros:</div>
          <div class="chips">${(estado.filtros || []).map((k) => `<button class="chip-filtro" data-filtro="${esc(k)}">${esc(nomeDoFiltro(k))} ×</button>`).join("")}
          ${estado.vendasMin != null || estado.vendasMax != null ? `<button class="chip-filtro" id="lat-limpar-vendas">${esc(nomeFaixaVendas())} ×</button>` : ""}</div>
          <button class="sec" id="lat-limpar">Limpar todos os filtros</button></div>` : ""}
        <div class="lat-bloco">${cab("grafico", "Total de vendas da página")}
          <div class="lat-total" title="Soma dos números públicos de vendidos desta página"><b>${num(soma)}</b></div></div>
        <div class="lat-bloco">${cab("etiqueta", "Taxa da categoria")}
          ${carregado && maisComum("gold_special") != null ? `<div class="duas">
            <div class="taxa classico">${icone("ok")}<span>Clássico</span><b>${pct(maisComum("gold_special"))}</b></div>
            <div class="taxa premium">${icone("coroa")}<span>Premium</span><b>${pct(maisComum("gold_pro"))}</b></div></div>` : aguardando}</div>
        <div class="lat-bloco">${cab("camadas", "Curva ABC", `<button class="q" title="${esc(EXPLICA_CURVA)}" aria-label="${esc(EXPLICA_CURVA)}">?</button>`)}
          <div class="tres-curvas">
            ${["A", "B", "C"].map((k) => `<button class="curva curva-${k.toLowerCase()} ${ativo(k)}" data-filtro="${k}" ${conta(k) || ativo(k) ? "" : "disabled"}>
              <b>${k}</b><span>${{ A: "cliente grande", B: "cliente médio", C: "cliente pequeno" }[k]}</span><em>${num(conta(k))}</em></button>`).join("")}
          </div>
          <p class="nota">${carregado ? "Pelo faturamento mensal (venda/mês × preço) de cada anúncio." : "Pelo faturamento público; fica mais preciso depois de carregar os dados."}</p></div>
        <div class="lat-bloco">${cab("sacola", "Vendas por mês")}
          ${carregado ? `<div class="faixa-vendas"><label>de<input id="lat-vmin" type="number" min="0" step="1" placeholder="0" value="${estado.vendasMin ?? ""}"></label>
            <label>até<input id="lat-vmax" type="number" min="0" step="1" placeholder="sem limite" value="${estado.vendasMax ?? ""}"></label></div>
            <div class="atalhos">${[[1, 30], [30, 100], [100, 500], [500, null]].map(([a, b]) => `<button class="atalho" data-vmin="${a}" data-vmax="${b ?? ""}">${b ? `${a} a ${b}` : `+${a}`}</button>`).join("")}</div>` : aguardando}</div>
        <div class="lat-bloco">${cab("medalha", "Medalhas")}
          ${carregado ? `<div class="duas">${caixa("sem_medalha", "medalha", "Sem medalha")}${caixa("lider", "medalha", "MercadoLíder", null, "prata")}
            ${caixa("gold", "medalha", "Gold", null, "ouro")}${caixa("platinum", "medalha", "Platinum", null, "platina")}</div>` : aguardando}</div>
        <div class="lat-bloco">${cab("calendario", "Data de criação")}
          ${carregado ? `<div class="lista-filtros">${linhaData("novos", "#0f8a5f", "Menos de 180 dias")}${linhaData("medios", "#e0b100", "180 a 365 dias")}
            ${linhaData("antigos", "#d4343b", "Mais de 365 dias")}</div>` : aguardando}</div>
        <div class="lat-bloco">${cab("caminhao", "Logísticas de entrega")}
          <div class="duas">${caixa("full", "raio", "Full")}${caixa("flex", "moto", "Flex")}${caixa("correios", "carta", "Correios")}
            ${caixa("coleta", "casa", "Coleta")}${caixa("places", "loja", "Places")}${caixa("outros", "caminhao", "Outros")}</div>
          ${carregado ? "" : '<p class="nota">Antes de carregar, só o Full é identificado.</p>'}</div>
        <div class="lat-bloco">${cab("lista", "Catálogos por faixa de vendedores")}
          ${carregado ? `<div class="duas">${caixa("1-5", "pessoas", "1 a 5")}${caixa("6-10", "pessoas", "6 a 10")}
            ${caixa("11-30", "pessoas", "11 a 30")}${caixa("30+", "pessoas", "Mais de 30")}</div>` : aguardando}</div>
        <div class="lat-bloco">${cab("grade", "Outras informações")}
          <div class="duas">
            ${caixa("classico", "ok", "Clássico")}${caixa("premium", "coroa", "Premium")}
            ${caixa("oficiais", "selo", "Oficiais")}${caixa("internacional", "globo", "Internacional")}
            ${caixa("patrocinados", "anuncio", "Patrocinados")}${caixa("oferta", "oferta", "Oferta")}
            ${caixa("gratis", "presente", "Frete grátis")}${caixa("catalogo", "camadas", "Em catálogo")}
            ${caixa("fora", "caixa", "Fora catálogo")}${info("sacola", "Vendedores", carregado ? num(listaVend.length) : "—", "Vendedores diferentes identificados")}
            ${info("desce", "Menor preço", brl(precos.length ? Math.min(...precos) : null))}${info("sobe", "Maior preço", brl(precos.length ? Math.max(...precos) : null))}
            ${info("desce", "Menor faturamento", brl(fats.length ? Math.min(...fats) : null), "Preço × vendidos públicos")}
            ${info("sobe", "Maior faturamento", brl(fats.length ? Math.max(...fats) : null), "Preço × vendidos públicos")}
          </div>
          ${carregado ? "" : '<p class="nota">Clássico e Premium ficam exatos depois de carregar os dados.</p>'}</div>
        <div class="lat-bloco">
          <button class="aba-vendedores" id="lat-vend" ${listaVend.length ? "" : "disabled"}>${icone("pessoa")}<span>Vendedores</span><b>${num(listaVend.length)}</b>
            <i class="${estado.vendAberto ? "aberto" : ""}">${icone("seta")}</i></button>
          ${estado.vendAberto ? `<div class="vend-lista">${listaVend.map(([nome, v]) => `<button class="vend ${ativo("vendedor:" + nome)}" data-filtro="vendedor:${esc(nome)}">
              <span>${esc(nome)}${v.medalha ? ` <em>${esc(MEDALHA[v.medalha] || "")}</em>` : ""}</span><b>${num(v.anuncios)}</b><small>${num(v.vendidos)} vendidos</small></button>`).join("")}</div>` : ""}
        </div>
        ${temFiltro() ? "" : '<p class="nota">Clique nas caixas para filtrar. Filtros de grupos diferentes se somam (ex.: catálogo com 1 a 5 vendedores + Correios); no mesmo grupo, vale qualquer um deles.</p>'}
      </div></div>`;
    raiz.querySelectorAll("[data-filtro]").forEach((b) => (b.onclick = () => alternarFiltro(b.dataset.filtro)));
    const lerNumero = (el) => (el.value === "" ? null : Math.max(0, Math.round(+el.value)));
    raiz.querySelectorAll("#lat-vmin, #lat-vmax").forEach((el) => (el.onchange = () => {
      estado.vendasMin = lerNumero(raiz.querySelector("#lat-vmin"));
      estado.vendasMax = lerNumero(raiz.querySelector("#lat-vmax"));
      filtrosMudaram();
    }));
    raiz.querySelectorAll("[data-vmin]").forEach((b) => (b.onclick = () => {
      estado.vendasMin = +b.dataset.vmin;
      estado.vendasMax = b.dataset.vmax === "" ? null : +b.dataset.vmax;
      filtrosMudaram();
    }));
    const limparVendas = raiz.querySelector("#lat-limpar-vendas");
    if (limparVendas) limparVendas.onclick = () => { estado.vendasMin = null; estado.vendasMax = null; filtrosMudaram(); };
    raiz.querySelector("#lat-vend").onclick = () => { estado.vendAberto = !estado.vendAberto; desenharLateral(); };
    const limpar = raiz.querySelector("#lat-limpar");
    if (limpar) limpar.onclick = () => { estado.filtros = []; estado.vendasMin = null; estado.vendasMax = null; filtrosMudaram(); };
  }

  function desenharCartao(it, soma) {
    const raiz = it.raiz;
    if (!raiz) return;
    const d = estado.busca?.dados?.[it.item_id];
    const carregando = estado.busca?.carregando;
    const inteiro = (x) => (x == null || isNaN(x) ? "—" : Math.round(x).toLocaleString("pt-BR"));
    const fat = it.preco && it.vendidos ? it.preco * it.vendidos : null;
    const l = (rotulo, valor, titulo = "") => `<div title="${esc(titulo)}"><span>${rotulo}</span><b>${valor}</b></div>`;
    const v = d?.vendedor || {};
    const tipo = tipoDe(it);
    const tarifa = d?.tarifas?.[tipo];
    const nomesLog = { full: "Full", flex: "Flex", correios: "Correios", coleta: "Coleta", places: "Places", outros: "Outros" };
    raiz.innerHTML = `<div class="cartao">
      <div class="cartao-cab"><span class="marca mini">M</span><b>Monvatti Pro</b>
        ${curvaDe(it) ? `<span class="selo-curva curva-${curvaDe(it).toLowerCase()}" title="${esc(EXPLICA_CURVA)}">Curva ${curvaDe(it)}</span>` : ""}
        ${it.patrocinado ? '<span class="chip">Patrocinado</span>' : ""}</div>
      <div class="cartao-dados">
        ${l("Vendidos", inteiro(it.vendidos), "Número público (piso) do Mercado Livre")}
        ${l("Estimadas", inteiro(d?.vendas_estimadas ?? estimar(it.vendidos, it.patamar)), "1,55 × o número público")}
        ${l("Participação", soma && it.vendidos ? pct(it.vendidos / soma * 100) : "—", "Vendidos deste anúncio ÷ vendidos da página")}
        ${l("Faturamento", brl(fat), "Preço atual × vendidos")}
        ${d ? `
          ${l("Vendas/dia", inteiro(d.vendas_dia), "Vendidos ÷ dias desde a data mais antiga encontrada")}
          ${l("Vendas/mês", d.vendas_mes == null ? "—" : `${inteiro(d.vendas_mes)}/mês`, "Vendidos ÷ dias × 30")}
          ${l("Ritmo atual", d.ritmo_mes == null ? "—" : `${inteiro(d.ritmo_mes)}/mês`, "40% das vendas estimadas ÷ um terço da idade em meses")}
          ${l("Criado em", d.no_ar_desde ? `${dataBR(d.no_ar_desde)}` : "—", d.fonte_data === "avaliacao" ? "Aprox.: data da avaliação mais antiga do anúncio" : d.fonte_data === "pergunta" ? "Aprox.: data da 1ª pergunta" : "Sem avaliações nem perguntas")}
          ${l("Tipo", tipo === "gold_pro" ? "Premium" : "Clássico", it.tipo ? "Lido na página do anúncio" : "Pelo parcelamento sem juros do cartão")}
          ${l("Logística", nomesLog[logisticaDe(it)] || "—", "Lida na página do anúncio")}
          ${l("Comissão", tarifa ? `${brl(tarifa.comissao + tarifa.taxa_fixa)} · ${pct(tarifa.pct)}` : "—", "Tabela oficial de tarifas do ML para o preço atual")}
          ${l("Frete", brl(d.frete), "Frete grátis que o vendedor paga (precisa do vendedor identificado)")}
          ${l("Vendedor", esc(v.apelido || it.loja || "—"), v.medalha ? MEDALHA[v.medalha] || "" : "")}
          ${l("Local", esc([v.cidade, v.uf].filter(Boolean).join("/") || "—"))}
          ${l("Reputação", esc(REPUTACAO[v.termometro] || "—"))}
          ${l("Perguntas", inteiro(d.perguntas))}` : ""}
      </div>
      ${!d ? `<div class="cartao-pe">${carregando ? '<span class="girando"></span>Carregando…' : "Carregue os dados no topo da lista para ver o resto."}</div>` : ""}
    </div>`;
  }

  async function carregarBusca(url) {
    const itens = (estado.itensBusca || []).filter((i) => i.item_id);
    if (!itens.length || estado.busca?.carregando) return;
    estado.busca = { url, carregando: true, etapa: "Lendo a página de cada anúncio…" };
    desenharTudoBusca();
    try {
      const detalhes = await enviar({ tipo: "detalhes", ids: itens.map((i) => i.item_id) });
      if (estado.busca.url !== url) return;
      itens.forEach((i) => {
        const x = detalhes[i.item_id];
        if (!x) return;
        i.vendedor_id = x.vendedor_id || "";
        i.tipo = x.tipo || "";
        i.logistica = x.logistica || "";
        i.categoria_id = i.categoria_id || x.categoria_id || "";
      });
      estado.busca.etapa = "Calculando datas, comissão, frete e vendedores…";
      desenharResumo();
      const r = await enviar({ tipo: "busca", itens: itens.map(({ el, raiz, ...resto }) => resto) });
      if (estado.busca.url !== url) return;
      estado.busca = { url, dados: Object.fromEntries((r.itens || []).map((x) => [x.item_id, x])), categorias: r.categorias || {} };
    } catch (err) {
      estado.busca = { url, erro: err.message };
    }
    desenharTudoBusca();
  }

  function desenharTudoBusca() {
    const itens = estado.itensBusca || [];
    const soma = itens.reduce((a, i) => a + (i.vendidos || 0), 0);
    itens.forEach((it) => desenharCartao(it, soma));
    desenharLateral();
    desenharResumo();
    aplicarFiltro();
  }

  function desenharResumo() {
    const raiz = estado.resumoBusca?.raiz;
    const itens = estado.itensBusca || [];
    if (!raiz) return;
    const info = estado.info;
    if (!info || info.erro || !info.ligado) return aviso(raiz, info?.erro || "Extensão desligada. Clique no ícone do Monvatti Pro e cole o código do administrador.");
    if (!info.conta.liberado) return aviso(raiz, info.conta.motivo, "erro");
    const soma = itens.reduce((a, i) => a + (i.vendidos || 0), 0);
    const estimadas = itens.reduce((a, i) => a + (estado.busca?.dados?.[i.item_id]?.vendas_estimadas ?? estimar(i.vendidos, i.patamar) ?? 0), 0);
    const fat = itens.reduce((a, i) => a + (i.preco || 0) * (i.vendidos || 0), 0);
    const b = estado.busca || {};
    const visiveis = itens.filter((i) => i.item_id && passaNoFiltro(i)).length;
    raiz.innerHTML = `<div class="painel resumo-busca"><div class="topo"><span class="marca">M</span><b>Resumo da página</b>
        <span class="suave">${itens.length} anúncios</span></div>
      <div class="corpo">
        <div class="resumo-linha">
          <div><span>Vendidos (soma pública)</span><b>${num(soma)}</b></div>
          <div><span>Vendas estimadas</span><b>${num(estimadas)}</b></div>
          <div><span>Faturamento somado</span><b>${brl(fat)}</b></div>
          <div><span>Patrocinados</span><b>${itens.filter((i) => i.patrocinado).length} de ${itens.length}</b></div>
        </div>
        <div class="estudo">
          <div class="estudo-txt">${icone("grade")}<div><b>Estudo em planilha</b>
            <span>${visiveis} anúncio${visiveis === 1 ? "" : "s"}${temFiltro() ? ` · ${esc(descricaoFiltros())}` : " · use os filtros da esquerda para escolher"}. Gera o Excel com produto, preço, venda/dia, venda/mês, comissão, frete e a margem que se calcula quando o cliente preenche o custo.</span></div></div>
          <label class="imposto-estudo" title="Alíquota de imposto que o cliente paga. Vai para todas as linhas da planilha e pode ser trocada lá numa célula só.">Imposto do cliente
            <span><input id="m-imposto-estudo" type="number" min="0" max="100" step="0.01" value="${estado.impostoEstudo ?? estado.imposto}">%</span></label>
          <button id="m-estudo" ${b.carregando || estado.gerandoEstudo || !visiveis ? "disabled" : ""}>${estado.gerandoEstudo ? '<span class="girando"></span>Gerando planilha…' : "Gerar estudo"}</button>
        </div>
        ${estado.estudoMsg ? `<div class="aviso ${estado.estudoMsg.tipo}">${esc(estado.estudoMsg.texto)}</div>` : ""}
        <div class="acoes">
          <button class="sec" id="m-carregar" ${b.carregando ? "disabled" : ""}>${b.carregando ? `<span class="girando"></span>${esc(b.etapa || "Carregando dados…")}` : b.dados ? "Recarregar dados Monvatti Pro" : "Carregar dados Monvatti Pro"}</button>
          <span class="suave">${b.erro ? "" : b.dados ? "Data de criação, ritmo, comissão, frete e vendedor de cada anúncio." : "Lê data de criação, ritmo, comissão, frete e vendedor de cada anúncio (leva alguns segundos)."}</span>
        </div>
        ${b.erro ? `<div class="aviso erro">${esc(b.erro)}</div>` : ""}
      </div></div>`;
    raiz.querySelector("#m-carregar").onclick = () => carregarBusca(location.href);
    raiz.querySelector("#m-estudo").onclick = gerarEstudo;
    raiz.querySelector("#m-imposto-estudo").oninput = (e) => (estado.impostoEstudo = e.target.value === "" ? null : +e.target.value);
  }

  const NOMES_FILTRO = {
    novos: "criados há menos de 180 dias", medios: "criados de 180 a 365 dias", antigos: "criados há mais de 365 dias",
    full: "Full", flex: "Flex", correios: "Correios", coleta: "Coleta", places: "Places", outros: "outras logísticas",
    "1-5": "catálogo com 1 a 5 vendedores", "6-10": "catálogo com 6 a 10 vendedores", "11-30": "catálogo com 11 a 30 vendedores",
    "30+": "catálogo com mais de 30 vendedores", sem_medalha: "sem medalha", lider: "MercadoLíder", gold: "MercadoLíder Gold",
    platinum: "MercadoLíder Platinum", classico: "Clássico", premium: "Premium", oficiais: "lojas oficiais",
    internacional: "internacional", patrocinados: "patrocinados", oferta: "em oferta", gratis: "frete grátis",
    catalogo: "em catálogo", fora: "fora do catálogo", A: "curva A", B: "curva B", C: "curva C",
  };
  const nomeDoFiltro = (f) => (f?.startsWith("vendedor:") ? `vendedor ${f.slice(9)}` : NOMES_FILTRO[f] || f || "");
  const nomeFaixaVendas = () => (estado.vendasMax != null ? `${estado.vendasMin ?? 0} a ${estado.vendasMax} vendas/mês` : `${estado.vendasMin ?? 0}+ vendas/mês`);
  const descricaoFiltros = () => [...(estado.filtros || []).map(nomeDoFiltro),
    ...(estado.vendasMin != null || estado.vendasMax != null ? [nomeFaixaVendas()] : [])].join(" + ");
  const EXPLICA_CURVA = "Curva A: anúncios que juntos fazem 80% do faturamento mensal desta página (os que mais vendem, para cliente grande). "
    + "Curva B: os próximos 15% (cliente médio). Curva C: os últimos 5% (cliente pequeno, menos concorrência).";

  function termoDaBusca() {
    const campo = document.querySelector("input.nav-search-input, input[name='as_word']")?.value?.trim();
    if (campo) return campo;
    const caminho = decodeURIComponent(location.pathname.split("/").filter(Boolean)[0] || "");
    return caminho.replace(/_.*$/, "").replace(/-/g, " ").trim();
  }

  const impostoDoEstudo = () => Math.min(Math.max(estado.impostoEstudo ?? estado.imposto ?? 0, 0), 100);

  async function gerarEstudo() {
    if (estado.gerandoEstudo) return;
    estado.estudoMsg = null;
    if (!estado.busca?.dados) {
      await carregarBusca(location.href);
      if (!estado.busca?.dados) return;
    }
    const dados = estado.busca.dados;
    const nomesLog = { full: "Full", flex: "Flex", correios: "Correios", coleta: "Coleta", places: "Places", outros: "Outros" };
    const linhas = (estado.itensBusca || []).filter((i) => i.item_id && passaNoFiltro(i)).map((i) => {
      const d = dados[i.item_id] || {};
      const tipo = tipoDe(i);
      const tarifa = d.tarifas?.[tipo];
      const link = i.el.querySelector('a[href*="mercadolivre.com.br/"]:not([href*="mclics"])')?.href?.split("#")[0]
        || `https://produto.mercadolivre.com.br/MLB-${i.item_id.slice(3)}`;
      return {
        titulo: i.titulo, link, preco: i.preco, vendas_dia: d.vendas_dia, vendas_mes: d.vendas_mes,
        comissao_pct: tarifa?.pct ?? null, taxa_fixa: tarifa?.taxa_fixa ?? null, frete: d.frete,
        tipo: tipo === "gold_pro" ? "Premium" : "Clássico", logistica: nomesLog[logisticaDe(i)] || "",
        criado_em: d.no_ar_desde ? dataBR(d.no_ar_desde) : "",
      };
    }).sort((a, b) => (b.vendas_mes || 0) - (a.vendas_mes || 0));
    if (!linhas.length) {
      estado.estudoMsg = { tipo: "erro", texto: "Nenhum anúncio visível com o filtro escolhido." };
      return desenharResumo();
    }
    estado.gerandoEstudo = true;
    desenharResumo();
    try {
      const r = await enviar({ tipo: "estudo", pesquisa: termoDaBusca(), filtro: descricaoFiltros(), imposto: impostoDoEstudo(), itens: linhas });
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      await baixarBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), r.nome);
      estado.estudoMsg = { tipo: "ok", texto: `Planilha “${r.nome}” baixada com ${linhas.length} anúncios, do que mais vende para o que menos vende. Abra no Excel ou importe no Google Planilhas e preencha a coluna amarela de custo.` };
    } catch (err) {
      estado.estudoMsg = { tipo: "erro", texto: err.message };
    } finally {
      estado.gerandoEstudo = false;
      desenharResumo();
    }
  }

  function liberarAlturaDaGrade() {
    if (document.getElementById("monvatti-grade")) return;
    const estilo = document.createElement("style");
    estilo.id = "monvatti-grade";
    estilo.textContent = ".ui-search-layout--grid > li.ui-search-layout__item { height: auto !important; }";
    document.head.append(estilo);
  }

  function montarBusca() {
    const itens = lerBusca();
    if (!itens.length) return;
    itens.forEach((it) => {
      const { vendidos, patamar } = lerVendidos(it.vendidos_texto);
      it.vendidos = vendidos;
      it.patamar = patamar;
    });
    if (estado.busca && estado.busca.url !== location.href) estado.busca = null;
    if (estado.urlBusca !== location.href) {
      estado.filtros = [];
      estado.vendasMin = null;
      estado.vendasMax = null;
    }
    estado.urlBusca = location.href;
    estado.itensBusca = itens;
    const lista = document.querySelector("ol.ui-search-layout, .ui-search-layout") || itens[0].el.parentElement;
    const resumo = hospedeiro("monvatti-busca");
    lista.before(resumo.host);
    estado.resumoBusca = resumo;
    const aside = document.querySelector("aside.ui-search-sidebar");
    if (aside) {
      const lateral = hospedeiro("monvatti-lateral");
      (aside.querySelector(".ui-search-search-result") || aside.firstElementChild)?.after(lateral.host);
      estado.lateral = lateral;
    }
    liberarAlturaDaGrade();
    document.querySelectorAll('[id^="monvatti-card-"]').forEach((h) => h.remove());
    itens.forEach((it, n) => {
      const { host, raiz } = hospedeiro(`monvatti-card-${n}-${it.item_id || it.produto_id || "sem-id"}`);
      (it.el.querySelector(".poly-card") || it.el).append(host);
      it.host = host;
      it.raiz = raiz;
    });
    if (!estado.info?.ligado || !estado.info?.conta?.liberado) {
      desenharResumo();
      return;
    }
    desenharTudoBusca();
  }

  function calculadora(conteudo) {
    const d = estado.dados;
    if (!d) {
      conteudo.innerHTML = ehAnuncio()
        ? '<div class="aviso info"><span class="girando"></span>Carregando os dados do anúncio. A calculadora abre sozinha quando chegarem.</div>'
        : '<div class="aviso info">Abra a página de um anúncio. A calculadora usa o preço, a comissão e o frete dele.</div>';
      estado.aoCarregar = () => conteudo.isConnected && calculadora(conteudo);
      return;
    }
    estado.aoCarregar = null;
    const custos = { tarifas: d.tarifas || {}, frete: d.frete };
    const valores = estado.calc || { custo: "", extras: "", pagaFrete: true };
    conteudo.innerHTML = `
      <div class="aviso info"><b>${esc(d.titulo)}</b></div>
      <div class="campos">
        <label>Preço de venda (R$)<input id="c-preco" type="number" step="0.01" min="0" value="${d.preco ?? ""}"></label>
        <label>Imposto (%)<input id="c-imposto" type="number" step="0.01" min="0" max="100" value="${estado.imposto}"></label>
        <label>Custo do produto (R$)<input id="c-custo" type="number" step="0.01" min="0" placeholder="0,00" value="${valores.custo}"></label>
        <label title="Embalagem, etiqueta e outros gastos por unidade">Custos extras (R$)<input id="c-extras" type="number" step="0.01" min="0" placeholder="0,00" value="${valores.extras}"></label>
        <label class="marcar"><input id="c-paga" type="checkbox" ${valores.pagaFrete ? "checked" : ""}> Eu pago o frete (desmarque se o Mercado Livre cobre)</label>
      </div>
      <div id="c-status"></div>
      <div class="bloco"><h4>Margem de contribuição</h4><table id="c-tabela" class="tabela-calc"></table></div>
      <p class="nota">Comissão, taxa fixa e frete vêm do Mercado Livre para o preço informado e são recalculados quando você muda o preço.</p>`;
    const v = (id) => parseFloat(conteudo.querySelector(id).value) || 0;
    const recalcular = () => {
      const preco = v("#c-preco"), custo = v("#c-custo"), extras = v("#c-extras"), imp = v("#c-imposto");
      const pagaFrete = conteudo.querySelector("#c-paga").checked;
      estado.calc = { custo: conteudo.querySelector("#c-custo").value, extras: conteudo.querySelector("#c-extras").value, pagaFrete };
      const frete = pagaFrete ? custos.frete || 0 : 0;
      const colunas = [["gold_special", "Clássico"], ["gold_pro", "Premium"]].filter(([t]) => custos.tarifas[t]).map(([t, nome]) => {
        const tarifa = custos.tarifas[t];
        const imposto = preco * imp / 100;
        const total = tarifa.comissao + tarifa.taxa_fixa + frete + custo + extras + imposto;
        return { nome, tarifa, imposto, total, margem: preco - total, este: nome === d.tipo_anuncio };
      });
      const tabela = conteudo.querySelector("#c-tabela");
      if (!colunas.length) {
        tabela.innerHTML = '<tr><td>O Mercado Livre não devolveu a comissão deste anúncio. Tente recarregar a página.</td></tr>';
        return;
      }
      const rel = (x) => (preco ? `<span class="suave">${pct(x / preco * 100)}</span>` : "");
      const l = (rotulo, f, classe = "") => `<tr class="${classe}"><td>${rotulo}</td>${colunas.map((c) => `<td class="${c.este ? "destaque" : ""}">${f(c)}</td>`).join("")}</tr>`;
      const secao = (rotulo) => `<tr class="secao"><td colspan="${colunas.length + 1}">${rotulo}</td></tr>`;
      const cor = (c) => (c.margem >= 0 ? "positivo" : "negativo");
      tabela.innerHTML = `<colgroup><col class="rotulo">${colunas.map(() => "<col>").join("")}</colgroup><tr><th></th>${colunas.map((c) => `<th class="${c.este ? "destaque" : ""}">${c.nome}${c.este ? '<span class="suave">este anúncio</span>' : ""}</th>`).join("")}</tr>
        ${secao("Mercado Livre")}
        ${l("Comissão", (c) => `${brl(c.tarifa.comissao)}${rel(c.tarifa.comissao)}`)}
        ${l("Taxa fixa", (c) => brl(c.tarifa.taxa_fixa))}
        ${l("Frete", () => (pagaFrete && custos.frete == null ? '<span class="indisp">não calculado</span>' : `${brl(frete)}${rel(frete)}`))}
        ${secao("Seus custos")}
        ${l("Produto", () => `${brl(custo)}${rel(custo)}`)}
        ${l("Extras", () => `${brl(extras)}${rel(extras)}`)}
        ${l("Imposto", (c) => `${brl(c.imposto)}${rel(c.imposto)}`)}
        ${l("Custos totais", (c) => `${brl(c.total)}${rel(c.total)}`, "total")}
        ${secao("Resultado")}
        ${l("Preço de venda", () => brl(preco))}
        ${l("Margem", (c) => `<span class="${cor(c)}">${brl(c.margem)}</span><span class="suave ${cor(c)}">${pct(preco ? c.margem / preco * 100 : null)} do preço</span>`, "total")}
        ${l("ROI sobre o custo", (c) => (custo ? `<span class="${cor(c)}">${pct(c.margem / custo * 100)}</span>` : "—"))}`;
    };
    let espera = null;
    const status = conteudo.querySelector("#c-status");
    conteudo.querySelector("#c-preco").oninput = () => {
      recalcular();
      clearTimeout(espera);
      const preco = v("#c-preco");
      if (!(preco > 0) || !d.categoria_id) return;
      status.innerHTML = '<div class="aviso info"><span class="girando"></span>Recalculando comissão e frete para o novo preço…</div>';
      espera = setTimeout(async () => {
        try {
          const r = await enviar({ tipo: "tarifas", preco, categoria_id: d.categoria_id, tipo_anuncio: d.tipo_id, vendedor_id: (d.vendedor || {}).id || estado.pagina?.vendedor_id || "", item_id: d.item_id });
          if (v("#c-preco") !== preco) return;
          custos.tarifas = r.tarifas || {};
          custos.frete = r.frete;
          status.innerHTML = "";
          recalcular();
        } catch (err) {
          status.innerHTML = `<div class="aviso erro">${esc(err.message)}</div>`;
        }
      }, 700);
    };
    ["#c-imposto", "#c-custo", "#c-extras", "#c-paga"].forEach((id) => {
      const el = conteudo.querySelector(id);
      el[el.type === "checkbox" ? "onchange" : "oninput"] = recalcular;
    });
    recalcular();
  }

  function metricasNaGaveta(conteudo) {
    const painel = document.getElementById("monvatti-painel");
    if (!painel) {
      conteudo.innerHTML = '<div class="aviso info">Abra a página de um anúncio para ver as métricas.</div>';
      return;
    }
    conteudo.innerHTML = '<div class="aviso info">As métricas ficam no painel ao lado do título do anúncio. Levei você até ele.</div>';
    painel.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function abrirGaveta(aba = "calculadora") {
    const { host, raiz } = hospedeiro("monvatti-gaveta");
    document.body.append(host);
    const fechar = () => host.remove();
    raiz.innerHTML = `<div class="fundo-gaveta"></div><aside class="gaveta" role="dialog" aria-label="Monvatti Pro">
      <header><span class="marca">M</span><b>Monvatti Pro</b><button class="sec" id="g-fechar">Fechar</button></header>
      <nav class="abas">
        <button class="aba" data-aba="calculadora">Calculadora de margem</button>
        <button class="aba" data-aba="metricas">Métricas do anúncio</button>
        ${estado.info?.servidor ? `<button class="aba" data-aba="replique">${ehAnuncio() && (estado.info.clientes || []).length ? "Cadastrar no Replique" : "Abrir o Replique"}</button>` : ""}
      </nav>
      <div class="conteudo" id="g-conteudo"></div></aside>`;
    raiz.querySelector(".fundo-gaveta").onclick = fechar;
    raiz.querySelector("#g-fechar").onclick = fechar;
    const conteudo = raiz.querySelector("#g-conteudo");
    const trocar = (nome) => {
      if (nome === "replique" && !(ehAnuncio() && (estado.info.clientes || []).length)) {
        return window.open(estado.info.servidor + "/", "_blank", "noopener");
      }
      raiz.querySelectorAll(".aba").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === nome));
      ({ metricas: metricasNaGaveta, replique: cadastrarNoReplique }[nome] || calculadora)(conteudo);
    };
    raiz.querySelectorAll(".aba").forEach((b) => (b.onclick = () => trocar(b.dataset.aba)));
    trocar(aba);
  }

  function rascunhoCriado(r) {
    const base = estado.info?.servidor || "";
    return `<div class="aviso ok">Rascunho “${esc(r.titulo)}” salvo em Rascunhos › Da extensão${r.pasta_id || r.fotos_depois ? "; as fotos vão para Fotos salvas" : ""}.</div>
      <div class="acoes"><a class="botao" href="${esc(base)}/#/editor/${r.anuncio_id}" target="_blank" rel="noopener">Abrir no editor</a>
        <a class="botao sec" href="${esc(base)}/#/rascunhos/extensao~${r.cliente_id}" target="_blank" rel="noopener">Ver rascunhos</a></div>`;
  }

  async function cadastrarNoReplique(conteudo) {
    const clientes = estado.info.clientes || [];
    const pagina = lerAnuncio();
    const { cliente_copia } = await chrome.storage.local.get({ cliente_copia: "" });
    const lembrado = clientes.find((c) => String(c.id) === String(cliente_copia)) || (clientes.length === 1 ? clientes[0] : null);
    conteudo.innerHTML = `
      <div class="aviso info"><b>${esc(pagina.titulo || "Anúncio")}</b><br>
        O anúncio vira um rascunho em <b>Replique › Rascunhos › Da extensão</b>, para você cadastrar quando quiser (ou excluir se desistir).
        As fotos vão junto para <b>Replique › Fotos salvas</b>.</div>
      <div class="campos"><label>Cliente que recebe o rascunho
        <select id="g-cliente">${clientes.map((c) => `<option value="${c.id}" ${lembrado?.id === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label></div>
      <div class="acoes"><button id="g-cadastrar">Levar para Rascunhos</button><button class="sec" id="g-abrir">Só abrir o Replique</button></div>
      <div id="g-retorno"></div>`;
    const sel = conteudo.querySelector("#g-cliente");
    const botao = conteudo.querySelector("#g-cadastrar");
    const retorno = conteudo.querySelector("#g-retorno");
    sel.onchange = () => chrome.storage.local.set({ cliente_copia: sel.value });
    conteudo.querySelector("#g-abrir").onclick = () => window.open(estado.info.servidor + "/", "_blank", "noopener");
    const cadastrar = async () => {
      botao.disabled = true;
      retorno.innerHTML = '<div class="aviso info"><span class="girando"></span>Copiando o anúncio e salvando as fotos…</div>';
      try {
        await chrome.storage.local.set({ cliente_copia: sel.value });
        const r = await enviar({ tipo: "copiar", cliente_id: +sel.value, pagina });
        estado.copiado = pagina.item_id || location.pathname;
        retorno.innerHTML = rascunhoCriado(r);
      } catch (err) {
        retorno.innerHTML = `<div class="aviso erro">${esc(err.message)}</div>`;
      } finally {
        botao.disabled = false;
      }
    };
    botao.onclick = cadastrar;
    if (estado.copiado === (pagina.item_id || location.pathname)) {
      retorno.innerHTML = '<div class="aviso info">Este anúncio já foi levado para o Replique agora há pouco. Clique em “Levar para Rascunhos” se quiser outro rascunho.</div>';
    } else if (lembrado) {
      cadastrar();
    }
  }

  function nomeArquivo(base) {
    const titulo = (document.querySelector("h1.ui-pdp-title")?.innerText || "anuncio").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    return `${titulo}-${base}`;
  }

  async function baixarBlob(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function playlistDoVideo() {
    const html = document.documentElement.innerHTML.replace(/\\u002F/g, "/");
    return (html.match(/https:\/\/[^"'\s\\]+?\.m3u8/) || [])[0] || "";
  }

  async function baixarVideo(principal, aviso) {
    const absoluta = (base, url) => new URL(url, base).href;
    let lista = await (await fetch(principal)).text();
    let base = principal;
    const variantes = [...lista.matchAll(/#EXT-X-STREAM-INF:[^\n]*BANDWIDTH=(\d+)[^\n]*\n([^\n]+)/g)]
      .map((m) => ({ banda: +m[1], url: absoluta(principal, m[2].trim()) })).sort((a, b) => b.banda - a.banda);
    if (variantes.length) {
      base = variantes[0].url;
      lista = await (await fetch(base)).text();
    }
    const partes = lista.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => absoluta(base, l));
    const blocos = [];
    for (const [n, url] of partes.entries()) {
      aviso(`Baixando vídeo… ${n + 1} de ${partes.length}`);
      blocos.push(await (await fetch(url)).arrayBuffer());
    }
    await baixarBlob(new Blob(blocos, { type: "video/mp2t" }), nomeArquivo("video.ts"));
  }

  function botaoDownload() {
    if (!ehAnuncio()) return;
    const galeria = document.querySelector(".ui-pdp-gallery__wrapper") || document.querySelector(".ui-pdp-gallery");
    if (!galeria) return;
    const posicionar = (h) => {
      const foto = [...galeria.querySelectorAll(".ui-pdp-gallery__figure")].find((f) => f.getBoundingClientRect().width > 150);
      const margem = foto ? foto.getBoundingClientRect().left - galeria.getBoundingClientRect().left : 0;
      const avant = galeria.querySelector(".avantpro-btn");
      h.style.cssText = `position:absolute;top:${avant ? 8 : 12}px;left:${Math.round(margem) + (avant ? 52 : 12)}px;z-index:20;`;
    };
    const existente = galeria.querySelector("#monvatti-download");
    if (existente) return posicionar(existente);
    const { host, raiz } = hospedeiro("monvatti-download");
    posicionar(host);
    if (getComputedStyle(galeria).position === "static") galeria.style.position = "relative";
    galeria.append(host);
    const fotos = lerAnuncio().fotos;
    const video = playlistDoVideo();
    raiz.innerHTML = `<div class="baixar">
      <button class="baixar-btn" title="Baixar fotos e vídeo do anúncio" aria-label="Baixar fotos e vídeo do anúncio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
      </button>
      <div class="baixar-menu" hidden>
        <button data-acao="atual">Baixar a foto aberta</button>
        <button data-acao="fotos" ${fotos.length ? "" : "disabled"}>Baixar todas as fotos (${fotos.length})</button>
        <button data-acao="video" ${video ? "" : "disabled"}>${video ? "Baixar o vídeo" : "Anúncio sem vídeo"}</button>
        ${estado.info?.ligado ? `<button data-acao="replique" ${fotos.length ? "" : "disabled"}>Salvar fotos no Replique</button>` : ""}
        <p class="baixar-status" hidden></p>
      </div>
    </div>`;
    const menu = raiz.querySelector(".baixar-menu");
    const status = raiz.querySelector(".baixar-status");
    const avisar = (t) => { status.hidden = !t; status.textContent = t || ""; };
    raiz.querySelector(".baixar-btn").onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      menu.hidden = !menu.hidden;
      avisar("");
    };
    document.addEventListener("click", (e) => { if (!host.contains(e.target)) menu.hidden = true; });
    const fotoAtual = () => {
      const img = document.querySelector(".ui-pdp-gallery__figure img:not([aria-hidden='true']), .ui-pdp-gallery img");
      const u = img?.getAttribute("data-zoom") || img?.currentSrc || img?.src || "";
      const m = u.match(/D_(?:[A-Z0-9]+_)*?(\d+-ML[A-Z]\d+_\d+)-[A-Z]\.(?:jpg|jpeg|webp|png)/);
      return m ? `https://http2.mlstatic.com/D_NQ_NP_2X_${m[1]}-F.jpg` : fotos[0];
    };
    raiz.querySelectorAll("[data-acao]").forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const acao = b.dataset.acao;
      raiz.querySelectorAll("[data-acao]").forEach((x) => (x.disabled = true));
      try {
        if (acao === "replique") {
          avisar("Salvando as fotos no Replique…");
          const r = await enviar({ tipo: "salvarFotos", pagina: lerAnuncio() });
          avisar(r.novas ? `${r.novas} foto(s) salva(s) na pasta do anúncio (${r.total} no total). Veja em Replique › Fotos salvas.`
            : `As fotos já estavam salvas (${r.total} na pasta). Veja em Replique › Fotos salvas.`);
          return;
        }
        if (acao === "video") {
          await baixarVideo(video, avisar);
        } else {
          const lista = acao === "atual" ? [fotoAtual()].filter(Boolean) : fotos;
          for (const [n, url] of lista.entries()) {
            avisar(`Baixando foto ${n + 1} de ${lista.length}…`);
            const blob = await (await fetch(url)).blob();
            await baixarBlob(blob, nomeArquivo(`foto-${String(n + 1).padStart(2, "0")}.jpg`));
            await new Promise((ok) => setTimeout(ok, 350));
          }
        }
        avisar(acao === "video" ? "Vídeo baixado (.ts, abre no player do Windows ou VLC)." : "Pronto. Veja a pasta de downloads.");
      } catch (err) {
        avisar("Não consegui baixar: " + err.message);
      } finally {
        raiz.querySelectorAll("[data-acao]").forEach((x) => (x.disabled = x.dataset.acao === "video" ? !video : ["fotos", "replique"].includes(x.dataset.acao) ? !fotos.length : false));
      }
    }));
  }

  function botaoFlutuante() {
    const { host, raiz } = hospedeiro("monvatti-fab");
    document.body.append(host);
    raiz.innerHTML = '<button class="fab" title="Monvatti Pro" aria-label="Abrir o Monvatti Pro">M</button>';
    raiz.querySelector(".fab").onclick = () => abrirGaveta("calculadora");
  }

  async function iniciar() {
    try {
      if ((await enviar({ tipo: "conferirVersao" })).recarregar) {
        setTimeout(() => location.reload(), 1500);
        return;
      }
    } catch {}
    try {
      estado.info = await enviar({ tipo: "estado" });
      estado.imposto = estado.info.imposto ?? 7;
    } catch (err) {
      estado.info = { erro: err.message };
    }
    estado.painel = null;
    estado.dados = null;
    estado.calc = null;
    botaoFlutuante();
    garantirPainel();
    botaoDownload();
    if (!ehAnuncio() && ehBusca()) montarBusca();
  }

  let ultimaUrl = location.href;
  setInterval(() => {
    if (location.href !== ultimaUrl) {
      ultimaUrl = location.href;
      setTimeout(iniciar, 1200);
      return;
    }
    garantirPainel();
    botaoDownload();
    if (estado.info && !ehAnuncio() && ehBusca() && (!document.getElementById("monvatti-busca")
        || (estado.itensBusca || []).some((i) => !i.el.isConnected || (i.host && !i.host.isConnected)))) montarBusca();
  }, 1000);
  iniciar();
})();
