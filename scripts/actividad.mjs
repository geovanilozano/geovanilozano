// Genera el bloque de actividad del README a partir de la API de GitHub.
// Se ejecuta desde .github/workflows/actividad.yml, a diario.
//
// Nota: las contribuciones a repositorios privados solo aparecen si el ajuste
// "Include private contributions on my profile" esta activado en el perfil.
// Sin el, la API devuelve unicamente la actividad publica.

import { readFileSync, writeFileSync } from "node:fs";

const LOGIN = process.env.LOGIN ?? "geovanilozano";
const TOKEN = process.env.GH_TOKEN;
const INICIO = "<!-- ACTIVIDAD:INICIO -->";
const FIN = "<!-- ACTIVIDAD:FIN -->";

const QUERY = `
query($login:String!){
  user(login:$login){
    contributionsCollection{
      totalCommitContributions
      totalPullRequestContributions
      totalRepositoriesWithContributedCommits
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount weekday } }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "actividad-perfil",
  },
  body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
});
if (!res.ok) throw new Error(`GitHub respondio ${res.status}: ${await res.text()}`);
const json = await res.json();
if (json.errors) throw new Error(JSON.stringify(json.errors));

const c = json.data.user.contributionsCollection;
const dias = c.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .sort((a, b) => a.date.localeCompare(b.date));

const hoy = new Date().toISOString().slice(0, 10);
const pasados = dias.filter((d) => d.date <= hoy);
const activos = pasados.filter((d) => d.contributionCount > 0);

// Racha actual: dias seguidos con actividad hasta hoy. Un dia de hoy todavia
// sin commits no rompe la racha, porque el dia no ha terminado.
let racha = 0;
for (let i = pasados.length - 1; i >= 0; i--) {
  const d = pasados[i];
  if (d.contributionCount > 0) racha++;
  else if (d.date === hoy) continue;
  else break;
}

let mejor = 0, corrida = 0;
for (const d of pasados) {
  corrida = d.contributionCount > 0 ? corrida + 1 : 0;
  if (corrida > mejor) mejor = corrida;
}

const total = c.contributionCalendar.totalContributions;
const media = activos.length ? total / activos.length : 0;

const NOMBRES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const porDia = new Array(7).fill(0);
for (const d of pasados) porDia[d.weekday] += d.contributionCount;
const diaFuerte = NOMBRES[porDia.indexOf(Math.max(...porDia))];

// Minigrafico de las ultimas 30 semanas, una barra por semana.
const semanas = c.contributionCalendar.weeks.slice(-30);
const sumas = semanas.map((w) => w.contributionDays.reduce((a, d) => a + d.contributionCount, 0));
const tope = Math.max(...sumas, 1);
const BLOQUES = "▁▂▃▄▅▆▇█";
const grafico = sumas
  .map((v) => (v === 0 ? "▁" : BLOQUES[Math.min(7, Math.ceil((v / tope) * 7))]))
  .join("");

const n = (v, dec = 0) =>
  v.toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// Se dibuja como bloque monoespaciado y no como tabla: una tabla de dos
// columnas sin cabecera hace que GitHub pinte una banda gris vacia arriba.
const fila = (etiqueta, valor) => `${etiqueta.padEnd(28)}${String(valor).padStart(9)}`;

const bloque = `${INICIO}
\`\`\`
${fila("Contribuciones en 12 meses", n(total))}
${fila("Días con actividad", `${n(activos.length)} / ${n(pasados.length)}`)}
${fila("Media por día activo", n(media, 1))}
${fila("Racha actual", `${n(racha)} días`)}
${fila("Racha más larga", `${n(mejor)} días`)}
${fila("Día más productivo", diaFuerte)}

${grafico}
\`\`\`
<sub>Últimas 30 semanas, una barra por semana · se actualiza solo · ${hoy}</sub>
${FIN}`;

const ruta = "README.md";
const readme = readFileSync(ruta, "utf8");
const i = readme.indexOf(INICIO);
const j = readme.indexOf(FIN);
if (i === -1 || j === -1) throw new Error("No encuentro los marcadores ACTIVIDAD en README.md");

const nuevo = readme.slice(0, i) + bloque + readme.slice(j + FIN.length);
if (nuevo === readme) {
  console.log("Sin cambios.");
} else {
  writeFileSync(ruta, nuevo);
  console.log(`Actualizado: ${total} contribuciones, racha ${racha}, ${activos.length} días activos.`);
}
