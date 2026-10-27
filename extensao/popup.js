const $ = (s) => document.querySelector(s);

function enviar(msg) {
  return new Promise((ok, falha) => chrome.runtime.sendMessage(msg, (r) => (r?.ok ? ok(r.dados) : falha(new Error(r?.erro || "Falha na extensão.")))));
}

function aviso(texto, tipo = "") {
  const m = $("#msg");
  m.hidden = !texto;
  m.textContent = texto || "";
  m.className = "caixa " + tipo;
}

function nomeNavegador() {
  const ua = navigator.userAgent;
  const versao = (ua.match(/Chrome\/(\d+)/) || [])[1] || "";
  const sistema = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "outro sistema";
  return `Chrome ${versao} · ${sistema}`;
}

async function desenhar() {
  aviso("");
  let e;
  try {
    e = await enviar({ tipo: "estado" });
  } catch (err) {
    e = { ligado: false };
    aviso(err.message, "erro");
  }
  $("#desligada").hidden = e.ligado;
  $("#ligada").hidden = !e.ligado;
  if (!e.ligado) {
    const { servidor } = await chrome.storage.local.get({ servidor: "" });
    $("#servidor").value = servidor;
    return;
  }
  $("#quem").textContent = `Ligada para ${e.nome}.`;
  $("#conta").className = "caixa " + (e.conta.liberado ? "ok" : "erro");
  $("#conta").textContent = e.conta.liberado
    ? (e.conta.conta === "deslogado" ? "Mercado Livre deslogado: estudo liberado." : `Conta de estudo: ${e.conta.conta}.`)
    : e.conta.motivo;
  $("#imposto").value = e.imposto;
}

$("#ligar").onclick = async () => {
  const servidor = $("#servidor").value.trim().replace(/\/+$/, "");
  const codigo = $("#codigo").value.trim();
  if (!/^https?:\/\/[^/]+$/.test(servidor)) return aviso("Informe o endereço do Replique, por exemplo https://replique.seudominio.com.br", "erro");
  if (!codigo) return aviso("Cole o código gerado pelo administrador.", "erro");
  const destino = new URL(servidor);
  const permitido = await chrome.permissions.request({ origins: [`${destino.protocol}//${destino.hostname}/*`] });
  if (!permitido) return aviso("Sem a permissão a extensão não fala com o Replique.", "erro");
  try {
    await enviar({ tipo: "parear", servidor, codigo, navegador: nomeNavegador() });
    await desenhar();
    aviso("Extensão ligada. Abra um anúncio no Mercado Livre.", "ok");
  } catch (err) {
    aviso(err.message, "erro");
  }
};

$("#salvar-imposto").onclick = async () => {
  const valor = Math.min(Math.max(parseFloat($("#imposto").value) || 0, 0), 100);
  await enviar({ tipo: "imposto", valor });
  aviso("Imposto salvo. Recarregue a página do anúncio.", "ok");
};

$("#desligar").onclick = async () => {
  await enviar({ tipo: "desligar" });
  await desenhar();
};

desenhar();
