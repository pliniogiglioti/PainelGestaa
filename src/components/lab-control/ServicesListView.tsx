import { useMemo } from 'react'
import * as XLSX from 'xlsx'
import type { Lab, LabEnvio, LabKanbanColuna, LabPreco } from '../../lib/types'
import styles from '../../pages/LabControlPage.module.css'
import { formatDate, getEnvioEtapas, getEtapaDataPrevista, getLabFeriados, isFinalEnvioStatus, today } from './utils'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function ServicesListView({ envios, precosByLab, labs, colunas, onMoveEnvio }: {
  envios: LabEnvio[]
  precosByLab: Record<string, LabPreco[]>
  labs: Lab[]
  colunas: LabKanbanColuna[]
  onMoveEnvio: (envioId: string, status: string) => void
}) {
  const labsById = useMemo(() => Object.fromEntries(labs.map(lab => [lab.id, lab])), [labs])
  const colunasOrdenadas = useMemo(() => [...colunas].sort((a, b) => a.ordem - b.ordem), [colunas])
  const rows = useMemo(() => envios.flatMap(envio => {
    const lab = labsById[envio.lab_id]
    const feriados = lab ? getLabFeriados(lab) : []

    return getEnvioEtapas(envio).map(etapa => {
      const dataPrevista = getEtapaDataPrevista(envio, etapa, feriados, precosByLab)

      return {
        id: `${envio.id}-${etapa.id}`,
        envioId: envio.id,
        pacienteNome: envio.paciente_nome,
        servicoNome: etapa.nome,
        dentes: envio.dentes,
        cor: envio.cor,
        dataEnvio: envio.data_envio,
        dataPrevista,
        status: etapa.concluido ? 'Pronto' : envio.status,
        etapaConcluida: etapa.concluido,
        urgente: envio.urgente,
        atrasado: !etapa.concluido && dataPrevista != null && dataPrevista < today(),
        labNome: lab?.nome ?? 'Laboratório removido',
      }
    })
  }), [envios, labsById, precosByLab])

  const handleExportPdf = () => {
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) return

    const generatedAt = new Date().toLocaleString('pt-BR')
    const tableRows = rows.map(row => `
      <tr class="${row.atrasado ? 'overdue' : ''}">
        <td>
          <strong>${escapeHtml(row.pacienteNome)}</strong>
          ${row.urgente ? '<span class="badge">Urgente</span>' : ''}
        </td>
        <td>${escapeHtml(row.servicoNome)}</td>
        <td>${escapeHtml(row.dentes || '-')}</td>
        <td>${escapeHtml(row.cor || '-')}</td>
        <td>${escapeHtml(formatDate(row.dataEnvio))}</td>
        <td>${escapeHtml(formatDate(row.dataPrevista))}</td>
        <td>${escapeHtml(row.atrasado ? 'Atrasado' : row.status)}</td>
        <td>${escapeHtml(row.labNome)}</td>
      </tr>
    `).join('')

    reportWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Lista de serviços</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 28px;
              color: #111827;
              background: #ffffff;
              font-family: Inter, Arial, sans-serif;
              font-size: 12px;
            }
            header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 24px;
              margin-bottom: 22px;
              padding-bottom: 16px;
              border-bottom: 2px solid #c9a22a;
            }
            h1 {
              margin: 0 0 6px;
              font-size: 22px;
              line-height: 1.2;
              color: #111827;
            }
            .subtitle {
              color: #6b7280;
              font-size: 12px;
            }
            .meta {
              min-width: 180px;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 10px 12px;
              color: #374151;
              text-align: right;
            }
            .meta strong {
              display: block;
              color: #111827;
              font-size: 18px;
              margin-bottom: 4px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }
            th {
              background: #2f2815;
              color: #f4d06f;
              padding: 10px 8px;
              text-align: left;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }
            td {
              padding: 10px 8px;
              border-bottom: 1px solid #e5e7eb;
              vertical-align: top;
              word-break: break-word;
            }
            tr:nth-child(even) td { background: #fafafa; }
            tr.overdue td {
              background: #fff1f2;
              color: #991b1b;
            }
            .badge {
              display: inline-block;
              margin-top: 4px;
              padding: 2px 6px;
              border-radius: 999px;
              background: #fee2e2;
              color: #991b1b;
              font-size: 10px;
              font-weight: 700;
            }
            .empty {
              padding: 24px;
              border: 1px dashed #d1d5db;
              border-radius: 8px;
              color: #6b7280;
              text-align: center;
            }
            @page { size: A4 landscape; margin: 12mm; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body onload="setTimeout(function(){ window.focus(); window.print(); }, 250)">
          <header>
            <div>
              <h1>Lista de serviços</h1>
              <div class="subtitle">Relatório exportado do Lab Control</div>
            </div>
            <div class="meta">
              <strong>${rows.length}</strong>
              serviço${rows.length === 1 ? '' : 's'}<br />
              Gerado em ${escapeHtml(generatedAt)}
            </div>
          </header>
          ${rows.length === 0 ? '<div class="empty">Nenhum serviço cadastrado nos envios.</div>' : `
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Serviço</th>
                  <th>Dentes</th>
                  <th>Cor</th>
                  <th>Data de envio</th>
                  <th>Prazo</th>
                  <th>Status</th>
                  <th>Laboratório</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          `}
        </body>
      </html>
    `)
    reportWindow.document.close()
  }

  return (
    <div className={styles.serviceListWrap}>
      <div className={styles.serviceListHeader}>
        <div>
          <strong>Lista de serviços</strong>
          <span>{rows.length} serviço{rows.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
                Paciente: r.pacienteNome,
                Serviço: r.servicoNome,
                Dentes: r.dentes ?? '',
                Cor: r.cor ?? '',
                'Data Envio': r.dataEnvio,
                Prazo: r.dataPrevista ?? '',
                Status: r.status,
                Laboratório: r.labNome,
                Urgente: r.urgente ? 'Sim' : 'Não',
              })))
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, ws, 'Serviços')
              XLSX.writeFile(wb, 'servicos.xlsx')
            }}
          >
            Exportar Excel
          </button>
          <button type="button" className={styles.btnSecondary} onClick={handleExportPdf}>
            Exportar PDF
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.serviceListEmpty}>Nenhum serviço cadastrado nos envios.</div>
      ) : (
        <div className={styles.serviceTableScroller}>
          <table className={styles.serviceTable}>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Serviço</th>
                <th>Dentes</th>
                <th>Cor</th>
                <th>Data de envio</th>
                <th>Prazo</th>
                <th>Status</th>
                <th>Laboratório</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className={row.atrasado ? styles.serviceTableRowOverdue : ''}>
                  <td>
                    <div className={styles.servicePatientCell}>
                      <strong>{row.pacienteNome}</strong>
                      {row.urgente && <span>Urgente</span>}
                    </div>
                  </td>
                  <td>{row.servicoNome}</td>
                  <td>{row.dentes || '—'}</td>
                  <td>{row.cor || '—'}</td>
                  <td>{formatDate(row.dataEnvio)}</td>
                  <td>{formatDate(row.dataPrevista)}</td>
                  <td>
                    {row.etapaConcluida || isFinalEnvioStatus(row.status) ? (
                      <span className={row.atrasado ? styles.serviceStatusOverdue : styles.serviceStatus}>
                        {row.atrasado ? 'Atrasado' : row.status}
                      </span>
                    ) : (
                      <select
                        className={styles.serviceStatusSelect}
                        value={row.status}
                        onChange={e => onMoveEnvio(row.envioId, e.target.value)}
                      >
                        {colunasOrdenadas.map(col => (
                          <option key={col.id} value={col.nome}>{col.nome}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{row.labNome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
