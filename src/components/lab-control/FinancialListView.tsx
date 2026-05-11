import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import type { Lab, LabEnvio } from '../../lib/types'
import styles from '../../pages/LabControlPage.module.css'
import { formatDate } from './utils'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const LAB_FILTER_ALL = '__all__'

export function FinancialListView({ envios, labs }: {
  envios: LabEnvio[]
  labs: Lab[]
}) {
  const [labFilterId, setLabFilterId] = useState(LAB_FILTER_ALL)
  const [monthFilter, setMonthFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const labsById = useMemo(() => Object.fromEntries(labs.map(lab => [lab.id, lab])), [labs])
  const paidRows = useMemo(() => envios
    .filter(envio => envio.pago)
    .map(envio => {
      const valorBruto = envio.preco_servico ?? 0
      const desconto = envio.desconto ?? 0
      const valorPago = Math.max(valorBruto - desconto, 0)

      return {
        id: envio.id,
        labId: envio.lab_id,
        pacienteNome: envio.paciente_nome,
        dentistaNome: envio.dentista_nome ?? '-',
        trabalho: envio.tipo_trabalho,
        labNome: labsById[envio.lab_id]?.nome ?? 'Laboratório removido',
        dataEnvio: envio.data_envio,
        dataPagamento: envio.data_pagamento,
        valorBruto,
        desconto,
        valorPago,
        observacao: envio.observacao_financeira ?? '',
      }
    })
    .sort((a, b) => {
      const dataA = a.dataPagamento ?? a.dataEnvio
      const dataB = b.dataPagamento ?? b.dataEnvio
      return dataB.localeCompare(dataA)
    }), [envios, labsById])
  const rows = useMemo(() => paidRows.filter(row => {
    const dataPagamento = row.dataPagamento ?? ''

    if (labFilterId !== LAB_FILTER_ALL && row.labId !== labFilterId) return false
    if (monthFilter && !dataPagamento.startsWith(monthFilter)) return false
    if (startDate && (!dataPagamento || dataPagamento < startDate)) return false
    if (endDate && (!dataPagamento || dataPagamento > endDate)) return false

    return true
  }), [endDate, labFilterId, monthFilter, paidRows, startDate])

  const totalBruto = rows.reduce((total, row) => total + row.valorBruto, 0)
  const totalDesconto = rows.reduce((total, row) => total + row.desconto, 0)
  const totalPago = rows.reduce((total, row) => total + row.valorPago, 0)
  const hasFilters = labFilterId !== LAB_FILTER_ALL || monthFilter || startDate || endDate

  const handleExportPdf = () => {
    const reportWindow = window.open('', '_blank')
    if (!reportWindow) return

    const generatedAt = new Date().toLocaleString('pt-BR')
    const tableRows = rows.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.pacienteNome)}</strong></td>
        <td>${escapeHtml(row.trabalho)}</td>
        <td>${escapeHtml(row.dentistaNome)}</td>
        <td>${escapeHtml(row.labNome)}</td>
        <td>${escapeHtml(formatDate(row.dataEnvio))}</td>
        <td>${escapeHtml(formatDate(row.dataPagamento))}</td>
        <td>${escapeHtml(formatCurrency(row.valorBruto))}</td>
        <td>${escapeHtml(formatCurrency(row.desconto))}</td>
        <td><strong>${escapeHtml(formatCurrency(row.valorPago))}</strong></td>
        <td>${escapeHtml(row.observacao || '-')}</td>
      </tr>
    `).join('')

    reportWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Pagamentos dos trabalhos</title>
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
              min-width: 220px;
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
            .summary {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 10px;
              margin-bottom: 16px;
            }
            .summary div {
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 10px;
              background: #fafafa;
            }
            .summary span {
              display: block;
              margin-bottom: 4px;
              color: #6b7280;
              font-size: 10px;
              text-transform: uppercase;
            }
            .summary strong {
              font-size: 15px;
              color: #111827;
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
              <h1>Pagamentos dos trabalhos</h1>
              <div class="subtitle">Trabalhos enviados e pagos aos laboratórios no Lab Control</div>
            </div>
            <div class="meta">
              <strong>${rows.length}</strong>
              pagamento${rows.length === 1 ? '' : 's'}<br />
              Gerado em ${escapeHtml(generatedAt)}
            </div>
          </header>
          <div class="summary">
            <div><span>Valor dos trabalhos</span><strong>${escapeHtml(formatCurrency(totalBruto))}</strong></div>
            <div><span>Descontos</span><strong>${escapeHtml(formatCurrency(totalDesconto))}</strong></div>
            <div><span>Total pago</span><strong>${escapeHtml(formatCurrency(totalPago))}</strong></div>
          </div>
          ${rows.length === 0 ? '<div class="empty">Nenhum pagamento registrado nos trabalhos filtrados.</div>' : `
            <table>
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>Trabalho</th>
                  <th>Dentista</th>
                  <th>Laboratório</th>
                  <th>Data envio</th>
                  <th>Pagamento</th>
                  <th>Valor</th>
                  <th>Desconto</th>
                  <th>Pago</th>
                  <th>Observação</th>
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
          <strong>Pagamentos dos trabalhos</strong>
          <span>{rows.length} pagamento{rows.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              const ws = XLSX.utils.json_to_sheet(rows.map(row => ({
                Paciente: row.pacienteNome,
                Trabalho: row.trabalho,
                Dentista: row.dentistaNome,
                Laboratório: row.labNome,
                'Data Envio': row.dataEnvio,
                Pagamento: row.dataPagamento ?? '',
                Valor: row.valorBruto,
                Desconto: row.desconto,
                Pago: row.valorPago,
                Observação: row.observacao,
              })))
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, ws, 'Financeiro')
              XLSX.writeFile(wb, 'pagamentos-laboratorios.xlsx')
            }}
          >
            Exportar Excel
          </button>
          <button type="button" className={styles.btnSecondary} onClick={handleExportPdf}>
            Exportar PDF
          </button>
        </div>
      </div>

      <div className={styles.financialFilters}>
        <div className={styles.formField}>
          <label className={styles.label}>Laboratório</label>
          <select
            className={styles.select}
            value={labFilterId}
            onChange={e => setLabFilterId(e.target.value)}
          >
            <option value={LAB_FILTER_ALL}>Todos os laboratórios</option>
            {labs.map(lab => (
              <option key={lab.id} value={lab.id}>{lab.nome}</option>
            ))}
          </select>
        </div>
        <div className={styles.formField}>
          <label className={styles.label}>Mês de pagamento</label>
          <input
            className={styles.input}
            type="month"
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.label}>Data inicial</label>
          <input
            className={styles.input}
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.label}>Data final</label>
          <input
            className={styles.input}
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.label}>Ações</label>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={!hasFilters}
            onClick={() => {
              setLabFilterId(LAB_FILTER_ALL)
              setMonthFilter('')
              setStartDate('')
              setEndDate('')
            }}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      <div className={styles.financialSummary}>
        <div className={styles.financialCard}>
          <span>Valor dos trabalhos</span>
          <strong>{formatCurrency(totalBruto)}</strong>
        </div>
        <div className={styles.financialCard}>
          <span>Descontos</span>
          <strong>{formatCurrency(totalDesconto)}</strong>
        </div>
        <div className={styles.financialCard}>
          <span>Total pago</span>
          <strong>{formatCurrency(totalPago)}</strong>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.serviceListEmpty}>Nenhum pagamento registrado nos trabalhos filtrados.</div>
      ) : (
        <div className={styles.serviceTableScroller}>
          <table className={`${styles.serviceTable} ${styles.financialTable}`}>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Trabalho</th>
                <th>Dentista</th>
                <th>Laboratório</th>
                <th>Data envio</th>
                <th>Pagamento</th>
                <th>Valor</th>
                <th>Desconto</th>
                <th>Pago</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td>
                    <div className={styles.servicePatientCell}>
                      <strong>{row.pacienteNome}</strong>
                    </div>
                  </td>
                  <td>{row.trabalho}</td>
                  <td>{row.dentistaNome}</td>
                  <td>{row.labNome}</td>
                  <td>{formatDate(row.dataEnvio)}</td>
                  <td>{formatDate(row.dataPagamento)}</td>
                  <td>{formatCurrency(row.valorBruto)}</td>
                  <td>{formatCurrency(row.desconto)}</td>
                  <td>{formatCurrency(row.valorPago)}</td>
                  <td>{row.observacao || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
