# 📊 Mesa de Ayuda 

---

## 🆕 Nuevos

```dataview
TABLE
titulo as Titulo,
prioridad as Prioridad,
usuario as Usuario
FROM "Tickets"
WHERE estado = "Nuevo"
SORT file.ctime DESC
```
## ⚙️ En Proceso

```dataview
TABLE
Ticket,
Titulo,
prioridad,
usuario
FROM "Tickets"
WHERE estado = "En Proceso"
SORT file.ctime DESC
```
## 🚀 Escalados

```dataview
TABLE
Ticket,
Titulo,
prioridad,
usuario
FROM "Tickets"
WHERE estado = "Escalado"
SORT file.ctime DESC
```
## ✅ Finalizados

```dataview
TABLE
Ticket,
Titulo,
prioridad,
usuario
FROM "Tickets"
WHERE estado = "Finalizado"
SORT file.ctime DESC
```
## ❌ Cancelados

```dataview
TABLE
Ticket,
Titulo,
prioridad,
usuario
FROM "Tickets"
WHERE estado = "Cancelado"
SORT file.ctime DESC
```
## 📈 Indicadores

### Total de tickets

```dataview
TABLE WITHOUT ID
length(rows) AS "Cantidad"
FROM "Tickets"
GROUP BY ""
```
### Tickets por Estado

```dataview
TABLE WITHOUT ID
rows.estado AS Estado,
length(rows) AS Cantidad
FROM "Tickets"
GROUP BY estado
SORT estado
```
### Tickets por Prioridad

```dataview
TABLE WITHOUT ID
rows.prioridad AS Prioridad,
length(rows) AS Cantidad
FROM "Tickets"
GROUP BY prioridad
SORT prioridad
```
