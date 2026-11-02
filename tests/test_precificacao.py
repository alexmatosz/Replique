"""Calculadora de margem do editor: tarifa e frete do ML, imposto do Financeiro."""

from backend.marketplaces.mercadolivre import _embalagem
from backend.banco.models import Anuncio, ConfigFinanceira
from backend.services import frete_ml, margem
from backend.services import novidades as servico_novidades


class _ML:
    demo = False

    def tarifa_venda(self, preco, tipo, categoria):
        pct = 11.5 if tipo == "gold_special" else 16.5
        fixa = 6.25 if preco < 79 else 0.0
        return {"sale_fee_amount": round(preco * pct / 100 + fixa, 2),
                "sale_fee_details": {"percentage_fee": pct, "fixed_fee": fixa}}

    def custo_frete_gratis(self, preco, dims, tipo, condicao="new"):
        return 30.0

    def medidas_da_categoria(self, categoria):
        return "10x20x30,2000"


class _Banco:
    def __init__(self, cfg=None):
        self.cfg = cfg

    def get(self, modelo, chave):
        return self.cfg if modelo is ConfigFinanceira else None


def _anuncio(**kw):
    return Anuncio(cliente_id=1, preco=0, por_plataforma={"mercadolivre": {"category_id": "MLB1"}},
                   dimensoes_cm={}, condicao="new", **kw)


def _com_ml(monkeypatch):
    margem._CACHE_ML.clear()
    monkeypatch.setattr(margem, "obter_adaptador", lambda *a, **k: (_ML(), ""))


def test_tarifa_frete_imposto_e_precos_por_margem(monkeypatch):
    _com_ml(monkeypatch)
    cfg = ConfigFinanceira(regime="simples", aliquota_simples_pct=8.0, embalagem_padrao=2.0)
    r = margem.precificar(_Banco(cfg), _anuncio(), preco=200, custo=100)
    x = r["atual"]
    assert (x["tarifa_pct"], x["tarifa"], x["frete"], x["imposto"], x["embalagem"]) == (11.5, 23.0, 30.0, 16.0, 2.0)
    assert x["lucro"] == 29.0 and x["margem_pct"] == 14.5 and x["recebe"] == 147.0
    assert "medidas típicas da categoria" in x["fonte_frete"]
    assert r["imposto_pct"] == 8.0 and "Simples Nacional" in r["fonte_imposto"]
    assert r["tarifas_pct"] == {"gold_special": 11.5, "gold_pro": 16.5}
    assert [a["margem"] for a in r["alvos"]] == [5, 10, 15, 20, 25, 30]
    for a in r["alvos"]:
        conferido = margem.precificar(_Banco(cfg), _anuncio(), preco=a["preco"], custo=100)["atual"]
        assert abs(conferido["margem_pct"] - a["margem"]) < 0.05


def test_abaixo_de_79_o_vendedor_paga_o_frete_da_tabela(monkeypatch):
    _com_ml(monkeypatch)
    r = margem.precificar(_Banco(), _anuncio(), preco=200, custo=20, imposto_pct=6)
    baixo = r["alvos"][0]["preco"]
    assert baixo < 79
    x = margem.precificar(_Banco(), _anuncio(), preco=baixo, custo=20, imposto_pct=6)["atual"]
    esperado = 8.75 if baixo >= 49 else 7.45
    assert x["taxa_fixa"] == 6.25 and x["frete"] == esperado and abs(x["margem_pct"] - 5) < 0.05
    assert "tabela do ML" in x["fonte_frete"] and "2,0 kg" in x["fonte_frete"]


def test_tabela_de_frete_por_peso_preco_e_reputacao():
    assert frete_ml.custo(60, "10x10x10,300") == (8.15, 0.3)
    assert frete_ml.custo(60, "10x10x10,301") == (8.25, 0.301)
    assert frete_ml.custo(150, "60x50x40,1000") == (82.75, 20.0)
    assert frete_ml.custo(250, "10x10x10,200000", "laranja") == (525.70, 200.0)
    assert frete_ml.custo(10, "10x10x10,300") == (5.0, 0.3)
    assert frete_ml.custo(100, "10x10x10,1000", frete_ml.tabela_da_reputacao("3_yellow")) == (20.22, 1.0)
    assert frete_ml.tabela_da_reputacao(None) == "verde" and frete_ml.tabela_da_reputacao("1_red") == "laranja"
    assert frete_ml.custo(100, "sem medidas") is None
    for tabela in frete_ml.TABELAS.values():
        assert len(tabela) == len(frete_ml.LIMITES_PESO_KG) + 1
        assert all(len(linha) == len(frete_ml.INICIO_FAIXA_PRECO) for linha in tabela)


def test_frete_da_conta_diferente_da_tabela_vira_novidade(client, sessao):
    from backend.banco.db import SessionLocal
    from backend.banco.models import Novidade
    novidades = client.get("/api/novidades", headers=sessao).json()
    assert any(n["tema"] == "frete" and n["fonte"] == "oficial" for n in novidades)
    with SessionLocal() as db:
        servico_novidades.frete_diferente_da_tabela(db, 31.0, 30.0)
        servico_novidades.frete_diferente_da_tabela(db, 45.0, 30.0)
        servico_novidades.frete_diferente_da_tabela(db, 50.0, 30.0)
        percebidas = db.query(Novidade).filter(Novidade.fonte == "percebido").all()
    assert len(percebidas) == 1 and "mais alto" in percebidas[0].titulo and "R$ 45,00" in percebidas[0].texto


