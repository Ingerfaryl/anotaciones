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

module.exports = class TicketFlowAutomator extends Plugin {
  async onload() {
    // Carpeta donde viven tus notas de ticket. Ajusta si tu ruta es distinta.
    this.ticketFolder = "Tickets";
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
    });

    this.registerEvent(
      this.app.metadataCache.on("changed", (file, data, cache) => {
        this.handleChange(file, cache);
      })
    );
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
};
