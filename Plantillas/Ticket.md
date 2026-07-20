<%*

const titulo = await tp.system.prompt("Título");

const tipo = await tp.system.suggester(
  ["Incidencia", "Requerimiento"],
  ["Incidencia", "Requerimiento"]
);

const prioridad = await tp.system.suggester(
  ["Alta", "Media", "Baja"],
  ["Alta", "Media", "Baja"]
);

const usuario = await tp.system.prompt("Usuario");
const sistema = await tp.system.prompt("Sistema");
const link = await tp.system.prompt("Link (opcional)", "");

const boardPath = "Mesa de ayuda.md";
const board = app.vault.getAbstractFileByPath(boardPath);
if (board) {
  let boardContent = await app.vault.read(board);
  const heading = "## Nuevo";
  const cardLine = "- [[" + tp.file.title + "]]";
  if (boardContent.includes(heading)) {
    boardContent = boardContent.replace(heading, heading + "\n" + cardLine);
    await app.vault.modify(board, boardContent);
  }
}

-%>
---
titulo: <% titulo %>
Link: <% link %>
tipo: <% tipo %>
estado: Nuevo
prioridad: <% prioridad %>
fecha: <% tp.date.now("YYYY-MM-DD") %>
usuario: <% usuario %>
sistema: <% sistema %>
responsable: Alexis Talla
---

# ❗ Problema

---



---
# 💡 Solución

---


---
# 📎 Evidencias

---


---
# 🔄 Historial

-
