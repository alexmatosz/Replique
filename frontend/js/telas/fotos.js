"use strict";

async function telaFotos(param) {
  if (param) return telaPastaFotos(+param);
  const pastas = await api("/api/fotos-salvas");
  $("#tela").innerHTML = `<div class="topo"><div><h1>Fotos salvas</h1>
    <div class="suave">Pastas com as fotos guardadas pela extensão <b>Monvatti Pro</b>, uma por anúncio do Mercado Livre. São cópias no Monvatti Radar:
      continuam aqui mesmo se o anúncio original sair do ar. Use fotos de concorrente só como referência; publique com fotos próprias.</div></div></div>
    ${pastas.length ? `<input id="fs-busca" type="search" placeholder="Buscar pelo título, código MLB ou cliente" style="max-width:420px;margin-bottom:14px">
      <div class="pastas-fotos" id="fs-lista"></div>` : `<section class="cartao"><div class="vazio">${ic("imagem")}<b>Nenhuma pasta ainda</b>
      <span>No anúncio do Mercado Livre, use o botão de download da extensão e escolha <b>Salvar fotos no Replique</b>,
        ou leve o anúncio para o Monvatti Radar: as fotos dele vêm junto para cá.</span></div></section>`}`;
  if (!pastas.length) return;
  const desenhar = () => {
    const busca = $("#fs-busca").value.trim().toLowerCase();
    const filtradas = pastas.filter((p) => !busca || [p.titulo, p.item_id, p.cliente_nome].join(" ").toLowerCase().includes(busca));
    $("#fs-lista").innerHTML = filtradas.length ? filtradas.map((p) => `<a class="pasta-foto" href="#/fotos/${p.id}">
        <span class="pasta-capa">${p.fotos[0] && urlSegura(p.fotos[0]) ? `<img src="${h(p.fotos[0])}" alt="" loading="lazy">` : ic("imagem")}</span>
        <span class="pasta-info"><b title="${h(p.titulo)}">${h(p.titulo)}</b>
          <span class="pequeno suave">${p.quantidade} foto(s)${p.cliente_nome ? ` · ${h(p.cliente_nome)}` : ""}</span>
          <span class="pequeno suave">${h(p.salvo_por || "—")} · ${quando(p.atualizado_em).toLocaleDateString("pt-BR")}</span></span></a>`).join("")
      : '<p class="suave">Nenhuma pasta com esse termo.</p>';
  };
  $("#fs-busca").oninput = desenhar;
  desenhar();
}

async function telaPastaFotos(id) {
  const p = await api(`/api/fotos-salvas/${id}`);
  const podeExcluir = ["admin", "operador"].includes(estado.usuario.papel);
  $("#tela").innerHTML = `<div class="topo"><div><a href="#/fotos" class="pequeno">${ic("voltar", "p")}Fotos salvas</a>
      <h1 style="margin-top:6px">${h(p.titulo)}</h1>
      <div class="suave">${p.quantidade} foto(s)${p.item_id ? ` · ${h(p.item_id)}` : ""}${p.cliente_nome ? ` · ${h(p.cliente_nome)}` : ""}
        · salvas por ${h(p.salvo_por || "—")} em ${quando(p.atualizado_em).toLocaleString("pt-BR")}</div></div>
    <div class="linha">
      ${p.link && urlSegura(p.link) ? `<a class="botao sec" href="${h(p.link)}" target="_blank" rel="noopener noreferrer">${ic("externo", "p")}Anúncio original</a>` : ""}
      <button class="sec" id="fs-zip">${ic("abaixo", "p")}Baixar todas (.zip)</button>
      ${podeExcluir ? `<button class="sec perigo-txt" id="fs-excluir">${ic("lixo", "p")}Excluir pasta</button>` : ""}
    </div></div>
    <section class="cartao"><div class="galeria-fotos">${p.fotos.map((f, n) => urlSegura(f) ? `<figure>
      <a href="${h(f)}" target="_blank" rel="noopener"><img src="${h(f)}" alt="Foto ${n + 1}" loading="lazy"></a>
      <figcaption><span>Foto ${n + 1}</span><a href="${h(f)}" download="foto-${String(n + 1).padStart(2, "0")}">${ic("abaixo", "p")}Baixar</a></figcaption>
    </figure>` : "").join("")}</div></section>`;
  $("#fs-zip").onclick = async (e) => {
    e.currentTarget.disabled = true;
    try { await baixarArquivo(`/api/fotos-salvas/${id}/fotos.zip`, "fotos.zip"); } catch (err) { toast(err.message, true); }
    e.currentTarget.disabled = false;
  };
  const excluir = $("#fs-excluir");
  if (excluir) excluir.onclick = async () => {
    if (!confirm(`Excluir a pasta “${p.titulo}” e as ${p.quantidade} foto(s) dela? Os rascunhos não mudam.`)) return;
    try {
      await api(`/api/fotos-salvas/${id}`, { method: "DELETE" });
      toast("Pasta excluída.");
      location.hash = "#/fotos";
    } catch (err) { toast(err.message, true); }
  };
}
