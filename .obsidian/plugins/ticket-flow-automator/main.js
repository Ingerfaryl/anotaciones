const { Plugin, SuggestModal, Notice } = require("obsidian");

// Ajusta esta lista con tus desarrolladores/analistas
const DELEGADOS = [
  "Antonio Oviedo",
  "Angelica Cahuana",
  "Alexander Lurita",
  "Alex Huaman",
  "Elmer Ramirez",
  "Lucas Atuncar",
  "Irene Suarez",
  "Yorghet Hernandez"
];

// Columnas a las que se puede reabrir un ticket archivado
const LANES_REAPERTURA = ["En Proceso", "En espera de respuesta", "Escalado"];

class DelegadoModal extends SuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("¿A quién se delega este ticket?");
  }
  getSuggestions(query) {
    const q = query.toLowerCase();
    return DELEGADOS.filter((d) => d.toLowerCase().includes(q));
  }
  renderSuggestion(value, el) {
    el.createEl("div", { text: value });
  }
  onChooseSuggestion(value) {
    this.onChoose(value);
  }
}

class LaneModal extends SuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("¿A qué columna reabrir el ticket?");
  }
  getSuggestions(query) {
    const q = query.toLowerCase();
    return LANES_REAPERTURA.filter((d) => d.toLowerCase().includes(q));
  }
  renderSuggestion(value, el) {
    el.createEl("div", { text: value });
  }
  onChooseSuggestion(value) {
    this.onChoose(value);
  }
}

