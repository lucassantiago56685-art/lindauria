import { jsPDF } from 'jspdf';
import { FEELINGS, MOODS, REMINDER_KINDS, moodLabel, type Report, painAreaLabel } from './care-logic';

/* =============================================================================================
   Relatório em PDF (dia, semana ou mês): como a pessoa se sentiu, dor, frases mais faladas,
   emergências e lembretes. Gerado NO APARELHO (nada é enviado a servidor).
   ============================================================================================= */

/** a fonte padrão do PDF não tem emojis: removemos (acentos continuam) */
const clean = (s: string) =>
  s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const fmtDate = (t: number) => new Date(t).toLocaleDateString('pt-BR');
const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const C = {
  ink: [10, 16, 48] as const,
  soft: [70, 80, 110] as const,
  brand: [8, 145, 178] as const,
  violet: [124, 58, 237] as const,
  good: [22, 163, 74] as const,
  warn: [217, 119, 6] as const,
  bad: [225, 29, 72] as const,
  line: [220, 225, 240] as const,
};

export function reportPdf(r: Report, patientName: string): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 16;
  let y = 0;

  const color = (c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: readonly number[]) => doc.setFillColor(c[0], c[1], c[2]);
  const ensure = (h: number) => {
    if (y + h > 280) {
      doc.addPage();
      y = 18;
    }
  };
  const text = (s: string, x: number, size = 10, style: 'normal' | 'bold' = 'normal', c: readonly number[] = C.ink, maxW = W - 2 * M) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    color(c);
    const lines = doc.splitTextToSize(clean(s), maxW) as string[];
    ensure(lines.length * size * 0.42 + 1);
    doc.text(lines, x, y);
    y += lines.length * size * 0.42 + 1.5;
  };
  const section = (title: string) => {
    y += 4;
    ensure(14);
    fill(C.brand);
    doc.rect(M, y - 4.2, 2.2, 6, 'F');
    text(title, M + 5, 13, 'bold', C.ink);
    doc.setDrawColor(C.line[0], C.line[1], C.line[2]);
    doc.line(M, y - 0.5, W - M, y - 0.5);
    y += 2.5;
  };

  // ---- capa / cabeçalho ----
  fill(C.ink);
  doc.rect(0, 0, W, 34, 'F');
  fill(C.brand);
  doc.rect(0, 34, W, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('LindaurIA', M, 15);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatório de bem-estar', M, 23);
  doc.setFontSize(9);
  doc.text(`Gerado em ${fmtDateTime(Date.now())}`, W - M, 15, { align: 'right' });
  y = 46;
  const name = clean(patientName);
  text(!name || name === 'o paciente' ? 'Paciente' : name, M, 16, 'bold');
  text(r.label, M, 11, 'normal', C.soft);

  // ---- resumo em cartões ----
  y += 3;
  const cards = [
    { k: 'Registros', v: String(r.checkins) },
    { k: 'Humor médio', v: r.moodAvg === null ? '-' : `${r.moodAvg.toFixed(1).replace('.', ',')} / 5` },
    { k: 'Dor média', v: r.painAvg === null ? '-' : `${r.painAvg.toFixed(1).replace('.', ',')} / 10` },
    { k: 'Emergências', v: String(r.alerts.length) },
  ];
  const cw = (W - 2 * M - 9) / 4;
  ensure(22);
  cards.forEach((c, i) => {
    const x = M + i * (cw + 3);
    doc.setDrawColor(C.line[0], C.line[1], C.line[2]);
    doc.setFillColor(246, 248, 255);
    doc.roundedRect(x, y, cw, 19, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    color(C.ink);
    doc.text(c.v, x + cw / 2, y + 9, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    color(C.soft);
    doc.text(c.k, x + cw / 2, y + 15, { align: 'center' });
  });
  y += 25;
  text(`Em geral: ${moodLabel(r.moodAvg)}.`, M, 11, 'bold', C.violet);

  // ---- humor por dia (gráfico de barras) ----
  section('Como se sentiu (humor por dia)');
  if (!r.moodByDay.length) text('Nenhum registro de humor neste período.', M, 10, 'normal', C.soft);
  else {
    const rowH = 6.5;
    for (const d of r.moodByDay) {
      ensure(rowH + 1);
      const [yy, mm, dd] = d.day.split('-');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      color(C.ink);
      doc.text(`${dd}/${mm}/${yy}`, M, y + 4);
      const max = W - 2 * M - 60;
      const w = (d.avg / 5) * max;
      const c = d.avg >= 4 ? C.good : d.avg >= 3 ? C.warn : C.bad;
      fill(C.line);
      doc.roundedRect(M + 24, y, max, 5, 1.5, 1.5, 'F');
      fill(c);
      doc.roundedRect(M + 24, y, Math.max(2, w), 5, 1.5, 1.5, 'F');
      color(C.soft);
      doc.text(`${d.avg.toFixed(1).replace('.', ',')} (${d.count} reg.)`, M + 28 + max, y + 4);
      y += rowH;
    }
    y += 4; // respiro depois do gráfico
    text(`Escala: 1 = ${MOODS[4].label}, 5 = ${MOODS[0].label}.`, M, 8.5, 'normal', C.soft);
  }

  // ---- sentimentos ----
  section('O que sentiu');
  if (!r.feelingCounts.length) text('Nenhum sentimento registrado.', M, 10, 'normal', C.soft);
  else {
    const top = r.feelingCounts[0].count;
    for (const f of r.feelingCounts) {
      ensure(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      color(C.ink);
      doc.text(f.label, M, y + 4);
      const max = W - 2 * M - 60;
      fill(C.violet);
      doc.roundedRect(M + 34, y, Math.max(2, (f.count / top) * max), 5, 1.5, 1.5, 'F');
      color(C.soft);
      doc.text(`${f.count}x`, M + 37 + max, y + 4);
      y += 6.5;
    }
    y += 4; // respiro depois do gráfico
  }
  if (r.painMax !== null) text(`Dor: média ${r.painAvg!.toFixed(1).replace('.', ',')} e máxima ${r.painMax} (escala 0 a 10).`, M, 10, 'bold', C.bad);
  if (r.painAreas.length) {
    section('Mapa de dor (onde doeu)');
    for (const a of r.painAreas) text(`${a.label}: ${a.count} registro(s), dor máxima ${a.max}/10`, M + 2, 10, a.max >= 7 ? 'bold' : 'normal', a.max >= 7 ? C.bad : C.ink);
  }

  // ---- frases ----
  section('O que mais falou');
  text(`${r.phrasesTotal} frase(s) falada(s) no período.`, M, 10, 'normal', C.soft);
  r.topPhrases.forEach((p, i) => text(`${i + 1}. "${p.text}" (${p.count}x)`, M + 2, 10));

  // ---- emergências ----
  section('Emergências');
  if (!r.alerts.length) text('Nenhuma emergência no período.', M, 10, 'normal', C.good);
  for (const a of r.alerts) {
    text(
      `${fmtDateTime(a.at)} - ${a.kind === 'geral' ? 'pedido de ajuda' : a.kind.replace(/-/g, ' ')}${a.accidental ? ' (cancelado: foi sem querer)' : a.cancelledAt ? ` (desligado às ${new Date(a.cancelledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})` : ''}`,
      M + 2,
      10,
    );
  }

  // ---- lembretes ----
  section('Lembretes (remédios, comida e outros)');
  const rm = r.reminders;
  if (!rm.total) text('Nenhum lembrete no período.', M, 10, 'normal', C.soft);
  else {
    text(`${rm.done} feito(s), ${rm.missed} perdido(s), ${rm.pending} pendente(s), de ${rm.total}.`, M, 10, 'bold');
    for (const l of rm.logs.slice(-60)) {
      const k = REMINDER_KINDS.find((x) => x.id === l.kind)?.label ?? '';
      const st = l.status === 'feito' ? 'feito' : l.status === 'perdido' ? 'PERDIDO' : l.status;
      text(`${fmtDateTime(l.scheduledAt)} - ${k}: ${l.title} - ${st}`, M + 2, 9.5, 'normal', l.status === 'perdido' ? C.bad : C.ink);
    }
  }

  // ---- registros detalhados ----
  section('Registros detalhados');
  if (!r.entries.length) text('Sem registros.', M, 10, 'normal', C.soft);
  for (const e of r.entries) {
    const m = MOODS.find((x) => x.value === e.mood)?.label ?? 'Mapa de dor';
    const areas = (e.painAreas ?? []).map((a) => `${painAreaLabel(a.area)} ${a.level}/10${a.types.length ? ` (${a.types.join(', ')})` : ''}`).join('; ');
    const fs = e.feelings.map((id) => FEELINGS.find((f) => f.id === id)?.label ?? id).join(', ');
    text(`${fmtDateTime(e.at)} - ${m}${fs ? ` - sentiu: ${fs}` : ''}${e.pain !== null ? ` - dor ${e.pain}/10` : ''}${areas ? ` - onde: ${areas}` : ''}${e.note ? ` - "${e.note}"` : ''}`, M + 2, 9.5);
  }

  // ---- rodapé em todas as páginas ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    color(C.soft);
    doc.text('LindaurIA - informações registradas pelo paciente e família. Não substitui avaliação médica.', M, 290);
    doc.text(`${i}/${pages}`, W - M, 290, { align: 'right' });
  }
  return doc.output('blob');
}

export const reportFileName = (r: Report) => `LindaurIA-relatorio-${fmtDate(r.from).replace(/\//g, '-')}-a-${fmtDate(r.to).replace(/\//g, '-')}.pdf`;
