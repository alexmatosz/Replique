// Aplica o tema salvo antes de desenhar a página (evita piscar claro → escuro).
try { const t = localStorage.getItem("rpq_tema"); if (t) document.documentElement.dataset.theme = t; } catch { /* sem armazenamento */ }