module.exports = class TicketFlowAutomator extends Plugin {
  async onload() {
    // Carpeta donde viven tus notas de ticket. Ajusta si tu ruta es distinta.
    this.ticketFolder = "Tickets";

    // Ruta del archivo del tablero Kanban. Ajusta si el nombre/ruta cambia.
    this.boardPath = "Mesa de ayuda.md";

    // Estados que se consideran "terminados" para efectos de archivado
    this.finalStates = ["Finalizado", "Cancelado"];

    // Días que una card permanece visible en el kanban tras finalizar
    this.archiveDays = 3;

    this.lastEstado = new Map();
    this.recentTransitions = new Map(); // path -> { key, time }

    this.app.workspace.onLayoutReady(async () => {
      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => f.path.startsWith(this.ticketFolder + "/"));
      for (const f of files) {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        if (fm && fm.estado) {
          this.lastEstado.set(f.path, fm.estado);
        }
      }

      // Backfill: tickets que ya estaban en un estado final ANTES de instalar
      // esta versión del plugin nunca disparan un "cambio" de estado, así que
      // nunca reciben fechaFinalizado por handleChange. Se la asignamos aquí
      // una sola vez (a partir de ahora empiezan a contar sus 3 días).
      await this.backfillFechaFinalizado(files);

      // Corre el archivado apenas carga el vault, y luego cada hora
      this.archiveOldTickets();
    });

    this.registerInterval(
      window.setInterval(() => this.archiveOldTickets(), 60 * 60 * 1000)
    );

    this.registerEvent(
      this.app.metadataCache.on("changed", (file, data, cache) => {
        this.handleChange(file, cache);
      })
    );

    this.addCommand({
      id: "reabrir-ticket",
      name: "Reabrir ticket (mover de Archive a una columna)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !file.path.startsWith(this.ticketFolder + "/")) return false;
        if (checking) return true;
        this.reabrirTicket(file);
        return true;
      },
    });
  }

  handleChange(file, cache) {
    if (!file.path.startsWith(this.ticketFolder + "/")) return;
    const fm = cache?.frontmatter;
    if (!fm || !fm.estado) return;

    const prev = this.lastEstado.get(file.path);
    const current = fm.estado;

    // Primera vez que vemos este archivo: solo guardamos el estado, no logueamos nada.
    if (prev === undefined) {
      this.lastEstado.set(file.path, current);
      return;
    }

    if (prev !== current) {
      const transitionKey = prev + "→" + current;
      const recent = this.recentTransitions.get(file.path);
      const now = Date.now();
      if (recent && recent.key === transitionKey && now - recent.time < 3000) {
        // Escritura duplicada del mismo movimiento (bug conocido de Kanban Status Updater): se ignora.
        this.lastEstado.set(file.path, current);
        return;
      }
      this.recentTransitions.set(file.path, { key: transitionKey, time: now });

      this.lastEstado.set(file.path, current);
      this.logHistorial(file, prev, current);

      if (current === "Escalado" && !fm.delegado) {
        const modal = new DelegadoModal(this.app, async (choice) => {
          await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            frontmatter.delegado = choice;
          });
          new Notice("Ticket delegado a: " + choice);
        });
        modal.open();
      }

      // Entra a un estado final: registra la fecha para el conteo de los 3 días
      if (this.finalStates.includes(current) && !fm.fechaFinalizado) {
        this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          frontmatter.fechaFinalizado = new Date().toISOString();
        });
      }

      // Sale de un estado final (reabierto manualmente arrastrando la card):
      // limpia la marca de fecha para que no se vuelva a archivar de inmediato.
      if (this.finalStates.includes(prev) && !this.finalStates.includes(current) && fm.fechaFinalizado) {
        this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          delete frontmatter.fechaFinalizado;
        });
      }
    }
  }

  async logHistorial(file, prev, current) {
    const now = new Date();
    const fecha = now.toLocaleDateString("es-PE");
    const hora = now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
    const line = `${prev} → ${current} (${fecha}, ${hora})`;

    let content = await this.app.vault.read(file);
    // Quita el guion "-" vacío de plantilla si es lo único que hay al final
    content = content.replace(/\n-\s*$/, "\n");
    content = content.trimEnd() + "\n- " + line + "\n";
    await this.app.vault.modify(file, content);
  }

  // Asigna fechaFinalizado a tickets antiguos que ya estaban en estado final
  // (Finalizado/Cancelado) desde antes de tener esta lógica, para que no
  // queden ignorados por el archivado automático para siempre.
  async backfillFechaFinalizado(files) {
    for (const f of files) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm || !this.finalStates.includes(fm.estado)) continue;
      if (fm.fechaFinalizado) continue;

      await this.app.fileManager.processFrontMatter(f, (frontmatter) => {
        frontmatter.fechaFinalizado = new Date().toISOString();
      });
    }
  }

  // ---- Archivado automático de tickets finalizados/cancelados ----

  async archiveOldTickets() {
    const boardFile = this.app.vault.getAbstractFileByPath(this.boardPath);
    if (!boardFile) return;

    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(this.ticketFolder + "/"));

    const now = Date.now();
    const toArchive = [];

    for (const f of files) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm || !this.finalStates.includes(fm.estado)) continue;
      if (!fm.fechaFinalizado) continue;

      const finishedAt = new Date(fm.fechaFinalizado).getTime();
      if (isNaN(finishedAt)) continue;

      const days = (now - finishedAt) / (1000 * 60 * 60 * 24);
      if (days >= this.archiveDays) {
        toArchive.push(f);
      }
    }

    if (toArchive.length === 0) return;

    let boardContent = await this.app.vault.read(boardFile);

    let archivedCount = 0;
    for (const f of toArchive) {
      const updated = this.moveCardToArchive(boardContent, f.basename);
      if (updated !== boardContent) archivedCount++;
      boardContent = updated;
    }

    if (archivedCount > 0) {
      await this.app.vault.modify(boardFile, boardContent);
      new Notice(`${archivedCount} ticket(s) archivado(s) del Kanban`);
    }
  }

  // Busca la línea de la card (por su nombre de archivo, con o sin alias) en
  // cualquier columna activa del tablero y la mueve a la sección "## Archive".
  moveCardToArchive(boardContent, basename) {
    const cardLineRegex = this.buildCardLineRegex(basename);
    const match = boardContent.match(cardLineRegex);
    if (!match) return boardContent; // no está visible en el board, nada que hacer

    const cardLine = match[0];

    boardContent = boardContent.replace(cardLineRegex, "").replace(/\n{3,}/g, "\n\n");

    if (/^##\s+Archive\s*$/m.test(boardContent)) {
      boardContent = boardContent.replace(
        /^##\s+Archive\s*$/m,
        (heading) => `${heading}\n\n${cardLine}`
      );
    } else {
      boardContent = boardContent.trimEnd() + "\n\n***\n\n## Archive\n\n" + cardLine + "\n";
    }

    return boardContent;
  }

  // ---- Reapertura manual de un ticket archivado ----

  async reabrirTicket(file) {
    const modal = new LaneModal(this.app, async (destino) => {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.estado = destino;
        delete fm.fechaFinalizado;
      });

      const boardFile = this.app.vault.getAbstractFileByPath(this.boardPath);
      if (boardFile) {
        let boardContent = await this.app.vault.read(boardFile);
        boardContent = this.moveCardFromArchiveToLane(boardContent, file.basename, destino);
        await this.app.vault.modify(boardFile, boardContent);
      }

      new Notice(`Ticket reabierto en: ${destino}`);
    });
    modal.open();
  }

  moveCardFromArchiveToLane(boardContent, basename, laneName) {
    const cardLineRegex = this.buildCardLineRegex(basename);
    const match = boardContent.match(cardLineRegex);
    if (!match) return boardContent; // no está archivado, nada que mover

    const cardLine = match[0];
    boardContent = boardContent.replace(cardLineRegex, "").replace(/\n{3,}/g, "\n\n");

    const laneEscaped = laneName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const laneHeadingRegex = new RegExp(`^##\\s+${laneEscaped}\\s*$`, "m");

    if (laneHeadingRegex.test(boardContent)) {
      boardContent = boardContent.replace(
        laneHeadingRegex,
        (heading) => `${heading}\n\n${cardLine}`
      );
    } else {
      // Columna no encontrada (raro): la crea justo antes del Archive
      boardContent = boardContent.replace(
        /^##\s+Archive/m,
        `## ${laneName}\n\n${cardLine}\n\n***\n\n## Archive`
      );
    }

    return boardContent;
  }

  buildCardLineRegex(basename) {
    const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `^[ \\t]*-[ \\t]*(\\[[ xX]\\][ \\t]*)?\\[\\[${escaped}(\\|[^\\]]*)?\\]\\].*$`,
      "m"
    );
  }
};