def test_premium_porcentagem_digitada_e_frete(monkeypatch):
    _com_ml(monkeypatch)
    assert margem.precificar(_Banco(), _anuncio(), preco=200, custo=100, tipo="gold_pro")["atual"]["tarifa_pct"] == 16.5
    x = margem.precificar(_Banco(), _anuncio(), preco=200, custo=100, tipo="custom", comissao_pct=14)["atual"]
    assert x["tarifa"] == 28.0 and x["fonte_tarifa"] == "porcentagem digitada"
    assert margem.precificar(_Banco(), _anuncio(), preco=200, custo=100, incluir_frete=False)["atual"]["frete"] == 0
    x = margem.precificar(_Banco(), _anuncio(), preco=200, custo=100, frete_manual=12.5)["atual"]
    assert x["frete"] == 12.5 and x["fonte_frete"] == "digitado por vocês"


def test_lucro_presumido_usa_media_dos_estados():
    cfg = ConfigFinanceira(regime="presumido", uf_origem="SP", aliquotas_uf={}, cobrar_difal=True,
                           icms_excluido_pis_cofins=True, importado=False, credito_custo_pct=0.0)
    pct, fonte = margem.imposto_do_cliente(_Banco(cfg), _anuncio())
    assert 10 < pct < 30 and "Lucro Presumido" in fonte


def test_peso_e_medidas_do_catalogo():
    d = _embalagem({"WEIGHT": "7.9 kg", "LENGTH": "30 cm", "WIDTH": "59 cm", "HEIGHT": "170 mm"})
    assert d == {"peso_kg": 7.9, "dimensoes_cm": {"comprimento": 30.0, "largura": 59.0, "altura": 17.0}}
    assert _embalagem({"WEIGHT": "500 g"}) == {"peso_kg": 0.5}


def test_rota_da_precificacao(client, sessao):
    a = client.post("/api/anuncios", headers=sessao, json={"titulo": "Bomba", "preco": 100}).json()
    r = client.post(f"/api/anuncios/{a['id']}/precificacao", headers=sessao,
                    json={"preco": 100, "custo": 40, "tipo": "gold_pro", "incluir_frete": False})
    assert r.status_code == 200, r.text
    assert r.json()["atual"]["lucro"] is not None and len(r.json()["alvos"]) == 6 and r.json()["tipo"] == "gold_pro"


class _MLNovidades:
    demo = False

    def __init__(self):
        self.pct = {"gold_special": 11.5, "gold_pro": 16.5}

    def tarifa_venda(self, preco, tipo, categoria):
        return {"sale_fee_amount": preco * self.pct[tipo] / 100, "sale_fee_details": {"percentage_fee": self.pct[tipo]}}

    def custo_frete_gratis(self, preco, dims, tipo, condicao="new"):
        return 30.0

    def reputacao(self):
        return {"reputacao": {"level_id": "5_green"}}


def test_verificacao_de_novidades_percebe_campanha_tarifa_e_frete(client, sessao):
    from backend.banco.db import SessionLocal
    from backend.banco.models import Novidade
    client.post("/api/anuncios", headers=sessao, json={"titulo": "Furadeira", "preco": 100,
                                                       "por_plataforma": {"mercadolivre": {"category_id": "MLB9999"}}})
    campanha = {"id": "MLB-1111", "tipo": "DEAL", "tipo_nome": "Campanha tradicional", "nome": "11.11",
                "inicio": "2026-11-10T00:00:00", "fim": "2026-11-12T00:00:00", "prazo": "2026-11-05T00:00:00"}
    proprio = {"id": "MLB-P1", "tipo": "SELLER_CAMPAIGN", "nome": "Minha campanha"}
    ml = _MLNovidades()
    with SessionLocal() as db:
        db.query(Novidade).filter(Novidade.chave.like("ml-frete-difere-tabela-%")).delete(synchronize_session=False)
        db.commit()
        assert servico_novidades.campanhas_novas(db, [campanha, proprio]) == 1
        assert servico_novidades.campanhas_novas(db, [campanha]) == 0
        n = db.query(Novidade).filter(Novidade.chave == "ml-campanha-MLB-1111").one()
        assert n.tema == "promocao" and "11.11" in n.titulo and "05/11/2026" in n.texto
        assert servico_novidades.tarifas_mudaram(db, ml) == 0
        ml.pct["gold_pro"] = 17.0
        assert servico_novidades.tarifas_mudaram(db, ml) >= 1
        assert servico_novidades.tarifas_mudaram(db, ml) == 0
        t = db.query(Novidade).filter(Novidade.tema == "tarifa", Novidade.titulo.contains("MLB9999")).one()
        assert "16,5% para 17%" in t.titulo and "subiu" in t.titulo
        assert servico_novidades.conferir_frete(db, ml) == 1
        assert servico_novidades.conferir_frete(db, ml) == 0


def test_botao_verificar_novidades(client, sessao):
    r = client.post("/api/novidades/verificar", headers=sessao)
    assert r.status_code == 200 and set(r.json()["por_tipo"]) == {"campanhas", "tarifas", "frete"}
