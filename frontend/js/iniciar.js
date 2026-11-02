"use strict";

const rotas = {
  entrar: telaEntrar, inicio: telaInicio, pedidos: telaPedidos, acompanhamento: telaAcompanhamento, duvidas: telaDuvidas, painel: telaPainel, pesquisar: telaPesquisar, rascunhos: telaRascunhos, editor: telaEditor,
  full: telaFull, contas: telaContas, clientes: telaClientes, config: telaConfig,
  saude: telaSaude, perguntas: telaPerguntas, radar: telaRadar, monitor: telaMonitor, concorrentes: telaConcorrentes, novidades: telaNovidades, anuncios: telaMeusAnuncios, clonador: telaClonador, fotos: telaFotos, promocoes: telaPromocoes, vendas: telaGestaoVendas, lucratividade: telaLucratividade, dre: telaDre, lucro: telaLucro, produtos: telaProdutos, despesas: telaDespesas, impostos: telaImpostos, analise: telaAnalise,
};

roteador();
