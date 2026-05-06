import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Empresa, Lab, LabKanbanColuna } from '../lib/types'
import ModalTransition from '../components/ModalTransition'
import styles from './LabControlPage.module.css'
import {
  DEFAULT_COLUNAS,
  IconBack,
  LabDetailView,
  LabModal,
  LabPickerModal,
  LabsAggregateDetailView,
  PrecosModal,
  Spinner,
  type LabHomeMode,
  type LabViewSelection,
} from '../components/lab-control/LabControlComponents'

export default function LabControlPage({ userId, empresa, onTrocarEmpresa, onVoltar }: {
  userId: string; empresa: Empresa; onTrocarEmpresa: () => void; onVoltar: () => void
}) {
  const [isAdmin,      setIsAdmin]      = useState(false)
  const [labs,         setLabs]         = useState<Lab[]>([])
  const [colunas,      setColunas]      = useState<LabKanbanColuna[]>([])
  const [selectedView, setSelectedView] = useState<LabViewSelection | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [showLabModal, setShowLabModal] = useState(false)
  const [editingLab,   setEditingLab]   = useState<Lab | null>(null)
  const [showHomePrecos, setShowHomePrecos] = useState(false)
  const [showEditLabPicker, setShowEditLabPicker] = useState(false)
  const [showPrecosPicker, setShowPrecosPicker] = useState(false)
  const [homeMode, setHomeMode] = useState<LabHomeMode>('kanban')

  useEffect(() => {
    const validarAcesso = async () => {
      // Verifica se a empresa ainda existe
      const { data: empresaExiste } = await supabase
        .from('empresas')
        .select('id')
        .eq('id', empresa.id)
        .eq('ativo', true)
        .maybeSingle()

      if (!empresaExiste) {
        onTrocarEmpresa()
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      const adminSistema = profile?.role === 'admin'

      if (!adminSistema) {
        const { data: membro } = await supabase
          .from('empresa_membros')
          .select('role')
          .eq('empresa_id', empresa.id)
          .eq('user_id', userId)
          .maybeSingle()

        if (!membro) {
          onTrocarEmpresa()
          return
        }

        setIsAdmin(membro.role === 'admin')
        return
      }

      setIsAdmin(true)
    }

    void validarAcesso()
  }, [empresa.id, onTrocarEmpresa, userId])

  const fetchLabs = useCallback(async () => {
    const { data } = await supabase
      .from('labs').select('*')
      .eq('empresa_id', empresa.id).eq('ativo', true).order('nome')
    if (data) {
      setLabs(data)
      setSelectedView(prev => {
        if (!prev) return prev
        if (prev.kind !== 'lab') return null
        const updatedLab = data.find(item => item.id === prev.lab.id)
        return updatedLab ? { kind: 'lab', lab: updatedLab } : null
      })
    }
  }, [empresa.id])

  const fetchColunas = useCallback(async () => {
    const { data } = await supabase
      .from('lab_kanban_colunas').select('*')
      .eq('empresa_id', empresa.id).order('ordem')

    if (data && data.length > 0) {
      setColunas(data)
    } else {
      // Cria colunas padrão para a empresa
      const defaults = DEFAULT_COLUNAS.map(c => ({ ...c, empresa_id: empresa.id }))
      const { data: inserted } = await supabase.from('lab_kanban_colunas').insert(defaults).select()
      if (inserted) setColunas(inserted)
    }
  }, [empresa.id])

  useEffect(() => {
    setLabs([])
    setColunas([])
    setLoading(true)
    Promise.all([fetchLabs(), fetchColunas()]).then(() => setLoading(false))
  }, [fetchLabs, fetchColunas])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <button type="button" className={styles.backBtn} onClick={onVoltar}><IconBack /> Voltar</button>
          <h1 className={styles.pageTitle}>Controle de Laboratórios</h1>
        </div>
        <Spinner />
      </div>
    )
  }

  // Detalhe do lab selecionado
  if (selectedView?.kind === 'lab') {
    return (
      <LabDetailView
        lab={selectedView.lab}
        empresaId={empresa.id}
        userId={userId}
        isAdmin={isAdmin}
        colunas={colunas}
        onBack={() => setSelectedView(null)}
        onLabUpdated={() => { fetchLabs() }}
        onColunasUpdated={fetchColunas}
      />
    )
  }

  // Lista de labs
  return (
    <>
      <LabsAggregateDetailView
        labs={labs}
        empresaId={empresa.id}
        empresaNome={empresa.nome}
        userId={userId}
        isAdmin={isAdmin}
        colunas={colunas}
        onBack={onVoltar}
        onTrocarEmpresa={onTrocarEmpresa}
        onColunasUpdated={fetchColunas}
        homeMode={homeMode}
        onHomeModeChange={setHomeMode}
        onCreateLab={() => { setEditingLab(null); setShowLabModal(true) }}
        onOpenEditLabPicker={() => setShowEditLabPicker(true)}
        onOpenPrecosPicker={() => setShowPrecosPicker(true)}
      />

      {showLabModal && (
        <LabModal
          lab={editingLab}
          empresaId={empresa.id}
          onClose={() => setShowLabModal(false)}
          onSaved={() => { void Promise.all([fetchLabs(), fetchColunas()]) }}
        />
      )}
      <ModalTransition open={showEditLabPicker && labs.length > 0}>
        {showEditLabPicker && labs.length > 0 && (
          <LabPickerModal
            title="Selecionar laboratório para editar"
            labs={labs}
            onClose={() => setShowEditLabPicker(false)}
            onSelect={lab => {
              setEditingLab(lab)
              setShowLabModal(true)
            }}
          />
        )}
      </ModalTransition>
      <ModalTransition open={showPrecosPicker && labs.length > 0}>
        {showPrecosPicker && labs.length > 0 && (
          <LabPickerModal
            title="Selecionar laboratório para lista de preços"
            labs={labs}
            onClose={() => setShowPrecosPicker(false)}
            onSelect={lab => {
              setEditingLab(lab)
              setShowHomePrecos(true)
            }}
          />
        )}
      </ModalTransition>
      <ModalTransition open={showHomePrecos && !!editingLab}>
        {showHomePrecos && editingLab && (
          <PrecosModal
            lab={editingLab}
            onClose={() => setShowHomePrecos(false)}
            onSaved={() => { void fetchLabs() }}
          />
        )}
      </ModalTransition>
    </>
  )
}
